import { socket, gameTopBar, wordChoiceModal, wordChoicesContainer, timerValue, wordDisplay, roundCurrent, roundTotal, roundResultOverlay, roundResultTitle, roundResultWord, roundResultWordLabel, roundResultScores, gameEndModal, gameEndScores, readyCheckModal, btnIamReady, btnRefuseGame, readyCountVal, readyTotalVal, readyTimerVal, readyPlayersList, helpModal, lobbySettingsModal, confirmationModal, kickModal, alertModal, btnUseHint, hintsCount, customWordModal, customWordInput, btnSubmitCustomWord, customWordTimerVal, btnRandomCustomWord, drawerNameDisplay, loadingModal } from '../dom-elements.js';
import { state } from '../state.js';
import { showToast, playTickSound } from '../utils.js';
import { performDraw, performFloodFill, performClearRect, performMoveSelection } from '../draw.js';
import { CANVAS_CONFIG } from '../config.js';
import { CreativeGameHandler } from './game/creative-handler.js';
import { TelephoneGameHandler } from './game/telephone-handler.js';

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

        this.creativeHandler = new CreativeGameHandler(this, managers);
        this.telephoneHandler = new TelephoneGameHandler(this, managers);

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
        socket.on('creativeRoundStart', this.creativeHandler.handleCreativeRoundStart.bind(this.creativeHandler));
        socket.on('creativeIntermission', this.creativeHandler.handleCreativeIntermission.bind(this.creativeHandler));
        socket.on('creativePresentation', this.creativeHandler.handleCreativePresentation.bind(this.creativeHandler));
        socket.on('creativeVotingStart', this.creativeHandler.handleCreativeVotingStart.bind(this.creativeHandler));
        socket.on('votingAllDone', this.creativeHandler.handleVotingAllDone.bind(this.creativeHandler));
        socket.on('creativeReveal', this.creativeHandler.handleCreativeReveal.bind(this.creativeHandler));
        socket.on('creativeRoundEnd', this.creativeHandler.handleCreativeRoundEnd.bind(this.creativeHandler));
        socket.on('creativeHistory', this.creativeHandler.handleCreativeHistory.bind(this.creativeHandler));
        socket.on('creativeWordChoiceStart', this.creativeHandler.handleCreativeWordChoiceStart.bind(this.creativeHandler));
        socket.on('creativeRouletteStart', this.creativeHandler.handleCreativeRouletteStart.bind(this.creativeHandler));
        socket.on('creativePause', this.creativeHandler.handleCreativePause.bind(this.creativeHandler));
        socket.on('creativePlayerChose', this.creativeHandler.handleCreativePlayerChose.bind(this.creativeHandler));

        // Telephone Mode Events
        socket.on('telephoneRoundStart', this.telephoneHandler.handleTelephoneRoundStart.bind(this.telephoneHandler));
        socket.on('telephoneRoundEnd', this.telephoneHandler.handleTelephoneRoundEnd.bind(this.telephoneHandler));
        socket.on('telephoneGameEnded', this.telephoneHandler.handleTelephoneGameEnded.bind(this.telephoneHandler));
        socket.on('telephoneRecapUpdate', this.telephoneHandler.handleTelephoneRecapUpdate.bind(this.telephoneHandler));
        socket.on('telephonePlayerFinished', this.telephoneHandler.handleTelephonePlayerFinished.bind(this.telephoneHandler));

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
                    if (state.settings && state.settings.mode === 'creative') {
                         socket.emit('creativeWordChoice', { roomCode: state.currentRoom, word });
                         
                         // Mark self as ready immediately
                         if (this.creativeHandler.creativeWordChoiceStatus) {
                             this.creativeHandler.creativeWordChoiceStatus[socket.id] = true;
                         }
                         
                         this.creativeHandler.showCreativeWaitingModal();

                         if (wordDisplay) {
                             wordDisplay.textContent = "En attente des autres joueurs...";
                             wordDisplay.style.color = 'var(--text-dim)';
                             wordDisplay.classList.add('choosing-word');
                         }
                    } else {
                         socket.emit('customWordChosen', { roomCode: state.currentRoom, word });
                         customWordModal.classList.add('hidden');
                         if (this.wordChoiceTimerInterval) clearInterval(this.wordChoiceTimerInterval);
                    }
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

                if (isTelephone) {
                    // Telephone Mode Logic (Spectator OR Player)
                    // Note: For players, the specific prompt is sent via 'telephoneRoundStart' or 'telephoneHistory' usually.
                    // But on join, we might need to fetch it.
                    // For now, we just set a generic message if we don't have the specific prompt yet.
                    // The server should send the prompt in roomJoined for players too if we want it perfect.
                    
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
                                wordDisplay.classList.add('choosing-word');
                                wordDisplay.style.color = '';
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
            } else if (data.game.currentWord && state.settings.mode === 'creative') {
                // Creative Mode Mid-Game Join
                if (this.creativeHandler) {
                    this.creativeHandler.handleCreativeRoundStart({
                        word: data.game.currentWord,
                        duration: data.game.timeLeft,
                        roundIndex: data.game.currentRound,
                        totalRounds: data.game.totalRounds
                    });
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
            customWordInput.style.display = 'block'; // Reset display
            customWordInput.focus();
        }
        
        if (btnSubmitCustomWord) btnSubmitCustomWord.style.display = 'inline-block'; // Reset display
        if (btnRandomCustomWord) btnRandomCustomWord.style.display = 'inline-block'; // Reset display

        // Reset Modal Content for Standard Mode
        const title = document.getElementById('custom-word-title');
        const help = document.getElementById('custom-word-help');
        if (title) title.textContent = "Choisissez un mot personnalisé";
        if (help) help.textContent = "Entrez un mot que les autres devront deviner.";

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
        // Ignore if in Telephone or Creative mode
        if (state.settings && (state.settings.mode === 'telephone' || state.settings.mode === 'creative')) return;
        // Fallback check
        if (state.currentGameState === 'PLAYING' && document.getElementById('telephone-write-overlay') && !document.getElementById('telephone-write-overlay').classList.contains('hidden')) return;

        gameTopBar.classList.remove('hidden');
        wordChoiceModal.classList.add('hidden');
        customWordModal.classList.add('hidden');
        const waitingModal = document.getElementById('word-choice-waiting-modal');
        if (waitingModal) waitingModal.classList.add('hidden');
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
        // Ignore if in Telephone or Creative mode
        if (state.settings && (state.settings.mode === 'telephone' || state.settings.mode === 'creative')) return;
        // Fallback if settings not yet loaded but we are in game
        if (state.currentGameState === 'PLAYING' && document.getElementById('telephone-write-overlay') && !document.getElementById('telephone-write-overlay').classList.contains('hidden')) return;

        if (wordDisplay) wordDisplay.textContent = this.formatHint(data.hint);
    }

    handleYourWord(word) {
        wordDisplay.textContent = word;
        wordDisplay.style.color = 'var(--success)';
    }

    handleTurnStart(data) {
        if (state.settings && (state.settings.mode === 'creative' || state.settings.mode === 'telephone')) return;
        // Fallback check
        if (state.currentGameState === 'PLAYING' && document.getElementById('telephone-write-overlay') && !document.getElementById('telephone-write-overlay').classList.contains('hidden')) return;

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
        const waitingModal = document.getElementById('word-choice-waiting-modal');
        if (waitingModal) waitingModal.classList.add('hidden');
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
            wordSource: (v) => ({ icon: 'fa-book', text: v === 'custom' ? 'Mots choisis par les joueurs' : 'Mots aléatoires' }),
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
            'guess-word': ['wordSource', 'drawTime', 'wordChoiceTime', 'wordChoices', 'maxWordLength', 'rounds', 'allowFuzzy', 'hintsEnabled', 'personalHints', 'allowTracing'],
            'custom-word': ['drawTime', 'wordChoiceTime', 'rounds', 'allowFuzzy', 'hintsEnabled', 'personalHints', 'allowTracing', 'maxWordLength'],
            'ai-theme': ['drawTime', 'wordChoiceTime', 'wordChoices', 'rounds', 'allowFuzzy', 'hintsEnabled', 'personalHints', 'allowTracing'],
            'creative': ['wordSource', 'drawTime', 'presentationTime', 'voteTime', 'rounds', 'allowTracing', 'anonymousVoting', 'maxWordLength'],
            'telephone': ['writeTime', 'drawTime', 'allowTracing']
        };

        let allowedKeys = modeSettings[settings.mode] || [];
        
        // If Auto Hints are enabled, Personal Hints are disabled/hidden in game logic, so hide them here too
        if (settings.hintsEnabled) {
            allowedKeys = allowedKeys.filter(k => k !== 'personalHints');
        }

        // Dynamic filtering for guess-word based on wordSource
        if (settings.mode === 'guess-word') {
            if (settings.wordSource === 'custom') {
                allowedKeys = allowedKeys.filter(k => k !== 'wordChoices');
            } else {
                allowedKeys = allowedKeys.filter(k => k !== 'maxWordLength');
            }
        }

        // Dynamic filtering for creative based on wordSource
        if (settings.mode === 'creative') {
            if (settings.wordSource !== 'custom') {
                allowedKeys = allowedKeys.filter(k => k !== 'maxWordLength');
            }
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
}
