export function initPlayerList(socket, playersListElement, onKickRequest) {
    let currentUsers = [];
    let currentLeaderId = null;
    let currentScores = {};
    let currentDrawerId = null;
    let currentTurnOrder = [];
    let currentGameState = 'LOBBY';
    let currentRoomCode = null;
    let currentMaxPlayers = 8; // Default

    function render() {
        updatePlayerCount();
        playersListElement.innerHTML = '';
        // Sort by score descending if scores exist, but spectators always last
        const sortedUsers = [...currentUsers].sort((a, b) => {
            // Spectators go to the bottom
            if (a.isSpectator && !b.isSpectator) return 1;
            if (!a.isSpectator && b.isSpectator) return -1;

            const scoreA = currentScores[a.id] || 0;
            const scoreB = currentScores[b.id] || 0;
            return scoreB - scoreA;
        });

        sortedUsers.forEach(u => {
            const div = document.createElement('div');
            div.className = 'player-card';
            if (u.isSpectator) {
                div.classList.add('is-spectator');
                div.style.opacity = '0.7';
            }
            if (u.id === currentDrawerId) {
                div.classList.add('is-drawing');
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

            const isLeader = u.id === currentLeaderId;
            const leaderIcon = isLeader ? '<i class="fas fa-crown leader-crown"></i>' : '';
            const drawerIcon = u.id === currentDrawerId ? '<i class="fas fa-pencil-alt drawing-icon" style="margin-left:5px; color:var(--accent);"></i>' : '';
            const spectatorIcon = u.isSpectator ? '<i class="fas fa-eye" style="margin-left:5px; color:var(--text-dim);" title="Observateur"></i>' : '';
            const score = currentScores[u.id] !== undefined && !u.isSpectator ? `<div class="player-score">${currentScores[u.id]} pts</div>` : '';

            // Turn Order Badge (only for non-spectators)
            let turnOrderBadge = '';
            if (!u.isSpectator && currentTurnOrder && currentTurnOrder.length > 0) {
                const index = currentTurnOrder.indexOf(u.id);
                if (index !== -1) {
                    turnOrderBadge = `<span style="font-size: 0.7rem; background: rgba(255,255,255,0.1); padding: 2px 5px; border-radius: 4px; margin-right: 5px; color: var(--text-dim);">#${index + 1}</span>`;
                }
            }

            // Switch Role Button Logic
            let switchRoleBtn = '';
            // Show button if: It's me, I'm NOT the leader, and we are in LOBBY
            if (u.id === socket.id && u.id !== currentLeaderId && currentGameState === 'LOBBY') {
                const icon = u.isSpectator ? 'fa-user-plus' : 'fa-eye';
                const title = u.isSpectator ? 'Devenir Joueur' : 'Devenir Observateur';
                switchRoleBtn = `
                    <button class="switch-role-btn secondary small-btn" title="${title}" style="margin-left: 5px; padding: 2px 6px; font-size: 0.8rem;">
                        <i class="fas ${icon}"></i>
                    </button>
                `;
            }

            // Kick Button Logic
            let kickBtn = '';
            if (socket.id === currentLeaderId && u.id !== socket.id) {
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
                        if (currentRoomCode) {
                            socket.emit('switchRole', currentRoomCode);
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
                        if (onKickRequest) {
                            onKickRequest(u.id, u.username);
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

            playersListElement.appendChild(div);
        });
    }

    function updatePlayerCount() {
        const countDisplay = document.getElementById('player-count-display');
        if (countDisplay) {
            // Count only active players (not spectators) for the limit check, 
            // but usually we want to show total connected or active/max.
            // Based on user request "nombre de joueurs actuel / Max", usually implies active players vs limit.
            const activePlayers = currentUsers.filter(u => !u.isSpectator).length;
            countDisplay.textContent = `(${activePlayers}/${currentMaxPlayers})`;
        }
    }

    socket.on('userJoined', (data) => {
        if (Array.isArray(data)) {
            currentUsers = data;
        } else {
            currentUsers = data.users;
            currentLeaderId = data.leaderId;
            if (data.maxPlayers) currentMaxPlayers = data.maxPlayers;
        }
        render();
    });

    socket.on('userLeft', (data) => {
        if (Array.isArray(data)) {
            currentUsers = data;
        } else {
            currentUsers = data.users;
            currentLeaderId = data.leaderId;
        }
        render();
        updatePlayerCount();
    });

    socket.on('scoreUpdate', (scores) => {
        currentScores = scores;
        render();
    });

    socket.on('turnStart', (data) => {
        currentDrawerId = data.drawerId;
        render();
    });
    
    socket.on('gameStarted', (data) => {
        currentScores = data.scores;
        currentTurnOrder = data.turnOrder;
        render();
    });
    
    socket.on('gameEnded', () => {
        currentDrawerId = null;
        currentTurnOrder = [];
        currentScores = {};
        render();
    });
    
    socket.on('roomJoined', (data) => {
        currentUsers = data.users;
        currentLeaderId = data.leaderId;
        if (data.roomCode) currentRoomCode = data.roomCode;
        if (data.gameState) currentGameState = data.gameState;
        if (data.maxPlayers) currentMaxPlayers = data.maxPlayers;
        
        // If joining mid-game, we might need scores, but usually roomJoined sends basic info.
        // Ideally roomJoined should send scores too.
        if (data.game) {
            if (data.game.scores) currentScores = data.game.scores;
            if (data.game.turnOrder) currentTurnOrder = data.game.turnOrder;
        }
        render();
        updatePlayerCount();
    });

    socket.on('gameStateChanged', (state) => {
        currentGameState = state;
        render();
    });

    return {
        updatePlayerList: (users, leaderId, gameState, roomCode) => {
            currentUsers = users;
            currentLeaderId = leaderId;
            if (gameState) currentGameState = gameState;
            if (roomCode) currentRoomCode = roomCode;
            render();
            updatePlayerCount();
        },
        getPlayerList: () => {
            return currentUsers;
        },
        getPlayer: (id) => {
            return currentUsers.find(u => u.id === id);
        },
        getPlayerByUsername: (username) => {
            return currentUsers.find(u => u.username === username);
        },
        getPlayerCount: () => {
            return currentUsers.length;
        }
    };
}
