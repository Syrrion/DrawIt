const { rooms } = require('../state');
const { startActualGame, handleWordChosen, endRound } = require('../managers/gameManager');
const { generateHint } = require('../utils/helpers');

module.exports = (io, socket) => {
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
                users: activePlayers
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
                            startActualGame(io, roomCode);
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

    socket.on('chatMessage', ({ roomCode, username, message }) => {
        const room = rooms[roomCode];
        if (!room) return;

        // Check if spectator
        const user = room.users.find(u => u.id === socket.id);
        if (user && user.isSpectator) return;

        // Game Logic for Guess Word
        if (room.gameState === 'PLAYING' && (room.settings.mode === 'guess-word' || room.settings.mode === 'custom-word') && room.game.currentWord && !room.game.roundEnded) {
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
                    let score = 100;
                    score += Math.ceil((room.game.timeLeft / totalTime) * 200);
                    
                    if (room.game.guessedPlayers.length === 0) {
                        score += 50;
                    }

                    room.game.scores[socket.id] += score;
                    room.game.roundScores[socket.id] += score;
                    
                    room.game.guessedPlayers.push(socket.id);

                    // Drawer gets points too
                    const activePlayersCount = room.users.filter(u => !u.isSpectator).length;
                    const maxGuessers = Math.max(1, activePlayersCount - 1);
                    const drawerPointsPerGuess = Math.floor(250 / maxGuessers);
                    
                    room.game.scores[drawerId] += drawerPointsPerGuess;
                    room.game.roundScores[drawerId] += drawerPointsPerGuess;

                    // Notify
                    io.to(roomCode).emit('chatMessage', {
                        username: 'System',
                        message: `${username} a trouvé le mot !`,
                        type: 'success'
                    });

                    io.to(roomCode).emit('scoreUpdate', room.game.scores);
                    io.to(roomCode).emit('playerGuessed', socket.id);

                    // Check if everyone guessed (excluding drawer)
                    const totalGuessers = activePlayersCount - 1;
                    if (room.game.guessedPlayers.length >= totalGuessers) {
                        endRound(io, roomCode, 'Tout le monde a trouvé !');
                    }

                    return; // Don't broadcast the word
                }
            }
        }

        console.log(`Chat in ${roomCode} from ${username}: ${message}`);
        io.to(roomCode).emit('chatMessage', { username, message });
    });

    socket.on('requestHint', (roomCode) => {
        const room = rooms[roomCode];
        if (!room || room.gameState !== 'PLAYING' || !room.game.currentWord) return;

        // Check if spectator
        const user = room.users.find(u => u.id === socket.id);
        if (user && user.isSpectator) return;

        // Check if drawer
        const drawerId = room.game.turnOrder[room.game.currentDrawerIndex];
        if (socket.id === drawerId) return;

        // Check if already guessed
        if (room.game.guessedPlayers.includes(socket.id)) return;

        // Check remaining hints
        if (!room.game.personalHints[socket.id] || room.game.personalHints[socket.id] <= 0) {
            socket.emit('error', 'Aucun indice restant !');
            return;
        }

        // Check cooldown (20s)
        const now = Date.now();
        const lastHintTime = room.game.hintCooldowns[socket.id] || 0;
        if (now - lastHintTime < 20000) {
            const remaining = Math.ceil((20000 - (now - lastHintTime)) / 1000);
            socket.emit('error', `Attendez ${remaining}s avant le prochain indice.`);
            return;
        }

        // Find unrevealed letter
        const word = room.game.currentWord;
        const globalRevealed = room.game.revealedIndices;
        const userRevealed = room.game.userRevealedIndices[socket.id] || [];
        
        const unrevealed = [];
        for (let i = 0; i < word.length; i++) {
            if (word[i] !== ' ' && word[i] !== '-' && 
                !globalRevealed.includes(i) && 
                !userRevealed.includes(i)) {
                unrevealed.push(i);
            }
        }

        if (unrevealed.length === 0) {
            socket.emit('error', 'Toutes les lettres sont déjà révélées !');
            return;
        }

        // Reveal letter
        const randomIndex = unrevealed[Math.floor(Math.random() * unrevealed.length)];
        
        if (!room.game.userRevealedIndices[socket.id]) {
            room.game.userRevealedIndices[socket.id] = [];
        }
        room.game.userRevealedIndices[socket.id].push(randomIndex);
        
        // Update state
        room.game.personalHints[socket.id]--;
        room.game.hintCooldowns[socket.id] = now;

        // Send hint to user
        // Combine global and user revealed indices
        const allRevealed = [...globalRevealed, ...room.game.userRevealedIndices[socket.id]];
        const hint = generateHint(word, allRevealed);

        socket.emit('hintRevealed', {
            hint: hint,
            remainingHints: room.game.personalHints[socket.id],
            cooldown: 20
        });
    });

    socket.on('wordChosen', ({ roomCode, word }) => {
        const room = rooms[roomCode];
        if (!room) return;
        
        // Verify it's the drawer
        const drawerId = room.game.turnOrder[room.game.currentDrawerIndex];
        if (socket.id !== drawerId) return;

        handleWordChosen(io, roomCode, word, drawerId);
    });

    socket.on('customWordChosen', ({ roomCode, word }) => {
        const room = rooms[roomCode];
        if (!room) return;
        
        // Verify it's the drawer
        const drawerId = room.game.turnOrder[room.game.currentDrawerIndex];
        if (socket.id !== drawerId) return;

        // Validate word
        if (!word || word.trim().length === 0) return;
        
        // Sanitize and format
        let cleanWord = word.trim().toUpperCase();
        const maxLength = room.settings.maxWordLength || 20;
        if (cleanWord.length > maxLength) cleanWord = cleanWord.substring(0, maxLength);

        handleWordChosen(io, roomCode, cleanWord, drawerId);
    });
};