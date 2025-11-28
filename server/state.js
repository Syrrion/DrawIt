const rooms = {};

function countPublicRooms() {
    const publicRooms = Object.values(rooms).filter(r => !r.isPrivate);
    
    const playable = publicRooms.filter(r => r.gameState === 'LOBBY' && r.users.filter(u => !u.isSpectator).length < r.maxPlayers).length;
    
    const observable = {
        all: publicRooms.filter(r => r.allowSpectators).length,
        lobby: publicRooms.filter(r => r.allowSpectators && r.gameState === 'LOBBY').length,
        playing: publicRooms.filter(r => r.allowSpectators && r.gameState === 'PLAYING').length
    };

    return {
        playable,
        observable
    };
}

module.exports = { rooms, countPublicRooms };