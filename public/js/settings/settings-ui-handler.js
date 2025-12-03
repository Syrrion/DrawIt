import { updateSliderBackground } from '../utils.js';
import { Modal } from '../components/modal.js';

export class SettingsUIHandler {
    constructor(manager) {
        this.manager = manager;
        this.init();
    }

    init() {
        this.initModal();
        this.initCards();
        this.initSliders();
        this.initToggles();
        this.initRadios();
        this.initInputs();
    }

    initModal() {
        if (!this.manager.modalElement) return;

        this.manager.modal = new Modal(this.manager.modalElement, {
            closeBtn: this.manager.btnClose,
            onOpen: () => {
                this.manager.updateControlsState();
                this.updateAllSliderDisplays();
                if (this.manager.isLeaderProvider()) {
                    this.manager.socket.emit('leaderConfiguring', { roomCode: this.manager.roomCodeProvider(), isConfiguring: true });
                } else {
                    if (this.manager.activeRoomMode && this.manager.currentMode !== this.manager.activeRoomMode) {
                        this.selectCard(this.manager.activeRoomMode);
                    }
                }
            },
            onClose: () => {
                if (this.manager.isLeaderProvider()) {
                    this.manager.socket.emit('leaderConfiguring', { roomCode: this.manager.roomCodeProvider(), isConfiguring: false });
                }
            }
        });

        if (this.manager.btnOpen) this.manager.btnOpen.addEventListener('click', () => this.manager.modal.open());
        if (this.manager.btnView) this.manager.btnView.addEventListener('click', () => this.manager.modal.open());
    }

    initCards() {
        this.manager.cards.forEach(card => {
            card.addEventListener('click', () => {
                const mode = card.dataset.mode;
                this.selectCard(mode);
                if (this.manager.isLeaderProvider()) {
                    this.manager.emitSettingsUpdate();
                }
            });
        });
    }

    initSliders() {
        const sliders = [
            { input: this.manager.timeInput, spanId: 'setting-drawtime-val' },
            { input: this.manager.wordChoiceTimeInput, spanId: 'setting-wordchoicetime-val' },
            { input: this.manager.wordChoicesInput, spanId: 'setting-wordchoices-val' },
            { input: this.manager.maxWordLengthInput, spanId: 'setting-max-word-length-val' },
            { input: this.manager.roundsInput, spanId: 'setting-rounds-val' },
            { input: this.manager.creativeDrawTimeInput, spanId: 'setting-creative-drawtime-val' },
            { input: this.manager.creativeRoundsInput, spanId: 'setting-creative-rounds-val' },
            { input: this.manager.creativePresentationTimeInput, spanId: 'setting-creative-presentationtime-val' },
            { input: this.manager.creativeVoteTimeInput, spanId: 'setting-creative-votetime-val' },
            { input: this.manager.creativeMaxWordLengthInput, spanId: 'setting-creative-max-word-length-val' },
            { input: this.manager.telephoneWriteTimeInput, spanId: 'setting-telephone-writetime-val' },
            { input: this.manager.telephoneDrawTimeInput, spanId: 'setting-telephone-drawtime-val' }
        ];

        const resizeObserver = new ResizeObserver(entries => {
            for (let entry of entries) {
                updateSliderBackground(entry.target);
            }
        });

        sliders.forEach(({ input, spanId }) => {
            if (input) {
                resizeObserver.observe(input);
                updateSliderBackground(input);

                input.addEventListener('input', (e) => {
                    const span = document.getElementById(spanId);
                    if (span) span.textContent = e.target.value;
                    updateSliderBackground(e.target);
                });
                
                input.addEventListener('change', () => {
                    this.manager.emitSettingsUpdate();
                    if (input === this.manager.roundsInput) {
                        this.manager.updatePersonalHints();
                    }
                });
            }
        });

        if (this.manager.personalHintsInput) {
            resizeObserver.observe(this.manager.personalHintsInput);
            this.manager.personalHintsInput.addEventListener('input', (e) => {
                document.getElementById('setting-personal-hints-val').textContent = e.target.value;
                updateSliderBackground(e.target);
            });
            this.manager.personalHintsInput.addEventListener('change', () => this.manager.emitSettingsUpdate());
        }
    }

