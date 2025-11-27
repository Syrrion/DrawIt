import { socket, penColorInput, colorGrid, colorTrigger, colorPopover, currentColorPreview, avatarColorTrigger, avatarColorPreview, emojiColorTrigger, emojiColorPreview, cursorsLayer, playersList, canvasWrapper, zoomLevelDisplay, layersList, chatMessages, chatForm, chatInput, cursorIcon } from './js/dom-elements.js';
import { state } from './js/state.js';
import { showToast } from './js/utils.js';
import { initLayerManagement } from './js/layers.js';
import { initColorPicker } from './js/color-picker.js';
import { initAvatarManager } from './js/avatar.js';
import { initChat } from './js/chat.js';
import { initCursorManager } from './js/cursors.js';
import { initPlayerList } from './js/players.js';
import { initCamera } from './js/camera.js';
import { initGameSettings } from './js/game-settings.js';
import { AnimationSystem } from './js/animations.js';

import { initTools } from './js/tools-manager.js';
import { initCanvasManager, render } from './js/canvas-manager.js';
import { initUIManager } from './js/ui-manager.js';
import { SocketManager } from './js/socket-manager.js';

const animationSystem = new AnimationSystem();

// Avatar Manager
const avatarManager = initAvatarManager();

// Color Picker
initColorPicker(
    penColorInput, 
    colorGrid, 
    colorTrigger, 
    colorPopover, 
    currentColorPreview, 
    avatarColorTrigger, 
    avatarColorPreview, 
    emojiColorTrigger,
    emojiColorPreview,
    (color) => avatarManager.setAvatarColor(color), 
    () => state.activeColorTarget, 
    (target) => state.activeColorTarget = target,
    (color) => {
        // Callback when color changes
        if (state.activeColorTarget === 'game' && cursorIcon) {
            cursorIcon.style.backgroundColor = color;
        }
    }
);

// Player List
const playerListManager = initPlayerList(socket, playersList, (id, username) => window.showKickModal(id, username));

// Chat
const chatManager = initChat(socket, () => state.currentRoom, () => state.user.username, (username) => playerListManager.getPlayerByUsername(username));

// Cursors
const cursorManager = initCursorManager(socket, cursorsLayer, () => state.currentRoom, () => state.user.username);

// Camera
const cameraManager = initCamera(canvasWrapper, zoomLevelDisplay);

// Game Settings
const gameSettingsManager = initGameSettings(
    socket, 
    () => socket.id === state.leaderId, 
    () => state.currentRoom, 
    () => playerListManager.getPlayerList().filter(u => !u.isSpectator).length
);

// Layers
const layerManager = initLayerManagement(
    socket, 
    () => state.currentRoom, 
    state.layers, 
    state.layerCanvases, 
    state.activeLayerId, 
    render, 
    showToast,
    (newActiveId) => {
        state.activeLayerId = newActiveId;
        socket.emit('activeLayerChanged', { roomCode: state.currentRoom, layerId: newActiveId });
    },
    () => playerListManager.getPlayerList()
);

// Initialize Managers
initTools();
initCanvasManager(cursorManager, cameraManager);
initUIManager(avatarManager, animationSystem, gameSettingsManager, render, cursorManager, layerManager);
new SocketManager({
    gameSettingsManager, 
    playerListManager, 
    layerManager, 
    chatManager, 
    cursorManager, 
    animationSystem,
    render
});
