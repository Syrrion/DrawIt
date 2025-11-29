// Smudge Tool Helper
const smudgeCanvas = document.createElement('canvas');
const smudgeCtx = smudgeCanvas.getContext('2d', { willReadFrequently: true });
const maskCanvas = document.createElement('canvas');
const maskCtx = maskCanvas.getContext('2d', { willReadFrequently: true });

import { hexToRgb } from './utils.js';

// Helper function for drawing on any context
export function performDraw(targetCtx, x0, y0, x1, y1, color, size, opacity, tool) {
    if (tool === 'airbrush') {
        const rgb = hexToRgb(color);
        if (!rgb) return;

        const dist = Math.sqrt((x1 - x0) ** 2 + (y1 - y0) ** 2);
        // Larger steps to reduce spray frequency
        const step = Math.max(1, size / 2); 
        const steps = Math.ceil(dist / step);
        
        // Calculate number of particles based on size
        const radius = size / 2;
        const area = Math.PI * radius * radius;
        // Adjust density factor - reduced slightly since particles are larger/diffuse
        const particleCount = Math.max(1, Math.floor(area * 0.04)); 

        // Use lower opacity for individual particles to create diffuse effect
        targetCtx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${opacity * 0.5})`;
        targetCtx.globalCompositeOperation = 'source-over';

        for (let i = 0; i <= steps; i++) {
            const t = steps === 0 ? 0 : i / steps;
            const cx = x0 + (x1 - x0) * t;
            const cy = y0 + (y1 - y0) * t;

            for (let j = 0; j < particleCount; j++) {
                // Random offset within radius
                // Use sqrt(random) for uniform distribution over the disk
                const r = radius * Math.sqrt(Math.random());
                const angle = Math.random() * Math.PI * 2;
                
                const x = cx + r * Math.cos(angle);
                const y = cy + r * Math.sin(angle);

                // Draw diffuse particle (circle with random size)
                const partSize = Math.random() * 1.5 + 0.5; // Radius 0.5 to 2.0
                
                targetCtx.beginPath();
                targetCtx.arc(x, y, partSize, 0, Math.PI * 2);
                targetCtx.fill();
            }
        }
        return;
    }

    if (tool === 'smudge') {
        // Increase size factor for smudge tool to make it larger than other tools
        const effectiveSize = size;
        
        const dist = Math.sqrt((x1 - x0) ** 2 + (y1 - y0) ** 2);
        // Smoother steps for better finesse
        const step = Math.max(1, effectiveSize / 8); 
        const steps = Math.ceil(dist / step);
        const r = effectiveSize / 2;

        // Resize temp canvas if needed
        const canvasSize = effectiveSize;
        if (smudgeCanvas.width !== canvasSize || smudgeCanvas.height !== canvasSize) {
            smudgeCanvas.width = canvasSize;
            smudgeCanvas.height = canvasSize;
            maskCanvas.width = canvasSize;
            maskCanvas.height = canvasSize;

            // Pre-calculate gradient for soft round brush on maskCanvas
            const grad = maskCtx.createRadialGradient(r, r, 0, r, r, r);
            grad.addColorStop(0, 'rgba(255,255,255,1)');
            grad.addColorStop(1, 'rgba(255,255,255,0)');

            maskCtx.clearRect(0, 0, canvasSize, canvasSize);
            maskCtx.fillStyle = grad;
            maskCtx.fillRect(0, 0, canvasSize, canvasSize);
        }

        let prevX = x0;
        let prevY = y0;

        for (let i = 1; i <= steps; i++) {
            const t = i / steps;
            const currX = x0 + (x1 - x0) * t;
            const currY = y0 + (y1 - y0) * t;

            // 1. Copy source (from prev position) to temp canvas
            smudgeCtx.globalCompositeOperation = 'source-over';
            smudgeCtx.clearRect(0, 0, canvasSize, canvasSize);
            // Use integer coordinates to avoid interpolation with transparent black
            smudgeCtx.drawImage(
                targetCtx.canvas,
                Math.floor(prevX - r), Math.floor(prevY - r), effectiveSize, effectiveSize,
                0, 0, effectiveSize, effectiveSize
            );

            // 2. Apply soft round mask using maskCanvas
            smudgeCtx.globalCompositeOperation = 'destination-in';
            smudgeCtx.drawImage(maskCanvas, 0, 0);

            // 3. Erase destination (Make room for new paint - simulates dragging transparency)
            targetCtx.globalCompositeOperation = 'destination-out';
            targetCtx.globalAlpha = opacity * 0.9;
            targetCtx.drawImage(maskCanvas, Math.floor(currX - r), Math.floor(currY - r));

            // 4. Draw to destination
            targetCtx.globalCompositeOperation = 'lighter';
            targetCtx.globalAlpha = opacity * 0.9;
            targetCtx.drawImage(smudgeCanvas, Math.floor(currX - r), Math.floor(currY - r));
            targetCtx.globalAlpha = 1;
            targetCtx.globalCompositeOperation = 'source-over';

            prevX = currX;
            prevY = currY;
        }
        return;
    }

    targetCtx.beginPath();
    
    if (tool === 'rectangle') {
        targetCtx.rect(x0, y0, x1 - x0, y1 - y0);
    } else if (tool === 'circle') {
        const radius = Math.sqrt(Math.pow(x1 - x0, 2) + Math.pow(y1 - y0, 2));
        targetCtx.arc(x0, y0, radius, 0, 2 * Math.PI);
    } else if (tool === 'triangle') {
        // Triangle pointing from start (apex) to end (base center)
        const dx = x1 - x0;
        const dy = y1 - y0;
        
        // Calculate base corners perpendicular to the direction
        // Base width = length of the direction vector (height)
        const halfBaseX = -dy * 0.5;
        const halfBaseY = dx * 0.5;
        
        targetCtx.moveTo(x0, y0); // Apex
        targetCtx.lineTo(x1 + halfBaseX, y1 + halfBaseY); // Corner 1
        targetCtx.lineTo(x1 - halfBaseX, y1 - halfBaseY); // Corner 2
        targetCtx.closePath();
    } else if (tool === 'line') {
        targetCtx.moveTo(x0, y0);
        targetCtx.lineTo(x1, y1);
    } else {
        // Pen / Eraser
        targetCtx.moveTo(x0, y0);
        targetCtx.lineTo(x1, y1);
    }
    
    targetCtx.lineCap = 'round';
    targetCtx.lineJoin = 'round';
    targetCtx.lineWidth = size;
    
    if (tool === 'eraser') {
        targetCtx.globalCompositeOperation = 'destination-out';
        targetCtx.strokeStyle = 'rgba(0,0,0,1)'; 
        targetCtx.stroke();
    } else {
        targetCtx.globalCompositeOperation = 'source-over';
        targetCtx.strokeStyle = color;
        targetCtx.globalAlpha = opacity;
        targetCtx.stroke();
    }

    targetCtx.globalAlpha = 1;
}

// Helper function for flood fill on any context
export function performFloodFill(targetCtx, width, height, startX, startY, fillColor) {
    // Convert hex color to RGB
    const r = parseInt(fillColor.slice(1, 3), 16);
    const g = parseInt(fillColor.slice(3, 5), 16);
    const b = parseInt(fillColor.slice(5, 7), 16);
    const a = 255;

    const imageData = targetCtx.getImageData(0, 0, width, height);
    const { data } = imageData;
    
    // Get starting color
    const startPos = (startY * width + startX) * 4;
    const startR = data[startPos];
    const startG = data[startPos + 1];
    const startB = data[startPos + 2];
    const startA = data[startPos + 3];

    // Tolerance to handle anti-aliasing artifacts
    // Reduced tolerance to make it less permissive (was 200)
    const tolerance = 50;

    function matchesStart(pos) {
        const dr = Math.abs(data[pos] - startR);
        const dg = Math.abs(data[pos + 1] - startG);
        const db = Math.abs(data[pos + 2] - startB);
        const da = Math.abs(data[pos + 3] - startA);
        return dr <= tolerance && dg <= tolerance && db <= tolerance && da <= tolerance;
    }

    function matchesFill(pos) {
        return data[pos] === r && 
               data[pos + 1] === g && 
               data[pos + 2] === b && 
               data[pos + 3] === a;
    }

    if (matchesFill(startPos)) return;

    const stack = [[startX, startY]];

    while (stack.length) {
        const [x, y] = stack.pop();
        const pos = (y * width + x) * 4;

        if (x < 0 || x >= width || y < 0 || y >= height) continue;
        
        if (matchesFill(pos)) continue;

        if (matchesStart(pos)) {
            // Fill pixel
            data[pos] = r;
            data[pos + 1] = g;
            data[pos + 2] = b;
            data[pos + 3] = a;

            stack.push([x + 1, y]);
            stack.push([x - 1, y]);
            stack.push([x, y + 1]);
            stack.push([x, y - 1]);
        } else {
            // Paint boundary pixel to cover artifacts
            data[pos] = r;
            data[pos + 1] = g;
            data[pos + 2] = b;
            data[pos + 3] = a;
        }
    }

    targetCtx.putImageData(imageData, 0, 0);
}

export function performMoveSelection(targetCtx, srcX, srcY, w, h, destX, destY) {
    // 1. Capture content from src
    const content = targetCtx.getImageData(srcX, srcY, w, h);
    
    // 2. Clear src
    targetCtx.clearRect(srcX, srcY, w, h);
    
    // 3. Draw content at dest
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = w;
    tempCanvas.height = h;
    tempCanvas.getContext('2d').putImageData(content, 0, 0);
    
    targetCtx.globalCompositeOperation = 'source-over';
    targetCtx.drawImage(tempCanvas, destX, destY);
}

export function performClearRect(targetCtx, x, y, w, h) {
    targetCtx.clearRect(x, y, w, h);
}
