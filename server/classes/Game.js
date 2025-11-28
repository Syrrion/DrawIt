const { getRandomWords, getRandomWord } = require('../utils/dictionary');
const { generateHint, shuffle } = require('../utils/helpers');

class Game {
    constructor(room, io) {
        this.room = room;
        this.io = io;

        this.turnOrder = [];
        this.currentDrawerIndex = 0;
        this.currentRound = 1;
        this.totalRounds = 3;

        this.scores = {};
        this.roundScores = {};
        this.personalHints = {};
        this.hintCooldowns = {};
        this.userRevealedIndices = {};

        this.currentWord = null;
        this.revealedIndices = [];
        this.guessedPlayers = [];
        this.disconnectedPlayers = [];

        this.timerInterval = null;
        this.wordChoiceTimer = null;
        this.timeLeft = 0;
        this.roundEnded = false;
    }

    init(settings) {
        this.mode = settings.mode || 'guess-word';
        
        // Shuffle players for turn order (exclude spectators)
        const activePlayers = this.room.getPlayers();
        this.turnOrder = shuffle(activePlayers.map(u => u.id));

        this.currentDrawerIndex = 0;
        this.currentRound = 1;
        this.totalRounds = settings.rounds;

        this.scores = {};
        this.roundScores = {};
        this.personalHints = {};
        this.hintCooldowns = {};
        this.userRevealedIndices = {};
        this.disconnectedPlayers = [];

        // Creative Mode Data
        this.playerDrawings = {};
        this.votes = {};
        this.presentationOrder = [];
        this.presentationIndex = 0;
        this.phase = 'IDLE';
        this.spectatorSubscriptions = {}; // spectatorId -> targetId

        this.room.users.forEach(u => {
            u.score = 0;
            this.userRevealedIndices[u.id] = [];

            if (!u.isSpectator) {
                this.scores[u.id] = 0;
                this.roundScores[u.id] = 0;
                this.personalHints[u.id] = settings.personalHints;
                this.hintCooldowns[u.id] = 0;
            }
        });

        this.io.to(this.room.code).emit('gameStarted', {
            turnOrder: this.turnOrder,
            scores: this.scores,
            currentRound: this.currentRound,
            totalRounds: this.totalRounds,
            personalHints: settings.personalHints,
            mode: this.mode
        });

        if (this.mode === 'creative') {
            this.startCreativeRound();
        } else {
            this.startTurn();
        }
    }

    // Creative Mode Methods
    startCreativeRound() {
        this.phase = 'DRAWING';
        this.playerDrawings = {};
        this.votes = {};
        this.spectatorSubscriptions = {};
        this.currentWord = getRandomWord().toUpperCase();
        
        this.room.getPlayers().forEach(p => {
            this.playerDrawings[p.id] = [];
            this.votes[p.id] = {};
        });

        // Clear global canvas for everyone
        this.room.clearCanvas();

        this.io.to(this.room.code).emit('creativeRoundStart', {
            roundIndex: this.currentRound,
            totalRounds: this.totalRounds,
            word: this.currentWord,
            duration: this.room.settings.drawTime
        });

        this.startTimer(this.room.settings.drawTime, () => this.endDrawingPhase());
    }

    handleCreativeDraw(action) {
        if (this.phase !== 'DRAWING') return;
        if (!this.playerDrawings[action.userId]) {
            this.playerDrawings[action.userId] = [];
        }
        this.playerDrawings[action.userId].push(action);

        // Broadcast to subscribers
        Object.entries(this.spectatorSubscriptions).forEach(([spectatorId, targetId]) => {
            if (targetId === action.userId) {
                this.io.to(spectatorId).emit('draw', action);
            }
        });
    }

    subscribeSpectator(spectatorId, targetId) {
        if (this.phase !== 'DRAWING') return;
        
        this.spectatorSubscriptions[spectatorId] = targetId;
        
        // Send current history
        const history = this.playerDrawings[targetId] || [];
        this.io.to(spectatorId).emit('creativeHistory', history);
    }

