const { rooms, countPublicRooms } = require('../state');
const { startActualGame, handleGameEnd, endRound } = require('../managers/gameManager');
const { generateHint } = require('../utils/helpers');

module.exports = (io, socket) => {
    // Get Public Game Count
    socket.on('getPublicGameCount', () => {
        socket.emit('updatePublicGameCount', countPublicRooms());
    });

    // Join Random Room
    socket.on('joinRandomRoom', ({ username, isSpectator }) => {
        // Find a public room in LOBBY state
        // If spectator, can join any public room that allows spectators
        // If player, must join room with space
        const publicRooms = Object.entries(rooms).filter(([code, room]) => {
            if (room.isPrivate || room.gameState !== 'LOBBY') return false;
            
            if (isSpectator) {
                return room.allowSpectators;
            }
            
            // Players need space
            return room.users.filter(u => !u.isSpectator).length < room.maxPlayers;
        });
        
        if (publicRooms.length > 0) {
            const randomRoom = publicRooms[Math.floor(Math.random() * publicRooms.length)];
            const roomCode = randomRoom[0];
            socket.emit('randomRoomFound', roomCode);
        } else {
            socket.emit('error', 'Aucune partie publique disponible.');
        }
    });

    socket.on('joinRoom', ({ username, avatar, roomCode, isSpectator, isPrivate, maxPlayers, allowSpectators }) => {
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

            // Validate maxPlayers
            let limit = parseInt(maxPlayers) || 8;
            if (limit < 2) limit = 2;
            if (limit > 8) limit = 8;

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
                allowSpectators: allowSpectators !== undefined ? allowSpectators : true,
                maxPlayers: limit,
                settings: {
                    mode: 'guess-word',
                    drawTime: 80,
                    wordChoiceTime: 20,
                    wordChoices: 3,
                    rounds: 3,
                    allowFuzzy: false,
                    hintsEnabled: true,
                    maxWordLength: 20,
                    personalHints: 3
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
        } else {
            // Check for duplicate username
            const existingUser = rooms[roomCode].users.find(u => u.username.toLowerCase() === username.toLowerCase());
            if (existingUser) {
                socket.emit('error', 'Ce pseudo est déjà pris dans cette partie.');
                socket.leave(roomCode);
                return;
            }

            // Check spectator permission
            if (isSpectator && !rooms[roomCode].allowSpectators) {
                socket.emit('error', 'Cette partie n\'autorise pas les observateurs.');
                socket.leave(roomCode);
                return;
            }

            // Check max players if not spectator
            if (!isSpectator) {
                const currentActivePlayers = rooms[roomCode].users.filter(u => !u.isSpectator).length;
                if (currentActivePlayers >= rooms[roomCode].maxPlayers) {
                    socket.emit('error', 'La partie est complète.');
                    socket.leave(roomCode);
                    return;
                }
            }
        }

        const room = rooms[roomCode];
        const user = { id: socket.id, username, avatar, score: 0, isSpectator: !!isSpectator, activeLayerId: room.layers[0].id };
        room.users.push(user);
        room.game.scores[socket.id] = 0;

        // Notify others in the room
        io.to(roomCode).emit('userJoined', { 
            users: room.users, 
            leaderId: room.leaderId,
            maxPlayers: room.maxPlayers
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
            isPrivate: room.isPrivate,
            maxPlayers: room.maxPlayers,
            allowSpectators: room.allowSpectators
        };

        if (room.gameState === 'PLAYING') {
            roomState.game = {
                scores: room.game.scores,
                currentRound: room.game.currentRound,
                totalRounds: room.game.totalRounds,
                currentDrawerIndex: room.game.currentDrawerIndex,
                turnOrder: room.game.turnOrder,
                guessedPlayers: room.game.guessedPlayers,
                personalHints: room.game.personalHints[socket.id] || 0
            };

            // Calculate current hint for this user
            if (room.game.currentWord) {
                const userRevealed = room.game.userRevealedIndices[socket.id] || [];
                const allRevealed = [...room.game.revealedIndices, ...userRevealed];
                roomState.game.currentHint = generateHint(room.game.currentWord, allRevealed);
                roomState.game.timeLeft = room.game.timeLeft;
                roomState.game.totalTime = room.settings.drawTime;
            }
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

    socket.on('leaderConfiguring', ({ roomCode, isConfiguring }) => {
        const room = rooms[roomCode];
        if (room && room.leaderId === socket.id) {
            io.to(roomCode).emit('updateLobbyStatus', { status: isConfiguring ? 'CONFIGURING' : 'WAITING' });
        }
    });

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
                            startActualGame(io, targetRoomCode);
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
                    if (!user.isSpectator && room.gameState === 'PLAYING') {
                        // 1. Save score
                        if (!room.game.disconnectedPlayers) room.game.disconnectedPlayers = [];
                        room.game.disconnectedPlayers.push({
                            id: user.id,
                            username: user.username,
                            score: room.game.scores[user.id] || 0,
                            avatar: user.avatar
                        });

                        // 2. Check if only 1 player remains
                        const activePlayersCount = room.users.filter(u => !u.isSpectator).length;
                        if (activePlayersCount < 2) {
                            io.to(targetRoomCode).emit('chatMessage', {
                                username: 'System',
                                message: 'Partie terminée : il ne reste plus assez de joueurs.'
                            });
                            handleGameEnd(io, targetRoomCode);
                        } else {
                            // 3. Check if Drawer Kicked
                            const currentDrawerId = room.game.turnOrder[room.game.currentDrawerIndex];
                            if (targetId === currentDrawerId) {
                                endRound(io, targetRoomCode, 'Le dessinateur a été expulsé !');
                            }
                        }
                    }
                }
            }
        }
    });

    socket.on('switchRole', (roomCode) => {
        const room = rooms[roomCode];
        if (room && room.gameState === 'LOBBY') {
            const user = room.users.find(u => u.id === socket.id);
            if (user) {
                // If currently spectator and wants to play, check for space
                if (user.isSpectator) {
                    const activePlayersCount = room.users.filter(u => !u.isSpectator).length;
                    if (activePlayersCount >= room.maxPlayers) {
                        socket.emit('error', 'La partie est complète, impossible de rejoindre en tant que joueur.');
                        return;
                    }
                } else {
                    // If currently player and wants to spectate, check if allowed
                    if (!room.allowSpectators) {
                        socket.emit('error', 'Cette partie n\'autorise pas les observateurs.');
                        return;
                    }
                }

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
                            handleGameEnd(io, roomCode);
                        } else {
                            // 3. Check if Drawer Left -> End Round
                            const currentDrawerId = room.game.turnOrder[room.game.currentDrawerIndex];
                            if (socket.id === currentDrawerId) {
                                endRound(io, roomCode, 'Le dessinateur a quitté la partie !');
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
};