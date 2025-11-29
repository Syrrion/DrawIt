import { socket, canvas } from '../dom-elements.js';
import { state } from '../state.js';
import { performDraw, performFloodFill, performMoveSelection, performClearRect } from '../draw.js';

export class DrawingHandler {
    constructor(managers) {
        this.layerManager = managers.layerManager;
        this.cursorManager = managers.cursorManager;
        this.render = managers.render;

        this.init();
    }

    init() {
        socket.on('layerAdded', this.handleLayerAdded.bind(this));
        socket.on('layerDeleted', this.handleLayerDeleted.bind(this));
        socket.on('layerRenamed', this.handleLayerRenamed.bind(this));
        socket.on('layersReordered', this.handleLayersReordered.bind(this));
        socket.on('resetLayers', this.handleResetLayers.bind(this));
        socket.on('playerLayerChanged', this.handlePlayerLayerChanged.bind(this));
        socket.on('canvasState', this.handleCanvasState.bind(this));
        socket.on('draw', this.handleDraw.bind(this));
        socket.on('clearCanvas', this.handleClearCanvas.bind(this));
        socket.on('clearLayer', this.handleClearLayer.bind(this));
    }

    handleLayerAdded(layer) {
        state.layers.push(layer);
        this.layerManager.createLayerCanvas(layer.id);

        // Switch to new layer only if I created it
        if (layer.creatorId === socket.id) {
            state.activeLayerId = layer.id;
            this.layerManager.setActiveLayerId(state.activeLayerId);
            socket.emit('activeLayerChanged', { roomCode: state.currentRoom, layerId: layer.id });
        }

        this.layerManager.updateLayersUI();
        if (this.render) this.render();
    }

    handleLayerDeleted(layerId) {
        const index = state.layers.findIndex(l => l.id === layerId);
        if (index !== -1) state.layers.splice(index, 1);

        delete state.layerCanvases[layerId];
        this.layerManager.deleteLayerCanvas(layerId);

        if (state.activeLayerId === layerId) {
            state.activeLayerId = state.layers.length > 0 ? state.layers[state.layers.length - 1].id : null;
            this.layerManager.setActiveLayerId(state.activeLayerId);
            if (state.activeLayerId) {
                socket.emit('activeLayerChanged', { roomCode: state.currentRoom, layerId: state.activeLayerId });
            }
        }
        this.layerManager.updateLayersUI();
        if (this.render) this.render();
    }

    handleLayerRenamed({ layerId, name }) {
        const layer = state.layers.find(l => l.id === layerId);
        if (layer) {
            layer.name = name;
            this.layerManager.updateLayersUI();
        }
    }

    handleLayersReordered(newLayers) {
        state.layers.length = 0;
        state.layers.push(...newLayers);
        this.layerManager.updateLayersUI();
        if (this.render) this.render();
    }

    handleResetLayers(layers) {
        // Clear all existing canvases
        Object.keys(state.layerCanvases).forEach(id => {
            this.layerManager.deleteLayerCanvas(id);
        });

        // Reset state layers
        state.layers.length = 0;
        state.layers.push(...layers);

        // Re-create canvases for new layers
        layers.forEach(l => {
            this.layerManager.createLayerCanvas(l.id);
        });

        // Set active layer
        if (layers.length > 0) {
            state.activeLayerId = layers[0].id;
            this.layerManager.setActiveLayerId(state.activeLayerId);
        }

        this.layerManager.updateLayersUI();
        if (this.render) this.render();
    }

    handlePlayerLayerChanged({ userId, layerId }) {
        this.layerManager.updatePlayerLayer(userId, layerId);
    }

    handleCanvasState(history) {
        Object.values(state.layerCanvases).forEach(l => {
            l.ctx.clearRect(0, 0, 800, 600);
        });

        history.forEach(action => {
            const targetLayerId = action.layerId || (state.layers[0] ? state.layers[0].id : null);
            if (targetLayerId && state.layerCanvases[targetLayerId]) {
                const targetCtx = state.layerCanvases[targetLayerId].ctx;
                if (action.tool === 'fill') {
                    performFloodFill(targetCtx, 800, 600, action.x0, action.y0, action.color);
                } else if (action.tool === 'move-selection') {
                    performMoveSelection(targetCtx, action.srcX, action.srcY, action.w, action.h, action.destX, action.destY);
                } else if (action.tool === 'clear-rect') {
                    performClearRect(targetCtx, action.x, action.y, action.w, action.h);
                } else {
                    performDraw(targetCtx, action.x0, action.y0, action.x1, action.y1, action.color, action.size, action.opacity, action.tool);
                }
            }
        });
        if (this.render) this.render();
    }

    handleDraw(data) {
        const targetLayerId = data.layerId || (state.layers[0] ? state.layers[0].id : null);
        if (targetLayerId && state.layerCanvases[targetLayerId]) {
            const targetCtx = state.layerCanvases[targetLayerId].ctx;
            if (data.tool === 'fill') {
                performFloodFill(targetCtx, 800, 600, data.x0, data.y0, data.color);
            } else if (data.tool === 'move-selection') {
                performMoveSelection(targetCtx, data.srcX, data.srcY, data.w, data.h, data.destX, data.destY);
            } else if (data.tool === 'clear-rect') {
                performClearRect(targetCtx, data.x, data.y, data.w, data.h);
            } else {
                performDraw(targetCtx, data.x0, data.y0, data.x1, data.y1, data.color, data.size, data.opacity, data.tool);
            }
            if (this.render) this.render();
        }
    }

    handleClearCanvas() {
        Object.values(state.layerCanvases).forEach(l => {
            l.ctx.clearRect(0, 0, 800, 600);
        });
        if (this.render) this.render();
    }

    handleClearLayer(layerId) {
        if (state.layerCanvases[layerId]) {
            state.layerCanvases[layerId].ctx.clearRect(0, 0, 800, 600);
            if (this.render) this.render();
        }
    }
}
