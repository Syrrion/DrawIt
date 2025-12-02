import { showToast } from './utils.js';
import { Modal } from './components/modal.js';

export class GameSettingsManager {
    constructor(socket, isLeaderProvider, roomCodeProvider, playerCountProvider) {
        this.socket = socket;
        this.isLeaderProvider = isLeaderProvider;
        this.roomCodeProvider = roomCodeProvider;
        this.playerCountProvider = playerCountProvider;

        this.currentMode = 'guess-word';
        this.previousHintsEnabled = true;
        this.storedWordChoiceTimes = {
            'guess-word': 20,
            'custom-word': 45
        };

        this.modeDescriptions = {
            'guess-word': 'Un joueur dessine, les autres doivent deviner le mot le plus vite possible.',
            'custom-word': 'Le dessinateur choisit son propre mot à faire deviner.',
            'ai-theme': 'Mots générés par IA selon un thème choisi. Idéal pour des parties thématiques !',
            'creative': 'Tout le monde dessine le même thème, puis vote pour le meilleur dessin.',
            'telephone': 'Bouche à oreille dessiné : écrivez, dessinez, devinez en chaîne ! Idéal pour les groupes de 4 joueurs ou plus.'
        };

        // Modal & Controls
        this.modalElement = document.getElementById('lobby-settings-modal');
        this.btnOpen = document.getElementById('btn-open-settings');
        this.btnView = document.getElementById('btn-view-settings');
        this.btnClose = document.getElementById('btn-close-settings');
        this.lobbyControls = document.getElementById('lobby-controls');
        
        // Settings Inputs
        this.cards = document.querySelectorAll('.gamemode-card');
        this.allowTracingInput = document.getElementById('setting-allow-tracing');
        this.timeInput = document.getElementById('setting-drawtime');
        this.wordChoiceTimeInput = document.getElementById('setting-wordchoicetime');
        this.wordChoicesInput = document.getElementById('setting-wordchoices');
        this.roundsInput = document.getElementById('setting-rounds');
        this.fuzzyInput = document.getElementById('setting-fuzzy');
        this.hintsInput = document.getElementById('setting-hints');
        this.maxWordLengthInput = document.getElementById('setting-max-word-length');
        this.personalHintsInput = document.getElementById('setting-personal-hints');
        this.guessWordSettings = document.getElementById('settings-guess-word');
        
        // Creative Settings
        this.creativeDrawTimeInput = document.getElementById('setting-creative-drawtime');
        this.creativeRoundsInput = document.getElementById('setting-creative-rounds');
        this.creativePresentationTimeInput = document.getElementById('setting-creative-presentationtime');
        this.creativeVoteTimeInput = document.getElementById('setting-creative-votetime');
        this.anonymousVotingInput = document.getElementById('setting-anonymous-voting');

        // Telephone Settings
        this.telephoneWriteTimeInput = document.getElementById('setting-telephone-writetime');
        this.telephoneDrawTimeInput = document.getElementById('setting-telephone-drawtime');

        // AI Theme Settings (reuse guess-word inputs + specific theme input)
        this.aiThemeInput = document.getElementById('setting-ai-theme');

        // Actions
        this.startBtn = document.getElementById('btn-start-game');
        this.waitingMsg = document.getElementById('waiting-message');

        this.init();
    }

