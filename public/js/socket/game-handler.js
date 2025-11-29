import { socket, gameTopBar, wordChoiceModal, wordChoicesContainer, timerValue, wordDisplay, roundCurrent, roundTotal, roundResultOverlay, roundResultTitle, roundResultWord, roundResultWordLabel, roundResultScores, gameEndModal, gameEndScores, readyCheckModal, btnIamReady, btnRefuseGame, readyCountVal, readyTotalVal, readyTimerVal, readyPlayersList, helpModal, lobbySettingsModal, confirmationModal, kickModal, alertModal, btnUseHint, hintsCount } from '../dom-elements.js';
import { state } from '../state.js';
import { showToast, playTickSound } from '../utils.js';
import { performDraw, performFloodFill } from '../draw.js';

export class GameHandler {
    constructor(managers) {
        this.gameSettingsManager = managers.gameSettingsManager;
        this.playerListManager = managers.playerListManager;
        this.layerManager = managers.layerManager;
        this.chatManager = managers.chatManager;
        this.cursorManager = managers.cursorManager;
        this.animationSystem = managers.animationSystem;

        this.currentTimerInterval = null;
        this.wordChoiceTimerInterval = null;
        this.readyTimerInterval = null;
        this.votingTimerInterval = null;

        this.init();
    }

    init() {
        socket.on('gameStateChanged', this.handleGameStateChanged.bind(this));
        socket.on('roomJoined', this.handleRoomJoined.bind(this));
        socket.on('chooseWord', this.handleChooseWord.bind(this));
        socket.on('roundStart', this.handleRoundStart.bind(this));
        socket.on('updateHint', this.handleUpdateHint.bind(this));
        socket.on('yourWord', this.handleYourWord.bind(this));
        socket.on('turnStart', this.handleTurnStart.bind(this));
        socket.on('roundEnd', this.handleRoundEnd.bind(this));
        socket.on('gameEnded', this.handleGameEnded.bind(this));
        socket.on('readyCheckStarted', this.handleReadyCheckStarted.bind(this));
        socket.on('gameStarting', this.handleGameStarting.bind(this));
        socket.on('updateReadyStatus', this.handleUpdateReadyStatus.bind(this));
        socket.on('gameCancelled', this.handleGameCancelled.bind(this));
        socket.on('gameStarted', this.handleGameStarted.bind(this));
        socket.on('hintRevealed', this.handleHintRevealed.bind(this));

        // Creative Mode Events
        socket.on('creativeRoundStart', this.handleCreativeRoundStart.bind(this));
        socket.on('creativeIntermission', this.handleCreativeIntermission.bind(this));
        socket.on('creativePresentation', this.handleCreativePresentation.bind(this));
        socket.on('creativeVotingStart', this.handleCreativeVotingStart.bind(this));
        socket.on('votingAllDone', this.handleVotingAllDone.bind(this));
        socket.on('creativeRoundEnd', this.handleCreativeRoundEnd.bind(this));
        socket.on('creativeHistory', this.handleCreativeHistory.bind(this));

        if (btnUseHint) {
            btnUseHint.addEventListener('click', () => {
                if (state.currentGameState === 'PLAYING' && !btnUseHint.disabled) {
                    socket.emit('requestHint', state.currentRoom);
                }
            });
        }
    }

    formatHint(hint) {
        if (!hint) return '';
        return hint.replace(/   /g, '%%%SPACE%%%')
                   .replace(/ /g, '')
                   .replace(/%%%SPACE%%%/g, ' ');
    }

    startSmartTimer(duration, onTick, onEnd) {
        const endTime = Date.now() + duration * 1000;
        onTick(duration);

        const interval = setInterval(() => {
            const now = Date.now();
            const remaining = Math.ceil((endTime - now) / 1000);
            
            if (remaining >= 0) {
                onTick(remaining);
            }
            
            if (remaining <= 0) {
                clearInterval(interval);
                if (onEnd) onEnd();
            }
        }, 500);
        
        return interval;
    }

