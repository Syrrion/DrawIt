import {
    joinBtn, createBtn, roomCodeInput, usernameInput, loginScreen, gameScreen, displayRoomCode,
    toggleCodeBtn, iconEye, iconEyeOff, copyCodeBtn,
    kickModal, btnKickCancel, btnKickConfirm, kickPlayerName,
    alertModal, alertTitle, alertMessage, alertOkBtn,
    confirmationModal, confirmOkBtn, confirmCancelBtn,
    btnReturnLobby, gameEndModal,
    btnIamReady, btnRefuseGame, readyCheckModal,
    socket, spectatorCheckbox, btnJoinRandom, activeGamesCount, privateRoomCheckbox, allowSpectatorsCheckbox,
    btnUserSettings, userSettingsModal, btnCloseUserSettings, settingShowCursors, settingShowLayerAvatars,
    maxPlayersInput, btnSubmitCustomWord, customWordInput, customWordModal, waitingMessage,
    clearOptionsModal, btnClearLayer, btnClearAll, btnCancelClear,
    toolbarDragHandle, gameToolbar, sidebarCol2, sidebarGroup, chatSidebar, btnToggleSidebarPos,
    toolModelBtn, referenceBrowser, btnBrowserClose, browserUrlInput, btnBrowserGo, browserHeader, imageResultsGrid,
    btnBrowserPin, globalPinControls, browserOpacity, btnBrowserUnpin, layersList, canvasWrapper
} from './dom-elements.js';
import { state } from './state.js';
import { showToast, generateRandomUsername, copyToClipboard, escapeHtml } from './utils.js';
import { Modal } from './components/modal.js';
import { Tabs } from './components/tabs.js';

export class UIManager {
    constructor(avatarManager, animationSystem, gameSettingsManager, renderCallback, cursorManager, layerManager) {
        this.avatarManager = avatarManager;
        this.animationSystem = animationSystem;
        this.gameSettingsManager = gameSettingsManager;
        this.renderCallback = renderCallback;
        this.cursorManager = cursorManager;
        this.layerManager = layerManager;

        this.currentCounts = { playable: 0, observable: 0 };
        this.playerToKickId = null;

        this.init();
    }

