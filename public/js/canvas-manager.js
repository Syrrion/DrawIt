import {
    canvas, ctx, penColorInput, penSizeInput, penOpacityInput, socket,
    localCursor
} from './dom-elements.js';
import { state } from './state.js';
import { performDraw, performFloodFill } from './draw.js';
import { handleSelectionMouseDown, handleSelectionMouseMove, handleSelectionMouseUp, drawSelectionOverlay, setRenderCallback } from './selection-manager.js';

export class CanvasManager {
    constructor(cursorManager, cameraManager, toolsManager) {
        this.cursorManager = cursorManager;
        this.cameraManager = cameraManager;
        this.toolsManager = toolsManager;

        this.lastForbiddenTime = 0;

        this.init();
    }

    render() {
        // Clear screen
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Draw layers in order
        state.layers.forEach(layer => {
            const layerObj = state.layerCanvases[layer.id];
            if (layerObj && layerObj.visible) {
                ctx.drawImage(layerObj.canvas, 0, 0);
            }
        });

        // Draw preview canvas (for non-accumulating transparency)
        if (this.isBuffering && this.previewCanvas) {
            ctx.drawImage(this.previewCanvas, 0, 0);
        }
    }

    renderAsync() {
        if (this.renderPending) return;
        this.renderPending = true;
        requestAnimationFrame(() => {
            this.render();
            this.renderPending = false;
        });
    }

    init() {
        setRenderCallback(this.render.bind(this));

        canvas.width = 800;
        canvas.height = 600;

        // Preview canvas for buffering strokes
        this.previewCanvas = document.createElement('canvas');
        this.previewCanvas.width = 800;
        this.previewCanvas.height = 600;
        this.previewCtx = this.previewCanvas.getContext('2d');
        this.isBuffering = false;
        this.currentPath = [];

        canvas.addEventListener('wheel', this.handleWheel.bind(this));
        canvas.addEventListener('mousedown', this.handleMouseDown.bind(this));
        canvas.addEventListener('mousemove', this.handleMouseMove.bind(this));
        window.addEventListener('mouseup', this.handleMouseUp.bind(this));
        canvas.addEventListener('mouseout', this.handleMouseOut.bind(this));
        canvas.addEventListener('mouseenter', this.handleMouseEnter.bind(this));

        canvas.addEventListener('touchstart', this.handleTouch.bind(this), { passive: false });
        canvas.addEventListener('touchmove', this.handleTouch.bind(this), { passive: false });
        canvas.addEventListener('touchend', this.handleTouch.bind(this), { passive: false });

        canvas.addEventListener('contextmenu', e => e.preventDefault());

        // Custom event for forcing render
        canvas.addEventListener('request-render', () => {
            this.render();
        });
    }

    showForbiddenIcon(canvasX, canvasY) {
        const now = Date.now();
        if (now - this.lastForbiddenTime < 500) return; // Throttle to avoid spamming
        this.lastForbiddenTime = now;

        const icon = document.createElement('div');
        icon.className = 'forbidden-icon';
        icon.innerHTML = '<i class="fas fa-ban"></i>'; // FontAwesome ban icon

        const rect = canvas.getBoundingClientRect();
        const scaleX = rect.width / canvas.width;
        const scaleY = rect.height / canvas.height;

        const screenX = rect.left + canvasX * scaleX;
        const screenY = rect.top + canvasY * scaleY;

        icon.style.left = `${screenX}px`;
        icon.style.top = `${screenY}px`;

        document.body.appendChild(icon);

        setTimeout(() => {
            icon.remove();
        }, 800);
    }

    getMousePos(e) {
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;

        return {
            x: (e.clientX - rect.left) * scaleX,
            y: (e.clientY - rect.top) * scaleY
        };
    }

    drawOnCanvas(x0, y0, x1, y1, color, size, opacity, tool, emit, skipLocalDraw = false) {
        if (!state.activeLayerId || !state.layerCanvases[state.activeLayerId]) return;

        // Prevent drawing on hidden layer
        if (!state.layerCanvases[state.activeLayerId].visible) {
            if (emit) {
                this.showForbiddenIcon(x1, y1);
            }
            return;
        }

        if (!skipLocalDraw) {
            const targetCtx = state.layerCanvases[state.activeLayerId].ctx;
            performDraw(targetCtx, x0, y0, x1, y1, color, size, opacity, tool);
            this.render();
        }

        if (emit) {
            socket.emit('draw', {
                roomCode: state.currentRoom,
                x0, y0, x1, y1,
                color, size, opacity, tool,
                strokeId: state.currentStrokeId,
                layerId: state.activeLayerId
            });
        }
    }