    init() {
        if (!this.modalElement) return;

        this.modal = new Modal(this.modalElement, {
            closeBtn: this.btnClose,
            onOpen: () => {
                if (this.isLeaderProvider()) {
                    this.socket.emit('leaderConfiguring', { roomCode: this.roomCodeProvider(), isConfiguring: true });
                }
            },
            onClose: () => {
                if (this.isLeaderProvider()) {
                    this.socket.emit('leaderConfiguring', { roomCode: this.roomCodeProvider(), isConfiguring: false });
                }
            }
        });

        // Modal Triggers
        if (this.btnOpen) this.btnOpen.addEventListener('click', () => this.modal.open());
        if (this.btnView) this.btnView.addEventListener('click', () => this.modal.open());

        // Game Mode Cards
        this.cards.forEach(card => {
            card.addEventListener('click', () => {
                if (!this.isLeaderProvider()) return;
                const mode = card.dataset.mode;
                this.selectCard(mode);
                this.emitSettingsUpdate();
            });
        });

        // Inputs
        if (this.allowTracingInput) this.allowTracingInput.addEventListener('change', () => this.emitSettingsUpdate());
        
        // Slider Visual Updates & Change Listeners
        const sliders = [
            { input: this.timeInput, spanId: 'setting-drawtime-val' },
            { input: this.wordChoiceTimeInput, spanId: 'setting-wordchoicetime-val' },
            { input: this.wordChoicesInput, spanId: 'setting-wordchoices-val' },
            { input: this.maxWordLengthInput, spanId: 'setting-max-word-length-val' },
            { input: this.roundsInput, spanId: 'setting-rounds-val' },
            { input: this.creativeDrawTimeInput, spanId: 'setting-creative-drawtime-val' },
            { input: this.creativeRoundsInput, spanId: 'setting-creative-rounds-val' },
            { input: this.creativePresentationTimeInput, spanId: 'setting-creative-presentationtime-val' },
            { input: this.creativeVoteTimeInput, spanId: 'setting-creative-votetime-val' },
            { input: this.telephoneWriteTimeInput, spanId: 'setting-telephone-writetime-val' },
            { input: this.telephoneDrawTimeInput, spanId: 'setting-telephone-drawtime-val' }
        ];

        sliders.forEach(({ input, spanId }) => {
            if (input) {
                // Visual update on drag
                input.addEventListener('input', (e) => {
                    const span = document.getElementById(spanId);
                    if (span) span.textContent = e.target.value;
                });
                
                // Emit update on release/change
                input.addEventListener('change', () => {
                    this.emitSettingsUpdate();
                    // Special case for rounds
                    if (input === this.roundsInput) {
                        this.updatePersonalHints();
                    }
                });
            }
        });

        if (this.fuzzyInput) this.fuzzyInput.addEventListener('change', () => this.emitSettingsUpdate());
        if (this.hintsInput) this.hintsInput.addEventListener('change', () => {
            this.updatePersonalHints();
        });
        
        if (this.personalHintsInput) {
            this.personalHintsInput.addEventListener('input', (e) => {
                document.getElementById('setting-personal-hints-val').textContent = e.target.value;
            });
            // We disable manual change if rule is active, but keep listener just in case
            this.personalHintsInput.addEventListener('change', () => this.emitSettingsUpdate());
        }

        if (this.anonymousVotingInput) this.anonymousVotingInput.addEventListener('change', () => this.emitSettingsUpdate());

        // AI Theme Listeners
        if (this.aiThemeInput) this.aiThemeInput.addEventListener('change', () => this.emitSettingsUpdate());

        // Start Game
        this.startBtn.addEventListener('click', () => {
            if (!this.isLeaderProvider()) return;
            
            if (this.playerCountProvider && this.playerCountProvider() < 2) {
                showToast('Il faut au moins 2 joueurs pour lancer la partie !', 'error');
                return;
            }

            this.socket.emit('startGame', this.roomCodeProvider());
            this.modal.close();
        });

        // Socket Listeners
        this.socket.on('userJoined', () => {
            if (this.isLeaderProvider()) setTimeout(() => this.updatePersonalHints(), 100);
        });
        this.socket.on('userLeft', () => {
            if (this.isLeaderProvider()) setTimeout(() => this.updatePersonalHints(), 100);
        });
        this.socket.on('switchRole', () => {
             if (this.isLeaderProvider()) setTimeout(() => this.updatePersonalHints(), 100);
        });

        this.socket.on('roomJoined', (data) => {
            if (data.settings) {
                const s = data.settings;
                if (this.currentMode !== s.mode) this.selectCard(s.mode);
                
                if (s.mode === 'creative') {
                    if (this.creativeDrawTimeInput) this.creativeDrawTimeInput.value = s.drawTime;
                    if (this.creativeRoundsInput) this.creativeRoundsInput.value = s.rounds;
                    if (this.creativePresentationTimeInput) this.creativePresentationTimeInput.value = s.presentationTime || 10;
                    if (this.creativeVoteTimeInput) this.creativeVoteTimeInput.value = s.voteTime || 60;
                } else if (s.mode === 'telephone') {
                    if (this.telephoneWriteTimeInput) this.telephoneWriteTimeInput.value = s.writeTime || 30;
                    if (this.telephoneDrawTimeInput) this.telephoneDrawTimeInput.value = s.drawTime || 60;
                } else {
                    if (this.timeInput) this.timeInput.value = s.drawTime;
                    if (this.roundsInput) this.roundsInput.value = s.rounds;
                }

                // AI Theme specific
                if (s.mode === 'ai-theme' && this.aiThemeInput) {
                    this.aiThemeInput.value = s.aiTheme || 'Animaux';
                }

                if (this.allowTracingInput) this.allowTracingInput.checked = s.allowTracing !== undefined ? s.allowTracing : true;
                if (this.wordChoiceTimeInput) this.wordChoiceTimeInput.value = s.wordChoiceTime;
                if (this.wordChoicesInput) this.wordChoicesInput.value = s.wordChoices;
                if (this.fuzzyInput) this.fuzzyInput.checked = s.allowFuzzy;
                if (this.hintsInput) this.hintsInput.checked = s.hintsEnabled;
                if (this.maxWordLengthInput) this.maxWordLengthInput.value = s.maxWordLength || 20;
                if (this.anonymousVotingInput) this.anonymousVotingInput.checked = s.anonymousVoting;

                if (this.personalHintsInput) {
                    this.personalHintsInput.value = s.personalHints;
                    const valDisplay = document.getElementById('setting-personal-hints-val');
                    if (valDisplay) valDisplay.textContent = s.personalHints;
                }
                
                this.updateAllSliderDisplays();

                // If I am leader, enforce the rule immediately
                if (this.isLeaderProvider()) {
                    setTimeout(() => this.updatePersonalHints(), 100);
                } else {
                    // Even if not leader, update visibility
                    setTimeout(() => this.updatePersonalHints(), 100);
                }
            }
        });

        this.socket.on('roomSettingsUpdated', (settings) => {
            if (this.currentMode !== settings.mode) {
                this.selectCard(settings.mode);
            }
            
            if (settings.mode === 'creative') {
                if (this.creativeDrawTimeInput && this.creativeDrawTimeInput.value != settings.drawTime) this.creativeDrawTimeInput.value = settings.drawTime;
                if (this.creativeRoundsInput && this.creativeRoundsInput.value != settings.rounds) this.creativeRoundsInput.value = settings.rounds;
                if (this.creativePresentationTimeInput && this.creativePresentationTimeInput.value != settings.presentationTime) this.creativePresentationTimeInput.value = settings.presentationTime;
                if (this.creativeVoteTimeInput && this.creativeVoteTimeInput.value != settings.voteTime) this.creativeVoteTimeInput.value = settings.voteTime;
            } else if (settings.mode === 'telephone') {
                if (this.telephoneWriteTimeInput && this.telephoneWriteTimeInput.value != settings.writeTime) this.telephoneWriteTimeInput.value = settings.writeTime;
                if (this.telephoneDrawTimeInput && this.telephoneDrawTimeInput.value != settings.drawTime) this.telephoneDrawTimeInput.value = settings.drawTime;
            } else {
                if (this.timeInput.value != settings.drawTime) this.timeInput.value = settings.drawTime;
                if (this.roundsInput.value != settings.rounds) this.roundsInput.value = settings.rounds;
            }

            // AI Theme specific
            if (settings.mode === 'ai-theme' && this.aiThemeInput && this.aiThemeInput.value != settings.aiTheme) {
                this.aiThemeInput.value = settings.aiTheme || 'Animaux';
            }

            if (this.allowTracingInput && settings.allowTracing !== undefined && this.allowTracingInput.checked !== settings.allowTracing) this.allowTracingInput.checked = settings.allowTracing;
            if (this.wordChoiceTimeInput.value != settings.wordChoiceTime) this.wordChoiceTimeInput.value = settings.wordChoiceTime;
            if (this.wordChoicesInput.value != settings.wordChoices) this.wordChoicesInput.value = settings.wordChoices;
            if (this.fuzzyInput && this.fuzzyInput.checked !== settings.allowFuzzy) this.fuzzyInput.checked = settings.allowFuzzy;
            if (this.hintsInput && settings.hintsEnabled !== undefined && this.hintsInput.checked !== settings.hintsEnabled) {
                this.hintsInput.checked = settings.hintsEnabled;
                this.updatePersonalHints();
            }
            if (this.maxWordLengthInput && settings.maxWordLength !== undefined && this.maxWordLengthInput.value != settings.maxWordLength) this.maxWordLengthInput.value = settings.maxWordLength;
            if (this.anonymousVotingInput && settings.anonymousVoting !== undefined && this.anonymousVotingInput.checked !== settings.anonymousVoting) this.anonymousVotingInput.checked = settings.anonymousVoting;

            if (this.personalHintsInput && settings.personalHints !== undefined) {
                this.personalHintsInput.value = settings.personalHints;
                document.getElementById('setting-personal-hints-val').textContent = settings.personalHints;
            }

            this.updateAllSliderDisplays();
        });

        this.socket.on('gameStateChanged', (state) => {
            if (state === 'LOBBY') {
                this.lobbyControls.classList.remove('hidden');
            } else {
                this.lobbyControls.classList.add('hidden');
                this.modal.close();
            }
        });
    }

