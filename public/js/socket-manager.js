import { socket, gameTopBar, wordChoiceModal, wordChoicesContainer, timerValue, wordDisplay, roundCurrent, roundTotal, roundResultOverlay, roundResultTitle, roundResultWord, roundResultScores, gameEndModal, gameEndScores, readyCheckModal, btnIamReady, readyCountVal, readyTotalVal, readyTimerVal, readyPlayersList, canvas } from './dom-elements.js';
import { state } from './state.js';
import { showToast } from './utils.js';
import { performDraw, performFloodFill } from './draw.js';

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
        // Handled by gameSettingsManager internally if it listens to socket, 
        // but here we might need to update UI if gameSettingsManager doesn't do it automatically from socket
        // Actually gameSettingsManager in original code didn't seem to listen to socket directly, 
        // but client.js had this empty listener.
    });

    socket.on('gameStateChanged', (stateVal) => {
        state.currentGameState = stateVal;
    });

    socket.on('userJoined', (data) => {
        if (data.leaderId) {
            state.leaderId = data.leaderId;
            gameSettingsManager.updateControlsState();
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
        if (data.game && data.game.turnOrder && data.game.currentDrawerIndex !== undefined) {
            state.currentDrawerId = data.game.turnOrder[data.game.currentDrawerIndex];
        }

        playerListManager.updatePlayerList(data.users, data.leaderId);
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
        if (state.layers.length === 1) state.activeLayerId = layer.id;
        layerManager.setActiveLayerId(state.activeLayerId);
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
                if (timeLeft <= 5) timerVal.style.color = 'red';
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
        
        if (state.currentDrawerName) {
            showToast(`C'est au tour de ${state.currentDrawerName} de dessiner !`, 'info');
        }

        let timeLeft = data.duration;
        if (window.currentTimerInterval) clearInterval(window.currentTimerInterval);
        
        window.currentTimerInterval = setInterval(() => {
            timeLeft--;
            if (timeLeft >= 0) timerValue.textContent = timeLeft;
            else clearInterval(window.currentTimerInterval);
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
        gameTopBar.classList.add('hidden');
        chatManager.addSeparator('Partie terminée');

        gameEndScores.innerHTML = '';
        const sortedPlayers = Object.keys(data.scores).sort((a, b) => data.scores[b] - data.scores[a]);
        
        sortedPlayers.forEach((playerId, index) => {
            const player = playerListManager.getPlayer(playerId);
            if (!player) return;
            
            const row = document.createElement('div');
            row.className = 'score-row';
            
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
            nameSpan.textContent = player.username;
            
            const totalSpan = document.createElement('span');
            totalSpan.className = 'score-total';
            totalSpan.textContent = `${data.scores[playerId]} pts`;
            
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
            }
            // Add other modes here
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

        btnIamReady.classList.remove('hidden');
        btnIamReady.classList.remove('waiting');
        btnIamReady.textContent = 'JE SUIS PRÊT !';
        btnIamReady.disabled = false;

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
            if (timeLeft <= 0) clearInterval(readyTimerInterval);
        }, 1000);
    });

    socket.on('gameStarting', (count) => {
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
        if (readyTimerInterval) clearInterval(readyTimerInterval);
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
