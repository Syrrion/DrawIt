const { rooms, countPublicRooms } = require('../state');
const Room = require('../classes/Room');
const { generateHint } = require('../utils/helpers');

module.exports = (io, socket) => {
    // Get Public Game Count
    socket.on('getPublicGameCount', () => {
        socket.emit('updatePublicGameCount', countPublicRooms());
    });

    // Join Random Room
    socket.on('joinRandomRoom', ({ username, isSpectator, filter }) => {
        // Find a public room
        // If spectator, can join any public room that allows spectators
        // If player, must join room with space
        const publicRooms = Object.entries(rooms).filter(([code, room]) => {
            if (room.isPrivate) return false;

            // Filter logic
            if (isSpectator) {
                if (filter === 'lobby' && room.gameState !== 'LOBBY') return false;
                if (filter === 'playing' && room.gameState !== 'PLAYING') return false;
                if (room.gameState !== 'LOBBY' && room.gameState !== 'PLAYING') return false;
            } else {
                // Players can only join LOBBY
                if (room.gameState !== 'LOBBY') return false;
            }

            if (isSpectator) {
                return room.allowSpectators;
            }

            // Players need space
            return room.getPlayers().length < room.maxPlayers;
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

            rooms[roomCode] = new Room(roomCode, io, socket.id, {
                isPrivate: !!isPrivate,
                allowSpectators: allowSpectators !== undefined ? allowSpectators : true,
                maxPlayers: limit
            });

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
                const currentActivePlayers = rooms[roomCode].getPlayers().length;
                if (currentActivePlayers >= rooms[roomCode].maxPlayers) {
                    socket.emit('error', 'La partie est complète.');
                    socket.leave(roomCode);
                    return;
                }
            }
        }

        const room = rooms[roomCode];
        const user = { id: socket.id, username, avatar, score: 0, isSpectator: !!isSpectator, activeLayerId: room.layers[0].id };
        room.addUser(user);

        if (!isSpectator) {
            room.game.scores[socket.id] = 0;
        }

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

        // Send initial Undo/Redo state
        room.emitUndoRedoState(socket.id);

        if (room.gameState === 'PLAYING') {
            roomState.game = {
                scores: room.game.scores,
                currentRound: room.game.currentRound,
                totalRounds: room.game.totalRounds,
                currentDrawerIndex: room.game.currentDrawerIndex,
                turnOrder: room.game.turnOrder,
                guessedPlayers: room.game.guessedPlayers,
                personalHints: room.game.personalHints[socket.id] || 0,
                timeLeft: room.game.timeLeft, // Always send timeLeft
                phase: room.game.telephonePhase || room.game.phase, // Send phase for Telephone/Creative
                roundIndex: room.game.telephoneRound || room.game.currentRound // Send round index
            };

            // Calculate current hint for this user
            if (room.game.currentWord) {
                const userRevealed = room.game.userRevealedIndices[socket.id] || [];
                const allRevealed = [...room.game.revealedIndices, ...userRevealed];
                roomState.game.currentHint = generateHint(room.game.currentWord, allRevealed);
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
            const targetUser = room.getUser(targetId);

            if (targetUser) {
                // Emit kicked event to target
                io.to(targetId).emit('kicked');

                // Remove user logic
                room.removeUser(targetId);

                // Also remove from readyPlayers if in ready check
                if (room.gameState === 'READY_CHECK') {
                    room.readyPlayers = room.readyPlayers.filter(id => id !== targetId);

                    const activePlayersCount = room.getPlayers().length;

                    io.to(targetRoomCode).emit('updateReadyStatus', {
                        readyCount: room.readyPlayers.length,
                        totalPlayers: activePlayersCount,
                        readyPlayerIds: room.readyPlayers
                    });

                    // Check if everyone remaining is ready
                    if (room.readyPlayers.length === activePlayersCount && activePlayersCount > 0) {
                        if (room.readyCheckTimer) clearTimeout(room.readyCheckTimer);
                        room.startGame();
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
                if (!targetUser.isSpectator && room.gameState === 'PLAYING') {
                    room.game.handleDisconnect(targetUser);
                }
            }
        }
    });

    socket.on('switchRole', (roomCode) => {
        const room = rooms[roomCode];
        if (room && room.gameState === 'LOBBY') {
            const user = room.getUser(socket.id);
            if (user) {
                // If currently spectator and wants to play, check for space
                if (user.isSpectator) {
                    const activePlayersCount = room.getPlayers().length;
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
        // Remove user from rooms
        for (const roomCode in rooms) {
            const room = rooms[roomCode];
            const user = room.getUser(socket.id);

            if (user) {
                room.removeUser(socket.id);

                // Handle leader transfer
                if (room.leaderId === socket.id) {
                    if (room.users.length > 0) {
                        // Try to find a non-spectator leader
                        const potentialLeader = room.users.find(u => !u.isSpectator);
                        
                        if (potentialLeader) {
                            room.leaderId = potentialLeader.id;
                            io.to(roomCode).emit('chatMessage', {
                                username: 'System',
                                message: `${potentialLeader.username} est maintenant le leader !`
                            });
                        } else {
                            // Only spectators left
                            room.users.forEach(u => {
                                io.to(u.id).emit('error', 'La partie est terminée car il n\'y a plus de joueurs.');
                                io.to(u.id).emit('kicked');
                            });
                            // Clear users to force room deletion
                            room.users = [];
                        }
                    }
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
                        room.cancelGame(`Lancement annulé : ${user.username} a quitté la partie.`);
                    } else if (room.gameState === 'PLAYING') {
                        room.game.handleDisconnect(user);
                    }
                }

                if (room.users.length === 0) {
                    delete rooms[roomCode];
                    // Notify everyone about new public room count
                    io.emit('updatePublicGameCount', countPublicRooms());
                }
                break;
            }
        }
    });
};