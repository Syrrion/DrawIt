import { showToast, updateSliderBackground } from './utils.js';
import { SettingsUIHandler } from './settings/settings-ui-handler.js';

export class GameSettingsManager {
    constructor(socket, isLeaderProvider, roomCodeProvider, playerCountProvider) {
        this.socket = socket;
        this.isLeaderProvider = isLeaderProvider;
        this.roomCodeProvider = roomCodeProvider;
        this.playerCountProvider = playerCountProvider;

        this.currentMode = 'guess-word';
        this.activeRoomMode = 'guess-word'; // Tracks the actual room mode (Leader's choice)
        this.previousHintsEnabled = true;
        this.storedWordChoiceTimes = {
            'guess-word': 20
        };

        this.modeDescriptions = {
            'guess-word': 'Un joueur dessine, les autres doivent deviner le mot le plus vite possible.',
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
        this.creativeMaxWordLengthInput = document.getElementById('setting-creative-max-word-length');
        this.anonymousVotingInput = document.getElementById('setting-anonymous-voting');

        // Telephone Settings
        this.telephoneWriteTimeInput = document.getElementById('setting-telephone-writetime');
        this.telephoneDrawTimeInput = document.getElementById('setting-telephone-drawtime');

        // AI Theme Settings (reuse guess-word inputs + specific theme input)
        this.aiThemeInput = document.getElementById('setting-ai-theme');

        // Word Source Settings
        this.wordSourceInputs = document.querySelectorAll('input[name="word-source"]');
        this.wordSourceGroup = document.getElementById('setting-group-word-source');
        this.creativeWordSourceInputs = document.querySelectorAll('input[name="creative-word-source"]');

        // Actions
        this.startBtn = document.getElementById('btn-start-game');
        this.waitingMsg = document.getElementById('waiting-message');

        this.uiHandler = new SettingsUIHandler(this);
        this.init();
    }

    init() {
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
                this.activeRoomMode = s.mode;
                
                // If I am leader, I should be viewing the room mode.
                // If I am not leader, I might be viewing something else, but on join, sync to room.
                if (this.currentMode !== s.mode) this.uiHandler.selectCard(s.mode);
                else this.uiHandler.updateCardVisuals(); // Ensure visuals are correct even if mode didn't change
                
                if (s.mode === 'creative') {
                    if (this.creativeDrawTimeInput) this.creativeDrawTimeInput.value = s.drawTime;
                    if (this.creativeRoundsInput) this.creativeRoundsInput.value = s.rounds;
                    if (this.creativePresentationTimeInput) this.creativePresentationTimeInput.value = s.presentationTime || 10;
                    if (this.creativeVoteTimeInput) this.creativeVoteTimeInput.value = s.voteTime || 60;
                    if (this.creativeMaxWordLengthInput) this.creativeMaxWordLengthInput.value = s.maxWordLength || 20;
                } else if (s.mode === 'telephone') {
                    if (this.telephoneWriteTimeInput) this.telephoneWriteTimeInput.value = s.writeTime || 30;
                    if (this.telephoneDrawTimeInput) this.telephoneDrawTimeInput.value = s.drawTime || 180;
                } else {
                    if (this.timeInput) this.timeInput.value = s.drawTime;
                    if (this.roundsInput) this.roundsInput.value = s.rounds;
                }

                // AI Theme specific
                if (s.mode === 'ai-theme' && this.aiThemeInput) {
                    this.aiThemeInput.value = s.aiTheme || 'Animaux';
                }

                // Word Source specific
                if (s.mode === 'guess-word' && this.wordSourceInputs) {
                    const source = s.wordSource || 'dictionary';
                    this.wordSourceInputs.forEach(input => {
                        input.checked = (input.value === source);
                    });
                    this.updateGuessWordUI();
                }
                if (s.mode === 'creative' && this.creativeWordSourceInputs) {
                    const source = s.wordSource || 'dictionary';
                    this.creativeWordSourceInputs.forEach(input => {
                        input.checked = (input.value === source);
                    });
                    this.updateCreativeUI();
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
                
                this.uiHandler.updateAllSliderDisplays();

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
            this.activeRoomMode = settings.mode;
            
            // Only force view switch if I am leader (should already be synced) 
            // OR if I haven't manually navigated away (hard to know, so let's just NOT force switch for non-leader)
            // BUT, if I am leader, I definitely want to be on the mode I just set.
            if (this.isLeaderProvider()) {
                if (this.currentMode !== settings.mode) {
                    this.uiHandler.selectCard(settings.mode);
                } else {
                    this.uiHandler.updateCardVisuals();
                }
            } else {
                // Non-leader: Just update visuals to show the new Gold card
                this.uiHandler.updateCardVisuals();
                
                // If I happen to be viewing the mode that just became active, refresh the panel
                if (this.currentMode === settings.mode) {
                    // selectCard re-triggers panel visibility logic
                    this.uiHandler.selectCard(settings.mode);
                }
            }
            
            if (settings.mode === 'creative') {
                if (this.creativeDrawTimeInput && this.creativeDrawTimeInput.value != settings.drawTime) this.creativeDrawTimeInput.value = settings.drawTime;
                if (this.creativeRoundsInput && this.creativeRoundsInput.value != settings.rounds) this.creativeRoundsInput.value = settings.rounds;
                if (this.creativePresentationTimeInput && this.creativePresentationTimeInput.value != settings.presentationTime) this.creativePresentationTimeInput.value = settings.presentationTime;
                if (this.creativeVoteTimeInput && this.creativeVoteTimeInput.value != settings.voteTime) this.creativeVoteTimeInput.value = settings.voteTime;
                if (this.creativeMaxWordLengthInput && this.creativeMaxWordLengthInput.value != settings.maxWordLength) this.creativeMaxWordLengthInput.value = settings.maxWordLength;
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

            // Word Source specific
            if (settings.mode === 'guess-word' && this.wordSourceInputs) {
                const source = settings.wordSource || 'dictionary';
                let changed = false;
                this.wordSourceInputs.forEach(input => {
                    if (input.checked !== (input.value === source)) {
                        input.checked = (input.value === source);
                        changed = true;
                    }
                });
                if (changed) this.updateGuessWordUI();
            }
            if (settings.mode === 'creative' && this.creativeWordSourceInputs) {
                const source = settings.wordSource || 'dictionary';
                let changed = false;
                this.creativeWordSourceInputs.forEach(input => {
                    if (input.checked !== (input.value === source)) {
                        input.checked = (input.value === source);
                        changed = true;
                    }
                });
                if (changed) this.updateCreativeUI();
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

            this.uiHandler.updateAllSliderDisplays();
        });

        this.socket.on('gameStateChanged', (state) => {
            if (state === 'LOBBY') {
                this.lobbyControls.classList.remove('hidden');
            } else {
                this.lobbyControls.classList.add('hidden');
                this.modal.close();
            }
        });

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
    }

    openModal() {
        this.modal.open();
    }

    closeModal() {
        this.modal.close();
    }

    selectCard(mode) {
        this.uiHandler.selectCard(mode);
    }

    updateGuessWordUI() {
        this.uiHandler.updateGuessWordUI();
    }

    updateCreativeUI() {
        this.uiHandler.updateCreativeUI();
    }

    updateCardVisuals() {
        this.uiHandler.updateCardVisuals();
    }

    updateControlsState() {
        this.uiHandler.updateControlsState();
    }

    emitSettingsUpdate() {
        if (!this.isLeaderProvider()) return;
        
        let drawTime = parseInt(this.timeInput.value);
        let rounds = parseInt(this.roundsInput.value);
        let maxWordLength = this.maxWordLengthInput ? parseInt(this.maxWordLengthInput.value) : 20;

        if (this.currentMode === 'creative') {
            drawTime = this.creativeDrawTimeInput ? parseInt(this.creativeDrawTimeInput.value) : 180;
            rounds = this.creativeRoundsInput ? parseInt(this.creativeRoundsInput.value) : 3;
            maxWordLength = this.creativeMaxWordLengthInput ? parseInt(this.creativeMaxWordLengthInput.value) : 20;
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
            maxWordLength: maxWordLength,
            personalHints: this.personalHintsInput ? parseInt(this.personalHintsInput.value) : 3,
            anonymousVoting: this.anonymousVotingInput ? this.anonymousVotingInput.checked : true,
            presentationTime: this.creativePresentationTimeInput ? parseInt(this.creativePresentationTimeInput.value) : 10,
            voteTime: this.creativeVoteTimeInput ? parseInt(this.creativeVoteTimeInput.value) : 60,
            writeTime: this.telephoneWriteTimeInput ? parseInt(this.telephoneWriteTimeInput.value) : 30,
            aiTheme: this.aiThemeInput ? this.aiThemeInput.value : 'Animaux',
            wordSource: this.getWordSource()
        };

        if (this.currentMode === 'telephone') {
            settings.drawTime = this.telephoneDrawTimeInput ? parseInt(this.telephoneDrawTimeInput.value) : 180;
        }

        this.socket.emit('updateSettings', {
            roomCode: this.roomCodeProvider(),
            settings
        });
    }

    getWordSource() {
        let source = 'dictionary';
        if (this.currentMode === 'creative') {
             if (this.creativeWordSourceInputs) {
                this.creativeWordSourceInputs.forEach(input => {
                    if (input.checked) source = input.value;
                });
             }
        } else {
            if (this.wordSourceInputs) {
                this.wordSourceInputs.forEach(input => {
                    if (input.checked) source = input.value;
                });
            }
        }
        return source;
    }

    updatePersonalHints() {
        this.uiHandler.updatePersonalHints();
    }

    show() {
        this.lobbyControls.classList.remove('hidden');
    }

    hide() {
        this.lobbyControls.classList.add('hidden');
    }
}