    handleCreativeUndo(userId) {
        if (this.phase !== 'DRAWING') return;
        
        if (this.playerDrawings[userId] && this.playerDrawings[userId].length > 0) {
            // Find last strokeId
            const history = this.playerDrawings[userId];
            let lastStrokeId = null;
            for (let i = history.length - 1; i >= 0; i--) {
                if (history[i].strokeId) {
                    lastStrokeId = history[i].strokeId;
                    break;
                }
            }

            if (lastStrokeId) {
                // Remove all actions with this strokeId
                this.playerDrawings[userId] = history.filter(action => action.strokeId !== lastStrokeId);
                
                // Send back new history
                this.io.to(userId).emit('creativeHistory', this.playerDrawings[userId]);

                // Broadcast new history to subscribers
                Object.entries(this.spectatorSubscriptions).forEach(([spectatorId, targetId]) => {
                    if (targetId === userId) {
                        this.io.to(spectatorId).emit('creativeHistory', this.playerDrawings[userId]);
                    }
                });
            }
        }
    }

    endDrawingPhase() {
        this.phase = 'INTERMISSION';
        this.io.to(this.room.code).emit('creativeIntermission', { duration: 5 });

        this.startTimer(5, () => {
            this.phase = 'PRESENTATION';
            this.presentationOrder = shuffle(Object.keys(this.playerDrawings));
            this.presentationIndex = 0;
            this.startPresentation();
        });
    }

    startPresentation() {
        if (this.presentationIndex >= this.presentationOrder.length) {
            this.startVoting();
            return;
        }

        const playerId = this.presentationOrder[this.presentationIndex];
        const player = this.room.getUser(playerId);
        const drawing = this.playerDrawings[playerId];

        // Clear canvas before showing next drawing
        this.io.to(this.room.code).emit('clearCanvas');

        this.io.to(this.room.code).emit('creativePresentation', {
            artist: this.room.settings.anonymousVoting ? 'Anonyme' : (player ? player.username : 'Inconnu'),
            drawing: drawing,
            duration: 10
        });

        this.startTimer(10, () => {
            this.presentationIndex++;
            this.startPresentation();
        });
    }

    startVoting() {
        this.phase = 'VOTING';
        
        const mosaicData = this.presentationOrder.map(id => ({
            userId: id,
            username: this.room.settings.anonymousVoting ? '???' : (this.room.getUser(id)?.username || 'Inconnu'),
            drawing: this.playerDrawings[id]
        }));

        this.io.to(this.room.code).emit('creativeVotingStart', {
            drawings: mosaicData,
            duration: 60
        });

        this.startTimer(60, () => this.endVoting());
    }

    handleVote(voterId, targetId, stars) {
        if (this.phase !== 'VOTING') return;
        if (voterId === targetId) return;

        if (!this.votes[targetId]) this.votes[targetId] = {};
        this.votes[targetId][voterId] = parseInt(stars);

        // Check if everyone voted
        const activePlayers = this.room.getPlayers();
        const voters = activePlayers.map(p => p.id);
        
        let allVoted = true;
        for (const voter of voters) {
            let votesCast = 0;
            for (const target of voters) {
                if (target !== voter) {
                    if (this.votes[target] && this.votes[target][voter]) {
                        votesCast++;
                    }
                }
            }
            if (votesCast < voters.length - 1) {
                allVoted = false;
                break;
            }
        }

        if (allVoted) {
            this.startTimer(5, () => this.endVoting());
            this.io.to(this.room.code).emit('votingAllDone');
        }
    }

