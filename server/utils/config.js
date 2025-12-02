const fs = require('fs');
const path = require('path');

const configPath = path.join(__dirname, '../../public/js/config.js');
let content = fs.readFileSync(configPath, 'utf8');

// Remove 'export ' keywords to make it valid CommonJS code
content = content.replace(/export /g, '');

// Create a temporary module to load the content
const m = new module.constructor();
m.paths = module.paths;

// Append module.exports at the end to export the variables we want
// We need to ensure we export all variables defined in config.js that we might need
const exportStatement = '\nmodule.exports = { CANVAS_CONFIG, BASE_DIMENSIONS, UNDO_HISTORY_SIZE };';

try {
    m._compile(content + exportStatement, configPath);
} catch (err) {
    console.error('Error loading shared config:', err);
    // Fallback values if loading fails
    m.exports = {
        CANVAS_CONFIG: { width: 800, height: 600 },
        BASE_DIMENSIONS: { width: 800, height: 600 },
        UNDO_HISTORY_SIZE: 20
    };
}

module.exports = m.exports;
