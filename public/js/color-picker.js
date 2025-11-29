import { hexToRgb, rgbToHex, hsvToRgb, rgbToHsv, hsvToRgbString } from './utils.js';

export class ColorPickerManager {
    constructor(options) {
        this.grid = options.grid;
        this.popover = options.popover || null; // If null, it's static
        this.triggers = options.triggers || []; // Array of { element, preview }
        this.input = options.input || null; // Input to update (e.g. penColor)
        this.preview = options.preview || null; // Preview to update (e.g. toolbar icon)
        this.onColorChange = options.onColorChange || null;
        this.initialColor = options.initialColor || '#000000';
        
        // IDs for internal elements
        this.ids = options.ids || {
            saturationArea: 'cp-saturation-area',
            saturationCursor: 'cp-saturation-cursor',
            hueArea: 'cp-hue-area',
            hueCursor: 'cp-hue-cursor',
            previewColor: 'cp-preview-color',
            r: 'cp-r',
            g: 'cp-g',
            b: 'cp-b'
        };

        // Get internal elements
        this.cpSaturationArea = document.getElementById(this.ids.saturationArea);
        this.cpSaturationCursor = document.getElementById(this.ids.saturationCursor);
        this.cpHueArea = document.getElementById(this.ids.hueArea);
        this.cpHueCursor = document.getElementById(this.ids.hueCursor);
        this.cpPreviewColor = document.getElementById(this.ids.previewColor);
        this.cpInputR = document.getElementById(this.ids.r);
        this.cpInputG = document.getElementById(this.ids.g);
        this.cpInputB = document.getElementById(this.ids.b);

        this.presetColors = [
            // Row 1: Grayscale
            '#000000', '#2c3e50', '#34495e', '#7f8c8d', '#95a5a6', '#bdc3c7', '#ecf0f1', '#ffffff',
            // Row 2: Reds & Oranges
            '#c0392b', '#e74c3c', '#ff4757', '#d35400', '#e67e22', '#f39c12', '#f1c40f', '#fdcb6e',
            // Row 3: Greens & Teals
            '#1e8449', '#27ae60', '#2ecc71', '#00d084', '#16a085', '#1abc9c', '#0abde3', '#48dbfb',
            // Row 4: Blues & Purples
            '#3498db', '#2980b9', '#00a8ff', '#74b9ff', '#1e3799', '#5f27cd', '#8e44ad', '#9b59b6',
            // Row 5: Pinks & Magentas
            '#b44ad6', '#9c88ff', '#e056fd', '#ff9ff3', '#fd79a8', '#ff7675', '#ff6b6b', '#ff6348'
        ];

        this.cpState = { h: 0, s: 0, v: 0 };
        this.isDraggingSaturation = false;
        this.isDraggingHue = false;
        this.activeTrigger = null;

        this.init();
    }

    init() {
        // Generate grid
        if (this.grid) {
            this.grid.innerHTML = '';
            this.presetColors.forEach(color => {
                const swatch = document.createElement('div');
                swatch.className = 'color-swatch';
                swatch.style.backgroundColor = color;
                swatch.onclick = () => this.selectColor(color);
                this.grid.appendChild(swatch);
            });
        }

        // Triggers (for popover mode)
        if (this.popover) {
            this.triggers.forEach(triggerObj => {
                const trigger = triggerObj.element;
                const preview = triggerObj.preview;
                
                if (trigger) {
                    trigger.addEventListener('click', (e) => {
                        e.stopPropagation();
                        if (!this.popover.classList.contains('hidden') && this.activeTrigger === trigger) {
                            this.popover.classList.add('hidden');
                            return;
                        }

                        this.activeTrigger = trigger;
                        this.openPopover(trigger, preview);
                    });
                }
            });

            // Close popover when clicking outside
            document.addEventListener('click', (e) => {
                if (this.popover.classList.contains('hidden')) return;
                
                // Keep open when drawing (clicking on canvas area)
                if (e.target.closest('.canvas-container')) return;
                if (e.target.closest('#avatar-canvas')) return;

                if (!this.popover.contains(e.target) && 
                    !this.triggers.some(t => t.element.contains(e.target))) {
                    this.popover.classList.add('hidden');
                }
            });

            this.popover.addEventListener('click', (e) => e.stopPropagation());

            window.addEventListener('resize', () => {
                if (!this.popover.classList.contains('hidden') && this.activeTrigger) {
                    this.positionPopover(this.activeTrigger);
                }
            });
        }

        // Custom Picker Interactions
        if (this.cpSaturationArea) {
            this.cpSaturationArea.addEventListener('mousedown', (e) => {
                this.isDraggingSaturation = true;
                this.updateSaturationFromEvent(e);
            });

            this.cpHueArea.addEventListener('mousedown', (e) => {
                this.isDraggingHue = true;
                this.updateHueFromEvent(e);
            });

            window.addEventListener('mousemove', (e) => {
                if (this.isDraggingSaturation) this.updateSaturationFromEvent(e);
                if (this.isDraggingHue) this.updateHueFromEvent(e);
            });

            window.addEventListener('mouseup', () => {
                this.isDraggingSaturation = false;
                this.isDraggingHue = false;
            });

            [this.cpInputR, this.cpInputG, this.cpInputB].forEach(input => {
                if(input) input.addEventListener('input', () => this.updateColorFromRGBInputs());
            });
        }

        // Listen to external input changes
        if (this.input) {
            this.input.addEventListener('input', () => {
                this.selectColor(this.input.value, false);
            });
            this.input.addEventListener('change', () => {
                this.selectColor(this.input.value, false);
            });
        }

        // Initialize with default color
        this.selectColor(this.initialColor, false);
    }

