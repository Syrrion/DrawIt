import { performDraw, performFloodFill } from './draw.js';

export class AvatarManager {
    constructor() {
        // DOM Elements
        this.avatarCanvas = document.getElementById('avatar-canvas');
        this.avatarCtx = this.avatarCanvas.getContext('2d', { willReadFrequently: true });
        this.avatarPreview = document.getElementById('avatar-preview');
        this.avatarColorInput = document.getElementById('avatar-color');
        this.avatarEmojiDisplay = document.getElementById('avatar-emoji');
        this.avatarClearBtn = document.getElementById('avatar-clear-btn');
        this.avatarUpload = document.getElementById('avatar-upload');
        this.avatarPreviewDiv = document.getElementById('avatar-preview');
        this.avatarSizeInput = document.getElementById('avatar-size');
        
        // Color Previews
        this.emojiColorPreview = document.getElementById('emoji-color-preview');
        this.avatarColorPreview = document.getElementById('avatar-color-preview');

        // New Elements for Image Mode
        this.avatarZoomInput = document.getElementById('avatar-zoom');
        this.avatarImageControls = document.getElementById('avatar-image-controls');
        this.btnTriggerUpload = document.getElementById('btn-trigger-upload');

        // Tabs
        this.tabEmoji = document.getElementById('tab-emoji');
        this.tabDraw = document.getElementById('tab-draw');
        this.tabUpload = document.getElementById('tab-upload');
        
        // Modes
        this.modeEmoji = document.getElementById('mode-emoji');
        this.modeDraw = document.getElementById('mode-draw');
        this.modeUpload = document.getElementById('mode-upload');

        // Tools
        this.avatarToolPen = document.getElementById('avatar-tool-pen');
        this.avatarToolFill = document.getElementById('avatar-tool-fill');
        this.avatarToolEraser = document.getElementById('avatar-tool-eraser');

        // State
        this.avatarMode = 'emoji'; // 'emoji', 'draw', 'upload'
        this.currentAvatarTool = 'pen';
        this.currentAvatarColor = '#000000';
        this.isAvatarDrawing = false;
        this.lastAvatarX = 0;
        this.lastAvatarY = 0;
        
        // Image Upload State
        this.imgState = {
            img: null,
            x: 0,
            y: 0,
            scale: 1,
            isPanning: false,
            lastPanX: 0,
            lastPanY: 0
        };
        
        // Emoji State
        this.emojiState = {
            color: '#3498db',
            emoji: '🎨'
        };

        // Custom Emoji Picker Logic
        this.emojiPickerWrapper = document.getElementById('emoji-picker-wrapper');
        this.emojiTrigger = document.getElementById('emoji-picker-trigger');
        this.emojiOptions = document.getElementById('emoji-options');
        this.currentEmojiSpan = this.emojiTrigger ? this.emojiTrigger.querySelector('.current-emoji') : null;
        this.emojiOptionElements = document.querySelectorAll('.emoji-option');

        this.init();
    }

