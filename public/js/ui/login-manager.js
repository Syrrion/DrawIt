import {
    joinBtn, createBtn, roomCodeInput, usernameInput, loginScreen, gameScreen, displayRoomCode,
    toggleCodeBtn, iconEye, iconEyeOff, copyCodeBtn,
    spectatorCheckbox, btnJoinRandom, privateRoomCheckbox, allowSpectatorsCheckbox, maxPlayersInput,
    waitingMessage
} from '../dom-elements.js';
import { Tabs } from '../components/tabs.js';
import { socket } from '../dom-elements.js';
import { state } from '../state.js';
import { showToast, generateRandomUsername, copyToClipboard, escapeHtml } from '../utils.js';

export class LoginManager {
    constructor(uiManager) {
        this.uiManager = uiManager;
        this.init();
    }

    init() {
        // Login Tabs Logic
        this.loginTabs = new Tabs('.login-tab', '.login-tab-content');

        // Pre-fill random username or load from storage
        const savedUsername = localStorage.getItem('drawit_username');
        const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

        if (isLocalhost) {
            if (usernameInput) usernameInput.value = generateRandomUsername();
        } else if (savedUsername) {
            if (usernameInput) usernameInput.value = savedUsername;
        } else if (usernameInput && !usernameInput.value) {
            usernameInput.value = generateRandomUsername();
        }

        // Spectator Toggle Logic
        if (spectatorCheckbox) {
            spectatorCheckbox.addEventListener('change', () => {
                const isSpectator = spectatorCheckbox.checked;

                // Update Join Tab Label
                const joinTab = document.querySelector('.login-tab[data-target="tab-join"]');
                if (joinTab) {
                    joinTab.textContent = isSpectator ? 'Observer' : 'Rejoindre';
                }

                // Show/Hide Filter Section
                const filterSection = document.getElementById('spectator-filter-section');
                if (filterSection) {
                    if (isSpectator) {
                        filterSection.classList.remove('hidden');
                    } else {
                        filterSection.classList.add('hidden');
                    }
                }

                // Update Game Count
                if (this.uiManager.updateGameCountDisplay) {
                    this.uiManager.updateGameCountDisplay();
                }
            });
        }

        // Spectator Filter Change
        const filterSelect = document.getElementById('spectator-filter-select');
        if (filterSelect) {
            filterSelect.addEventListener('change', () => {
                if (this.uiManager.updateGameCountDisplay) {
                    this.uiManager.updateGameCountDisplay();
                }
            });
        }

        // Random Join
        if (btnJoinRandom) {
            btnJoinRandom.addEventListener('click', () => {
                let username = usernameInput.value.trim();
                const isSpectator = spectatorCheckbox.checked;

                // Get filter value
                let filter = 'all';
                if (isSpectator && filterSelect) {
                    filter = filterSelect.value;
                }

                if (!username) {
                    username = generateRandomUsername();
                    usernameInput.value = username;
                }

                // Sanitize username
                username = escapeHtml(username);

                state.user.username = username;
                socket.emit('joinRandomRoom', { username, isSpectator, filter });
            });
        }

        socket.on('randomRoomFound', (roomCode) => {
            const isSpectator = spectatorCheckbox.checked;
            this.joinRoom(roomCode, state.user.username, isSpectator);
        });

        socket.on('roomJoined', (data) => {
            loginScreen.classList.add('hidden');
            gameScreen.classList.remove('hidden');
            displayRoomCode.textContent = data.roomCode;
            document.body.classList.add('game-active');
            
            // Hide loading modal when room is fully joined
            if (this.uiManager.modalManager && this.uiManager.modalManager.loadingModalInstance) {
                this.uiManager.modalManager.loadingModalInstance.close();
            }
        });

        socket.on('error', () => {
            if (this.uiManager.modalManager && this.uiManager.modalManager.loadingModalInstance) {
                this.uiManager.modalManager.loadingModalInstance.close();
            }
        });

        socket.on('updateLobbyStatus', ({ status }) => {
            if (waitingMessage) {
                const span = waitingMessage.querySelector('span');
                if (span) {
                    if (status === 'CONFIGURING') {
                        span.textContent = 'Préparation en cours...';
                    } else {
                        span.textContent = 'En attente du leader...';
                    }
                }
            }

            // Animate settings button for non-leaders
            const btnViewSettings = document.getElementById('btn-view-settings');
            if (btnViewSettings) {
                if (status === 'CONFIGURING') {
                    btnViewSettings.classList.add('is-configuring');
                } else {
                    btnViewSettings.classList.remove('is-configuring');
                }
            }
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

                this.joinRoom(roomCode, username, isSpectator);
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
            const allowSpectators = allowSpectatorsCheckbox ? allowSpectatorsCheckbox.checked : true;
            const maxPlayers = maxPlayersInput ? parseInt(maxPlayersInput.value) : 8;

            if (!username) {
                username = generateRandomUsername();
                usernameInput.value = username;
            }

            if (username) {
                // Sanitize
                username = escapeHtml(username);

                const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
                this.joinRoom(roomCode, username, false, isPrivate, maxPlayers, allowSpectators);
            } else {
                showToast('Merci de choisir un pseudo', 'error');
            }
        });

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
    }

    joinRoom(roomCode, username, isSpectator = false, isPrivate = false, maxPlayers = 8, allowSpectators = true) {
        state.user.username = username;
        state.isSpectator = isSpectator;
        
        // Save username
        localStorage.setItem('drawit_username', username);

        if (this.uiManager.modalManager && this.uiManager.modalManager.loadingModalInstance) {
            this.uiManager.modalManager.loadingModalInstance.open();
        }
        
        socket.emit('joinRoom', { 
            roomCode, 
            username, 
            isSpectator,
            isPrivate,
            maxPlayers,
            allowSpectators
        });
    }
}
