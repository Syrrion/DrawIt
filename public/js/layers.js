import { performDraw, performFloodFill } from './draw.js';
import { state as globalState } from './state.js';
import { CANVAS_CONFIG } from './config.js';

export class LayerManager {
    constructor(socket, currentRoomProvider, layers, layerCanvases, activeLayerId, renderCallback, showToast, onActiveLayerChange, getPlayerList) {
        this.socket = socket;
        this.currentRoomProvider = currentRoomProvider;
        this.layers = layers;
        this.layerCanvases = layerCanvases;
        this.activeLayerId = activeLayerId;
        this.renderCallback = renderCallback;
        this.showToast = showToast;
        this.onActiveLayerChange = onActiveLayerChange;
        this.getPlayerList = getPlayerList;

        this.playerLayers = {};
        this.showLayerAvatars = true;

        this.layersList = document.getElementById('layers-list');
        this.addLayerBtn = document.getElementById('add-layer-btn');
        
        this.dragSrcEl = null;

        this.init();
    }

    init() {
        if (this.addLayerBtn) {
            this.addLayerBtn.addEventListener('click', () => this.handleAddLayer());
        }
        
        // Add listeners to container for drag and drop
        if (this.layersList) {
            this.layersList.addEventListener('dragover', this.handleDragOver.bind(this));
            this.layersList.addEventListener('drop', this.handleDrop.bind(this));
        }
    }

    createLayerCanvas(layerId) {
        if (!this.layerCanvases[layerId]) {
            const c = document.createElement('canvas');
            c.width = CANVAS_CONFIG.width;
            c.height = CANVAS_CONFIG.height;
            this.layerCanvases[layerId] = {
                canvas: c,
                ctx: c.getContext('2d', { willReadFrequently: true }),
                visible: true // Default visibility
            };
        }
    }

    canModifyLayers() {
        if (globalState.isSpectator) return false;
        if (globalState.currentGameState === 'LOBBY') return true;
        if (globalState.currentGameState === 'PLAYING') {
            if (globalState.settings && globalState.settings.mode === 'creative') return true;
            if (globalState.settings && globalState.settings.mode === 'telephone') return true;
            return this.socket.id === globalState.currentDrawerId;
        }
        return false;
    }

