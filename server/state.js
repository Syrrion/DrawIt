const rooms = {};

function countPublicRooms() {
    const lobbies = Object.values(rooms).filter(r => !r.isPrivate && r.gameState === 'LOBBY');
    return {
        playable: lobbies.filter(r => r.users.filter(u => !u.isSpectator).length < r.maxPlayers).length,
        observable: lobbies.filter(r => r.allowSpectators).length
    };
}

module.exports = { rooms, countPublicRooms };