    initToggles() {
        if (this.manager.allowTracingInput) this.manager.allowTracingInput.addEventListener('change', () => this.manager.emitSettingsUpdate());
        if (this.manager.fuzzyInput) this.manager.fuzzyInput.addEventListener('change', () => this.manager.emitSettingsUpdate());
        if (this.manager.hintsInput) this.manager.hintsInput.addEventListener('change', () => {
            this.manager.updatePersonalHints();
        });
        if (this.manager.anonymousVotingInput) this.manager.anonymousVotingInput.addEventListener('change', () => this.manager.emitSettingsUpdate());
    }

    initRadios() {
        if (this.manager.wordSourceInputs) {
            this.manager.wordSourceInputs.forEach(input => {
                input.addEventListener('change', () => this.manager.emitSettingsUpdate());
            });
        }
        if (this.manager.creativeWordSourceInputs) {
            this.manager.creativeWordSourceInputs.forEach(input => {
                input.addEventListener('change', () => this.manager.emitSettingsUpdate());
            });
        }
    }

    initInputs() {
        if (this.manager.aiThemeInput) {
            this.manager.aiThemeInput.addEventListener('change', () => this.manager.emitSettingsUpdate());
        }
    }

    selectCard(mode) {
        const descEl = document.getElementById('gamemode-description');
        if (descEl && this.manager.modeDescriptions[mode]) {
            descEl.textContent = this.manager.modeDescriptions[mode];
        }

        if (this.manager.currentMode === 'guess-word') {
            if (this.manager.wordChoiceTimeInput) {
                this.manager.storedWordChoiceTimes[this.manager.currentMode] = parseInt(this.manager.wordChoiceTimeInput.value) || 20;
            }
        }

        this.manager.currentMode = mode;
        this.updateCardVisuals();

        if (mode === 'guess-word') {
            if (this.manager.wordChoiceTimeInput) {
                this.manager.wordChoiceTimeInput.value = this.manager.storedWordChoiceTimes[mode] || 20;
            }
        }
        
        const allSettings = document.querySelectorAll('[id^="settings-"]');
        allSettings.forEach(el => el.classList.add('hidden'));

        document.querySelectorAll('.mode-specific').forEach(el => el.classList.add('hidden'));
        if (mode === 'guess-word' || mode === 'ai-theme') {
            document.querySelectorAll('.guess-word-only').forEach(el => el.classList.remove('hidden'));
        } else if (mode === 'creative') {
            document.querySelectorAll('.creative-only').forEach(el => el.classList.remove('hidden'));
        }

        let targetId = `settings-${mode}`;
        if (mode === 'ai-theme') targetId = 'settings-guess-word';

        const targetSettings = document.getElementById(targetId);
        if (targetSettings) {
            targetSettings.classList.remove('hidden');
            
            if (mode === 'ai-theme') {
                if (this.manager.wordChoicesInput) this.manager.wordChoicesInput.closest('.modal-slider-item').classList.remove('hidden');
                if (this.manager.maxWordLengthInput) this.manager.maxWordLengthInput.closest('.modal-slider-item').classList.add('hidden');
                const aiThemeGroup = document.getElementById('setting-group-ai-theme');
                if (aiThemeGroup) aiThemeGroup.classList.remove('hidden');
                if (this.manager.wordSourceGroup) this.manager.wordSourceGroup.classList.add('hidden');
            } else if (mode === 'guess-word') {
                const aiThemeGroup = document.getElementById('setting-group-ai-theme');
                if (aiThemeGroup) aiThemeGroup.classList.add('hidden');
                if (this.manager.wordSourceGroup) this.manager.wordSourceGroup.classList.remove('hidden');
                
                this.updateGuessWordUI();
            } else if (mode === 'creative') {
                this.updateCreativeUI();
            }
        }
    }

