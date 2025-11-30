const express = require('express');
require('dotenv').config();
const http = require('http');
const https = require('https');
const { URL } = require('url');
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

// Pixabay Proxy Route
app.get('/api/pixabay', (req, res) => {
    const query = req.query.q;
    if (!query) return res.status(400).json({ error: 'Query required' });

    const apiKey = process.env.PIXABAY_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'Server configuration error' });

    const apiUrl = `https://pixabay.com/api/?key=${apiKey}&q=${encodeURIComponent(query)}&image_type=photo&safesearch=true&per_page=30&lang=fr`;

    https.get(apiUrl, (apiRes) => {
        let data = '';
        apiRes.on('data', (chunk) => data += chunk);
        apiRes.on('end', () => {
            try {
                const json = JSON.parse(data);
                res.json(json);
            } catch (e) {
                res.status(500).json({ error: 'Failed to parse Pixabay response' });
            }
        });
    }).on('error', (e) => {
        console.error('Pixabay API error:', e);
        res.status(500).json({ error: 'Pixabay API request failed' });
    });
});

io.on('connection', (socket) => {
    // Register handlers
    registerRoomHandlers(io, socket);
    registerGameHandlers(io, socket);
    registerDrawingHandlers(io, socket);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
});
