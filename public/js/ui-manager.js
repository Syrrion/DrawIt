import { 
    joinBtn, createBtn, roomCodeInput, usernameInput, loginScreen, gameScreen, displayRoomCode,
    toggleCodeBtn, iconEye, iconEyeOff, copyCodeBtn,
    kickModal, btnKickCancel, btnKickConfirm, kickPlayerName,
    alertModal, alertTitle, alertMessage, alertOkBtn,
    confirmationModal, confirmOkBtn, confirmCancelBtn,
    btnReturnLobby, gameEndModal,
    btnIamReady, btnRefuseGame, readyCheckModal,
    socket
} from './dom-elements.js';
import { state } from './state.js';
import { showToast, generateRandomUsername, copyToClipboard } from './utils.js';

export function initUIManager(avatarManager, animationSystem, gameSettingsManager, render) {
    // Pre-fill random username
    if (usernameInput && !usernameInput.value) {
        usernameInput.value = generateRandomUsername();
    }

    // Navigation
    joinBtn.addEventListener('click', () => {
        let username = usernameInput.value.trim();
        const roomCode = roomCodeInput.value.trim();
        
        if (!username) {
            username = generateRandomUsername();
            usernameInput.value = username;
        }

        if (roomCode && username) {
            joinRoom(roomCode, username);
        } else {
            showToast('Merci de remplir le pseudo et le code de la room', 'error');
        }
    });

    createBtn.addEventListener('click', () => {
        let username = usernameInput.value.trim();
        
        if (!username) {
            username = generateRandomUsername();
            usernameInput.value = username;
        }

        if (username) {
            const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
            joinRoom(roomCode, username);
        } else {
            showToast('Merci de choisir un pseudo', 'error');
        }
    });

    function joinRoom(roomCode, username) {
        state.user.username = username;
        state.currentRoom = roomCode;
        
        const avatarData = avatarManager.getAvatarData();

        socket.emit('joinRoom', {
            username: state.user.username,
            avatar: avatarData,
            roomCode: state.currentRoom
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
        btnIamReady.textContent = 'En attente des autres...';
        btnIamReady.disabled = true;
    });

    if (btnRefuseGame) {
        btnRefuseGame.addEventListener('click', () => {
            socket.emit('playerRefused', state.currentRoom);
        });
    }
}
