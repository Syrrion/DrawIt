import { 
    canvas, ctx, penColorInput, penSizeInput, penOpacityInput, socket,
    localCursor
} from './dom-elements.js';
import { state } from './state.js';
import { performDraw, performFloodFill } from './draw.js';
import { handlePipette } from './tools-manager.js';
import { handleSelectionMouseDown, handleSelectionMouseMove, handleSelectionMouseUp, drawSelectionOverlay } from './selection-manager.js';

export function render() {
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
}

export function initCanvasManager(cursorManager, cameraManager) {
    canvas.width = 800;
    canvas.height = 600;

    let lastForbiddenTime = 0;
    function showForbiddenIcon(canvasX, canvasY) {
        const now = Date.now();
        if (now - lastForbiddenTime < 500) return; // Throttle to avoid spamming
        lastForbiddenTime = now;

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

    function getMousePos(e) {
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        
        return {
            x: (e.clientX - rect.left) * scaleX,
            y: (e.clientY - rect.top) * scaleY
        };
    }

    function drawOnCanvas(x0, y0, x1, y1, color, size, opacity, tool, emit) {
        if (!state.activeLayerId || !state.layerCanvases[state.activeLayerId]) return;
        
        // Prevent drawing on hidden layer
        if (!state.layerCanvases[state.activeLayerId].visible) {
            if (emit) {
                showForbiddenIcon(x1, y1);
            }
            return;
        }

        const targetCtx = state.layerCanvases[state.activeLayerId].ctx;
        performDraw(targetCtx, x0, y0, x1, y1, color, size, opacity, tool);
        render();

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

    canvas.addEventListener('wheel', (e) => {
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
        cameraManager.handleWheel(e);
    });

    canvas.addEventListener('mousedown', (e) => {
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
        if (state.currentGameState === 'PLAYING' && socket.id !== state.currentDrawerId) {
            return;
        }

        const { x, y } = getMousePos(e);

        if (state.currentTool === 'pipette') {
            handlePipette(x, y);
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
                    showForbiddenIcon(x, y);
                    return;
                }

                performFloodFill(state.layerCanvases[state.activeLayerId].ctx, 800, 600, Math.floor(x), Math.floor(y), color);
                render();
                
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
    });

    canvas.addEventListener('mousemove', (e) => {
        const { x, y } = getMousePos(e);
        
        // Update local cursor position
        if (localCursor) {
            localCursor.style.left = `${e.clientX}px`;
            localCursor.style.top = `${e.clientY}px`;
        }

        // Cursor Tracking
        if (!state.isSpectator && (state.currentGameState !== 'PLAYING' || socket.id === state.currentDrawerId)) {
            cursorManager.emitCursorMove(x, y);
        }

        if (state.isPanning) {
            const dx = e.clientX - state.startPanX;
            const dy = e.clientY - state.startPanY;
            cameraManager.pan(dx, dy);
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
        
        state.hasMoved = true;
        
        const color = penColorInput.value;
        let size = penSizeInput.value;
        const opacity = penOpacityInput.value;

        if (['rectangle', 'circle', 'triangle', 'line'].includes(state.currentTool)) {
            // Preview shape
            render();
            performDraw(ctx, state.shapeStartX, state.shapeStartY, x, y, color, size, opacity, state.currentTool);
        } else {
            drawOnCanvas(state.lastX, state.lastY, x, y, color, size, opacity, state.currentTool, true);
            state.lastX = x;
            state.lastY = y;
        }
    });

    window.addEventListener('mouseup', (e) => {
        state.isPanning = false;
        const { x, y } = getMousePos(e);

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
                drawOnCanvas(state.shapeStartX, state.shapeStartY, x, y, color, size, opacity, state.currentTool, true);
            } else if (!state.hasMoved && state.currentTool !== 'fill' && !['rectangle', 'circle', 'triangle', 'line'].includes(state.currentTool)) {
                // Dot for pen/eraser
                drawOnCanvas(state.lastX, state.lastY, state.lastX, state.lastY, color, size, opacity, state.currentTool, true);
            }
        }
        state.isDrawing = false;
        state.canvasSnapshot = null;
    });

    canvas.addEventListener('mouseout', () => {
        state.isPanning = false;
        if (localCursor) localCursor.classList.add('hidden');
    });

    canvas.addEventListener('mouseenter', () => {
        if (localCursor) localCursor.classList.remove('hidden');
    });

    // Touch Support
    function handleTouch(e) {
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

    canvas.addEventListener('touchstart', handleTouch, { passive: false });
    canvas.addEventListener('touchmove', handleTouch, { passive: false });
    canvas.addEventListener('touchend', handleTouch, { passive: false });

    canvas.addEventListener('contextmenu', e => e.preventDefault());
}
