export class NetworkMonitor {
    constructor(socket) {
        this.socket = socket;
        this.bytesSent = 0;
        this.bytesReceived = 0;
        this.lastCheck = Date.now();
        
        this.upElement = document.getElementById('net-up');
        this.downElement = document.getElementById('net-down');

        this.init();
    }

    init() {
        // Handle initial connection
        if (this.socket.connected) {
            this.attachListeners();
        }

        // Handle reconnections / engine changes
        this.socket.io.on('open', () => {
            this.attachListeners();
        });

        // Update UI every second
        setInterval(() => this.updateStats(), 1000);
    }

    attachListeners() {
        const engine = this.socket.io.engine;
        if (!engine) return;

        // Avoid double patching if attachListeners is called multiple times for same engine
        if (engine._networkMonitorAttached) return;
        engine._networkMonitorAttached = true;

        // Monitor Download
        engine.on('packet', (packet) => {
            this.bytesReceived += this.calculatePacketSize(packet);
        });

        // Monitor Upload by patching write
        // engine.write sends the packet data
        const originalWrite = engine.write.bind(engine);
        engine.write = (msg, options, fn) => {
            this.bytesSent += this.calculateDataSize(msg);
            return originalWrite(msg, options, fn);
        };
    }

    calculatePacketSize(packet) {
        if (!packet || !packet.data) return 0;
        return this.calculateDataSize(packet.data);
    }

    calculateDataSize(data) {
        if (typeof data === 'string') {
            // Use TextEncoder for accurate byte size of UTF-8 string
            return new TextEncoder().encode(data).length;
        } else if (data instanceof Blob) {
            return data.size;
        } else if (data instanceof ArrayBuffer) {
            return data.byteLength;
        }
        return 0;
    }

    updateStats() {
        const now = Date.now();
        const diff = (now - this.lastCheck) / 1000; // seconds
        
        if (diff > 0) {
            const upSpeed = this.bytesSent / diff;
            const downSpeed = this.bytesReceived / diff;

            if (this.upElement) this.upElement.textContent = this.formatSpeed(upSpeed);
            if (this.downElement) this.downElement.textContent = this.formatSpeed(downSpeed);

            this.bytesSent = 0;
            this.bytesReceived = 0;
            this.lastCheck = now;
        }
    }

    formatSpeed(bytesPerSec) {
        const kb = bytesPerSec / 1024;
        // Format: X XXX.XX (space for thousands, dot for decimal)
        const parts = kb.toFixed(2).split('.');
        parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, " ");
        return `${parts.join('.')} ko/s`;
    }
}
