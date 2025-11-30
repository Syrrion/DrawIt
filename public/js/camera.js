export class CameraManager {
    constructor(canvasWrapper, zoomLevelDisplay) {
        this.canvasWrapper = canvasWrapper;
        this.zoomLevelDisplay = zoomLevelDisplay;
        this.camera = { x: 0, y: 0, z: 1 };
        this.zoomTimeout = null;
    }

    getCamera() {
        return this.camera;
    }

    updateCameraTransform() {
        this.canvasWrapper.style.transform = `translate(${this.camera.x}px, ${this.camera.y}px) scale(${this.camera.z})`;
        
        this.zoomLevelDisplay.textContent = `${Math.round(this.camera.z * 100)}%`;
        this.zoomLevelDisplay.classList.remove('hidden');
        
        if (this.zoomTimeout) clearTimeout(this.zoomTimeout);
        this.zoomTimeout = setTimeout(() => {
            this.zoomLevelDisplay.classList.add('hidden');
        }, 1500);

        if (this.onUpdate) this.onUpdate();
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
        this.camera = { x: 0, y: 0, z: 1 };
        this.updateCameraTransform();
    }
}
