import { socket, gameTopBar, wordDisplay, roundCurrent, roundTotal, drawerNameDisplay, timerValue, roundResultOverlay, roundResultTitle, roundResultWord, roundResultWordLabel, roundResultScores, customWordInput, btnSubmitCustomWord, btnRandomCustomWord, customWordModal, customWordTimerVal } from '../../dom-elements.js';
import { state } from '../../state.js';
import { showToast, playTickSound } from '../../utils.js';
import { performDraw, performFloodFill } from '../../draw.js';
import { CANVAS_CONFIG } from '../../config.js';

export class CreativeGameHandler {
    constructor(gameHandler, managers) {
        this.gameHandler = gameHandler;
        this.managers = managers;
        this.playerListManager = managers.playerListManager;
        this.layerManager = managers.layerManager;
        this.cursorManager = managers.cursorManager;
        
        this.creativeWordChoiceStatus = {};
        this.votingTimerInterval = null;
    }

    handleCreativeRoundStart(data) {
        roundResultOverlay.classList.add('hidden');
        gameTopBar.classList.remove('hidden');
        if (timerValue) timerValue.textContent = data.duration;
        
        wordDisplay.textContent = data.word;
        wordDisplay.style.color = ''; // Let CSS handle color (white for choosing-word)
        wordDisplay.classList.add('choosing-word'); // Use choosing style for better visibility
        
        roundCurrent.textContent = data.roundIndex;
        roundTotal.textContent = data.totalRounds;
        
        // Hide Drawer Name Display in Creative Mode
        if (drawerNameDisplay) drawerNameDisplay.classList.add('hidden');
        
        // Clear canvas & cursors
        this.cursorManager.clearCursors();
        
        showToast(`C'est parti ! Dessinez : ${data.word}`, 'info');

        // Start Timer
        if (this.gameHandler.currentTimerInterval) clearInterval(this.gameHandler.currentTimerInterval);
        let timeLeft = parseInt(data.duration);
        
        // Force initial update
        if (timerValue) timerValue.textContent = timeLeft;

        this.gameHandler.currentTimerInterval = this.gameHandler.startSmartTimer(timeLeft, (remaining) => {
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
            
            this.gameHandler.startSmartTimer(timeLeft, (remaining) => {
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
            this.gameHandler.replayDrawing(ctx, data.drawing);
        }

        let timeLeft = data.duration;
        timer.textContent = timeLeft;
        
        this.gameHandler.startSmartTimer(timeLeft, (remaining) => {
            timer.textContent = remaining;
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
                this.gameHandler.replayDrawing(ctx, item.drawing);
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
        this.votingTimerInterval = this.gameHandler.startSmartTimer(timeLeft, (remaining) => {
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
        
        this.votingTimerInterval = this.gameHandler.startSmartTimer(timeLeft, (remaining) => {
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
        
        this.votingTimerInterval = this.gameHandler.startSmartTimer(timeLeft, (remaining) => {
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
                this.gameHandler.replayDrawing(ctx, res.drawing);
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

    handleCreativePlayerChose(userId) {
        if (this.creativeWordChoiceStatus) {
            this.creativeWordChoiceStatus[userId] = true;
            this.updateCreativeWaitingModal();
        }
        
        const player = this.playerListManager.getPlayer(userId);
        if (player && userId !== socket.id) {
            showToast(`${player.username} a choisi son mot !`, 'info');
        }
    }

    handleCreativeWordChoiceStart(data) {
        const timeout = data.duration || 30;
        
        // Ensure other modals are closed
        const waitingModal = document.getElementById('word-choice-waiting-modal');
        if (waitingModal) waitingModal.classList.add('hidden');
        roundResultOverlay.classList.add('hidden');
        
        if (customWordInput) {
            customWordInput.value = '';
            customWordInput.maxLength = 20;
            customWordInput.style.display = 'block'; // Reset display
            customWordInput.focus();
        }
        
        if (btnSubmitCustomWord) btnSubmitCustomWord.style.display = 'inline-block'; // Reset display
        if (btnRandomCustomWord) btnRandomCustomWord.style.display = 'inline-block'; // Reset display

        // Update Modal Content for Creative Mode
        const title = document.getElementById('custom-word-title');
        const help = document.getElementById('custom-word-help');
        if (title) title.textContent = "Proposez un thème pour le dessin !";
        if (help) help.textContent = "Votre mot sera ajouté à la roulette.";

        if (wordDisplay) {
            wordDisplay.textContent = 'Choisissez un mot pour le thème !';
            wordDisplay.classList.add('choosing-word');
        }
        
        // Initialize Waiting Modal State
        this.creativeWordChoiceStatus = {}; // userId -> boolean
        const players = this.playerListManager.getPlayerList();
        players.forEach(p => this.creativeWordChoiceStatus[p.id] = false);
        
        if (customWordTimerVal) {
            customWordTimerVal.textContent = timeout;
            
            if (this.gameHandler.wordChoiceTimerInterval) clearInterval(this.gameHandler.wordChoiceTimerInterval);
            this.gameHandler.wordChoiceTimerInterval = this.gameHandler.startSmartTimer(timeout, (remaining) => {
                customWordTimerVal.textContent = remaining;
                // Update waiting modal timer too
                const waitingTimer = document.getElementById('word-waiting-timer-val');
                if (waitingTimer) waitingTimer.textContent = remaining;
            }, () => {
                 if (customWordInput && customWordInput.value.trim().length > 0) {
                    const word = customWordInput.value.trim();
                    socket.emit('creativeWordChoice', { roomCode: state.currentRoom, word });
                    this.showCreativeWaitingModal();
                }
            });
        }
        
        customWordModal.classList.remove('hidden');
    }

    showCreativeWaitingModal() {
        customWordModal.classList.add('hidden');
        const modal = document.getElementById('word-choice-waiting-modal');
        if (modal) {
            modal.classList.remove('hidden');
            this.updateCreativeWaitingModal();
        }
    }

    updateCreativeWaitingModal() {
        const modal = document.getElementById('word-choice-waiting-modal');
        if (!modal || modal.classList.contains('hidden')) return;

        const countVal = document.getElementById('word-waiting-count-val');
        const totalVal = document.getElementById('word-waiting-total-val');
        const list = document.getElementById('word-waiting-players-list');
        
        const players = this.playerListManager.getPlayerList();
        const total = players.length;
        const ready = players.filter(p => this.creativeWordChoiceStatus[p.id]).length;
        
        if (countVal) countVal.textContent = ready;
        if (totalVal) totalVal.textContent = total;
        
        if (list) {
            list.innerHTML = '';
            players.forEach(user => {
                const hasChosen = this.creativeWordChoiceStatus[user.id];
                
                const chip = document.createElement('div');
                chip.className = `ready-player-chip ${hasChosen ? 'is-ready' : 'not-ready'}`;
                
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
                        <i class="fas fa-spinner fa-spin status-waiting" ${hasChosen ? 'style="display:none"' : ''}></i>
                        <i class="fas fa-check status-ready" ${hasChosen ? '' : 'style="display:none"'}></i>
                    </div>
                `;
                list.appendChild(chip);
            });
        }
    }

    handleCreativeRouletteStart(data) {
        customWordModal.classList.add('hidden');
        const waitingModal = document.getElementById('word-choice-waiting-modal');
        if (waitingModal) waitingModal.classList.add('hidden');

        if (this.gameHandler.wordChoiceTimerInterval) clearInterval(this.gameHandler.wordChoiceTimerInterval);
        
        // Show Roulette Modal
        const rouletteModal = document.getElementById('roulette-modal');
        const strip = document.getElementById('roulette-strip');
        
        if (rouletteModal && strip) {
            rouletteModal.classList.remove('hidden');
            
            // Prepare Strip
            const words = data.words;
            const winner = data.winner;
            
            // Generate a sequence for the strip
            strip.innerHTML = '';
            const sequence = [];
            // Add some initial padding
            for(let i=0; i<5; i++) sequence.push(words[Math.floor(Math.random() * words.length)]);
            
            // Add many random words
            for(let i=0; i<40; i++) {
                sequence.push(words[Math.floor(Math.random() * words.length)]);
            }
            sequence.push(winner); // The winner is the last one
            
            sequence.forEach(word => {
                const item = document.createElement('div');
                item.className = 'roulette-item';
                item.textContent = word;
                strip.appendChild(item);
            });
            
            // Reset Position
            strip.style.transition = 'none';
            strip.style.transform = 'translateY(0)';
            
            // Force Reflow
            strip.offsetHeight;
            
            // Animate
            const itemHeight = 120;
            const targetY = - (sequence.length - 1) * itemHeight;
            const duration = data.duration || 5; // seconds
            
            // Play sound effect loop
            const tickInterval = setInterval(() => {
                 // Simple tick sound simulation or use existing
                 // playTickSound(); // Might be too annoying if too fast
            }, 200);

            setTimeout(() => {
                strip.style.transition = `transform ${duration}s cubic-bezier(0.1, 0.7, 0.1, 1)`;
                strip.style.transform = `translateY(${targetY}px)`;
            }, 100);
            
            // End of animation
            setTimeout(() => {
                clearInterval(tickInterval);
                playTickSound();
                
                // Highlight winner
                const winnerItem = strip.lastElementChild;
                if (winnerItem) {
                    winnerItem.style.color = '#f1c40f';
                    winnerItem.style.textShadow = '0 0 20px #f1c40f';
                    winnerItem.style.transform = 'scale(1.2)';
                    winnerItem.style.transition = 'all 0.3s';
                }
                
                // Close modal after delay
                setTimeout(() => {
                    rouletteModal.classList.add('hidden');
                }, 3000);
            }, duration * 1000);
        } else {
            // Fallback
            gameTopBar.classList.remove('hidden');
            if (wordDisplay) wordDisplay.classList.add('choosing-word');
            
            const words = data.words;
            const winner = data.winner;
            const duration = data.duration * 1000;
            const startTime = Date.now();
            
            const interval = setInterval(() => {
                const elapsed = Date.now() - startTime;
                if (elapsed >= duration) {
                    clearInterval(interval);
                    if (wordDisplay) {
                        wordDisplay.textContent = winner;
                        wordDisplay.style.color = 'var(--success)';
                        wordDisplay.style.transform = 'scale(1.5)';
                    }
                    playTickSound();
                } else {
                    const randomWord = words[Math.floor(Math.random() * words.length)];
                    if (wordDisplay) wordDisplay.textContent = randomWord;
                }
            }, 100);
        }
    }

    handleCreativePause(data) {
        if (wordDisplay) {
            wordDisplay.textContent = data.word;
            wordDisplay.style.color = 'var(--success)';
        }
        
        showToast(`Le thème est : ${data.word} ! Préparez-vous...`, 'info');
        
        if (timerValue) timerValue.textContent = data.duration;
        
        if (this.gameHandler.currentTimerInterval) clearInterval(this.gameHandler.currentTimerInterval);
        this.gameHandler.currentTimerInterval = this.gameHandler.startSmartTimer(data.duration, (remaining) => {
            if (timerValue) timerValue.textContent = remaining;
        });
    }
}
