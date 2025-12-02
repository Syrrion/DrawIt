const { rooms } = require('../state');

module.exports = (io, socket) => {
    socket.on('addLayer', ({ roomCode, layer }) => {
        const room = rooms[roomCode];
        if (room) {
            room.addLayer(layer);
        }
    });

    socket.on('deleteLayer', ({ roomCode, layerId }) => {
        const room = rooms[roomCode];
        if (room) {
            room.deleteLayer(layerId);
        }
    });

    socket.on('renameLayer', ({ roomCode, layerId, name }) => {
        const room = rooms[roomCode];
        if (room) {
            room.renameLayer(layerId, name);
        }
    });

    socket.on('reorderLayers', ({ roomCode, layers }) => {
        const room = rooms[roomCode];
        if (room) {
            room.reorderLayers(layers);
        }
    });

    socket.on('draw', (data) => {
        const room = rooms[data.roomCode];
        if (room) {
            // Check if user is spectator
            const user = room.getUser(socket.id);
            if (user && user.isSpectator) return;

            // Add socket id to data for undo tracking
            data.userId = socket.id;

            if (room.gameState === 'PLAYING' && room.settings.mode === 'creative') {
                // Creative Mode: Everyone draws, no broadcast
                if (room.game && room.game.handleCreativeDraw) {
                    room.game.handleCreativeDraw(data);
                }
                return;
            }

            if (room.gameState === 'PLAYING' && room.settings.mode === 'telephone') {
                // Telephone Mode: Everyone draws, no broadcast
                if (room.game && room.game.handleTelephoneDraw) {
                    room.game.handleTelephoneDraw(data);
                }
                return;
            }

            // Restriction: Only drawer can draw during game
            if (room.gameState === 'PLAYING' && (room.settings.mode === 'guess-word' || room.settings.mode === 'custom-word' || room.settings.mode === 'ai-theme')) {
                const drawerId = room.game.turnOrder[room.game.currentDrawerIndex];
                if (socket.id !== drawerId) return;
            }

            room.recordDrawAction(data);
            socket.to(data.roomCode).emit('draw', data);
        }
    });

    socket.on('drawBatch', (data) => {
        const room = rooms[data.roomCode];
        if (room) {
            // Check if user is spectator
            const user = room.getUser(socket.id);
            if (user && user.isSpectator) return;

            const actions = data.actions;
            if (!actions || actions.length === 0) return;

            // Add userId to all actions
            actions.forEach(action => action.userId = socket.id);

            if (room.gameState === 'PLAYING' && room.settings.mode === 'creative') {
                if (room.game && room.game.handleCreativeDraw) {
                    // Handle each action or batch?
                    // For simplicity, loop
                    actions.forEach(action => room.game.handleCreativeDraw(action));
                }
                return;
            }

            if (room.gameState === 'PLAYING' && room.settings.mode === 'telephone') {
                if (room.game && room.game.handleTelephoneDraw) {
                    actions.forEach(action => room.game.handleTelephoneDraw(action));
                }
                return;
            }

            // Restriction: Only drawer can draw during game
            if (room.gameState === 'PLAYING' && (room.settings.mode === 'guess-word' || room.settings.mode === 'custom-word' || room.settings.mode === 'ai-theme')) {
                const drawerId = room.game.turnOrder[room.game.currentDrawerIndex];
                if (socket.id !== drawerId) return;
            }

            actions.forEach(action => room.recordDrawAction(action));
            socket.to(data.roomCode).emit('drawBatch', { actions });
        }
    });

    socket.on('endStroke', (data) => {
        const room = rooms[data.roomCode];
        if (room) {
            // Check if user is spectator
            const user = room.getUser(socket.id);
            if (user && user.isSpectator) return;

            if (room.gameState === 'PLAYING' && (room.settings.mode === 'creative' || room.settings.mode === 'telephone')) {
                return;
            }

            // Restriction: Only drawer can draw during game
            if (room.gameState === 'PLAYING' && (room.settings.mode === 'guess-word' || room.settings.mode === 'custom-word' || room.settings.mode === 'ai-theme')) {
                const drawerId = room.game.turnOrder[room.game.currentDrawerIndex];
                if (socket.id !== drawerId) return;
            }

            socket.to(data.roomCode).emit('endStroke', data);
        }
    });

    socket.on('undo', (roomCode) => {
        const room = rooms[roomCode];
        if (room) {
            if (room.gameState === 'PLAYING' && room.settings.mode === 'creative') {
                if (room.game && room.game.handleCreativeUndo) {
                    room.game.handleCreativeUndo(socket.id);
                }
                return;
            }
            if (room.gameState === 'PLAYING' && room.settings.mode === 'telephone') {
                if (room.game && room.game.handleTelephoneUndo) {
                    room.game.handleTelephoneUndo(socket.id);
                }
                return;
            }
            room.undo(socket.id);
        }
    });

    socket.on('redo', (roomCode) => {
        const room = rooms[roomCode];
        if (room) {
            if (room.gameState === 'PLAYING' && room.settings.mode === 'creative') {
                if (room.game && room.game.handleCreativeRedo) {
                    room.game.handleCreativeRedo(socket.id);
                }
                return;
            }
            if (room.gameState === 'PLAYING' && room.settings.mode === 'telephone') {
                if (room.game && room.game.handleTelephoneRedo) {
                    room.game.handleTelephoneRedo(socket.id);
                }
                return;
            }
            room.redo(socket.id);
        }
    });

    socket.on('clearCanvas', (roomCode) => {
        const room = rooms[roomCode];
        if (room) {
            if (room.gameState === 'PLAYING' && room.settings.mode === 'creative') {
                if (room.game && room.game.handleCreativeClear) {
                    room.game.handleCreativeClear(socket.id);
                }
                return;
            }
            if (room.gameState === 'PLAYING' && room.settings.mode === 'telephone') {
                if (room.game && room.game.handleTelephoneClear) {
                    room.game.handleTelephoneClear(socket.id);
                }
                return;
            }
            room.clearCanvas();
        }
    });

    socket.on('clearLayer', ({ roomCode, layerId }) => {
        const room = rooms[roomCode];
        if (room) {
            if (room.gameState === 'PLAYING' && room.settings.mode === 'creative') {
                if (room.game && room.game.handleCreativeClearLayer) {
                    room.game.handleCreativeClearLayer(socket.id, layerId);
                }
                return;
            }
            if (room.gameState === 'PLAYING' && room.settings.mode === 'telephone') {
                 if (room.game && room.game.handleTelephoneClearLayer) {
                    room.game.handleTelephoneClearLayer(socket.id, layerId);
                }
                return;
            }
            room.clearLayer(layerId);
        }
    });

    socket.on('cursorMove', ({ roomCode, x, y, username }) => {
        const room = rooms[roomCode];
        if (room) {
            // Check if user is spectator
            const user = room.getUser(socket.id);
            if (user && user.isSpectator) return;

            // Creative Mode: Hide cursors
            if (room.gameState === 'PLAYING' && room.settings.mode === 'creative') return;

            // Restriction: Only drawer can show cursor during game
            if (room.gameState === 'PLAYING' && (room.settings.mode === 'guess-word' || room.settings.mode === 'custom-word' || room.settings.mode === 'ai-theme')) {
                const drawerId = room.game.turnOrder[room.game.currentDrawerIndex];
                if (socket.id !== drawerId) return;
            }
            // Broadcast to others in the room
            socket.to(roomCode).emit('cursorMove', { id: socket.id, x, y, username });
        }
    });

    socket.on('activeLayerChanged', ({ roomCode, layerId }) => {
        const room = rooms[roomCode];
        if (room) {
            const user = room.getUser(socket.id);
            if (user) {
                user.activeLayerId = layerId;
                io.to(roomCode).emit('playerLayerChanged', { userId: socket.id, layerId });
            }
        }
    });

    socket.on('requestCanvasState', ({ roomCode }) => {
        const room = rooms[roomCode];
        if (room) {
            socket.emit('canvasState', room.drawHistory);
            room.emitUndoRedoState(socket.id);
        }
    });
};