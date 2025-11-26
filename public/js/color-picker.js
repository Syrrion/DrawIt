import { hexToRgb, rgbToHex, hsvToRgb, rgbToHsv, hsvToRgbString } from './utils.js';

export function initColorPicker(
    penColorInput, 
    colorGrid, 
    colorTrigger, 
    colorPopover, 
    currentColorPreview, 
    avatarColorTrigger, 
    avatarColorPreview, 
    setAvatarColor,
    getActiveTarget,
    setActiveTarget,
    onColorChange
) {
    // Custom Picker Elements
    const cpSaturationArea = document.getElementById('cp-saturation-area');
    const cpSaturationCursor = document.getElementById('cp-saturation-cursor');
    const cpHueArea = document.getElementById('cp-hue-area');
    const cpHueCursor = document.getElementById('cp-hue-cursor');
    const cpPreviewColor = document.getElementById('cp-preview-color');
    const cpInputR = document.getElementById('cp-r');
    const cpInputG = document.getElementById('cp-g');
    const cpInputB = document.getElementById('cp-b');

    const presetColors = [
        '#000000', '#ffffff', '#7f8c8d', '#c0392b', '#e74c3c',
        '#d35400', '#e67e22', '#f39c12', '#f1c40f', '#27ae60',
        '#2ecc71', '#16a085', '#1abc9c', '#2980b9', '#3498db',
        '#8e44ad', '#9b59b6', '#2c3e50', '#34495e', '#95a5a6'
    ];

    // Local state for picker internals
    let cpState = { h: 0, s: 0, v: 0 };
    let isDraggingSaturation = false;
    let isDraggingHue = false;
    // We use the callbacks for external state (activeColorTarget, currentAvatarColor)

    function init() {
        // Generate grid
        colorGrid.innerHTML = '';
        presetColors.forEach(color => {
            const swatch = document.createElement('div');
            swatch.className = 'color-swatch';
            swatch.style.backgroundColor = color;
            swatch.onclick = () => selectColor(color);
            colorGrid.appendChild(swatch);
        });

        // Toggle popover for Game
        colorTrigger.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!colorPopover.classList.contains('hidden') && getActiveTarget() === 'game') {
                colorPopover.classList.add('hidden');
                return;
            }

            setActiveTarget('game');
            // Initialize picker state from current game color
            const rgb = hexToRgb(penColorInput.value);
            if (rgb) {
                cpState = rgbToHsv(rgb.r, rgb.g, rgb.b);
                updateColorPickerVisuals();
                cpPreviewColor.style.backgroundColor = penColorInput.value;
                cpInputR.value = rgb.r;
                cpInputG.value = rgb.g;
                cpInputB.value = rgb.b;
            }
            colorPopover.classList.remove('hidden');
            positionPopover(colorTrigger);
        });

        // Toggle popover for Avatar
        if (avatarColorTrigger) {
            avatarColorTrigger.addEventListener('click', (e) => {
                e.stopPropagation();
                if (!colorPopover.classList.contains('hidden') && getActiveTarget() === 'avatar') {
                    colorPopover.classList.add('hidden');
                    return;
                }

                setActiveTarget('avatar');
                // We need to get the current avatar color. 
                // Since we don't have a getter for it passed in, we can rely on the preview background color 
                // or we should have asked for a getter. 
                // For now, let's use the preview background color if available, or default to black.
                let currentAvatarColor = '#000000';
                if (avatarColorPreview) {
                     // rgbToHex might be needed if style.backgroundColor returns rgb()
                     // But let's assume we can parse it or it's set as hex.
                     // Actually style.backgroundColor usually returns rgb(...)
                     // We can use the helper if needed, but let's try to use the value we set.
                     // Wait, we don't have access to the variable `currentAvatarColor` from client.js directly.
                     // We only have `setAvatarColor`.
                     // Let's assume the preview element has the color.
                     const styleColor = window.getComputedStyle(avatarColorPreview).backgroundColor;
                     const hex = rgbToHex(styleColor);
                     if (hex) currentAvatarColor = hex;
                }

                const rgb = hexToRgb(currentAvatarColor);
                if (rgb) {
                    cpState = rgbToHsv(rgb.r, rgb.g, rgb.b);
                    updateColorPickerVisuals();
                    cpPreviewColor.style.backgroundColor = currentAvatarColor;
                    cpInputR.value = rgb.r;
                    cpInputG.value = rgb.g;
                    cpInputB.value = rgb.b;
                }
                colorPopover.classList.remove('hidden');
                positionPopover(avatarColorTrigger);
            });
        }

        // Close popover when clicking outside
        document.addEventListener('click', (e) => {
            // Keep open when drawing (clicking on canvas area)
            if (e.target.closest('.canvas-container')) return;
            if (e.target.closest('#avatar-canvas')) return; // Keep open when drawing on avatar

            if (!colorPopover.contains(e.target) && 
                !colorTrigger.contains(e.target) && 
                (!avatarColorTrigger || !avatarColorTrigger.contains(e.target))) {
                colorPopover.classList.add('hidden');
            }
        });

        // Prevent closing when clicking inside popover
        colorPopover.addEventListener('click', (e) => {
            e.stopPropagation();
        });

        // Reposition on resize if open
        window.addEventListener('resize', () => {
            if (!colorPopover.classList.contains('hidden')) {
                const trigger = getActiveTarget() === 'game' ? colorTrigger : avatarColorTrigger;
                if (trigger) positionPopover(trigger);
            }
        });

        // Custom Picker Interactions
        if (cpSaturationArea) {
            cpSaturationArea.addEventListener('mousedown', (e) => {
                isDraggingSaturation = true;
                updateSaturationFromEvent(e);
            });

            cpHueArea.addEventListener('mousedown', (e) => {
                isDraggingHue = true;
                updateHueFromEvent(e);
            });

            window.addEventListener('mousemove', (e) => {
                if (isDraggingSaturation) updateSaturationFromEvent(e);
                if (isDraggingHue) updateHueFromEvent(e);
            });

            window.addEventListener('mouseup', () => {
                isDraggingSaturation = false;
                isDraggingHue = false;
            });

            [cpInputR, cpInputG, cpInputB].forEach(input => {
                input.addEventListener('input', updateColorFromRGBInputs);
            });
        }

        // Initialize with default color
        selectColor(penColorInput.value, false);
    }

    function positionPopover(trigger) {
        const rect = trigger.getBoundingClientRect();
        // We need to show it to get dimensions, but it's already shown by the caller
        const popoverRect = colorPopover.getBoundingClientRect();
        
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
        
        colorPopover.style.top = `${top}px`;
        colorPopover.style.left = `${left}px`;
    }

    function updateSaturationFromEvent(e) {
        const rect = cpSaturationArea.getBoundingClientRect();
        let x = e.clientX - rect.left;
        let y = e.clientY - rect.top;

        x = Math.max(0, Math.min(x, rect.width));
        y = Math.max(0, Math.min(y, rect.height));

        cpState.s = x / rect.width;
        cpState.v = 1 - (y / rect.height);

        updateColorPickerVisuals();
        updateColorFromPicker();
    }

    function updateHueFromEvent(e) {
        const rect = cpHueArea.getBoundingClientRect();
        let x = e.clientX - rect.left;
        x = Math.max(0, Math.min(x, rect.width));

        cpState.h = (x / rect.width) * 360;

        updateColorPickerVisuals();
        updateColorFromPicker();
    }

    function updateColorFromRGBInputs() {
        const r = parseInt(cpInputR.value) || 0;
        const g = parseInt(cpInputG.value) || 0;
        const b = parseInt(cpInputB.value) || 0;

        const hsv = rgbToHsv(r, g, b);
        cpState = hsv;

        updateColorPickerVisuals();
        
        const hex = rgbToHex(`rgb(${r}, ${g}, ${b})`);
        applyColorSelection(hex);
    }

    function updateColorPickerVisuals() {
        // Update Saturation Area Background (Hue)
        cpSaturationArea.style.backgroundColor = `hsl(${cpState.h}, 100%, 50%)`;

        // Update Cursors
        cpSaturationCursor.style.left = `${cpState.s * 100}%`;
        cpSaturationCursor.style.top = `${(1 - cpState.v) * 100}%`;
        cpHueCursor.style.left = `${(cpState.h / 360) * 100}%`;

        // Update Cursor Colors for visibility
        cpSaturationCursor.style.backgroundColor = hsvToRgbString(cpState.h, cpState.s, cpState.v);
    }

    function updateColorFromPicker() {
        const rgb = hsvToRgb(cpState.h, cpState.s, cpState.v);
        const hex = rgbToHex(`rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`);
        
        applyColorSelection(hex);

        // Update Inputs without triggering event
        cpInputR.value = rgb.r;
        cpInputG.value = rgb.g;
        cpInputB.value = rgb.b;
        
        // Update active state in grid (likely none)
        document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
    }

    function selectColor(color, updateInput = true) {
        if (updateInput) applyColorSelection(color);
        
        // Update custom picker state
        const rgb = hexToRgb(color);
        if (rgb) {
            cpState = rgbToHsv(rgb.r, rgb.g, rgb.b);
            updateColorPickerVisuals();
            cpPreviewColor.style.backgroundColor = color;
            cpInputR.value = rgb.r;
            cpInputG.value = rgb.g;
            cpInputB.value = rgb.b;
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

    function applyColorSelection(hex) {
        cpPreviewColor.style.backgroundColor = hex;
        
        if (getActiveTarget() === 'game') {
            penColorInput.value = hex;
            currentColorPreview.style.backgroundColor = hex;
        } else if (getActiveTarget() === 'avatar') {
            setAvatarColor(hex);
            if (avatarColorPreview) avatarColorPreview.style.backgroundColor = hex;
        }
        
        if (onColorChange) onColorChange(hex);
    }

    init();

    return {
        // No need to expose getCurrentAvatarColor as we use callbacks
    };
}