    endVoting() {
        this.phase = 'SCORING';
        
        const roundResults = [];
        
        Object.keys(this.votes).forEach(targetId => {
            const targetVotes = this.votes[targetId] || {};
            const voteValues = Object.values(targetVotes);
            const totalStars = voteValues.reduce((a, b) => a + b, 0);
            const average = voteValues.length ? (totalStars / voteValues.length).toFixed(1) : 0;
            
            if (this.scores[targetId] !== undefined) {
                this.scores[targetId] += totalStars;
            }

            roundResults.push({
                userId: targetId,
                username: this.room.getUser(targetId)?.username,
                score: totalStars,
                average: average
            });
        });

        roundResults.sort((a, b) => b.score - a.score);

        // Add drawing data to top 3 for podium display
        const top3 = roundResults.slice(0, 3);
        top3.forEach(res => {
            res.drawing = this.playerDrawings[res.userId];
        });

        this.io.to(this.room.code).emit('creativeRoundEnd', {
            results: roundResults,
            scores: this.scores
        });

        setTimeout(() => {
            this.nextCreativeRound();
        }, 15000);
    }

    nextCreativeRound() {
        this.currentRound++;
        if (this.currentRound > this.totalRounds) {
            this.endGame();
        } else {
            this.startCreativeRound();
        }
    }

    startTimer(seconds, callback) {
        if (this.timerInterval) clearInterval(this.timerInterval);
        this.timeLeft = seconds; // Sync with timeLeft property used elsewhere
        
        this.timerInterval = setInterval(() => {
            this.timeLeft--;
            if (this.timeLeft <= 0) {
                clearInterval(this.timerInterval);
                if (callback) callback();
            }
        }, 1000);
    }

    startTurn() {
        const drawerId = this.turnOrder[this.currentDrawerIndex];
        const drawer = this.room.getUser(drawerId);

        if (!drawer) {
            this.nextTurn();
            return;
        }

        // Reset round state
        this.roundEnded = false;
        this.currentWord = null;
        this.revealedIndices = [];
        this.guessedPlayers = [];
        this.roundScores = {};

        this.room.users.forEach(u => {
            this.userRevealedIndices[u.id] = [];
            if (!u.isSpectator) {
                this.roundScores[u.id] = 0;
            }
        });

        this.clearTimers();

        // Reset layers and canvas
        this.room.resetLayers();
        this.room.clearCanvas();

        this.io.to(this.room.code).emit('turnStart', {
            drawerId: drawerId,
            drawerName: drawer.username,
            roundIndex: this.currentRound,
            totalRounds: this.totalRounds,
            turnIndex: this.currentDrawerIndex + 1,
            totalTurns: this.turnOrder.length
        });

        this.handleWordSelection(drawerId);
    }

    handleWordSelection(drawerId) {
        const settings = this.room.settings;

        if (settings.mode === 'custom-word') {
            this.io.to(drawerId).emit('typeWord', {
                timeout: settings.wordChoiceTime,
                maxWordLength: settings.maxWordLength || 20
            });

            this.wordChoiceTimer = setTimeout(() => {
                const randomWord = getRandomWord();
                this.handleWordChosen(randomWord, drawerId);
            }, settings.wordChoiceTime * 1000);
        } else {
            const words = getRandomWords(settings.wordChoices);
            this.io.to(drawerId).emit('chooseWord', {
                words,
                timeout: settings.wordChoiceTime
            });

            this.wordChoiceTimer = setTimeout(() => {
                const randomWord = words[Math.floor(Math.random() * words.length)];
                this.handleWordChosen(randomWord, drawerId);
            }, settings.wordChoiceTime * 1000);
        }
    }

    handleWordChosen(word, drawerId) {
        if (this.wordChoiceTimer) {
            clearTimeout(this.wordChoiceTimer);
            this.wordChoiceTimer = null;
        }

        this.currentWord = word.toUpperCase();
        this.timeLeft = this.room.settings.drawTime;
        this.revealedIndices = [];

        this.io.to(this.room.code).emit('roundStart', {
            startTime: Date.now(),
            duration: this.timeLeft,
            wordLength: this.currentWord.length,
            hint: generateHint(this.currentWord, [])
        });

        this.io.to(drawerId).emit('yourWord', this.currentWord);

        this.startRoundTimer(drawerId);
    }

