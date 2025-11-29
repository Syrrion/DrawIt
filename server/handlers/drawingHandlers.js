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

            // Restriction: Only drawer can draw during game
            if (room.gameState === 'PLAYING' && (room.settings.mode === 'guess-word' || room.settings.mode === 'custom-word')) {
                const drawerId = room.game.turnOrder[room.game.currentDrawerIndex];
                if (socket.id !== drawerId) return;
            }

            room.recordDrawAction(data);
            socket.to(data.roomCode).emit('draw', data);
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
            room.undo(socket.id);
        }
    });

    socket.on('redo', (roomCode) => {
        const room = rooms[roomCode];
        if (room) {
            room.redo(socket.id);
        }
    });

    socket.on('clearCanvas', (roomCode) => {
        const room = rooms[roomCode];
        if (room) {
            room.clearCanvas();
        }
    });

    socket.on('clearLayer', ({ roomCode, layerId }) => {
        const room = rooms[roomCode];
        if (room) {
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
            const user = room.getUser(socket.id);
            if (user) {
                user.activeLayerId = layerId;
                io.to(roomCode).emit('playerLayerChanged', { userId: socket.id, layerId });
            }
        }
    });
};