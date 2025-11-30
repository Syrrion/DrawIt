import {
    canvas, ctx, penColorInput, penSizeInput, penOpacityInput, socket,
    localCursor
} from './dom-elements.js';
import { state } from './state.js';
import { calculateBrushSize } from './utils.js';
import { performDraw, performFloodFill } from './draw.js';
import { handleSelectionMouseDown, handleSelectionMouseMove, handleSelectionMouseUp, drawSelectionOverlay, setRenderCallback } from './selection-manager.js';
import { CANVAS_CONFIG } from './config.js';

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
            if (state.currentTool === 'eraser') {
                ctx.save();
                ctx.globalCompositeOperation = 'destination-out';
                ctx.drawImage(this.previewCanvas, 0, 0);
                ctx.restore();
            } else {
                ctx.drawImage(this.previewCanvas, 0, 0);
            }
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

        canvas.width = CANVAS_CONFIG.width;
        canvas.height = CANVAS_CONFIG.height;

        // Preview canvas for buffering strokes
        this.previewCanvas = document.createElement('canvas');
        this.previewCanvas.width = CANVAS_CONFIG.width;
        this.previewCanvas.height = CANVAS_CONFIG.height;
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

        // Track global mouse position for entry interpolation
        window.addEventListener('mousemove', this.handleGlobalMouseMove.bind(this));

        // Initialize camera transform to ensure correct zoom level on load
        this.cameraManager.updateCameraTransform();
    }

    handleGlobalMouseMove(e) {
        this.lastGlobalX = e.clientX;
        this.lastGlobalY = e.clientY;
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
        this.previewCtx.clearRect(0, 0, CANVAS_CONFIG.width, CANVAS_CONFIG.height);
        if (this.currentPath.length < 1) return;
        
        const color = penColorInput.value;
        const size = calculateBrushSize(parseInt(penSizeInput.value, 10) || 10);
        const opacity = penOpacityInput.value;
        
        this.previewCtx.beginPath();
        
        // Find first valid point
        let startIndex = 0;
        while(startIndex < this.currentPath.length && this.currentPath[startIndex] === null) {
            startIndex++;
        }
        
        if (startIndex < this.currentPath.length) {
            this.previewCtx.moveTo(this.currentPath[startIndex].x, this.currentPath[startIndex].y);
            
            // If single point, draw a dot
            if (this.currentPath.length === startIndex + 1) {
                this.previewCtx.lineTo(this.currentPath[startIndex].x, this.currentPath[startIndex].y);
            }

            for (let i = startIndex + 1; i < this.currentPath.length; i++) {
                const point = this.currentPath[i];
                if (point === null) {
                    continue;
                }
                
                if (this.currentPath[i-1] === null) {
                    this.previewCtx.moveTo(point.x, point.y);
                } else {
                    this.previewCtx.lineTo(point.x, point.y);
                }
            }
        }
        
        this.previewCtx.lineCap = 'round';
        this.previewCtx.lineJoin = 'round';
        this.previewCtx.lineWidth = size;
        
        if (state.currentTool === 'eraser') {
            this.previewCtx.strokeStyle = 'rgba(0,0,0,1)';
        } else {
            this.previewCtx.strokeStyle = color;
        }
        
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

        if (document.body.classList.contains('tracing-mode')) return;

        // Restriction: Spectators cannot draw
        if (state.isSpectator) return;

        // Restriction: Only drawer can draw during game
        if (state.currentGameState === 'PLAYING' && socket.id !== state.currentDrawerId && state.settings.mode !== 'creative' && state.settings.mode !== 'telephone') {
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
            const opacity = penOpacityInput.value;

            if (state.activeLayerId && state.layerCanvases[state.activeLayerId]) {
                // Prevent filling on hidden layer
                if (!state.layerCanvases[state.activeLayerId].visible) {
                    this.showForbiddenIcon(x, y);
                    return;
                }

                performFloodFill(state.layerCanvases[state.activeLayerId].ctx, CANVAS_CONFIG.width, CANVAS_CONFIG.height, Math.floor(x), Math.floor(y), color, opacity);
                this.render();

                socket.emit('draw', {
                    roomCode: state.currentRoom,
                    tool: 'fill',
                    x0: Math.floor(x),
                    y0: Math.floor(y),
                    color: color,
                    opacity: opacity,
                    strokeId: 'fill-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
                    layerId: state.activeLayerId
                });
            }
            return;
        }

        state.isDrawing = true;
        state.hasMoved = false;
        state.currentStrokeId = 'stroke-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);

        state.lastX = x;
        state.lastY = y;
        state.shapeStartX = x;
        state.shapeStartY = y;

        // Draw immediately for pen/eraser to avoid delay feeling
        if (['pen', 'eraser'].includes(state.currentTool)) {
            const color = penColorInput.value;
            const size = calculateBrushSize(parseInt(penSizeInput.value, 10) || 10);
            const opacity = penOpacityInput.value;
            
            // Use buffering for transparent pen or eraser to avoid accumulation
            if ((state.currentTool === 'pen' && opacity < 1) || (state.currentTool === 'eraser' && opacity < 1)) {
                this.isBuffering = true;
                this.currentPath = [{x, y}];
                this.updatePreview();
                // Emit only, skip local draw on layer
                this.drawOnCanvas(x, y, x, y, color, size, opacity, state.currentTool, true, true);
            } else {
                this.drawOnCanvas(x, y, x, y, color, size, opacity, state.currentTool, true);
            }
        } else if (state.currentTool === 'fill') {
             // Fill doesn't use drawOnCanvas but emits manually.
             // We need to ensure it has a strokeId too if we want to undo it.
             // It is handled in handleMouseDown.
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
            const currentSize = calculateBrushSize(parseInt(penSizeInput.value, 10)) || 10;
            // Only draw if we moved enough (based on size) to avoid over-saturation
            if (dist < Math.max(5, currentSize / 3)) return;
        }

        state.hasMoved = true;

        const color = penColorInput.value;
        let size = calculateBrushSize(parseInt(penSizeInput.value, 10) || 10);
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
            const size = calculateBrushSize(parseInt(penSizeInput.value, 10) || 10);
            const opacity = penOpacityInput.value;

            if (['rectangle', 'circle', 'triangle', 'line'].includes(state.currentTool) && state.hasMoved) {
                // Finalize shape
                this.drawOnCanvas(state.shapeStartX, state.shapeStartY, x, y, color, size, opacity, state.currentTool, true);
            } else if (this.isBuffering) {
                // Commit buffered stroke to layer
                if (state.activeLayerId && state.layerCanvases[state.activeLayerId]) {
                    const targetCtx = state.layerCanvases[state.activeLayerId].ctx;
                    
                    if (state.currentTool === 'eraser') {
                        const prevGCO = targetCtx.globalCompositeOperation;
                        targetCtx.globalCompositeOperation = 'destination-out';
                        targetCtx.drawImage(this.previewCanvas, 0, 0);
                        targetCtx.globalCompositeOperation = prevGCO;
                    } else {
                        // Ensure we use source-over when committing the buffer
                        const prevGCO = targetCtx.globalCompositeOperation;
                        targetCtx.globalCompositeOperation = 'source-over';
                        targetCtx.drawImage(this.previewCanvas, 0, 0);
                        targetCtx.globalCompositeOperation = prevGCO; 
                    }
                }
                
                this.previewCtx.clearRect(0, 0, CANVAS_CONFIG.width, CANVAS_CONFIG.height);
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

    handleMouseEnter(e) {
        if (localCursor) localCursor.classList.remove('hidden');

        // Allow drawing if entering with mouse down
        if (e.buttons === 1 && !state.isDrawing) {
            this.handleMouseDown(e);
        }

        if (state.isDrawing && ['pen', 'eraser', 'airbrush', 'smudge'].includes(state.currentTool)) {
            const { x, y } = this.getMousePos(e);
            let startX = x;
            let startY = y;

            // Interpolate entry point if moving fast
            if (this.lastGlobalX !== undefined && this.lastGlobalY !== undefined) {
                const prevPos = this.getMousePos({ clientX: this.lastGlobalX, clientY: this.lastGlobalY });
                
                // Only interpolate if previous point was outside
                if (prevPos.x < 0 || prevPos.x > canvas.width || prevPos.y < 0 || prevPos.y > canvas.height) {
                    const intersection = this.getIntersection(prevPos.x, prevPos.y, x, y);
                    if (intersection) {
                        startX = intersection.x;
                        startY = intersection.y;
                    }
                }
            }

            state.lastX = startX;
            state.lastY = startY;

            if (this.isBuffering) {
                this.currentPath.push(null);
                this.currentPath.push({x: startX, y: startY});
            }
        }
    }

    getLineIntersection(x1, y1, x2, y2, x3, y3, x4, y4) {
        const denom = (y4 - y3) * (x2 - x1) - (x4 - x3) * (y2 - y1);
        if (denom === 0) return null;
        
        const ua = ((x4 - x3) * (y1 - y3) - (y4 - y3) * (x1 - x3)) / denom;
        const ub = ((x2 - x1) * (y1 - y3) - (y2 - y1) * (x1 - x3)) / denom;
        
        if (ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1) {
            return {
                x: x1 + ua * (x2 - x1),
                y: y1 + ua * (y2 - y1)
            };
        }
        return null;
    }

    getIntersection(x1, y1, x2, y2) {
        const minX = 0, minY = 0, maxX = canvas.width, maxY = canvas.height;
        const borders = [
            { x1: minX, y1: minY, x2: maxX, y2: minY }, // Top
            { x1: maxX, y1: minY, x2: maxX, y2: maxY }, // Right
            { x1: maxX, y1: maxY, x2: minX, y2: maxY }, // Bottom
            { x1: minX, y1: maxY, x2: minX, y2: minY }  // Left
        ];

        let closest = null;
        let minDist = Infinity;

        for (const b of borders) {
            const pt = this.getLineIntersection(x1, y1, x2, y2, b.x1, b.y1, b.x2, b.y2);
            if (pt) {
                const dist = (pt.x - x1) ** 2 + (pt.y - y1) ** 2;
                if (dist < minDist) {
                    minDist = dist;
                    closest = pt;
                }
            }
        }
        return closest;
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