    updatePreview() {
        this.previewCtx.clearRect(0, 0, 800, 600);
        if (this.currentPath.length < 1) return;
        
        const color = penColorInput.value;
        const size = penSizeInput.value;
        const opacity = penOpacityInput.value;
        
        this.previewCtx.beginPath();
        this.previewCtx.moveTo(this.currentPath[0].x, this.currentPath[0].y);
        
        if (this.currentPath.length === 1) {
            // Draw a dot if only one point
            this.previewCtx.lineTo(this.currentPath[0].x, this.currentPath[0].y);
        } else {
            for (let i = 1; i < this.currentPath.length; i++) {
                this.previewCtx.lineTo(this.currentPath[i].x, this.currentPath[i].y);
            }
        }
        
        this.previewCtx.lineCap = 'round';
        this.previewCtx.lineJoin = 'round';
        this.previewCtx.lineWidth = size;
        this.previewCtx.strokeStyle = color;
        this.previewCtx.globalAlpha = opacity;
        this.previewCtx.stroke();
        
        this.render();
    }

    handleWheel(e) {
        if (e.ctrlKey) {
            e.preventDefault();
            const delta = Math.sign(e.deltaY) * -5; // Up is positive (increase size)
            let newSize = parseInt(penSizeInput.value) + delta;

            // Clamp size
            newSize = Math.max(parseInt(penSizeInput.min), Math.min(parseInt(penSizeInput.max), newSize));

            penSizeInput.value = newSize;

            // Trigger input event to update preview
            penSizeInput.dispatchEvent(new Event('input'));
            return;
        }
        if (e.altKey) {
            e.preventDefault();
            const delta = Math.sign(e.deltaY) * -0.1; // Up is positive (increase opacity)
            let newOpacity = parseFloat(penOpacityInput.value) + delta;

            // Clamp opacity
            newOpacity = Math.max(parseFloat(penOpacityInput.min), Math.min(parseFloat(penOpacityInput.max), newOpacity));

            // Round to 1 decimal place
            newOpacity = Math.round(newOpacity * 10) / 10;

            penOpacityInput.value = newOpacity;

            // Trigger input event to update preview
            penOpacityInput.dispatchEvent(new Event('input'));
            return;
        }
        this.cameraManager.handleWheel(e);
    }

    handleMouseDown(e) {
        if (e.button === 1 || (e.button === 0 && e.altKey)) { // Middle click or Alt+Click
            state.isPanning = true;
            state.startPanX = e.clientX;
            state.startPanY = e.clientY;
            e.preventDefault();
            return;
        }

        // Restriction: Spectators cannot draw
        if (state.isSpectator) return;

        // Restriction: Only drawer can draw during game
        if (state.currentGameState === 'PLAYING' && socket.id !== state.currentDrawerId && state.settings.mode !== 'creative') {
            return;
        }

        const { x, y } = this.getMousePos(e);

        if (state.currentTool === 'pipette') {
            this.toolsManager.handlePipette(x, y);
            return;
        }

        if (state.currentTool === 'selection') {
            handleSelectionMouseDown(e, x, y);
            return;
        }

        if (state.currentTool === 'fill') {
            const color = penColorInput.value;

            if (state.activeLayerId && state.layerCanvases[state.activeLayerId]) {
                // Prevent filling on hidden layer
                if (!state.layerCanvases[state.activeLayerId].visible) {
                    this.showForbiddenIcon(x, y);
                    return;
                }

                performFloodFill(state.layerCanvases[state.activeLayerId].ctx, 800, 600, Math.floor(x), Math.floor(y), color);
                this.render();

                socket.emit('draw', {
                    roomCode: state.currentRoom,
                    tool: 'fill',
                    x0: Math.floor(x),
                    y0: Math.floor(y),
                    color: color,
                    strokeId: Date.now() + Math.random(),
                    layerId: state.activeLayerId
                });
            }
            return;
        }

        state.isDrawing = true;
        state.hasMoved = false;
        state.currentStrokeId = Date.now() + Math.random();

        state.lastX = x;
        state.lastY = y;
        state.shapeStartX = x;
        state.shapeStartY = y;

        // Draw immediately for pen/eraser to avoid delay feeling
        if (['pen', 'eraser'].includes(state.currentTool)) {
            const color = penColorInput.value;
            const size = penSizeInput.value;
            const opacity = penOpacityInput.value;
            
            // Use buffering for transparent pen to avoid accumulation
            if (state.currentTool === 'pen' && opacity < 1) {
                this.isBuffering = true;
                this.currentPath = [{x, y}];
                this.updatePreview();
                // Emit only, skip local draw on layer
                this.drawOnCanvas(x, y, x, y, color, size, opacity, state.currentTool, true, true);
            } else {
                this.drawOnCanvas(x, y, x, y, color, size, opacity, state.currentTool, true);
            }
        }
    }

