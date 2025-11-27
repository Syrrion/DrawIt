import { RoomHandler } from './socket/room-handler.js';
import { GameHandler } from './socket/game-handler.js';
import { DrawingHandler } from './socket/drawing-handler.js';

export class SocketManager {
    constructor(managers) {
        this.roomHandler = new RoomHandler(managers);
        this.gameHandler = new GameHandler(managers);
        this.drawingHandler = new DrawingHandler(managers);
    }
}
