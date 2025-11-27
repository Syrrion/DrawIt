import { showToast } from './utils.js';

export function initGameSettings(socket, isLeaderFn, getRoomCode, getPlayerCount) {
    // Modal & Controls
    const modal = document.getElementById('lobby-settings-modal');
    const btnOpen = document.getElementById('btn-open-settings');
    const btnView = document.getElementById('btn-view-settings');
    const btnClose = document.getElementById('btn-close-settings');
    const lobbyControls = document.getElementById('lobby-controls');
    
    // Settings Inputs
    const cards = document.querySelectorAll('.gamemode-card');
    const timeInput = document.getElementById('setting-drawtime');
    const wordChoiceTimeInput = document.getElementById('setting-wordchoicetime');
    const wordChoicesInput = document.getElementById('setting-wordchoices');
    const roundsInput = document.getElementById('setting-rounds');
    const fuzzyInput = document.getElementById('setting-fuzzy');
    const hintsInput = document.getElementById('setting-hints');
    const maxWordLengthInput = document.getElementById('setting-max-word-length');
    const personalHintsInput = document.getElementById('setting-personal-hints');
    const guessWordSettings = document.getElementById('settings-guess-word');
    
    // Actions
    const startBtn = document.getElementById('btn-start-game');
    const waitingMsg = document.getElementById('waiting-message');

    if (!modal) return;

    let currentMode = 'guess-word';

    // --- UI Helpers ---

    function openModal() {
        modal.classList.remove('hidden');
        if (isLeaderFn()) {
            socket.emit('leaderConfiguring', { roomCode: getRoomCode(), isConfiguring: true });
        }
    }

    function closeModal() {
        modal.classList.add('hidden');
        if (isLeaderFn()) {
            socket.emit('leaderConfiguring', { roomCode: getRoomCode(), isConfiguring: false });
        }
    }

    function selectCard(mode) {
        const cards = document.querySelectorAll('.gamemode-card');
        cards.forEach(card => {
            if (card.dataset.mode === mode) {
                card.classList.add('selected');
            } else {
                card.classList.remove('selected');
            }
        });
        
        currentMode = mode;
        
        // Hide all settings sections first
        const allSettings = document.querySelectorAll('[id^="settings-"]');
        allSettings.forEach(el => el.classList.add('hidden'));

        // Show the selected mode settings
        // For custom-word, we reuse guess-word settings but hide word choices count
        
        let targetId = `settings-${mode}`;
        if (mode === 'custom-word') targetId = 'settings-guess-word'; // Reuse same settings panel

        const targetSettings = document.getElementById(targetId);
        if (targetSettings) {
            targetSettings.classList.remove('hidden');
            
            // Specific adjustments
            if (mode === 'custom-word') {
                if (wordChoicesInput) wordChoicesInput.closest('.setting-group').classList.add('hidden');
                if (maxWordLengthInput) maxWordLengthInput.closest('.setting-group').classList.remove('hidden');
            } else {
                if (wordChoicesInput) wordChoicesInput.closest('.setting-group').classList.remove('hidden');
                if (maxWordLengthInput) maxWordLengthInput.closest('.setting-group').classList.add('hidden');
            }
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
        if (fuzzyInput) fuzzyInput.disabled = disabled;
        if (hintsInput) hintsInput.disabled = disabled;
        if (maxWordLengthInput) maxWordLengthInput.disabled = disabled;
        if (personalHintsInput) personalHintsInput.disabled = disabled;
        
        // Cards interaction
        cards.forEach(card => {
            card.style.pointerEvents = isLeader ? 'auto' : 'none';
            card.style.opacity = isLeader ? '1' : '0.7';
        });

        // Buttons visibility
        if (isLeader) {
            if (btnOpen) btnOpen.classList.remove('hidden');
            if (btnView) btnView.classList.add('hidden');
            waitingMsg.classList.add('hidden');
            startBtn.classList.remove('hidden'); // Inside modal
        } else {
            // Non-leader can see settings but not edit
            if (btnOpen) btnOpen.classList.add('hidden');
            if (btnView) btnView.classList.remove('hidden');
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
            rounds: parseInt(roundsInput.value),
            allowFuzzy: fuzzyInput ? fuzzyInput.checked : false,
            hintsEnabled: hintsInput ? hintsInput.checked : true,
            maxWordLength: maxWordLengthInput ? parseInt(maxWordLengthInput.value) : 20,
            personalHints: personalHintsInput ? parseInt(personalHintsInput.value) : 3
        };

        socket.emit('updateSettings', {
            roomCode: getRoomCode(),
            settings
        });
    }

    let previousHintsEnabled = true;

    function updatePersonalHints() {
        if (!personalHintsInput) return;

        const hintsEnabled = hintsInput ? hintsInput.checked : true;
        const group = personalHintsInput.closest('.setting-group');

        // Visibility Logic (Apply to everyone)
        if (hintsEnabled) {
            group.classList.add('hidden');
        } else {
            group.classList.remove('hidden');
        }

        if (isLeaderFn()) {
            const activePlayers = getPlayerCount ? getPlayerCount() : 0;
            const rounds = parseInt(roundsInput.value) || 3;
            
            // Calculate Max: rounds * 3 + players * 2
            const maxHints = (rounds * 3) + (activePlayers * 2);
            personalHintsInput.max = maxHints;

            if (hintsEnabled) {
                // Automatic hints enabled -> Personal hints = 0
                personalHintsInput.value = 0;
                personalHintsInput.disabled = true;
            } else {
                // Automatic hints disabled
                personalHintsInput.disabled = false;
                
                // If transitioning from Enabled to Disabled, set a default value
                // Default: Players + Rounds (from previous rule)
                if (previousHintsEnabled) {
                    personalHintsInput.value = activePlayers + rounds;
                }

                // Ensure value is within bounds
                if (parseInt(personalHintsInput.value) > maxHints) {
                    personalHintsInput.value = maxHints;
                }
            }
            
            previousHintsEnabled = hintsEnabled;

            // Update display
            const valDisplay = document.getElementById('setting-personal-hints-val');
            if (valDisplay) valDisplay.textContent = personalHintsInput.value;

            emitSettingsUpdate();
        } else {
            personalHintsInput.disabled = true;
        }
    }

    // --- Event Listeners ---

    // Modal Triggers
    if (btnOpen) btnOpen.addEventListener('click', openModal);
    if (btnView) btnView.addEventListener('click', openModal);
    if (btnClose) btnClose.addEventListener('click', closeModal);

    // Game Mode Cards
    // Re-query cards because we might add new ones dynamically or just to be safe
    document.querySelectorAll('.gamemode-card').forEach(card => {
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
    roundsInput.addEventListener('change', () => {
        updatePersonalHints();
        // emitSettingsUpdate is called inside updatePersonalHints
    });
    if (fuzzyInput) fuzzyInput.addEventListener('change', emitSettingsUpdate);
    if (hintsInput) hintsInput.addEventListener('change', () => {
        updatePersonalHints();
    });
    if (maxWordLengthInput) maxWordLengthInput.addEventListener('change', emitSettingsUpdate);
    if (personalHintsInput) {
        personalHintsInput.addEventListener('input', (e) => {
            document.getElementById('setting-personal-hints-val').textContent = e.target.value;
        });
        // We disable manual change if rule is active, but keep listener just in case
        personalHintsInput.addEventListener('change', emitSettingsUpdate);
    }

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
    socket.on('userJoined', () => {
        if (isLeaderFn()) setTimeout(updatePersonalHints, 100); // Small delay to ensure player count is updated
    });
    socket.on('userLeft', () => {
        if (isLeaderFn()) setTimeout(updatePersonalHints, 100);
    });
    socket.on('switchRole', () => { // If someone switches role, active count changes
         if (isLeaderFn()) setTimeout(updatePersonalHints, 100);
    });

    socket.on('roomJoined', (data) => {
        if (data.settings) {
            const s = data.settings;
            if (currentMode !== s.mode) selectCard(s.mode);
            if (timeInput) timeInput.value = s.drawTime;
            if (wordChoiceTimeInput) wordChoiceTimeInput.value = s.wordChoiceTime;
            if (wordChoicesInput) wordChoicesInput.value = s.wordChoices;
            if (roundsInput) roundsInput.value = s.rounds;
            if (fuzzyInput) fuzzyInput.checked = s.allowFuzzy;
            if (hintsInput) hintsInput.checked = s.hintsEnabled;
            if (maxWordLengthInput) maxWordLengthInput.value = s.maxWordLength || 20;
            if (personalHintsInput) {
                personalHintsInput.value = s.personalHints;
                const valDisplay = document.getElementById('setting-personal-hints-val');
                if (valDisplay) valDisplay.textContent = s.personalHints;
            }
            
            // If I am leader, enforce the rule immediately
            if (isLeaderFn()) {
                setTimeout(updatePersonalHints, 100);
            } else {
                // Even if not leader, update visibility
                setTimeout(updatePersonalHints, 100);
            }
        }
    });

    socket.on('roomSettingsUpdated', (settings) => {
        if (currentMode !== settings.mode) {
            selectCard(settings.mode);
        }
        if (timeInput.value != settings.drawTime) timeInput.value = settings.drawTime;
        if (wordChoiceTimeInput.value != settings.wordChoiceTime) wordChoiceTimeInput.value = settings.wordChoiceTime;
        if (wordChoicesInput.value != settings.wordChoices) wordChoicesInput.value = settings.wordChoices;
        if (roundsInput.value != settings.rounds) roundsInput.value = settings.rounds;
        if (fuzzyInput && fuzzyInput.checked !== settings.allowFuzzy) fuzzyInput.checked = settings.allowFuzzy;
        if (hintsInput && settings.hintsEnabled !== undefined && hintsInput.checked !== settings.hintsEnabled) {
            hintsInput.checked = settings.hintsEnabled;
            updatePersonalHints();
        }
        if (maxWordLengthInput && settings.maxWordLength !== undefined && maxWordLengthInput.value != settings.maxWordLength) maxWordLengthInput.value = settings.maxWordLength;
        if (personalHintsInput && settings.personalHints !== undefined) {
            personalHintsInput.value = settings.personalHints;
            document.getElementById('setting-personal-hints-val').textContent = settings.personalHints;
        }
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
