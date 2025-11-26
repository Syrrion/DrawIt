import { performDraw, performFloodFill } from './draw.js';

export function initAvatarManager() {
    // DOM Elements
    const avatarCanvas = document.getElementById('avatar-canvas');
    const avatarCtx = avatarCanvas.getContext('2d', { willReadFrequently: true });
    const avatarPreview = document.getElementById('avatar-preview');
    const avatarColorInput = document.getElementById('avatar-color');
    // const avatarEmojiSelect = document.getElementById('avatar-emoji-select'); // Removed
    const avatarEmojiDisplay = document.getElementById('avatar-emoji');
    const avatarClearBtn = document.getElementById('avatar-clear-btn');
    const avatarUpload = document.getElementById('avatar-upload');
    const avatarPreviewDiv = document.getElementById('avatar-preview');
    const avatarSizeInput = document.getElementById('avatar-size');
    
    // New Elements for Image Mode
    const avatarZoomInput = document.getElementById('avatar-zoom');
    const avatarImageControls = document.getElementById('avatar-image-controls');
    const btnTriggerUpload = document.getElementById('btn-trigger-upload');

    // Tabs
    const tabEmoji = document.getElementById('tab-emoji');
    const tabDraw = document.getElementById('tab-draw');
    const tabUpload = document.getElementById('tab-upload');
    
    // Modes
    const modeEmoji = document.getElementById('mode-emoji');
    const modeDraw = document.getElementById('mode-draw');
    const modeUpload = document.getElementById('mode-upload');

    // Tools
    const avatarToolPen = document.getElementById('avatar-tool-pen');
    const avatarToolFill = document.getElementById('avatar-tool-fill');
    const avatarToolEraser = document.getElementById('avatar-tool-eraser');

    // State
    let avatarMode = 'emoji'; // 'emoji', 'draw', 'upload'
    let currentAvatarTool = 'pen';
    let currentAvatarColor = '#000000';
    let isAvatarDrawing = false;
    let lastAvatarX = 0;
    let lastAvatarY = 0;
    
    // Image Upload State
    let imgState = {
        img: null,
        x: 0,
        y: 0,
        scale: 1,
        isPanning: false,
        lastPanX: 0,
        lastPanY: 0
    };
    
    // Emoji State
    let emojiState = {
        color: '#3498db',
        emoji: '🎨'
    };

    // Custom Emoji Picker Logic
    const emojiTrigger = document.getElementById('emoji-picker-trigger');
    const emojiOptions = document.getElementById('emoji-options');
    const currentEmojiSpan = emojiTrigger ? emojiTrigger.querySelector('.current-emoji') : null;
    const emojiOptionElements = document.querySelectorAll('.emoji-option');

    if (emojiTrigger && emojiOptions) {
        emojiTrigger.addEventListener('click', (e) => {
            e.stopPropagation();
            emojiOptions.classList.toggle('hidden');

            if (!emojiOptions.classList.contains('hidden')) {
                // Check available space
                const rect = emojiTrigger.getBoundingClientRect();
                const pickerHeight = 320; // Max height + padding
                const spaceBelow = window.innerHeight - rect.bottom;
                
                if (spaceBelow < pickerHeight) {
                    emojiOptions.classList.add('open-up');
                } else {
                    emojiOptions.classList.remove('open-up');
                }
            }
        });

        // Close emoji picker when clicking outside
        document.addEventListener('click', (e) => {
            if (!emojiPickerWrapper.contains(e.target)) {
                emojiOptions.classList.add('hidden');
            }
        });

        emojiOptionElements.forEach(opt => {
            opt.addEventListener('click', () => {
                const val = opt.dataset.value;
                emojiState.emoji = val;
                avatarEmojiDisplay.textContent = val;
                if (currentEmojiSpan) currentEmojiSpan.textContent = val;
                emojiOptions.classList.add('hidden');
                
                // Update selected visual
                emojiOptionElements.forEach(o => o.classList.remove('selected'));
                opt.classList.add('selected');
            });
        });
    }

    // Initialize avatar canvas
    avatarCtx.fillStyle = '#ffffff';
    avatarCtx.fillRect(0, 0, 100, 100);

    // --- Tab Switching Logic ---
    function switchAvatarMode(mode) {
        avatarMode = mode;
        
        // Update tabs
        [tabEmoji, tabDraw, tabUpload].forEach(t => t.classList.remove('active'));
        if (mode === 'emoji') tabEmoji.classList.add('active');
        if (mode === 'draw') tabDraw.classList.add('active');
        if (mode === 'upload') tabUpload.classList.add('active');

        // Update content visibility
        [modeEmoji, modeDraw, modeUpload].forEach(m => m.classList.add('hidden'));
        if (mode === 'emoji') modeEmoji.classList.remove('hidden');
        if (mode === 'draw') modeDraw.classList.remove('hidden');
        if (mode === 'upload') modeUpload.classList.remove('hidden');

        // Update preview visibility
        if (mode === 'emoji') {
            avatarPreviewDiv.classList.remove('hidden');
            avatarCanvas.classList.add('hidden');
        } else {
            avatarPreviewDiv.classList.add('hidden');
            avatarCanvas.classList.remove('hidden');
        }
        
        // If switching to upload and we have an image, redraw it
        if (mode === 'upload' && imgState.img) {
            drawAvatarImage();
        } else if (mode === 'upload' && !imgState.img) {
             // Clear canvas if no image
             avatarCtx.fillStyle = '#ffffff';
             avatarCtx.fillRect(0, 0, 100, 100);
        }
    }

    tabEmoji.addEventListener('click', () => switchAvatarMode('emoji'));
    tabDraw.addEventListener('click', () => switchAvatarMode('draw'));
    tabUpload.addEventListener('click', () => switchAvatarMode('upload'));

    // --- Emoji Logic ---
    if (avatarColorInput) {
        avatarColorInput.addEventListener('input', (e) => {
            emojiState.color = e.target.value;
            avatarPreview.style.backgroundColor = e.target.value;
        });
    }

    // --- Drawing Logic ---
    function updateAvatarTool(activeBtn) {
        [avatarToolPen, avatarToolFill, avatarToolEraser].forEach(btn => btn.classList.remove('active'));
        activeBtn.classList.add('active');
    }

    avatarToolPen.addEventListener('click', () => {
        currentAvatarTool = 'pen';
        updateAvatarTool(avatarToolPen);
    });

    avatarToolFill.addEventListener('click', () => {
        currentAvatarTool = 'fill';
        updateAvatarTool(avatarToolFill);
    });

    avatarToolEraser.addEventListener('click', () => {
        currentAvatarTool = 'eraser';
        updateAvatarTool(avatarToolEraser);
    });

    function getAvatarMousePos(e) {
        const rect = avatarCanvas.getBoundingClientRect();
        const scaleX = avatarCanvas.width / rect.width;
        const scaleY = avatarCanvas.height / rect.height;
        
        return {
            x: (e.clientX - rect.left) * scaleX,
            y: (e.clientY - rect.top) * scaleY
        };
    }

    avatarCanvas.addEventListener('mousedown', (e) => {
        if (avatarMode === 'upload') {
            if (!imgState.img) {
                avatarUpload.click();
                return;
            }
            imgState.isPanning = true;
            imgState.lastPanX = e.clientX;
            imgState.lastPanY = e.clientY;
            return;
        }

        const { x, y } = getAvatarMousePos(e);

        if (currentAvatarTool === 'fill') {
            performFloodFill(avatarCtx, 100, 100, Math.floor(x), Math.floor(y), currentAvatarColor);
            return;
        }

        isAvatarDrawing = true;
        [lastAvatarX, lastAvatarY] = [x, y];
        
        const size = avatarSizeInput ? parseInt(avatarSizeInput.value) : 3;
        performDraw(avatarCtx, x, y, x, y, currentAvatarColor, size, 1, currentAvatarTool);
    });

    avatarCanvas.addEventListener('mousemove', (e) => {
        if (avatarMode === 'upload') {
            if (!imgState.isPanning || !imgState.img) return;
            const dx = e.clientX - imgState.lastPanX;
            const dy = e.clientY - imgState.lastPanY;
            
            // Convert screen delta to canvas delta
            const rect = avatarCanvas.getBoundingClientRect();
            const scaleX = avatarCanvas.width / rect.width;
            const scaleY = avatarCanvas.height / rect.height;
            
            imgState.x += dx * scaleX;
            imgState.y += dy * scaleY;
            
            imgState.lastPanX = e.clientX;
            imgState.lastPanY = e.clientY;
            
            drawAvatarImage();
            return;
        }

        if (!isAvatarDrawing) return;
        const { x, y } = getAvatarMousePos(e);
        
        const size = avatarSizeInput ? parseInt(avatarSizeInput.value) : 3;
        performDraw(avatarCtx, lastAvatarX, lastAvatarY, x, y, currentAvatarColor, size, 1, currentAvatarTool);
        [lastAvatarX, lastAvatarY] = [x, y];
    });

    const stopAction = () => {
        isAvatarDrawing = false;
        imgState.isPanning = false;
    };

    avatarCanvas.addEventListener('mouseup', stopAction);
    avatarCanvas.addEventListener('mouseout', stopAction);

    // Touch Support
    function handleAvatarTouch(e) {
        if (e.type !== 'touchend' && e.touches.length !== 1) return;
        if (e.cancelable) e.preventDefault();
        
        const touch = e.type === 'touchend' ? e.changedTouches[0] : e.touches[0];
        const typeMap = {
            'touchstart': 'mousedown',
            'touchmove': 'mousemove',
            'touchend': 'mouseup'
        };
        
        const mouseEvent = new MouseEvent(typeMap[e.type], {
            clientX: touch.clientX,
            clientY: touch.clientY,
            button: 0,
            bubbles: true,
            cancelable: true,
            view: window
        });
        
        avatarCanvas.dispatchEvent(mouseEvent);
    }

    avatarCanvas.addEventListener('touchstart', handleAvatarTouch, { passive: false });
    avatarCanvas.addEventListener('touchmove', handleAvatarTouch, { passive: false });
    avatarCanvas.addEventListener('touchend', handleAvatarTouch, { passive: false });

    avatarCanvas.addEventListener('wheel', (e) => {
        if (avatarMode === 'upload' && imgState.img) {
            e.preventDefault();
            const delta = -Math.sign(e.deltaY) * 0.1;
            let newScale = imgState.scale + delta;
            
            // Clamp scale
            const maxZoom = parseFloat(avatarZoomInput.max) || 3;
            const minZoom = parseFloat(avatarZoomInput.min) || 0.1;
            newScale = Math.max(minZoom, Math.min(maxZoom, newScale));
            
            imgState.scale = newScale;
            if (avatarZoomInput) avatarZoomInput.value = newScale;
            drawAvatarImage();
        }
    }, { passive: false });

    avatarClearBtn.addEventListener('click', () => {
        avatarCtx.fillStyle = '#ffffff';
        avatarCtx.fillRect(0, 0, 100, 100);
    });

    // --- Upload Logic ---
    if (btnTriggerUpload) {
        btnTriggerUpload.addEventListener('click', () => {
            avatarUpload.click();
        });
    }

    function drawAvatarImage() {
        if (!imgState.img) return;
        
        avatarCtx.fillStyle = '#ffffff';
        avatarCtx.fillRect(0, 0, 100, 100);
        
        const w = imgState.img.width;
        const h = imgState.img.height;
        
        // Calculate scaled dimensions
        const baseScale = Math.min(100 / w, 100 / h);
        const currentScale = baseScale * imgState.scale;
        
        const drawW = w * currentScale;
        const drawH = h * currentScale;
        
        avatarCtx.save();
        avatarCtx.translate(imgState.x, imgState.y);
        avatarCtx.drawImage(imgState.img, 0, 0, drawW, drawH);
        avatarCtx.restore();
    }

    avatarUpload.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                const img = new Image();
                img.onload = () => {
                    imgState.img = img;
                    imgState.x = 0;
                    imgState.y = 0;
                    imgState.scale = 1;
                    
                    // Center the image initially
                    const baseScale = Math.min(100 / img.width, 100 / img.height);
                    const drawW = img.width * baseScale;
                    const drawH = img.height * baseScale;
                    imgState.x = (100 - drawW) / 2;
                    imgState.y = (100 - drawH) / 2;
                    
                    if (avatarZoomInput) {
                        avatarZoomInput.value = 1;
                        // Calculate max zoom based on image size
                        // Allow zooming up to 100% of original size (1/baseScale)
                        // But keep a minimum of 3x zoom
                        const maxZoom = Math.max(3, 1 / baseScale);
                        avatarZoomInput.max = maxZoom;
                        avatarZoomInput.step = maxZoom / 50; // Adjust step for smoother experience
                    }
                    
                    if (avatarImageControls) avatarImageControls.classList.remove('hidden');
                    
                    drawAvatarImage();
                };
                img.src = event.target.result;
            };
            reader.readAsDataURL(file);
        }
    });
    
    if (avatarZoomInput) {
        avatarZoomInput.addEventListener('input', (e) => {
            imgState.scale = parseFloat(e.target.value);
            drawAvatarImage();
        });
    }

    // Randomize Avatar on Init
    function randomizeAvatar() {
        // Random Color (Pastel to Dark)
        // Hue: 0-360, Saturation: 50-90%, Lightness: 20-80%
        const h = Math.floor(Math.random() * 360);
        const s = Math.floor(Math.random() * 40) + 50; // 50-90%
        const l = Math.floor(Math.random() * 60) + 20; // 20-80%
        
        // Convert HSL to Hex
        const hslToHex = (h, s, l) => {
            l /= 100;
            const a = s * Math.min(l, 1 - l) / 100;
            const f = n => {
                const k = (n + h / 30) % 12;
                const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
                return Math.round(255 * color).toString(16).padStart(2, '0');
            };
            return `#${f(0)}${f(8)}${f(4)}`;
        };

        const randomColor = hslToHex(h, s, l);
        
        // Random Emoji
        if (emojiOptionElements.length > 0) {
            const randomIndex = Math.floor(Math.random() * emojiOptionElements.length);
            const randomOption = emojiOptionElements[randomIndex];
            const val = randomOption.dataset.value;
            
            // Update State
            emojiState.color = randomColor;
            emojiState.emoji = val;
            currentAvatarColor = randomColor;
            
            // Update UI
            avatarPreview.style.backgroundColor = randomColor;
            avatarEmojiDisplay.textContent = val;
            if (currentEmojiSpan) currentEmojiSpan.textContent = val;
            
            // Update Color Picker Preview if exists
            const emojiColorPreview = document.getElementById('emoji-color-preview');
            if (emojiColorPreview) emojiColorPreview.style.backgroundColor = randomColor;
            
            // Update Selected Class
            emojiOptionElements.forEach(o => o.classList.remove('selected'));
            randomOption.classList.add('selected');
        }
    }

    const btnRandomAvatar = document.getElementById('btn-random-avatar');
    if (btnRandomAvatar) {
        btnRandomAvatar.addEventListener('click', randomizeAvatar);
    }

    // Initial Randomization
    randomizeAvatar();

    return {
        setAvatarColor: (color) => { 
            currentAvatarColor = color; 
            emojiState.color = color;
            if (avatarPreview) avatarPreview.style.backgroundColor = color;
        },
        getAvatarData: () => {
            if (avatarMode === 'emoji') {
                return { 
                    type: 'emoji', 
                    emoji: emojiState.emoji, 
                    color: emojiState.color 
                };
            } else {
                return { 
                    type: 'image', 
                    value: avatarCanvas.toDataURL() 
                };
            }
        }
    };
}
