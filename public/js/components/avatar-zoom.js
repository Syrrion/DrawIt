export class AvatarZoomManager {
    constructor() {
        this.overlay = document.createElement('div');
        this.overlay.id = 'avatar-zoom-overlay';
        this.overlay.style.position = 'fixed';
        this.overlay.style.top = '0';
        this.overlay.style.left = '0';
        this.overlay.style.width = '100%';
        this.overlay.style.height = '100%';
        this.overlay.style.pointerEvents = 'none';
        this.overlay.style.zIndex = '9999';
        document.body.appendChild(this.overlay);

        this.activeClone = null;
        this.activeTarget = null;

        this.init();
    }

    init() {
        // Delegate event listeners for dynamic elements
        document.addEventListener('mouseover', (e) => {
            const target = e.target.closest('.player-avatar, .player-avatar-img, .chat-avatar, .ready-player-info .player-avatar-small, .layer-avatars > div');
            if (target && !this.activeClone) {
                this.showZoom(target);
            }
        });

        document.addEventListener('mouseout', (e) => {
            const target = e.target.closest('.player-avatar, .player-avatar-img, .chat-avatar, .ready-player-info .player-avatar-small, .layer-avatars > div');
            if (target && this.activeClone && this.activeTarget === target) {
                // Check if moving to the clone (shouldn't happen with pointer-events: none)
                this.hideZoom();
            }
        });
        
        // Handle scroll to hide/update zoom (simpler to just hide)
        document.addEventListener('scroll', () => {
            if (this.activeClone) this.hideZoom();
        }, true);
    }

    showZoom(target) {
        this.activeTarget = target;
        const rect = target.getBoundingClientRect();
        
        // Clone the element
        const clone = target.cloneNode(true);
        
        // Copy computed styles to ensure it looks identical
        const computedStyle = window.getComputedStyle(target);
        clone.style.width = rect.width + 'px';
        clone.style.height = rect.height + 'px';
        clone.style.borderRadius = computedStyle.borderRadius;
        clone.style.backgroundColor = computedStyle.backgroundColor;
        clone.style.border = computedStyle.border;
        clone.style.boxShadow = '0 10px 25px rgba(0,0,0,0.5)'; // Enhanced shadow
        clone.style.objectFit = computedStyle.objectFit;
        clone.style.display = 'flex';
        clone.style.alignItems = 'center';
        clone.style.justifyContent = 'center';
        clone.style.fontSize = computedStyle.fontSize;
        
        // Position it exactly over the original
        clone.style.position = 'absolute';
        clone.style.left = rect.left + 'px';
        clone.style.top = rect.top + 'px';
        clone.style.margin = '0';
        clone.style.transform = 'scale(1)';
        clone.style.transition = 'transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275), top 0.2s, left 0.2s, opacity 0.2s';
        clone.style.zIndex = '10000';
        clone.style.pointerEvents = 'none'; // Let mouse events pass through to original to detect mouseout

        // Clean up classes that might interfere or cause double styling
        clone.classList.remove('player-avatar', 'chat-avatar', 'player-avatar-small');
        
        this.overlay.appendChild(clone);
        this.activeClone = clone;

        // Trigger animation
        requestAnimationFrame(() => {
            if (this.activeClone) {
                const scale = 2.5;
                const padding = 10;
                const viewportWidth = window.innerWidth;
                const viewportHeight = window.innerHeight;

                const scaledWidth = rect.width * scale;
                const scaledHeight = rect.height * scale;

                // Calculate where the edges would be if we just scaled from center
                const centerX = rect.left + rect.width / 2;
                const centerY = rect.top + rect.height / 2;

                // Check horizontal bounds
                const leftEdge = centerX - scaledWidth / 2;
                const rightEdge = centerX + scaledWidth / 2;

                let deltaX = 0;
                if (leftEdge < padding) {
                    deltaX = padding - leftEdge;
                } else if (rightEdge > viewportWidth - padding) {
                    deltaX = (viewportWidth - padding) - rightEdge;
                }

                // Check vertical bounds
                const topEdge = centerY - scaledHeight / 2;
                const bottomEdge = centerY + scaledHeight / 2;

                let deltaY = 0;
                if (topEdge < padding) {
                    deltaY = padding - topEdge;
                } else if (bottomEdge > viewportHeight - padding) {
                    deltaY = (viewportHeight - padding) - bottomEdge;
                }

                this.activeClone.style.transform = `scale(${scale})`;
                this.activeClone.style.left = (rect.left + deltaX) + 'px';
                this.activeClone.style.top = (rect.top + deltaY) + 'px';
            }
        });
    }

    hideZoom() {
        if (!this.activeClone) return;
        
        const clone = this.activeClone;
        this.activeClone = null;
        this.activeTarget = null;

        clone.style.transform = 'scale(1)';
        clone.style.opacity = '0';
        
        setTimeout(() => {
            if (clone.parentNode) {
                clone.parentNode.removeChild(clone);
            }
        }, 200);
    }
}
