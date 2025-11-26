const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Load Dictionary
const dictionary = fs.readFileSync(path.join(__dirname, 'dictionary.txt'), 'utf-8')
    .split('\n')
    .map(w => w.trim())
    .filter(w => w.length > 0);

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, '../public')));

const rooms = {};

// Helper: Shuffle Array
function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

// Helper: Get Random Words
function getRandomWords(count) {
    const words = [];
    for (let i = 0; i < count; i++) {
        let word = dictionary[Math.floor(Math.random() * dictionary.length)];
        // Replace special characters like œ
        word = word.replace(/œ/g, 'oe').replace(/Œ/g, 'OE');
        words.push(word);
    }
    return words;
}

// Helper: Generate Hint
function generateHint(word, revealedIndices) {
    let hint = '';
    for (let i = 0; i < word.length; i++) {
        if (word[i] === ' ' || word[i] === '-') {
            hint += word[i];
        } else if (revealedIndices.includes(i)) {
            hint += word[i];
        } else {
            hint += '_';
        }
        hint += ' '; // Add space for readability
    }
    return hint.trim();
}

// Helper: Count Public Rooms
function countPublicRooms() {
    return Object.values(rooms).filter(r => !r.isPrivate && r.gameState === 'LOBBY').length;
}

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    // Get Public Game Count
    socket.on('getPublicGameCount', () => {
        socket.emit('updatePublicGameCount', countPublicRooms());
    });

    // Join Random Room
    socket.on('joinRandomRoom', ({ username, isSpectator }) => {
        // Find a public room in LOBBY state with space
        const publicRooms = Object.entries(rooms).filter(([code, room]) => 
            !room.isPrivate && 
            room.gameState === 'LOBBY' && 
            room.users.length < 10 // Assuming max 10 players
        );
        
        if (publicRooms.length > 0) {
            const randomRoom = publicRooms[Math.floor(Math.random() * publicRooms.length)];
            const roomCode = randomRoom[0];
            socket.emit('randomRoomFound', roomCode);
        } else {
            socket.emit('error', 'Aucune partie publique disponible.');
        }
    });

    socket.on('joinRoom', ({ username, avatar, roomCode, isSpectator, isPrivate }) => {
        // Sanitize username
        if (username) {
            username = username.replace(/</g, "&lt;").replace(/>/g, "&gt;").trim().substring(0, 20);
        }
        
        socket.join(roomCode);
        
        if (!rooms[roomCode]) {
            if (isSpectator) {
                socket.emit('error', 'Les observateurs ne peuvent pas créer de partie.');
                socket.leave(roomCode);
                return;
            }

            rooms[roomCode] = {
                users: [],
                drawHistory: [],
                redoHistory: [],
                layers: [
                    { id: 'layer-1', name: 'Calque 1', order: 0 }
                ],
                leaderId: socket.id,
                gameState: 'LOBBY', // LOBBY, READY_CHECK, PLAYING, ENDED
                isPrivate: !!isPrivate,
                settings: {
                    mode: 'guess-word',
                    drawTime: 80,
                    wordChoiceTime: 20,
                    wordChoices: 3,
                    rounds: 3,
                    allowFuzzy: false
                },
                readyPlayers: [],
                readyCheckTimer: null,
                game: {
                    turnOrder: [],
                    currentDrawerIndex: 0,
                    currentRound: 1,
                    totalRounds: 3,
                    scores: {},
                    roundScores: {}, // Points gained in the current turn
                    currentWord: null,
                    revealedIndices: [],
                    timerInterval: null,
                    wordChoiceTimer: null,
                    timeLeft: 0,
                    guessedPlayers: [],
                    disconnectedPlayers: [],
                    roundEnded: false
                }
            };
            // Notify everyone about new public room count
            io.emit('updatePublicGameCount', countPublicRooms());
        }

        const room = rooms[roomCode];
        const user = { id: socket.id, username, avatar, score: 0, isSpectator: !!isSpectator };
        room.users.push(user);
        room.game.scores[socket.id] = 0;

        // Notify others in the room
        io.to(roomCode).emit('userJoined', { 
            users: room.users, 
            leaderId: room.leaderId 
        });
        
        // System message
        io.to(roomCode).emit('chatMessage', {
            username: 'System',
            message: `${username} a rejoint la partie !`
        });
        
        // Send current room state
        const roomState = { 
            roomCode, 
            users: room.users,
            drawHistory: room.drawHistory,
            layers: room.layers,
            leaderId: room.leaderId,
            settings: room.settings,
            gameState: room.gameState,
            isSpectator: !!isSpectator,
            isPrivate: room.isPrivate
        };

        if (room.gameState === 'PLAYING') {
            roomState.game = {
                scores: room.game.scores,
                currentRound: room.game.currentRound,
                totalRounds: room.game.totalRounds,
                currentDrawerIndex: room.game.currentDrawerIndex,
                turnOrder: room.game.turnOrder
            };
        }

        socket.emit('roomJoined', roomState);
    });

    socket.on('updateSettings', ({ roomCode, settings }) => {
        const room = rooms[roomCode];
        if (room && room.leaderId === socket.id) {
            room.settings = { ...room.settings, ...settings };
            io.to(roomCode).emit('roomSettingsUpdated', room.settings);
        }
    });

    socket.on('startGame', (roomCode) => {
        const room = rooms[roomCode];
        if (room && room.leaderId === socket.id) {
            // Filter out spectators
            const activePlayers = room.users.filter(u => !u.isSpectator);
            
            if (activePlayers.length < 2) {
                socket.emit('error', 'Il faut au moins 2 joueurs actifs pour commencer.');
                return;
            }

            // Start Ready Check
            room.gameState = 'READY_CHECK';
            room.readyPlayers = [];
            
            io.to(roomCode).emit('gameStateChanged', 'READY_CHECK');
            io.to(roomCode).emit('readyCheckStarted', {
                totalPlayers: activePlayers.length,
                timeout: 60,
                settings: room.settings,
                users: room.users
            });

            // Start 60s timer
            if (room.readyCheckTimer) clearTimeout(room.readyCheckTimer);
            
            room.readyCheckTimer = setTimeout(() => {
                if (room.gameState === 'READY_CHECK') {
                    // Cancel game
                    room.gameState = 'LOBBY';
                    io.to(roomCode).emit('gameCancelled', 'Tous les joueurs ne sont pas prêts.');
                    io.to(roomCode).emit('gameStateChanged', 'LOBBY');
                }
            }, 60000);
        }
    });

    socket.on('playerReady', (roomCode) => {
        const room = rooms[roomCode];
        if (room && room.gameState === 'READY_CHECK') {
            if (!room.readyPlayers.includes(socket.id)) {
                room.readyPlayers.push(socket.id);
                
                // Get names and avatars of ready players
                const readyPlayersData = room.readyPlayers.map(id => {
                    const u = room.users.find(user => user.id === id);
                    return u ? { username: u.username, avatar: u.avatar } : { username: 'Unknown', avatar: null };
                });

                const activePlayersCount = room.users.filter(u => !u.isSpectator).length;

                io.to(roomCode).emit('updateReadyStatus', {
                    readyCount: room.readyPlayers.length,
                    totalPlayers: activePlayersCount,
                    readyPlayerIds: room.readyPlayers
                });

                // Check if everyone is ready
                if (room.readyPlayers.length === activePlayersCount) {
                    if (room.readyCheckTimer) clearTimeout(room.readyCheckTimer);
                    
                    // Start 5s countdown
                    let countdown = 5;
                    io.to(roomCode).emit('gameStarting', countdown);
                    
                    room.startCountdownTimer = setInterval(() => {
                        countdown--;
                        if (countdown > 0) {
                            io.to(roomCode).emit('gameStarting', countdown);
                        } else {
                            clearInterval(room.startCountdownTimer);
                            room.startCountdownTimer = null;
                            startActualGame(roomCode);
                        }
                    }, 1000);
                }
            }
        }
    });

    socket.on('playerRefused', (roomCode) => {
        const room = rooms[roomCode];
        if (room && room.gameState === 'READY_CHECK') {
             // Cancel game
             if (room.readyCheckTimer) clearTimeout(room.readyCheckTimer);
             room.gameState = 'LOBBY';
             
             const user = room.users.find(u => u.id === socket.id);
             const username = user ? user.username : 'Un joueur';

             io.to(roomCode).emit('gameCancelled', `Partie annulée : ${username} a refusé.`);
             io.to(roomCode).emit('gameStateChanged', 'LOBBY');
        }
    });

    function handleGameEnd(roomCode) {
        const room = rooms[roomCode];
        if (!room) return;

        // Clear all active timers
        if (room.game.timerInterval) clearInterval(room.game.timerInterval);
        if (room.game.wordChoiceTimer) clearTimeout(room.game.wordChoiceTimer);
        if (room.startCountdownTimer) clearInterval(room.startCountdownTimer);
        if (room.readyCheckTimer) clearTimeout(room.readyCheckTimer);

        room.gameState = 'LOBBY';
        
        // Compile results including current users and disconnected players
        const results = [];
        
        // Add current users
        room.users.forEach(u => {
            results.push({
                id: u.id,
                username: u.username,
                avatar: u.avatar,
                score: room.game.scores[u.id] || 0,
                isDisconnected: false
            });
        });

        // Add disconnected players
        if (room.game.disconnectedPlayers) {
            room.game.disconnectedPlayers.forEach(p => {
                results.push({
                    id: p.id, // We might not have ID if we didn't save it, but we should
                    username: p.username,
                    avatar: p.avatar,
                    score: p.score,
                    isDisconnected: true
                });
            });
        }

        io.to(roomCode).emit('gameEnded', {
            scores: room.game.scores, // Keep for backward compatibility if needed
            results: results
        });
        io.to(roomCode).emit('gameStateChanged', 'LOBBY');
    }

    function startActualGame(roomCode) {
        const room = rooms[roomCode];
        if (!room) return;

        room.gameState = 'PLAYING';
        io.to(roomCode).emit('gameStateChanged', 'PLAYING');
        
        // Initialize Game
        if (room.settings.mode === 'guess-word') {
            // Shuffle players for turn order (exclude spectators)
            room.game.turnOrder = shuffle(room.users.filter(u => !u.isSpectator).map(u => u.id));
            room.game.currentDrawerIndex = 0;
            room.game.currentRound = 1;
            room.game.totalRounds = room.settings.rounds;
            room.game.scores = {};
            room.game.roundScores = {};
            
            room.users.forEach(u => {
                u.score = 0;
                room.game.scores[u.id] = 0;
                room.game.roundScores[u.id] = 0;
            });

            // Notify players of the order and scores
            io.to(roomCode).emit('gameStarted', {
                turnOrder: room.game.turnOrder,
                scores: room.game.scores,
                currentRound: room.game.currentRound,
                totalRounds: room.game.totalRounds
            });

            startTurn(roomCode);
        } else {
            // Free draw mode
            io.to(roomCode).emit('chatMessage', {
                username: 'System',
                message: `La partie commence en mode : ${room.settings.mode}`
            });
        }
    }

    socket.on('kickPlayer', (targetId) => {
        // Find room where socket is leader
        let targetRoomCode = null;
        for (const code in rooms) {
            if (rooms[code].leaderId === socket.id) {
                targetRoomCode = code;
                break;
            }
        }

        if (targetRoomCode) {
            const room = rooms[targetRoomCode];
            const targetUser = room.users.find(u => u.id === targetId);
            
            if (targetUser) {
                // Emit kicked event to target
                io.to(targetId).emit('kicked');
                
                // Remove user logic (similar to disconnect)
                const index = room.users.findIndex(u => u.id === targetId);
                if (index !== -1) {
                    const user = room.users[index];
                    room.users.splice(index, 1);
                    
                    // Also remove from readyPlayers if in ready check
                    if (room.gameState === 'READY_CHECK') {
                        room.readyPlayers = room.readyPlayers.filter(id => id !== targetId);
                        
                        // Get names and avatars of ready players
                        const readyPlayersData = room.readyPlayers.map(id => {
                            const u = room.users.find(user => user.id === id);
                            return u ? { username: u.username, avatar: u.avatar } : { username: 'Unknown', avatar: null };
                        });

                        const activePlayersCount = room.users.filter(u => !u.isSpectator).length;

                        io.to(targetRoomCode).emit('updateReadyStatus', {
                            readyCount: room.readyPlayers.length,
                            totalPlayers: activePlayersCount,
                            readyPlayerIds: room.readyPlayers
                        });
                        
                        // Check if everyone remaining is ready
                        if (room.readyPlayers.length === activePlayersCount && activePlayersCount > 0) {
                            if (room.readyCheckTimer) clearTimeout(room.readyCheckTimer);
                            startActualGame(targetRoomCode);
                        }
                    }

                    io.to(targetRoomCode).emit('userLeft', { 
                        users: room.users, 
                        leaderId: room.leaderId,
                        leftUserId: targetId
                    });
                    
                    io.to(targetRoomCode).emit('chatMessage', {
                        username: 'System',
                        message: `${targetUser.username} a été expulsé de la partie.`
                    });

                    // Game Logic for Kick (same as disconnect)
                    if (room.gameState === 'PLAYING') {
                        // 1. Save score
                        if (!room.game.disconnectedPlayers) room.game.disconnectedPlayers = [];
                        room.game.disconnectedPlayers.push({
                            id: user.id,
                            username: user.username,
                            score: room.game.scores[user.id] || 0,
                            avatar: user.avatar
                        });

                        // 2. Check if only 1 player remains
                        if (room.users.length < 2) {
                            io.to(targetRoomCode).emit('chatMessage', {
                                username: 'System',
                                message: 'Partie terminée : il ne reste plus assez de joueurs.'
                            });
                            handleGameEnd(targetRoomCode);
                        } else {
                            // 3. Check if Drawer Kicked
                            const currentDrawerId = room.game.turnOrder[room.game.currentDrawerIndex];
                            if (targetId === currentDrawerId) {
                                endRound(targetRoomCode, 'Le dessinateur a été expulsé !');
                            }
                        }
                    }
                }
            }
        }
    });

    function startTurn(roomCode) {
        const room = rooms[roomCode];
        if (!room) return;

        const drawerId = room.game.turnOrder[room.game.currentDrawerIndex];
        const drawer = room.users.find(u => u.id === drawerId);

        if (!drawer) {
            // Should not happen, but if drawer left, skip
            nextTurn(roomCode);
            return;
        }

        // Reset round state
        room.game.roundEnded = false;
        room.game.currentWord = null;
        room.game.revealedIndices = [];
        room.game.guessedPlayers = [];
        
        // Reset round scores for this turn
        room.users.forEach(u => {
            room.game.roundScores[u.id] = 0;
        });

        clearInterval(room.game.timerInterval);

        // Clear Canvas
        room.drawHistory = [];
        io.to(roomCode).emit('clearCanvas');

        // Notify everyone who is drawing
        io.to(roomCode).emit('turnStart', {
            drawerId: drawerId,
            drawerName: drawer.username,
            roundIndex: room.game.currentRound,
            totalRounds: room.game.totalRounds,
            turnIndex: room.game.currentDrawerIndex + 1,
            totalTurns: room.game.turnOrder.length
        });

        // Send word choices to drawer
        const words = getRandomWords(room.settings.wordChoices);
        io.to(drawerId).emit('chooseWord', { 
            words, 
            timeout: room.settings.wordChoiceTime 
        });

        // Start Word Choice Timer
        if (room.game.wordChoiceTimer) clearTimeout(room.game.wordChoiceTimer);
        room.game.wordChoiceTimer = setTimeout(() => {
            const randomWord = words[Math.floor(Math.random() * words.length)];
            handleWordChosen(roomCode, randomWord, drawerId);
        }, room.settings.wordChoiceTime * 1000);
    }

    function handleWordChosen(roomCode, word, drawerId) {
        const room = rooms[roomCode];
        if (!room) return;
        
        // Clear choice timer
        if (room.game.wordChoiceTimer) {
            clearTimeout(room.game.wordChoiceTimer);
            room.game.wordChoiceTimer = null;
        }

        room.game.currentWord = word.toUpperCase();
        room.game.timeLeft = room.settings.drawTime;
        room.game.revealedIndices = [];

        // Start Round
        io.to(roomCode).emit('roundStart', {
            startTime: Date.now(),
            duration: room.game.timeLeft,
            wordLength: room.game.currentWord.length,
            hint: generateHint(room.game.currentWord, [])
        });

        // Send real word to drawer
        io.to(drawerId).emit('yourWord', room.game.currentWord);

        // Start Timer
        const totalTime = room.game.timeLeft;
        const hintInterval = Math.floor(totalTime / 5); // 20%
        let nextHintTime = totalTime - hintInterval;

        room.game.timerInterval = setInterval(() => {
            room.game.timeLeft--;

            // Check for hint reveal
            if (room.game.timeLeft <= nextHintTime && room.game.timeLeft > 0) {
                // Reveal a random unrevealed letter
                const unrevealed = [];
                for (let i = 0; i < room.game.currentWord.length; i++) {
                    if (!room.game.revealedIndices.includes(i) && room.game.currentWord[i] !== ' ' && room.game.currentWord[i] !== '-') {
                        unrevealed.push(i);
                    }
                }

                if (unrevealed.length > 0) {
                    const randomIndex = unrevealed[Math.floor(Math.random() * unrevealed.length)];
                    room.game.revealedIndices.push(randomIndex);
                    
                    // Send to everyone EXCEPT drawer
                    io.to(roomCode).except(drawerId).emit('updateHint', {
                        hint: generateHint(room.game.currentWord, room.game.revealedIndices)
                    });
                }
                nextHintTime -= hintInterval;
            }

            if (room.game.timeLeft <= 0) {
                endRound(roomCode, 'Temps écoulé !');
            }
        }, 1000);
    }

    socket.on('wordChosen', ({ roomCode, word }) => {
        const room = rooms[roomCode];
        if (!room) return;
        
        // Verify it's the drawer
        const drawerId = room.game.turnOrder[room.game.currentDrawerIndex];
        if (socket.id !== drawerId) return;

        handleWordChosen(roomCode, word, drawerId);
    });

    function endRound(roomCode, reason) {
        const room = rooms[roomCode];
        if (!room) return;

        if (room.game.roundEnded) return;
        room.game.roundEnded = true;

        clearInterval(room.game.timerInterval);

        io.to(roomCode).emit('roundEnd', {
            reason,
            word: room.game.currentWord || "Non choisi",
            scores: room.game.scores,
            roundScores: room.game.roundScores
        });

        // Wait a bit then next turn
        setTimeout(() => {
            nextTurn(roomCode);
        }, 5000);
    }

    function nextTurn(roomCode) {
        const room = rooms[roomCode];
        if (!room) return;

        room.game.currentDrawerIndex++;
        if (room.game.currentDrawerIndex >= room.game.turnOrder.length) {
            // End of a full round (everyone has drawn once)
            room.game.currentRound++;
            
            if (room.game.currentRound > room.game.totalRounds) {
                // End of game
                handleGameEnd(roomCode);
            } else {
                // Start next round
                room.game.currentDrawerIndex = 0;
                startTurn(roomCode);
            }
        } else {
            startTurn(roomCode);
        }
    }

    socket.on('addLayer', ({ roomCode, layer }) => {
        if (rooms[roomCode]) {
            rooms[roomCode].layers.push(layer);
            io.to(roomCode).emit('layerAdded', layer);
        }
    });

    socket.on('deleteLayer', ({ roomCode, layerId }) => {
        if (rooms[roomCode]) {
            rooms[roomCode].layers = rooms[roomCode].layers.filter(l => l.id !== layerId);
            // Also remove history for this layer
            rooms[roomCode].drawHistory = rooms[roomCode].drawHistory.filter(action => action.layerId !== layerId);
            
            io.to(roomCode).emit('layerDeleted', layerId);
            // Need to resync canvas state because history changed
            io.to(roomCode).emit('canvasState', rooms[roomCode].drawHistory);
        }
    });

    socket.on('renameLayer', ({ roomCode, layerId, name }) => {
        if (rooms[roomCode]) {
            const layer = rooms[roomCode].layers.find(l => l.id === layerId);
            if (layer) {
                layer.name = name;
                io.to(roomCode).emit('layerRenamed', { layerId, name });
            }
        }
    });

    socket.on('reorderLayers', ({ roomCode, layers }) => {
        if (rooms[roomCode]) {
            rooms[roomCode].layers = layers;
            io.to(roomCode).emit('layersReordered', layers);
        }
    });

    socket.on('draw', (data) => {
        const room = rooms[data.roomCode];
        if (room) {
            // Check if user is spectator
            const user = room.users.find(u => u.id === socket.id);
            if (user && user.isSpectator) return;

            // Restriction: Only drawer can draw during game
            if (room.gameState === 'PLAYING' && room.settings.mode === 'guess-word') {
                const drawerId = room.game.turnOrder[room.game.currentDrawerIndex];
                if (socket.id !== drawerId) return;
            }

            // data should contain: roomCode, x0, y0, x1, y1, color, size, opacity, tool, strokeId
            // Add socket id to data for undo tracking
            data.userId = socket.id;
            room.drawHistory.push(data);
            
            // Clear redo history for this user when they draw new things
            if (room.redoHistory) {
                room.redoHistory = room.redoHistory.filter(item => item.userId !== socket.id);
            }

            socket.to(data.roomCode).emit('draw', data);
        }
    });

    socket.on('undo', (roomCode) => {
        if (rooms[roomCode] && rooms[roomCode].drawHistory.length > 0) {
            const history = rooms[roomCode].drawHistory;
            // Find the last strokeId by this user
            let lastStrokeId = null;
            for (let i = history.length - 1; i >= 0; i--) {
                if (history[i].userId === socket.id) {
                    lastStrokeId = history[i].strokeId;
                    break;
                }
            }

            if (lastStrokeId) {
                // Identify actions to remove
                const actionsToRemove = history.filter(action => action.strokeId === lastStrokeId);
                
                // Add to redo history
                if (!rooms[roomCode].redoHistory) rooms[roomCode].redoHistory = [];
                rooms[roomCode].redoHistory.push({
                    userId: socket.id,
                    actions: actionsToRemove
                });

                // Remove all actions with this strokeId
                rooms[roomCode].drawHistory = history.filter(action => action.strokeId !== lastStrokeId);
                // Broadcast new state
                io.to(roomCode).emit('canvasState', rooms[roomCode].drawHistory);
            }
        }
    });

    socket.on('redo', (roomCode) => {
        if (rooms[roomCode] && rooms[roomCode].redoHistory && rooms[roomCode].redoHistory.length > 0) {
            // Find the last redo action for this user
            let redoIndex = -1;
            for (let i = rooms[roomCode].redoHistory.length - 1; i >= 0; i--) {
                if (rooms[roomCode].redoHistory[i].userId === socket.id) {
                    redoIndex = i;
                    break;
                }
            }

            if (redoIndex !== -1) {
                const redoItem = rooms[roomCode].redoHistory[redoIndex];
                
                // Remove from redo history
                rooms[roomCode].redoHistory.splice(redoIndex, 1);
                
                // Add back to draw history
                // We append them to the end to ensure they are drawn on top
                rooms[roomCode].drawHistory.push(...redoItem.actions);
                
                // Broadcast new state
                io.to(roomCode).emit('canvasState', rooms[roomCode].drawHistory);
            }
        }
    });

    socket.on('clearCanvas', (roomCode) => {
        if (rooms[roomCode]) {
            rooms[roomCode].drawHistory = [];
        }
        io.to(roomCode).emit('clearCanvas');
    });

    socket.on('chatMessage', ({ roomCode, username, message }) => {
        const room = rooms[roomCode];
        if (!room) return;

        // Check if spectator
        const user = room.users.find(u => u.id === socket.id);
        if (user && user.isSpectator) return;

        // Game Logic for Guess Word
        if (room.gameState === 'PLAYING' && room.settings.mode === 'guess-word' && room.game.currentWord && !room.game.roundEnded) {
            const drawerId = room.game.turnOrder[room.game.currentDrawerIndex];
            
            // If sender is drawer, they can't guess
            if (socket.id === drawerId) {
                // Drawer chatting
            } else if (!room.game.guessedPlayers.includes(socket.id)) {
                // Check guess
                let isCorrect = false;
                const guess = message.trim().toUpperCase();
                const target = room.game.currentWord;

                if (room.settings.allowFuzzy) {
                    const normalize = (str) => str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                    if (normalize(guess) === normalize(target)) {
                        isCorrect = true;
                    }
                } else {
                    if (guess === target) {
                        isCorrect = true;
                    }
                }

                if (isCorrect) {
                    // Correct Guess!
                    const totalTime = room.settings.drawTime;
                    
                    // Score Calculation
                    // Base 100 + Time Bonus (max 200) + First Bonus (50)
                    let score = 100;
                    score += Math.ceil((room.game.timeLeft / totalTime) * 200);
                    
                    if (room.game.guessedPlayers.length === 0) {
                        score += 50;
                    }

                    room.game.scores[socket.id] += score;
                    room.game.roundScores[socket.id] += score;
                    
                    // Drawer gets points too (e.g. 50 per guess)
                    const drawerPoints = 50;
                    room.game.scores[drawerId] += drawerPoints;
                    room.game.roundScores[drawerId] += drawerPoints;

                    room.game.guessedPlayers.push(socket.id);

                    // Notify
                    io.to(roomCode).emit('chatMessage', {
                        username: 'System',
                        message: `${username} a trouvé le mot !`,
                        type: 'success'
                    });

                    io.to(roomCode).emit('scoreUpdate', room.game.scores);

                    // Check if everyone guessed (excluding drawer)
                    const totalGuessers = room.users.length - 1;
                    if (room.game.guessedPlayers.length >= totalGuessers) {
                        endRound(roomCode, 'Tout le monde a trouvé !');
                    }

                    return; // Don't broadcast the word
                }
            }
        }

        console.log(`Chat in ${roomCode} from ${username}: ${message}`);
        io.to(roomCode).emit('chatMessage', { username, message });
    });

    socket.on('cursorMove', ({ roomCode, x, y, username }) => {
        const room = rooms[roomCode];
        if (room) {
            // Check if user is spectator
            const user = room.users.find(u => u.id === socket.id);
            if (user && user.isSpectator) return;

            // Restriction: Only drawer can show cursor during game
            if (room.gameState === 'PLAYING' && room.settings.mode === 'guess-word') {
                const drawerId = room.game.turnOrder[room.game.currentDrawerIndex];
                if (socket.id !== drawerId) return;
            }
            // Broadcast to others in the room
            socket.to(roomCode).emit('cursorMove', { id: socket.id, x, y, username });
        }
    });

    socket.on('switchRole', (roomCode) => {
        const room = rooms[roomCode];
        if (room && room.gameState === 'LOBBY') {
            const user = room.users.find(u => u.id === socket.id);
            if (user) {
                user.isSpectator = !user.isSpectator;
                
                // Notify everyone about user update
                io.to(roomCode).emit('userJoined', { 
                    users: room.users, 
                    leaderId: room.leaderId 
                });

                // Send updated room state to the user to refresh UI (chat, toolbar, etc)
                const roomState = { 
                    roomCode, 
                    users: room.users,
                    drawHistory: room.drawHistory,
                    layers: room.layers,
                    leaderId: room.leaderId,
                    settings: room.settings,
                    gameState: room.gameState,
                    isSpectator: user.isSpectator,
                    isPrivate: room.isPrivate
                };
                socket.emit('roomJoined', roomState);

                const roleName = user.isSpectator ? 'observateur' : 'joueur';
                io.to(roomCode).emit('chatMessage', {
                    username: 'System',
                    message: `${user.username} est passé en mode ${roleName}.`
                });
            }
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        // Remove user from rooms
        for (const roomCode in rooms) {
            const room = rooms[roomCode];
            const index = room.users.findIndex(u => u.id === socket.id);
            if (index !== -1) {
                const user = room.users[index];
                room.users.splice(index, 1);
                
                // Handle leader transfer
                if (room.leaderId === socket.id && room.users.length > 0) {
                    room.leaderId = room.users[0].id;
                    io.to(roomCode).emit('chatMessage', {
                        username: 'System',
                        message: `${room.users[0].username} est maintenant le leader !`
                    });
                }

                io.to(roomCode).emit('userLeft', { 
                    users: room.users, 
                    leaderId: room.leaderId,
                    leftUserId: socket.id
                });

                io.to(roomCode).emit('chatMessage', {
                    username: 'System',
                    message: `${user.username} a quitté la partie.`
                });

                // Game Logic for Disconnect
                if (!user.isSpectator) {
                    if (room.gameState === 'READY_CHECK') {
                        if (room.readyCheckTimer) clearTimeout(room.readyCheckTimer);
                        if (room.startCountdownTimer) clearInterval(room.startCountdownTimer);
                        
                        room.gameState = 'LOBBY';
                        room.readyPlayers = [];
                        room.startCountdownTimer = null;
                        room.readyCheckTimer = null;
                        
                        io.to(roomCode).emit('gameCancelled', `Lancement annulé : ${user.username} a quitté la partie.`);
                        io.to(roomCode).emit('gameStateChanged', 'LOBBY');
                    } else if (room.gameState === 'PLAYING') {
                        // 1. Save score for disconnected player
                        if (!room.game.disconnectedPlayers) room.game.disconnectedPlayers = [];
                        room.game.disconnectedPlayers.push({
                            id: user.id,
                            username: user.username,
                            score: room.game.scores[user.id] || 0,
                            avatar: user.avatar
                        });

                        // 2. Check if only 1 player remains -> End Game
                        const activePlayersCount = room.users.filter(u => !u.isSpectator).length;
                        if (activePlayersCount < 2) {
                            io.to(roomCode).emit('chatMessage', {
                                username: 'System',
                                message: 'Partie terminée : il ne reste plus assez de joueurs.'
                            });
                            handleGameEnd(roomCode);
                        } else {
                            // 3. Check if Drawer Left -> End Round
                            const currentDrawerId = room.game.turnOrder[room.game.currentDrawerIndex];
                            if (socket.id === currentDrawerId) {
                                endRound(roomCode, 'Le dessinateur a quitté la partie !');
                            }
                        }
                    }
                }

                if (room.users.length === 0) {
                    delete rooms[roomCode];
                    // Notify everyone about new public room count
                    io.emit('updatePublicGameCount', countPublicRooms());
                }
                break; // User is usually in one room at a time in this simple version
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
