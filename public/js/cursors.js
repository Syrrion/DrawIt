import { stringToColor } from './utils.js';

export class CursorManager {
    constructor(socket, cursorsLayer, roomCodeProvider, usernameProvider) {
        this.socket = socket;
        this.cursorsLayer = cursorsLayer;
        this.roomCodeProvider = roomCodeProvider;
        this.usernameProvider = usernameProvider;

        this.cursors = {};
        this.lastCursorEmit = 0;
        this.areCursorsVisible = true;

        this.init();
        
        // Check for inactive cursors every second
        setInterval(() => this.checkInactiveCursors(), 1000);
    }

    init() {
        this.socket.on('cursorMove', (data) => this.handleCursorMove(data));
    }

    handleCursorMove({ id, x, y, username }) {
        if (!this.cursors[id]) {
            const cursor = document.createElement('div');
            cursor.className = 'cursor';
            // Ensure username is safe
            const safeUsername = username || 'Unknown';
            cursor.innerHTML = `
                <div class="cursor-pointer" style="background: ${stringToColor(safeUsername)}"></div>
                <div class="cursor-name">${safeUsername}</div>
            `;
            this.cursorsLayer.appendChild(cursor);
            this.cursors[id] = { element: cursor, x, y, lastUpdate: Date.now() };
        }
        
        this.cursors[id].x = x;
        this.cursors[id].y = y;
        this.cursors[id].username = username; 
        this.cursors[id].lastUpdate = Date.now();
        
        this.updateCursorPosition(id);
    }

    updateCursorPosition(id) {
        const cursor = this.cursors[id];
        if (cursor) {
            // Position is relative to the canvas (0-800)
            // The canvasWrapper scaling handles the visual position on screen
            cursor.element.style.left = `${cursor.x}px`;
            cursor.element.style.top = `${cursor.y}px`;
            
            // Visibility check
            if (this.areCursorsVisible) {
                cursor.element.style.display = 'flex';
                cursor.element.style.opacity = '1';
            } else {
                cursor.element.style.display = 'none';
            }
        }
    }

    checkInactiveCursors() {
        const now = Date.now();
        for (const id in this.cursors) {
            if (now - this.cursors[id].lastUpdate > 3000) { // 3 seconds inactivity
                this.cursors[id].element.style.opacity = '0';
            }
        }
    }

    updateAllCursorsVisibility() {
        for (const id in this.cursors) {
            this.updateCursorPosition(id);
        }
    }

    emitCursorMove(x, y) {
        const now = Date.now();
        if (now - this.lastCursorEmit > 50) { // Throttle 20fps
            const roomCode = this.roomCodeProvider();
            const username = this.usernameProvider();
            if (roomCode && username) {
                this.socket.emit('cursorMove', {
                    roomCode: roomCode,
                    x: x,
                    y: y,
                    username: username
                });
                this.lastCursorEmit = now;
            }
        }
    }

    clearCursors() {
        for (const id in this.cursors) {
            if (this.cursors[id].element.parentNode) {
                this.cursors[id].element.parentNode.removeChild(this.cursors[id].element);
            }
            delete this.cursors[id];
        }
    }

    removeCursor(id) {
        if (this.cursors[id]) {
            if (this.cursors[id].element.parentNode) {
                this.cursors[id].element.parentNode.removeChild(this.cursors[id].element);
            }
            delete this.cursors[id];
        }
    }

    setCursorsVisible(visible) {
        this.areCursorsVisible = visible;
        this.updateAllCursorsVisibility();
    }
}
