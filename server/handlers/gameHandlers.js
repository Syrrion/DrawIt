const { rooms } = require('../state');
const { getRandomWord } = require('../utils/dictionary');

module.exports = (io, socket) => {
    socket.on('startGame', (roomCode) => {
        const room = rooms[roomCode];
        if (room && room.leaderId === socket.id) {
            const result = room.startReadyCheck();
            if (result.error) {
                socket.emit('error', result.error);
            }
        }
    });

    socket.on('playerReady', (roomCode) => {
        const room = rooms[roomCode];
        if (room) {
            room.handlePlayerReady(socket.id);
        }
    });

    socket.on('playerRefused', (roomCode) => {
        const room = rooms[roomCode];
        if (room) {
            room.handlePlayerRefused(socket.id);
        }
    });

    socket.on('chatMessage', ({ roomCode, username, message }) => {
        const room = rooms[roomCode];
        if (!room) return;

        // Check if spectator
        const user = room.getUser(socket.id);
        if (user && user.isSpectator) return;

        // Game Logic for Guess Word
        if (room.gameState === 'PLAYING' && (room.settings.mode === 'guess-word' || room.settings.mode === 'custom-word' || room.settings.mode === 'ai-theme') && room.game.currentWord && !room.game.roundEnded) {
            const drawerId = room.game.turnOrder[room.game.currentDrawerIndex];

            // If sender is drawer, they can't guess
            if (socket.id === drawerId) {
                // Drawer chatting
            } else if (!room.game.guessedPlayers.includes(socket.id)) {
                if (room.game.checkGuess(socket.id, message)) {
                    io.to(roomCode).emit('chatMessage', {
                        username: 'System',
                        message: `${username} a trouvé le mot !`,
                        type: 'success'
                    });
                    return; // Don't broadcast the word
                }
            }
        }

        io.to(roomCode).emit('chatMessage', { username, message });
    });

    socket.on('requestHint', (roomCode) => {
        const room = rooms[roomCode];
        if (!room || room.gameState !== 'PLAYING') return;

        // Check if spectator
        const user = room.getUser(socket.id);
        if (user && user.isSpectator) return;

        // Check if drawer
        const drawerId = room.game.turnOrder[room.game.currentDrawerIndex];
        if (socket.id === drawerId) return;

        // Check if already guessed
        if (room.game.guessedPlayers.includes(socket.id)) return;

        const result = room.game.requestPersonalHint(socket.id);
        if (result.error) {
            socket.emit('error', result.error);
        }
    });

    socket.on('requestRandomWord', () => {
        const word = getRandomWord();
        socket.emit('randomWordProvided', word);
    });

    socket.on('wordChosen', ({ roomCode, word }) => {
        const room = rooms[roomCode];
        if (!room) return;

        // Verify it's the drawer
        const drawerId = room.game.turnOrder[room.game.currentDrawerIndex];
        if (socket.id !== drawerId) return;

        room.game.handleWordChosen(word, drawerId);
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

        room.game.handleWordChosen(cleanWord, drawerId);
    });

    socket.on('creativeVote', ({ roomCode, targetId, stars }) => {
        const room = rooms[roomCode];
        if (room && room.gameState === 'PLAYING' && room.settings.mode === 'creative') {
            if (room.game && room.game.handleVote) {
                room.game.handleVote(socket.id, targetId, stars);
            }
        }
    });

    socket.on('spectatePlayer', ({ roomCode, targetId }) => {
        const room = rooms[roomCode];
        if (room && room.gameState === 'PLAYING' && (room.settings.mode === 'creative' || room.settings.mode === 'telephone')) {
             if (room.game && room.game.subscribeSpectator) {
                 room.game.subscribeSpectator(socket.id, targetId);
             }
        }
    });

    socket.on('telephoneSubmit', ({ roomCode, content }) => {
        const room = rooms[roomCode];
        if (room && room.gameState === 'PLAYING' && room.settings.mode === 'telephone') {
            if (room.game && room.game.handleTelephoneSubmission) {
                room.game.handleTelephoneSubmission(socket.id, content);
            }
        }
    });

    socket.on('telephoneRecapNavigate', ({ roomCode, direction }) => {
        const room = rooms[roomCode];
        if (room && room.leaderId === socket.id) {
            io.to(roomCode).emit('telephoneRecapUpdate', { direction });
        }
    });

    socket.on('submitCreativeDrawing', ({ roomCode, image }) => {
        const room = rooms[roomCode];
        if (room && room.gameState === 'PLAYING' && room.settings.mode === 'creative') {
            if (room.game && room.game.handleCreativeSubmission) {
                room.game.handleCreativeSubmission(socket.id, image);
            }
        }
    });
};