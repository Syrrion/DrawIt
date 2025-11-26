export function initCamera(canvasWrapper, zoomLevelDisplay) {
    let camera = { x: 0, y: 0, z: 1 };
    let zoomTimeout;

    function updateCameraTransform() {
        canvasWrapper.style.transform = `translate(${camera.x}px, ${camera.y}px) scale(${camera.z})`;
        
        zoomLevelDisplay.textContent = `${Math.round(camera.z * 100)}%`;
        zoomLevelDisplay.classList.remove('hidden');
        
        if (zoomTimeout) clearTimeout(zoomTimeout);
        zoomTimeout = setTimeout(() => {
            zoomLevelDisplay.classList.add('hidden');
        }, 1500);
    }

    return {
        getCamera: () => camera,
        handleWheel: (e) => {
            e.preventDefault();
            
            const zoomIntensity = 0.1;
            const direction = e.deltaY < 0 ? 1 : -1;
            const factor = 1 + (zoomIntensity * direction);
            
            const rect = canvasWrapper.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;
            
            let newZ = camera.z * factor;
            newZ = Math.max(0.1, Math.min(newZ, 5)); // Limit zoom
            
            // Adjust position to zoom towards mouse
            camera.x += mouseX * (1 - newZ / camera.z);
            camera.y += mouseY * (1 - newZ / camera.z);
            camera.z = newZ;
            
            updateCameraTransform();
        },
        pan: (dx, dy) => {
            camera.x += dx;
            camera.y += dy;
            updateCameraTransform();
        },
        reset: () => {
            camera = { x: 0, y: 0, z: 1 };
            updateCameraTransform();
        }
    };
}
