const { rooms } = require('../state');
const { getRandomWords, getRandomWord } = require('../utils/dictionary');
const { generateHint, shuffle } = require('../utils/helpers');

function handleGameEnd(io, roomCode) {
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
        if (u.isSpectator) return;
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
                id: p.id,
                username: p.username,
                avatar: p.avatar,
                score: p.score,
                isDisconnected: true
            });
        });
    }

    io.to(roomCode).emit('gameEnded', {
        scores: room.game.scores,
        results: results
    });
    io.to(roomCode).emit('gameStateChanged', 'LOBBY');
}

function startActualGame(io, roomCode) {
    const room = rooms[roomCode];
    if (!room) return;

    room.gameState = 'PLAYING';
    io.to(roomCode).emit('gameStateChanged', 'PLAYING');
    
    // Initialize Game
    if (room.settings.mode === 'guess-word' || room.settings.mode === 'custom-word') {
        // Shuffle players for turn order (exclude spectators)
        room.game.turnOrder = shuffle(room.users.filter(u => !u.isSpectator).map(u => u.id));
        room.game.currentDrawerIndex = 0;
        room.game.currentRound = 1;
        room.game.totalRounds = room.settings.rounds;
        room.game.scores = {};
        room.game.roundScores = {};
        room.game.personalHints = {}; // Remaining hints per user
        room.game.hintCooldowns = {}; // Last hint time per user
        room.game.userRevealedIndices = {}; // Indices revealed per user
        
        room.users.forEach(u => {
            u.score = 0;
            room.game.userRevealedIndices[u.id] = [];
            
            if (!u.isSpectator) {
                room.game.scores[u.id] = 0;
                room.game.roundScores[u.id] = 0;
                room.game.personalHints[u.id] = room.settings.personalHints;
                room.game.hintCooldowns[u.id] = 0;
            }
        });

        // Notify players of the order and scores
        io.to(roomCode).emit('gameStarted', {
            turnOrder: room.game.turnOrder,
            scores: room.game.scores,
            currentRound: room.game.currentRound,
            totalRounds: room.game.totalRounds,
            personalHints: room.settings.personalHints
        });

        startTurn(io, roomCode);
    } else {
        // Free draw mode
        io.to(roomCode).emit('chatMessage', {
            username: 'System',
            message: `La partie commence en mode : ${room.settings.mode}`
        });
    }
}

function startTurn(io, roomCode) {
    const room = rooms[roomCode];
    if (!room) return;

    const drawerId = room.game.turnOrder[room.game.currentDrawerIndex];
    const drawer = room.users.find(u => u.id === drawerId);

    if (!drawer) {
        // Should not happen, but if drawer left, skip
        nextTurn(io, roomCode);
        return;
    }

    // Reset round state
    room.game.roundEnded = false;
    room.game.currentWord = null;
    room.game.revealedIndices = [];
    room.game.guessedPlayers = [];
    
    // Reset round scores and user revealed indices for this turn
    room.game.roundScores = {};
    room.users.forEach(u => {
        room.game.userRevealedIndices[u.id] = [];
        if (!u.isSpectator) {
            room.game.roundScores[u.id] = 0;
        }
    });

    clearInterval(room.game.timerInterval);

    // Reset layers to default
    room.layers = [
        { id: 'layer-1', name: 'Calque 1', order: 0, creatorId: null }
    ];
    io.to(roomCode).emit('resetLayers', room.layers);

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

    if (room.settings.mode === 'custom-word') {
        // Ask drawer to type a word
        io.to(drawerId).emit('typeWord', {
            timeout: room.settings.wordChoiceTime,
            maxWordLength: room.settings.maxWordLength || 20
        });

        // Start Word Choice Timer
        if (room.game.wordChoiceTimer) clearTimeout(room.game.wordChoiceTimer);
        room.game.wordChoiceTimer = setTimeout(() => {
            // If no word chosen, pick a random one from dictionary as fallback
            const randomWord = getRandomWord();
            handleWordChosen(io, roomCode, randomWord, drawerId);
        }, room.settings.wordChoiceTime * 1000);

    } else {
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
            handleWordChosen(io, roomCode, randomWord, drawerId);
        }, room.settings.wordChoiceTime * 1000);
    }
}

function handleWordChosen(io, roomCode, word, drawerId) {
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
        if (room.settings.hintsEnabled !== false && room.game.timeLeft <= nextHintTime && room.game.timeLeft > 0) {
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
                
                // Send customized hint to each user
                room.users.forEach(u => {
                    if (u.id === drawerId) return;
                    
                    const userRevealed = room.game.userRevealedIndices[u.id] || [];
                    const allRevealed = [...room.game.revealedIndices, ...userRevealed];
                    
                    io.to(u.id).emit('updateHint', {
                        hint: generateHint(room.game.currentWord, allRevealed)
                    });
                });
            }
            nextHintTime -= hintInterval;
        }

        if (room.game.timeLeft <= 0) {
            endRound(io, roomCode, 'Temps écoulé !');
        }
    }, 1000);
}

function endRound(io, roomCode, reason) {
    const room = rooms[roomCode];
    if (!room) return;

    if (room.game.roundEnded) return;
    room.game.roundEnded = true;

    clearInterval(room.game.timerInterval);

    // Filter out spectators from round scores
    const filteredRoundScores = {};
    for (const [userId, score] of Object.entries(room.game.roundScores)) {
        const user = room.users.find(u => u.id === userId);
        
        if (user) {
            // User is currently connected
            if (user.isSpectator) continue; // Skip spectators
            filteredRoundScores[userId] = score;
        } else {
            // User is disconnected
            // Check if they are in disconnectedPlayers list (meaning they were active players)
            const disconnectedPlayer = room.game.disconnectedPlayers && room.game.disconnectedPlayers.find(p => p.id === userId);
            if (disconnectedPlayer) {
                filteredRoundScores[userId] = score;
            }
            // If not in disconnectedPlayers, it was a spectator who left, so skip.
        }
    }

    io.to(roomCode).emit('roundEnd', {
        reason,
        word: room.game.currentWord || "Non choisi",
        scores: room.game.scores,
        roundScores: filteredRoundScores
    });

    // Wait a bit then next turn
    setTimeout(() => {
        nextTurn(io, roomCode);
    }, 5000);
}

function nextTurn(io, roomCode) {
    const room = rooms[roomCode];
    if (!room) return;

    room.game.currentDrawerIndex++;
    if (room.game.currentDrawerIndex >= room.game.turnOrder.length) {
        // End of a full round (everyone has drawn once)
        room.game.currentRound++;
        
        if (room.game.currentRound > room.game.totalRounds) {
            // End of game
            handleGameEnd(io, roomCode);
        } else {
            // Start next round
            room.game.currentDrawerIndex = 0;
            startTurn(io, roomCode);
        }
    } else {
        startTurn(io, roomCode);
    }
}

module.exports = {
    startActualGame,
    handleGameEnd,
    startTurn,
    nextTurn,
    endRound,
    handleWordChosen
};