import { socket, roomPrivacyBadge, helpModal, lobbySettingsModal, confirmationModal, kickModal, alertModal, gameEndModal, readyCheckModal } from '../dom-elements.js';
import { state } from '../state.js';
import { showToast } from '../utils.js';
import { performDraw, performFloodFill, performMoveSelection, performClearRect } from '../draw.js';
import { canvas } from '../dom-elements.js';

export function initRoomHandler(gameSettingsManager, playerListManager, layerManager, cursorManager, render) {
    socket.on('roomSettingsUpdated', (settings) => {
        state.settings = settings;
    });

    socket.on('error', (msg) => {
        showToast(msg, 'error');
    });

    socket.on('userJoined', (data) => {
        if (data.leaderId) {
            state.leaderId = data.leaderId;
            gameSettingsManager.updateControlsState();
        }

        // Update layers for new users
        if (data.users) {
            data.users.forEach(user => {
                if (user.activeLayerId) {
                    layerManager.updatePlayerLayer(user.id, user.activeLayerId);
                }
                if (user.isSpectator) {
                    cursorManager.removeCursor(user.id);
                }
            });
        }
    });

    socket.on('userLeft', (data) => {
        if (data.leaderId) {
            state.leaderId = data.leaderId;
            gameSettingsManager.updateControlsState();
        }
        if (data.leftUserId) {
            cursorManager.removeCursor(data.leftUserId);
        }
    });

    socket.on('roomJoined', (data) => {
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
                    layerManager.updatePlayerLayer(u.id, u.activeLayerId);
                }
            });
        }

        // Note: Game state sync logic is handled in game-handler, but some initial sync is here.
        // We might need to coordinate or duplicate some logic, or move all "roomJoined" logic to a central place.
        // For now, I'll keep the room-specific parts here and let game-handler handle the game parts of roomJoined if possible,
        // OR I'll leave the game-specific parts of roomJoined in game-handler and listen to the same event?
        // Socket.io allows multiple listeners for the same event.
        // So I can have room-handler listen to 'roomJoined' for room stuff, and game-handler listen to 'roomJoined' for game stuff.
        // That's a good pattern.

        playerListManager.updatePlayerList(data.users, data.leaderId, data.gameState, data.roomCode);
        state.leaderId = data.leaderId;

        if (data.gameState === 'LOBBY') {
            gameSettingsManager.show();
            gameSettingsManager.updateControlsState();
        } else {
            gameSettingsManager.hide();
        }

        // Layers initialization
        if (data.layers) {
            // We need to update state.layers reference
            state.layers.length = 0;
            state.layers.push(...data.layers);

            layerManager.setLayers(state.layers);
            state.layers.forEach(layer => {
                layerManager.createLayerCanvas(layer.id);
            });

            if (state.layers.length > 0) {
                state.activeLayerId = state.layers[0].id;
                layerManager.setActiveLayerId(state.activeLayerId);
            }
            layerManager.updateLayersUI();
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
        if (render) render();
    });

    socket.on('kicked', () => {
        window.showAlert('Expulsion', 'Vous avez été expulsé de la partie.', () => {
            window.location.reload();
        });
    });

    socket.on('disconnect', () => {
        window.showAlert('Déconnexion', 'La connexion au serveur a été perdue.', () => {
            window.location.reload();
        });
    });
}
