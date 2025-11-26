import { 
    toolPenBtn, toolEraserBtn, toolFillBtn, toolSmudgeBtn, toolAirbrushBtn, 
    toolPipetteBtn, toolSelectionBtn,
    toolRectBtn, toolCircleBtn, toolTriangleBtn, toolLineBtn, 
    btnUndo, btnRedo, btnHelp, clearBtn,
    helpModal, btnCloseHelp,
    canvas, socket, penColorInput, colorTrigger, currentColorPreview,
    localCursor, cursorBrushPreview, cursorIcon, penSizeInput
} from './dom-elements.js';
import { state } from './state.js';
import { showToast, rgbToHex } from './utils.js';
import { deleteSelection } from './selection-manager.js';

export function initTools() {
    function updateActiveTool(activeBtn) {
        [toolPenBtn, toolEraserBtn, toolFillBtn, toolSmudgeBtn, toolAirbrushBtn, toolPipetteBtn, toolSelectionBtn, toolRectBtn, toolCircleBtn, toolTriangleBtn, toolLineBtn].forEach(btn => btn.classList.remove('active'));
        activeBtn.classList.add('active');

        // Update cursor icon
        const svg = activeBtn.querySelector('svg');
        if (svg && cursorIcon) {
            cursorIcon.innerHTML = svg.outerHTML;
        }

        // Update brush preview visibility
        updateBrushPreview();

        // Cursor Style Logic
        const toolsWithBrush = ['pen', 'eraser', 'airbrush', 'smudge'];
        
        if (toolsWithBrush.includes(state.currentTool)) {
            // Hide system cursor, show brush preview
            canvas.style.cursor = 'none';
        } else {
            // Show system crosshair, hide brush preview (handled in updateBrushPreview)
            canvas.style.cursor = 'crosshair';
        }
    }

    function updateBrushPreview() {
        if (!cursorBrushPreview) return;
        
        const size = parseInt(penSizeInput.value, 10);
        const toolsWithBrush = ['pen', 'eraser', 'airbrush', 'smudge'];
        
        if (toolsWithBrush.includes(state.currentTool)) {
            cursorBrushPreview.style.display = 'block';
            cursorBrushPreview.style.width = `${size}px`;
            cursorBrushPreview.style.height = `${size}px`;
            
            // Adjust for smudge which is larger
            if (state.currentTool === 'smudge') {
                const effectiveSize = size * 3;
                cursorBrushPreview.style.width = `${effectiveSize}px`;
                cursorBrushPreview.style.height = `${effectiveSize}px`;
            }
        } else {
            cursorBrushPreview.style.display = 'none';
        }
    }

    penSizeInput.addEventListener('input', updateBrushPreview);

    // --- Shortcuts ---
    window.addEventListener('keydown', (e) => {
        // Ignore if typing in input
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

        // Ctrl + Z for Undo
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
            e.preventDefault();
            if (e.shiftKey) {
                 socket.emit('redo', state.currentRoom);
            } else {
                 socket.emit('undo', state.currentRoom);
            }
        }
        
        // Ctrl + Y for Redo
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
            e.preventDefault();
            socket.emit('redo', state.currentRoom);
        }

        // Tool Shortcuts
        const code = e.code;
        if (code === 'Delete') {
            deleteSelection();
        }
        if (code === 'Digit1' || code === 'Numpad1') { state.currentTool = 'pen'; updateActiveTool(toolPenBtn); }
        else if (code === 'Digit2' || code === 'Numpad2') { state.currentTool = 'airbrush'; updateActiveTool(toolAirbrushBtn); }
        else if (code === 'Digit3' || code === 'Numpad3') { state.currentTool = 'fill'; updateActiveTool(toolFillBtn); }
        else if (code === 'Digit4' || code === 'Numpad4') { state.currentTool = 'smudge'; updateActiveTool(toolSmudgeBtn); }
        else if (code === 'Digit5' || code === 'Numpad5') { state.currentTool = 'eraser'; updateActiveTool(toolEraserBtn); }
        else if (code === 'Digit6' || code === 'Numpad6') { state.currentTool = 'pipette'; updateActiveTool(toolPipetteBtn); }
        else if (code === 'Digit7' || code === 'Numpad7') { state.currentTool = 'selection'; updateActiveTool(toolSelectionBtn); }
        else if (code === 'Digit8' || code === 'Numpad8') { state.currentTool = 'rectangle'; updateActiveTool(toolRectBtn); }
        else if (code === 'Digit9' || code === 'Numpad9') { state.currentTool = 'circle'; updateActiveTool(toolCircleBtn); }
        else if (code === 'Digit0' || code === 'Numpad0') { state.currentTool = 'triangle'; updateActiveTool(toolTriangleBtn); }
        else if (code === 'Minus' || code === 'NumpadSubtract') { state.currentTool = 'line'; updateActiveTool(toolLineBtn); }
    });

    // --- Tool Selection ---

    toolPenBtn.addEventListener('click', () => {
        state.currentTool = 'pen';
        updateActiveTool(toolPenBtn);
    });

    toolAirbrushBtn.addEventListener('click', () => {
        state.currentTool = 'airbrush';
        updateActiveTool(toolAirbrushBtn);
    });

    toolFillBtn.addEventListener('click', () => {
        state.currentTool = 'fill';
        updateActiveTool(toolFillBtn);
    });

    toolSmudgeBtn.addEventListener('click', () => {
        state.currentTool = 'smudge';
        updateActiveTool(toolSmudgeBtn);
    });

    toolEraserBtn.addEventListener('click', () => {
        state.currentTool = 'eraser';
        updateActiveTool(toolEraserBtn);
    });

    toolPipetteBtn.addEventListener('click', () => {
        state.currentTool = 'pipette';
        updateActiveTool(toolPipetteBtn);
    });

    toolSelectionBtn.addEventListener('click', () => {
        state.currentTool = 'selection';
        updateActiveTool(toolSelectionBtn);
    });

    toolRectBtn.addEventListener('click', () => {
        state.currentTool = 'rectangle';
        updateActiveTool(toolRectBtn);
    });

    toolCircleBtn.addEventListener('click', () => {
        state.currentTool = 'circle';
        updateActiveTool(toolCircleBtn);
    });

    toolTriangleBtn.addEventListener('click', () => {
        state.currentTool = 'triangle';
        updateActiveTool(toolTriangleBtn);
    });

    toolLineBtn.addEventListener('click', () => {
        state.currentTool = 'line';
        updateActiveTool(toolLineBtn);
    });

    // --- Pipette Logic (Shift Key) ---
    let previousTool = null;

    window.addEventListener('keydown', (e) => {
        if (e.key === 'Shift' && !e.repeat && state.currentTool !== 'pipette') {
            previousTool = state.currentTool;
            state.currentTool = 'pipette';
            
            // Update cursor icon for pipette
            const svg = toolPipetteBtn.querySelector('svg');
            if (svg && cursorIcon) {
                cursorIcon.innerHTML = svg.outerHTML;
            }
            updateBrushPreview();
            
            // Force crosshair cursor for pipette
            canvas.style.cursor = 'crosshair';
        }
    });

    window.addEventListener('keyup', (e) => {
        if (e.key === 'Shift' && previousTool) {
            state.currentTool = previousTool;
            previousTool = null;
            
            // Restore cursor icon
            const activeBtn = document.querySelector('.tool-btn.active');
            if (activeBtn) {
                const svg = activeBtn.querySelector('svg');
                if (svg && cursorIcon) {
                    cursorIcon.innerHTML = svg.outerHTML;
                }
            }
            updateBrushPreview();
        }
    });

    // --- Pipette Implementation ---
    // This function is called from draw.js or canvas-manager.js on click/mousedown
    // We need to expose it or handle it here if we attach listeners to canvas
    // But canvas listeners are likely in canvas-manager.js. 
    // Let's assume we need to handle the "pick color" action.
    
    // Actually, the best place for tool logic (what happens when you click) is usually canvas-manager.js
    // But we can export a helper here.

    // --- Actions ---

    btnUndo.addEventListener('click', () => {
        socket.emit('undo', state.currentRoom);
    });

    btnRedo.addEventListener('click', () => {
        socket.emit('redo', state.currentRoom);
    });

    btnHelp.addEventListener('click', () => {
        helpModal.classList.remove('hidden');
    });

    btnCloseHelp.addEventListener('click', () => {
        helpModal.classList.add('hidden');
    });

    // Close help on outside click
    helpModal.addEventListener('click', (e) => {
        if (e.target === helpModal) {
            helpModal.classList.add('hidden');
        }
    });

    clearBtn.addEventListener('click', () => {
        window.showConfirmModal(
            'Confirmation', 
            'Voulez-vous vraiment tout effacer ?', 
            () => {
                const ctx = canvas.getContext('2d');
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                socket.emit('clearCanvas', state.currentRoom);
                showToast('Dessin effacé !', 'success');
            }
        );
    });

    // Initialize default tool state
    updateActiveTool(toolPenBtn);
}

export function handlePipette(x, y) {
    const ctx = canvas.getContext('2d');
    const pixel = ctx.getImageData(Math.floor(x), Math.floor(y), 1, 1).data;
    // Check if transparent
    if (pixel[3] === 0) return; // Don't pick transparent

    // Convert RGB to Hex manually since utils.rgbToHex expects a string
    const r = pixel[0];
    const g = pixel[1];
    const b = pixel[2];
    const hex = "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);

    state.color = hex;
    penColorInput.value = hex;
    currentColorPreview.style.backgroundColor = hex;
    
    // If using custom color picker logic
    if (colorTrigger) {
        const preview = colorTrigger.querySelector('div');
        if (preview) preview.style.backgroundColor = hex;
    }

    // Update cursor icon background
    if (cursorIcon) {
        cursorIcon.style.backgroundColor = hex;
    }
    
    // Optional: Switch back to previous tool or pen
    // state.currentTool = 'pen';
    // updateActiveTool(toolPenBtn);
}
