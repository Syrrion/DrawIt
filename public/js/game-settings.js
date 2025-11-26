import { showToast } from './utils.js';

export function initGameSettings(socket, isLeaderFn, getRoomCode, getPlayerCount) {
    // Modal & Controls
    const modal = document.getElementById('lobby-settings-modal');
    const btnOpen = document.getElementById('btn-open-settings');
    const btnClose = document.getElementById('btn-close-settings');
    const lobbyControls = document.getElementById('lobby-controls');
    
    // Settings Inputs
    const cards = document.querySelectorAll('.gamemode-card');
    const timeInput = document.getElementById('setting-drawtime');
    const wordChoiceTimeInput = document.getElementById('setting-wordchoicetime');
    const wordChoicesInput = document.getElementById('setting-wordchoices');
    const roundsInput = document.getElementById('setting-rounds');
    const guessWordSettings = document.getElementById('settings-guess-word');
    
    // Actions
    const startBtn = document.getElementById('btn-start-game');
    const waitingMsg = document.getElementById('waiting-message');

    if (!modal) return;

    let currentMode = 'guess-word';

    // --- UI Helpers ---

    function openModal() {
        modal.classList.remove('hidden');
    }

    function closeModal() {
        modal.classList.add('hidden');
    }

    function selectCard(mode) {
        cards.forEach(card => {
            if (card.dataset.mode === mode) {
                card.classList.add('selected');
            } else {
                card.classList.remove('selected');
            }
        });
        
        currentMode = mode;
        
        if (mode === 'guess-word') {
            guessWordSettings.classList.remove('hidden');
        }
    }

    // --- State Management ---

    function updateControlsState() {
        const isLeader = isLeaderFn();
        const disabled = !isLeader;

        // Inputs
        timeInput.disabled = disabled;
        wordChoiceTimeInput.disabled = disabled;
        wordChoicesInput.disabled = disabled;
        roundsInput.disabled = disabled;
        
        // Cards interaction
        cards.forEach(card => {
            card.style.pointerEvents = isLeader ? 'auto' : 'none';
            card.style.opacity = isLeader ? '1' : '0.7';
        });

        // Buttons visibility
        if (isLeader) {
            btnOpen.classList.remove('hidden');
            waitingMsg.classList.add('hidden');
            startBtn.classList.remove('hidden'); // Inside modal
        } else {
            btnOpen.classList.add('hidden');
            waitingMsg.classList.remove('hidden');
            startBtn.classList.add('hidden'); // Inside modal
        }
    }

    function emitSettingsUpdate() {
        if (!isLeaderFn()) return;
        const settings = {
            mode: currentMode,
            drawTime: parseInt(timeInput.value),
            wordChoiceTime: parseInt(wordChoiceTimeInput.value),
            wordChoices: parseInt(wordChoicesInput.value),
            rounds: parseInt(roundsInput.value)
        };

        socket.emit('updateSettings', {
            roomCode: getRoomCode(),
            settings
        });
    }

    // --- Event Listeners ---

    // Modal Triggers
    if (btnOpen) btnOpen.addEventListener('click', openModal);
    if (btnClose) btnClose.addEventListener('click', closeModal);

    // Game Mode Cards
    cards.forEach(card => {
        card.addEventListener('click', () => {
            if (!isLeaderFn()) return;
            const mode = card.dataset.mode;
            selectCard(mode);
            emitSettingsUpdate();
        });
    });
    // Inputs
    timeInput.addEventListener('change', emitSettingsUpdate);
    wordChoiceTimeInput.addEventListener('change', emitSettingsUpdate);
    wordChoicesInput.addEventListener('change', emitSettingsUpdate);
    roundsInput.addEventListener('change', emitSettingsUpdate);

    // Start Game
    startBtn.addEventListener('click', () => {
        if (!isLeaderFn()) return;
        
        if (getPlayerCount && getPlayerCount() < 2) {
            showToast('Il faut au moins 2 joueurs pour lancer la partie !', 'error');
            return;
        }

        socket.emit('startGame', getRoomCode());
        closeModal();
    });

    // Socket Listeners
    socket.on('roomSettingsUpdated', (settings) => {
        if (currentMode !== settings.mode) {
            selectCard(settings.mode);
        }
        if (timeInput.value != settings.drawTime) timeInput.value = settings.drawTime;
        if (wordChoiceTimeInput.value != settings.wordChoiceTime) wordChoiceTimeInput.value = settings.wordChoiceTime;
        if (wordChoicesInput.value != settings.wordChoices) wordChoicesInput.value = settings.wordChoices;
        if (roundsInput.value != settings.rounds) roundsInput.value = settings.rounds;
    });

    socket.on('gameStateChanged', (state) => {
        if (state === 'LOBBY') {
            lobbyControls.classList.remove('hidden');
        } else {
            lobbyControls.classList.add('hidden');
            closeModal();
        }
    });

    return {
        updateControlsState,
        show: () => lobbyControls.classList.remove('hidden'),
        hide: () => lobbyControls.classList.add('hidden')
    };
}
