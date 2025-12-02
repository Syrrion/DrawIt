import {
    toolPenBtn, toolEraserBtn, toolFillBtn, toolSmudgeBtn, toolAirbrushBtn,
    toolPipetteBtn, toolSelectionBtn,
    toolRectBtn, toolCircleBtn, toolTriangleBtn, toolLineBtn,
    btnUndo, btnRedo, btnHelp,
    helpModal, btnCloseHelp,
    canvas, socket, penColorInput, currentColorPreview,
    localCursor, cursorBrushPreview, cursorIcon, penSizeInput, penOpacityInput
} from './dom-elements.js';
import { state } from './state.js';
import { showToast, rgbToHex, getContrastColor, calculateBrushSize } from './utils.js';
import { deleteSelection } from './selection-manager.js';
import { Modal } from './components/modal.js';

import { CANVAS_CONFIG, BASE_DIMENSIONS } from './config.js';

export class ToolsManager {
    constructor(getZoom) {
        this.getZoom = getZoom;
        this.previousTool = null;
        
        const scaleFactor = 1;
        
        this.toolSizes = {
            pen: 25 * scaleFactor,
            airbrush: 140 * scaleFactor,
            eraser: 140 * scaleFactor,
            fill: 5 * scaleFactor,
            smudge: 140 * scaleFactor,
            pipette: 5 * scaleFactor,
            selection: 5 * scaleFactor,
            rectangle: 30 * scaleFactor,
            circle: 30 * scaleFactor,
            triangle: 30 * scaleFactor,
            line: 30 * scaleFactor
        };

        this.toolOpacities = {
            pen: 1,
            airbrush: 1,
            eraser: 1,
            fill: 1,
            smudge: 0.75,
            pipette: 1,
            selection: 1,
            rectangle: 1,
            circle: 1,
            triangle: 1,
            line: 1
        };

        this.init();
    }

    updateSliderBackground(slider) {
        if (!slider) return;

        if (slider.disabled) {
            slider.style.background = 'rgba(255, 255, 255, 0.1)';
            return;
        }

        const min = parseFloat(slider.min) || 0;
        const max = parseFloat(slider.max) || 100;
        const val = parseFloat(slider.value) || 0;
        
        // Thumb width from CSS (16px)
        const thumbWidth = 16; 
        const width = slider.offsetWidth;
        
        let percentage;
        
        if (width && width > thumbWidth) {
            const ratio = (val - min) / (max - min);
            // Calculate the center position of the thumb
            const centerPosition = (thumbWidth / 2) + (ratio * (width - thumbWidth));
            percentage = (centerPosition / width) * 100;
        } else {
            // Fallback
            percentage = ((val - min) / (max - min)) * 100;
        }
        
        slider.style.background = `linear-gradient(to right, var(--primary) 0%, var(--primary) ${percentage}%, rgba(255, 255, 255, 0.1) ${percentage}%, rgba(255, 255, 255, 0.1) 100%)`;
    }

    updateUndoRedoState(canUndo, canRedo) {
        btnUndo.disabled = !canUndo;
        btnRedo.disabled = !canRedo;
    }

