import { socket, gameTopBar, wordDisplay, roundCurrent, roundTotal, drawerNameDisplay, timerValue } from '../../dom-elements.js';
import { state } from '../../state.js';
import { showToast, playTickSound } from '../../utils.js';
import { CANVAS_CONFIG } from '../../config.js';

export class TelephoneGameHandler {
    constructor(gameHandler, managers) {
        this.gameHandler = gameHandler;
        this.managers = managers;
        this.playerListManager = managers.playerListManager;
        this.layerManager = managers.layerManager;
        this.cursorManager = managers.cursorManager;
        
        this.telephoneStatus = {};
        this.telephoneRecapData = null;
        this.recapProgress = { storyIndex: 0, stepIndex: 0 };
        this.activeRecapTab = 0;
    }

    handleTelephoneRoundStart(data) {
        // Hide previous overlays
        const overlay = document.getElementById('telephone-write-overlay');
        const contentWrapper = document.getElementById('telephone-content-wrapper');
        const waitingMsg = document.getElementById('telephone-waiting-msg');
        const waitingModal = document.getElementById('telephone-waiting-modal');
        
        overlay.classList.add('hidden');
        document.getElementById('telephone-guess-overlay')?.classList.add('hidden'); // Cleanup if exists
        if (waitingModal) waitingModal.classList.add('hidden');
        gameTopBar.classList.remove('hidden');
        
        // Reset Telephone Status
        this.telephoneStatus = {};
        const players = this.playerListManager.getPlayerList();
        players.forEach(p => this.telephoneStatus[p.id] = false);
        
        // Hide Drawer Name Display in Telephone Mode
        if (drawerNameDisplay) drawerNameDisplay.classList.add('hidden');

        // Update Top Bar
        roundCurrent.textContent = data.round;
        roundTotal.textContent = data.totalRounds;
        if (timerValue) timerValue.textContent = data.duration;

        // Start Timer
        if (this.gameHandler.currentTimerInterval) clearInterval(this.gameHandler.currentTimerInterval);
        const telephoneTimerVal = document.getElementById('telephone-timer-val');
        
        this.gameHandler.currentTimerInterval = this.gameHandler.startSmartTimer(data.duration, (remaining) => {
            if (timerValue) timerValue.textContent = remaining;
            if (telephoneTimerVal) telephoneTimerVal.textContent = remaining;
            
            // Update waiting modal timer too
            const waitingModalTimer = document.getElementById('telephone-waiting-timer-val');
            if (waitingModalTimer) waitingModalTimer.textContent = remaining;
            
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
                    wordDisplay.classList.add('choosing-word');
                    wordDisplay.style.color = '';
                }
            }
            return;
        }

        // Reset Waiting State
        contentWrapper.classList.remove('hidden');
        waitingMsg.classList.add('hidden');