    updateLayersUI() {
        const allowed = this.canModifyLayers();

        // Update Add Button
        if (this.addLayerBtn) {
            this.addLayerBtn.disabled = !allowed;
            this.addLayerBtn.style.opacity = allowed ? '1' : '0.5';
            this.addLayerBtn.style.cursor = allowed ? 'pointer' : 'not-allowed';
            this.addLayerBtn.title = allowed ? "Nouveau calque" : "Vous ne pouvez pas modifier les calques pour le moment";
        }

        this.layersList.innerHTML = '';
        // Render in reverse order (top layer first in UI list)
        const reversedLayers = [...this.layers].reverse();
        
        reversedLayers.forEach((layer) => {
            const isVisible = this.layerCanvases[layer.id] ? this.layerCanvases[layer.id].visible : true;
            const isActive = layer.id === this.activeLayerId;
            const hiddenClass = !isVisible ? 'hidden-layer' : '';

            const div = document.createElement('div');
            div.className = `layer-item ${isActive ? 'active' : ''} ${hiddenClass}`;
            if (allowed) {
                div.draggable = true;
            }
            div.dataset.layerId = layer.id;
            
            // Drag Events
            if (allowed) {
                div.addEventListener('dragstart', this.handleDragStart.bind(this));
                div.addEventListener('dragover', this.handleDragOver.bind(this));
                div.addEventListener('drop', this.handleDrop.bind(this));
                div.addEventListener('dragenter', this.handleDragEnter.bind(this));
                div.addEventListener('dragleave', this.handleDragLeave.bind(this));
                div.addEventListener('dragend', this.handleDragEnd.bind(this));
            }

            div.onclick = (e) => {
                if (!e.target.closest('button') && !e.target.closest('input') && !e.target.closest('.layer-visibility')) {
                    this.activeLayerId = layer.id;
                    if (this.onActiveLayerChange) this.onActiveLayerChange(layer.id);
                    this.updateLayersUI();
                }
            };

            // Find players on this layer
            let playersOnLayerHtml = '';
            if (this.getPlayerList && this.showLayerAvatars) {
                const players = this.getPlayerList();
                
                // Filter players on this layer AND allowed to draw
                const playersOnThisLayer = players.filter(p => {
                    const isOnLayer = this.playerLayers[p.id] === layer.id;
                    if (!isOnLayer) return false;

                    // Check if allowed to draw
                    if (p.isSpectator) return false;
                    if (globalState.currentGameState === 'LOBBY') return true;
                    if (globalState.currentGameState === 'PLAYING') {
                        return p.id === globalState.currentDrawerId;
                    }
                    return false;
                });
                
                if (playersOnThisLayer.length > 0) {
                    playersOnLayerHtml = '<div class="layer-avatars" style="display: flex; margin-left: 5px; gap: -5px;">';
                    playersOnThisLayer.forEach(p => {
                        const isMe = p.id === this.socket.id;
                        const size = isMe ? '24px' : '20px';
                        const extraClass = isMe ? 'self-avatar' : '';
                        const zIndex = isMe ? 'z-index: 10;' : '';
                        
                        let avatarHtml = '';
                        if (p.avatar && p.avatar.type === 'image') {
                            avatarHtml = `<img src="${p.avatar.value}" class="${extraClass}" style="width: ${size}; height: ${size}; border-radius: 50%; border: 1px solid rgba(255,255,255,0.3); object-fit: cover;">`;
                        } else {
                            const color = (p.avatar && p.avatar.color) || '#3498db';
                            const emoji = (p.avatar && p.avatar.emoji) || '🎨';
                            avatarHtml = `<div class="${extraClass}" style="width: ${size}; height: ${size}; border-radius: 50%; background-color: ${color}; display: flex; align-items: center; justify-content: center; font-size: 12px; border: 1px solid rgba(255,255,255,0.3);">${emoji}</div>`;
                        }
                        playersOnLayerHtml += `<div title="${p.username}${isMe ? ' (Vous)' : ''}" style="margin-right: -8px; transition: transform 0.2s; cursor: help; ${zIndex}">${avatarHtml}</div>`;
                    });
                    playersOnLayerHtml += '</div>';
                }
            }

            div.innerHTML = `
                <div class="layer-drag-handle ${allowed ? '' : 'disabled'}">
                    <svg viewBox="0 0 24 24" width="12" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" style="opacity: 0.5;">
                        <circle cx="9" cy="12" r="1"></circle><circle cx="9" cy="5" r="1"></circle><circle cx="9" cy="19" r="1"></circle>
                        <circle cx="15" cy="12" r="1"></circle><circle cx="15" cy="5" r="1"></circle><circle cx="15" cy="19" r="1"></circle>
                    </svg>
                </div>

                <div class="layer-info-col">
                    <div class="layer-avatars-row">
                        ${playersOnLayerHtml}
                    </div>
                    <div class="layer-controls">
                        <button class="layer-btn delete" data-action="delete" data-id="${layer.id}" title="Supprimer">
                            <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                        </button>
                    </div>
                </div>

                <div class="layer-preview-container">
                    <canvas class="layer-preview-canvas" width="80" height="${80 * (CANVAS_CONFIG.height / CANVAS_CONFIG.width)}"></canvas>
                </div>

                <div class="layer-visibility-handle ${isVisible ? 'visible' : ''}" data-action="toggle-visibility" data-id="${layer.id}">
                    ${isVisible ? 
                        '<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>' : 
                        '<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>'
                    }
                </div>
            `;
            this.layersList.appendChild(div);

            // Draw preview
            const previewCanvas = div.querySelector('.layer-preview-canvas');
            if (previewCanvas && this.layerCanvases[layer.id]) {
                const ctx = previewCanvas.getContext('2d');
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';
                ctx.drawImage(this.layerCanvases[layer.id].canvas, 0, 0, previewCanvas.width, previewCanvas.height);
            }
            
            // Attach event listeners for buttons inside the layer item
            const visibilityBtn = div.querySelector('[data-action="toggle-visibility"]');
            visibilityBtn.onclick = () => this.toggleLayerVisibility(layer.id);

            const deleteBtn = div.querySelector('[data-action="delete"]');
            if (!allowed) {
                deleteBtn.disabled = true;
                deleteBtn.style.opacity = '0.3';
                deleteBtn.style.cursor = 'not-allowed';
            } else {
                deleteBtn.onclick = () => this.deleteLayer(layer.id);
            }
        });

        // Re-inject Dummy Layer if Tracing Image exists
        if (document.getElementById('tracing-image')) {
            const browserOpacity = document.getElementById('browser-opacity');
            const dummyLayer = document.createElement('div');
            dummyLayer.className = 'layer-item dummy';
            dummyLayer.id = 'dummy-model-layer';
            dummyLayer.style.flexDirection = 'column';
            dummyLayer.style.alignItems = 'stretch';
            dummyLayer.style.gap = '5px';
            dummyLayer.style.padding = '8px';
            
            dummyLayer.innerHTML = `
                <div style="display: flex; align-items: center; gap: 8px; width: 100%;">
                    <div class="layer-visibility visible"><i class="fas fa-image"></i></div>
                    <div class="layer-name-container">
                        <span class="layer-name-display">Modèle</span>
                    </div>
                    <button class="layer-btn delete" id="btn-detach-model" title="Détacher">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div style="padding-left: 24px; padding-right: 5px; display: flex; align-items: center; gap: 8px;">
                    <i class="fas fa-adjust" style="font-size: 0.8rem; color: var(--text-dim);"></i>
                    <input type="range" class="layer-opacity-slider" id="model-opacity-slider" min="0" max="1" step="0.05" value="${browserOpacity ? browserOpacity.value : 0.5}" title="Opacité" style="flex: 1;">
                </div>
            `;
            this.layersList.appendChild(dummyLayer);

            // Attach listeners to dummy layer controls
            const detachBtn = document.getElementById('btn-detach-model');
            if (detachBtn) {
                detachBtn.addEventListener('click', () => {
                    const event = new CustomEvent('request-toggle-pin-mode', { detail: { active: false } });
                    document.dispatchEvent(event);
                });
            }

            const opacitySlider = document.getElementById('model-opacity-slider');
            if (opacitySlider) {
                opacitySlider.addEventListener('input', (e) => {
                    const tracingImage = document.getElementById('tracing-image');
                    if (tracingImage) {
                        tracingImage.style.opacity = e.target.value;
                    }
                    if (browserOpacity) browserOpacity.value = e.target.value;
                });
            }
        }
    }

