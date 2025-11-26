import { canvas, ctx, socket } from './dom-elements.js';
import { state } from './state.js';
import { render } from './canvas-manager.js';

let selectionRect = null; // { x, y, w, h }
let isSelecting = false;
let isDraggingContent = false;
let dragStart = null; // { x, y }
let selectionContent = null; // ImageData or Canvas
let selectionOffset = { x: 0, y: 0 };

export function handleSelectionMouseDown(e, x, y) {
    if (selectionRect && isPointInRect(x, y, selectionRect)) {
        // Start dragging content
        isDraggingContent = true;
        dragStart = { x, y };
        
        // If content not yet captured, capture it now
        if (!selectionContent) {
            captureSelectionContent();
        }
    } else {
        // Start new selection
        isSelecting = true;
        selectionRect = { x, y, w: 0, h: 0 };
        selectionContent = null;
        selectionOffset = { x: 0, y: 0 };
        render(); // Clear previous overlay
    }
}

export function handleSelectionMouseMove(e, x, y) {
    if (isSelecting) {
        selectionRect.w = x - selectionRect.x;
        selectionRect.h = y - selectionRect.y;
        render();
        drawSelectionOverlay(ctx, selectionRect);
    } else if (isDraggingContent) {
        const dx = x - dragStart.x;
        const dy = y - dragStart.y;
        selectionOffset.x += dx;
        selectionOffset.y += dy;
        dragStart = { x, y };
        render();
        drawSelectionOverlay(ctx, getOffsetRect());
        drawFloatingContent(ctx);
    } else {
        // Hover effect
        if (selectionRect && isPointInRect(x, y, getOffsetRect())) {
            canvas.style.cursor = 'move';
        } else {
            canvas.style.cursor = 'crosshair';
        }
    }
}

export function handleSelectionMouseUp(e, x, y) {
    if (isSelecting) {
        isSelecting = false;
        // Normalize rect (handle negative width/height)
        normalizeSelectionRect();
        if (selectionRect.w === 0 || selectionRect.h === 0) {
            selectionRect = null;
        }
        render();
        if (selectionRect) drawSelectionOverlay(ctx, selectionRect);
    } else if (isDraggingContent) {
        isDraggingContent = false;
        // Commit change
        commitSelectionMove();
    }
}

function isPointInRect(x, y, rect) {
    return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
}

function normalizeSelectionRect() {
    if (selectionRect.w < 0) {
        selectionRect.x += selectionRect.w;
        selectionRect.w = Math.abs(selectionRect.w);
    }
    if (selectionRect.h < 0) {
        selectionRect.y += selectionRect.h;
        selectionRect.h = Math.abs(selectionRect.h);
    }
}

function getOffsetRect() {
    return {
        x: selectionRect.x + selectionOffset.x,
        y: selectionRect.y + selectionOffset.y,
        w: selectionRect.w,
        h: selectionRect.h
    };
}

function captureSelectionContent() {
    if (!state.activeLayerId || !state.layerCanvases[state.activeLayerId]) return;
    const layerCtx = state.layerCanvases[state.activeLayerId].ctx;
    
    // Capture content
    selectionContent = layerCtx.getImageData(selectionRect.x, selectionRect.y, selectionRect.w, selectionRect.h);
    
    // Clear from source
    layerCtx.clearRect(selectionRect.x, selectionRect.y, selectionRect.w, selectionRect.h);
    
    // We need to broadcast this clear? 
    // For now, let's just handle local visual. 
    // To sync, we would need to send a "move" command that does clear + draw.
}

function drawFloatingContent(context) {
    if (selectionContent) {
        const dest = getOffsetRect();
        // Create temp canvas to draw ImageData
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = selectionContent.width;
        tempCanvas.height = selectionContent.height;
        tempCanvas.getContext('2d').putImageData(selectionContent, 0, 0);
        
        context.drawImage(tempCanvas, dest.x, dest.y);
        
        // Draw border
        context.strokeStyle = '#000';
        context.setLineDash([5, 5]);
        context.strokeRect(dest.x, dest.y, dest.w, dest.h);
        context.setLineDash([]);
    }
}

export function drawSelectionOverlay(context, rect) {
    context.save();
    context.strokeStyle = '#000';
    context.lineWidth = 1;
    context.setLineDash([5, 5]);
    context.strokeRect(rect.x, rect.y, rect.w, rect.h);
    context.strokeStyle = '#fff';
    context.setLineDash([5, 5]);
    context.lineDashOffset = 5;
    context.strokeRect(rect.x, rect.y, rect.w, rect.h);
    context.restore();
}

function commitSelectionMove() {
    if (!state.activeLayerId || !state.layerCanvases[state.activeLayerId] || !selectionContent) return;
    
    const layerCtx = state.layerCanvases[state.activeLayerId].ctx;
    const dest = getOffsetRect();
    
    // Draw content to new position
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = selectionContent.width;
    tempCanvas.height = selectionContent.height;
    tempCanvas.getContext('2d').putImageData(selectionContent, 0, 0);
    
    layerCtx.globalCompositeOperation = 'source-over';
    layerCtx.drawImage(tempCanvas, dest.x, dest.y);
    
    // Broadcast
    socket.emit('draw', {
        roomCode: state.currentRoom,
        tool: 'move-selection',
        srcX: selectionRect.x,
        srcY: selectionRect.y,
        w: selectionRect.w,
        h: selectionRect.h,
        destX: dest.x,
        destY: dest.y,
        layerId: state.activeLayerId
    });
    
    // Reset
    selectionRect = null;
    selectionContent = null;
    selectionOffset = { x: 0, y: 0 };
    render();
}

export function deleteSelection() {
    if (!selectionRect) return;

    if (state.activeLayerId && state.layerCanvases[state.activeLayerId]) {
        const layerCtx = state.layerCanvases[state.activeLayerId].ctx;
        
        // Emit clear-rect
        socket.emit('draw', {
            roomCode: state.currentRoom,
            tool: 'clear-rect',
            x: selectionRect.x,
            y: selectionRect.y,
            w: selectionRect.w,
            h: selectionRect.h,
            layerId: state.activeLayerId
        });
        
        // Perform local clear
        layerCtx.clearRect(selectionRect.x, selectionRect.y, selectionRect.w, selectionRect.h);
    }

    // Reset selection
    selectionRect = null;
    selectionContent = null;
    selectionOffset = { x: 0, y: 0 };
    isSelecting = false;
    isDraggingContent = false;
    render();
}
