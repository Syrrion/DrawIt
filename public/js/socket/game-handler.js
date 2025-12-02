import { socket, gameTopBar, wordChoiceModal, wordChoicesContainer, timerValue, wordDisplay, roundCurrent, roundTotal, roundResultOverlay, roundResultTitle, roundResultWord, roundResultWordLabel, roundResultScores, gameEndModal, gameEndScores, readyCheckModal, btnIamReady, btnRefuseGame, readyCountVal, readyTotalVal, readyTimerVal, readyPlayersList, helpModal, lobbySettingsModal, confirmationModal, kickModal, alertModal, btnUseHint, hintsCount, customWordModal, customWordInput, btnSubmitCustomWord, customWordTimerVal, btnRandomCustomWord, drawerNameDisplay, loadingModal } from '../dom-elements.js';
import { state } from '../state.js';
import { showToast, playTickSound } from '../utils.js';
import { performDraw, performFloodFill, performClearRect, performMoveSelection } from '../draw.js';
import { CANVAS_CONFIG } from '../config.js';

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
        socket.on('typeWord', this.handleTypeWord.bind(this));
        socket.on('randomWordProvided', this.handleRandomWordProvided.bind(this));
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
        socket.on('wordSelectionStarted', this.handleWordSelectionStarted.bind(this));
        socket.on('spectatorWord', this.handleSpectatorWord.bind(this));
        socket.on('userLeft', this.handleUserLeft.bind(this));
        socket.on('aiGenerating', this.handleAiGenerating.bind(this));

        // Creative Mode Events
        socket.on('creativeRoundStart', this.handleCreativeRoundStart.bind(this));
        socket.on('creativeIntermission', this.handleCreativeIntermission.bind(this));
        socket.on('creativePresentation', this.handleCreativePresentation.bind(this));
        socket.on('creativeVotingStart', this.handleCreativeVotingStart.bind(this));
        socket.on('votingAllDone', this.handleVotingAllDone.bind(this));
        socket.on('creativeReveal', this.handleCreativeReveal.bind(this));
        socket.on('creativeRoundEnd', this.handleCreativeRoundEnd.bind(this));
        socket.on('creativeHistory', this.handleCreativeHistory.bind(this));

        // Telephone Mode Events
        socket.on('telephoneRoundStart', this.handleTelephoneRoundStart.bind(this));
        socket.on('telephoneRoundEnd', this.handleTelephoneRoundEnd.bind(this));
        socket.on('telephoneGameEnded', this.handleTelephoneGameEnded.bind(this));
        socket.on('telephoneRecapUpdate', this.handleTelephoneRecapUpdate.bind(this));

        if (btnUseHint) {
            btnUseHint.addEventListener('click', () => {
                if (state.currentGameState === 'PLAYING' && !btnUseHint.disabled) {
                    socket.emit('requestHint', state.currentRoom);
                }
            });
        }

        if (btnSubmitCustomWord) {
            btnSubmitCustomWord.addEventListener('click', () => {
                const word = customWordInput.value.trim();
                if (word) {
                    socket.emit('customWordChosen', { roomCode: state.currentRoom, word });
                    customWordModal.classList.add('hidden');
                    if (this.wordChoiceTimerInterval) clearInterval(this.wordChoiceTimerInterval);
                } else {
                    showToast('Veuillez entrer un mot !', 'error');
                }
            });
        }

        if (btnRandomCustomWord) {
            btnRandomCustomWord.addEventListener('click', () => {
                socket.emit('requestRandomWord');
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

        if (stateVal === 'LOBBY') {
            // Reset layers and clear canvas
            if (this.layerManager) {
                // Reset to default layer
                const defaultLayer = {
                    id: 'layer-1',
                    name: 'Calque 1',
                    order: 0,
                    creatorId: null
                };
                
                state.layers.length = 0;
                state.layers.push(defaultLayer);
                
                // Clear and re-init canvases
                Object.keys(state.layerCanvases).forEach(key => delete state.layerCanvases[key]);
                this.layerManager.createLayerCanvas(defaultLayer.id);
                
                // Force update active layer ID and UI
                state.activeLayerId = defaultLayer.id;
                this.layerManager.setActiveLayerId(defaultLayer.id);
                
                // Reset player position to default layer
                this.layerManager.updatePlayerLayer(socket.id, defaultLayer.id);
                
                this.layerManager.updateLayersUI();
                this.layerManager.renderCallback();
                
                // Ensure the UI reflects the active state
                setTimeout(() => {
                    this.layerManager.updateLayersUI();
                }, 50);
            }
            
            // Clear cursors
            if (this.cursorManager) {
                this.cursorManager.clearCursors();
            }
        }
    }

    handleUserLeft(data) {
        // If we are in telephone recap, re-render to update controls if leader changed
        const modal = document.getElementById('telephone-recap-modal');
        if (modal && !modal.classList.contains('hidden')) {
            this.renderTelephoneRecap();
        }
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
            const isTelephone = state.settings && state.settings.mode === 'telephone';

            if (data.game.currentHint || isTelephone) {
                gameTopBar.classList.remove('hidden');

                if (isTelephone && state.isSpectator) {
                    const round = data.game.roundIndex || 1;
                    if (wordDisplay) {
                        if (round === 1) {
                            wordDisplay.textContent = "Choix des phrases en cours...";
                            wordDisplay.classList.add('choosing-word');
                            wordDisplay.style.color = 'var(--text-main)';
                        } else {
                            if (data.game.phase === 'WRITING') {
                                wordDisplay.textContent = "Description du dessin...";
                                wordDisplay.classList.add('choosing-word');
                                wordDisplay.style.color = 'var(--text-main)';
                            } else if (data.game.phase === 'DRAWING') {
                                wordDisplay.textContent = "Dessin en cours...";
                                wordDisplay.classList.remove('choosing-word');
                                wordDisplay.style.color = 'var(--primary)';
                            } else {
                                wordDisplay.textContent = "Partie en cours...";
                                wordDisplay.classList.remove('choosing-word');
                                wordDisplay.style.color = 'var(--primary)';
                            }
                        }
                    }
                } else if (data.game.currentHint) {
                    wordDisplay.textContent = this.formatHint(data.game.currentHint);
                }

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

    handleWordSelectionStarted(data) {
        gameTopBar.classList.remove('hidden');
        if (wordDisplay) {
            wordDisplay.textContent = 'Choix du mot...';
            wordDisplay.classList.add('choosing-word');
        }

        if (drawerNameDisplay) {
            drawerNameDisplay.classList.remove('hidden');
            const drawer = this.playerListManager.getPlayer(data.drawerId);
            const drawerName = drawer ? drawer.username : 'Un joueur';
            drawerNameDisplay.innerHTML = `C'est au tour de <strong>${drawerName}</strong>`;
        }

        if (timerValue) timerValue.textContent = data.timeout;

        if (this.currentTimerInterval) clearInterval(this.currentTimerInterval);
        
        let timeLeft = data.timeout;
        this.currentTimerInterval = this.startSmartTimer(timeLeft, (remaining) => {
            if (timerValue) timerValue.textContent = remaining;
        });
    }

    handleAiGenerating(isGenerating) {
        if (isGenerating) {
            if (loadingModal) {
                loadingModal.classList.remove('hidden');
                const title = loadingModal.querySelector('h2');
                const text = loadingModal.querySelector('p');
                if (title) title.textContent = 'L\'IA réfléchit...';
                if (text) text.textContent = 'Génération des mots en cours...';
            }
        } else {
            if (loadingModal) {
                loadingModal.classList.add('hidden');
            }
        }
    }

    handleSpectatorWord(word) {
        if (wordDisplay) {
            wordDisplay.textContent = word;
            wordDisplay.classList.add('choosing-word');
            wordDisplay.style.color = 'var(--primary)';
        }
        if (drawerNameDisplay) {
            drawerNameDisplay.classList.add('hidden');
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

        if (wordDisplay) {
            wordDisplay.textContent = 'À vous de choisir !';
            wordDisplay.classList.add('choosing-word');
        }

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

    handleTypeWord(data) {
        const timeout = data.timeout || 20;
        const maxLen = data.maxWordLength || 20;

        if (customWordInput) {
            customWordInput.value = '';
            customWordInput.maxLength = maxLen;
            customWordInput.focus();
        }

        if (wordDisplay) {
            wordDisplay.textContent = 'À vous de choisir !';
            wordDisplay.classList.add('choosing-word');
        }

        if (customWordTimerVal) {
            customWordTimerVal.textContent = timeout;
            customWordTimerVal.style.color = '';

            if (this.wordChoiceTimerInterval) clearInterval(this.wordChoiceTimerInterval);
            this.wordChoiceTimerInterval = this.startSmartTimer(timeout, (remaining) => {
                customWordTimerVal.textContent = remaining;
                if (remaining <= 5) {
                    customWordTimerVal.style.color = 'red';
                    if (remaining > 0) playTickSound();
                }
            }, () => {
                // On timeout, if user typed something, submit it
                if (customWordInput && customWordInput.value.trim().length > 0) {
                    const word = customWordInput.value.trim();
                    socket.emit('customWordChosen', { roomCode: state.currentRoom, word });
                    customWordModal.classList.add('hidden');
                }
            });
        }

        customWordModal.classList.remove('hidden');
    }

    handleRandomWordProvided(word) {
        if (customWordInput) {
            customWordInput.value = word;
        }
    }

    handleRoundStart(data) {
        gameTopBar.classList.remove('hidden');
        wordChoiceModal.classList.add('hidden');
        customWordModal.classList.add('hidden');
        if (this.wordChoiceTimerInterval) clearInterval(this.wordChoiceTimerInterval);
        timerValue.textContent = data.duration;
        wordDisplay.textContent = this.formatHint(data.hint);
        wordDisplay.classList.remove('choosing-word');

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
            if (drawerNameDisplay) {
                drawerNameDisplay.classList.remove('hidden');
                drawerNameDisplay.innerHTML = `C'est au tour de <strong>${state.currentDrawerName}</strong>`;
            }
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

        if (drawerNameDisplay) {
            drawerNameDisplay.classList.remove('hidden');
            drawerNameDisplay.innerHTML = `C'est au tour de <strong>${data.drawerName}</strong>`;
        }
        this.chatManager.addSeparator(`Round ${data.roundIndex} - Tour ${data.turnIndex}/${data.totalTurns}`);
        this.cursorManager.clearCursors();

        // Clear all layers to ensure clean slate for new turn
        if (this.layerManager) {
            const canvases = this.layerManager.getLayerCanvases();
            Object.values(canvases).forEach(c => {
                c.ctx.clearRect(0, 0, c.canvas.width, c.canvas.height);
            });
            if (this.layerManager.renderCallback) {
                this.layerManager.renderCallback();
            }
        }

        roundResultOverlay.classList.add('hidden');
        roundResultOverlay.classList.add('hidden');
        if (this.currentTimerInterval) clearInterval(this.currentTimerInterval);
        timerValue.textContent = '0';
        wordDisplay.textContent = '';
        wordDisplay.style.color = 'var(--primary)';
        wordDisplay.classList.remove('choosing-word');

        this.layerManager.updateLayersUI();
    }

    handleRoundEnd(data) {
        if (this.currentTimerInterval) clearInterval(this.currentTimerInterval);

        // Ensure wide class is removed
        const content = roundResultOverlay.querySelector('.modal-content');
        if (content) content.classList.remove('wide-results');

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
        customWordModal.classList.add('hidden');
        roundResultOverlay.classList.add('hidden');
        gameTopBar.classList.add('hidden');

        // Clear all layers
        if (this.layerManager) {
            const canvases = this.layerManager.getLayerCanvases();
            Object.values(canvases).forEach(c => {
                c.ctx.clearRect(0, 0, c.canvas.width, c.canvas.height);
            });
            if (this.layerManager.renderCallback) {
                this.layerManager.renderCallback();
            }
        }

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

    getSettingsList(settings) {
        const labels = {
            drawTime: (v) => ({ icon: 'fa-clock', text: `${v}s Dessin` }),
            wordChoiceTime: (v) => ({ icon: 'fa-hourglass-half', text: `${v}s Choix` }),
            wordChoices: (v) => ({ icon: 'fa-list-ol', text: `${v} Choix de mots` }),
            rounds: (v) => ({ icon: 'fa-sync', text: `${v} Tours` }),
            allowFuzzy: (v) => ({ icon: 'fa-spell-check', text: v ? 'Accents Cool' : 'Accents Stricts' }),
            hintsEnabled: (v) => ({ icon: 'fa-lightbulb', text: v ? 'Indices Auto' : 'Sans Indices Auto' }),
            maxWordLength: (v) => ({ icon: 'fa-text-width', text: `Max ${v} lettres` }),
            personalHints: (v) => ({ icon: 'fa-search', text: `${v} Indices Perso` }),
            writeTime: (v) => ({ icon: 'fa-pen', text: `${v}s Écriture` }),
            allowTracing: (v) => ({ icon: 'fa-image', text: v ? 'Modèles autorisés' : 'Modèles interdits' }),
            anonymousVoting: (v) => ({ icon: 'fa-user-secret', text: v ? 'Votes cachés' : 'Votes publics' }),
            presentationTime: (v) => ({ icon: 'fa-chalkboard-teacher', text: `${v}s Présentation` }),
            voteTime: (v) => ({ icon: 'fa-vote-yea', text: `${v}s Vote` })
        };

        // Whitelist per mode to ensure only relevant settings are shown
        const modeSettings = {
            'guess-word': ['drawTime', 'wordChoiceTime', 'wordChoices', 'rounds', 'allowFuzzy', 'hintsEnabled', 'personalHints', 'allowTracing'],
            'custom-word': ['drawTime', 'wordChoiceTime', 'rounds', 'allowFuzzy', 'hintsEnabled', 'personalHints', 'allowTracing', 'maxWordLength'],
            'ai-theme': ['drawTime', 'wordChoiceTime', 'wordChoices', 'rounds', 'allowFuzzy', 'hintsEnabled', 'personalHints', 'allowTracing'],
            'creative': ['drawTime', 'presentationTime', 'voteTime', 'rounds', 'allowTracing', 'anonymousVoting'],
            'telephone': ['writeTime', 'drawTime', 'allowTracing']
        };

        let allowedKeys = modeSettings[settings.mode] || [];
        
        // If Auto Hints are enabled, Personal Hints are disabled/hidden in game logic, so hide them here too
        if (settings.hintsEnabled) {
            allowedKeys = allowedKeys.filter(k => k !== 'personalHints');
        }

        return allowedKeys
            .filter(key => labels[key] && settings[key] !== undefined)
            .map(key => labels[key](settings[key]));
    }

    handleReadyCheckStarted(data) {
        readyCheckModal.classList.remove('hidden');

        // Display Settings
        const modeDisplay = document.getElementById('ready-mode-display');
        const themeDisplay = document.getElementById('ready-theme-display');
        const settingsList = document.getElementById('ready-settings-list');

        const modeLabels = {
            'guess-word': 'Devine le dessin',
            'custom-word': 'Mot personnalisé',
            'ai-theme': 'Thématique (IA)',
            'creative': 'Mode Créatif',
            'telephone': 'Téléphone Dessiné'
        };

        const modeLabel = modeLabels[data.settings.mode] || data.settings.mode;

        if (modeDisplay) {
            modeDisplay.innerHTML = `<i class="fas fa-gamepad"></i> ${modeLabel}`;
        }

        // Handle AI Theme Display
        if (themeDisplay) {
            if (data.settings.mode === 'ai-theme' && data.settings.aiTheme) {
                themeDisplay.textContent = `Thème : ${data.settings.aiTheme.toUpperCase()}`;
                themeDisplay.classList.remove('hidden');
            } else {
                themeDisplay.classList.add('hidden');
            }
        }

        if (settingsList) {
            settingsList.innerHTML = '';
            const settingsItems = this.getSettingsList(data.settings);
            
            settingsItems.forEach(item => {
                const div = document.createElement('div');
                div.className = 'ready-setting-item';
                div.innerHTML = `<i class="fas ${item.icon}"></i> ${item.text}`;
                settingsList.appendChild(div);
            });
        }

        const readyStatus = document.querySelector('.ready-status');
        if (readyStatus) {
            readyStatus.innerHTML = `
                <div class="ready-count-container">
                    <div class="ready-count"><span id="ready-count-val">0</span>/<span id="ready-total-val">${data.totalPlayers}</span></div>
                    <div>joueurs prêts</div>
                </div>
                <div class="ready-timer-inline">
                    <i class="fas fa-clock"></i> <span id="ready-timer-val">${data.timeout}</span>s
                </div>
            `;
            // Reset flex style in case it was overwritten by game start
            readyStatus.style.display = 'flex';
            readyStatus.style.flexDirection = 'row';
            readyStatus.style.justifyContent = 'space-between';
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

                chip.innerHTML = `
                    <div class="ready-player-info">
                        ${avatarHtml}
                        <span class="ready-player-name">${user.username}</span>
                    </div>
                    <div class="ready-player-status">
                        <i class="fas fa-spinner fa-spin status-waiting"></i>
                        <i class="fas fa-check status-ready"></i>
                    </div>
                `;
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
            readyStatus.style.flexDirection = 'column';
            readyStatus.style.justifyContent = 'center';
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
        wordDisplay.style.color = 'var(--primary)'; // Ensure visible color
        wordDisplay.classList.add('choosing-word'); // Use choosing style for better visibility
        
        roundCurrent.textContent = data.roundIndex;
        roundTotal.textContent = data.totalRounds;
        
        // Hide Drawer Name Display in Creative Mode
        if (drawerNameDisplay) drawerNameDisplay.classList.add('hidden');
        
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
        // Capture and submit the drawing
        const compositeImage = this.layerManager.getCompositeDataURL();
        socket.emit('submitCreativeDrawing', { roomCode: state.currentRoom, image: compositeImage });

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
        
        // Get Avatar
        const player = this.playerListManager.getPlayer(data.artistId); // Assuming artistId is sent, or we find by name
        // Actually data.artist is the name. We might need to find player by name if ID not sent.
        // But usually ID is better. Let's check if data has artistId. 
        // If not, we can try to find by name or just show name.
        // Looking at server code would confirm, but let's assume we can try to find it.
        
        let avatarHtml = '';
        // Try to find player by name if ID not available (though ID is preferred)
        const playerObj = this.playerListManager.getPlayerList().find(p => p.username === data.artist);
        
        if (playerObj) {
             if (playerObj.avatar && playerObj.avatar.type === 'image') {
                avatarHtml = `<img src="${playerObj.avatar.value}" class="player-avatar-small" style="width: 32px; height: 32px; margin-right: 10px; border-radius: 50%; vertical-align: middle;">`;
            } else {
                const color = (playerObj.avatar && playerObj.avatar.color) || '#3498db';
                const emoji = (playerObj.avatar && playerObj.avatar.emoji) || '🎨';
                avatarHtml = `<div class="player-avatar-small" style="background-color: ${color}; display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 50%; margin-right: 10px; font-size: 18px; vertical-align: middle;">${emoji}</div>`;
            }
        }

        artistName.innerHTML = `Artiste : ${avatarHtml}${data.artist}`;
        
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        if (data.image) {
            const img = new Image();
            img.onload = () => {
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            };
            img.src = data.image;
        } else {
            this.replayDrawing(ctx, data.drawing);
        }

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

        // Calculate scale based on canvas size vs original config size
        const scaleX = ctx.canvas.width / CANVAS_CONFIG.width;
        const scaleY = ctx.canvas.height / CANVAS_CONFIG.height;

        actions.forEach(action => {
            if (action.tool === 'fill') {
                performFloodFill(
                    ctx, 
                    ctx.canvas.width, 
                    ctx.canvas.height, 
                    Math.floor(action.x0 * scaleX), 
                    Math.floor(action.y0 * scaleY), 
                    action.color
                );
            } else if (action.tool === 'clear-rect') {
                performClearRect(
                    ctx,
                    action.x * scaleX,
                    action.y * scaleY,
                    action.w * scaleX,
                    action.h * scaleY
                );
            } else if (action.tool === 'move-selection') {
                performMoveSelection(
                    ctx,
                    action.srcX * scaleX,
                    action.srcY * scaleY,
                    action.w * scaleX,
                    action.h * scaleY,
                    action.destX * scaleX,
                    action.destY * scaleY
                );
            } else {
                performDraw(
                    ctx, 
                    action.x0 * scaleX, 
                    action.y0 * scaleY, 
                    action.x1 * scaleX, 
                    action.y1 * scaleY, 
                    action.color, 
                    action.size * scaleX, 
                    action.opacity, 
                    action.tool
                );
            }
        });
    }

    handleCreativeVotingStart(data) {
        document.getElementById('creative-presentation-modal').classList.add('hidden');
        const modal = document.getElementById('creative-voting-modal');
        
        // Reset Title
        const modalTitle = document.getElementById('voting-modal-title');
        if (modalTitle) {
            modalTitle.innerHTML = '<i class="fas fa-star"></i> Votez pour vos dessins préférés !';
            modalTitle.classList.remove('reveal-animation');
        }

        const grid = document.getElementById('voting-grid');
        const timer = document.getElementById('voting-timer-val');

        modal.classList.remove('hidden');
        grid.innerHTML = '';
        
        // Calculate columns for balanced layout
        const count = data.drawings.length;
        let cols = 2;
        if (count >= 5) cols = 3;
        if (count >= 7) cols = 4;
        
        grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;

        data.drawings.forEach(item => {
            const card = document.createElement('div');
            card.className = 'voting-card';
            card.dataset.userId = item.userId; // Store ID for reveal
            card.style.border = '1px solid #ccc';
            card.style.padding = '10px';
            card.style.borderRadius = '8px';
            card.style.background = 'rgba(255,255,255,0.1)';
            card.style.display = 'flex';
            card.style.flexDirection = 'column';
            card.style.gap = '10px';

            const cvsContainer = document.createElement('div');
            cvsContainer.style.background = 'white';
            cvsContainer.style.borderRadius = '4px';
            cvsContainer.style.overflow = 'hidden';
            cvsContainer.style.width = '100%';

            const cvs = document.createElement('canvas');
            cvs.width = CANVAS_CONFIG.width;
            cvs.height = CANVAS_CONFIG.height;
            cvs.style.width = '100%';
            cvs.style.display = 'block';
            
            cvsContainer.appendChild(cvs);
            
            const ctx = cvs.getContext('2d');
            // No scaling needed as we use full resolution
            if (item.image) {
                const img = new Image();
                img.onload = () => {
                    ctx.drawImage(img, 0, 0, cvs.width, cvs.height);
                };
                img.src = item.image;
            } else {
                this.replayDrawing(ctx, item.drawing);
            }

            const info = document.createElement('div');
            info.className = 'voting-info'; // Add class for easy selection
            info.style.display = 'flex';
            info.style.justifyContent = 'space-between';
            info.style.alignItems = 'center';
            
            // Get Avatar
            let avatarHtml = '';
            if (data.anonymous && item.userId !== socket.id) {
                // Anonymous Avatar
                avatarHtml = `<div class="player-avatar-small" style="background-color: #555; display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; border-radius: 50%; margin-right: 8px; font-size: 14px;">?</div>`;
            } else {
                const player = this.playerListManager.getPlayer(item.userId);
                if (player) {
                    if (player.avatar && player.avatar.type === 'image') {
                        avatarHtml = `<img src="${player.avatar.value}" class="player-avatar-small" style="width: 24px; height: 24px; margin-right: 8px; border-radius: 50%; object-fit: cover;">`;
                    } else {
                        const color = (player.avatar && player.avatar.color) || '#3498db';
                        const emoji = (player.avatar && player.avatar.emoji) || '🎨';
                        avatarHtml = `<div class="player-avatar-small" style="background-color: ${color}; display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; border-radius: 50%; margin-right: 8px; font-size: 14px;">${emoji}</div>`;
                    }
                }
            }
            
            info.innerHTML = `<div style="display:flex; align-items:center;">${avatarHtml}<span style="font-weight:bold; font-size:0.9rem;">${item.username}</span></div>`;

            const starsContainer = document.createElement('div');
            starsContainer.className = 'stars-input';
            starsContainer.style.display = 'flex';
            starsContainer.style.gap = '4px';
            starsContainer.style.justifyContent = 'center';
            starsContainer.style.padding = '5px 0';

            let currentVote = 0;

            if (item.userId === socket.id) {
                starsContainer.innerHTML = '<span style="color: var(--text-dim); font-size: 0.8rem; font-style: italic;">Votre dessin</span>';
            } else {
                const updateStars = (count, isHover) => {
                    Array.from(starsContainer.children).forEach((child, idx) => {
                        const starIndex = idx + 1;
                        if (starIndex <= count) {
                            child.className = 'fas fa-star';
                            if (isHover) child.style.transform = 'scale(1.2)';
                            else child.style.transform = 'scale(1)';
                        } else {
                            child.className = 'far fa-star';
                            child.style.transform = 'scale(1)';
                        }
                    });
                };

                for(let i=1; i<=10; i++) {
                    const s = document.createElement('i');
                    s.className = 'far fa-star';
                    s.style.cursor = 'pointer';
                    s.style.color = '#ffd700';
                    s.style.fontSize = '1.2rem';
                    s.style.transition = 'transform 0.1s, color 0.1s';
                    
                    s.onmouseenter = () => {
                        updateStars(i, true);
                    };

                    s.onclick = () => {
                        currentVote = i;
                        updateStars(i, false);
                        // Pulse animation
                        s.style.transform = 'scale(1.4)';
                        setTimeout(() => s.style.transform = 'scale(1)', 200);
                        
                        socket.emit('creativeVote', { roomCode: state.currentRoom, targetId: item.userId, stars: i });
                    };
                    starsContainer.appendChild(s);
                }

                starsContainer.onmouseleave = () => {
                    updateStars(currentVote, false);
                };
            }

            card.appendChild(cvsContainer);
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

    handleCreativeReveal(data) {
        // Update Modal Title instead of Toast
        const modalTitle = document.getElementById('voting-modal-title');
        if (modalTitle) {
            modalTitle.innerHTML = '<i class="fas fa-magic"></i> Révélation des artistes !';
            modalTitle.classList.add('reveal-animation');
            setTimeout(() => modalTitle.classList.remove('reveal-animation'), 1000);
        }

        const timer = document.getElementById('voting-timer-val');
        
        if (this.votingTimerInterval) clearInterval(this.votingTimerInterval);
        
        let timeLeft = data.duration;
        if (timer) timer.textContent = timeLeft;
        
        this.votingTimerInterval = this.startSmartTimer(timeLeft, (remaining) => {
            if (timer) timer.textContent = remaining;
        });

        // Reveal logic
        const cards = document.querySelectorAll('.voting-card');
        cards.forEach((card, index) => {
            // Hide stars and "Your drawing" label
            const starsInput = card.querySelector('.stars-input');
            if (starsInput) {
                starsInput.style.display = 'none';
            }

            const userId = card.dataset.userId;
            if (!userId) return;

            const player = this.playerListManager.getPlayer(userId);
            if (!player) return;

            const infoDiv = card.querySelector('.voting-info');
            if (infoDiv) {
                let avatarHtml = '';
                if (player.avatar && player.avatar.type === 'image') {
                    avatarHtml = `<img src="${player.avatar.value}" class="player-avatar-small" style="width: 24px; height: 24px; margin-right: 8px; border-radius: 50%; object-fit: cover;">`;
                } else {
                    const color = (player.avatar && player.avatar.color) || '#3498db';
                    const emoji = (player.avatar && player.avatar.emoji) || '🎨';
                    avatarHtml = `<div class="player-avatar-small" style="background-color: ${color}; display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; border-radius: 50%; margin-right: 8px; font-size: 14px;">${emoji}</div>`;
                }

                // Staggered Reveal Animation
                setTimeout(() => {
                    infoDiv.style.opacity = '0';
                    infoDiv.style.transform = 'scale(0.8)';
                    
                    setTimeout(() => {
                        infoDiv.innerHTML = `<div style="display:flex; align-items:center;">${avatarHtml}<span style="font-weight:bold; font-size:0.9rem;">${player.username}</span></div>`;
                        infoDiv.style.transition = 'all 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
                        infoDiv.style.opacity = '1';
                        infoDiv.style.transform = 'scale(1)';
                        
                        // Add a highlight effect
                        infoDiv.style.textShadow = '0 0 10px var(--primary-glow)';
                        setTimeout(() => infoDiv.style.textShadow = 'none', 1000);
                        
                    }, 300);
                }, index * 100); // Stagger by 100ms
            }
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

        // Add wide class for podium
        const content = roundResultOverlay.querySelector('.modal-content');
        if (content) content.classList.add('wide-results');

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
        podiumContainer.style.flexWrap = 'wrap';

        // Calculate ranks correctly handling ties
        let rank = 1;
        for (let i = 0; i < data.results.length; i++) {
            if (i > 0 && data.results[i].score < data.results[i-1].score) {
                rank = i + 1;
            }
            data.results[i].rank = rank;
        }

        // Filter for Podium (Max 3 players)
        const podiumPlayers = data.results.slice(0, 3);
        
        // Determine display order for podium effect (2nd, 1st, 3rd)
        let displayOrder = [];
        if (podiumPlayers.length === 1) {
            displayOrder = [podiumPlayers[0]];
        } else if (podiumPlayers.length === 2) {
            // If ranks are different: 2nd then 1st. If same: 1st then 1st.
            // podiumPlayers is sorted by score desc.
            // [0] is #1. [1] is #2 (or #1).
            displayOrder = [podiumPlayers[1], podiumPlayers[0]];
        } else if (podiumPlayers.length >= 3) {
            // [0]=#1, [1]=#2, [2]=#3
            // Order: #2, #1, #3
            displayOrder = [podiumPlayers[1], podiumPlayers[0], podiumPlayers[2]];
        }
        
        displayOrder.forEach(res => {
            const item = document.createElement('div');
            item.className = `podium-item rank-${res.rank}`;
            item.style.display = 'flex';
            item.style.flexDirection = 'column';
            item.style.alignItems = 'center';
            item.style.gap = '10px';
            item.style.position = 'relative';
            item.style.margin = '0 5px';
            
            // Scale based on rank
            let scale = 1;
            let zIndex = 0;
            let borderColor = '#cd7f32'; // Bronze
            
            if (res.rank === 1) {
                scale = 1.1;
                zIndex = 10;
                borderColor = '#ffd700'; // Gold
            } else if (res.rank === 2) {
                scale = 0.9;
                zIndex = 5;
                borderColor = '#c0c0c0'; // Silver
            } else {
                scale = 0.8;
                zIndex = 1;
                borderColor = '#cd7f32'; // Bronze
            }
            
            item.style.zIndex = zIndex;
            
            // Thumbnail
            const thumbWrapper = document.createElement('div');
            const baseW = 140;
            const baseH = 105;
            
            thumbWrapper.style.width = `${baseW * scale}px`;
            thumbWrapper.style.height = `${baseH * scale}px`;
            thumbWrapper.style.background = 'white';
            thumbWrapper.style.borderRadius = '8px';
            thumbWrapper.style.overflow = 'hidden';
            thumbWrapper.style.border = `3px solid ${borderColor}`;
            thumbWrapper.style.boxShadow = '0 4px 10px rgba(0,0,0,0.3)';
            
            const cvs = document.createElement('canvas');
            cvs.width = CANVAS_CONFIG.width;
            cvs.height = CANVAS_CONFIG.height;
            cvs.style.width = '100%';
            cvs.style.height = '100%';
            
            const ctx = cvs.getContext('2d');
            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, cvs.width, cvs.height);
            
            if (res.image) {
                const img = new Image();
                img.onload = () => {
                    ctx.drawImage(img, 0, 0, cvs.width, cvs.height);
                };
                img.src = res.image;
            } else {
                this.replayDrawing(ctx, res.drawing);
            }
            
            thumbWrapper.appendChild(cvs);
            item.appendChild(thumbWrapper);

            // Info
            const info = document.createElement('div');
            info.style.textAlign = 'center';
            info.innerHTML = `
                <div style="font-weight:bold; color:var(--text-main); font-size:${0.9 * scale}rem">${res.username}</div>
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
            badge.style.zIndex = '10';
            badge.style.background = borderColor;
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

        // List remaining players (Index >= 3)
        const remainingPlayers = data.results.slice(3);
        if (remainingPlayers.length > 0) {
            const othersContainer = document.createElement('div');
            othersContainer.style.marginTop = '20px';
            othersContainer.style.borderTop = '1px solid rgba(255,255,255,0.1)';
            othersContainer.style.paddingTop = '10px';
            othersContainer.style.width = '100%';

            remainingPlayers.forEach((res) => {
                const row = document.createElement('div');
                row.className = 'score-row';
                row.innerHTML = `
                    <span class="score-rank" style="color:var(--text-dim)">#${res.rank}</span>
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
            const content = roundResultOverlay.querySelector('.modal-content');
            if (content) content.classList.remove('wide-results');
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

    handleTelephoneRoundStart(data) {
        // Hide previous overlays
        const overlay = document.getElementById('telephone-write-overlay');
        const contentWrapper = document.getElementById('telephone-content-wrapper');
        const waitingMsg = document.getElementById('telephone-waiting-msg');
        
        overlay.classList.add('hidden');
        document.getElementById('telephone-guess-overlay')?.classList.add('hidden'); // Cleanup if exists
        gameTopBar.classList.remove('hidden');
        
        // Hide Drawer Name Display in Telephone Mode
        if (drawerNameDisplay) drawerNameDisplay.classList.add('hidden');

        // Update Top Bar
        roundCurrent.textContent = data.round;
        roundTotal.textContent = data.totalRounds;
        if (timerValue) timerValue.textContent = data.duration;

        // Start Timer
        if (this.currentTimerInterval) clearInterval(this.currentTimerInterval);
        const telephoneTimerVal = document.getElementById('telephone-timer-val');
        
        this.currentTimerInterval = this.startSmartTimer(data.duration, (remaining) => {
            if (timerValue) timerValue.textContent = remaining;
            if (telephoneTimerVal) telephoneTimerVal.textContent = remaining;
            if (remaining <= 10 && remaining > 0) playTickSound();
        }, () => {
            // Auto-submit on timeout (only for players)
            if (!state.isSpectator) {
                submitResponse();
            }
        });

        if (state.isSpectator) {
            if (data.phase === 'WRITING') {
                if (wordDisplay) {
                    wordDisplay.textContent = data.round === 1 ? "Choix des phrases en cours..." : "Description du dessin...";
                    wordDisplay.classList.add('choosing-word');
                    wordDisplay.style.color = 'var(--text-main)';
                }
            } else {
                if (wordDisplay) {
                    wordDisplay.textContent = "Dessin en cours...";
                    wordDisplay.classList.remove('choosing-word');
                    wordDisplay.style.color = 'var(--primary)';
                }
            }
            return;
        }

        // Reset Waiting State
        contentWrapper.classList.remove('hidden');
        waitingMsg.classList.add('hidden');

        // Reset Layers if Drawing Phase
        if (data.phase !== 'WRITING') {
            // Clear canvas
            this.cursorManager.clearCursors();
            const canvases = this.layerManager.getLayerCanvases();
            Object.values(canvases).forEach(c => {
                c.ctx.clearRect(0, 0, c.canvas.width, c.canvas.height);
            });
            
            // Reset layers to default (1 layer)
            // Since we are in telephone mode, we manage layers locally.
            // We should reset state.layers to a single layer.
            const defaultLayer = {
                id: 'layer-' + Date.now(),
                name: 'Calque 1',
                order: 0,
                creatorId: socket.id
            };
            
            // We need to access state.layers. 
            // Since we are in GameHandler, we imported state.
            state.layers.length = 0;
            state.layers.push(defaultLayer);
            
            // Re-init canvases
            // Clear old canvases from state.layerCanvases
            Object.keys(state.layerCanvases).forEach(key => delete state.layerCanvases[key]);
            
            this.layerManager.createLayerCanvas(defaultLayer.id);
            this.layerManager.setActiveLayerId(defaultLayer.id);
            if (this.layerManager.onActiveLayerChange) this.layerManager.onActiveLayerChange(defaultLayer.id);
            this.layerManager.updateLayersUI();
            this.layerManager.renderCallback();
        }

        const submitResponse = () => {
            if (data.phase === 'WRITING') {
                const input = document.getElementById('telephone-input');
                const text = input.value.trim() || '...'; // Default if empty
                socket.emit('telephoneSubmit', { roomCode: state.currentRoom, content: text });
                contentWrapper.classList.add('hidden');
                waitingMsg.classList.remove('hidden');
            } else {
                // Capture canvas
                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = CANVAS_CONFIG.width;
                tempCanvas.height = CANVAS_CONFIG.height;
                const tCtx = tempCanvas.getContext('2d');
                tCtx.fillStyle = 'white';
                tCtx.fillRect(0, 0, CANVAS_CONFIG.width, CANVAS_CONFIG.height);
                
                const layers = this.layerManager.getLayerCanvases();
                state.layers.forEach(l => {
                    const layerObj = layers[l.id];
                    if (layerObj && layerObj.visible) {
                        tCtx.drawImage(layerObj.canvas, 0, 0);
                    }
                });
                
                const dataURL = tempCanvas.toDataURL('image/jpeg', 0.8);
                socket.emit('telephoneSubmit', { roomCode: state.currentRoom, content: dataURL });
                
                // Show waiting overlay
                overlay.classList.remove('hidden');
                contentWrapper.classList.add('hidden');
                waitingMsg.classList.remove('hidden');
            }
        };

        if (data.phase === 'WRITING') {
            // Show Writing Overlay
            const input = document.getElementById('telephone-input');
            const prevDrawing = document.getElementById('telephone-prev-drawing');
            const promptText = document.getElementById('telephone-prompt-text');
            const btnSubmit = document.getElementById('btn-telephone-submit');

            overlay.classList.remove('hidden');
            input.value = '';
            input.focus();
            
            // If Round 1, no previous step
            if (data.round === 1) {
                prevDrawing.classList.add('hidden');
                promptText.textContent = "Inventez une phrase de départ !";
            } else {
                // Previous step was a drawing
                prevDrawing.classList.remove('hidden');
                promptText.textContent = "Décrivez ce dessin :";
                
                // Display previous drawing
                const ctx = prevDrawing.getContext('2d');
                ctx.fillStyle = 'white';
                ctx.fillRect(0, 0, prevDrawing.width, prevDrawing.height);
                
                // Replay drawing history or load image
                if (Array.isArray(data.previousStep.content)) {
                    this.replayDrawing(ctx, data.previousStep.content);
                } else {
                    // DataURL
                    const img = new Image();
                    img.onload = () => ctx.drawImage(img, 0, 0, prevDrawing.width, prevDrawing.height);
                    img.src = data.previousStep.content;
                }
            }

            btnSubmit.onclick = () => {
                const text = input.value.trim();
                if (text) {
                    socket.emit('telephoneSubmit', { roomCode: state.currentRoom, content: text });
                    contentWrapper.classList.add('hidden');
                    waitingMsg.classList.remove('hidden');
                } else {
                    showToast('Écrivez quelque chose !', 'error');
                }
            };

        } else {
            // DRAWING PHASE
            // Show Drawing UI (normal game UI) but with prompt
            
            wordDisplay.textContent = data.previousStep.content; // The text to draw
            wordDisplay.style.color = 'var(--primary)';
            
            showToast(`À vous de dessiner : ${data.previousStep.content}`, 'info');

            // Hide finish button if it exists (user requested removal)
            const finishBtn = document.getElementById('btn-telephone-finish-draw');
            if (finishBtn) finishBtn.classList.add('hidden');
        }
    }

    handleTelephoneRoundEnd() {
        // Just a transition state, maybe show a spinner
        if (this.currentTimerInterval) clearInterval(this.currentTimerInterval);
    }

    handleTelephoneGameEnded(data) {
        // Show Recap
        document.getElementById('telephone-write-overlay').classList.add('hidden');
        const finishBtn = document.getElementById('btn-telephone-finish-draw');
        if (finishBtn) finishBtn.classList.add('hidden');
        
        gameTopBar.classList.add('hidden');
        
        const modal = document.getElementById('telephone-recap-modal');
        const container = document.getElementById('telephone-recap-container');
        
        // Hide close buttons initially
        const closeBtns = modal.querySelectorAll('.close-btn, .modal-footer button');
        closeBtns.forEach(btn => btn.classList.add('hidden'));

        modal.classList.remove('hidden');
        container.innerHTML = '';

        // Cleanup function
        const cleanup = () => {
            modal.classList.add('hidden');
            // Clear canvas
            const canvases = this.layerManager.getLayerCanvases();
            Object.values(canvases).forEach(c => {
                c.ctx.clearRect(0, 0, c.canvas.width, c.canvas.height);
            });
            
            // Request fresh state from server to ensure sync
            if (state.currentRoom) {
                socket.emit('requestCanvasState', { roomCode: state.currentRoom });
            }

            this.layerManager.renderCallback();
            gameTopBar.classList.add('hidden');
        };

        // Attach cleanup to close buttons
        closeBtns.forEach(btn => {
            btn.onclick = cleanup;
        });

        // Store recap data for navigation
        this.telephoneRecapData = data.recap;
        
        // State tracking
        this.recapProgress = {
            storyIndex: 0,
            stepIndex: 0 // Start with first step (prompt) revealed
        };
        
        this.activeRecapTab = 0; // Currently viewed story index

        // Build Layout Structure
        this.buildRecapLayout(container);

        // Render initial view
        this.renderTelephoneRecap();
    }

    buildRecapLayout(container) {
        container.innerHTML = '';
        container.style.padding = '0';
        
        // Sidebar
        const sidebar = document.createElement('div');
        sidebar.className = 'recap-sidebar';
        sidebar.id = 'recap-sidebar';
        
        const sidebarTitle = document.createElement('h3');
        sidebarTitle.textContent = 'Histoires';
        sidebar.appendChild(sidebarTitle);
        
        const tabsContainer = document.createElement('div');
        tabsContainer.id = 'recap-tabs-container';
        tabsContainer.style.display = 'flex';
        tabsContainer.style.flexDirection = 'column';
        tabsContainer.style.gap = '0.5rem';
        sidebar.appendChild(tabsContainer);
        
        container.appendChild(sidebar);

        // Main Area
        const main = document.createElement('div');
        main.className = 'recap-main';
        
        // Header
        const header = document.createElement('div');
        header.className = 'recap-header';
        const title = document.createElement('h2');
        title.id = 'recap-story-title';
        header.appendChild(title);
        main.appendChild(header);

        // Timeline
        const timeline = document.createElement('div');
        timeline.className = 'recap-timeline-container';
        timeline.id = 'recap-timeline';
        main.appendChild(timeline);

        // Controls Container (for everyone)
        const controls = document.createElement('div');
        controls.className = 'recap-controls';
        controls.id = 'recap-controls';
        main.appendChild(controls);

        container.appendChild(main);
    }

    handleTelephoneRecapUpdate(data) {
        if (data.direction === 'next') {
            const currentChain = this.telephoneRecapData[this.recapProgress.storyIndex];
            
            if (this.recapProgress.stepIndex < currentChain.chain.length - 1) {
                // Next Step
                this.recapProgress.stepIndex++;
            } else {
                // Next Story
                if (this.recapProgress.storyIndex < this.telephoneRecapData.length - 1) {
                    this.recapProgress.storyIndex++;
                    this.recapProgress.stepIndex = 0;
                    this.activeRecapTab = this.recapProgress.storyIndex; // Auto-switch
                } else {
                    showToast('Fin du récapitulatif', 'info');
                    return;
                }
            }
        }
        this.renderTelephoneRecap();
    }

    renderTelephoneRecap() {
        // 1. Update Tabs
        const tabsContainer = document.getElementById('recap-tabs-container');
        tabsContainer.innerHTML = '';
        
        this.telephoneRecapData.forEach((chain, idx) => {
            // Only show tabs for revealed stories
            if (idx > this.recapProgress.storyIndex) return;

            const tab = document.createElement('div');
            tab.className = `recap-tab ${idx === this.activeRecapTab ? 'active' : ''}`;
            
            const owner = this.playerListManager.getPlayer(chain.ownerId);
            const ownerName = owner ? owner.username : chain.ownerName;
            
            // Avatar
            let avatarHtml = '';
            if (owner) {
                if (owner.avatar && owner.avatar.type === 'image') {
                    avatarHtml = `<img src="${owner.avatar.value}" style="width: 24px; height: 24px; border-radius: 50%; object-fit: cover;">`;
                } else {
                    const color = (owner.avatar && owner.avatar.color) || '#3498db';
                    const emoji = (owner.avatar && owner.avatar.emoji) || '🎨';
                    avatarHtml = `<div style="background-color: ${color}; display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; border-radius: 50%; font-size: 14px;">${emoji}</div>`;
                }
            }

            tab.innerHTML = `${avatarHtml} <span>${ownerName}</span>`;
            tab.onclick = () => {
                this.activeRecapTab = idx;
                this.renderTelephoneRecap(); // Re-render view
            };
            tabsContainer.appendChild(tab);
        });

        // 2. Update Main Content
        const chainData = this.telephoneRecapData[this.activeRecapTab];
        if (!chainData) {
            console.error('No chain data for tab', this.activeRecapTab);
            return;
        }

        const title = document.getElementById('recap-story-title');
        title.textContent = `Histoire de ${chainData.ownerName}`;

        const timeline = document.getElementById('recap-timeline');
        // We clear and rebuild to ensure correct order and state, 
        // but we could optimize to append if it's the same story.
        // For simplicity and correctness, rebuild.
        timeline.innerHTML = '';

        // Determine how many steps to show
        // If viewing a previous story (fully revealed), show all.
        // If viewing current story, show up to progress.
        let maxStep = chainData.chain.length - 1;
        if (this.activeRecapTab === this.recapProgress.storyIndex) {
            maxStep = this.recapProgress.stepIndex;
        }

        for (let i = 0; i <= maxStep; i++) {
            const step = chainData.chain[i];
            if (!step) {
                console.warn('Step undefined at index', i);
                continue;
            }

            const stepDiv = document.createElement('div');
            stepDiv.className = `recap-step ${step.type === 'text' ? 'text-step' : ''}`;

            // Author
            const author = this.playerListManager.getPlayer(step.authorId);
            const authorName = author ? author.username : '???';
            
            let avatarHtml = '';
            if (author) {
                if (author.avatar && author.avatar.type === 'image') {
                    avatarHtml = `<img src="${author.avatar.value}" style="width: 32px; height: 32px; border-radius: 50%; object-fit: cover;">`;
                } else {
                    const color = (author.avatar && author.avatar.color) || '#3498db';
                    const emoji = (author.avatar && author.avatar.emoji) || '🎨';
                    avatarHtml = `<div style="background-color: ${color}; display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 50%; font-size: 16px;">${emoji}</div>`;
                }
            }

            const authorDiv = document.createElement('div');
            authorDiv.className = 'recap-author';
            authorDiv.innerHTML = `${avatarHtml} ${authorName}`;
            stepDiv.appendChild(authorDiv);

            // Content
            if (step.type === 'text') {
                const p = document.createElement('div');
                p.className = 'recap-content-text';
                p.textContent = step.content;
                stepDiv.appendChild(p);
            } else {
                if (step.content && step.content.length > 50) { // Basic check for valid dataURL
                    const img = document.createElement('img');
                    img.className = 'recap-content-image';
                    img.src = step.content;
                    stepDiv.appendChild(img);
                } else {
                    // Empty or invalid drawing
                    const emptyDiv = document.createElement('div');
                    emptyDiv.className = 'recap-content-image empty';
                    emptyDiv.style.backgroundColor = 'white';
                    emptyDiv.style.display = 'flex';
                    emptyDiv.style.alignItems = 'center';
                    emptyDiv.style.justifyContent = 'center';
                    emptyDiv.innerHTML = '<i class="fas fa-ban" style="color: #ccc; font-size: 2rem;"></i>';
                    stepDiv.appendChild(emptyDiv);
                }
            }

            timeline.appendChild(stepDiv);
        }

        // End of Story Indicator
        if (maxStep === chainData.chain.length - 1) {
             const endMsg = document.createElement('div');
             endMsg.textContent = "Fin de l'histoire";
             endMsg.style.fontStyle = 'italic';
             endMsg.style.color = 'var(--primary)';
             endMsg.style.fontWeight = 'bold';
             timeline.appendChild(endMsg);
        }

        // Controls Logic
        const controls = document.getElementById('recap-controls');
        if (controls) {
            controls.innerHTML = ''; // Clear controls

            const isLastStory = this.recapProgress.storyIndex >= this.telephoneRecapData.length - 1;
            const currentChainLength = this.telephoneRecapData[this.recapProgress.storyIndex]?.chain.length || 0;
            const isLastStep = this.recapProgress.stepIndex >= currentChainLength - 1;

            // Finish Button (Always visible at the very end)
            if (isLastStory && isLastStep) {
                const btnFinish = document.createElement('button');
                btnFinish.className = 'btn-primary';
                btnFinish.id = 'recap-btn-finish';
                btnFinish.textContent = 'Terminer la partie';
                btnFinish.style.padding = '10px 20px';
                btnFinish.style.fontSize = '1.1rem';
                btnFinish.onclick = () => {
                    const modal = document.getElementById('telephone-recap-modal');
                    const closeBtn = modal.querySelector('.close-btn');
                    if (closeBtn) closeBtn.click();
                    else modal.classList.add('hidden');
                };
                controls.appendChild(btnFinish);
            }

            // Navigation Controls (Leader Only)
            if (state.leaderId === socket.id) {
                // If not finished, show Next/Suite
                if (!(isLastStory && isLastStep)) {
                    const btnNext = document.createElement('button');
                    btnNext.className = 'btn-primary';
                    btnNext.id = 'recap-btn-next';
                    
                    // Determine text
                    const isChainEnd = this.recapProgress.stepIndex === chainData.chain.length - 1;
                    btnNext.textContent = isChainEnd ? 'Histoire Suivante' : 'Suite';
                    
                    btnNext.onclick = () => {
                        socket.emit('telephoneRecapNavigate', { roomCode: state.currentRoom, direction: 'next' });
                    };
                    controls.appendChild(btnNext);
                }
            } else {
                // Non-leader view
                if (!(isLastStory && isLastStep)) {
                    const waitingMsg = document.createElement('div');
                    waitingMsg.className = 'waiting-leader-msg';
                    waitingMsg.textContent = 'En attente du leader...';
                    waitingMsg.style.color = 'var(--text-dim)';
                    waitingMsg.style.fontStyle = 'italic';
                    waitingMsg.style.animation = 'pulse 2s infinite';
                    controls.appendChild(waitingMsg);
                }
            }
        }

        // Auto-scroll to bottom
        setTimeout(() => {
            timeline.scrollTop = timeline.scrollHeight;
        }, 50);
    }
}
