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
                <span class="layer-visibility ${isVisible ? 'visible' : ''}" data-action="toggle-visibility" data-id="${layer.id}">
                    ${isVisible ? 
                        '<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>' : 
                        '<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>'
                    }
                </span>
                
                ${playersOnLayerHtml}

                <div class="layer-name-container">
                    <span class="layer-name-display" id="name-display-${layer.id}">${layer.name}</span>
                    <input type="text" class="layer-name" id="name-input-${layer.id}" value="${layer.name}">
                    <button class="edit-layer-btn" data-action="rename" data-id="${layer.id}" title="Renommer">
                        <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                    </button>
                </div>

                <div class="layer-controls">
                    <button class="layer-btn" data-action="move-up" data-id="${layer.id}" title="Monter">
                        <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"></line><polyline points="5 12 12 5 19 12"></polyline></svg>
                    </button>
                    <button class="layer-btn" data-action="move-down" data-id="${layer.id}" title="Descendre">
                        <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><polyline points="19 12 12 19 5 12"></polyline></svg>
                    </button>
                    <button class="layer-btn delete" data-action="delete" data-id="${layer.id}" title="Supprimer">
                        <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                    </button>
                </div>
            `;
            this.layersList.appendChild(div);
            
            // Attach event listeners for buttons inside the layer item
            const visibilityBtn = div.querySelector('[data-action="toggle-visibility"]');
            visibilityBtn.onclick = () => this.toggleLayerVisibility(layer.id);

            const renameBtn = div.querySelector('[data-action="rename"]');
            if (!allowed) {
                renameBtn.disabled = true;
                renameBtn.style.opacity = '0.3';
                renameBtn.style.cursor = 'not-allowed';
            } else {
                renameBtn.onclick = () => this.enableRenaming(layer.id);
            }

            const moveUpBtn = div.querySelector('[data-action="move-up"]');
            if (!allowed) {
                moveUpBtn.disabled = true;
                moveUpBtn.style.opacity = '0.3';
                moveUpBtn.style.cursor = 'not-allowed';
            } else {
                moveUpBtn.onclick = () => this.moveLayerUp(layer.id);
            }

            const moveDownBtn = div.querySelector('[data-action="move-down"]');
            if (!allowed) {
                moveDownBtn.disabled = true;
                moveDownBtn.style.opacity = '0.3';
                moveDownBtn.style.cursor = 'not-allowed';
            } else {
                moveDownBtn.onclick = () => this.moveLayerDown(layer.id);
            }

            const deleteBtn = div.querySelector('[data-action="delete"]');
            if (!allowed) {
                deleteBtn.disabled = true;
                deleteBtn.style.opacity = '0.3';
                deleteBtn.style.cursor = 'not-allowed';
            } else {
                deleteBtn.onclick = () => this.deleteLayer(layer.id);
            }

            const input = div.querySelector(`#name-input-${layer.id}`);
            if (!allowed) {
                input.disabled = true;
            } else {
                input.addEventListener('blur', () => this.saveLayerName(layer.id, input.value));
                input.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') this.saveLayerName(layer.id, input.value);
                });
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

    handleDragStart(e) {
        this.dragSrcEl = e.target;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/html', e.target.innerHTML);
        e.target.classList.add('dragging');
        this.layersList.classList.add('dragging-mode');
    }

    handleDragOver(e) {
        if (e.preventDefault) {
            e.preventDefault();
        }
        e.dataTransfer.dropEffect = 'move';
        return false;
    }

    handleDragEnter(e) {
        e.target.classList.add('over');
    }

    handleDragLeave(e) {
        e.target.classList.remove('over');
    }

    handleDrop(e) {
        if (e.stopPropagation) {
            e.stopPropagation();
        }
        
        this.layersList.classList.remove('dragging-mode');

        // e.target might be a child of the layer-item, we need to find the layer-item
        const targetItem = e.target.closest('.layer-item');
        if (!targetItem) return false;

        if (this.dragSrcEl !== targetItem) {
            const srcId = this.dragSrcEl.dataset.layerId;
            const targetId = targetItem.dataset.layerId;
            
            const srcIndex = this.layers.findIndex(l => l.id === srcId);
            const targetIndex = this.layers.findIndex(l => l.id === targetId);
            
            if (srcIndex !== -1 && targetIndex !== -1) {
                const newLayers = [...this.layers];
                const [movedLayer] = newLayers.splice(srcIndex, 1);
                newLayers.splice(targetIndex, 0, movedLayer);
                
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
        return false;
    }

    handleDragEnd(e) {
        e.target.classList.remove('dragging');
        this.layersList.classList.remove('dragging-mode');
        document.querySelectorAll('.layer-item').forEach(item => {
            item.classList.remove('over');
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

    // Public API
    setLayers(newLayers) { this.layers = newLayers; }
    getLayers() { return this.layers; }
    setActiveLayerId(id) { this.activeLayerId = id; }
    getActiveLayerId() { return this.activeLayerId; }
    getLayerCanvases() { return this.layerCanvases; }
    deleteLayerCanvas(id) { delete this.layerCanvases[id]; }
    getCompositeDataURL() {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = CANVAS_CONFIG.width;
        tempCanvas.height = CANVAS_CONFIG.height;
        const ctx = tempCanvas.getContext('2d');
        
        // Fill white background
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);

        // Draw layers in order (bottom to top)
        this.layers.forEach(layer => {
            const layerObj = this.layerCanvases[layer.id];
            if (layerObj && layerObj.visible) {
                ctx.drawImage(layerObj.canvas, 0, 0);
            }
        });
        
        return tempCanvas.toDataURL('image/jpeg', 0.8);
    }

    updatePlayerLayer(userId, layerId) {
        this.playerLayers[userId] = layerId;
        this.updateLayersUI();
    }
    setShowLayerAvatars(visible) {
        this.showLayerAvatars = visible;
        this.updateLayersUI();
    }
}