    handleGameStateChanged(stateVal) {
        state.currentGameState = stateVal;
        this.layerManager.updateLayersUI();
    }

    handleRoomJoined(data) {
        // Game state sync for mid-game join
        if (data.game && data.game.turnOrder && data.game.currentDrawerIndex !== undefined) {
            state.currentDrawerId = data.game.turnOrder[data.game.currentDrawerIndex];

            // Update Hints Count
            if (data.game.personalHints !== undefined && hintsCount) {
                hintsCount.textContent = data.game.personalHints;
            }

            // Update Word Display and Timer if joining mid-game
            if (data.game.currentHint) {
                gameTopBar.classList.remove('hidden');
                wordDisplay.textContent = this.formatHint(data.game.currentHint);

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
                if (this.currentTimerInterval) clearInterval(this.currentTimerInterval);
                let timeLeft = data.game.timeLeft;
                this.currentTimerInterval = this.startSmartTimer(timeLeft, (remaining) => {
                    if (remaining >= 0) timerValue.textContent = remaining;
                });
            }
        }
    }

    handleChooseWord(data) {
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
                if (this.wordChoiceTimerInterval) clearInterval(this.wordChoiceTimerInterval);
            };
            wordChoicesContainer.appendChild(btn);
        });

        const timerVal = document.getElementById('word-choice-timer-val');
        let timeLeft = timeout;
        if (timerVal) {
            timerVal.textContent = timeLeft;
            timerVal.style.color = '';

            if (this.wordChoiceTimerInterval) clearInterval(this.wordChoiceTimerInterval);
            this.wordChoiceTimerInterval = this.startSmartTimer(timeLeft, (remaining) => {
                timerVal.textContent = remaining;
                if (remaining <= 5) {
                    timerVal.style.color = 'red';
                    if (remaining > 0) playTickSound();
                }
            });
        }

        wordChoiceModal.classList.remove('hidden');
    }

    handleRoundStart(data) {
        gameTopBar.classList.remove('hidden');
        wordChoiceModal.classList.add('hidden');
        if (this.wordChoiceTimerInterval) clearInterval(this.wordChoiceTimerInterval);
        timerValue.textContent = data.duration;
        wordDisplay.textContent = this.formatHint(data.hint);

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
                    btnUseHint.disabled = false;
                    btnUseHint.classList.remove('cooldown');
                }
            }
        }

        if (state.currentDrawerName) {
            showToast(`C'est au tour de ${state.currentDrawerName} de dessiner !`, 'info');
        }

        let timeLeft = data.duration;
        if (this.currentTimerInterval) clearInterval(this.currentTimerInterval);

        this.currentTimerInterval = this.startSmartTimer(timeLeft, (remaining) => {
            if (remaining >= 0) timerValue.textContent = remaining;

            if (remaining <= 10 && remaining > 0) {
                playTickSound();
            }
        });
    }

    handleUpdateHint(data) {
        wordDisplay.textContent = this.formatHint(data.hint);
    }

    handleYourWord(word) {
        wordDisplay.textContent = word;
        wordDisplay.style.color = 'var(--success)';
    }

    handleTurnStart(data) {
        state.currentDrawerId = data.drawerId;
        state.currentDrawerName = data.drawerName;
        roundCurrent.textContent = data.roundIndex;
        roundTotal.textContent = data.totalRounds;

        this.chatManager.addSeparator(`Round ${data.roundIndex} - Tour ${data.turnIndex}/${data.totalTurns}`);
        this.cursorManager.clearCursors();

        roundResultOverlay.classList.add('hidden');
        if (this.currentTimerInterval) clearInterval(this.currentTimerInterval);
        timerValue.textContent = '0';
        wordDisplay.textContent = '';
        wordDisplay.style.color = 'var(--primary)';

        this.layerManager.updateLayersUI();
    }

    handleRoundEnd(data) {
        if (this.currentTimerInterval) clearInterval(this.currentTimerInterval);

        roundResultTitle.textContent = data.reason;
        roundResultWord.textContent = data.word;
        
        // Ensure label is visible for normal modes
        if (roundResultWordLabel) roundResultWordLabel.style.display = 'block';
        roundResultWord.style.display = 'block';

        this.chatManager.addSystemMessage(`Le mot était : ${data.word}`);

        roundResultScores.innerHTML = '';
        const sortedPlayers = Object.keys(data.roundScores).sort((a, b) => data.roundScores[b] - data.roundScores[a]);

        let someoneScored = false;

        sortedPlayers.forEach(playerId => {
            const player = this.playerListManager.getPlayer(playerId);
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
            this.animationSystem.triggerConfetti();
        } else {
            this.animationSystem.triggerRain();
        }

        setTimeout(() => {
            roundResultOverlay.classList.add('hidden');
            this.animationSystem.stop();
        }, 5000);
    }

    handleGameEnded(data) {
        // Clear any active timers
        if (this.wordChoiceTimerInterval) clearInterval(this.wordChoiceTimerInterval);
        if (this.currentTimerInterval) clearInterval(this.currentTimerInterval);

        // Hide game UI elements
        wordChoiceModal.classList.add('hidden');
        roundResultOverlay.classList.add('hidden');
        gameTopBar.classList.add('hidden');

        this.chatManager.addSeparator('Partie terminée');

        gameEndScores.innerHTML = '';

        let sortedPlayers = [];
        if (data.results) {
            sortedPlayers = data.results.sort((a, b) => b.score - a.score);
        } else {
            sortedPlayers = Object.keys(data.scores).map(id => {
                const p = this.playerListManager.getPlayer(id);
                return p ? { ...p, score: data.scores[id] } : null;
            }).filter(p => p).sort((a, b) => b.score - a.score);
        }

        let currentRank = 0;
        let previousScore = -1;
        let playersAtCurrentRank = 0;

        sortedPlayers.forEach((player, index) => {
            const row = document.createElement('div');
            row.className = 'score-row';
            if (player.isDisconnected) row.classList.add('disconnected');

            // Ranking Logic with Tie Handling
            if (player.score !== previousScore) {
                currentRank += playersAtCurrentRank + 1;
                playersAtCurrentRank = 0;
            } else {
                playersAtCurrentRank++;
            }
            previousScore = player.score;

            if (currentRank === 1) row.classList.add('rank-1');
            if (currentRank === 2) row.classList.add('rank-2');
            if (currentRank === 3) row.classList.add('rank-3');

            const rankSpan = document.createElement('span');
            rankSpan.className = 'score-rank';
            rankSpan.textContent = `#${currentRank}`;

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
        this.animationSystem.triggerConfetti(3000);
        setTimeout(() => {
            this.animationSystem.triggerFireworks(5000);
        }, 2000);
    }

    formatSettings(settings) {
        const labels = {
            drawTime: (v) => `${v}s Dessin`,
            wordChoiceTime: (v) => `${v}s Choix`,
            wordChoices: (v) => `${v} Choix de mots`,
            rounds: (v) => `${v} Tours`,
            allowFuzzy: (v) => v ? 'Accents Cool' : 'Accents Stricts',
            hintsEnabled: (v) => v ? 'Indices Auto' : 'Sans Indices Auto',
            maxWordLength: (v) => `Max ${v} lettres`,
            personalHints: (v) => `${v} Indices Perso`
        };

        const ignoredKeys = ['mode'];
        if (settings.mode === 'guess-word') ignoredKeys.push('maxWordLength');
        if (settings.mode === 'custom-word') ignoredKeys.push('wordChoices');
        if (settings.mode === 'creative') {
            ignoredKeys.push('wordChoiceTime', 'wordChoices', 'allowFuzzy', 'hintsEnabled', 'personalHints', 'maxWordLength');
        }
        
        if (settings.hintsEnabled) ignoredKeys.push('personalHints');

        return Object.entries(settings)
            .filter(([key, _]) => !ignoredKeys.includes(key) && labels[key])
            .map(([key, value]) => labels[key](value))
            .join(' • ');
    }

    handleReadyCheckStarted(data) {
        readyCheckModal.classList.remove('hidden');

        // Display Settings
        const modeDisplay = document.getElementById('ready-mode-display');
        const settingsDisplay = document.getElementById('ready-settings-display');

        const modeLabels = {
            'guess-word': 'Devine le dessin',
            'custom-word': 'Mot personnalisé',
            'creative': 'Mode Créatif'
        };

        const modeLabel = modeLabels[data.settings.mode] || data.settings.mode;

        if (modeDisplay) {
            modeDisplay.textContent = `${modeLabel}`;
        }

        if (settingsDisplay) {
            settingsDisplay.textContent = this.formatSettings(data.settings);
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
        if (this.readyTimerInterval) clearInterval(this.readyTimerInterval);
        this.readyTimerInterval = this.startSmartTimer(timeLeft, (remaining) => {
            if (newReadyTimerVal) newReadyTimerVal.textContent = remaining;
            if (remaining <= 10 && remaining > 0) playTickSound();
        });
    }

    handleGameStarting(count) {
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
    }

    handleUpdateReadyStatus(data) {
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
    }

    handleGameCancelled(reason) {
        readyCheckModal.classList.add('hidden');
        if (this.readyTimerInterval) clearInterval(this.readyTimerInterval);
        showToast(reason, 'error');
    }

    handleGameStarted(data) {
        readyCheckModal.classList.add('hidden');
        helpModal.classList.add('hidden');
        lobbySettingsModal.classList.add('hidden');
        confirmationModal.classList.add('hidden');
        kickModal.classList.add('hidden');
        alertModal.classList.add('hidden');
        gameEndModal.classList.add('hidden');

        if (this.readyTimerInterval) clearInterval(this.readyTimerInterval);

        if (hintsCount && data.personalHints !== undefined) {
            hintsCount.textContent = data.personalHints;
        }
    }

    handleHintRevealed(data) {
        wordDisplay.textContent = this.formatHint(data.hint);
        if (hintsCount) hintsCount.textContent = data.remainingHints;

        if (data.remainingHints <= 0) {
            btnUseHint.disabled = true;
            btnUseHint.classList.add('disabled');
        } else {
            // Start Cooldown
            btnUseHint.disabled = true;
            btnUseHint.classList.add('cooldown');

            let cooldown = data.cooldown;
            // We could show a visual timer on the button if we wanted
            setTimeout(() => {
                if (state.currentGameState === 'PLAYING') {
                    btnUseHint.disabled = false;
                    btnUseHint.classList.remove('cooldown');
                }
            }, cooldown * 1000);
        }
    }

    handleCreativeRoundStart(data) {
        roundResultOverlay.classList.add('hidden');
        gameTopBar.classList.remove('hidden');
        if (timerValue) timerValue.textContent = data.duration;
        wordDisplay.textContent = data.word;
        roundCurrent.textContent = data.roundIndex;
        roundTotal.textContent = data.totalRounds;
        
        // Clear canvas & cursors
        this.cursorManager.clearCursors();
        
        showToast(`C'est parti ! Dessinez : ${data.word}`, 'info');

        // Start Timer
        if (this.currentTimerInterval) clearInterval(this.currentTimerInterval);
        let timeLeft = parseInt(data.duration);
        
        // Force initial update
        if (timerValue) timerValue.textContent = timeLeft;

        this.currentTimerInterval = this.startSmartTimer(timeLeft, (remaining) => {
            if (timerValue) timerValue.textContent = remaining;
            
            if (remaining <= 10 && remaining > 0) {
                try { playTickSound(); } catch(e) {}
            }
        });
    }

    handleCreativeIntermission(data) {
        const modal = document.getElementById('intermission-modal');
        const timer = document.getElementById('intermission-timer');
        
        if (modal) {
            modal.classList.remove('hidden');
            let timeLeft = data.duration;
            if (timer) timer.textContent = timeLeft;
            
            this.startSmartTimer(timeLeft, (remaining) => {
                if (timer) timer.textContent = remaining;
            }, () => {
                modal.classList.add('hidden');
            });
        }
    }

    handleCreativePresentation(data) {
        // Ensure intermission is closed
        const intermissionModal = document.getElementById('intermission-modal');
        if (intermissionModal) intermissionModal.classList.add('hidden');

        const modal = document.getElementById('creative-presentation-modal');
        const artistName = document.getElementById('presentation-artist');
        const canvas = document.getElementById('presentation-canvas');
        const timer = document.getElementById('presentation-timer-val');

        modal.classList.remove('hidden');
        artistName.textContent = `Artiste : ${data.artist}`;
        
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        this.replayDrawing(ctx, data.drawing);

        let timeLeft = data.duration;
        timer.textContent = timeLeft;
        
        this.startSmartTimer(timeLeft, (remaining) => {
            timer.textContent = remaining;
        });
    }

    replayDrawing(ctx, actions) {
        if (!actions) return;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        actions.forEach(action => {
            if (action.tool === 'fill') {
                // Calculate scale based on canvas size vs original 800x600
                const scaleX = ctx.canvas.width / 800;
                const scaleY = ctx.canvas.height / 600;
                
                performFloodFill(
                    ctx, 
                    ctx.canvas.width, 
                    ctx.canvas.height, 
                    Math.floor(action.x0 * scaleX), 
                    Math.floor(action.y0 * scaleY), 
                    action.color
                );
            } else {
                performDraw(ctx, action.x0, action.y0, action.x1, action.y1, action.color, action.size, action.opacity, action.tool);
            }
        });
    }

    handleCreativeVotingStart(data) {
        document.getElementById('creative-presentation-modal').classList.add('hidden');
        const modal = document.getElementById('creative-voting-modal');
        const grid = document.getElementById('voting-grid');
        const timer = document.getElementById('voting-timer-val');

        modal.classList.remove('hidden');
        grid.innerHTML = '';
        
        // Adjust grid for smaller items
        grid.style.gridTemplateColumns = 'repeat(auto-fit, minmax(220px, 1fr))';

        data.drawings.forEach(item => {
            const card = document.createElement('div');
            card.className = 'voting-card';
            card.style.border = '1px solid #ccc';
            card.style.padding = '10px';
            card.style.borderRadius = '8px';
            card.style.background = 'rgba(255,255,255,0.1)';
            card.style.display = 'flex';
            card.style.flexDirection = 'column';
            card.style.gap = '10px';

            const cvs = document.createElement('canvas');
            cvs.width = 800;
            cvs.height = 600;
            cvs.style.width = '100%';
            cvs.style.background = 'white';
            cvs.style.borderRadius = '4px';
            
            const ctx = cvs.getContext('2d');
            // No scaling needed as we use full resolution
            this.replayDrawing(ctx, item.drawing);

            const info = document.createElement('div');
            info.style.display = 'flex';
            info.style.justifyContent = 'space-between';
            info.style.alignItems = 'center';
            
            info.innerHTML = `<span style="font-weight:bold; font-size:0.9rem;">${item.username}</span>`;

            const starsContainer = document.createElement('div');
            starsContainer.className = 'stars-input';
            starsContainer.style.display = 'flex';
            starsContainer.style.gap = '2px';
            starsContainer.style.justifyContent = 'center';

            if (item.userId === socket.id) {
                starsContainer.innerHTML = '<span style="color: var(--text-dim); font-size: 0.8rem; font-style: italic;">Votre dessin</span>';
            } else {
                for(let i=1; i<=10; i++) {
                    const s = document.createElement('i');
                    s.className = 'far fa-star';
                    s.style.cursor = 'pointer';
                    s.style.color = 'gold';
                    s.style.fontSize = '0.8rem';
                    s.onclick = () => {
                        Array.from(starsContainer.children).forEach((child, idx) => {
                            if (idx < i) {
                                child.className = 'fas fa-star';
                            } else {
                                child.className = 'far fa-star';
                            }
                        });
                        socket.emit('creativeVote', { roomCode: state.currentRoom, targetId: item.userId, stars: i });
                    };
                    starsContainer.appendChild(s);
                }
            }

            card.appendChild(cvs);
            card.appendChild(info);
            card.appendChild(starsContainer);
            grid.appendChild(card);
        });

        let timeLeft = data.duration;
        timer.textContent = timeLeft;
        
        if (this.votingTimerInterval) clearInterval(this.votingTimerInterval);
        this.votingTimerInterval = this.startSmartTimer(timeLeft, (remaining) => {
            timer.textContent = remaining;
        });
    }

    handleVotingAllDone() {
        showToast('Tout le monde a voté ! Résultats imminents...', 'success');
        const timer = document.getElementById('voting-timer-val');
        
        if (this.votingTimerInterval) clearInterval(this.votingTimerInterval);
        
        let timeLeft = 5;
        if (timer) timer.textContent = timeLeft;
        
        this.votingTimerInterval = this.startSmartTimer(timeLeft, (remaining) => {
            if (timer) timer.textContent = remaining;
        });
    }

    handleCreativeRoundEnd(data) {
        document.getElementById('creative-voting-modal').classList.add('hidden');
        if (this.votingTimerInterval) clearInterval(this.votingTimerInterval);
        
        roundResultTitle.textContent = "Résultats du vote";
        roundResultWord.textContent = ""; 
        
        // Hide label and word for creative mode
        if (roundResultWordLabel) roundResultWordLabel.style.display = 'none';
        roundResultWord.style.display = 'none';

        roundResultScores.innerHTML = '';
        
        // Create Podium Container
        const podiumContainer = document.createElement('div');
        podiumContainer.className = 'podium-container';
        podiumContainer.style.display = 'flex';
        podiumContainer.style.justifyContent = 'center';
        podiumContainer.style.alignItems = 'flex-end';
        podiumContainer.style.gap = '20px';
        podiumContainer.style.marginBottom = '20px';
        podiumContainer.style.marginTop = '-20px'; // Move up
        podiumContainer.style.minHeight = '250px';

        // Top 3 Logic
        const top3 = data.results.slice(0, 3);
        
        // Reorder for podium: 2nd, 1st, 3rd
        const podiumOrder = [];
        if (top3[1]) podiumOrder.push({ ...top3[1], rank: 2 });
        if (top3[0]) podiumOrder.push({ ...top3[0], rank: 1 });
        if (top3[2]) podiumOrder.push({ ...top3[2], rank: 3 });

        podiumOrder.forEach(res => {
            const item = document.createElement('div');
            item.className = `podium-item rank-${res.rank}`;
            item.style.display = 'flex';
            item.style.flexDirection = 'column';
            item.style.alignItems = 'center';
            item.style.gap = '10px';
            item.style.position = 'relative';
            
            // Thumbnail
            const thumbWrapper = document.createElement('div');
            thumbWrapper.style.width = res.rank === 1 ? '160px' : '120px';
            thumbWrapper.style.height = res.rank === 1 ? '120px' : '90px';
            thumbWrapper.style.background = 'white';
            thumbWrapper.style.borderRadius = '8px';
            thumbWrapper.style.overflow = 'hidden';
            thumbWrapper.style.border = `3px solid ${res.rank === 1 ? '#ffd700' : res.rank === 2 ? '#c0c0c0' : '#cd7f32'}`;
            thumbWrapper.style.boxShadow = '0 4px 10px rgba(0,0,0,0.3)';
            
            const cvs = document.createElement('canvas');
            cvs.width = 800;
            cvs.height = 600;
            cvs.style.width = '100%';
            cvs.style.height = '100%';
            
            const ctx = cvs.getContext('2d');
            this.replayDrawing(ctx, res.drawing);
            
            thumbWrapper.appendChild(cvs);
            item.appendChild(thumbWrapper);

            // Info
            const info = document.createElement('div');
            info.style.textAlign = 'center';
            info.innerHTML = `
                <div style="font-weight:bold; color:var(--text-main); font-size:${res.rank === 1 ? '1.2rem' : '1rem'}">${res.username}</div>
                <div style="color:var(--primary); font-weight:bold;">+${res.score} <span style="font-size:0.8em">(${res.average}★)</span></div>
            `;
            item.appendChild(info);

            // Rank Badge
            const badge = document.createElement('div');
            badge.textContent = `#${res.rank}`;
            badge.style.position = 'absolute';
            badge.style.top = '-10px';
            badge.style.left = '50%';
            badge.style.transform = 'translateX(-50%)';
            badge.style.background = res.rank === 1 ? '#ffd700' : res.rank === 2 ? '#c0c0c0' : '#cd7f32';
            badge.style.color = 'black';
            badge.style.fontWeight = 'bold';
            badge.style.width = '30px';
            badge.style.height = '30px';
            badge.style.borderRadius = '50%';
            badge.style.display = 'flex';
            badge.style.alignItems = 'center';
            badge.style.justifyContent = 'center';
            badge.style.boxShadow = '0 2px 5px rgba(0,0,0,0.3)';
            item.appendChild(badge);

            podiumContainer.appendChild(item);
        });

        roundResultScores.appendChild(podiumContainer);

        // List remaining players if any
        if (data.results.length > 3) {
            const othersContainer = document.createElement('div');
            othersContainer.style.marginTop = '20px';
            othersContainer.style.borderTop = '1px solid rgba(255,255,255,0.1)';
            othersContainer.style.paddingTop = '10px';
            othersContainer.style.width = '100%';

            data.results.slice(3).forEach((res, idx) => {
                const row = document.createElement('div');
                row.className = 'score-row';
                row.innerHTML = `
                    <span class="score-rank" style="color:var(--text-dim)">#${idx + 4}</span>
                    <span class="score-name">${res.username}</span>
                    <span class="score-points">+${res.score} (${res.average} <i class="fas fa-star"></i>)</span>
                `;
                othersContainer.appendChild(row);
            });
            roundResultScores.appendChild(othersContainer);
        }

        roundResultOverlay.classList.remove('hidden');
        setTimeout(() => {
            roundResultOverlay.classList.add('hidden');
        }, 20000);
    }

    handleCreativeHistory(actions) {
        // Clear all layers
        const canvases = this.layerManager.getLayerCanvases();
        Object.values(canvases).forEach(c => {
            c.ctx.clearRect(0, 0, c.canvas.width, c.canvas.height);
        });

        // Replay all actions on correct layers
        actions.forEach(action => {
            const layerId = action.layerId || this.layerManager.getActiveLayerId();
            const layer = canvases[layerId];
            
            if (layer) {
                const ctx = layer.ctx;
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';

                if (action.tool === 'fill') {
                    performFloodFill(
                        ctx, 
                        ctx.canvas.width, 
                        ctx.canvas.height, 
                        action.x0, 
                        action.y0, 
                        action.color
                    );
                } else {
                    performDraw(ctx, action.x0, action.y0, action.x1, action.y1, action.color, action.size, action.opacity, action.tool);
                }
            }
        });

        if (this.layerManager.renderCallback) {
            this.layerManager.renderCallback();
        }
    }
}
