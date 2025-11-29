const express = require('express');
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

// Proxy Route for Mobile View & Unblocking
app.get('/proxy', (req, res) => {
    const targetUrl = req.query.url;
    if (!targetUrl) return res.status(400).send('URL required');

    try {
        const parsedUrl = new URL(targetUrl);
        const lib = parsedUrl.protocol === 'https:' ? https : http;
        
        const options = {
            hostname: parsedUrl.hostname,
            port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
            path: parsedUrl.pathname + parsedUrl.search,
            method: 'GET',
            headers: {
                // iPhone User Agent
                'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
                'Accept-Encoding': 'identity', // Disable compression to allow HTML injection
                'Cookie': req.headers.cookie || '',
                'Referer': new URL(targetUrl).origin + '/'
            }
        };

        const proxyReq = lib.request(options, (proxyRes) => {
            // Handle Redirects: Redirect back to proxy
            if (proxyRes.statusCode >= 300 && proxyRes.statusCode < 400 && proxyRes.headers.location) {
                const redirectUrl = new URL(proxyRes.headers.location, targetUrl).href;
                return res.redirect(`/proxy?url=${encodeURIComponent(redirectUrl)}`);
            }

            // Strip blocking headers
            const headers = { ...proxyRes.headers };
            delete headers['x-frame-options'];
            delete headers['content-security-policy'];
            delete headers['frame-options'];

            // Forward Set-Cookie with domain stripping and forcing Path=/
            if (headers['set-cookie']) {
                headers['set-cookie'] = headers['set-cookie'].map(cookie => {
                    let newCookie = cookie
                        .replace(/Domain=[^;]+;/gi, '')
                        .replace(/Secure;/gi, '')
                        .replace(/SameSite=[^;]+;/gi, '')
                        .replace(/Path=[^;]+;/gi, '');
                    
                    if (!newCookie.endsWith(';')) newCookie += ';';
                    return newCookie + ' Path=/';
                });
            }
            
            // Check if HTML to inject fixes
            const isHtml = headers['content-type'] && headers['content-type'].includes('text/html');

            if (isHtml) {
                let data = '';
                proxyRes.setEncoding('utf8');
                proxyRes.on('data', chunk => data += chunk);
                proxyRes.on('end', () => {
                    // Inject Base Tag & Navigation Script
                    const baseTag = `<base href="${targetUrl}">`;
                    const script = `
                        <script>
                            // Notify parent of current URL
                            try {
                                if (window.parent !== window) {
                                    window.parent.postMessage({ type: 'browser-update', url: "${targetUrl}" }, '*');
                                }
                            } catch(e) { console.error('PostMessage failed', e); }

                            document.addEventListener('DOMContentLoaded', () => {
                                const proxyOrigin = window.location.origin;
                                // Intercept Links
                                document.body.addEventListener('click', e => {
                                    const a = e.target.closest('a');
                                    if (a && a.href) {
                                        e.preventDefault();
                                        // Force return to proxy using absolute path
                                        window.location.href = proxyOrigin + '/proxy?url=' + encodeURIComponent(a.href);
                                    }
                                });
                                // Intercept Forms (Basic GET)
                                document.body.addEventListener('submit', e => {
                                    const form = e.target;
                                    if (form.method.toLowerCase() === 'get') {
                                        e.preventDefault();
                                        const url = new URL(form.action);
                                        const params = new URLSearchParams(new FormData(form));
                                        // Merge existing params with form data
                                        Array.from(params.entries()).forEach(([k, v]) => url.searchParams.set(k, v));
                                        window.location.href = proxyOrigin + '/proxy?url=' + encodeURIComponent(url.toString());
                                    }
                                });
                            });
                        </script>
                    `;
                    
                    // Insert after <head> (or at start if missing)
                    let modifiedData = data;
                    if (data.includes('<head>')) {
                        modifiedData = data.replace('<head>', '<head>' + baseTag + script);
                    } else if (data.includes('<body>')) {
                        modifiedData = data.replace('<body>', '<body>' + baseTag + script);
                    } else {
                        modifiedData = baseTag + script + data;
                    }
                    
                    // Remove content-length as size changed
                    delete headers['content-length'];
                    res.writeHead(proxyRes.statusCode, headers);
                    res.end(modifiedData);
                });
            } else {
                // Pipe binary/other directly
                res.writeHead(proxyRes.statusCode, headers);
                proxyRes.pipe(res);
            }
        });

        proxyReq.on('error', (e) => {
            console.error('Proxy error:', e.message);
            res.status(500).send('Proxy error');
        });

        proxyReq.end();
    } catch (err) {
        console.error('Proxy URL error:', err);
        res.status(400).send('Invalid URL');
    }
});

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
