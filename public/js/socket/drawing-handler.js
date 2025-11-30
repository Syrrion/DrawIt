import { socket, canvas } from '../dom-elements.js';
import { state } from '../state.js';
import { performDraw, performFloodFill, performMoveSelection, performClearRect } from '../draw.js';
import { CANVAS_CONFIG } from '../config.js';

export class DrawingHandler {
    constructor(managers) {
        this.layerManager = managers.layerManager;
        this.cursorManager = managers.cursorManager;
        this.toolsManager = managers.toolsManager;
        this.render = managers.render;

        this.snapshots = [];
        this.SNAPSHOT_INTERVAL = 20; // More frequent snapshots for smoother undo
        this.MAX_SNAPSHOTS = 20; // Keep more history

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
        socket.on('undoRedoState', this.handleUndoRedoState.bind(this));
    }

    handleUndoRedoState({ canUndo, canRedo }) {
        state.isUndoRedoProcessing = false;
        if (this.toolsManager) {
            this.toolsManager.updateUndoRedoState(canUndo, canRedo);
        }
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

        this.snapshots = []; // Clear snapshots on reset
        this.layerManager.updateLayersUI();
        if (this.render) this.render();
    }

    handlePlayerLayerChanged({ userId, layerId }) {
        this.layerManager.updatePlayerLayer(userId, layerId);
    }

    applyAction(action) {
        const targetLayerId = action.layerId || (state.layers[0] ? state.layers[0].id : null);
        if (targetLayerId && state.layerCanvases[targetLayerId]) {
            const targetCtx = state.layerCanvases[targetLayerId].ctx;
            if (action.tool === 'fill') {
                performFloodFill(targetCtx, CANVAS_CONFIG.width, CANVAS_CONFIG.height, action.x0, action.y0, action.color, action.opacity);
            } else if (action.tool === 'move-selection') {
                performMoveSelection(targetCtx, action.srcX, action.srcY, action.w, action.h, action.destX, action.destY);
            } else if (action.tool === 'clear-rect') {
                performClearRect(targetCtx, action.x, action.y, action.w, action.h);
            } else {
                performDraw(targetCtx, action.x0, action.y0, action.x1, action.y1, action.color, action.size, action.opacity, action.tool);
            }
        }
    }

    createSnapshot(index, lastAction) {
        const snapshot = {
            index: index,
            signature: JSON.stringify(lastAction),
            layers: {}
        };

        Object.keys(state.layerCanvases).forEach(layerId => {
            const sourceCanvas = state.layerCanvases[layerId].canvas;
            const offscreen = document.createElement('canvas');
            offscreen.width = sourceCanvas.width;
            offscreen.height = sourceCanvas.height;
            offscreen.getContext('2d').drawImage(sourceCanvas, 0, 0);
            snapshot.layers[layerId] = offscreen;
        });

        // Remove existing snapshot at this index if any
        this.snapshots = this.snapshots.filter(s => s.index !== index);
        this.snapshots.push(snapshot);
        this.snapshots.sort((a, b) => a.index - b.index);

        // Prune
        if (this.snapshots.length > this.MAX_SNAPSHOTS) {
            this.snapshots.shift(); // Remove oldest
        }
    }

    restoreSnapshot(snapshot) {
        this.handleClearCanvas(); // Clear current state

        Object.keys(snapshot.layers).forEach(layerId => {
            if (state.layerCanvases[layerId]) {
                const ctx = state.layerCanvases[layerId].ctx;
                // Fix: Reset composite operation and alpha to ensure snapshot is drawn correctly
                // (Previous eraser usage might have left it in destination-out)
                ctx.globalCompositeOperation = 'source-over';
                ctx.globalAlpha = 1;
                ctx.drawImage(snapshot.layers[layerId], 0, 0);
            }
        });
    }

