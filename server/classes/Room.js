const Game = require('./Game');

class Room {
    constructor(code, io, leaderId, settings = {}) {
        this.code = code;
        this.io = io;
        this.leaderId = leaderId;

        this.users = [];
        this.drawHistory = [];
        this.redoHistory = [];
        this.undoStacks = new Map(); // userId -> [strokeIds]
        this.layers = [
            { id: 'layer-1', name: 'Calque 1', order: 0 }
        ];

        this.gameState = 'LOBBY'; // LOBBY, READY_CHECK, PLAYING
        this.isPrivate = false;
        this.allowSpectators = true;
        this.maxPlayers = 8;

        this.settings = {
            mode: 'guess-word',
            drawTime: 80,
            wordChoiceTime: 20,
            wordChoices: 3,
            rounds: 3,
            allowFuzzy: false,
            hintsEnabled: true,
            maxWordLength: 20,
            personalHints: 3,
            allowTracing: true,
            ...settings
        };

        // Adjust default wordChoiceTime for custom-word mode if not explicitly set
        if (this.settings.mode === 'custom-word' && !settings.wordChoiceTime) {
            this.settings.wordChoiceTime = 45;
        }

        this.readyPlayers = [];
        this.readyCheckTimer = null;
        this.startCountdownTimer = null;

        this.game = new Game(this, io);
    }

    addUser(user) {
        this.users.push(user);
    }

    removeUser(userId) {
        const index = this.users.findIndex(u => u.id === userId);
        if (index !== -1) {
            const user = this.users[index];
            this.users.splice(index, 1);
            return user;
        }
        return null;
    }

    getUser(userId) {
        return this.users.find(u => u.id === userId);
    }

    getPlayers() {
        return this.users.filter(u => !u.isSpectator);
    }

    setGameState(state) {
        this.gameState = state;
        this.io.to(this.code).emit('gameStateChanged', state);
    }

    resetLayers() {
        this.layers = [
            { id: 'layer-1', name: 'Calque 1', order: 0, creatorId: null }
        ];
        this.io.to(this.code).emit('resetLayers', this.layers);
    }

    addLayer(layer) {
        this.layers.push(layer);
        this.io.to(this.code).emit('layerAdded', layer);
    }

    deleteLayer(layerId) {
        this.layers = this.layers.filter(l => l.id !== layerId);
        // Also remove history for this layer
        this.drawHistory = this.drawHistory.filter(action => action.layerId !== layerId);

        this.io.to(this.code).emit('layerDeleted', layerId);
    }

    renameLayer(layerId, name) {
        const layer = this.layers.find(l => l.id === layerId);
        if (layer) {
            layer.name = name;
            this.io.to(this.code).emit('layerRenamed', { layerId, name });
        }
    }

    reorderLayers(layers) {
        this.layers = layers;
        this.io.to(this.code).emit('layersReordered', layers);
    }

    emitUndoRedoState(userId) {
        const undoStack = this.undoStacks.get(userId) || [];
        const canUndo = undoStack.length > 0;
        
        let canRedo = false;
        if (this.redoHistory && this.redoHistory.length > 0) {
            // Check if user has any redo actions
            canRedo = this.redoHistory.some(item => item.userId === userId);
        }

        this.io.to(userId).emit('undoRedoState', { canUndo, canRedo });
    }