    updateCardVisuals() {
        const isLeader = this.manager.isLeaderProvider();

        this.manager.cards.forEach(card => {
            const mode = card.dataset.mode;
            card.classList.remove('selected', 'local-selected');

            if (isLeader) {
                if (mode === this.manager.currentMode) {
                    card.classList.add('selected');
                }
            } else {
                if (mode === this.manager.activeRoomMode) {
                    card.classList.add('selected');
                }
                if (mode === this.manager.currentMode) {
                    card.classList.add('local-selected');
                }
            }
        });
    }

    updateAllSliderDisplays() {
        const sliders = [
            { input: this.manager.timeInput, spanId: 'setting-drawtime-val' },
            { input: this.manager.wordChoiceTimeInput, spanId: 'setting-wordchoicetime-val' },
            { input: this.manager.wordChoicesInput, spanId: 'setting-wordchoices-val' },
            { input: this.manager.maxWordLengthInput, spanId: 'setting-max-word-length-val' },
            { input: this.manager.roundsInput, spanId: 'setting-rounds-val' },
            { input: this.manager.creativeDrawTimeInput, spanId: 'setting-creative-drawtime-val' },
            { input: this.manager.creativeRoundsInput, spanId: 'setting-creative-rounds-val' },
            { input: this.manager.creativePresentationTimeInput, spanId: 'setting-creative-presentationtime-val' },
            { input: this.manager.creativeVoteTimeInput, spanId: 'setting-creative-votetime-val' },
            { input: this.manager.creativeMaxWordLengthInput, spanId: 'setting-creative-max-word-length-val' },
            { input: this.manager.telephoneWriteTimeInput, spanId: 'setting-telephone-writetime-val' },
            { input: this.manager.telephoneDrawTimeInput, spanId: 'setting-telephone-drawtime-val' }
        ];

        sliders.forEach(({ input, spanId }) => {
            if (input) {
                const span = document.getElementById(spanId);
                if (span) span.textContent = input.value;
                updateSliderBackground(input);
            }
        });
        
        if (this.manager.personalHintsInput) {
             const span = document.getElementById('setting-personal-hints-val');
             if (span) span.textContent = this.manager.personalHintsInput.value;
             updateSliderBackground(this.manager.personalHintsInput);
        }
    }

    updateGuessWordUI() {
        const source = this.manager.getWordSource();
        if (source === 'custom') {
            if (this.manager.wordChoicesInput) this.manager.wordChoicesInput.closest('.modal-slider-item').classList.add('hidden');
            if (this.manager.maxWordLengthInput) this.manager.maxWordLengthInput.closest('.modal-slider-item').classList.remove('hidden');
        } else {
            if (this.manager.wordChoicesInput) this.manager.wordChoicesInput.closest('.modal-slider-item').classList.remove('hidden');
            if (this.manager.maxWordLengthInput) this.manager.maxWordLengthInput.closest('.modal-slider-item').classList.add('hidden');
        }
    }

    updateCreativeUI() {
        const source = this.manager.getWordSource();
        if (source === 'custom') {
            if (this.manager.creativeMaxWordLengthInput) this.manager.creativeMaxWordLengthInput.closest('.modal-slider-item').classList.remove('hidden');
        } else {
            if (this.manager.creativeMaxWordLengthInput) this.manager.creativeMaxWordLengthInput.closest('.modal-slider-item').classList.add('hidden');
        }
    }