    startRoundTimer(drawerId) {
        const totalTime = this.timeLeft;
        const hintInterval = Math.floor(totalTime / 5);
        let nextHintTime = totalTime - hintInterval;

        this.timerInterval = setInterval(() => {
            this.timeLeft--;

            if (this.room.settings.hintsEnabled !== false && this.timeLeft <= nextHintTime && this.timeLeft > 0) {
                this.revealRandomHint(drawerId);
                nextHintTime -= hintInterval;
            }

            if (this.timeLeft <= 0) {
                this.endRound('Temps écoulé !');
            }
        }, 1000);
    }

    revealRandomHint(drawerId) {
        const unrevealed = [];
        for (let i = 0; i < this.currentWord.length; i++) {
            if (!this.revealedIndices.includes(i) && this.currentWord[i] !== ' ' && this.currentWord[i] !== '-') {
                unrevealed.push(i);
            }
        }

        if (unrevealed.length > 0) {
            const randomIndex = unrevealed[Math.floor(Math.random() * unrevealed.length)];
            this.revealedIndices.push(randomIndex);

            this.room.users.forEach(u => {
                if (u.id === drawerId) return;

                const userRevealed = this.userRevealedIndices[u.id] || [];
                const allRevealed = [...this.revealedIndices, ...userRevealed];

                this.io.to(u.id).emit('updateHint', {
                    hint: generateHint(this.currentWord, allRevealed)
                });
            });
        }
    }

    endRound(reason) {
        if (this.roundEnded) return;
        this.roundEnded = true;

        clearInterval(this.timerInterval);

        const filteredRoundScores = this.getFilteredRoundScores();

        this.io.to(this.room.code).emit('roundEnd', {
            reason,
            word: this.currentWord || "Non choisi",
            scores: this.scores,
            roundScores: filteredRoundScores
        });

        setTimeout(() => {
            this.nextTurn();
        }, 5000);
    }

    getFilteredRoundScores() {
        const filtered = {};
        for (const [userId, score] of Object.entries(this.roundScores)) {
            const user = this.room.getUser(userId);
            if (user && !user.isSpectator) {
                filtered[userId] = score;
            } else {
                const disconnected = this.disconnectedPlayers.find(p => p.id === userId);
                if (disconnected) {
                    filtered[userId] = score;
                }
            }
        }
        return filtered;
    }

    nextTurn() {
        this.currentDrawerIndex++;
        if (this.currentDrawerIndex >= this.turnOrder.length) {
            this.currentRound++;

            if (this.currentRound > this.totalRounds) {
                this.endGame();
            } else {
                this.currentDrawerIndex = 0;
                this.startTurn();
            }
        } else {
            this.startTurn();
        }
    }

    endGame() {
        this.clearTimers();
        this.room.setGameState('LOBBY');

        const results = this.compileResults();

        this.io.to(this.room.code).emit('gameEnded', {
            scores: this.scores,
            results: results
        });
        this.io.to(this.room.code).emit('gameStateChanged', 'LOBBY');
    }

    compileResults() {
        const results = [];

        this.room.users.forEach(u => {
            if (u.isSpectator) return;
            results.push({
                id: u.id,
                username: u.username,
                avatar: u.avatar,
                score: this.scores[u.id] || 0,
                isDisconnected: false
            });
        });

        this.disconnectedPlayers.forEach(p => {
            results.push({
                id: p.id,
                username: p.username,
                avatar: p.avatar,
                score: p.score,
                isDisconnected: true
            });
        });

        return results;
    }