    openModal() {
        this.modal.open();
    }

    closeModal() {
        this.modal.close();
    }

    selectCard(mode) {
        // Update Description
        const descEl = document.getElementById('gamemode-description');
        if (descEl && this.modeDescriptions[mode]) {
            descEl.textContent = this.modeDescriptions[mode];
        }

        // Save current time for previous mode
        if (this.currentMode === 'guess-word' || this.currentMode === 'custom-word') {
            if (this.wordChoiceTimeInput) {
                this.storedWordChoiceTimes[this.currentMode] = parseInt(this.wordChoiceTimeInput.value) || 20;
            }
        }

        this.cards.forEach(card => {
            if (card.dataset.mode === mode) {
                card.classList.add('selected');
            } else {
                card.classList.remove('selected');
            }
        });
        
        this.currentMode = mode;

        // Restore time for new mode
        if (mode === 'guess-word' || mode === 'custom-word') {
            if (this.wordChoiceTimeInput) {
                this.wordChoiceTimeInput.value = this.storedWordChoiceTimes[mode] || 20;
            }
        }
        
        // Hide all settings sections first
        const allSettings = document.querySelectorAll('[id^="settings-"]');
        allSettings.forEach(el => el.classList.add('hidden'));

        // Update switches visibility
        document.querySelectorAll('.mode-specific').forEach(el => el.classList.add('hidden'));
        if (mode === 'guess-word' || mode === 'custom-word' || mode === 'ai-theme') {
            document.querySelectorAll('.guess-word-only').forEach(el => el.classList.remove('hidden'));
        } else if (mode === 'creative') {
            document.querySelectorAll('.creative-only').forEach(el => el.classList.remove('hidden'));
        } else if (mode === 'telephone') {
            // No specific switches for telephone yet, maybe allow tracing?
        }

        // Show the selected mode settings
        // For custom-word and ai-theme, we reuse guess-word settings but hide/show specific fields
        
        let targetId = `settings-${mode}`;
        if (mode === 'custom-word' || mode === 'ai-theme') targetId = 'settings-guess-word'; // Reuse same settings panel

        const targetSettings = document.getElementById(targetId);
        if (targetSettings) {
            targetSettings.classList.remove('hidden');
            
            // Specific adjustments
            if (mode === 'custom-word') {
                if (this.wordChoicesInput) this.wordChoicesInput.closest('.setting-group').classList.add('hidden');
                if (this.maxWordLengthInput) this.maxWordLengthInput.closest('.setting-group').classList.remove('hidden');
                const aiThemeGroup = document.getElementById('setting-group-ai-theme');
                if (aiThemeGroup) aiThemeGroup.classList.add('hidden');
            } else if (mode === 'ai-theme') {
                if (this.wordChoicesInput) this.wordChoicesInput.closest('.setting-group').classList.remove('hidden');
                if (this.maxWordLengthInput) this.maxWordLengthInput.closest('.setting-group').classList.add('hidden');
                const aiThemeGroup = document.getElementById('setting-group-ai-theme');
                if (aiThemeGroup) aiThemeGroup.classList.remove('hidden');
            } else {
                if (this.wordChoicesInput) this.wordChoicesInput.closest('.setting-group').classList.remove('hidden');
                if (this.maxWordLengthInput) this.maxWordLengthInput.closest('.setting-group').classList.add('hidden');
                const aiThemeGroup = document.getElementById('setting-group-ai-theme');
                if (aiThemeGroup) aiThemeGroup.classList.add('hidden');
            }
        }
    }

