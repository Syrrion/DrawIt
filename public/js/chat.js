import { escapeHtml } from './utils.js';

export class ChatManager {
    constructor(socket, roomCodeProvider, usernameProvider, playerProvider) {
        this.socket = socket;
        this.roomCodeProvider = roomCodeProvider;
        this.usernameProvider = usernameProvider;
        this.playerProvider = playerProvider;

        this.chatForm = document.getElementById('chat-form');
        this.chatInput = document.getElementById('chat-input');
        this.chatMessages = document.getElementById('chat-messages');

        this.init();
    }

    init() {
        if (!this.chatForm || !this.chatInput || !this.chatMessages) return;

        this.chatForm.addEventListener('submit', (e) => this.handleSubmit(e));

        this.socket.on('chatMessage', (data) => this.handleIncomingMessage(data));
    }

    handleSubmit(e) {
        e.preventDefault();
        const message = this.chatInput.value.trim();
        const roomCode = this.roomCodeProvider();
        const username = this.usernameProvider();

        if (message && roomCode && username) {
            // Sanitize before sending (optional but good practice)
            // We will also sanitize on display
            this.socket.emit('chatMessage', {
                roomCode: roomCode,
                username: username,
                message: message // Send raw, sanitize on display/server
            });
            this.chatInput.value = '';
        }
    }

    handleIncomingMessage({ username, message, type }) {
        const isSelf = username === this.usernameProvider();
        const safeMessage = escapeHtml(message);
        const safeUsername = escapeHtml(username);
        
        if (username === 'System') {
            this.addSystemMessage(message, type);
        } else {
            const row = document.createElement('div');
            row.className = `chat-row ${isSelf ? 'self' : 'other'}`;
            
            if (!isSelf) {
                // Avatar for other players
                const avatarDiv = document.createElement('div');
                avatarDiv.className = 'chat-avatar';
                
                let avatarHtml = '';
                const player = this.playerProvider ? this.playerProvider(username) : null;
                
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
            this.chatMessages.appendChild(row);
        }

        this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
    }

    addSeparator(text) {
        const div = document.createElement('div');
        div.className = 'chat-separator';
        div.innerHTML = `<span>${escapeHtml(text)}</span>`;
        this.chatMessages.appendChild(div);
        this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
    }

    addSystemMessage(message, type) {
        const div = document.createElement('div');
        div.className = 'message system-message';
        
        if (type === 'success') {
            div.classList.add('success');
        } else {
            div.style.color = 'orange';
        }
        
        div.innerHTML = `${escapeHtml(message)}`;
        this.chatMessages.appendChild(div);
        this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
    }
}
