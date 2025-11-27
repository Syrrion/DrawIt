import { socket, roomPrivacyBadge } from '../dom-elements.js';
import { state } from '../state.js';
import { showToast } from '../utils.js';
import { performDraw, performFloodFill, performMoveSelection, performClearRect } from '../draw.js';
import { canvas } from '../dom-elements.js';

export class RoomHandler {
    constructor(managers) {
        this.gameSettingsManager = managers.gameSettingsManager;
        this.playerListManager = managers.playerListManager;
        this.layerManager = managers.layerManager;
        this.cursorManager = managers.cursorManager;
        this.render = managers.render;

        this.init();
    }

    init() {
        socket.on('roomSettingsUpdated', this.handleRoomSettingsUpdated.bind(this));
        socket.on('error', this.handleError.bind(this));
        socket.on('userJoined', this.handleUserJoined.bind(this));
        socket.on('userLeft', this.handleUserLeft.bind(this));
        socket.on('roomJoined', this.handleRoomJoined.bind(this));
        socket.on('kicked', this.handleKicked.bind(this));
        socket.on('disconnect', this.handleDisconnect.bind(this));
    }

    handleRoomSettingsUpdated(settings) {
        state.settings = settings;
    }

    handleError(msg) {
        showToast(msg, 'error');
    }

    handleUserJoined(data) {
        if (data.leaderId) {
            state.leaderId = data.leaderId;
            this.gameSettingsManager.updateControlsState();
        }

        // Update layers for new users
        if (data.users) {
            data.users.forEach(user => {
                if (user.activeLayerId) {
                    this.layerManager.updatePlayerLayer(user.id, user.activeLayerId);
                }
                if (user.isSpectator) {
                    this.cursorManager.removeCursor(user.id);
                }
            });
        }
    }

    handleUserLeft(data) {
        if (data.leaderId) {
            state.leaderId = data.leaderId;
            this.gameSettingsManager.updateControlsState();
        }
        if (data.leftUserId) {
            this.cursorManager.removeCursor(data.leftUserId);
        }
    }

    handleRoomJoined(data) {
        state.currentGameState = data.gameState;
        state.isSpectator = data.isSpectator;
        state.settings = data.settings || {};

        // Update Privacy Badge
        if (roomPrivacyBadge) {
            if (data.isPrivate) {
                roomPrivacyBadge.textContent = 'Privée';
                roomPrivacyBadge.className = 'privacy-badge private';
            } else {
                roomPrivacyBadge.textContent = 'Publique';
                roomPrivacyBadge.className = 'privacy-badge public';
            }
        }

        if (data.isSpectator) {
            // Disable Chat
            const chatInput = document.getElementById('chat-input');
            if (chatInput) {
                chatInput.disabled = true;
                chatInput.placeholder = "Mode Observateur (Chat désactivé)";
            }

            // Hide Toolbar
            const toolbar = document.querySelector('.toolbar');
            if (toolbar) toolbar.style.display = 'none';

            showToast('Vous avez rejoint en mode observateur', 'info');
        } else {
            const chatInput = document.getElementById('chat-input');
            if (chatInput) {
                chatInput.disabled = false;
                chatInput.placeholder = "Ecrire un message";
            }
            const toolbar = document.querySelector('.toolbar');
            if (toolbar) toolbar.style.display = 'flex';
        }

        if (data.users) {
            data.users.forEach(u => {
                if (u.activeLayerId) {
                    this.layerManager.updatePlayerLayer(u.id, u.activeLayerId);
                }
            });
        }

        this.playerListManager.updatePlayerList(data.users, data.leaderId, data.gameState, data.roomCode);
        state.leaderId = data.leaderId;

        if (data.gameState === 'LOBBY') {
            this.gameSettingsManager.show();
            this.gameSettingsManager.updateControlsState();
        } else {
            this.gameSettingsManager.hide();
        }

        // Layers initialization
        if (data.layers) {
            // We need to update state.layers reference
            state.layers.length = 0;
            state.layers.push(...data.layers);

            this.layerManager.setLayers(state.layers);
            state.layers.forEach(layer => {
                this.layerManager.createLayerCanvas(layer.id);
            });

            if (state.layers.length > 0) {
                state.activeLayerId = state.layers[0].id;
                this.layerManager.setActiveLayerId(state.activeLayerId);
            }
            this.layerManager.updateLayersUI();
        }

        if (data.drawHistory) {
            data.drawHistory.forEach(action => {
                const targetLayerId = action.layerId || (state.layers[0] ? state.layers[0].id : null);

                if (targetLayerId && state.layerCanvases[targetLayerId]) {
                    const targetCtx = state.layerCanvases[targetLayerId].ctx;
                    if (action.tool === 'fill') {
                        performFloodFill(targetCtx, canvas.width, canvas.height, action.x0, action.y0, action.color);
                    } else if (action.tool === 'move-selection') {
                        performMoveSelection(targetCtx, action.srcX, action.srcY, action.w, action.h, action.destX, action.destY);
                    } else if (action.tool === 'clear-rect') {
                        performClearRect(targetCtx, action.x, action.y, action.w, action.h);
                    } else {
                        performDraw(targetCtx, action.x0, action.y0, action.x1, action.y1, action.color, action.size, action.opacity, action.tool);
                    }
                }
            });
        }

        // We need to call render after replaying history
        if (this.render) this.render();
    }

    handleKicked() {
        window.showAlert('Expulsion', 'Vous avez été expulsé de la partie.', () => {
            window.location.reload();
        });
    }

    handleDisconnect() {
        window.showAlert('Déconnexion', 'La connexion au serveur a été perdue.', () => {
            window.location.reload();
        });
    }
}