    openPopover(trigger, preview) {
        let currentColor = this.initialColor;
        if (preview) {
            const styleColor = window.getComputedStyle(preview).backgroundColor;
            const hex = rgbToHex(styleColor);
            if (hex) currentColor = hex;
        }

        this.selectColor(currentColor, false);
        this.popover.classList.remove('hidden');
        this.positionPopover(trigger);
    }

    positionPopover(trigger) {
        const rect = trigger.getBoundingClientRect();
        const popoverRect = this.popover.getBoundingClientRect();

        let top = rect.top - popoverRect.height - 10;
        let left = rect.left + (rect.width / 2) - (popoverRect.width / 2);

        if (top < 10) top = rect.bottom + 10;
        if (left < 10) left = 10;
        if (left + popoverRect.width > window.innerWidth - 10) {
            left = window.innerWidth - popoverRect.width - 10;
        }

        this.popover.style.top = `${top}px`;
        this.popover.style.left = `${left}px`;
    }

    updateSaturationFromEvent(e) {
        const rect = this.cpSaturationArea.getBoundingClientRect();
        let x = e.clientX - rect.left;
        let y = e.clientY - rect.top;

        x = Math.max(0, Math.min(x, rect.width));
        y = Math.max(0, Math.min(y, rect.height));

        this.cpState.s = x / rect.width;
        this.cpState.v = 1 - (y / rect.height);

        this.updateColorPickerVisuals();
        this.updateColorFromPicker();
    }

    updateHueFromEvent(e) {
        const rect = this.cpHueArea.getBoundingClientRect();
        let x = e.clientX - rect.left;
        x = Math.max(0, Math.min(x, rect.width));

        this.cpState.h = (x / rect.width) * 360;

        this.updateColorPickerVisuals();
        this.updateColorFromPicker();
    }

    updateColorFromRGBInputs() {
        const r = parseInt(this.cpInputR.value) || 0;
        const g = parseInt(this.cpInputG.value) || 0;
        const b = parseInt(this.cpInputB.value) || 0;

        const hsv = rgbToHsv(r, g, b);
        this.cpState = hsv;

        this.updateColorPickerVisuals();

        const hex = rgbToHex(`rgb(${r}, ${g}, ${b})`);
        this.applyColorSelection(hex);
    }

    updateColorPickerVisuals() {
        if(this.cpSaturationArea) this.cpSaturationArea.style.backgroundColor = `hsl(${this.cpState.h}, 100%, 50%)`;
        if(this.cpSaturationCursor) {
            this.cpSaturationCursor.style.left = `${this.cpState.s * 100}%`;
            this.cpSaturationCursor.style.top = `${(1 - this.cpState.v) * 100}%`;
            this.cpSaturationCursor.style.backgroundColor = hsvToRgbString(this.cpState.h, this.cpState.s, this.cpState.v);
        }
        if(this.cpHueCursor) this.cpHueCursor.style.left = `${(this.cpState.h / 360) * 100}%`;
    }

    updateColorFromPicker() {
        const rgb = hsvToRgb(this.cpState.h, this.cpState.s, this.cpState.v);
        const hex = rgbToHex(`rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`);
        this.applyColorSelection(hex);
        if(this.cpInputR) this.cpInputR.value = rgb.r;
        if(this.cpInputG) this.cpInputG.value = rgb.g;
        if(this.cpInputB) this.cpInputB.value = rgb.b;
    }

    selectColor(color, updateInput = true) {
        if (updateInput) this.applyColorSelection(color);

        const rgb = hexToRgb(color);
        if (rgb) {
            this.cpState = rgbToHsv(rgb.r, rgb.g, rgb.b);
            this.updateColorPickerVisuals();
            if(this.cpPreviewColor) this.cpPreviewColor.style.backgroundColor = color;
            if(this.cpInputR) this.cpInputR.value = rgb.r;
            if(this.cpInputG) this.cpInputG.value = rgb.g;
            if(this.cpInputB) this.cpInputB.value = rgb.b;
        }

        if (this.grid) {
            this.grid.querySelectorAll('.color-swatch').forEach(s => {
                if (rgbToHex(s.style.backgroundColor) === color.toLowerCase()) {
                    s.classList.add('active');
                } else {
                    s.classList.remove('active');
                }
            });
        }
    }

    applyColorSelection(hex) {
        if(this.cpPreviewColor) this.cpPreviewColor.style.backgroundColor = hex;
        if (this.input) {
            this.input.value = hex;
            // Dispatch input event to notify listeners (e.g. ToolsManager for cursor contrast)
            this.input.dispatchEvent(new Event('input'));
        }
        if (this.preview) this.preview.style.backgroundColor = hex;
        
        // Update trigger preview if active
        if (this.activeTrigger) {
             // Find the preview associated with this trigger
             const triggerObj = this.triggers.find(t => t.element === this.activeTrigger);
             if (triggerObj && triggerObj.preview) {
                 triggerObj.preview.style.backgroundColor = hex;
             }
        }

        if (this.onColorChange) this.onColorChange(hex);
    }
}