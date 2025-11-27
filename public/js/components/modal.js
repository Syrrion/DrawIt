export class Modal {
    constructor(elementOrId, options = {}) {
        this.element = typeof elementOrId === 'string' ? document.getElementById(elementOrId) : elementOrId;
        if (!this.element) {
            console.warn(`Modal element not found: ${elementOrId}`);
            return;
        }

        this.options = {
            onOpen: null,
            onClose: null,
            closeOnClickOutside: true,
            closeBtnSelector: '.close-modal', // Default selector for close buttons inside the modal
            ...options
        };

        this.init();
    }

    init() {
        // Bind close buttons
        if (this.options.closeBtnSelector) {
            const closeBtns = this.element.querySelectorAll(this.options.closeBtnSelector);
            closeBtns.forEach(btn => {
                btn.addEventListener('click', () => this.close());
            });
        }

        // Bind specific close button if passed
        if (this.options.closeBtn) {
            this.options.closeBtn.addEventListener('click', () => this.close());
        }

        // Close on click outside
        if (this.options.closeOnClickOutside) {
            this.element.addEventListener('click', (e) => {
                if (e.target === this.element) {
                    this.close();
                }
            });
        }
    }

    open() {
        if (!this.element) return;
        this.element.classList.remove('hidden');
        if (this.options.onOpen) this.options.onOpen();
    }

    close() {
        if (!this.element) return;
        this.element.classList.add('hidden');
        if (this.options.onClose) this.options.onClose();
    }

    toggle() {
        if (this.isVisible()) {
            this.close();
        } else {
            this.open();
        }
    }

    isVisible() {
        return this.element && !this.element.classList.contains('hidden');
    }
}