    checkGuess(userId, guess) {
        if (!this.currentWord) return false;

        let isCorrect = false;
        const target = this.currentWord;
        const cleanGuess = guess.trim().toUpperCase();

        if (this.room.settings.allowFuzzy) {
            const normalize = (str) => str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            if (normalize(cleanGuess) === normalize(target)) {
                isCorrect = true;
            }
        } else {
            if (cleanGuess === target) {
                isCorrect = true;
            }
        }

        if (isCorrect) {
            const totalTime = this.room.settings.drawTime;

            // Score Calculation
            let score = 100;
            score += Math.ceil((this.timeLeft / totalTime) * 200);

            if (this.guessedPlayers.length === 0) {
                score += 50;
            }

            this.scores[userId] += score;
            this.roundScores[userId] += score;

            this.guessedPlayers.push(userId);

            // Drawer gets points too
            const activePlayersCount = this.room.getPlayers().length;
            const maxGuessers = Math.max(1, activePlayersCount - 1);
            const drawerPointsPerGuess = Math.floor(250 / maxGuessers);

            const drawerId = this.turnOrder[this.currentDrawerIndex];
            this.scores[drawerId] += drawerPointsPerGuess;
            this.roundScores[drawerId] += drawerPointsPerGuess;

            this.io.to(this.room.code).emit('scoreUpdate', this.scores);
            this.io.to(this.room.code).emit('playerGuessed', userId);

            // Check if everyone guessed (excluding drawer)
            const totalGuessers = activePlayersCount - 1;
            if (this.guessedPlayers.length >= totalGuessers) {
                this.endRound('Tout le monde a trouvé !');
            }

            return true;
        }

        return false;
    }

    requestPersonalHint(userId) {
        if (!this.currentWord) return { error: 'Pas de mot en cours' };

        // Check remaining hints
        if (!this.personalHints[userId] || this.personalHints[userId] <= 0) {
            return { error: 'Aucun indice restant !' };
        }

        // Check cooldown (20s)
        const now = Date.now();
        const lastHintTime = this.hintCooldowns[userId] || 0;
        if (now - lastHintTime < 20000) {
            const remaining = Math.ceil((20000 - (now - lastHintTime)) / 1000);
            return { error: `Attendez ${remaining}s avant le prochain indice.` };
        }

        // Find unrevealed letter
        const word = this.currentWord;
        const globalRevealed = this.revealedIndices;
        const userRevealed = this.userRevealedIndices[userId] || [];

        const unrevealed = [];
        for (let i = 0; i < word.length; i++) {
            if (word[i] !== ' ' && word[i] !== '-' &&
                !globalRevealed.includes(i) &&
                !userRevealed.includes(i)) {
                unrevealed.push(i);
            }
        }

        if (unrevealed.length === 0) {
            return { error: 'Toutes les lettres sont déjà révélées !' };
        }

        // Reveal letter
        const randomIndex = unrevealed[Math.floor(Math.random() * unrevealed.length)];

        if (!this.userRevealedIndices[userId]) {
            this.userRevealedIndices[userId] = [];
        }
        this.userRevealedIndices[userId].push(randomIndex);

        // Update state
        this.personalHints[userId]--;
        this.hintCooldowns[userId] = now;

        // Send hint to user
        const allRevealed = [...globalRevealed, ...this.userRevealedIndices[userId]];
        const hint = generateHint(word, allRevealed);

        this.io.to(userId).emit('hintRevealed', {
            hint: hint,
            remainingHints: this.personalHints[userId],
            cooldown: 20
        });

        return { success: true };
    }

    handleDisconnect(user) {
        if (this.room.gameState === 'PLAYING' && !user.isSpectator) {
            this.disconnectedPlayers.push({
                id: user.id,
                username: user.username,
                score: this.scores[user.id] || 0,
                avatar: user.avatar
            });

            const activePlayersCount = this.room.getPlayers().length;
            if (activePlayersCount < 2) {
                this.io.to(this.room.code).emit('chatMessage', {
                    username: 'System',
                    message: 'Partie terminée : il ne reste plus assez de joueurs.'
                });
                this.endGame();
            } else {
                const currentDrawerId = this.turnOrder[this.currentDrawerIndex];
                if (user.id === currentDrawerId) {
                    this.endRound('Le dessinateur a quitté la partie !');
                }
            }
        }
    }

    clearTimers() {
        if (this.timerInterval) clearInterval(this.timerInterval);
        if (this.wordChoiceTimer) clearTimeout(this.wordChoiceTimer);
    }
}

module.exports = Game;