    enableRenaming(layerId) {
        const display = document.getElementById(`name-display-${layerId}`);
        const input = document.getElementById(`name-input-${layerId}`);
        const btn = display.nextElementSibling.nextElementSibling; 
        
        display.style.display = 'none';
        input.style.display = 'block';
        btn.style.display = 'none';
        input.focus();
    }

    saveLayerName(layerId, newName) {
        if (newName.trim()) {
            this.renameLayer(layerId, newName.trim());
        }
    }

    createPlaceholder(height) {
        const el = document.createElement('div');
        el.className = 'layer-placeholder';
        el.style.height = height + 'px';
        return el;
    }

    handleDragStart(e) {
        this.dragSrcEl = e.target;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/html', e.target.innerHTML);
        // e.target.classList.add('dragging');
        this.layersList.classList.add('dragging-mode');
        
        this.placeholder = this.createPlaceholder(e.target.offsetHeight);

        // Defer hiding to allow drag image generation
        setTimeout(() => {
            e.target.style.display = 'none';
            // Insert placeholder at original location
            this.layersList.insertBefore(this.placeholder, e.target);
        }, 0);
    }

    handleDragOver(e) {
        if (e.preventDefault) {
            e.preventDefault();
        }
        e.dataTransfer.dropEffect = 'move';
        
        const targetItem = e.target.closest('.layer-item');
        
        // If hovering over the list container but not an item (e.g. bottom empty space)
        if (e.target === this.layersList) {
             // Check if we are at the bottom
             // Append placeholder
             this.layersList.appendChild(this.placeholder);
             return false;
        }

        if (targetItem && targetItem !== this.placeholder && targetItem !== this.dragSrcEl) {
             const rect = targetItem.getBoundingClientRect();
             const next = (e.clientY - rect.top) > (rect.height / 2);
             
             if (next) {
                 // Insert after targetItem
                 this.layersList.insertBefore(this.placeholder, targetItem.nextElementSibling);
             } else {
                 // Insert before targetItem
                 this.layersList.insertBefore(this.placeholder, targetItem);
             }
        }
        return false;
    }

