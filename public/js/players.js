export function initPlayerList(socket, playersListElement, onKickRequest) {
    let currentUsers = [];
    let currentLeaderId = null;
    let currentScores = {};
    let currentDrawerId = null;
    let currentTurnOrder = [];

    function render() {
        playersListElement.innerHTML = '';
        // Sort by score descending if scores exist
        const sortedUsers = [...currentUsers].sort((a, b) => {
            const scoreA = currentScores[a.id] || 0;
            const scoreB = currentScores[b.id] || 0;
            return scoreB - scoreA;
        });

        sortedUsers.forEach(u => {
            const div = document.createElement('div');
            div.className = 'player-card';
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
            const score = currentScores[u.id] !== undefined ? `<div class="player-score">${currentScores[u.id]} pts</div>` : '';

            // Turn Order Badge
            let turnOrderBadge = '';
            if (currentTurnOrder && currentTurnOrder.length > 0) {
                const index = currentTurnOrder.indexOf(u.id);
                if (index !== -1) {
                    turnOrderBadge = `<span style="font-size: 0.7rem; background: rgba(255,255,255,0.1); padding: 2px 5px; border-radius: 4px; margin-right: 5px; color: var(--text-dim);">#${index + 1}</span>`;
                }
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
                    <div class="player-name" style="font-weight:bold;">${leaderIcon}${u.username} ${drawerIcon}</div>
                    ${score}
                </div>
                ${kickBtn}
            `;
            
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

            playersListElement.appendChild(div);
        });
    }

    socket.on('userJoined', (data) => {
        if (Array.isArray(data)) {
            currentUsers = data;
        } else {
            currentUsers = data.users;
            currentLeaderId = data.leaderId;
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
        // If joining mid-game, we might need scores, but usually roomJoined sends basic info.
        // Ideally roomJoined should send scores too.
        if (data.game) {
            if (data.game.scores) currentScores = data.game.scores;
            if (data.game.turnOrder) currentTurnOrder = data.game.turnOrder;
        }
        render();
    });

    return {
        updatePlayerList: (users, leaderId) => {
            currentUsers = users;
            currentLeaderId = leaderId;
            render();
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
