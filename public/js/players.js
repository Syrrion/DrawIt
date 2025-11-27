export class PlayerListManager {
    constructor(socket, playersListElement, onKickRequest) {
        this.socket = socket;
        this.playersListElement = playersListElement;
        this.onKickRequest = onKickRequest;

        this.currentUsers = [];
        this.currentLeaderId = null;
        this.currentScores = {};
        this.currentDrawerId = null;
        this.currentTurnOrder = [];
        this.currentGameState = 'LOBBY';
        this.currentRoomCode = null;
        this.currentMaxPlayers = 8; // Default
        this.currentGuessedPlayers = [];
        this.lastSwitchRoleTime = 0;

        // Sound Effect
        this.successAudio = new Audio();
        
        this.init();
    }

    init() {
        this.socket.on('userJoined', (data) => this.handleUserJoined(data));
        this.socket.on('userLeft', (data) => this.handleUserLeft(data));
        this.socket.on('scoreUpdate', (scores) => this.handleScoreUpdate(scores));
        this.socket.on('playerGuessed', (playerId) => this.handlePlayerGuessed(playerId));
        this.socket.on('turnStart', (data) => this.handleTurnStart(data));
        this.socket.on('gameStarted', (data) => this.handleGameStarted(data));
        this.socket.on('gameEnded', () => this.handleGameEnded());
        this.socket.on('roomJoined', (data) => this.handleRoomJoined(data));
        this.socket.on('gameStateChanged', (state) => this.handleGameStateChanged(state));
    }

    playSuccessSound() {
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (!AudioContext) return;
            
            const ctx = new AudioContext();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();

            osc.connect(gain);
            gain.connect(ctx.destination);

            osc.type = 'sine';
            osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
            osc.frequency.exponentialRampToValueAtTime(1046.5, ctx.currentTime + 0.1); // C6

            gain.gain.setValueAtTime(0.3, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);

            osc.start();
            osc.stop(ctx.currentTime + 0.5);
        } catch (e) {
            console.error("Audio play failed", e);
        }
    }

    render() {
        this.updatePlayerCount();
        this.playersListElement.innerHTML = '';
        // Sort by score descending if scores exist, but spectators always last
        const sortedUsers = [...this.currentUsers].sort((a, b) => {
            // Spectators go to the bottom
            if (a.isSpectator && !b.isSpectator) return 1;
            if (!a.isSpectator && b.isSpectator) return -1;

            const scoreA = this.currentScores[a.id] || 0;
            const scoreB = this.currentScores[b.id] || 0;
            return scoreB - scoreA;
        });

        sortedUsers.forEach(u => {
            const div = document.createElement('div');
            div.className = 'player-card';
            if (u.isSpectator) {
                div.classList.add('is-spectator');
                div.style.opacity = '0.7';
            }
            if (u.id === this.currentDrawerId) {
                div.classList.add('is-drawing');
            }
            if (this.currentGuessedPlayers.includes(u.id)) {
                div.classList.add('has-guessed');
            }
            
            let avatarHtml = '';
            if (u.avatar && u.avatar.type === 'image') {
                avatarHtml = `<img src="${u.avatar.value}" class="player-avatar-img">`;
            } else {
                const color = (u.avatar && u.avatar.color) || '#3498db';
                const emoji = (u.avatar && u.avatar.emoji) || '🎨';
                avatarHtml = `
                    <div class="player-avatar" style="background-color: ${color}">
                        ${emoji}
                    </div>`;
            }

            const isLeader = u.id === this.currentLeaderId;
            const leaderIcon = isLeader ? '<i class="fas fa-crown leader-crown"></i>' : '';
            const drawerIcon = u.id === this.currentDrawerId ? '<i class="fas fa-pencil-alt drawing-icon" style="margin-left:5px; color:var(--accent);"></i>' : '';
            const spectatorIcon = u.isSpectator ? '<i class="fas fa-eye" style="margin-left:5px; color:var(--text-dim);" title="Observateur"></i>' : '';
            const score = this.currentScores[u.id] !== undefined && !u.isSpectator ? `<div class="player-score">${this.currentScores[u.id]} pts</div>` : '';

            // Turn Order Badge (only for non-spectators)
            let turnOrderBadge = '';
            if (!u.isSpectator && this.currentTurnOrder && this.currentTurnOrder.length > 0) {
                const index = this.currentTurnOrder.indexOf(u.id);
                if (index !== -1) {
                    turnOrderBadge = `<span style="font-size: 0.7rem; background: rgba(255,255,255,0.1); padding: 2px 5px; border-radius: 4px; margin-right: 5px; color: var(--text-dim);">#${index + 1}</span>`;
                }
            }

            // Switch Role Button Logic
            let switchRoleBtn = '';
            // Show button if: It's me, I'm NOT the leader, and we are in LOBBY
            if (u.id === this.socket.id && u.id !== this.currentLeaderId && this.currentGameState === 'LOBBY') {
                const icon = u.isSpectator ? 'fa-user-plus' : 'fa-eye';
                const title = u.isSpectator ? 'Devenir Joueur' : 'Devenir Observateur';
                
                // Check cooldown
                const now = Date.now();
                const timeSinceLastClick = now - this.lastSwitchRoleTime;
                const isCooldown = timeSinceLastClick < 5000;
                const disabledAttr = isCooldown ? 'disabled' : '';
                const style = isCooldown ? 'margin-left: 5px; padding: 2px 6px; font-size: 0.8rem; opacity: 0.5; cursor: not-allowed;' : 'margin-left: 5px; padding: 2px 6px; font-size: 0.8rem;';

                switchRoleBtn = `
                    <button class="switch-role-btn secondary small-btn" title="${title}" style="${style}" ${disabledAttr}>
                        <i class="fas ${icon}"></i>
                    </button>
                `;
            }

            // Kick Button Logic
            let kickBtn = '';
            if (this.socket.id === this.currentLeaderId && u.id !== this.socket.id) {
                kickBtn = `
                    <button class="kick-btn" title="Expulser le joueur" data-id="${u.id}">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                `;
            }

            div.innerHTML = `
                ${turnOrderBadge}
                ${avatarHtml}
                <div class="player-info" style="flex:1;">
                    <div class="player-name">
                        ${leaderIcon}${u.username} ${drawerIcon} ${spectatorIcon}
                        ${switchRoleBtn}
                    </div>
                    ${score}
                </div>
                ${kickBtn}
            `;
            
            // Add event listener for switch role button
            if (switchRoleBtn) {
                const btn = div.querySelector('.switch-role-btn');
                if (btn) {
                    btn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        
                        // Double check cooldown
                        const now = Date.now();
                        if (now - this.lastSwitchRoleTime < 5000) return;
                        
                        this.lastSwitchRoleTime = now;
                        
                        // Re-render to show disabled state immediately
                        this.render();
                        
                        // Re-enable after 5 seconds
                        setTimeout(() => {
                            this.render();
                        }, 5000);

                        if (this.currentRoomCode) {
                            this.socket.emit('switchRole', this.currentRoomCode);
                        }
                    });
                }
            }

            // Add event listener for kick button
            if (kickBtn) {
                const btn = div.querySelector('.kick-btn');
                if (btn) {
                    btn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        if (this.onKickRequest) {
                            this.onKickRequest(u.id, u.username);
                        }
                    });
                }
            }

            // Avatar Hover Logic
            const avatarEl = div.querySelector('.player-avatar') || div.querySelector('.player-avatar-img');
            if (avatarEl) {
                avatarEl.addEventListener('mouseenter', (e) => {
                    const tooltip = document.getElementById('avatar-tooltip');
                    if (!tooltip) return;

                    // Set content
                    if (u.avatar && u.avatar.type === 'image') {
                        tooltip.innerHTML = `<img src="${u.avatar.value}">`;
                        tooltip.style.backgroundColor = 'transparent';
                    } else {
                        const color = (u.avatar && u.avatar.color) || '#3498db';
                        const emoji = (u.avatar && u.avatar.emoji) || '🎨';
                        tooltip.innerHTML = emoji;
                        tooltip.style.backgroundColor = color;
                    }

                    // Position
                    const rect = avatarEl.getBoundingClientRect();
                    tooltip.style.top = (rect.top + rect.height / 2) + 'px';
                    tooltip.style.left = (rect.right + 10) + 'px';
                    
                    tooltip.classList.remove('hidden');
                });

                avatarEl.addEventListener('mouseleave', () => {
                    const tooltip = document.getElementById('avatar-tooltip');
                    if (tooltip) tooltip.classList.add('hidden');
                });
            }

            this.playersListElement.appendChild(div);
        });
    }

    updatePlayerCount() {
        const countDisplay = document.getElementById('player-count-display');
        if (countDisplay) {
            // Count only active players (not spectators) for the limit check, 
            // but usually we want to show total connected or active/max.
            // Based on user request "nombre de joueurs actuel / Max", usually implies active players vs limit.
            const activePlayers = this.currentUsers.filter(u => !u.isSpectator).length;
            countDisplay.textContent = `(${activePlayers}/${this.currentMaxPlayers})`;
        }
    }

    handleUserJoined(data) {
        if (Array.isArray(data)) {
            this.currentUsers = data;
        } else {
            this.currentUsers = data.users;
            this.currentLeaderId = data.leaderId;
            if (data.maxPlayers) this.currentMaxPlayers = data.maxPlayers;
        }
        this.render();
    }

    handleUserLeft(data) {
        if (Array.isArray(data)) {
            this.currentUsers = data;
        } else {
            this.currentUsers = data.users;
            this.currentLeaderId = data.leaderId;
        }
        this.render();
        this.updatePlayerCount();
    }

    handleScoreUpdate(scores) {
        this.currentScores = scores;
        this.render();
    }

    handlePlayerGuessed(playerId) {
        if (!this.currentGuessedPlayers.includes(playerId)) {
            this.currentGuessedPlayers.push(playerId);
            this.playSuccessSound();
            this.render();
        }
    }

    handleTurnStart(data) {
        this.currentDrawerId = data.drawerId;
        this.currentGuessedPlayers = [];
        this.render();
    }
    
    handleGameStarted(data) {
        this.currentScores = data.scores;
        this.currentTurnOrder = data.turnOrder;
        this.currentGuessedPlayers = [];
        this.render();
    }
    
    handleGameEnded() {
        this.currentDrawerId = null;
        this.currentTurnOrder = [];
        this.currentScores = {};
        this.currentGuessedPlayers = [];
        this.render();
    }
    
    handleRoomJoined(data) {
        this.currentUsers = data.users;
        this.currentLeaderId = data.leaderId;
        if (data.roomCode) this.currentRoomCode = data.roomCode;
        if (data.gameState) this.currentGameState = data.gameState;
        if (data.maxPlayers) this.currentMaxPlayers = data.maxPlayers;
        
        // If joining mid-game, we might need scores, but usually roomJoined sends basic info.
        // Ideally roomJoined should send scores too.
        if (data.game) {
            if (data.game.scores) this.currentScores = data.game.scores;
            if (data.game.turnOrder) this.currentTurnOrder = data.game.turnOrder;
            if (data.game.guessedPlayers) this.currentGuessedPlayers = data.game.guessedPlayers;
        }
        this.render();
        this.updatePlayerCount();
    }

    handleGameStateChanged(state) {
        this.currentGameState = state;
        this.render();
    }

    updatePlayerList(users, leaderId, gameState, roomCode) {
        this.currentUsers = users;
        this.currentLeaderId = leaderId;
        if (gameState) this.currentGameState = gameState;
        if (roomCode) this.currentRoomCode = roomCode;
        this.render();
        this.updatePlayerCount();
    }

    getPlayerList() {
        return this.currentUsers;
    }

    getPlayer(id) {
        return this.currentUsers.find(u => u.id === id);
    }

    getPlayerByUsername(username) {
        return this.currentUsers.find(u => u.username === username);
    }

    getPlayerCount() {
        return this.currentUsers.length;
    }
}