    handleDragEnter(e) {
        // Handled in dragOver for finer control
    }

    handleDragLeave(e) {
        // Handled in dragOver
    }

    handleDrop(e) {
        if (e.stopPropagation) {
            e.stopPropagation();
        }
        
        this.layersList.classList.remove('dragging-mode');

        // If we don't have a placeholder, we can't determine position
        if (!this.placeholder || !this.placeholder.parentNode) {
            return false;
        }

        // Find index of placeholder
        const placeholderIndex = Array.from(this.layersList.children).indexOf(this.placeholder);
        
        const newLayerOrder = [];
        const domChildren = Array.from(this.layersList.children);
        
        // Let's collect IDs from top to bottom (DOM order)
        const domIds = [];
        domChildren.forEach(child => {
            if (child === this.placeholder) {
                if (this.dragSrcEl && this.dragSrcEl.dataset.layerId) {
                    domIds.push(this.dragSrcEl.dataset.layerId);
                }
            } else if (child !== this.dragSrcEl && child.dataset.layerId) {
                domIds.push(child.dataset.layerId);
            }
        });
        
        // Now domIds is [TopLayerId, ..., BottomLayerId]
        // We want [BottomLayerId, ..., TopLayerId] for the state.layers array
        const newIds = domIds.reverse();
        
        // Reconstruct layer objects
        const newLayers = newIds.map(id => this.layers.find(l => l.id === id)).filter(l => l);
        
        // Apply changes
        if (globalState.settings && (globalState.settings.mode === 'telephone' || globalState.settings.mode === 'creative')) {
            this.layers.length = 0;
            this.layers.push(...newLayers);
            this.updateLayersUI();
            this.renderCallback();
        } else {
            this.socket.emit('reorderLayers', { roomCode: this.currentRoomProvider(), layers: newLayers });
        }
        
        return false;
    }

    handleDragEnd(e) {
        e.target.style.display = ''; // Restore
        if (this.placeholder && this.placeholder.parentNode) {
            this.placeholder.parentNode.removeChild(this.placeholder);
        }
        this.placeholder = null;

        e.target.classList.remove('dragging');
        this.layersList.classList.remove('dragging-mode');
        document.querySelectorAll('.layer-item').forEach(item => {
            item.classList.remove('over', 'drag-over-top', 'drag-over-bottom');
        });
    }

    toggleLayerVisibility(layerId) {
        if (this.layerCanvases[layerId]) {
            this.layerCanvases[layerId].visible = !this.layerCanvases[layerId].visible;
            this.updateLayersUI();
            this.renderCallback();
        }
    }

    renameLayer(layerId, newName) {
        if (globalState.settings && (globalState.settings.mode === 'telephone' || globalState.settings.mode === 'creative')) {
            const layer = this.layers.find(l => l.id === layerId);
            if (layer) {
                layer.name = newName;
                this.updateLayersUI();
            }
        } else {
            this.socket.emit('renameLayer', { roomCode: this.currentRoomProvider(), layerId, name: newName });
        }
    }

