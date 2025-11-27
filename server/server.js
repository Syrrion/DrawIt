const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const { loadDictionary } = require('./utils/dictionary');
const registerRoomHandlers = require('./handlers/roomHandlers');
const registerGameHandlers = require('./handlers/gameHandlers');
const registerDrawingHandlers = require('./handlers/drawingHandlers');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Load Dictionary
loadDictionary(__dirname);

// Set up EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views'));

// Route for the main page
app.get('/', (req, res) => {
    res.render('index');
});

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, '../public')));

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    // Register handlers
    registerRoomHandlers(io, socket);
    registerGameHandlers(io, socket);
    registerDrawingHandlers(io, socket);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
