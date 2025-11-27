import { hexToRgb, rgbToHex, hsvToRgb, rgbToHsv, hsvToRgbString } from './utils.js';

export class ColorPickerManager {
    constructor(
        penColorInput, 
        colorGrid, 
        colorTrigger, 
        colorPopover, 
        currentColorPreview, 
        avatarColorTrigger, 
        avatarColorPreview, 
        emojiColorTrigger,
        emojiColorPreview,
        setAvatarColor,
        getActiveTarget,
        setActiveTarget,
        onColorChange
    ) {
        this.penColorInput = penColorInput;
        this.colorGrid = colorGrid;
        this.colorTrigger = colorTrigger;
        this.colorPopover = colorPopover;
        this.currentColorPreview = currentColorPreview;
        this.avatarColorTrigger = avatarColorTrigger;
        this.avatarColorPreview = avatarColorPreview;
        this.emojiColorTrigger = emojiColorTrigger;
        this.emojiColorPreview = emojiColorPreview;
        this.setAvatarColor = setAvatarColor;
        this.getActiveTarget = getActiveTarget;
        this.setActiveTarget = setActiveTarget;
        this.onColorChange = onColorChange;

        // Custom Picker Elements
        this.cpSaturationArea = document.getElementById('cp-saturation-area');
        this.cpSaturationCursor = document.getElementById('cp-saturation-cursor');
        this.cpHueArea = document.getElementById('cp-hue-area');
        this.cpHueCursor = document.getElementById('cp-hue-cursor');
        this.cpPreviewColor = document.getElementById('cp-preview-color');
        this.cpInputR = document.getElementById('cp-r');
        this.cpInputG = document.getElementById('cp-g');
        this.cpInputB = document.getElementById('cp-b');

        this.presetColors = [
            '#000000', '#ffffff', '#7f8c8d', '#c0392b', '#e74c3c',
            '#d35400', '#e67e22', '#f39c12', '#f1c40f', '#27ae60',
            '#2ecc71', '#16a085', '#1abc9c', '#2980b9', '#3498db',
            '#8e44ad', '#9b59b6', '#2c3e50', '#34495e', '#95a5a6'
        ];

        // Local state for picker internals
        this.cpState = { h: 0, s: 0, v: 0 };
        this.isDraggingSaturation = false;
        this.isDraggingHue = false;
        this.activeTrigger = null;

        this.init();
    }

    init() {
        // Generate grid
        this.colorGrid.innerHTML = '';
        this.presetColors.forEach(color => {
            const swatch = document.createElement('div');
            swatch.className = 'color-swatch';
            swatch.style.backgroundColor = color;
            swatch.onclick = () => this.selectColor(color);
            this.colorGrid.appendChild(swatch);
        });

        // Toggle popover for Game
        this.colorTrigger.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!this.colorPopover.classList.contains('hidden') && this.getActiveTarget() === 'game') {
                this.colorPopover.classList.add('hidden');
                return;
            }