        const submitResponse = () => {
            if (data.phase === 'WRITING') {
                const input = document.getElementById('telephone-input');
                const text = input.value.trim() || '...'; // Default if empty
                socket.emit('telephoneSubmit', { roomCode: state.currentRoom, content: text });
                contentWrapper.classList.add('hidden');
                // waitingMsg.classList.remove('hidden'); // OLD
                this.showTelephoneWaitingModal(); // NEW
            } else {
                try {
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
                    // waitingMsg.classList.remove('hidden'); // OLD
                    this.showTelephoneWaitingModal(); // NEW
                } catch (e) {
                    console.error("Error submitting drawing:", e);
                    showToast("Erreur lors de l'envoi du dessin", 'error');
                }
            }
            
            // Mark self as ready locally
            if (this.telephoneStatus) {
                this.telephoneStatus[socket.id] = true;
                this.updateTelephoneWaitingModal();
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
                    this.gameHandler.replayDrawing(ctx, data.previousStep.content);
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
                    // waitingMsg.classList.remove('hidden'); // OLD
                    this.showTelephoneWaitingModal(); // NEW
                    
                    // Mark self as ready locally
                    if (this.telephoneStatus) {
                        this.telephoneStatus[socket.id] = true;
                        this.updateTelephoneWaitingModal();
                    }
                } else {
                    showToast('Écrivez quelque chose !', 'error');
                }
            };


        } else {
            // DRAWING PHASE
            // Show Drawing UI (normal game UI) but with prompt
            
            // Ensure wordDisplay is visible and updated
            if (wordDisplay) {
                const content = (data.previousStep && data.previousStep.content) ? data.previousStep.content : "Erreur: Phrase manquante";
                wordDisplay.textContent = content; // The text to draw
                wordDisplay.style.color = ''; // Let CSS handle color (white for choosing-word)
                wordDisplay.classList.add('choosing-word'); // Use choosing style for better visibility
            }
            
            const toastContent = (data.previousStep && data.previousStep.content) ? data.previousStep.content : "Erreur";
            showToast(`À vous de dessiner : ${toastContent}`, 'info');

            // Hide finish button if it exists (user requested removal)
            const finishBtn = document.getElementById('btn-telephone-finish-draw');
            if (finishBtn) finishBtn.classList.add('hidden');
        }

        // Reset Layers if Drawing Phase
        if (data.phase !== 'WRITING') {
            try {
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
            } catch (e) {
                console.error("Error resetting layers in Telephone mode:", e);
                showToast("Erreur lors de l'initialisation des calques", 'error');
            }
        }
    }

    handleTelephonePlayerFinished(userId) {
        if (!this.telephoneStatus) this.telephoneStatus = {};
        this.telephoneStatus[userId] = true;
        this.updateTelephoneWaitingModal();
        
        const player = this.playerListManager.getPlayer(userId);
        if (player && userId !== socket.id) {
            showToast(`${player.username} a terminé son tour !`, 'info');
        }
    }

    showTelephoneWaitingModal() {
        const modal = document.getElementById('telephone-waiting-modal');
        if (modal) {
            modal.classList.remove('hidden');
            this.updateTelephoneWaitingModal();
        }
    }

    updateTelephoneWaitingModal() {
        const modal = document.getElementById('telephone-waiting-modal');
        if (!modal || modal.classList.contains('hidden')) return;

        const countVal = document.getElementById('telephone-waiting-count-val');
        const totalVal = document.getElementById('telephone-waiting-total-val');
        const list = document.getElementById('telephone-waiting-players-list');
        
        const players = this.playerListManager.getPlayerList();
        const total = players.length;
        const ready = players.filter(p => this.telephoneStatus && this.telephoneStatus[p.id]).length;
        
        if (countVal) countVal.textContent = ready;
        if (totalVal) totalVal.textContent = total;
        
        if (list) {
            list.innerHTML = '';
            players.forEach(user => {
                const hasFinished = this.telephoneStatus && this.telephoneStatus[user.id];
                
                const chip = document.createElement('div');
                chip.className = `ready-player-chip ${hasFinished ? 'is-ready' : 'not-ready'}`;
                
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
                        <i class="fas fa-spinner fa-spin status-waiting" ${hasFinished ? 'style="display:none"' : ''}></i>
                        <i class="fas fa-check status-ready" ${hasFinished ? '' : 'style="display:none"'}></i>
                    </div>
                `;
                list.appendChild(chip);
            });
        }
    }

    handleTelephoneRoundEnd() {
        // Just a transition state, maybe show a spinner
        if (this.gameHandler.currentTimerInterval) clearInterval(this.gameHandler.currentTimerInterval);
        
        const waitingModal = document.getElementById('telephone-waiting-modal');
        if (waitingModal) waitingModal.classList.add('hidden');
    }

    handleTelephoneGameEnded(data) {
        // Show Recap
        document.getElementById('telephone-write-overlay').classList.add('hidden');
        const waitingModal = document.getElementById('telephone-waiting-modal');
        if (waitingModal) waitingModal.classList.add('hidden');

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