    init() {
        // Initialize avatar canvas
        this.avatarCtx.fillStyle = '#ffffff';
        this.avatarCtx.fillRect(0, 0, 100, 100);

        if (this.emojiTrigger && this.emojiOptions) {
            this.emojiTrigger.addEventListener('click', (e) => {
                e.stopPropagation();
                this.emojiOptions.classList.toggle('hidden');

                if (!this.emojiOptions.classList.contains('hidden')) {
                    // Check available space
                    const rect = this.emojiTrigger.getBoundingClientRect();
                    const pickerHeight = 320; // Max height + padding
                    const spaceBelow = window.innerHeight - rect.bottom;
                    
                    if (spaceBelow < pickerHeight) {
                        this.emojiOptions.classList.add('open-up');
                    } else {
                        this.emojiOptions.classList.remove('open-up');
                    }
                }
            });

            // Close emoji picker when clicking outside
            document.addEventListener('click', (e) => {
                if (!this.emojiPickerWrapper.contains(e.target)) {
                    this.emojiOptions.classList.add('hidden');
                }
            });

            this.emojiOptionElements.forEach(opt => {
                opt.addEventListener('click', () => {
                    const val = opt.dataset.value;
                    this.emojiState.emoji = val;
                    this.avatarEmojiDisplay.textContent = val;
                    if (this.currentEmojiSpan) this.currentEmojiSpan.textContent = val;
                    this.emojiOptions.classList.add('hidden');
                    
                    // Update selected visual
                    this.emojiOptionElements.forEach(o => o.classList.remove('selected'));
                    opt.classList.add('selected');
                });
            });
        }

        this.tabEmoji.addEventListener('click', () => this.switchAvatarMode('emoji'));
        this.tabDraw.addEventListener('click', () => this.switchAvatarMode('draw'));
        this.tabUpload.addEventListener('click', () => this.switchAvatarMode('upload'));

        this.avatarToolPen.addEventListener('click', () => {
            this.currentAvatarTool = 'pen';
            this.updateAvatarTool(this.avatarToolPen);
        });

        this.avatarToolFill.addEventListener('click', () => {
            this.currentAvatarTool = 'fill';
            this.updateAvatarTool(this.avatarToolFill);
        });

        this.avatarToolEraser.addEventListener('click', () => {
            this.currentAvatarTool = 'eraser';
            this.updateAvatarTool(this.avatarToolEraser);
        });

        this.avatarCanvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        this.avatarCanvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));

        const stopAction = () => {
            this.isAvatarDrawing = false;
            this.imgState.isPanning = false;
        };

        window.addEventListener('mouseup', stopAction);

        this.avatarCanvas.addEventListener('touchstart', (e) => this.handleAvatarTouch(e), { passive: false });
        this.avatarCanvas.addEventListener('touchmove', (e) => this.handleAvatarTouch(e), { passive: false });
        this.avatarCanvas.addEventListener('touchend', (e) => this.handleAvatarTouch(e), { passive: false });

        this.avatarCanvas.addEventListener('wheel', (e) => this.handleWheel(e), { passive: false });

        this.avatarClearBtn.addEventListener('click', () => {
            this.avatarCtx.fillStyle = '#ffffff';
            this.avatarCtx.fillRect(0, 0, 100, 100);
        });

        if (this.btnTriggerUpload) {
            this.btnTriggerUpload.addEventListener('click', () => {
                this.avatarUpload.click();
            });
        }

        this.avatarUpload.addEventListener('change', (e) => this.handleUpload(e));
        
        if (this.avatarZoomInput) {
            this.avatarZoomInput.addEventListener('input', (e) => {
                this.imgState.scale = parseFloat(e.target.value);
                this.drawAvatarImage();
            });
        }

        const btnRandomAvatar = document.getElementById('btn-random-avatar');
        if (btnRandomAvatar) {
            btnRandomAvatar.addEventListener('click', () => this.randomizeAvatar());
        }

        this.loadAvatar();
    }

    switchAvatarMode(mode) {
        this.avatarMode = mode;
        
        // Update tabs
        [this.tabEmoji, this.tabDraw, this.tabUpload].forEach(t => t.classList.remove('active'));
        if (mode === 'emoji') this.tabEmoji.classList.add('active');
        if (mode === 'draw') this.tabDraw.classList.add('active');
        if (mode === 'upload') this.tabUpload.classList.add('active');

        // Update content visibility
        [this.modeEmoji, this.modeDraw, this.modeUpload].forEach(m => m.classList.add('hidden'));
        if (mode === 'emoji') this.modeEmoji.classList.remove('hidden');
        if (mode === 'draw') this.modeDraw.classList.remove('hidden');
        if (mode === 'upload') this.modeUpload.classList.remove('hidden');

        // Update preview visibility
        if (mode === 'emoji') {
            this.avatarPreviewDiv.classList.remove('hidden');
            this.avatarCanvas.classList.add('hidden');
        } else {
            this.avatarPreviewDiv.classList.add('hidden');
            this.avatarCanvas.classList.remove('hidden');
        }
        
        // If switching to upload and we have an image, redraw it
        if (mode === 'upload' && this.imgState.img) {
            this.drawAvatarImage();
        } else if (mode === 'upload' && !this.imgState.img) {
             // Clear canvas if no image
             this.avatarCtx.fillStyle = '#ffffff';
             this.avatarCtx.fillRect(0, 0, 100, 100);
        }
    }

    updateAvatarTool(activeBtn) {
        [this.avatarToolPen, this.avatarToolFill, this.avatarToolEraser].forEach(btn => btn.classList.remove('active'));
        activeBtn.classList.add('active');
    }

    getAvatarMousePos(e) {
        const rect = this.avatarCanvas.getBoundingClientRect();
        const scaleX = this.avatarCanvas.width / rect.width;
        const scaleY = this.avatarCanvas.height / rect.height;
        
        return {
            x: (e.clientX - rect.left) * scaleX,
            y: (e.clientY - rect.top) * scaleY
        };
    }

    handleMouseDown(e) {
        if (this.avatarMode === 'upload') {
            if (!this.imgState.img) {
                this.avatarUpload.click();
                return;
            }
            this.imgState.isPanning = true;
            this.imgState.lastPanX = e.clientX;
            this.imgState.lastPanY = e.clientY;
            return;
        }

        const { x, y } = this.getAvatarMousePos(e);

        if (this.currentAvatarTool === 'fill') {
            performFloodFill(this.avatarCtx, 100, 100, Math.floor(x), Math.floor(y), this.currentAvatarColor);
            return;
        }

        this.isAvatarDrawing = true;
        [this.lastAvatarX, this.lastAvatarY] = [x, y];
        
        const size = this.avatarSizeInput ? parseInt(this.avatarSizeInput.value) : 3;
        performDraw(this.avatarCtx, x, y, x, y, this.currentAvatarColor, size, 1, this.currentAvatarTool);
    }

    handleMouseMove(e) {
        if (this.avatarMode === 'upload') {
            if (!this.imgState.isPanning || !this.imgState.img) return;
            const dx = e.clientX - this.imgState.lastPanX;
            const dy = e.clientY - this.imgState.lastPanY;
            
            // Convert screen delta to canvas delta
            const rect = this.avatarCanvas.getBoundingClientRect();
            const scaleX = this.avatarCanvas.width / rect.width;
            const scaleY = this.avatarCanvas.height / rect.height;
            
            this.imgState.x += dx * scaleX;
            this.imgState.y += dy * scaleY;
            
            this.imgState.lastPanX = e.clientX;
            this.imgState.lastPanY = e.clientY;
            
            this.drawAvatarImage();
            return;
        }

        if (!this.isAvatarDrawing) return;
        const { x, y } = this.getAvatarMousePos(e);
        
        const size = this.avatarSizeInput ? parseInt(this.avatarSizeInput.value) : 3;
        performDraw(this.avatarCtx, this.lastAvatarX, this.lastAvatarY, x, y, this.currentAvatarColor, size, 1, this.currentAvatarTool);
        [this.lastAvatarX, this.lastAvatarY] = [x, y];
    }

    handleAvatarTouch(e) {
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
        
        this.avatarCanvas.dispatchEvent(mouseEvent);
    }

    handleWheel(e) {
        if (this.avatarMode === 'upload' && this.imgState.img) {
            e.preventDefault();
            const delta = -Math.sign(e.deltaY) * 0.1;
            let newScale = this.imgState.scale + delta;
            
            // Clamp scale
            const maxZoom = parseFloat(this.avatarZoomInput.max) || 3;
            const minZoom = parseFloat(this.avatarZoomInput.min) || 0.1;
            newScale = Math.max(minZoom, Math.min(maxZoom, newScale));
            
            this.imgState.scale = newScale;
            if (this.avatarZoomInput) this.avatarZoomInput.value = newScale;
            this.drawAvatarImage();
        }
    }

    drawAvatarImage() {
        if (!this.imgState.img) return;
        
        this.avatarCtx.fillStyle = '#ffffff';
        this.avatarCtx.fillRect(0, 0, 100, 100);
        
        const w = this.imgState.img.width;
        const h = this.imgState.img.height;
        
        // Calculate scaled dimensions
        const baseScale = Math.min(100 / w, 100 / h);
        const currentScale = baseScale * this.imgState.scale;
        
        const drawW = w * currentScale;
        const drawH = h * currentScale;
        
        this.avatarCtx.save();
        this.avatarCtx.translate(this.imgState.x, this.imgState.y);
        this.avatarCtx.drawImage(this.imgState.img, 0, 0, drawW, drawH);
        this.avatarCtx.restore();
    }

    handleUpload(e) {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                const img = new Image();
                img.onload = () => {
                    this.imgState.img = img;
                    this.imgState.x = 0;
                    this.imgState.y = 0;
                    this.imgState.scale = 1;
                    
                    // Center the image initially
                    const baseScale = Math.min(100 / img.width, 100 / img.height);
                    const drawW = img.width * baseScale;
                    const drawH = img.height * baseScale;
                    this.imgState.x = (100 - drawW) / 2;
                    this.imgState.y = (100 - drawH) / 2;
                    
                    if (this.avatarZoomInput) {
                        this.avatarZoomInput.value = 1;
                        // Calculate max zoom based on image size
                        // Allow zooming up to 100% of original size (1/baseScale)
                        // But keep a minimum of 3x zoom
                        const maxZoom = Math.max(3, 1 / baseScale);
                        this.avatarZoomInput.max = maxZoom;
                        this.avatarZoomInput.step = maxZoom / 50; // Adjust step for smoother experience
                    }
                    
                    if (this.avatarImageControls) this.avatarImageControls.classList.remove('hidden');
                    
                    this.drawAvatarImage();
                };
                img.src = event.target.result;
            };
            reader.readAsDataURL(file);
        }
    }

    randomizeAvatar() {
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
        if (this.emojiOptionElements.length > 0) {
            const randomIndex = Math.floor(Math.random() * this.emojiOptionElements.length);
            const randomOption = this.emojiOptionElements[randomIndex];
            const val = randomOption.dataset.value;
            
            // Update State
            this.emojiState.color = randomColor;
            this.emojiState.emoji = val;
            this.currentAvatarColor = randomColor;
            
            // Update UI
            this.avatarPreview.style.backgroundColor = randomColor;
            this.avatarEmojiDisplay.textContent = val;
            if (this.currentEmojiSpan) this.currentEmojiSpan.textContent = val;
            
            // Update Color Picker Previews
            if (this.emojiColorPreview) this.emojiColorPreview.style.backgroundColor = randomColor;
            if (this.avatarColorPreview) this.avatarColorPreview.style.backgroundColor = randomColor;
            
            // Update Selected Class
            this.emojiOptionElements.forEach(o => o.classList.remove('selected'));
            randomOption.classList.add('selected');
        }
    }

    loadAvatar() {
        const savedAvatar = localStorage.getItem('drawit_avatar');
        if (savedAvatar) {
            try {
                const data = JSON.parse(savedAvatar);
                if (data.type === 'emoji') {
                    this.switchAvatarMode('emoji');
                    this.emojiState.emoji = data.emoji;
                    this.emojiState.color = data.color;
                    this.currentAvatarColor = data.color;
                    
                    // Update UI
                    this.avatarPreview.style.backgroundColor = data.color;
                    this.avatarEmojiDisplay.textContent = data.emoji;
                    if (this.currentEmojiSpan) this.currentEmojiSpan.textContent = data.emoji;
                    if (this.emojiColorPreview) this.emojiColorPreview.style.backgroundColor = data.color;
                    if (this.avatarColorPreview) this.avatarColorPreview.style.backgroundColor = data.color;
                    
                    // Update selected emoji in list
                    this.emojiOptionElements.forEach(o => {
                        if (o.dataset.value === data.emoji) o.classList.add('selected');
                        else o.classList.remove('selected');
                    });
                } else if (data.type === 'image') {
                    this.switchAvatarMode('draw'); // Default to draw mode if image type, but could be upload
                    // For simplicity, we load it into the canvas
                    const img = new Image();
                    img.onload = () => {
                        this.avatarCtx.drawImage(img, 0, 0);
                    };
                    img.src = data.value;
                }
            } catch (e) {
                console.error('Failed to load avatar', e);
                this.randomizeAvatar();
            }
        } else {
            this.randomizeAvatar();
        }
    }

    setAvatarColor(color) { 
        this.currentAvatarColor = color; 
        this.emojiState.color = color;
        if (this.avatarPreview) this.avatarPreview.style.backgroundColor = color;
        if (this.emojiColorPreview) this.emojiColorPreview.style.backgroundColor = color;
        if (this.avatarColorPreview) this.avatarColorPreview.style.backgroundColor = color;
    }

    getAvatarData() {
        if (this.avatarMode === 'emoji') {
            return { 
                type: 'emoji', 
                emoji: this.emojiState.emoji, 
                color: this.emojiState.color 
            };
        } else {
            return { 
                type: 'image', 
                value: this.avatarCanvas.toDataURL() 
            };
        }
    }

    saveAvatarToStorage() {
        const data = this.avatarMode === 'emoji' ? 
            { type: 'emoji', emoji: this.emojiState.emoji, color: this.emojiState.color } :
            { type: 'image', value: this.avatarCanvas.toDataURL() };
        localStorage.setItem('drawit_avatar', JSON.stringify(data));
    }
}