    updateControlsState() {
        const isLeader = this.isLeaderProvider();
        const disabled = !isLeader;

        // Inputs
        if (this.allowTracingInput) this.allowTracingInput.disabled = disabled;
        this.timeInput.disabled = disabled;
        this.wordChoiceTimeInput.disabled = disabled;
        this.wordChoicesInput.disabled = disabled;
        this.roundsInput.disabled = disabled;
        if (this.fuzzyInput) this.fuzzyInput.disabled = disabled;
        if (this.hintsInput) this.hintsInput.disabled = disabled;
        if (this.maxWordLengthInput) this.maxWordLengthInput.disabled = disabled;
        if (this.personalHintsInput) this.personalHintsInput.disabled = disabled;
        if (this.creativeDrawTimeInput) this.creativeDrawTimeInput.disabled = disabled;
        if (this.creativeRoundsInput) this.creativeRoundsInput.disabled = disabled;
        if (this.creativePresentationTimeInput) this.creativePresentationTimeInput.disabled = disabled;
        if (this.creativeVoteTimeInput) this.creativeVoteTimeInput.disabled = disabled;
        if (this.anonymousVotingInput) this.anonymousVotingInput.disabled = disabled;
        if (this.telephoneWriteTimeInput) this.telephoneWriteTimeInput.disabled = disabled;
        if (this.telephoneDrawTimeInput) this.telephoneDrawTimeInput.disabled = disabled;
        if (this.aiThemeInput) this.aiThemeInput.disabled = disabled;
        
        // Cards interaction
        this.cards.forEach(card => {
            card.style.pointerEvents = isLeader ? 'auto' : 'none';
            card.style.opacity = isLeader ? '1' : '0.7';
        });

        // Buttons visibility
        if (isLeader) {
            if (this.btnOpen) this.btnOpen.classList.remove('hidden');
            if (this.btnView) this.btnView.classList.add('hidden');
            this.waitingMsg.classList.add('hidden');
            this.startBtn.classList.remove('hidden'); // Inside modal
        } else {
            // Non-leader can see settings but not edit
            if (this.btnOpen) this.btnOpen.classList.add('hidden');
            if (this.btnView) this.btnView.classList.remove('hidden');
            this.waitingMsg.classList.remove('hidden');
            this.startBtn.classList.add('hidden'); // Inside modal
        }
    }

