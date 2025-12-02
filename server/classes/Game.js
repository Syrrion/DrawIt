const { getRandomWords, getRandomWord } = require('../utils/dictionary');
const { generateHint, shuffle } = require('../utils/helpers');
const geminiService = require('../utils/gemini');

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
        
        this.wordPool = []; // Pool of words for AI mode

        this.undoStacks = new Map();
        this.redoStacks = new Map();
    }

    async init(settings) {
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

        // Pre-generate words for AI Theme mode
        if (this.mode === 'ai-theme') {
            this.io.to(this.room.code).emit('aiGenerating', true);
            try {
                const theme = settings.aiTheme || 'Animaux';
                // Calculate total words needed: players * rounds * choices * 5 (buffer)
                // Actually, we need (players * rounds) turns. Each turn needs 'wordChoices' options.
                // So minimum needed is (players * rounds * wordChoices).
                // We multiply by 5 for variety as requested.
                const totalTurns = activePlayers.length * this.totalRounds;
                const wordsPerTurn = settings.wordChoices || 3;
                const totalWordsNeeded = totalTurns * wordsPerTurn * 5;
                
                console.log(`Generating ${totalWordsNeeded} words for theme ${theme}`);
                this.wordPool = await geminiService.generateWords(theme, totalWordsNeeded);
                
                // Shuffle the pool
                this.wordPool = shuffle(this.wordPool);
                
                this.io.to(this.room.code).emit('aiGenerating', false);
            } catch (error) {
                console.error('Error generating initial word pool:', error);
                this.io.to(this.room.code).emit('aiGenerating', false);
                this.wordPool = []; // Fallback will be handled in handleWordSelection
            }
        }

        // Creative Mode Data
        this.playerDrawings = {};
        this.votes = {};
        this.presentationOrder = [];
        this.presentationIndex = 0;
        this.phase = 'IDLE';
        this.spectatorSubscriptions = {}; // spectatorId -> targetId

        // Telephone Mode Data
        this.telephoneChains = {}; // { ownerId: [ { type: 'text'|'drawing', content: string, authorId: string } ] }
        this.telephoneRound = 0;
        this.telephonePhase = 'IDLE'; // WRITING, DRAWING, GUESSING
        this.telephonePendingSubmissions = {}; // userId -> submission

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
        } else if (this.mode === 'telephone') {
            this.startTelephoneGame();
        } else {
            this.startTurn();
        }
    }

    // Telephone Mode Methods
    startTelephoneGame() {
        this.telephoneChains = {};
        this.telephoneRound = 0;
        this.telephonePendingSubmissions = {};
        this.telephoneDrawings = {}; // userId -> [actions]
        
        // Initialize chains for each player
        this.room.getPlayers().forEach(p => {
            this.telephoneChains[p.id] = [];
            this.telephoneDrawings[p.id] = [];
        });
        
        this.undoStacks.clear();
        this.redoStacks.clear();

        this.startTelephoneRound();
    }

    startTelephoneRound() {
        this.telephoneRound++;
        this.telephonePendingSubmissions = {};
        // Reset drawings for this round
        this.telephoneDrawings = {};
        this.undoStacks.clear();
        this.redoStacks.clear();
        
        const players = this.room.getPlayers();
        const playerCount = players.length;
        
        players.forEach(p => {
            this.telephoneDrawings[p.id] = [];
        });

        // Determine phase based on round number
        // Round 1: Writing (Initial Sentence)
        // Round 2: Drawing
        // Round 3: Guessing (Writing)
        // Round 4: Drawing
        // ...
        
        // If round > player count, game over (everyone has contributed to every chain)
        // Or maybe round > player count if we want full rotation.
        // Let's say N players. 
        // Round 1: P1 writes in Chain 1.
        // Round 2: P2 draws in Chain 1.
        // ...
        // Round N: PN does something in Chain 1.
        // So we need N rounds.
        
        if (this.telephoneRound > playerCount) {
            this.endTelephoneGame();
            return;
        }

        const isWritingPhase = (this.telephoneRound % 2 !== 0); // Odd rounds are writing (1, 3, 5...)
        this.telephonePhase = isWritingPhase ? 'WRITING' : 'DRAWING';

        // Clear canvas for everyone
        this.room.clearCanvas();

        // Assign tasks to players
        players.forEach((player, index) => {
            // Determine which chain this player is working on
            // Logic: In Round R, Player at Index I works on Chain belonging to Player at Index (I - (R-1) + N) % N
            // Example: 3 Players [A, B, C]
            // Round 1 (R=1): A works on Chain A (Index 0 - 0 = 0). B on B. C on C.
            // Round 2 (R=2): A works on Chain C (Index 0 - 1 = -1 -> 2). B on A. C on B.
            // Round 3 (R=3): A works on Chain B (Index 0 - 2 = -2 -> 1). B on C. C on A.
            
            const chainOwnerIndex = (index - (this.telephoneRound - 1) + playerCount * 100) % playerCount; // *100 to avoid negative modulo issues
            const chainOwnerId = players[chainOwnerIndex].id;
            const chain = this.telephoneChains[chainOwnerId];
            
            let previousStep = null;
            if (chain.length > 0) {
                previousStep = chain[chain.length - 1];
            }

            this.io.to(player.id).emit('telephoneRoundStart', {
                round: this.telephoneRound,
                totalRounds: playerCount,
                phase: this.telephonePhase,
                previousStep: previousStep, // null for Round 1
                duration: this.telephonePhase === 'WRITING' ? this.room.settings.writeTime : this.room.settings.drawTime
            });
        });

        // Notify spectators
        this.room.users.forEach(u => {
            if (u.isSpectator) {
                this.io.to(u.id).emit('telephoneRoundStart', {
                    round: this.telephoneRound,
                    totalRounds: playerCount,
                    phase: this.telephonePhase,
                    duration: this.telephonePhase === 'WRITING' ? this.room.settings.writeTime : this.room.settings.drawTime
                });
            }
        });

        // Notify spectators of the new round state (for prompt update)
        Object.entries(this.spectatorSubscriptions).forEach(([spectatorId, targetId]) => {
            // Re-subscribe to trigger prompt update
            this.subscribeSpectator(spectatorId, targetId);
        });

        const duration = this.telephonePhase === 'WRITING' ? this.room.settings.writeTime : this.room.settings.drawTime;
        // Add a buffer to the server timer to allow for network latency and client auto-submission
        this.startTimer(duration + 3, () => this.endTelephoneRound());
    }

    handleTelephoneSubmission(userId, content) {
        // content is string (text) or array of draw actions (drawing)
        // Actually for drawing, we might just save the final canvas state or history?
        // For simplicity, let's assume client sends a dataURL or history.
        // But wait, `handleCreativeDraw` saves history.
        // Here, if it's drawing phase, we receive 'draw' events continuously.
        // So `content` here is likely just a confirmation "I'm done" or the text guess.
        
        if (this.telephonePhase === 'DRAWING') {
            // For drawing, we need to capture what they drew.
            // We can use `this.playerDrawings` logic or similar.
            // Let's assume we track drawings in `this.telephonePendingSubmissions` as they come in via `handleDraw`?
            // No, `handleDraw` broadcasts.
            // We need a specific `handleTelephoneDraw`.
            // Or we reuse `handleCreativeDraw` logic but store in `telephonePendingSubmissions`.
            
            // Let's say `content` is the history of strokes if sent at end, OR we track it live.
            // Tracking live is better for spectators/reconnection.
            // But for simplicity of "submission", let's assume the client sends the full history/image on submit.
            // Actually, sending full history on submit is safer for "Telephone" where intermediate states don't matter as much as the result passed to next player.
            
            this.telephonePendingSubmissions[userId] = {
                type: 'drawing',
                content: content, // Array of actions or DataURL? Let's use DataURL for easier display in recap, or History for replaying?
                                  // DataURL is easier for "Guessing" phase (just show image).
                                  // History is better if we want to edit? No editing in next phase.
                                  // Let's use DataURL (image) for the "content" passed to next player.
                authorId: userId
            };
        } else {
            this.telephonePendingSubmissions[userId] = {
                type: 'text',
                content: content, // String
                authorId: userId
            };
        }

        this.checkTelephoneCompletion();
    }

    checkTelephoneCompletion() {
        const players = this.room.getPlayers();
        const submittedCount = Object.keys(this.telephonePendingSubmissions).length;
        
        if (submittedCount >= players.length) {
            this.endTelephoneRound();
        }
    }

    endTelephoneRound() {
        this.clearTimers();
        
        const players = this.room.getPlayers();
        const playerCount = players.length;
        const submittedCount = Object.keys(this.telephonePendingSubmissions).length;

        // Process submissions
        players.forEach((player, index) => {
            const chainOwnerIndex = (index - (this.telephoneRound - 1) + playerCount * 100) % playerCount;
            const chainOwnerId = players[chainOwnerIndex].id;
            
            let submission = this.telephonePendingSubmissions[player.id];
            
            // Handle timeout/no submission
            if (!submission) {
                submission = {
                    type: this.telephonePhase === 'WRITING' ? 'text' : 'drawing',
                    content: this.telephonePhase === 'WRITING' ? '...' : null, // Empty drawing or text
                    authorId: player.id
                };
            }

            this.telephoneChains[chainOwnerId].push(submission);
        });

        this.io.to(this.room.code).emit('telephoneRoundEnd');
        
        setTimeout(() => {
            this.startTelephoneRound();
        }, 3000);
    }

    endTelephoneGame() {
        this.clearTimers();
        this.room.setGameState('LOBBY');
        this.room.clearCanvas();
        this.room.resetLayers();

        // Prepare recap data
        // Map ownerId to username for display
        const recap = [];
        Object.keys(this.telephoneChains).forEach(ownerId => {
            const owner = this.room.getUser(ownerId);
            recap.push({
                ownerName: owner ? owner.username : 'Inconnu',
                ownerId: ownerId,
                chain: this.telephoneChains[ownerId]
            });
        });

        this.io.to(this.room.code).emit('telephoneGameEnded', {
            recap: recap
        });
        this.io.to(this.room.code).emit('gameStateChanged', 'LOBBY');
    }

    handleTelephoneDraw(action) {
        if (this.telephonePhase !== 'DRAWING') return;
        if (!this.telephoneDrawings[action.userId]) {
            this.telephoneDrawings[action.userId] = [];
        }
        this.telephoneDrawings[action.userId].push(action);

        // Update Undo Stack
        if (!this.undoStacks.has(action.userId)) {
            this.undoStacks.set(action.userId, []);
        }
        const stack = this.undoStacks.get(action.userId);
        if (stack.length === 0 || stack[stack.length - 1] !== action.strokeId) {
             stack.push(action.strokeId);
             if (stack.length > 10) {
                 stack.shift();
             }
        }

        // Clear Redo Stack
        if (this.redoStacks.has(action.userId)) {
            this.redoStacks.get(action.userId).length = 0;
        }
        
        // Emit state
        this.io.to(action.userId).emit('undoRedoState', { 
            canUndo: stack.length > 0, 
            canRedo: false 
        });

        // Broadcast to subscribers
        Object.entries(this.spectatorSubscriptions).forEach(([spectatorId, targetId]) => {
            if (targetId === action.userId) {
                this.io.to(spectatorId).emit('draw', action);
            }
        });
    }

    handleTelephoneUndo(userId) {
        if (this.telephonePhase !== 'DRAWING') return;
        
        const undoStack = this.undoStacks.get(userId);
        if (undoStack && undoStack.length > 0) {
            const lastStrokeId = undoStack.pop();

            if (this.telephoneDrawings[userId]) {
                // Find actions to remove
                const actionsToRemove = this.telephoneDrawings[userId].filter(action => action.strokeId === lastStrokeId);

                // Remove all actions with this strokeId
                this.telephoneDrawings[userId] = this.telephoneDrawings[userId].filter(action => action.strokeId !== lastStrokeId);
                
                // Store in redo stack
                if (!this.redoStacks.has(userId)) this.redoStacks.set(userId, []);
                this.redoStacks.get(userId).push(actionsToRemove);

                // Send back new history
                this.io.to(userId).emit('telephoneHistory', this.telephoneDrawings[userId]);

                // Broadcast new history to subscribers
                Object.entries(this.spectatorSubscriptions).forEach(([spectatorId, targetId]) => {
                    if (targetId === userId) {
                        this.io.to(spectatorId).emit('telephoneHistory', this.telephoneDrawings[userId]);
                    }
                });
            }
            
            const redoStack = this.redoStacks.get(userId);
            this.io.to(userId).emit('undoRedoState', { 
                canUndo: undoStack.length > 0, 
                canRedo: redoStack && redoStack.length > 0 
            });
        }
    }

    handleTelephoneRedo(userId) {
        if (this.telephonePhase !== 'DRAWING') return;
        
        const redoStack = this.redoStacks.get(userId);
        if (redoStack && redoStack.length > 0) {
            const actionsToRestore = redoStack.pop();
            
            if (actionsToRestore && actionsToRestore.length > 0) {
                const strokeId = actionsToRestore[0].strokeId;
                
                // Restore actions
                if (!this.telephoneDrawings[userId]) this.telephoneDrawings[userId] = [];
                this.telephoneDrawings[userId].push(...actionsToRestore);
                
                // Restore to undo stack
                if (!this.undoStacks.has(userId)) this.undoStacks.set(userId, []);
                this.undoStacks.get(userId).push(strokeId);
                
                // Send back new history
                this.io.to(userId).emit('telephoneHistory', this.telephoneDrawings[userId]);

                // Broadcast new history to subscribers
                Object.entries(this.spectatorSubscriptions).forEach(([spectatorId, targetId]) => {
                    if (targetId === userId) {
                        this.io.to(spectatorId).emit('telephoneHistory', this.telephoneDrawings[userId]);
                    }
                });
            }
            
            const undoStack = this.undoStacks.get(userId);
            this.io.to(userId).emit('undoRedoState', { 
                canUndo: undoStack && undoStack.length > 0, 
                canRedo: redoStack.length > 0 
            });
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
        
        this.undoStacks.clear();
        this.redoStacks.clear();

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

        // Update Undo Stack
        if (!this.undoStacks.has(action.userId)) {
            this.undoStacks.set(action.userId, []);
        }
        const stack = this.undoStacks.get(action.userId);
        if (stack.length === 0 || stack[stack.length - 1] !== action.strokeId) {
             stack.push(action.strokeId);
             if (stack.length > 10) {
                 stack.shift();
             }
        }
        
        // Clear Redo Stack
        if (this.redoStacks.has(action.userId)) {
            this.redoStacks.get(action.userId).length = 0;
        }

        // Emit state
        this.io.to(action.userId).emit('undoRedoState', { 
            canUndo: stack.length > 0, 
            canRedo: false 
        });

        // Broadcast to subscribers
        Object.entries(this.spectatorSubscriptions).forEach(([spectatorId, targetId]) => {
            if (targetId === action.userId) {
                this.io.to(spectatorId).emit('draw', action);
            }
        });
    }

    subscribeSpectator(spectatorId, targetId) {
        if (this.phase === 'DRAWING') {
            // Creative Mode
            this.spectatorSubscriptions[spectatorId] = targetId;
            const history = this.playerDrawings[targetId] || [];
            this.io.to(spectatorId).emit('creativeHistory', history);
            this.io.to(spectatorId).emit('spectatorWord', this.currentWord);
        } else if (this.mode === 'telephone') {
            // Telephone Mode
            this.spectatorSubscriptions[spectatorId] = targetId;
            
            if (this.telephonePhase === 'DRAWING') {
                const history = this.telephoneDrawings[targetId] || [];
                this.io.to(spectatorId).emit('telephoneHistory', history);
            }

            // Find the prompt for the target player
            const players = this.room.getPlayers();
            const targetIndex = players.findIndex(p => p.id === targetId);
            
            if (targetIndex !== -1) {
                const playerCount = players.length;
                // In Round 1 (Writing), prompt is "Choix des phrases en cours..."
                if (this.telephoneRound === 1) {
                     this.io.to(spectatorId).emit('spectatorWord', "Choix des phrases en cours...");
                } else {
                    // In other rounds, prompt comes from the chain
                    const chainOwnerIndex = (targetIndex - (this.telephoneRound - 1) + playerCount * 100) % playerCount;
                    const chainOwnerId = players[chainOwnerIndex].id;
                    const chain = this.telephoneChains[chainOwnerId];
                    
                    if (chain && chain.length > 0) {
                        const previousStep = chain[chain.length - 1];
                        if (previousStep.type === 'text') {
                            this.io.to(spectatorId).emit('spectatorWord', previousStep.content);
                        } else if (previousStep.type === 'drawing') {
                            this.io.to(spectatorId).emit('spectatorWord', "Décrivez le dessin");
                        }
                    }
                }
            }
        }
    }

    handleCreativeUndo(userId) {
        if (this.phase !== 'DRAWING') return;
        
        const undoStack = this.undoStacks.get(userId);
        if (undoStack && undoStack.length > 0) {
            const lastStrokeId = undoStack.pop();

            if (this.playerDrawings[userId]) {
                // Find actions to remove
                const actionsToRemove = this.playerDrawings[userId].filter(action => action.strokeId === lastStrokeId);

                // Remove all actions with this strokeId
                this.playerDrawings[userId] = this.playerDrawings[userId].filter(action => action.strokeId !== lastStrokeId);
                
                // Store in redo stack
                if (!this.redoStacks.has(userId)) this.redoStacks.set(userId, []);
                this.redoStacks.get(userId).push(actionsToRemove);

                // Send back new history
                this.io.to(userId).emit('creativeHistory', this.playerDrawings[userId]);

                // Broadcast new history to subscribers
                Object.entries(this.spectatorSubscriptions).forEach(([spectatorId, targetId]) => {
                    if (targetId === userId) {
                        this.io.to(spectatorId).emit('creativeHistory', this.playerDrawings[userId]);
                    }
                });
            }
            
            const redoStack = this.redoStacks.get(userId);
            this.io.to(userId).emit('undoRedoState', { 
                canUndo: undoStack.length > 0, 
                canRedo: redoStack && redoStack.length > 0 
            });
        }
    }

    handleCreativeRedo(userId) {
        if (this.phase !== 'DRAWING') return;
        
        const redoStack = this.redoStacks.get(userId);
        if (redoStack && redoStack.length > 0) {
            const actionsToRestore = redoStack.pop();
            
            if (actionsToRestore && actionsToRestore.length > 0) {
                const strokeId = actionsToRestore[0].strokeId;
                
                // Restore actions
                if (!this.playerDrawings[userId]) this.playerDrawings[userId] = [];
                this.playerDrawings[userId].push(...actionsToRestore);
                
                // Restore to undo stack
                if (!this.undoStacks.has(userId)) this.undoStacks.set(userId, []);
                this.undoStacks.get(userId).push(strokeId);
                
                // Send back new history
                this.io.to(userId).emit('creativeHistory', this.playerDrawings[userId]);

                // Broadcast new history to subscribers
                Object.entries(this.spectatorSubscriptions).forEach(([spectatorId, targetId]) => {
                    if (targetId === userId) {
                        this.io.to(spectatorId).emit('creativeHistory', this.playerDrawings[userId]);
                    }
                });
            }
            
            const undoStack = this.undoStacks.get(userId);
            this.io.to(userId).emit('undoRedoState', { 
                canUndo: undoStack && undoStack.length > 0, 
                canRedo: redoStack.length > 0 
            });
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
            duration: this.room.settings.presentationTime || 10
        });

        this.startTimer(this.room.settings.presentationTime || 10, () => {
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
            duration: this.room.settings.voteTime || 60
        });

        this.startTimer(this.room.settings.voteTime || 60, () => this.endVoting());
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

    async handleWordSelection(drawerId) {
        const settings = this.room.settings;

        // Notify everyone that word selection started
        this.io.to(this.room.code).emit('wordSelectionStarted', {
            drawerId: drawerId,
            timeout: settings.wordChoiceTime
        });

        if (settings.mode === 'custom-word') {
            this.io.to(drawerId).emit('typeWord', {
                timeout: settings.wordChoiceTime,
                maxWordLength: settings.maxWordLength || 20
            });

            this.wordChoiceTimer = setTimeout(() => {
                const randomWord = getRandomWord();
                this.handleWordChosen(randomWord, drawerId);
            }, settings.wordChoiceTime * 1000);
        } else if (settings.mode === 'ai-theme') {
            // AI Theme Mode: Use pre-generated pool
            let words = [];
            
            // Try to get words from pool
            if (this.wordPool && this.wordPool.length >= settings.wordChoices) {
                // Take first N words
                words = this.wordPool.splice(0, settings.wordChoices);
            } else {
                // Fallback if pool is empty or insufficient
                console.warn('Word pool exhausted or empty, using fallback/generation');
                try {
                    const theme = settings.aiTheme || 'Animaux';
                    words = await geminiService.generateWords(theme, settings.wordChoices);
                } catch (e) {
                    words = getRandomWords(settings.wordChoices);
                }
            }
            
            this.io.to(drawerId).emit('chooseWord', {
                words,
                timeout: settings.wordChoiceTime
            });

            this.wordChoiceTimer = setTimeout(() => {
                const randomWord = words[Math.floor(Math.random() * words.length)];
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
        // Prevent double execution (race condition between timeout and user selection)
        if (this.currentWord) return;

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
        if (this.timerInterval) clearInterval(this.timerInterval);

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
        if (!this.currentWord) return;

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
        this.room.clearCanvas();
        this.room.resetLayers();

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