    deleteLayer(layerId) {
        if (this.layers.length <= 1) {
            this.showToast('Impossible de supprimer le dernier calque !', 'error');
            return;
        }
        
        window.showConfirmModal(
            'Supprimer le calque',
            'Voulez-vous vraiment supprimer ce calque ?',
            () => {
                if (globalState.settings && (globalState.settings.mode === 'telephone' || globalState.settings.mode === 'creative')) {
                    const index = this.layers.findIndex(l => l.id === layerId);
                    if (index !== -1) {
                        this.layers.splice(index, 1);
                        delete this.layerCanvases[layerId];
                        if (this.activeLayerId === layerId) {
                            this.activeLayerId = this.layers[this.layers.length - 1].id;
                            if (this.onActiveLayerChange) this.onActiveLayerChange(this.activeLayerId);
                        }
                        this.updateLayersUI();
                        this.renderCallback();
                    }
                } else {
                    this.socket.emit('deleteLayer', { roomCode: this.currentRoomProvider(), layerId });
                }
            },
            'Supprimer'
        );
    }

    moveLayerUp(layerId) {
        const index = this.layers.findIndex(l => l.id === layerId);
        if (index < this.layers.length - 1) {
            const newLayers = [...this.layers];
            [newLayers[index], newLayers[index + 1]] = [newLayers[index + 1], newLayers[index]];
            
            if (globalState.settings && (globalState.settings.mode === 'telephone' || globalState.settings.mode === 'creative')) {
                this.layers.length = 0;
                this.layers.push(...newLayers);
                this.updateLayersUI();
                this.renderCallback();
            } else {
                this.socket.emit('reorderLayers', { roomCode: this.currentRoomProvider(), layers: newLayers });
            }
        }
    }

    moveLayerDown(layerId) {
        const index = this.layers.findIndex(l => l.id === layerId);
        if (index > 0) {
            const newLayers = [...this.layers];
            [newLayers[index], newLayers[index - 1]] = [newLayers[index - 1], newLayers[index]];
            
            if (globalState.settings && (globalState.settings.mode === 'telephone' || globalState.settings.mode === 'creative')) {
                this.layers.length = 0;
                this.layers.push(...newLayers);
                this.updateLayersUI();
                this.renderCallback();
            } else {
                this.socket.emit('reorderLayers', { roomCode: this.currentRoomProvider(), layers: newLayers });
            }
        }
    }

    handleAddLayer() {
        if (!this.canModifyLayers()) return;
        if (this.layers.length >= 20) {
            this.showToast('Limite de 20 calques atteinte', 'error');
            return;
        }
        const newLayer = {
            id: 'layer-' + Date.now(),
            name: 'Calque ' + (this.layers.length + 1),
            order: this.layers.length,
            creatorId: this.socket.id
        };
        
        if (globalState.settings && (globalState.settings.mode === 'telephone' || globalState.settings.mode === 'creative')) {
            this.layers.push(newLayer);
            this.createLayerCanvas(newLayer.id);
            this.updateLayersUI();
            this.activeLayerId = newLayer.id;
            if (this.onActiveLayerChange) this.onActiveLayerChange(newLayer.id);
        } else {
            this.socket.emit('addLayer', { roomCode: this.currentRoomProvider(), layer: newLayer });
        }
    }

    setLayers(layers) {
        this.layers = layers;
    }

    updatePlayerLayer(userId, layerId) {
        this.playerLayers[userId] = layerId;
        this.updateLayersUI();
    }

    setActiveLayerId(layerId) {
        this.activeLayerId = layerId;
        this.updateLayersUI();
    }

    deleteLayerCanvas(layerId) {
        if (this.layerCanvases[layerId]) {
            delete this.layerCanvases[layerId];
        }
    }

    getLayerCanvases() {
        return this.layerCanvases;
    }

    updateLayerPreview(layerId) {
        const layerDiv = [...this.layersList.children].find(div => div.dataset.layerId === layerId);
        if (layerDiv) {
            const previewCanvas = layerDiv.querySelector('.layer-preview-canvas');
            if (previewCanvas && this.layerCanvases[layerId]) {
                const ctx = previewCanvas.getContext('2d');
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';
                ctx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
                ctx.drawImage(this.layerCanvases[layerId].canvas, 0, 0, previewCanvas.width, previewCanvas.height);
            }
        }
    }
}