    updateAllSliderDisplays() {
        const sliders = [
            { input: this.timeInput, spanId: 'setting-drawtime-val' },
            { input: this.wordChoiceTimeInput, spanId: 'setting-wordchoicetime-val' },
            { input: this.wordChoicesInput, spanId: 'setting-wordchoices-val' },
            { input: this.maxWordLengthInput, spanId: 'setting-max-word-length-val' },
            { input: this.roundsInput, spanId: 'setting-rounds-val' },
            { input: this.creativeDrawTimeInput, spanId: 'setting-creative-drawtime-val' },
            { input: this.creativeRoundsInput, spanId: 'setting-creative-rounds-val' },
            { input: this.creativePresentationTimeInput, spanId: 'setting-creative-presentationtime-val' },
            { input: this.creativeVoteTimeInput, spanId: 'setting-creative-votetime-val' },
            { input: this.telephoneWriteTimeInput, spanId: 'setting-telephone-writetime-val' },
            { input: this.telephoneDrawTimeInput, spanId: 'setting-telephone-drawtime-val' }
        ];

        sliders.forEach(({ input, spanId }) => {
            if (input) {
                const span = document.getElementById(spanId);
                if (span) span.textContent = input.value;
            }
        });
    }

    emitSettingsUpdate() {
        if (!this.isLeaderProvider()) return;
        
        let drawTime = parseInt(this.timeInput.value);
        let rounds = parseInt(this.roundsInput.value);

        if (this.currentMode === 'creative') {
            drawTime = this.creativeDrawTimeInput ? parseInt(this.creativeDrawTimeInput.value) : 180;
            rounds = this.creativeRoundsInput ? parseInt(this.creativeRoundsInput.value) : 3;
        }

        const settings = {
            mode: this.currentMode,
            allowTracing: this.allowTracingInput ? this.allowTracingInput.checked : true,
            drawTime: drawTime,
            wordChoiceTime: parseInt(this.wordChoiceTimeInput.value),
            wordChoices: parseInt(this.wordChoicesInput.value),
            rounds: rounds,
            allowFuzzy: this.fuzzyInput ? this.fuzzyInput.checked : false,
            hintsEnabled: this.hintsInput ? this.hintsInput.checked : true,
            maxWordLength: this.maxWordLengthInput ? parseInt(this.maxWordLengthInput.value) : 20,
            personalHints: this.personalHintsInput ? parseInt(this.personalHintsInput.value) : 3,
            anonymousVoting: this.anonymousVotingInput ? this.anonymousVotingInput.checked : true,
            presentationTime: this.creativePresentationTimeInput ? parseInt(this.creativePresentationTimeInput.value) : 10,
            voteTime: this.creativeVoteTimeInput ? parseInt(this.creativeVoteTimeInput.value) : 60,
            writeTime: this.telephoneWriteTimeInput ? parseInt(this.telephoneWriteTimeInput.value) : 30,
            aiTheme: this.aiThemeInput ? this.aiThemeInput.value : 'Animaux'
        };

        if (this.currentMode === 'telephone') {
            settings.drawTime = this.telephoneDrawTimeInput ? parseInt(this.telephoneDrawTimeInput.value) : 60;
        }

        this.socket.emit('updateSettings', {
            roomCode: this.roomCodeProvider(),
            settings
        });
    }

