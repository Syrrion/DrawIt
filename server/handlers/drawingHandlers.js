const { rooms } = require('../state');

module.exports = (io, socket) => {
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
            if (room.gameState === 'PLAYING' && (room.settings.mode === 'guess-word' || room.settings.mode === 'custom-word')) {
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

    socket.on('cursorMove', ({ roomCode, x, y, username }) => {
        const room = rooms[roomCode];
        if (room) {
            // Check if user is spectator
            const user = room.users.find(u => u.id === socket.id);
            if (user && user.isSpectator) return;

            // Restriction: Only drawer can show cursor during game
            if (room.gameState === 'PLAYING' && (room.settings.mode === 'guess-word' || room.settings.mode === 'custom-word')) {
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
            const user = room.users.find(u => u.id === socket.id);
            if (user) {
                user.activeLayerId = layerId;
                io.to(roomCode).emit('playerLayerChanged', { userId: socket.id, layerId });
            }
        }
    });
};