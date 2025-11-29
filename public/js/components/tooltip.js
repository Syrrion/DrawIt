export class TooltipManager {
    constructor() {
        this.tooltip = document.createElement('div');
        this.tooltip.className = 'custom-tooltip hidden';
        document.body.appendChild(this.tooltip);

        this.init();
    }

    init() {
        document.addEventListener('mouseover', (e) => {
            const target = e.target.closest('[data-tooltip]');
            if (target) {
                this.show(target.dataset.tooltip, e);
            }
        });

        document.addEventListener('mouseout', (e) => {
            const target = e.target.closest('[data-tooltip]');
            if (target) {
                this.hide();
            }
        });

        document.addEventListener('mousemove', (e) => {
            if (!this.tooltip.classList.contains('hidden')) {
                this.move(e);
            }
        });
    }

    show(text, e) {
        this.tooltip.textContent = text;
        this.tooltip.classList.remove('hidden');
        this.move(e);
    }

    hide() {
        this.tooltip.classList.add('hidden');
    }

    move(e) {
        const offset = 15;
        const x = e.clientX + offset;
        const y = e.clientY + offset;
        
        // Prevent tooltip from going off-screen
        const rect = this.tooltip.getBoundingClientRect();
        const winWidth = window.innerWidth;
        const winHeight = window.innerHeight;

        let finalX = x;
        let finalY = y;

        if (x + rect.width > winWidth) {
            finalX = e.clientX - rect.width - offset;
        }
        if (y + rect.height > winHeight) {
            finalY = e.clientY - rect.height - offset;
        }

        this.tooltip.style.left = finalX + 'px';
        this.tooltip.style.top = finalY + 'px';
    }
}