            this.setActiveTarget('game');
            this.activeTrigger = this.colorTrigger;
            // Initialize picker state from current game color
            const rgb = hexToRgb(this.penColorInput.value);
            if (rgb) {
                this.cpState = rgbToHsv(rgb.r, rgb.g, rgb.b);
                this.updateColorPickerVisuals();
                this.cpPreviewColor.style.backgroundColor = this.penColorInput.value;
                this.cpInputR.value = rgb.r;
                this.cpInputG.value = rgb.g;
                this.cpInputB.value = rgb.b;
            }
            this.colorPopover.classList.remove('hidden');
            this.positionPopover(this.colorTrigger);
        });

        // Toggle popover for Avatar (Draw Mode)
        if (this.avatarColorTrigger) {
            this.avatarColorTrigger.addEventListener('click', (e) => {
                e.stopPropagation();
                if (!this.colorPopover.classList.contains('hidden') && this.getActiveTarget() === 'avatar' && this.activeTrigger === this.avatarColorTrigger) {
                    this.colorPopover.classList.add('hidden');
                    return;
                }

                this.setActiveTarget('avatar');
                this.activeTrigger = this.avatarColorTrigger;
                this.openAvatarColorPicker(this.avatarColorTrigger, this.avatarColorPreview);
            });
        }

        // Toggle popover for Avatar (Emoji Mode)
        if (this.emojiColorTrigger) {
            this.emojiColorTrigger.addEventListener('click', (e) => {
                e.stopPropagation();
                if (!this.colorPopover.classList.contains('hidden') && this.getActiveTarget() === 'avatar' && this.activeTrigger === this.emojiColorTrigger) {
                    this.colorPopover.classList.add('hidden');
                    return;
                }

                this.setActiveTarget('avatar');
                this.activeTrigger = this.emojiColorTrigger;
                this.openAvatarColorPicker(this.emojiColorTrigger, this.emojiColorPreview);
            });
        }

        // Close popover when clicking outside
        document.addEventListener('click', (e) => {
            // Keep open when drawing (clicking on canvas area)
            if (e.target.closest('.canvas-container')) return;
            if (e.target.closest('#avatar-canvas')) return; // Keep open when drawing on avatar

            if (!this.colorPopover.contains(e.target) && 
                !this.colorTrigger.contains(e.target) && 
                (!this.avatarColorTrigger || !this.avatarColorTrigger.contains(e.target)) &&
                (!this.emojiColorTrigger || !this.emojiColorTrigger.contains(e.target))) {
                this.colorPopover.classList.add('hidden');
            }
        });

        // Prevent closing when clicking inside popover
        this.colorPopover.addEventListener('click', (e) => {
            e.stopPropagation();
        });

        // Reposition on resize if open
        window.addEventListener('resize', () => {
            if (!this.colorPopover.classList.contains('hidden') && this.activeTrigger) {
                this.positionPopover(this.activeTrigger);
            }
        });

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
                input.addEventListener('input', () => this.updateColorFromRGBInputs());
            });
        }

        // Initialize with default color
        this.selectColor(this.penColorInput.value, false);
    }

    openAvatarColorPicker(trigger, preview) {
        let currentAvatarColor = '#000000';
        if (preview) {
             const styleColor = window.getComputedStyle(preview).backgroundColor;
             const hex = rgbToHex(styleColor);
             if (hex) currentAvatarColor = hex;
        }

        const rgb = hexToRgb(currentAvatarColor);
        if (rgb) {
            this.cpState = rgbToHsv(rgb.r, rgb.g, rgb.b);
            this.updateColorPickerVisuals();
            this.cpPreviewColor.style.backgroundColor = currentAvatarColor;
            this.cpInputR.value = rgb.r;
            this.cpInputG.value = rgb.g;
            this.cpInputB.value = rgb.b;
        }
        this.colorPopover.classList.remove('hidden');
        this.positionPopover(trigger);
    }

    positionPopover(trigger) {
        const rect = trigger.getBoundingClientRect();
        // We need to show it to get dimensions, but it's already shown by the caller
        const popoverRect = this.colorPopover.getBoundingClientRect();
        
        // Default: above the trigger, centered horizontally
        let top = rect.top - popoverRect.height - 10;
        let left = rect.left + (rect.width / 2) - (popoverRect.width / 2);
        
        // Check if it goes off screen top
        if (top < 10) {
            // Place below
            top = rect.bottom + 10;
        }
        
        // Check left/right bounds
        if (left < 10) left = 10;
        if (left + popoverRect.width > window.innerWidth - 10) {
            left = window.innerWidth - popoverRect.width - 10;
        }
        
        this.colorPopover.style.top = `${top}px`;
        this.colorPopover.style.left = `${left}px`;
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
        // Update Saturation Area Background (Hue)
        this.cpSaturationArea.style.backgroundColor = `hsl(${this.cpState.h}, 100%, 50%)`;

        // Update Cursors
        this.cpSaturationCursor.style.left = `${this.cpState.s * 100}%`;
        this.cpSaturationCursor.style.top = `${(1 - this.cpState.v) * 100}%`;
        this.cpHueCursor.style.left = `${(this.cpState.h / 360) * 100}%`;

        // Update Cursor Colors for visibility
        this.cpSaturationCursor.style.backgroundColor = hsvToRgbString(this.cpState.h, this.cpState.s, this.cpState.v);
    }

    updateColorFromPicker() {
        const rgb = hsvToRgb(this.cpState.h, this.cpState.s, this.cpState.v);
        const hex = rgbToHex(`rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`);
        
        this.applyColorSelection(hex);

        // Update Inputs without triggering event
        this.cpInputR.value = rgb.r;
        this.cpInputG.value = rgb.g;
        this.cpInputB.value = rgb.b;
        
        // Update active state in grid (likely none)
        document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
    }

    selectColor(color, updateInput = true) {
        if (updateInput) this.applyColorSelection(color);
        
        // Update custom picker state
        const rgb = hexToRgb(color);
        if (rgb) {
            this.cpState = rgbToHsv(rgb.r, rgb.g, rgb.b);
            this.updateColorPickerVisuals();
            this.cpPreviewColor.style.backgroundColor = color;
            this.cpInputR.value = rgb.r;
            this.cpInputG.value = rgb.g;
            this.cpInputB.value = rgb.b;
        }
        
        // Update active state in grid
        document.querySelectorAll('.color-swatch').forEach(s => {
            if (rgbToHex(s.style.backgroundColor) === color.toLowerCase()) {
                s.classList.add('active');
            } else {
                s.classList.remove('active');
            }
        });
    }

    applyColorSelection(hex) {
        this.cpPreviewColor.style.backgroundColor = hex;
        
        if (this.getActiveTarget() === 'game') {
            this.penColorInput.value = hex;
            this.currentColorPreview.style.backgroundColor = hex;
        } else if (this.getActiveTarget() === 'avatar') {
            this.setAvatarColor(hex);
            if (this.avatarColorPreview) this.avatarColorPreview.style.backgroundColor = hex;
            if (this.emojiColorPreview) this.emojiColorPreview.style.backgroundColor = hex;
        }
        
        if (this.onColorChange) this.onColorChange(hex);
    }
}
