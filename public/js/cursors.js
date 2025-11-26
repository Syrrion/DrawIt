import { stringToColor } from './utils.js';

export function initCursorManager(socket, cursorsLayer, getRoomCode, getUsername) {
    const cursors = {};
    let lastCursorEmit = 0;
    let areCursorsVisible = true;

    socket.on('cursorMove', ({ id, x, y, username }) => {
        if (!cursors[id]) {
            const cursor = document.createElement('div');
            cursor.className = 'cursor';
            // Ensure username is safe
            const safeUsername = username || 'Unknown';
            cursor.innerHTML = `
                <div class="cursor-pointer" style="background: ${stringToColor(safeUsername)}"></div>
                <div class="cursor-name">${safeUsername}</div>
            `;
            cursorsLayer.appendChild(cursor);
            cursors[id] = { element: cursor, x, y };
        }
        
        cursors[id].x = x;
        cursors[id].y = y;
        cursors[id].username = username; 
        
        updateCursorPosition(id);
    });

    function updateCursorPosition(id) {
        const cursor = cursors[id];
        if (cursor) {
            // Position is relative to the canvas (0-800)
            // The canvasWrapper scaling handles the visual position on screen
            cursor.element.style.left = `${cursor.x}px`;
            cursor.element.style.top = `${cursor.y}px`;
            
            // Visibility check
            if (areCursorsVisible) {
                cursor.element.style.display = 'flex';
            } else {
                cursor.element.style.display = 'none';
            }
        }
    }

    function updateAllCursorsVisibility() {
        for (const id in cursors) {
            updateCursorPosition(id);
        }
    }

    return {
        emitCursorMove: (x, y) => {
            const now = Date.now();
            if (now - lastCursorEmit > 50) { // Throttle 20fps
                const roomCode = getRoomCode();
                const username = getUsername();
                if (roomCode && username) {
                    socket.emit('cursorMove', {
                        roomCode: roomCode,
                        x: x,
                        y: y,
                        username: username
                    });
                    lastCursorEmit = now;
                }
            }
        },
        // Add method to clear other cursors if needed
        clearCursors: () => {
            for (const id in cursors) {
                if (cursors[id].element.parentNode) {
                    cursors[id].element.parentNode.removeChild(cursors[id].element);
                }
                delete cursors[id];
            }
        },
        removeCursor: (id) => {
            if (cursors[id]) {
                if (cursors[id].element.parentNode) {
                    cursors[id].element.parentNode.removeChild(cursors[id].element);
                }
                delete cursors[id];
            }
        },
        setCursorsVisible: (visible) => {
            areCursorsVisible = visible;
            updateAllCursorsVisibility();
        }
    };
}
