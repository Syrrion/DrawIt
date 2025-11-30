import { CANVAS_CONFIG, BASE_DIMENSIONS } from './config.js';

export class CameraManager {
    constructor(canvasWrapper, zoomLevelDisplay) {
        this.canvasWrapper = canvasWrapper;
        this.zoomLevelDisplay = zoomLevelDisplay;
        // Calculate initial zoom to fit BASE_DIMENSIONS (800x600) view
        const initialZoom = BASE_DIMENSIONS.width / CANVAS_CONFIG.width;
        
        // Center the camera: Shift by half the difference between unscaled and scaled size
        // This aligns the scaled center with the unscaled center (which is centered by CSS)
        const centerX = CANVAS_CONFIG.width * (1 - initialZoom) / 2;
        const centerY = CANVAS_CONFIG.height * (1 - initialZoom) / 2;

        this.camera = { x: centerX, y: centerY, z: initialZoom };
        this.zoomTimeout = null;
        this.listeners = [];
    }

    getCamera() {
        return this.camera;
    }

    addListener(callback) {
        this.listeners.push(callback);
    }

    updateCameraTransform() {
        this.canvasWrapper.style.transform = `translate(${this.camera.x}px, ${this.camera.y}px) scale(${this.camera.z})`;
        
        this.zoomLevelDisplay.textContent = `${Math.round(this.camera.z * 100)}%`;
        this.zoomLevelDisplay.classList.remove('hidden');
        
        if (this.zoomTimeout) clearTimeout(this.zoomTimeout);
        this.zoomTimeout = setTimeout(() => {
            this.zoomLevelDisplay.classList.add('hidden');
        }, 1500);

        this.listeners.forEach(callback => callback());
    }

    handleWheel(e) {
        e.preventDefault();
        
        const zoomIntensity = 0.1;
        const direction = e.deltaY < 0 ? 1 : -1;
        const factor = 1 + (zoomIntensity * direction);
        
        const rect = this.canvasWrapper.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        
        let newZ = this.camera.z * factor;
        newZ = Math.max(0.1, Math.min(newZ, 5)); // Limit zoom
        
        // Adjust position to zoom towards mouse
        this.camera.x += mouseX * (1 - newZ / this.camera.z);
        this.camera.y += mouseY * (1 - newZ / this.camera.z);
        this.camera.z = newZ;
        
        this.updateCameraTransform();
    }

    pan(dx, dy) {
        this.camera.x += dx;
        this.camera.y += dy;
        this.updateCameraTransform();
    }

    reset() {
        const initialZoom = BASE_DIMENSIONS.width / CANVAS_CONFIG.width;
        const centerX = CANVAS_CONFIG.width * (1 - initialZoom) / 2;
        const centerY = CANVAS_CONFIG.height * (1 - initialZoom) / 2;
        
        this.camera = { x: centerX, y: centerY, z: initialZoom };
        this.updateCameraTransform();
    }
}
