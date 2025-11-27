import { socket, gameTopBar, wordChoiceModal, wordChoicesContainer, timerValue, wordDisplay, roundCurrent, roundTotal, roundResultOverlay, roundResultTitle, roundResultWord, roundResultScores, gameEndModal, gameEndScores, readyCheckModal, btnIamReady, btnRefuseGame, readyCountVal, readyTotalVal, readyTimerVal, readyPlayersList, canvas, helpModal, lobbySettingsModal, confirmationModal, kickModal, alertModal, roomPrivacyBadge, btnUseHint, hintsCount, customWordModal, customWordInput, customWordTimerVal, btnSubmitCustomWord } from './dom-elements.js';
import { state } from './state.js';
import { showToast, playTickSound } from './utils.js';
import { performDraw, performFloodFill, performMoveSelection, performClearRect } from './draw.js';

export function initSocketManager(
    gameSettingsManager, 
    playerListManager, 
    layerManager, 
    chatManager, 
    cursorManager, 
    animationSystem,
    render
) {
    // Room & Game State
    socket.on('roomSettingsUpdated', (settings) => {
        state.settings = settings;
    });

    socket.on('error', (msg) => {
        showToast(msg, 'error');
    });

    socket.on('gameStateChanged', (stateVal) => {
        state.currentGameState = stateVal;
        layerManager.updateLayersUI();
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

    socket.on('playerLayerChanged', ({ userId, layerId }) => {
        layerManager.updatePlayerLayer(userId, layerId);
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

        if (data.game && data.game.turnOrder && data.game.currentDrawerIndex !== undefined) {
            state.currentDrawerId = data.game.turnOrder[data.game.currentDrawerIndex];
            
            // Update Hints Count
            if (data.game.personalHints !== undefined && hintsCount) {
                hintsCount.textContent = data.game.personalHints;
            }

            // Update Word Display and Timer if joining mid-game
            if (data.game.currentHint) {
                gameTopBar.classList.remove('hidden');
                wordDisplay.textContent = data.game.currentHint;

                // Update Hint Button Visibility for mid-game join
                const progressiveHintsEnabled = state.settings && state.settings.hintsEnabled;
                const isDrawer = state.currentDrawerId === socket.id;
                const hasGuessed = data.game.guessedPlayers && data.game.guessedPlayers.includes(socket.id);
                
                if (!isDrawer && !state.isSpectator && !progressiveHintsEnabled && !hasGuessed) {
                    if (btnUseHint) {
                        btnUseHint.classList.remove('hidden');
                        if (hintsCount && parseInt(hintsCount.textContent) <= 0) {
                            btnUseHint.disabled = true;
                        } else {
                            btnUseHint.disabled = false;
                        }
                    }
                } else {
                    if (btnUseHint) btnUseHint.classList.add('hidden');
                }
            }
            if (data.game.timeLeft !== undefined) {
                timerValue.textContent = data.game.timeLeft;
                // Start local timer
                if (window.currentTimerInterval) clearInterval(window.currentTimerInterval);
                let timeLeft = data.game.timeLeft;
                window.currentTimerInterval = setInterval(() => {
                    timeLeft--;
                    if (timeLeft >= 0) timerValue.textContent = timeLeft;
                    else clearInterval(window.currentTimerInterval);
                }, 1000);
            }
        }

        playerListManager.updatePlayerList(data.users, data.leaderId, data.gameState, data.roomCode);
        state.leaderId = data.leaderId;
        
        if (data.gameState === 'LOBBY') {
            gameSettingsManager.show();
            gameSettingsManager.updateControlsState();
        } else {
            gameSettingsManager.hide();
        }

        // Initialize layers
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
        render();
    });

    // Layers
    socket.on('layerAdded', (layer) => {
        state.layers.push(layer);
        layerManager.createLayerCanvas(layer.id);
        
        // Switch to new layer only if I created it
        if (layer.creatorId === socket.id) {
            state.activeLayerId = layer.id;
            layerManager.setActiveLayerId(state.activeLayerId);
            socket.emit('activeLayerChanged', { roomCode: state.currentRoom, layerId: layer.id });
        }
        
        layerManager.updateLayersUI();
        render();
    });

    socket.on('layerDeleted', (layerId) => {
        const index = state.layers.findIndex(l => l.id === layerId);
        if (index !== -1) state.layers.splice(index, 1);
        
        delete state.layerCanvases[layerId];
        layerManager.deleteLayerCanvas(layerId);

        if (state.activeLayerId === layerId) {
            state.activeLayerId = state.layers.length > 0 ? state.layers[state.layers.length - 1].id : null;
            layerManager.setActiveLayerId(state.activeLayerId);
            if (state.activeLayerId) {
                socket.emit('activeLayerChanged', { roomCode: state.currentRoom, layerId: state.activeLayerId });
            }
        }
        layerManager.updateLayersUI();
        render();
    });

    socket.on('layerRenamed', ({ layerId, name }) => {
        const layer = state.layers.find(l => l.id === layerId);
        if (layer) {
            layer.name = name;
            layerManager.updateLayersUI();
        }
    });

    socket.on('layersReordered', (newLayers) => {
        state.layers.length = 0;
        state.layers.push(...newLayers);
        layerManager.updateLayersUI();
        render();
    });

    socket.on('resetLayers', (layers) => {
        // Clear all existing canvases
        Object.keys(state.layerCanvases).forEach(id => {
            layerManager.deleteLayerCanvas(id);
        });
        
        // Reset state layers
        state.layers.length = 0;
        state.layers.push(...layers);
        
        // Re-create canvases for new layers
        layers.forEach(l => {
            layerManager.createLayerCanvas(l.id);
        });
        
        // Set active layer
        if (layers.length > 0) {
            state.activeLayerId = layers[0].id;
            layerManager.setActiveLayerId(state.activeLayerId);
        }
        
        layerManager.updateLayersUI();
        render();
    });

    // Drawing
    socket.on('canvasState', (history) => {
        Object.values(state.layerCanvases).forEach(l => {
            l.ctx.clearRect(0, 0, 800, 600);
        });

        history.forEach(action => {
            const targetLayerId = action.layerId || (state.layers[0] ? state.layers[0].id : null);
            if (targetLayerId && state.layerCanvases[targetLayerId]) {
                const targetCtx = state.layerCanvases[targetLayerId].ctx;
                if (action.tool === 'fill') {
                    performFloodFill(targetCtx, 800, 600, action.x0, action.y0, action.color);
                } else if (action.tool === 'move-selection') {
                    performMoveSelection(targetCtx, action.srcX, action.srcY, action.w, action.h, action.destX, action.destY);
                } else if (action.tool === 'clear-rect') {
                    performClearRect(targetCtx, action.x, action.y, action.w, action.h);
                } else {
                    performDraw(targetCtx, action.x0, action.y0, action.x1, action.y1, action.color, action.size, action.opacity, action.tool);
                }
            }
        });
        render();
    });

    socket.on('draw', (data) => {
        const targetLayerId = data.layerId || (state.layers[0] ? state.layers[0].id : null);
        if (targetLayerId && state.layerCanvases[targetLayerId]) {
            const targetCtx = state.layerCanvases[targetLayerId].ctx;
            if (data.tool === 'fill') {
                performFloodFill(targetCtx, 800, 600, data.x0, data.y0, data.color);
            } else if (data.tool === 'move-selection') {
                performMoveSelection(targetCtx, data.srcX, data.srcY, data.w, data.h, data.destX, data.destY);
            } else if (data.tool === 'clear-rect') {
                performClearRect(targetCtx, data.x, data.y, data.w, data.h);
            } else {
                performDraw(targetCtx, data.x0, data.y0, data.x1, data.y1, data.color, data.size, data.opacity, data.tool);
            }
            render();
        }
    });

    socket.on('clearCanvas', () => {
        Object.values(state.layerCanvases).forEach(l => {
            l.ctx.clearRect(0, 0, 800, 600);
        });
        render();
    });

    // Game Logic
    socket.on('chooseWord', (data) => {
        const words = Array.isArray(data) ? data : data.words;
        const timeout = (Array.isArray(data) ? 20 : data.timeout) || 20;

        wordChoicesContainer.innerHTML = '';
        words.forEach(word => {
            const btn = document.createElement('button');
            btn.className = 'word-choice-btn';
            btn.textContent = word;
            btn.onclick = () => {
                socket.emit('wordChosen', { roomCode: state.currentRoom, word });
                wordChoiceModal.classList.add('hidden');
                if (window.wordChoiceTimerInterval) clearInterval(window.wordChoiceTimerInterval);
            };
            wordChoicesContainer.appendChild(btn);
        });

        const timerVal = document.getElementById('word-choice-timer-val');
        let timeLeft = timeout;
        if (timerVal) {
            timerVal.textContent = timeLeft;
            timerVal.style.color = '';
            
            if (window.wordChoiceTimerInterval) clearInterval(window.wordChoiceTimerInterval);
            window.wordChoiceTimerInterval = setInterval(() => {
                timeLeft--;
                timerVal.textContent = timeLeft;
                if (timeLeft <= 5) {
                    timerVal.style.color = 'red';
                    if (timeLeft > 0) playTickSound();
                }
                if (timeLeft <= 0) clearInterval(window.wordChoiceTimerInterval);
            }, 1000);
        }

        wordChoiceModal.classList.remove('hidden');
    });

    socket.on('roundStart', (data) => {
        gameTopBar.classList.remove('hidden');
        wordChoiceModal.classList.add('hidden');
        if (window.wordChoiceTimerInterval) clearInterval(window.wordChoiceTimerInterval);
        timerValue.textContent = data.duration;
        wordDisplay.textContent = data.hint;
        
        // Show/Hide Hint Button
        const progressiveHintsEnabled = state.settings && state.settings.hintsEnabled;
        
        if (state.currentDrawerId === socket.id || state.isSpectator || progressiveHintsEnabled) {
            if (btnUseHint) btnUseHint.classList.add('hidden');
        } else {
            if (btnUseHint) {
                btnUseHint.classList.remove('hidden');
                // Check if disabled (0 hints)
                if (hintsCount && parseInt(hintsCount.textContent) <= 0) {
                    btnUseHint.disabled = true;
                } else {
                    // If we were in cooldown, we might want to keep it? 
                    // For simplicity, let's assume cooldown resets on new round or just persists?
                    // The server checks cooldown based on timestamp.
                    // The client visual cooldown might be out of sync if we reload.
                    // But for now, let's just enable it if we have hints.
                    // Ideally we should get the cooldown state from server.
                    btnUseHint.disabled = false;
                    btnUseHint.classList.remove('cooldown');
                }
            }
        }

        if (state.currentDrawerName) {
            showToast(`C'est au tour de ${state.currentDrawerName} de dessiner !`, 'info');
        }

        let timeLeft = data.duration;
        if (window.currentTimerInterval) clearInterval(window.currentTimerInterval);
        
        window.currentTimerInterval = setInterval(() => {
            timeLeft--;
            if (timeLeft >= 0) timerValue.textContent = timeLeft;
            
            if (timeLeft <= 10 && timeLeft > 0) {
                playTickSound();
            }
            
            if (timeLeft <= 0) {
                clearInterval(window.currentTimerInterval);
            }
        }, 1000);
    });

    socket.on('updateHint', (data) => {
        wordDisplay.textContent = data.hint;
    });

    socket.on('yourWord', (word) => {
        wordDisplay.textContent = word;
        wordDisplay.style.color = 'var(--success)';
    });

    socket.on('turnStart', (data) => {
        state.currentDrawerId = data.drawerId;
        state.currentDrawerName = data.drawerName;
        roundCurrent.textContent = data.roundIndex;
        roundTotal.textContent = data.totalRounds;
        // Toast moved to roundStart
        
        chatManager.addSeparator(`Round ${data.roundIndex} - Tour ${data.turnIndex}/${data.totalTurns}`);
        cursorManager.clearCursors();

        roundResultOverlay.classList.add('hidden');
        if (window.currentTimerInterval) clearInterval(window.currentTimerInterval);
        timerValue.textContent = '0';
        wordDisplay.textContent = '';
        wordDisplay.style.color = 'var(--primary)';
        
        layerManager.updateLayersUI();
    });

    socket.on('roundEnd', (data) => {
        if (window.currentTimerInterval) clearInterval(window.currentTimerInterval);
        
        roundResultTitle.textContent = data.reason;
        roundResultWord.textContent = data.word;
        
        chatManager.addSystemMessage(`Le mot était : ${data.word}`);

        roundResultScores.innerHTML = '';
        const sortedPlayers = Object.keys(data.roundScores).sort((a, b) => data.roundScores[b] - data.roundScores[a]);
        
        let someoneScored = false;

        sortedPlayers.forEach(playerId => {
            const player = playerListManager.getPlayer(playerId);
            if (!player) return;
            
            const row = document.createElement('div');
            row.className = 'score-row';
            
            let avatarHtml = '';
            if (player.avatar && player.avatar.type === 'image') {
                avatarHtml = `<img src="${player.avatar.value}" class="player-avatar-small" style="width: 28px; height: 28px; margin-right: 10px; border-radius: 50%; object-fit: cover;">`;
            } else {
                const color = (player.avatar && player.avatar.color) || '#3498db';
                const emoji = (player.avatar && player.avatar.emoji) || '🎨';
                avatarHtml = `<div class="player-avatar-small" style="background-color: ${color}; display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: 50%; margin-right: 10px; font-size: 16px;">${emoji}</div>`;
            }

            const userContainer = document.createElement('div');
            userContainer.style.display = 'flex';
            userContainer.style.alignItems = 'center';
            userContainer.innerHTML = avatarHtml;

            const nameSpan = document.createElement('span');
            nameSpan.className = 'score-name';
            nameSpan.textContent = player.username;
            userContainer.appendChild(nameSpan);
            
            const pointsSpan = document.createElement('span');
            pointsSpan.className = 'score-points';
            
            const gain = data.roundScores[playerId];
            if (gain > 0) {
                someoneScored = true;
                pointsSpan.classList.add('diff');
                pointsSpan.textContent = `+${gain}`;
            } else {
                pointsSpan.textContent = '0';
            }
            
            row.appendChild(userContainer);
            row.appendChild(pointsSpan);
            roundResultScores.appendChild(row);
        });
        
        roundResultOverlay.classList.remove('hidden');
        
        if (someoneScored) {
            animationSystem.triggerConfetti();
        } else {
            animationSystem.triggerRain();
        }
        
        setTimeout(() => {
            roundResultOverlay.classList.add('hidden');
            animationSystem.stop();
        }, 5000);
    });

    socket.on('gameEnded', (data) => {
        // Clear any active timers
        if (window.wordChoiceTimerInterval) clearInterval(window.wordChoiceTimerInterval);
        if (window.currentTimerInterval) clearInterval(window.currentTimerInterval);

        // Hide game UI elements
        wordChoiceModal.classList.add('hidden');
        roundResultOverlay.classList.add('hidden');
        gameTopBar.classList.add('hidden');
        
        chatManager.addSeparator('Partie terminée');

        gameEndScores.innerHTML = '';
        
        let sortedPlayers = [];
        if (data.results) {
            sortedPlayers = data.results.sort((a, b) => b.score - a.score);
        } else {
            sortedPlayers = Object.keys(data.scores).map(id => {
                const p = playerListManager.getPlayer(id);
                return p ? { ...p, score: data.scores[id] } : null;
            }).filter(p => p).sort((a, b) => b.score - a.score);
        }
        
        sortedPlayers.forEach((player, index) => {
            const row = document.createElement('div');
            row.className = 'score-row';
            if (player.isDisconnected) row.classList.add('disconnected');
            
            if (index === 0) row.classList.add('rank-1');
            if (index === 1) row.classList.add('rank-2');
            if (index === 2) row.classList.add('rank-3');
            
            const rankSpan = document.createElement('span');
            rankSpan.className = 'score-rank';
            rankSpan.textContent = `#${index + 1}`;
            
            let avatarHtml = '';
            if (player.avatar && player.avatar.type === 'image') {
                avatarHtml = `<img src="${player.avatar.value}" class="player-avatar-small" style="width: 32px; height: 32px; margin-right: 10px;">`;
            } else {
                const color = (player.avatar && player.avatar.color) || '#3498db';
                const emoji = (player.avatar && player.avatar.emoji) || '🎨';
                avatarHtml = `<div class="player-avatar-small" style="background-color: ${color}; display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 50%; margin-right: 10px; font-size: 18px;">${emoji}</div>`;
            }
            
            const avatarSpan = document.createElement('span');
            avatarSpan.innerHTML = avatarHtml;

            const nameSpan = document.createElement('span');
            nameSpan.className = 'score-name';
            nameSpan.textContent = player.username + (player.isDisconnected ? ' (Déconnecté)' : '');
            if (player.isDisconnected) nameSpan.style.fontStyle = 'italic';
            
            const totalSpan = document.createElement('span');
            totalSpan.className = 'score-total';
            totalSpan.textContent = `${player.score} pts`;
            
            const leftGroup = document.createElement('div');
            leftGroup.style.display = 'flex';
            leftGroup.style.alignItems = 'center';
            leftGroup.style.gap = '12px';
            
            leftGroup.appendChild(rankSpan);
            leftGroup.appendChild(avatarSpan);
            leftGroup.appendChild(nameSpan);

            row.appendChild(leftGroup);
            row.appendChild(totalSpan);
            gameEndScores.appendChild(row);
        });
        
        gameEndModal.classList.remove('hidden');
        animationSystem.triggerConfetti(3000);
        setTimeout(() => {
            animationSystem.triggerFireworks(5000);
        }, 2000);
    });

    // Ready Check
    let readyTimerInterval = null;

    socket.on('readyCheckStarted', (data) => {
        readyCheckModal.classList.remove('hidden');
        
        // Display Settings
        const modeDisplay = document.getElementById('ready-mode-display');
        const settingsDisplay = document.getElementById('ready-settings-display');
        
        // Dynamic Mode Configuration
        const modeConfigs = {
            'guess-word': {
                label: 'Devine le dessin',
                getDetails: (s) => {
                    const fuzzyText = s.allowFuzzy ? '• Accents cool' : '• Accents stricts';
                    return `${s.drawTime}s • ${s.rounds} Tours ${fuzzyText}`;
                }
            },
            'custom-word': {
                label: 'Mot personnalisé',
                getDetails: (s) => {
                    const fuzzyText = s.allowFuzzy ? '• Accents cool' : '• Accents stricts';
                    return `${s.drawTime}s • ${s.rounds} Tours ${fuzzyText} • Mot libre`;
                }
            }
        };

        const config = modeConfigs[data.settings.mode] || { 
            label: data.settings.mode, 
            getDetails: () => '' 
        };

        if (modeDisplay) {
            modeDisplay.textContent = `Mode : ${config.label}`;
        }
        
        if (settingsDisplay) {
            settingsDisplay.textContent = config.getDetails(data.settings);
        }

        const readyStatus = document.querySelector('.ready-status');
        if (readyStatus) {
            readyStatus.innerHTML = `
                <div class="ready-count"><span id="ready-count-val">0</span>/<span id="ready-total-val">${data.totalPlayers}</span></div>
                <div>joueurs prêts</div>
            `;
        }
        
        const readyTitle = document.querySelector('.ready-check-content h2');
        if (readyTitle) readyTitle.innerHTML = '<i class="fas fa-check-circle"></i> Êtes-vous prêt ?';

        if (readyPlayersList) {
            readyPlayersList.classList.remove('hidden');
            readyPlayersList.innerHTML = '';
            
            // Render ALL players (not ready state)
            data.users.forEach(user => {
                const chip = document.createElement('div');
                chip.className = 'ready-player-chip not-ready';
                chip.id = `ready-chip-${user.id}`;
                
                let avatarHtml = '';
                if (user.avatar && user.avatar.type === 'image') {
                    avatarHtml = `<img src="${user.avatar.value}" class="player-avatar-small">`;
                } else {
                    const color = (user.avatar && user.avatar.color) || '#3498db';
                    const emoji = (user.avatar && user.avatar.emoji) || '🎨';
                    avatarHtml = `<div class="player-avatar-small" style="background-color: ${color}; display: flex; align-items: center; justify-content: center; font-size: 14px;">${emoji}</div>`;
                }

                chip.innerHTML = `${avatarHtml}<span>${user.username}</span>`;
                readyPlayersList.appendChild(chip);
            });
        }
        
        const readyTimer = document.querySelector('.ready-timer');
        if (readyTimer) readyTimer.classList.remove('hidden');

        if (!state.isSpectator) {
            btnIamReady.classList.remove('hidden');
            btnIamReady.classList.remove('waiting');
            btnIamReady.textContent = 'JE SUIS PRÊT !';
            btnIamReady.disabled = false;

            if (btnRefuseGame) btnRefuseGame.classList.remove('hidden');
        } else {
            btnIamReady.classList.add('hidden');
            if (btnRefuseGame) btnRefuseGame.classList.add('hidden');
        }

        const newReadyCountVal = document.getElementById('ready-count-val');
        const newReadyTotalVal = document.getElementById('ready-total-val');
        const newReadyTimerVal = document.getElementById('ready-timer-val');
        
        if (newReadyCountVal) newReadyCountVal.textContent = '0';
        if (newReadyTotalVal) newReadyTotalVal.textContent = data.totalPlayers;
        if (newReadyTimerVal) newReadyTimerVal.textContent = data.timeout;

        let timeLeft = data.timeout;
        if (readyTimerInterval) clearInterval(readyTimerInterval);
        readyTimerInterval = setInterval(() => {
            timeLeft--;
            if (newReadyTimerVal) newReadyTimerVal.textContent = timeLeft;
            if (timeLeft <= 10 && timeLeft > 0) playTickSound();
            if (timeLeft <= 0) clearInterval(readyTimerInterval);
        }, 1000);
    });

    socket.on('gameStarting', (count) => {
        playTickSound();
        const readyStatus = document.querySelector('.ready-status');
        const readyTitle = document.querySelector('.ready-check-content h2');
        const readyTimer = document.querySelector('.ready-timer');

        if (readyTitle) readyTitle.innerHTML = '<i class="fas fa-rocket"></i> Lancement imminent&nbsp;!';
        
        if (readyStatus) {
            readyStatus.innerHTML = `
                <div style="font-size: 4rem; color: var(--primary); font-weight: bold; text-shadow: 0 0 20px var(--primary-glow); animation: pulse 1s infinite;">${count}</div>
                <div style="font-size: 1.2rem; margin-top: 10px; color: var(--text-dim);">La partie commence dans...</div>
            `;
        }
        
        if (readyPlayersList) readyPlayersList.classList.add('hidden');
        if (btnIamReady) btnIamReady.classList.add('hidden');
        if (btnRefuseGame) btnRefuseGame.classList.add('hidden');
        if (readyTimer) readyTimer.classList.add('hidden');
    });

    socket.on('updateReadyStatus', (data) => {
        const currentReadyCountVal = document.getElementById('ready-count-val');
        const currentReadyTotalVal = document.getElementById('ready-total-val');
        
        if (currentReadyCountVal) currentReadyCountVal.textContent = data.readyCount;
        if (currentReadyTotalVal) currentReadyTotalVal.textContent = data.totalPlayers;

        if (data.readyPlayerIds) {
            // Update visual state of chips
            const chips = document.querySelectorAll('.ready-player-chip');
            chips.forEach(chip => {
                const userId = chip.id.replace('ready-chip-', '');
                if (data.readyPlayerIds.includes(userId)) {
                    chip.classList.remove('not-ready');
                    chip.classList.add('is-ready');
                } else {
                    chip.classList.add('not-ready');
                    chip.classList.remove('is-ready');
                }
            });
        }
    });

    socket.on('gameCancelled', (reason) => {
        readyCheckModal.classList.add('hidden');
        if (readyTimerInterval) clearInterval(readyTimerInterval);
        showToast(reason, 'error');
    });

    socket.on('gameStarted', (data) => {
        readyCheckModal.classList.add('hidden');
        helpModal.classList.add('hidden');
        lobbySettingsModal.classList.add('hidden');
        confirmationModal.classList.add('hidden');
        kickModal.classList.add('hidden');
        alertModal.classList.add('hidden');
        gameEndModal.classList.add('hidden');
        
        if (readyTimerInterval) clearInterval(readyTimerInterval);

        if (hintsCount && data.personalHints !== undefined) {
            hintsCount.textContent = data.personalHints;
        }
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

    // Hint Button
    if (btnUseHint) {
        btnUseHint.addEventListener('click', () => {
            if (state.currentGameState === 'PLAYING' && !btnUseHint.disabled) {
                socket.emit('requestHint', state.currentRoom);
            }
        });
    }

    socket.on('hintRevealed', (data) => {
        wordDisplay.textContent = data.hint;
        if (hintsCount) hintsCount.textContent = data.remainingHints;
        
        if (data.remainingHints <= 0) {
            btnUseHint.disabled = true;
            btnUseHint.classList.add('disabled');
        } else {
            // Start Cooldown
            btnUseHint.disabled = true;
            btnUseHint.classList.add('cooldown');
            
            let cooldown = data.cooldown;
            const originalText = hintsCount.textContent;
            hintsCount.textContent = cooldown;
            
            const interval = setInterval(() => {
                cooldown--;
                if (cooldown > 0) {
                    hintsCount.textContent = cooldown;
                } else {
                    clearInterval(interval);
                    btnUseHint.disabled = false;
                    btnUseHint.classList.remove('cooldown');
                    hintsCount.textContent = data.remainingHints;
                }
            }, 1000);
        }
    });

    socket.on('playerGuessed', (playerId) => {
        if (playerId === socket.id) {
            if (btnUseHint) btnUseHint.classList.add('hidden');
        }
        // ... existing code ...
    });

    socket.on('typeWord', (data) => {
        const timeout = data.timeout || 20;
        const maxLen = data.maxWordLength || 20;
        
        customWordInput.value = '';
        customWordInput.maxLength = maxLen;
        customWordInput.placeholder = `Entrez votre mot (max ${maxLen} car.)`;
        
        customWordModal.classList.remove('hidden');
        customWordInput.focus();

        let timeLeft = timeout;
        if (customWordTimerVal) {
            customWordTimerVal.textContent = timeLeft;
            customWordTimerVal.style.color = '';
            
            if (window.customWordTimerInterval) clearInterval(window.customWordTimerInterval);
            window.customWordTimerInterval = setInterval(() => {
                timeLeft--;
                customWordTimerVal.textContent = timeLeft;
                if (timeLeft <= 5) {
                    customWordTimerVal.style.color = 'red';
                    if (timeLeft > 0) playTickSound();
                }
                if (timeLeft <= 0) {
                    clearInterval(window.customWordTimerInterval);
                    // If time runs out, maybe submit what's there or let server handle it?
                    // Server will handle timeout by picking random word if not received.
                    // But we should probably close modal.
                    customWordModal.classList.add('hidden');
                }
            }, 1000);
        }
    });
}
