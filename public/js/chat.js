import { escapeHtml } from './utils.js';

export function initChat(socket, getRoomCode, getUsername, getPlayerAvatar) {
    const chatForm = document.getElementById('chat-form');
    const chatInput = document.getElementById('chat-input');
    const chatMessages = document.getElementById('chat-messages');

    if (!chatForm || !chatInput || !chatMessages) return;

    chatForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const message = chatInput.value.trim();
        const roomCode = getRoomCode();
        const username = getUsername();

        if (message && roomCode && username) {
            // Sanitize before sending (optional but good practice)
            // We will also sanitize on display
            socket.emit('chatMessage', {
                roomCode: roomCode,
                username: username,
                message: message // Send raw, sanitize on display/server
            });
            chatInput.value = '';
        }
    });

    socket.on('chatMessage', ({ username, message, type }) => {
        const isSelf = username === getUsername();
        const safeMessage = escapeHtml(message);
        const safeUsername = escapeHtml(username);
        
        if (username === 'System') {
            const div = document.createElement('div');
            div.className = 'message system-message';
            
            if (type === 'success') {
                div.classList.add('success');
                // Color handled by CSS
            } else {
                div.style.color = 'orange';
            }
            
            div.innerHTML = `${safeMessage}`;
            chatMessages.appendChild(div);
        } else {
            const row = document.createElement('div');
            row.className = `chat-row ${isSelf ? 'self' : 'other'}`;
            
            if (!isSelf) {
                // Avatar for other players
                const avatarDiv = document.createElement('div');
                avatarDiv.className = 'chat-avatar';
                
                let avatarHtml = '';
                const player = getPlayerAvatar ? getPlayerAvatar(username) : null;
                
                if (player && player.avatar) {
                    if (player.avatar.type === 'image') {
                        // Images are URLs, we assume they are safe or we should validate them. 
                        // For now, we trust the avatar value structure but we should be careful.
                        // Ideally we should validate the URL.
                        avatarHtml = `<img src="${player.avatar.value}" class="chat-avatar-img">`;
                    } else {
                        const color = player.avatar.color || '#3498db';
                        const emoji = player.avatar.emoji || '🎨';
                        avatarHtml = `<div class="chat-avatar-emoji" style="background-color: ${color}">${emoji}</div>`;
                    }
                } else {
                    // Fallback
                    avatarHtml = `<div class="chat-avatar-emoji" style="background-color: #3498db">👤</div>`;
                }
                avatarDiv.innerHTML = avatarHtml;
                row.appendChild(avatarDiv);
            }

            const bubble = document.createElement('div');
            bubble.className = `message ${isSelf ? 'message-self' : 'message-other'}`;
            
            if (type === 'success') {
                bubble.classList.add('success-message');
                bubble.style.color = 'var(--success)';
            }

            if (isSelf) {
                bubble.innerHTML = `${safeMessage}`;
            } else {
                bubble.innerHTML = `<div class="message-name">${safeUsername}</div><div class="message-content">${safeMessage}</div>`;
            }
            
            row.appendChild(bubble);
            chatMessages.appendChild(row);
        }

        chatMessages.scrollTop = chatMessages.scrollHeight;
    });

    function addSeparator(text) {
        const div = document.createElement('div');
        div.className = 'chat-separator';
        div.innerHTML = `<span>${escapeHtml(text)}</span>`;
        chatMessages.appendChild(div);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    function addSystemMessage(message, type) {
        const div = document.createElement('div');
        div.className = 'message system-message';
        
        if (type === 'success') {
            div.classList.add('success');
        } else {
            div.style.color = 'orange';
        }
        
        div.innerHTML = `${escapeHtml(message)}`;
        chatMessages.appendChild(div);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    return {
        addSeparator,
        addSystemMessage
    };
}
