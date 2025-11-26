import { 
    joinBtn, createBtn, roomCodeInput, usernameInput, loginScreen, gameScreen, displayRoomCode,
    toggleCodeBtn, iconEye, iconEyeOff, copyCodeBtn,
    kickModal, btnKickCancel, btnKickConfirm, kickPlayerName,
    alertModal, alertTitle, alertMessage, alertOkBtn,
    confirmationModal, confirmOkBtn, confirmCancelBtn,
    btnReturnLobby, gameEndModal,
    btnIamReady, btnRefuseGame, readyCheckModal,
    socket, spectatorCheckbox, btnJoinRandom, activeGamesCount, privateRoomCheckbox,
    btnUserSettings, userSettingsModal, btnCloseUserSettings, settingShowCursors, settingShowLayerAvatars,
    maxPlayersInput
} from './dom-elements.js';
import { state } from './state.js';
import { showToast, generateRandomUsername, copyToClipboard, escapeHtml } from './utils.js';

export function initUIManager(avatarManager, animationSystem, gameSettingsManager, render, cursorManager, layerManager) {
    // Login Tabs Logic
    const loginTabs = document.querySelectorAll('.login-tab');
    const loginTabContents = document.querySelectorAll('.login-tab-content');

    loginTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            // Remove active class from all tabs and contents
            loginTabs.forEach(t => t.classList.remove('active'));
            loginTabContents.forEach(c => c.classList.remove('active'));

            // Add active class to clicked tab
            tab.classList.add('active');

            // Show target content
            const targetId = tab.getAttribute('data-target');
            const targetContent = document.getElementById(targetId);
            if (targetContent) {
                targetContent.classList.add('active');
            }
        });
    });

    // Pre-fill random username or load from storage
    const savedUsername = localStorage.getItem('drawit_username');
    if (savedUsername) {
        if (usernameInput) usernameInput.value = savedUsername;
    } else if (usernameInput && !usernameInput.value) {
        usernameInput.value = generateRandomUsername();
    }

    // Active Games Count
    function initGameCount() {
        socket.emit('getPublicGameCount');

        socket.on('updatePublicGameCount', (count) => {
            if (activeGamesCount) {
                if (count === 0) {
                    activeGamesCount.textContent = "Aucune";
                } else {
                    activeGamesCount.textContent = count;
                }
                
                const suffix = count > 1 ? ' rooms disponibles' : ' room disponible';
                if (activeGamesCount.nextSibling) {
                    activeGamesCount.nextSibling.textContent = ` ${suffix}`;
                }
            }
        });
        
        setInterval(() => {
            if (!state.currentRoom) {
                socket.emit('getPublicGameCount');
            }
        }, 5000);
    }
    initGameCount();

    // Random Join
    if (btnJoinRandom) {
        btnJoinRandom.addEventListener('click', () => {
            let username = usernameInput.value.trim();
            const isSpectator = spectatorCheckbox.checked;
            
            if (!username) {
                username = generateRandomUsername();
                usernameInput.value = username;
            }
            
            // Sanitize username
            username = escapeHtml(username);
            
            state.user.username = username;
            socket.emit('joinRandomRoom', { username, isSpectator });
        });
    }

    socket.on('randomRoomFound', (roomCode) => {
        const isSpectator = spectatorCheckbox.checked;
        joinRoom(roomCode, state.user.username, isSpectator);
    });

    socket.on('error', (msg) => {
        showToast(msg, 'error');
    });

    // Max Players Slider
    if (maxPlayersInput) {
        const maxPlayersValue = document.getElementById('max-players-value');
        maxPlayersInput.addEventListener('input', (e) => {
            if (maxPlayersValue) {
                maxPlayersValue.textContent = e.target.value;
            }
        });
    }

    // Navigation
    joinBtn.addEventListener('click', () => {
        let username = usernameInput.value.trim();
        let roomCode = roomCodeInput.value.trim();
        const isSpectator = spectatorCheckbox.checked;
        
        if (!username) {
            username = generateRandomUsername();
            usernameInput.value = username;
        }

        if (roomCode && username) {
            // Sanitize
            username = escapeHtml(username);
            roomCode = escapeHtml(roomCode);
            
            joinRoom(roomCode, username, isSpectator);
        } else {
            showToast('Merci de remplir le pseudo et le code de la room', 'error');
        }
    });

    createBtn.addEventListener('click', () => {
        // Check if spectator mode is enabled
        if (spectatorCheckbox && spectatorCheckbox.checked) {
            showToast('Les observateurs ne peuvent pas créer de partie.', 'error');
            return;
        }

        let username = usernameInput.value.trim();
        const isPrivate = privateRoomCheckbox ? privateRoomCheckbox.checked : false;
        const maxPlayers = maxPlayersInput ? parseInt(maxPlayersInput.value) : 8;
        
        if (!username) {
            username = generateRandomUsername();
            usernameInput.value = username;
        }

        if (username) {
            // Sanitize
            username = escapeHtml(username);
            
            const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
            joinRoom(roomCode, username, false, isPrivate, maxPlayers);
        } else {
            showToast('Merci de choisir un pseudo', 'error');
        }
    });

    function joinRoom(roomCode, username, isSpectator = false, isPrivate = false, maxPlayers = 8) {
        state.user.username = username;
        state.currentRoom = roomCode;
        
        // Save username
        localStorage.setItem('drawit_username', username);
        
        const avatarData = avatarManager.getAvatarData();
        // Save avatar
        avatarManager.saveAvatarToStorage();

        socket.emit('joinRoom', {
            username: state.user.username,
            avatar: avatarData,
            roomCode: state.currentRoom,
            isSpectator,
            isPrivate,
            maxPlayers
        });

        loginScreen.classList.add('hidden');
        gameScreen.classList.remove('hidden');
        displayRoomCode.textContent = state.currentRoom;
    }

    // Room Code Toggle
    if (toggleCodeBtn) {
        toggleCodeBtn.addEventListener('click', () => {
            displayRoomCode.classList.toggle('code-hidden');
            iconEye.classList.toggle('hidden');
            iconEyeOff.classList.toggle('hidden');
        });
    }

    if (copyCodeBtn) {
        copyCodeBtn.addEventListener('click', () => {
            copyToClipboard(state.currentRoom)
                .then(() => showToast('Code copié !', 'success'))
                .catch(err => {
                    console.error('Copy failed:', err);
                    showToast('Erreur lors de la copie', 'error');
                });
        });
    }

    // Kick Modal
    let playerToKickId = null;

    window.showKickModal = function(playerId, username) {
        playerToKickId = playerId;
        kickPlayerName.textContent = username;
        kickModal.classList.remove('hidden');
    };

    btnKickCancel.addEventListener('click', () => {
        kickModal.classList.add('hidden');
        playerToKickId = null;
    });

    btnKickConfirm.addEventListener('click', () => {
        if (playerToKickId) {
            socket.emit('kickPlayer', playerToKickId);
            kickModal.classList.add('hidden');
            showToast('Joueur expulsé', 'success');
        }
    });

    // Alert Modal
    window.showAlert = function(title, message, callback) {
        alertTitle.textContent = title;
        alertMessage.textContent = message;
        alertModal.classList.remove('hidden');
        
        const handleOk = () => {
            alertModal.classList.add('hidden');
            alertOkBtn.removeEventListener('click', handleOk);
            if (callback) callback();
        };
        
        alertOkBtn.addEventListener('click', handleOk);
    };

    // Confirm Modal
    window.showConfirmModal = function(title, message, onConfirm) {
        const titleEl = confirmationModal.querySelector('h3');
        const msgEl = confirmationModal.querySelector('p');
        
        if (titleEl) titleEl.textContent = title;
        if (msgEl) msgEl.textContent = message;
        
        confirmationModal.classList.remove('hidden');
        
        const handleConfirm = () => {
            confirmationModal.classList.add('hidden');
            confirmOkBtn.removeEventListener('click', handleConfirm);
            confirmCancelBtn.removeEventListener('click', handleCancel);
            if (onConfirm) onConfirm();
        };

        const handleCancel = () => {
            confirmationModal.classList.add('hidden');
            confirmOkBtn.removeEventListener('click', handleConfirm);
            confirmCancelBtn.removeEventListener('click', handleCancel);
        };
        
        confirmOkBtn.addEventListener('click', handleConfirm);
        confirmCancelBtn.addEventListener('click', handleCancel);
    };

    // Game End
    btnReturnLobby.addEventListener('click', () => {
        gameEndModal.classList.add('hidden');
        animationSystem.stop();
        gameSettingsManager.show();
        gameSettingsManager.updateControlsState();
        
        // Clear canvas
        Object.values(state.layerCanvases).forEach(l => {
            l.ctx.clearRect(0, 0, 800, 600);
        });
        if (render) render();
    });

    // Ready Check
    btnIamReady.addEventListener('click', () => {
        socket.emit('playerReady', state.currentRoom);
        btnIamReady.classList.add('waiting');
        btnIamReady.textContent = 'EN ATTENTE...';
        btnIamReady.disabled = true;
    });

    if (btnRefuseGame) {
        btnRefuseGame.addEventListener('click', () => {
            socket.emit('playerRefused', state.currentRoom);
        });
    }

    // User Settings Modal
    if (btnUserSettings) {
        btnUserSettings.addEventListener('click', () => {
            userSettingsModal.classList.remove('hidden');
        });
    }

    if (btnCloseUserSettings) {
        btnCloseUserSettings.addEventListener('click', () => {
            userSettingsModal.classList.add('hidden');
        });
    }

    // Load saved settings
    const savedShowCursors = localStorage.getItem('drawit_show_cursors');
    if (savedShowCursors !== null) {
        const isVisible = savedShowCursors === 'true';
        if (settingShowCursors) settingShowCursors.checked = isVisible;
        if (cursorManager) cursorManager.setCursorsVisible(isVisible);
    }

    if (settingShowCursors) {
        settingShowCursors.addEventListener('change', (e) => {
            const isVisible = e.target.checked;
            localStorage.setItem('drawit_show_cursors', isVisible);
            if (cursorManager) cursorManager.setCursorsVisible(isVisible);
        });
    }

    const savedShowLayerAvatars = localStorage.getItem('drawit_show_layer_avatars');
    if (savedShowLayerAvatars !== null) {
        const isVisible = savedShowLayerAvatars === 'true';
        if (settingShowLayerAvatars) settingShowLayerAvatars.checked = isVisible;
        if (layerManager) layerManager.setShowLayerAvatars(isVisible);
    }

    if (settingShowLayerAvatars) {
        settingShowLayerAvatars.addEventListener('change', (e) => {
            const isVisible = e.target.checked;
            localStorage.setItem('drawit_show_layer_avatars', isVisible);
            if (layerManager) layerManager.setShowLayerAvatars(isVisible);
        });
    }
}