    handleCanvasState(history) {
        state.isUndoRedoProcessing = false;
        
        // 1. Find best snapshot
        let bestSnapshot = null;
        
        for (let i = this.snapshots.length - 1; i >= 0; i--) {
            const s = this.snapshots[i];
            if (s.index <= history.length) {
                const actionToCheck = history[s.index - 1];
                // Check if the snapshot matches the current history at that point
                if (s.index === 0 || (actionToCheck && JSON.stringify(actionToCheck) === s.signature)) {
                    bestSnapshot = s;
                    break;
                }
            }
        }

        // 2. Restore or Clear
        let startIndex = 0;
        if (bestSnapshot) {
            this.restoreSnapshot(bestSnapshot);
            startIndex = bestSnapshot.index;
        } else {
            this.handleClearCanvas();
        }

        // 3. Replay and Snapshot
        let currentStrokeId = null;
        let strokeBuffer = [];
        let lastSnapshotIndex = startIndex;

        for (let i = startIndex; i < history.length; i++) {
            const action = history[i];
            
            // Check if we can buffer this action
            const needsBuffering = (action.tool === 'pen' || action.tool === 'eraser') && action.strokeId;

            if (needsBuffering) {
                if (currentStrokeId !== action.strokeId) {
                    // Stroke changed!
                    // 1. Flush previous buffer
                    if (strokeBuffer.length > 0) {
                        this.applyBufferedStroke(strokeBuffer);
                        
                        // Safe boundary: We just finished a stroke.
                        // The current index 'i' is the start of the NEW stroke.
                        // So the state at 'i' (before processing action 'i') is clean.
                        // We can take a snapshot for index 'i'.
                        if (i - lastSnapshotIndex >= this.SNAPSHOT_INTERVAL) {
                             this.createSnapshot(i, history[i-1]);
                             lastSnapshotIndex = i;
                        }
                        
                        strokeBuffer = [];
                    }
                    currentStrokeId = action.strokeId;
                }
                strokeBuffer.push(action);
            } else {
                // Atomic action (Fill, Shape, etc.)
                // 1. Flush previous buffer if any
                if (strokeBuffer.length > 0) {
                    this.applyBufferedStroke(strokeBuffer);
                    
                    // Safe boundary at index 'i'
                    if (i - lastSnapshotIndex >= this.SNAPSHOT_INTERVAL) {
                         this.createSnapshot(i, history[i-1]);
                         lastSnapshotIndex = i;
                    }
                    
                    strokeBuffer = [];
                    currentStrokeId = null;
                }
                
                this.applyAction(action);
                
                // Safe boundary at index 'i + 1' (after this atomic action)
                if ((i + 1) - lastSnapshotIndex >= this.SNAPSHOT_INTERVAL) {
                    this.createSnapshot(i + 1, action);
                    lastSnapshotIndex = i + 1;
                }
            }
        }
        
        // Flush remaining buffer
        if (strokeBuffer.length > 0) {
            this.applyBufferedStroke(strokeBuffer);
            // Snapshot at the end
            if (history.length - lastSnapshotIndex >= this.SNAPSHOT_INTERVAL) {
                this.createSnapshot(history.length, history[history.length-1]);
            }
        }
        
        if (this.render) this.render();
    }

    applyBufferedStroke(actions) {
        if (actions.length === 0) return;
        // Use properties from the last action to match CanvasManager's behavior (final size/opacity)
        const lastAction = actions[actions.length - 1];
        const layerId = lastAction.layerId;
        
        if (!state.layerCanvases[layerId]) return;
        const targetCtx = state.layerCanvases[layerId].ctx;

        if (!this.replayBufferCanvas) {
            this.replayBufferCanvas = document.createElement('canvas');
            this.replayBufferCanvas.width = CANVAS_CONFIG.width;
            this.replayBufferCanvas.height = CANVAS_CONFIG.height;
            this.replayBufferCtx = this.replayBufferCanvas.getContext('2d');
        }
        
        const ctx = this.replayBufferCtx;
        ctx.clearRect(0, 0, CANVAS_CONFIG.width, CANVAS_CONFIG.height);
        
        ctx.beginPath();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineWidth = lastAction.size;
        
        // Draw with Opacity 1 on the buffer to prevent self-overlap accumulation
        ctx.globalAlpha = 1;
        
        if (lastAction.tool === 'eraser') {
            ctx.strokeStyle = 'rgba(0,0,0,1)';
        } else {
            ctx.strokeStyle = lastAction.color;
            if (lastAction.tool === 'pen') {
                ctx.shadowBlur = 2.5;
                ctx.shadowColor = lastAction.color;
            }
        }
        
        if (actions.length > 0) {
            ctx.moveTo(actions[0].x0, actions[0].y0);
            ctx.lineTo(actions[0].x1, actions[0].y1);
            
            for (let i = 1; i < actions.length; i++) {
                const prev = actions[i-1];
                const curr = actions[i];
                
                // Check continuity
                if (Math.abs(curr.x0 - prev.x1) < 0.1 && Math.abs(curr.y0 - prev.y1) < 0.1) {
                    ctx.lineTo(curr.x1, curr.y1);
                } else {
                    ctx.moveTo(curr.x0, curr.y0);
                    ctx.lineTo(curr.x1, curr.y1);
                }
            }
        }
        
        ctx.stroke();
        
        // Reset shadow
        ctx.shadowBlur = 0;
        ctx.shadowColor = 'transparent';

        // Composite to target with the desired opacity
        const opacity = parseFloat(lastAction.opacity);

        if (lastAction.tool === 'eraser') {
            targetCtx.globalCompositeOperation = 'destination-out';
            targetCtx.globalAlpha = opacity;
        } else {
            targetCtx.globalCompositeOperation = 'source-over';
            targetCtx.globalAlpha = opacity;
        }
        
        targetCtx.drawImage(this.replayBufferCanvas, 0, 0);
        
        // Reset target context
        targetCtx.globalAlpha = 1;
        targetCtx.globalCompositeOperation = 'source-over';
    }

    handleDraw(data) {
        this.applyAction(data);
        if (this.render) this.render();
    }

    handleClearCanvas() {
        Object.values(state.layerCanvases).forEach(l => {
            l.ctx.clearRect(0, 0, CANVAS_CONFIG.width, CANVAS_CONFIG.height);
        });
        if (this.render) this.render();
    }

    handleClearLayer(layerId) {
        if (state.layerCanvases[layerId]) {
            state.layerCanvases[layerId].ctx.clearRect(0, 0, CANVAS_CONFIG.width, CANVAS_CONFIG.height);
            if (this.render) this.render();
        }
    }
}