    init() {
        // Initialize sliders with ResizeObserver for robust sizing
        const resizeObserver = new ResizeObserver(entries => {
            for (let entry of entries) {
                this.updateSliderBackground(entry.target);
            }
        });

        resizeObserver.observe(penSizeInput);
        if (penOpacityInput) resizeObserver.observe(penOpacityInput);

        penSizeInput.addEventListener('input', () => {
            this.toolSizes[state.currentTool] = parseInt(penSizeInput.value, 10);
            this.updateBrushPreview();
            this.updateSliderBackground(penSizeInput);
        });

        if (penOpacityInput) {
            penOpacityInput.addEventListener('input', () => {
                if (this.toolOpacities[state.currentTool] !== undefined) {
                    this.toolOpacities[state.currentTool] = parseFloat(penOpacityInput.value);
                }
                this.updateSliderBackground(penOpacityInput);
            });
        }

        // Listen for color changes to update cursor contrast
        if (penColorInput) {
            penColorInput.addEventListener('input', () => {
                this.updateCursorColor(penColorInput.value);
            });
            penColorInput.addEventListener('change', () => {
                this.updateCursorColor(penColorInput.value);
            });
        }

        // Help Modal
        this.helpModalInstance = new Modal(helpModal, {
            closeBtn: btnCloseHelp
        });

        // --- Shortcuts ---
        window.addEventListener('keydown', (e) => {
            // Ignore if typing in input
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

            // Ctrl + Z for Undo
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
                e.preventDefault();
                if (state.isUndoRedoProcessing) return;
                if (e.shiftKey) {
                    if (!btnRedo.disabled) {
                        state.isUndoRedoProcessing = true;
                        socket.emit('redo', state.currentRoom);
                    }
                } else {
                    if (!btnUndo.disabled) {
                        state.isUndoRedoProcessing = true;
                        socket.emit('undo', state.currentRoom);
                    }
                }
            }

            // Ctrl + Y for Redo
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
                e.preventDefault();
                if (state.isUndoRedoProcessing) return;
                if (!btnRedo.disabled) {
                    state.isUndoRedoProcessing = true;
                    socket.emit('redo', state.currentRoom);
                }
            }

            // Tool Shortcuts
            const code = e.code;
            if (code === 'Delete') {
                deleteSelection();
            }
            if (code === 'Digit1' || code === 'Numpad1') { state.currentTool = 'pen'; this.updateActiveTool(toolPenBtn); }
            else if (code === 'Digit2' || code === 'Numpad2') { state.currentTool = 'airbrush'; this.updateActiveTool(toolAirbrushBtn); }
            else if (code === 'Digit3' || code === 'Numpad3') { state.currentTool = 'fill'; this.updateActiveTool(toolFillBtn); }
            else if (code === 'Digit4' || code === 'Numpad4') { state.currentTool = 'smudge'; this.updateActiveTool(toolSmudgeBtn); }
            else if (code === 'Digit5' || code === 'Numpad5') { state.currentTool = 'eraser'; this.updateActiveTool(toolEraserBtn); }
            else if (code === 'Digit6' || code === 'Numpad6') { state.currentTool = 'pipette'; this.updateActiveTool(toolPipetteBtn); }
            else if (code === 'Digit7' || code === 'Numpad7') { state.currentTool = 'selection'; this.updateActiveTool(toolSelectionBtn); }
            else if (code === 'Digit8' || code === 'Numpad8') { state.currentTool = 'rectangle'; this.updateActiveTool(toolRectBtn); }
            else if (code === 'Digit9' || code === 'Numpad9') { state.currentTool = 'circle'; this.updateActiveTool(toolCircleBtn); }
            else if (code === 'Digit0' || code === 'Numpad0') { state.currentTool = 'triangle'; this.updateActiveTool(toolTriangleBtn); }
            else if (code === 'Minus' || code === 'NumpadSubtract') { state.currentTool = 'line'; this.updateActiveTool(toolLineBtn); }
        });

        // --- Tool Selection ---

        toolPenBtn.addEventListener('click', () => {
            state.currentTool = 'pen';
            this.updateActiveTool(toolPenBtn);
        });

        toolAirbrushBtn.addEventListener('click', () => {
            state.currentTool = 'airbrush';
            this.updateActiveTool(toolAirbrushBtn);
        });

        toolFillBtn.addEventListener('click', () => {
            state.currentTool = 'fill';
            this.updateActiveTool(toolFillBtn);
        });

        toolSmudgeBtn.addEventListener('click', () => {
            state.currentTool = 'smudge';
            this.updateActiveTool(toolSmudgeBtn);
        });

        toolEraserBtn.addEventListener('click', () => {
            state.currentTool = 'eraser';
            this.updateActiveTool(toolEraserBtn);
        });

        toolPipetteBtn.addEventListener('click', () => {
            state.currentTool = 'pipette';
            this.updateActiveTool(toolPipetteBtn);
        });

        toolSelectionBtn.addEventListener('click', () => {
            state.currentTool = 'selection';
            this.updateActiveTool(toolSelectionBtn);
        });

        toolRectBtn.addEventListener('click', () => {
            state.currentTool = 'rectangle';
            this.updateActiveTool(toolRectBtn);
        });

        toolCircleBtn.addEventListener('click', () => {
            state.currentTool = 'circle';
            this.updateActiveTool(toolCircleBtn);
        });

        toolTriangleBtn.addEventListener('click', () => {
            state.currentTool = 'triangle';
            this.updateActiveTool(toolTriangleBtn);
        });

        toolLineBtn.addEventListener('click', () => {
            state.currentTool = 'line';
            this.updateActiveTool(toolLineBtn);
        });

        // --- Pipette Logic (Shift Key) ---

        window.addEventListener('keydown', (e) => {
            if (e.key === 'Shift' && !e.repeat && state.currentTool !== 'pipette') {
                this.previousTool = state.currentTool;
                state.currentTool = 'pipette';

                // Restore pipette size
                if (this.toolSizes['pipette']) {
                    penSizeInput.value = this.toolSizes['pipette'];
                    this.updateSliderBackground(penSizeInput);
                }

                // Update cursor icon for pipette
                const svg = toolPipetteBtn.querySelector('svg');
                if (svg && cursorIcon) {
                    cursorIcon.innerHTML = svg.outerHTML;
                }
                this.updateBrushPreview();

                // Force crosshair cursor for pipette
                canvas.style.cursor = 'crosshair';
            }
        });

        window.addEventListener('keyup', (e) => {
            if (e.key === 'Shift' && this.previousTool) {
                state.currentTool = this.previousTool;
                
                // Restore previous tool size
                if (this.toolSizes[state.currentTool]) {
                    penSizeInput.value = this.toolSizes[state.currentTool];
                    this.updateSliderBackground(penSizeInput);
                }

                this.previousTool = null;

                // Restore cursor icon
                const activeBtn = document.querySelector('.tool-btn.active');
                if (activeBtn) {
                    const svg = activeBtn.querySelector('svg');
                    if (svg && cursorIcon) {
                        cursorIcon.innerHTML = svg.outerHTML;
                    }
                }
                this.updateBrushPreview();
            }
        });

        // --- Actions ---

        btnUndo.addEventListener('click', () => {
            if (state.isUndoRedoProcessing) return;
            if (!btnUndo.disabled) {
                state.isUndoRedoProcessing = true;
                socket.emit('undo', state.currentRoom);
            }
        });

        btnRedo.addEventListener('click', () => {
            if (state.isUndoRedoProcessing) return;
            if (!btnRedo.disabled) {
                state.isUndoRedoProcessing = true;
                socket.emit('redo', state.currentRoom);
            }
        });

        btnHelp.addEventListener('click', () => {
            this.helpModalInstance.open();
        });

        // Initialize default tool state
        this.updateActiveTool(toolPenBtn);
        
        // Initialize Undo/Redo buttons as disabled
        this.updateUndoRedoState(false, false);
    }

    updateActiveTool(activeBtn) {
        [toolPenBtn, toolEraserBtn, toolFillBtn, toolSmudgeBtn, toolAirbrushBtn, toolPipetteBtn, toolSelectionBtn, toolRectBtn, toolCircleBtn, toolTriangleBtn, toolLineBtn].forEach(btn => btn.classList.remove('active'));
        activeBtn.classList.add('active');

        // Update cursor icon
        const svg = activeBtn.querySelector('svg');
        if (svg && cursorIcon) {
            cursorIcon.innerHTML = svg.outerHTML;
            this.updateCursorColor(penColorInput.value);
        }

        // Restore tool size
        if (this.toolSizes[state.currentTool]) {
            penSizeInput.value = this.toolSizes[state.currentTool];
            this.updateSliderBackground(penSizeInput);
        }

        // Restore tool opacity
        if (this.toolOpacities[state.currentTool] !== undefined && penOpacityInput) {
            penOpacityInput.value = this.toolOpacities[state.currentTool];
            this.updateSliderBackground(penOpacityInput);
        }

        // Disable sliders for specific tools
        const disableSize = ['pipette', 'selection', 'fill'].includes(state.currentTool);
        const disableOpacity = ['pipette', 'selection'].includes(state.currentTool);

        if (penSizeInput) {
            penSizeInput.disabled = disableSize;
            const row = penSizeInput.closest('.slider-row');
            if (row) {
                if (disableSize) row.classList.add('disabled-slider');
                else row.classList.remove('disabled-slider');
            }
            // Remove inline styles if they exist
            penSizeInput.parentElement.style.opacity = '';
            penSizeInput.parentElement.style.pointerEvents = '';
            this.updateSliderBackground(penSizeInput);
        }

        if (penOpacityInput) {
            penOpacityInput.disabled = disableOpacity;
            const row = penOpacityInput.closest('.slider-row');
            if (row) {
                if (disableOpacity) row.classList.add('disabled-slider');
                else row.classList.remove('disabled-slider');
            }
            penOpacityInput.parentElement.style.opacity = '';
            penOpacityInput.parentElement.style.pointerEvents = '';
            this.updateSliderBackground(penOpacityInput);
        }

        // Update brush preview visibility
        this.updateBrushPreview();

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

    updateBrushPreview() {
        if (!cursorBrushPreview) return;

        let size = calculateBrushSize(parseInt(penSizeInput.value, 10) || 10);
        
        // Apply zoom scaling if available
        if (this.getZoom) {
            size *= this.getZoom();
        }

        const toolsWithBrush = ['pen', 'eraser', 'airbrush', 'smudge'];

        if (toolsWithBrush.includes(state.currentTool)) {
            cursorBrushPreview.style.display = 'block';
            cursorBrushPreview.style.width = `${size}px`;
            cursorBrushPreview.style.height = `${size}px`;

            // Adjust for smudge which is larger
            if (state.currentTool === 'smudge') {
                // Smudge might need different scaling if its logic is different, 
                // but usually it follows the brush size.
                // If effectiveSize was meant to be different, it should be calculated here.
                // Assuming effectiveSize = size for now as per previous code logic structure
                // (previous code had: const effectiveSize = size; ... width = effectiveSize)
            }
        } else {
            cursorBrushPreview.style.display = 'none';
        }
    }

    handlePipette(x, y) {
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
        if (currentColorPreview) {
            currentColorPreview.style.backgroundColor = hex;
        }

        // Dispatch input event to update ColorPickerManager
        penColorInput.dispatchEvent(new Event('input'));

        // Update cursor icon background
        this.updateCursorColor(hex);

        // Optional: Switch back to previous tool or pen
        // state.currentTool = 'pen';
        // updateActiveTool(toolPenBtn);
    }

    updateCursorColor(hex) {
        if (!cursorIcon) return;
        
        // Ensure hex is valid, default to black if empty
        if (!hex) hex = '#000000';

        cursorIcon.style.backgroundColor = hex;
        
        const contrastColor = getContrastColor(hex);
        cursorIcon.style.color = contrastColor;
        
        // Force SVG stroke/fill update if needed
        const svg = cursorIcon.querySelector('svg');
        if (svg) {
            svg.style.stroke = contrastColor;
            svg.style.fill = 'none'; // Ensure fill doesn't interfere unless intended
        }
    }
}
