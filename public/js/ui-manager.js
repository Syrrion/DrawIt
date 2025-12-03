import { LoginManager } from './ui/login-manager.js';
import { ModalManager } from './ui/modal-manager.js';
import { GameUIManager } from './ui/game-ui-manager.js';
import { ReferenceBrowser } from './ui/reference-browser.js';

export class UIManager {
    constructor(avatarManager, animationSystem, gameSettingsManager, renderCallback, cursorManager, layerManager) {
        this.avatarManager = avatarManager;
        this.animationSystem = animationSystem;
        this.gameSettingsManager = gameSettingsManager;
        this.renderCallback = renderCallback;
        this.cursorManager = cursorManager;
        this.layerManager = layerManager;

        this.init();
    }

    init() {
        // Randomize background gradient start
        document.body.style.animationDelay = `-${Math.random() * 60}s`;

        this.modalManager = new ModalManager(this);
        this.loginManager = new LoginManager(this);
        this.gameUIManager = new GameUIManager(this);
        this.referenceBrowser = new ReferenceBrowser();
    }
    
    // Proxy methods if needed by other classes that call uiManager directly
    updateGameCountDisplay() {
        if (this.gameUIManager) {
            this.gameUIManager.updateGameCountDisplay();
        }
    }
}
