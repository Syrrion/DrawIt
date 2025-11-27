import { initRoomHandler } from './socket/room-handler.js';
import { initGameHandler } from './socket/game-handler.js';
import { initDrawingHandler } from './socket/drawing-handler.js';

export function initSocketManager(
    gameSettingsManager,
    playerListManager,
    layerManager,
    chatManager,
    cursorManager,
    animationSystem,
    render
) {
    initRoomHandler(gameSettingsManager, playerListManager, layerManager, cursorManager, render);
    initGameHandler(gameSettingsManager, playerListManager, layerManager, chatManager, cursorManager, animationSystem);
    initDrawingHandler(layerManager, cursorManager, render);
}