    addDrawAction(action) {
        this.drawHistory.push(action);

        // Clear redo history for this user when they draw new things
        if (this.redoHistory) {
            this.redoHistory = this.redoHistory.filter(item => item.userId !== action.userId);
        }

        this.io.to(this.code).emit('draw', action); // Use io.to instead of socket.to for simplicity here, or pass socket? 
        // Wait, original was socket.to(roomCode).emit('draw', data) to avoid echoing back to drawer.
        // But here I don't have socket. 
        // I should probably return the action or handle broadcast in handler if I want to exclude sender.
        // Or I can just emit to everyone, client can handle it (usually client draws locally immediately).
        // Let's keep it simple: emit to everyone. Client usually ignores its own draw events if it already drew it.
        // Actually, typical implementation is: client draws -> emits -> server broadcasts to OTHERS.
        // If server broadcasts to everyone, client might draw twice.
        // I'll stick to updating state here, and let handler do the broadcasting?
        // No, I want to encapsulate logic.
        // I can pass `socket` to `addDrawAction`? No, that couples it to socket.
        // I'll just update state here. And let handler emit?
        // But `deleteLayer` emits.
        // Let's make `addDrawAction` emit to everyone. If client draws twice, it's a client issue to fix (check if it's own ID).
        // But wait, `socket.to` excludes sender. `io.to` includes sender.
        // I'll add `excludeSocketId` optional param to methods?
        // Or just let handler emit 'draw'.
        // But `undo`/`redo` emits `canvasState` to everyone.

        // Let's stick to: methods update state and emit to room (io.to).
        // If `draw` needs to exclude sender, I'll handle it.
        // Actually, `draw` event usually needs to be fast.
        // Let's just update state here.
    }

    // Re-implementing addDrawAction to NOT emit, so handler can use socket.to
    recordDrawAction(action) {
        this.drawHistory.push(action);
        if (this.redoHistory) {
            this.redoHistory = this.redoHistory.filter(item => item.userId !== action.userId);
        }

        // Update Undo Stack
        if (!this.undoStacks.has(action.userId)) {
            this.undoStacks.set(action.userId, []);
        }
        const stack = this.undoStacks.get(action.userId);
        
        // Only push if it's a new stroke (avoid duplicates if multiple packets for same stroke)
        // But usually recordDrawAction is called per packet?
        // Wait, draw events are usually points or lines.
        // If `strokeId` is consistent for a stroke, we should only push it once.
        if (stack.length === 0 || stack[stack.length - 1] !== action.strokeId) {
             stack.push(action.strokeId);
             if (stack.length > 10) {
                 stack.shift();
             }
        }
        
        this.emitUndoRedoState(action.userId);
    }

    undo(userId) {
        const undoStack = this.undoStacks.get(userId);
        if (undoStack && undoStack.length > 0) {
            const lastStrokeId = undoStack.pop();
            
            // Identify actions to remove
            const actionsToRemove = this.drawHistory.filter(action => action.strokeId === lastStrokeId);

            if (actionsToRemove.length > 0) {
                // Add to redo history
                if (!this.redoHistory) this.redoHistory = [];
                this.redoHistory.push({
                    userId: userId,
                    actions: actionsToRemove,
                    strokeId: lastStrokeId
                });

                // Remove all actions with this strokeId
                this.drawHistory = this.drawHistory.filter(action => action.strokeId !== lastStrokeId);
                
                // Broadcast new state
                this.io.to(this.code).emit('canvasState', this.drawHistory);
            }
            
            this.emitUndoRedoState(userId);
        }
    }

    redo(userId) {
        if (this.redoHistory && this.redoHistory.length > 0) {
            // Find the last redo action for this user
            let redoIndex = -1;
            for (let i = this.redoHistory.length - 1; i >= 0; i--) {
                if (this.redoHistory[i].userId === userId) {
                    redoIndex = i;
                    break;
                }
            }

            if (redoIndex !== -1) {
                const redoItem = this.redoHistory[redoIndex];

                // Remove from redo history
                this.redoHistory.splice(redoIndex, 1);

                // Add back to draw history
                this.drawHistory.push(...redoItem.actions);
                
                // Add back to undo stack
                if (!this.undoStacks.has(userId)) {
                    this.undoStacks.set(userId, []);
                }
                const stack = this.undoStacks.get(userId);
                const strokeId = redoItem.strokeId || (redoItem.actions[0] ? redoItem.actions[0].strokeId : null);
                
                if (strokeId) {
                    stack.push(strokeId);
                    // Enforce limit on redo as well? 
                    // If I redo, I am adding to undo stack.
                    // If undo stack exceeds 10, I should shift.
                    if (stack.length > 10) {
                        stack.shift();
                    }
                }

                // Broadcast new state
                this.io.to(this.code).emit('canvasState', this.drawHistory);
                
                this.emitUndoRedoState(userId);
            }
        }
    }