    updateControlsState() {
        const isLeader = this.manager.isLeaderProvider();
        const disabled = !isLeader;

        // Inputs
        if (this.manager.allowTracingInput) this.manager.allowTracingInput.disabled = disabled;
        this.manager.timeInput.disabled = disabled;
        this.manager.wordChoiceTimeInput.disabled = disabled;
        this.manager.wordChoicesInput.disabled = disabled;
        this.manager.roundsInput.disabled = disabled;
        if (this.manager.fuzzyInput) this.manager.fuzzyInput.disabled = disabled;
        if (this.manager.hintsInput) this.manager.hintsInput.disabled = disabled;
        if (this.manager.maxWordLengthInput) this.manager.maxWordLengthInput.disabled = disabled;
        if (this.manager.personalHintsInput) this.manager.personalHintsInput.disabled = disabled;
        if (this.manager.creativeDrawTimeInput) this.manager.creativeDrawTimeInput.disabled = disabled;
        if (this.manager.creativeRoundsInput) this.manager.creativeRoundsInput.disabled = disabled;
        if (this.manager.creativePresentationTimeInput) this.manager.creativePresentationTimeInput.disabled = disabled;
        if (this.manager.creativeVoteTimeInput) this.manager.creativeVoteTimeInput.disabled = disabled;
        if (this.manager.creativeMaxWordLengthInput) this.manager.creativeMaxWordLengthInput.disabled = disabled;
        if (this.manager.anonymousVotingInput) this.manager.anonymousVotingInput.disabled = disabled;
        if (this.manager.telephoneWriteTimeInput) this.manager.telephoneWriteTimeInput.disabled = disabled;
        if (this.manager.telephoneDrawTimeInput) this.manager.telephoneDrawTimeInput.disabled = disabled;
        if (this.manager.aiThemeInput) this.manager.aiThemeInput.disabled = disabled;
        
        if (this.manager.wordSourceInputs) {
            this.manager.wordSourceInputs.forEach(input => input.disabled = disabled);
        }
        if (this.manager.creativeWordSourceInputs) {
            this.manager.creativeWordSourceInputs.forEach(input => input.disabled = disabled);
        }
        
        // Cards interaction
        this.manager.cards.forEach(card => {
            card.style.pointerEvents = 'auto';
            card.style.opacity = '1';
        });

        // Buttons visibility
        if (isLeader) {
            if (this.manager.btnOpen) this.manager.btnOpen.classList.remove('hidden');
            if (this.manager.btnView) this.manager.btnView.classList.add('hidden');
            this.manager.waitingMsg.classList.add('hidden');
            this.manager.startBtn.classList.remove('hidden'); // Inside modal
        } else {
            // Non-leader can see settings but not edit
            if (this.manager.btnOpen) this.manager.btnOpen.classList.add('hidden');
            if (this.manager.btnView) this.manager.btnView.classList.remove('hidden');
            this.manager.waitingMsg.classList.remove('hidden');
            this.manager.startBtn.classList.add('hidden'); // Inside modal
        }

        // Update slider backgrounds based on disabled state
        this.updateAllSliderDisplays();
    }

    updatePersonalHints() {
        if (!this.manager.personalHintsInput) return;

        const hintsEnabled = this.manager.hintsInput ? this.manager.hintsInput.checked : true;
        const group = this.manager.personalHintsInput.closest('.modal-slider-item');

        // Visibility Logic (Apply to everyone)
        if (hintsEnabled) {
            group.classList.add('hidden');
        } else {
            group.classList.remove('hidden');
        }

        if (this.manager.isLeaderProvider()) {
            const activePlayers = this.manager.playerCountProvider ? this.manager.playerCountProvider() : 0;
            const rounds = parseInt(this.manager.roundsInput.value) || 3;
            
            // Calculate Max: rounds * 3 + players * 2
            const maxHints = (rounds * 3) + (activePlayers * 2);
            
            this.manager.personalHintsInput.max = maxHints;

            if (hintsEnabled) {
                // Automatic hints enabled -> Personal hints = 0
                this.manager.personalHintsInput.value = 0;
                this.manager.personalHintsInput.disabled = true;
            } else {
                // Automatic hints disabled
                this.manager.personalHintsInput.disabled = false;
                
                // If transitioning from Enabled to Disabled, set a default value
                // Default: Players + Rounds (from previous rule)
                if (this.manager.previousHintsEnabled) {
                    this.manager.personalHintsInput.value = activePlayers + rounds;
                }

                // Ensure value is within bounds
                if (parseInt(this.manager.personalHintsInput.value) > maxHints) {
                    this.manager.personalHintsInput.value = maxHints;
                }
            }
            
            this.manager.previousHintsEnabled = hintsEnabled;

            // Update display
            const valDisplay = document.getElementById('setting-personal-hints-val');
            if (valDisplay) valDisplay.textContent = this.manager.personalHintsInput.value;

            this.manager.emitSettingsUpdate();
        } else {
            this.manager.personalHintsInput.disabled = true;
        }

        updateSliderBackground(this.manager.personalHintsInput);
    }
}
