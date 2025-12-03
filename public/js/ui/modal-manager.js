import {
    kickModal, btnKickCancel, btnKickConfirm, kickPlayerName,
    alertModal, alertTitle, alertMessage, alertOkBtn,
    confirmationModal, confirmOkBtn, confirmCancelBtn,
    loadingModal,
    gameEndModal, btnReturnLobby,
    userSettingsModal, btnUserSettings, btnCloseUserSettings, settingShowCursors, settingShowLayerAvatars, settingMuteSound,
    customWordModal, btnSubmitCustomWord, customWordInput
} from '../dom-elements.js';
import { Modal } from '../components/modal.js';
import { socket } from '../dom-elements.js';
import { state } from '../state.js';
import { showToast } from '../utils.js';
import { CANVAS_CONFIG } from '../config.js';

export class ModalManager {
    constructor(uiManager) {
        this.uiManager = uiManager;
        this.playerToKickId = null;
        this.init();
    }

    init() {
        // Loading Modal
        this.loadingModalInstance = new Modal(loadingModal);

        // Kick Modal
        this.kickModalInstance = new Modal(kickModal, {
            closeBtn: btnKickCancel
        });

        window.showKickModal = (playerId, username) => {
            this.playerToKickId = playerId;
            kickPlayerName.textContent = username;
            this.kickModalInstance.open();
        };

        btnKickConfirm.addEventListener('click', () => {
            if (this.playerToKickId) {
                socket.emit('kickPlayer', this.playerToKickId);
                this.kickModalInstance.close();
                showToast('Joueur expulsé', 'success');
            }
        });

        // Alert Modal
        this.alertModalInstance = new Modal(alertModal, {
            closeBtn: alertOkBtn
        });

        window.showAlert = (title, message, callback) => {
            alertTitle.textContent = title;
            alertMessage.textContent = message;

            // Override close behavior for callback
            const originalOnClose = this.alertModalInstance.options.onClose;
            this.alertModalInstance.options.onClose = () => {
                if (callback) callback();
                this.alertModalInstance.options.onClose = originalOnClose; // Restore
            };

            this.alertModalInstance.open();
        };

        // Confirm Modal
        this.confirmationModalInstance = new Modal(confirmationModal, {
            closeBtn: confirmCancelBtn
        });

        window.showConfirmModal = (title, message, onConfirm, confirmText = 'Tout effacer') => {
            const titleEl = confirmationModal.querySelector('h3');
            const msgEl = confirmationModal.querySelector('p');
            const confirmBtn = confirmationModal.querySelector('#confirm-ok');

            if (titleEl) titleEl.textContent = title;
            if (msgEl) msgEl.textContent = message;
            if (confirmBtn) confirmBtn.textContent = confirmText;

            // Handle Confirm
            const handleConfirm = () => {
                this.confirmationModalInstance.close();
                confirmOkBtn.removeEventListener('click', handleConfirm);
                if (onConfirm) onConfirm();
            };

            if (this.currentConfirmHandler) {
                confirmOkBtn.removeEventListener('click', this.currentConfirmHandler);
            }
            this.currentConfirmHandler = handleConfirm;
            confirmOkBtn.addEventListener('click', this.currentConfirmHandler);

            this.confirmationModalInstance.open();
        };

        // Game End
        this.gameEndModalInstance = new Modal(gameEndModal, {
            closeBtn: btnReturnLobby,
            onClose: () => {
                if (this.uiManager.animationSystem) this.uiManager.animationSystem.stop();
                if (this.uiManager.gameSettingsManager) {
                    this.uiManager.gameSettingsManager.show();
                    this.uiManager.gameSettingsManager.updateControlsState();
                }

                // Clear canvas
                Object.values(state.layerCanvases).forEach(l => {
                    l.ctx.clearRect(0, 0, CANVAS_CONFIG.width, CANVAS_CONFIG.height);
                });
                
                // Request fresh state from server to ensure sync
                if (state.currentRoom) {
                    socket.emit('requestCanvasState', { roomCode: state.currentRoom });
                }

                if (this.uiManager.renderCallback) this.uiManager.renderCallback();
            }
        });

        // User Settings Modal
        this.userSettingsModalInstance = new Modal(userSettingsModal, {
            closeBtn: btnCloseUserSettings
        });

        if (btnUserSettings) {
            btnUserSettings.addEventListener('click', () => {
                this.userSettingsModalInstance.open();
            });
        }

        // Load saved settings
        const savedShowCursors = localStorage.getItem('drawit_show_cursors');
        if (savedShowCursors !== null) {
            const isVisible = savedShowCursors === 'true';
            if (settingShowCursors) settingShowCursors.checked = isVisible;
            if (this.uiManager.cursorManager) this.uiManager.cursorManager.setCursorsVisible(isVisible);
        }

        if (settingShowCursors) {
            settingShowCursors.addEventListener('change', (e) => {
                const isVisible = e.target.checked;
                localStorage.setItem('drawit_show_cursors', isVisible);
                if (this.uiManager.cursorManager) this.uiManager.cursorManager.setCursorsVisible(isVisible);
            });
        }

        const savedShowLayerAvatars = localStorage.getItem('drawit_show_layer_avatars');
        if (savedShowLayerAvatars !== null) {
            const isVisible = savedShowLayerAvatars === 'true';
            if (settingShowLayerAvatars) settingShowLayerAvatars.checked = isVisible;
            if (this.uiManager.layerManager) this.uiManager.layerManager.setShowLayerAvatars(isVisible);
        }

        if (settingShowLayerAvatars) {
            settingShowLayerAvatars.addEventListener('change', (e) => {
                const isVisible = e.target.checked;
                localStorage.setItem('drawit_show_layer_avatars', isVisible);
                if (this.uiManager.layerManager) this.uiManager.layerManager.setShowLayerAvatars(isVisible);
            });
        }

        const savedMuteSound = localStorage.getItem('drawit_mute_sound');
        if (savedMuteSound !== null) {
            const isMuted = savedMuteSound === 'true';
            if (settingMuteSound) settingMuteSound.checked = isMuted;
            state.isMuted = isMuted;
        }

        if (settingMuteSound) {
            settingMuteSound.addEventListener('change', (e) => {
                const isMuted = e.target.checked;
                localStorage.setItem('drawit_mute_sound', isMuted);
                state.isMuted = isMuted;
            });
        }

        // Custom Word Modal
        this.customWordModalInstance = new Modal(customWordModal);

        if (btnSubmitCustomWord) {
            btnSubmitCustomWord.addEventListener('click', () => {
                const word = customWordInput.value.trim();
                if (word) {
                    socket.emit('customWordChosen', { roomCode: state.currentRoom, word });
                    this.customWordModalInstance.close();
                    if (window.customWordTimerInterval) clearInterval(window.customWordTimerInterval);
                } else {
                    showToast('Veuillez entrer un mot', 'error');
                }
            });
        }

        if (customWordInput) {
            customWordInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    btnSubmitCustomWord.click();
                }
            });
        }
    }
}