    handleMouseMove(e) {
        const { x, y } = this.getMousePos(e);

        // Update local cursor position
        if (localCursor) {
            localCursor.style.left = `${e.clientX}px`;
            localCursor.style.top = `${e.clientY}px`;
        }

        // Cursor Tracking
        if (!state.isSpectator && (state.currentGameState !== 'PLAYING' || socket.id === state.currentDrawerId)) {
            this.cursorManager.emitCursorMove(x, y);
        }

        if (state.isPanning) {
            const dx = e.clientX - state.startPanX;
            const dy = e.clientY - state.startPanY;
            this.cameraManager.pan(dx, dy);
            state.startPanX = e.clientX;
            state.startPanY = e.clientY;
            return;
        }

        if (state.currentTool === 'selection') {
            handleSelectionMouseMove(e, x, y);
            return;
        }

        if (!state.isDrawing) return;
        if (state.currentTool === 'fill') return;

        // Throttling for airbrush to prevent excessive density
        if (state.currentTool === 'airbrush') {
            const dist = Math.sqrt((x - state.lastX) ** 2 + (y - state.lastY) ** 2);
            const currentSize = parseInt(penSizeInput.value) || 10;
            // Only draw if we moved enough (based on size) to avoid over-saturation
            if (dist < Math.max(5, currentSize / 3)) return;
        }

        state.hasMoved = true;

        const color = penColorInput.value;
        let size = penSizeInput.value;
        const opacity = penOpacityInput.value;

        if (['rectangle', 'circle', 'triangle', 'line'].includes(state.currentTool)) {
            // Preview shape
            this.render();
            performDraw(ctx, state.shapeStartX, state.shapeStartY, x, y, color, size, opacity, state.currentTool);
        } else if (this.isBuffering) {
            // Add point to path and update preview
            this.currentPath.push({x, y});
            this.updatePreview();
            // Emit segment, but skip local draw on layer
            this.drawOnCanvas(state.lastX, state.lastY, x, y, color, size, opacity, state.currentTool, true, true);
            state.lastX = x;
            state.lastY = y;
        } else {
            this.drawOnCanvas(state.lastX, state.lastY, x, y, color, size, opacity, state.currentTool, true);
            state.lastX = x;
            state.lastY = y;
        }
    }

    handleMouseUp(e) {
        state.isPanning = false;
        const { x, y } = this.getMousePos(e);

        if (state.currentTool === 'selection') {
            handleSelectionMouseUp(e, x, y);
            return;
        }

        if (state.isDrawing) {
            const color = penColorInput.value;
            const size = penSizeInput.value;
            const opacity = penOpacityInput.value;

            if (['rectangle', 'circle', 'triangle', 'line'].includes(state.currentTool) && state.hasMoved) {
                // Finalize shape
                this.drawOnCanvas(state.shapeStartX, state.shapeStartY, x, y, color, size, opacity, state.currentTool, true);
            } else if (this.isBuffering) {
                // Commit buffered stroke to layer
                if (state.activeLayerId && state.layerCanvases[state.activeLayerId]) {
                    const targetCtx = state.layerCanvases[state.activeLayerId].ctx;
                    // Ensure we use source-over when committing the buffer
                    const prevGCO = targetCtx.globalCompositeOperation;
                    targetCtx.globalCompositeOperation = 'source-over';
                    targetCtx.drawImage(this.previewCanvas, 0, 0);
                    targetCtx.globalCompositeOperation = prevGCO; // Restore just in case, though usually we want source-over
                }
                
                this.previewCtx.clearRect(0, 0, 800, 600);
                this.isBuffering = false;
                this.currentPath = [];
                this.render();
            } else if (!state.hasMoved && state.currentTool !== 'fill' && !['rectangle', 'circle', 'triangle', 'line', 'pen', 'eraser'].includes(state.currentTool)) {
                // Dot for tools that didn't draw on mousedown (e.g. airbrush)
                this.drawOnCanvas(state.lastX, state.lastY, state.lastX, state.lastY, color, size, opacity, state.currentTool, true);
            }
        }
        state.isDrawing = false;
        state.canvasSnapshot = null;
    }

    handleMouseOut() {
        state.isPanning = false;
        if (localCursor) localCursor.classList.add('hidden');
    }

    handleMouseEnter() {
        if (localCursor) localCursor.classList.remove('hidden');
    }

    handleTouch(e) {
        if (e.type !== 'touchend' && e.touches.length !== 1) return;
        if (e.cancelable) e.preventDefault();

        const touch = e.type === 'touchend' ? e.changedTouches[0] : e.touches[0];
        const typeMap = {
            'touchstart': 'mousedown',
            'touchmove': 'mousemove',
            'touchend': 'mouseup'
        };

        const mouseEvent = new MouseEvent(typeMap[e.type], {
            clientX: touch.clientX,
            clientY: touch.clientY,
            button: 0,
            bubbles: true,
            cancelable: true,
            view: window
        });

        canvas.dispatchEvent(mouseEvent);
    }
}