    init() {
        // Randomize background gradient start
        document.body.style.animationDelay = `-${Math.random() * 60}s`;

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

        this.initGameCount();

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
                this.updateGameCountDisplay();
            });
        }

        // Spectator Filter Change
        const filterSelect = document.getElementById('spectator-filter-select');
        if (filterSelect) {
            filterSelect.addEventListener('change', () => {
                this.updateGameCountDisplay();
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
            displayRoomCode.textContent = state.currentRoom;
            document.body.classList.add('game-active');
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

            // We need to remove old listeners or clone the button to avoid stacking listeners
            // A cleaner way is to use a one-time listener or manage it via the class
            // For now, let's use the removeEventListener approach but we need to be careful about previous listeners
            // Actually, creating a new function every time is problematic for removal if we don't store reference.
            // Let's use a property on the instance to store the current confirm handler

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
                this.animationSystem.stop();
                this.gameSettingsManager.show();
                this.gameSettingsManager.updateControlsState();

                // Clear canvas
                Object.values(state.layerCanvases).forEach(l => {
                    l.ctx.clearRect(0, 0, 800, 600);
                });
                if (this.renderCallback) this.renderCallback();
            }
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
            if (this.cursorManager) this.cursorManager.setCursorsVisible(isVisible);
        }

        if (settingShowCursors) {
            settingShowCursors.addEventListener('change', (e) => {
                const isVisible = e.target.checked;
                localStorage.setItem('drawit_show_cursors', isVisible);
                if (this.cursorManager) this.cursorManager.setCursorsVisible(isVisible);
            });
        }

        const savedShowLayerAvatars = localStorage.getItem('drawit_show_layer_avatars');
        if (savedShowLayerAvatars !== null) {
            const isVisible = savedShowLayerAvatars === 'true';
            if (settingShowLayerAvatars) settingShowLayerAvatars.checked = isVisible;
            if (this.layerManager) this.layerManager.setShowLayerAvatars(isVisible);
        }

        if (settingShowLayerAvatars) {
            settingShowLayerAvatars.addEventListener('change', (e) => {
                const isVisible = e.target.checked;
                localStorage.setItem('drawit_show_layer_avatars', isVisible);
                if (this.layerManager) this.layerManager.setShowLayerAvatars(isVisible);
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

        // Clear Options Modal
        this.clearOptionsModalInstance = new Modal(clearOptionsModal, {
            closeBtn: btnCancelClear
        });

        window.showClearOptionsModal = (onClearLayer, onClearAll) => {
            const btnLayer = document.getElementById('btn-clear-layer');
            const btnAll = document.getElementById('btn-clear-all');

            if (!btnLayer || !btnAll) {
                console.error('Clear buttons not found in DOM');
                return;
            }

            // Use onclick to automatically replace previous listeners
            btnLayer.onclick = () => {
                this.clearOptionsModalInstance.close();
                if (onClearLayer) onClearLayer();
            };

            btnAll.onclick = () => {
                this.clearOptionsModalInstance.close();
                if (onClearAll) onClearAll();
            };

            this.clearOptionsModalInstance.open();
        };

        this.initLayout();
        this.initBrowser();
    }

    initBrowser() {
        if (!toolModelBtn || !referenceBrowser) return;

        let currentHits = []; // Store current search results
        let currentSingleImageUrl = null; // Store current single image URL

        const renderGrid = () => {
            currentSingleImageUrl = null;
            if (!imageResultsGrid) return;
            
            imageResultsGrid.innerHTML = '';
            imageResultsGrid.classList.remove('single-view');
            
            if (currentHits.length > 0) {
                currentHits.forEach(hit => {
                    const imgContainer = document.createElement('div');
                    imgContainer.className = 'image-result-item';
                    
                    const img = document.createElement('img');
                    img.src = hit.previewURL;
                    img.alt = hit.tags;
                    img.title = hit.tags;
                    
                    // Click to open in single view
                    imgContainer.onclick = () => {
                        showSingleImage(hit.webformatURL);
                    };
                    
                    imgContainer.appendChild(img);
                    imageResultsGrid.appendChild(imgContainer);
                });
            } else {
                imageResultsGrid.innerHTML = '<div class="empty-state">Aucune image trouvée.</div>';
            }
        };

        const showSingleImage = (url) => {
            currentSingleImageUrl = url;
            if (!imageResultsGrid) return;
            
            imageResultsGrid.innerHTML = '';
            imageResultsGrid.classList.add('single-view');
            
            const container = document.createElement('div');
            container.className = 'single-image-view';
            
            // Header with Back and Use buttons
            const header = document.createElement('div');
            header.style.display = 'flex';
            header.style.justifyContent = 'space-between';
            header.style.alignItems = 'center';
            header.style.marginBottom = '10px';

            const backBtn = document.createElement('button');
            backBtn.className = 'back-to-grid-btn';
            backBtn.innerHTML = '<i class="fas fa-arrow-left"></i> Retour';
            backBtn.onclick = () => {
                renderGrid();
            };

            const useBtn = document.createElement('button');
            useBtn.className = 'use-as-layer-btn';
            useBtn.innerHTML = 'Utiliser comme calque <i class="fas fa-check"></i>';

            // Check if user can draw
            const canDraw = () => {
                if (state.isSpectator) return false;
                
                // Allow in Lobby/Configuring
                if (state.currentGameState === 'LOBBY' || state.currentGameState === 'CONFIGURING' || state.currentGameState === 'WAITING') return true;

                if (state.currentGameState !== 'PLAYING') return false;
                
                // Check global setting
                if (state.settings && state.settings.allowTracing === false) return false;

                if (state.settings && state.settings.mode === 'creative') {
                    return true;
                } else {
                    return state.currentDrawerId === socket.id;
                }
            };

            if (!canDraw()) {
                useBtn.disabled = true;
                useBtn.title = "Vous ne pouvez pas dessiner pour le moment";
                useBtn.style.opacity = '0.5';
                useBtn.style.cursor = 'not-allowed';
            } else {
                useBtn.onclick = () => {
                    // Trigger pin mode
                    const event = new CustomEvent('request-toggle-pin-mode', { detail: { active: true } });
                    document.dispatchEvent(event);
                };
            }
            
            header.appendChild(backBtn);
            header.appendChild(useBtn);

            const imgContainer = document.createElement('div');
            imgContainer.className = 'single-image-container';
            
            const img = document.createElement('img');
            img.src = url;
            
            imgContainer.appendChild(img);
            container.appendChild(header);
            container.appendChild(imgContainer);
            
            imageResultsGrid.appendChild(container);
        };

        const searchImages = async (query = null) => {
            let searchTerm = query || browserUrlInput.value.trim();
            if (!searchTerm) return;

            // Update input if direct call
            if (query) browserUrlInput.value = query;

            // Show loading state
            if (imageResultsGrid) {
                imageResultsGrid.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Chargement...</div>';
            }

            try {
                const response = await fetch(`/api/pixabay?q=${encodeURIComponent(searchTerm)}`);
                const data = await response.json();

                if (data.hits) {
                    currentHits = data.hits;
                    renderGrid();
                } else {
                     if (imageResultsGrid) imageResultsGrid.innerHTML = '<div class="empty-state">Aucune image trouvée.</div>';
                }
            } catch (error) {
                console.error('Search error:', error);
                if (imageResultsGrid) {
                    imageResultsGrid.innerHTML = '<div class="empty-state">Erreur lors de la recherche.</div>';
                }
            }
        };

        // Toggle Visibility
        toolModelBtn.addEventListener('click', () => {
            const isHidden = referenceBrowser.classList.contains('hidden');
            referenceBrowser.classList.toggle('hidden');
            toolModelBtn.classList.toggle('active');

            if (isHidden) {
                // Auto-search if word is defined
                const wordText = document.getElementById('word-display').textContent.trim();
                if (wordText && !wordText.includes('_')) {
                    searchImages(wordText);
                } else if (imageResultsGrid && imageResultsGrid.children.length <= 1) { // Empty or just empty-state
                     // Focus input
                     if (browserUrlInput) browserUrlInput.focus();
                }
            }
        });

        if (btnBrowserClose) {
            btnBrowserClose.addEventListener('click', () => {
                referenceBrowser.classList.add('hidden');
                toolModelBtn.classList.remove('active');
            });
        }

        if (btnBrowserGo) {
            btnBrowserGo.addEventListener('click', () => { searchImages(); });
        }

        if (browserUrlInput) {
            browserUrlInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') searchImages();
            });
        }

        // Dragging
        if (browserHeader) {
            let isDragging = false;
            let startX, startY, initialLeft, initialTop;

            browserHeader.addEventListener('mousedown', (e) => {
                if (e.target.closest('button')) return; // Don't drag if clicking buttons
                
                isDragging = true;
                
                startX = e.clientX;
                startY = e.clientY;
                initialLeft = referenceBrowser.offsetLeft;
                initialTop = referenceBrowser.offsetTop;
                
                e.preventDefault();
            });

            document.addEventListener('mousemove', (e) => {
                if (!isDragging) return;

                const dx = e.clientX - startX;
                const dy = e.clientY - startY;

                let newLeft = initialLeft + dx;
                let newTop = initialTop + dy;

                // Clamp to viewport
                const rect = referenceBrowser.getBoundingClientRect();
                const width = rect.width;
                const height = rect.height;
                const viewportWidth = window.innerWidth;
                const viewportHeight = window.innerHeight;

                if (newLeft < 0) newLeft = 0;
                if (newLeft + width > viewportWidth) newLeft = viewportWidth - width;
                if (newTop < 0) newTop = 0;
                if (newTop + height > viewportHeight) newTop = viewportHeight - height;

                referenceBrowser.style.left = newLeft + 'px';
                referenceBrowser.style.top = newTop + 'px';
            });

            document.addEventListener('mouseup', () => {
                isDragging = false;
            });
        }

        // Pin Mode Logic
        // Define togglePinMode in a scope accessible to the event listener
        const togglePinMode = (active) => {
            if (active) {
                // Cleanup existing tracing elements first
                const existingImage = document.getElementById('tracing-image');
                if (existingImage) existingImage.remove();

                const existingControls = document.getElementById('tracing-controls');
                if (existingControls) {
                    if (existingControls.cleanup) existingControls.cleanup();
                    existingControls.remove();
                }

                const existingDummy = document.getElementById('dummy-model-layer');
                if (existingDummy) existingDummy.remove();

                const existingCartridge = document.getElementById('tracing-actions-cartridge');
                if (existingCartridge) existingCartridge.remove();
                
                // Reset clipping
                if (canvasWrapper) canvasWrapper.classList.remove('clipped');

                if (!currentSingleImageUrl) {
                    showToast("Veuillez sélectionner une image d'abord", "warning");
                    return;
                }

                // Create Tracing Image
                if (canvasWrapper) {
                    const img = new Image();
                    img.src = currentSingleImageUrl;
                    img.onload = () => {
                        // Calculate dimensions
                        const canvasW = canvasWrapper.offsetWidth;
                        const canvasH = canvasWrapper.offsetHeight;

                        const imgRatio = img.width / img.height;
                        const canvasRatio = canvasW / canvasH;

                        let finalW, finalH, finalTop, finalLeft;

                        if (imgRatio > canvasRatio) {
                            // Width constrained
                            finalW = canvasW;
                            finalH = canvasW / imgRatio;
                            finalLeft = 0;
                            finalTop = (canvasH - finalH) / 2;
                        } else {
                            // Height constrained
                            finalH = canvasH;
                            finalW = canvasH * imgRatio;
                            finalTop = 0;
                            finalLeft = (canvasW - finalW) / 2;
                        }

                        let tracingImage = document.createElement('img');
                        tracingImage.id = 'tracing-image';
                        tracingImage.className = 'tracing-image';
                        canvasWrapper.appendChild(tracingImage);
                        
                        tracingImage.src = currentSingleImageUrl;
                        tracingImage.style.width = finalW + 'px';
                        tracingImage.style.height = finalH + 'px';
                        tracingImage.style.left = finalLeft + 'px';
                        tracingImage.style.top = finalTop + 'px';
                        tracingImage.style.objectFit = 'fill'; // Since we control size
                        
                        if (browserOpacity) {
                            tracingImage.style.opacity = browserOpacity.value;
                        }

                        // Create Controls Element
                        let tracingControls = document.createElement('div');
                        tracingControls.id = 'tracing-controls';
                        tracingControls.className = 'tracing-controls';
                        tracingControls.innerHTML = `
                            <div class="resize-handle nw" data-dir="nw"></div>
                            <div class="resize-handle ne" data-dir="ne"></div>
                            <div class="resize-handle sw" data-dir="sw"></div>
                            <div class="resize-handle se" data-dir="se"></div>
                        `;
                        canvasWrapper.appendChild(tracingControls);
                        
                        tracingControls.style.width = finalW + 'px';
                        tracingControls.style.height = finalH + 'px';
                        tracingControls.style.left = finalLeft + 'px';
                        tracingControls.style.top = finalTop + 'px';

                        // Setup Resize Handlers
                        this.setupResizeHandlers(tracingControls, tracingImage, imgRatio);
                    };
                }

                document.body.classList.add('tracing-mode');
                
                // Add Dummy Layer
                if (layersList) {
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
                    layersList.appendChild(dummyLayer);

                    // Attach listeners to dummy layer controls
                    const detachBtn = document.getElementById('btn-detach-model');
                    if (detachBtn) {
                        detachBtn.addEventListener('click', () => togglePinMode(false));
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

                // Add Tracing Cartridge to Toolbar
                let tracingCartridge = document.getElementById('tracing-actions-cartridge');
                if (!tracingCartridge && gameToolbar) {
                    tracingCartridge = document.createElement('div');
                    tracingCartridge.id = 'tracing-actions-cartridge';
                    tracingCartridge.className = 'tracing-actions-cartridge';
                    
                    // Validate Button
                    const validateBtn = document.createElement('button');
                    validateBtn.className = 'tracing-btn-validate';
                    validateBtn.innerHTML = '<i class="fas fa-check"></i> Valider';
                    validateBtn.title = "Valider la pose";
                    
                    validateBtn.addEventListener('click', () => {
                        // Remove controls but keep image
                        const tracingControls = document.getElementById('tracing-controls');
                        if (tracingControls) {
                            if (tracingControls.cleanup) tracingControls.cleanup();
                            tracingControls.remove();
                        }
                        // Exit mode but keep image
                        document.body.classList.remove('tracing-mode');
                        tracingCartridge.remove();
                        
                        // Clip overflow
                        if (canvasWrapper) canvasWrapper.classList.add('clipped');
                        
                        showToast('Pose validée. Vous pouvez dessiner par dessus.', 'success');
                    });

                    // Cancel Button
                    const cancelBtn = document.createElement('button');
                    cancelBtn.className = 'tracing-btn-cancel';
                    cancelBtn.innerHTML = '<i class="fas fa-times"></i> Annuler';
                    cancelBtn.title = "Annuler";

                    cancelBtn.addEventListener('click', () => {
                        togglePinMode(false); // Full cleanup
                    });

                    tracingCartridge.appendChild(validateBtn);
                    tracingCartridge.appendChild(cancelBtn);
                    gameToolbar.appendChild(tracingCartridge);
                }

                showToast('Mode Calque activé', 'info');
            } else {
                document.body.classList.remove('tracing-mode');
                
                // Remove Tracing Image
                const tracingImage = document.getElementById('tracing-image');
                if (tracingImage) tracingImage.remove();

                // Remove Controls
                const tracingControls = document.getElementById('tracing-controls');
                if (tracingControls) {
                    if (tracingControls.cleanup) tracingControls.cleanup();
                    tracingControls.remove();
                }

                // Remove Dummy Layer
                const dummyLayer = document.getElementById('dummy-model-layer');
                if (dummyLayer) dummyLayer.remove();

                // Remove Tracing Cartridge
                const tracingCartridge = document.getElementById('tracing-actions-cartridge');
                if (tracingCartridge) tracingCartridge.remove();
                
                // Reset clipping
                if (canvasWrapper) canvasWrapper.classList.remove('clipped');
            }
        };

        // Listen for custom event from Layers or Button
        document.addEventListener('request-toggle-pin-mode', (e) => {
            togglePinMode(e.detail.active);
        });

        if (btnBrowserPin) btnBrowserPin.addEventListener('click', () => togglePinMode(true));
        if (btnBrowserUnpin) btnBrowserUnpin.addEventListener('click', () => togglePinMode(false));

        if (browserOpacity) {
            browserOpacity.addEventListener('input', (e) => {
                const tracingImage = document.getElementById('tracing-image');
                if (tracingImage) {
                    tracingImage.style.opacity = e.target.value;
                }
            });
        }

        // Auto-cleanup on turn end
        const cleanupTracing = () => {
             togglePinMode(false);
             if (referenceBrowser) referenceBrowser.classList.add('hidden');
             if (toolModelBtn) toolModelBtn.classList.remove('active');
             if (imageResultsGrid) imageResultsGrid.innerHTML = '';
             if (browserUrlInput) browserUrlInput.value = '';
        };

        socket.on('turnStart', cleanupTracing);
        socket.on('roundEnd', cleanupTracing);
        socket.on('gameEnded', cleanupTracing);
    }

    setupResizeHandlers(controls, image, aspectRatio) {
        const handles = controls.querySelectorAll('.resize-handle');
        let isResizing = false;
        let isMoving = false;
        let startX, startY, startW, startH, startTop, startLeft;
        let currentHandle = null;

        // Resize Logic
        handles.forEach(handle => {
            handle.addEventListener('mousedown', (e) => {
                e.stopPropagation();
                isResizing = true;
                currentHandle = handle.dataset.dir;
                
                startX = e.clientX;
                startY = e.clientY;
                
                startW = controls.offsetWidth;
                startH = controls.offsetHeight;
                startTop = controls.offsetTop;
                startLeft = controls.offsetLeft;

                document.body.style.cursor = window.getComputedStyle(handle).cursor;
                document.body.style.userSelect = 'none'; // Prevent text selection
            });
        });

        // Move Logic - Click anywhere on controls (which covers image)
        controls.addEventListener('mousedown', (e) => {
            // Ignore if clicking a resize handle (though stopPropagation handles this usually)
            if (e.target.classList.contains('resize-handle')) return;

            isMoving = true;
            
            startX = e.clientX;
            startY = e.clientY;
            
            startTop = controls.offsetTop;
            startLeft = controls.offsetLeft;
            
            document.body.style.cursor = 'move';
            document.body.style.userSelect = 'none'; // Prevent text selection
            e.preventDefault();
        });

        const onMouseMove = (e) => {
            if (!isResizing && !isMoving) return;

            // Get scale factor
            let scale = 1;
            if (canvasWrapper) {
                const transform = canvasWrapper.style.transform;
                const match = transform.match(/scale\(([\d.]+)\)/);
                if (match) scale = parseFloat(match[1]);
            }

            const dx = (e.clientX - startX) / scale;
            const dy = (e.clientY - startY) / scale;

            if (isMoving) {
                let newLeft = startLeft + dx;
                let newTop = startTop + dy;
                
                controls.style.left = newLeft + 'px';
                controls.style.top = newTop + 'px';
                image.style.left = newLeft + 'px';
                image.style.top = newTop + 'px';
                return;
            }

            let newW = startW;
            let newH = startH;
            let newTop = startTop;
            let newLeft = startLeft;

            // Calculate new dimensions based on handle
            if (currentHandle.includes('e')) {
                newW = startW + dx;
            }
            if (currentHandle.includes('w')) {
                newW = startW - dx;
                newLeft = startLeft + dx;
            }
            if (currentHandle.includes('s')) {
                newH = startH + dy;
            }
            if (currentHandle.includes('n')) {
                newH = startH - dy;
                newTop = startTop + dy;
            }

            // Enforce Aspect Ratio
            if (currentHandle === 'se') {
                newH = newW / aspectRatio;
            } else if (currentHandle === 'sw') {
                newH = newW / aspectRatio;
            } else if (currentHandle === 'ne') {
                newH = newW / aspectRatio;
                newTop = startTop + (startH - newH);
            } else if (currentHandle === 'nw') {
                newH = newW / aspectRatio;
                newTop = startTop + (startH - newH);
            }

            // Min size check
            if (newW < 20 || newH < 20) return;

            // Apply
            controls.style.width = newW + 'px';
            controls.style.height = newH + 'px';
            controls.style.top = newTop + 'px';
            controls.style.left = newLeft + 'px';

            image.style.width = newW + 'px';
            image.style.height = newH + 'px';
            image.style.top = newTop + 'px';
            image.style.left = newLeft + 'px';
        };

        const onMouseUp = () => {
            if (isResizing || isMoving) {
                isResizing = false;
                isMoving = false;
                document.body.style.cursor = '';
                document.body.style.userSelect = ''; // Restore text selection
            }
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
        
        controls.cleanup = () => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        };
    }

    initLayout() {
        // Sidebar Swap Logic
        const savedSwapSidebars = localStorage.getItem('drawit_swap_sidebars');
        let isSwapped = false;
        if (savedSwapSidebars !== null) {
            isSwapped = savedSwapSidebars === 'true';
            this.toggleSidebarLayout(isSwapped);
        }

        if (btnToggleSidebarPos) {
            btnToggleSidebarPos.addEventListener('click', () => {
                isSwapped = !isSwapped;
                localStorage.setItem('drawit_swap_sidebars', isSwapped);
                this.toggleSidebarLayout(isSwapped);
            });
        }

        // Movable Toolbar Logic
        if (toolbarDragHandle && gameToolbar) {
            let isDragging = false;
            let startX, startY, initialLeft, initialTop;

            toolbarDragHandle.addEventListener('mousedown', (e) => {
                isDragging = true;
                
                // Get current position relative to viewport BEFORE adding classes
                const rect = gameToolbar.getBoundingClientRect();
                
                gameToolbar.classList.add('dragging');
                gameToolbar.classList.add('custom-pos');
                
                // Get parent position to calculate relative coordinates
                const parentRect = gameToolbar.parentElement.getBoundingClientRect();
                
                gameToolbar.style.transformOrigin = 'top left';
                gameToolbar.style.transform = 'scale(var(--scale-factor))';
                
                // Calculate relative position
                // We want the visual position (rect.left) to match parentRect.left + style.left
                const relativeLeft = rect.left - parentRect.left;
                const relativeTop = rect.top - parentRect.top;
                
                gameToolbar.style.left = relativeLeft + 'px';
                gameToolbar.style.top = relativeTop + 'px';
                gameToolbar.style.bottom = 'auto';

                startX = e.clientX;
                startY = e.clientY;
                initialLeft = relativeLeft;
                initialTop = relativeTop;

                e.preventDefault(); // Prevent text selection
            });

            document.addEventListener('mousemove', (e) => {
                if (!isDragging) return;

                const dx = e.clientX - startX;
                const dy = e.clientY - startY;

                let newLeft = initialLeft + dx;
                let newTop = initialTop + dy;

                // Clamp to viewport
                // We need to convert viewport bounds to parent-relative bounds
                const rect = gameToolbar.getBoundingClientRect();
                const parentRect = gameToolbar.parentElement.getBoundingClientRect();
                const width = rect.width;
                const height = rect.height;
                const viewportWidth = window.innerWidth;
                const viewportHeight = window.innerHeight;

                // Calculate min/max relative positions
                // Min Left: 0 (viewport left) -> 0 - parentRect.left
                const minLeft = -parentRect.left;
                // Max Left: viewportWidth - width -> viewportWidth - width - parentRect.left
                const maxLeft = viewportWidth - width - parentRect.left;
                
                const minTop = -parentRect.top;
                const maxTop = viewportHeight - height - parentRect.top;

                // Clamp
                if (newLeft < minLeft) newLeft = minLeft;
                if (newLeft > maxLeft) newLeft = maxLeft;
                if (newTop < minTop) newTop = minTop;
                if (newTop > maxTop) newTop = maxTop;

                gameToolbar.style.left = newLeft + 'px';
                gameToolbar.style.top = newTop + 'px';
            });

            document.addEventListener('mouseup', () => {
                if (!isDragging) return;
                isDragging = false;
                gameToolbar.classList.remove('dragging');
            });

            // Handle Resize to keep toolbar in view
            window.addEventListener('resize', () => {
                if (gameToolbar.classList.contains('custom-pos')) {
                    const rect = gameToolbar.getBoundingClientRect();
                    const parentRect = gameToolbar.parentElement.getBoundingClientRect();
                    const viewportWidth = window.innerWidth;
                    const viewportHeight = window.innerHeight;
                    
                    let newLeft = parseFloat(gameToolbar.style.left);
                    let newTop = parseFloat(gameToolbar.style.top);
                    let changed = false;

                    // Calculate bounds relative to parent
                    const minLeft = -parentRect.left;
                    const maxLeft = viewportWidth - rect.width - parentRect.left;
                    const minTop = -parentRect.top;
                    const maxTop = viewportHeight - rect.height - parentRect.top;

                    if (newLeft < minLeft) { newLeft = minLeft; changed = true; }
                    if (newLeft > maxLeft) { newLeft = maxLeft; changed = true; }
                    if (newTop < minTop) { newTop = minTop; changed = true; }
                    if (newTop > maxTop) { newTop = maxTop; changed = true; }

                    if (changed) {
                        gameToolbar.style.left = newLeft + 'px';
                        gameToolbar.style.top = newTop + 'px';
                    }
                }
            });
        }
    }

    toggleSidebarLayout(isSwapped) {
        if (!sidebarCol2 || !sidebarGroup || !gameScreen || !chatSidebar) return;

        const icon = btnToggleSidebarPos ? btnToggleSidebarPos.querySelector('i') : null;

        if (isSwapped) {
            // Move Col2 to right (before chat sidebar)
            gameScreen.insertBefore(sidebarCol2, chatSidebar);
            sidebarCol2.classList.add('right-side');
            if (icon) {
                icon.classList.remove('fa-chevron-right');
                icon.classList.add('fa-chevron-left');
            }
        } else {
            // Move Col2 back to group
            sidebarGroup.appendChild(sidebarCol2);
            sidebarCol2.classList.remove('right-side');
            if (icon) {
                icon.classList.remove('fa-chevron-left');
                icon.classList.add('fa-chevron-right');
            }
        }
    }

    updateGameCountDisplay() {
        if (!activeGamesCount) return;

        const isSpectator = spectatorCheckbox ? spectatorCheckbox.checked : false;
        let count = 0;

        if (isSpectator) {
            const filterSelect = document.getElementById('spectator-filter-select');
            const filter = filterSelect ? filterSelect.value : 'all';

            if (this.currentCounts.observable && typeof this.currentCounts.observable === 'object') {
                count = this.currentCounts.observable[filter] || 0;
            } else {
                // Fallback for legacy or simple count
                count = typeof this.currentCounts.observable === 'number' ? this.currentCounts.observable : 0;
            }
        } else {
            count = this.currentCounts.playable || 0;
        }

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

    initGameCount() {
        socket.emit('getPublicGameCount');

        socket.on('updatePublicGameCount', (counts) => {
            // Handle legacy number format just in case, though we changed server
            if (typeof counts === 'number') {
                this.currentCounts = { playable: counts, observable: counts };
            } else {
                this.currentCounts = counts;
            }
            this.updateGameCountDisplay();
        });

        setInterval(() => {
            if (!state.currentRoom) {
                socket.emit('getPublicGameCount');
            }
        }, 5000);
    }

    joinRoom(roomCode, username, isSpectator = false, isPrivate = false, maxPlayers = 8, allowSpectators = true) {
        state.user.username = username;
        state.currentRoom = roomCode;

        // Save username
        localStorage.setItem('drawit_username', username);

        const avatarData = this.avatarManager.getAvatarData();
        // Save avatar
        this.avatarManager.saveAvatarToStorage();

        socket.emit('joinRoom', {
            username: state.user.username,
            avatar: avatarData,
            roomCode: state.currentRoom,
            isSpectator,
            isPrivate,
            maxPlayers,
            allowSpectators
        });
    }
}
