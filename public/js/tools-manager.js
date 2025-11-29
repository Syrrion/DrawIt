import {
    toolPenBtn, toolEraserBtn, toolFillBtn, toolSmudgeBtn, toolAirbrushBtn,
    toolPipetteBtn, toolSelectionBtn,
    toolRectBtn, toolCircleBtn, toolTriangleBtn, toolLineBtn,
    btnUndo, btnRedo, btnHelp, clearBtn,
    helpModal, btnCloseHelp,
    canvas, socket, penColorInput, currentColorPreview,
    localCursor, cursorBrushPreview, cursorIcon, penSizeInput, penOpacityInput
} from './dom-elements.js';
import { state } from './state.js';
import { showToast, rgbToHex, getContrastColor } from './utils.js';
import { deleteSelection } from './selection-manager.js';
import { Modal } from './components/modal.js';

export class ToolsManager {
    constructor() {
        this.previousTool = null;
        this.toolSizes = {
            pen: 10,
            airbrush: 100,
            eraser: 100,
            fill: 5,
            smudge: 5,
            pipette: 5,
            selection: 5,
            rectangle: 5,
            circle: 5,
            triangle: 5,
            line: 5
        };
        this.init();
    }

    updateSliderBackground(slider) {
        if (!slider) return;
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
            socket.emit('undo', state.currentRoom);
        });

        btnRedo.addEventListener('click', () => {
            socket.emit('redo', state.currentRoom);
        });

        btnHelp.addEventListener('click', () => {
            this.helpModalInstance.open();
        });

        clearBtn.addEventListener('click', () => {
            window.showClearOptionsModal(
                // On Clear Layer
                () => {
                    if (state.activeLayerId && state.layerCanvases[state.activeLayerId]) {
                        const ctx = state.layerCanvases[state.activeLayerId].ctx;
                        ctx.clearRect(0, 0, canvas.width, canvas.height);

                        socket.emit('clearLayer', {
                            roomCode: state.currentRoom,
                            layerId: state.activeLayerId
                        });

                        canvas.dispatchEvent(new CustomEvent('request-render'));
                        showToast('Calque effacé !', 'success');
                    } else {
                        showToast('Aucun calque actif', 'error');
                    }
                },
                // On Clear All
                () => {
                    Object.values(state.layerCanvases).forEach(l => {
                        l.ctx.clearRect(0, 0, canvas.width, canvas.height);
                    });

                    socket.emit('clearCanvas', state.currentRoom);
                    canvas.dispatchEvent(new CustomEvent('request-render'));
                    showToast('Tout effacé !', 'success');
                }
            );
        });

        // Initialize default tool state
        this.updateActiveTool(toolPenBtn);
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

        const size = parseInt(penSizeInput.value, 10);
        const toolsWithBrush = ['pen', 'eraser', 'airbrush', 'smudge'];

        if (toolsWithBrush.includes(state.currentTool)) {
            cursorBrushPreview.style.display = 'block';
            cursorBrushPreview.style.width = `${size}px`;
            cursorBrushPreview.style.height = `${size}px`;

            // Adjust for smudge which is larger
            if (state.currentTool === 'smudge') {
                const effectiveSize = size;
                cursorBrushPreview.style.width = `${effectiveSize}px`;
                cursorBrushPreview.style.height = `${effectiveSize}px`;
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