    clearCanvas() {
        this.drawHistory = [];
        this.redoHistory = [];
        this.undoStacks.clear();
        this.io.to(this.code).emit('clearCanvas');
        
        this.users.forEach(user => {
            this.emitUndoRedoState(user.id);
        });
    }

    clearLayer(layerId) {
        // Remove draw actions for this layer
        this.drawHistory = this.drawHistory.filter(action => action.layerId !== layerId);
        
        // Also clear redo history for this layer
        if (this.redoHistory) {
            this.redoHistory = this.redoHistory.filter(item => {
                // Check if any action in the redo item belongs to this layer
                // Actually redoItem.actions is an array of actions.
                // If all actions are on this layer, remove the item.
                // If mixed (unlikely for one stroke), filter actions?
                // Usually a stroke is on one layer.
                return !item.actions.some(action => action.layerId === layerId);
            });
        }

        // Rebuild undo stacks or just clear them?
        // Clearing is safer to avoid inconsistencies
        this.undoStacks.clear();

        this.io.to(this.code).emit('clearLayer', layerId);

        this.users.forEach(user => {
            this.emitUndoRedoState(user.id);
        });
    }

    startGame() {
        this.setGameState('PLAYING');
        this.game.init(this.settings);
    }

    cancelGame(reason) {
        if (this.readyCheckTimer) clearTimeout(this.readyCheckTimer);
        if (this.startCountdownTimer) clearInterval(this.startCountdownTimer);

        this.setGameState('LOBBY');
        this.readyPlayers = [];
        this.startCountdownTimer = null;
        this.readyCheckTimer = null;

        this.io.to(this.code).emit('gameCancelled', reason);
        this.io.to(this.code).emit('gameStateChanged', 'LOBBY');
    }

    startReadyCheck() {
        const activePlayers = this.getPlayers();

        if (activePlayers.length < 2) {
            return { error: 'Il faut au moins 2 joueurs actifs pour commencer.' };
        }

        this.setGameState('READY_CHECK');
        this.readyPlayers = [];

        this.io.to(this.code).emit('readyCheckStarted', {
            totalPlayers: activePlayers.length,
            timeout: 60,
            settings: this.settings,
            users: activePlayers
        });

        if (this.readyCheckTimer) clearTimeout(this.readyCheckTimer);

        this.readyCheckTimer = setTimeout(() => {
            if (this.gameState === 'READY_CHECK') {
                this.cancelGame('Tous les joueurs ne sont pas prêts.');
            }
        }, 60000);

        return { success: true };
    }

    handlePlayerReady(userId) {
        if (this.gameState !== 'READY_CHECK') return;

        if (!this.readyPlayers.includes(userId)) {
            this.readyPlayers.push(userId);

            const activePlayersCount = this.getPlayers().length;

            this.io.to(this.code).emit('updateReadyStatus', {
                readyCount: this.readyPlayers.length,
                totalPlayers: activePlayersCount,
                readyPlayerIds: this.readyPlayers
            });

            if (this.readyPlayers.length === activePlayersCount) {
                if (this.readyCheckTimer) clearTimeout(this.readyCheckTimer);

                let countdown = 5;
                this.io.to(this.code).emit('gameStarting', countdown);

                this.startCountdownTimer = setInterval(() => {
                    countdown--;
                    if (countdown > 0) {
                        this.io.to(this.code).emit('gameStarting', countdown);
                    } else {
                        clearInterval(this.startCountdownTimer);
                        this.startCountdownTimer = null;
                        this.startGame();
                    }
                }, 1000);
            }
        }
    }

    handlePlayerRefused(userId) {
        if (this.gameState !== 'READY_CHECK') return;

        const user = this.getUser(userId);
        const username = user ? user.username : 'Un joueur';

        this.cancelGame(`Partie annulée : ${username} a refusé.`);
    }
}

module.exports = Room;
