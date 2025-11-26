import { performDraw, performFloodFill } from './draw.js';
import { state as globalState } from './state.js';

export function initLayerManagement(socket, currentRoom, layers, layerCanvases, activeLayerId, renderCallback, showToast, onActiveLayerChange, getPlayerList) {
    // We need to return an object with methods that modify the state or expose functions to the global scope/UI
    
    const layersList = document.getElementById('layers-list');
    const addLayerBtn = document.getElementById('add-layer-btn');

    // State wrappers to allow modification by reference or callbacks
    const state = {
        layers,
        activeLayerId,
        layerCanvases,
        playerLayers: {}, // Map userId -> layerId
        showLayerAvatars: true
    };

    function createLayerCanvas(layerId) {
        if (!state.layerCanvases[layerId]) {
            const c = document.createElement('canvas');
            c.width = 800;
            c.height = 600;
            state.layerCanvases[layerId] = {
                canvas: c,
                ctx: c.getContext('2d', { willReadFrequently: true }),
                visible: true // Default visibility
            };
        }
    }

    function updateLayersUI() {
        layersList.innerHTML = '';
        // Render in reverse order (top layer first in UI list)
        const reversedLayers = [...state.layers].reverse();
        
        reversedLayers.forEach((layer) => {
            const isVisible = state.layerCanvases[layer.id] ? state.layerCanvases[layer.id].visible : true;
            const isActive = layer.id === state.activeLayerId;
            const hiddenClass = !isVisible ? 'hidden-layer' : '';

            const div = document.createElement('div');
            div.className = `layer-item ${isActive ? 'active' : ''} ${hiddenClass}`;
            div.draggable = true;
            div.dataset.layerId = layer.id;
            
            // Drag Events
            div.addEventListener('dragstart', handleDragStart);
            div.addEventListener('dragover', handleDragOver);
            div.addEventListener('drop', handleDrop);
            div.addEventListener('dragenter', handleDragEnter);
            div.addEventListener('dragleave', handleDragLeave);
            div.addEventListener('dragend', handleDragEnd);

            div.onclick = (e) => {
                if (!e.target.closest('button') && !e.target.closest('input') && !e.target.closest('.layer-visibility')) {
                    state.activeLayerId = layer.id;
                    if (onActiveLayerChange) onActiveLayerChange(layer.id);
                    updateLayersUI();
                }
            };

            // Find players on this layer
            let playersOnLayerHtml = '';
            if (getPlayerList && state.showLayerAvatars) {
                const players = getPlayerList();
                
                // Filter players on this layer AND allowed to draw
                const playersOnThisLayer = players.filter(p => {
                    const isOnLayer = state.playerLayers[p.id] === layer.id;
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
                        const isMe = p.id === socket.id;
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
            layersList.appendChild(div);
            
            // Attach event listeners for buttons inside the layer item
            const visibilityBtn = div.querySelector('[data-action="toggle-visibility"]');
            visibilityBtn.onclick = () => toggleLayerVisibility(layer.id);

            const renameBtn = div.querySelector('[data-action="rename"]');
            renameBtn.onclick = () => enableRenaming(layer.id);

            const moveUpBtn = div.querySelector('[data-action="move-up"]');
            moveUpBtn.onclick = () => moveLayerUp(layer.id);

            const moveDownBtn = div.querySelector('[data-action="move-down"]');
            moveDownBtn.onclick = () => moveLayerDown(layer.id);

            const deleteBtn = div.querySelector('[data-action="delete"]');
            deleteBtn.onclick = () => deleteLayer(layer.id);

            const input = div.querySelector(`#name-input-${layer.id}`);
            input.addEventListener('blur', () => saveLayerName(layer.id, input.value));
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') saveLayerName(layer.id, input.value);
            });
        });
    }

    // Renaming functions
    function enableRenaming(layerId) {
        const display = document.getElementById(`name-display-${layerId}`);
        const input = document.getElementById(`name-input-${layerId}`);
        const btn = display.nextElementSibling.nextElementSibling; 
        
        display.style.display = 'none';
        input.style.display = 'block';
        btn.style.display = 'none';
        input.focus();
    }

    function saveLayerName(layerId, newName) {
        if (newName.trim()) {
            renameLayer(layerId, newName.trim());
        }
    }

    // Drag and Drop Logic
    let dragSrcEl = null;

    function handleDragStart(e) {
        dragSrcEl = this;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/html', this.innerHTML);
        this.classList.add('dragging');
        layersList.classList.add('dragging-mode');
    }

    function handleDragOver(e) {
        if (e.preventDefault) {
            e.preventDefault();
        }
        e.dataTransfer.dropEffect = 'move';
        return false;
    }

    function handleDragEnter(e) {
        this.classList.add('over');
    }

    function handleDragLeave(e) {
        this.classList.remove('over');
    }

    function handleDrop(e) {
        if (e.stopPropagation) {
            e.stopPropagation();
        }
        
        layersList.classList.remove('dragging-mode');

        if (dragSrcEl !== this) {
            const srcId = dragSrcEl.dataset.layerId;
            const targetId = this.dataset.layerId;
            
            const srcIndex = state.layers.findIndex(l => l.id === srcId);
            const targetIndex = state.layers.findIndex(l => l.id === targetId);
            
            if (srcIndex !== -1 && targetIndex !== -1) {
                const newLayers = [...state.layers];
                const [movedLayer] = newLayers.splice(srcIndex, 1);
                newLayers.splice(targetIndex, 0, movedLayer);
                
                socket.emit('reorderLayers', { roomCode: currentRoom(), layers: newLayers });
            }
        }
        return false;
    }

    function handleDragEnd(e) {
        this.classList.remove('dragging');
        layersList.classList.remove('dragging-mode');
        document.querySelectorAll('.layer-item').forEach(item => {
            item.classList.remove('over');
        });
    }

    function toggleLayerVisibility(layerId) {
        if (state.layerCanvases[layerId]) {
            state.layerCanvases[layerId].visible = !state.layerCanvases[layerId].visible;
            updateLayersUI();
            renderCallback();
        }
    }

    function renameLayer(layerId, newName) {
        socket.emit('renameLayer', { roomCode: currentRoom(), layerId, name: newName });
    }

    function deleteLayer(layerId) {
        if (state.layers.length <= 1) {
            showToast('Impossible de supprimer le dernier calque !', 'error');
            return;
        }
        
        window.showConfirmModal(
            'Supprimer le calque',
            'Voulez-vous vraiment supprimer ce calque ?',
            () => {
                socket.emit('deleteLayer', { roomCode: currentRoom(), layerId });
            }
        );
    }

    function moveLayerUp(layerId) {
        const index = state.layers.findIndex(l => l.id === layerId);
        if (index < state.layers.length - 1) {
            const newLayers = [...state.layers];
            [newLayers[index], newLayers[index + 1]] = [newLayers[index + 1], newLayers[index]];
            socket.emit('reorderLayers', { roomCode: currentRoom(), layers: newLayers });
        }
    }

    function moveLayerDown(layerId) {
        const index = state.layers.findIndex(l => l.id === layerId);
        if (index > 0) {
            const newLayers = [...state.layers];
            [newLayers[index], newLayers[index - 1]] = [newLayers[index - 1], newLayers[index]];
            socket.emit('reorderLayers', { roomCode: currentRoom(), layers: newLayers });
        }
    }

    addLayerBtn.addEventListener('click', () => {
        if (state.layers.length >= 20) {
            showToast('Limite de 20 calques atteinte', 'error');
            return;
        }
        const newLayer = {
            id: 'layer-' + Date.now(),
            name: 'Calque ' + (state.layers.length + 1),
            order: state.layers.length,
            creatorId: socket.id
        };
        socket.emit('addLayer', { roomCode: currentRoom(), layer: newLayer });
    });

    // Public API to update state from outside (e.g. socket events)
    return {
        createLayerCanvas,
        updateLayersUI,
        setLayers: (newLayers) => { state.layers = newLayers; },
        getLayers: () => state.layers,
        setActiveLayerId: (id) => { state.activeLayerId = id; },
        getActiveLayerId: () => state.activeLayerId,
        getLayerCanvases: () => state.layerCanvases,
        deleteLayerCanvas: (id) => { delete state.layerCanvases[id]; },
        updatePlayerLayer: (userId, layerId) => {
            state.playerLayers[userId] = layerId;
            updateLayersUI();
        },
        setShowLayerAvatars: (visible) => {
            state.showLayerAvatars = visible;
            updateLayersUI();
        }
    };
}
