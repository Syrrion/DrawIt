import { 
    toolPenBtn, toolEraserBtn, toolFillBtn, toolSmudgeBtn, toolAirbrushBtn, 
    toolRectBtn, toolCircleBtn, toolTriangleBtn, toolLineBtn, 
    btnUndo, clearBtn,
    canvas, socket, penColorInput
} from './dom-elements.js';
import { state } from './state.js';
import { showToast } from './utils.js';

export function initTools() {
    function updateActiveTool(activeBtn) {
        [toolPenBtn, toolEraserBtn, toolFillBtn, toolSmudgeBtn, toolAirbrushBtn, toolRectBtn, toolCircleBtn, toolTriangleBtn, toolLineBtn].forEach(btn => btn.classList.remove('active'));
        activeBtn.classList.add('active');
    }

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

    btnUndo.addEventListener('click', () => {
        socket.emit('undo', state.currentRoom);
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
}