    updatePersonalHints() {
        if (!this.personalHintsInput) return;

        const hintsEnabled = this.hintsInput ? this.hintsInput.checked : true;
        const group = this.personalHintsInput.closest('.setting-group');

        // Visibility Logic (Apply to everyone)
        if (hintsEnabled) {
            group.classList.add('hidden');
        } else {
            group.classList.remove('hidden');
        }

        if (this.isLeaderProvider()) {
            const activePlayers = this.playerCountProvider ? this.playerCountProvider() : 0;
            const rounds = parseInt(this.roundsInput.value) || 3;
            
            // Calculate Max: rounds * 3 + players * 2
            const maxHints = (rounds * 3) + (activePlayers * 2);
            
            this.personalHintsInput.max = maxHints;

            if (hintsEnabled) {
                // Automatic hints enabled -> Personal hints = 0
                this.personalHintsInput.value = 0;
                this.personalHintsInput.disabled = true;
            } else {
                // Automatic hints disabled
                this.personalHintsInput.disabled = false;
                
                // If transitioning from Enabled to Disabled, set a default value
                // Default: Players + Rounds (from previous rule)
                if (this.previousHintsEnabled) {
                    this.personalHintsInput.value = activePlayers + rounds;
                }

                // Ensure value is within bounds
                if (parseInt(this.personalHintsInput.value) > maxHints) {
                    this.personalHintsInput.value = maxHints;
                }
            }
            
            this.previousHintsEnabled = hintsEnabled;

            // Update display
            const valDisplay = document.getElementById('setting-personal-hints-val');
            if (valDisplay) valDisplay.textContent = this.personalHintsInput.value;

            this.emitSettingsUpdate();
        } else {
            this.personalHintsInput.disabled = true;
        }
    }

    show() {
        this.lobbyControls.classList.remove('hidden');
    }

    hide() {
        this.lobbyControls.classList.add('hidden');
    }
}
