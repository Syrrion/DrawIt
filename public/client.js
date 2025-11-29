import { socket, penColorInput, gameColorGrid, avatarColorGrid, avatarColorPopover, currentColorPreview, avatarColorTrigger, avatarColorPreview, emojiColorTrigger, emojiColorPreview, cursorsLayer, playersList, canvasWrapper, zoomLevelDisplay, layersList, chatMessages, chatForm, chatInput, cursorIcon } from './js/dom-elements.js';
import { state } from './js/state.js';
import { showToast } from './js/utils.js';
import { LayerManager } from './js/layers.js';
import { ColorPickerManager } from './js/color-picker.js';
import { AvatarManager } from './js/avatar.js';
import { ChatManager } from './js/chat.js';
import { CursorManager } from './js/cursors.js';
import { PlayerListManager } from './js/players.js';
import { CameraManager } from './js/camera.js';
import { GameSettingsManager } from './js/game-settings.js';
import { AnimationSystem } from './js/animations.js';

import { ToolsManager } from './js/tools-manager.js';
import { CanvasManager } from './js/canvas-manager.js';
import { UIManager } from './js/ui-manager.js';
import { SocketManager } from './js/socket-manager.js';

const animationSystem = new AnimationSystem();

// Avatar Manager
const avatarManager = new AvatarManager();

// Game Color Picker
new ColorPickerManager({
    grid: gameColorGrid,
    input: penColorInput,
    preview: currentColorPreview,
    ids: {
        saturationArea: 'game-cp-saturation-area',
        saturationCursor: 'game-cp-saturation-cursor',
        hueArea: 'game-cp-hue-area',
        hueCursor: 'game-cp-hue-cursor',
        previewColor: 'game-cp-preview-color',
        r: 'game-cp-r',
        g: 'game-cp-g',
        b: 'game-cp-b'
    },
    onColorChange: (color) => {
        if (cursorIcon) cursorIcon.style.backgroundColor = color;
    }
});

// Avatar Color Picker
new ColorPickerManager({
    grid: avatarColorGrid,
    popover: avatarColorPopover,
    triggers: [
        { element: avatarColorTrigger, preview: avatarColorPreview },
        { element: emojiColorTrigger, preview: emojiColorPreview }
    ],
    ids: {
        saturationArea: 'avatar-cp-saturation-area',
        saturationCursor: 'avatar-cp-saturation-cursor',
        hueArea: 'avatar-cp-hue-area',
        hueCursor: 'avatar-cp-hue-cursor',
        previewColor: 'avatar-cp-preview-color',
        r: 'avatar-cp-r',
        g: 'avatar-cp-g',
        b: 'avatar-cp-b'
    },
    onColorChange: (color) => avatarManager.setAvatarColor(color)
});

// Player List
const playerListManager = new PlayerListManager(socket, playersList, (id, username) => window.showKickModal(id, username));

// Chat
const chatManager = new ChatManager(socket, () => state.currentRoom, () => state.user.username, (username) => playerListManager.getPlayerByUsername(username));

// Cursors
const cursorManager = new CursorManager(socket, cursorsLayer, () => state.currentRoom, () => state.user.username);

// Camera
const cameraManager = new CameraManager(canvasWrapper, zoomLevelDisplay);

// Game Settings
const gameSettingsManager = new GameSettingsManager(
    socket,
    () => socket.id === state.leaderId,
    () => state.currentRoom,
    () => playerListManager.getPlayerList().filter(u => !u.isSpectator).length
);

// Tools
const toolsManager = new ToolsManager();

// Canvas
const canvasManager = new CanvasManager(cursorManager, cameraManager, toolsManager);

// Layers
const layerManager = new LayerManager(
    socket,
    () => state.currentRoom,
    state.layers,
    state.layerCanvases,
    state.activeLayerId,
    () => canvasManager.render(),
    showToast,
    (newActiveId) => {
        state.activeLayerId = newActiveId;
        socket.emit('activeLayerChanged', { roomCode: state.currentRoom, layerId: newActiveId });
    },
    () => playerListManager.getPlayerList()
);

// Initialize Managers
new UIManager(avatarManager, animationSystem, gameSettingsManager, () => canvasManager.render(), cursorManager, layerManager);
new SocketManager({
    gameSettingsManager,
    playerListManager,
    layerManager,
    chatManager,
    cursorManager,
    animationSystem,
    render: () => canvasManager.renderAsync()
});
