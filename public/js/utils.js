import { CANVAS_CONFIG, BASE_DIMENSIONS } from './config.js';
import { state } from './state.js';

export function hexToRgb(hex) {
    var shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
    hex = hex.replace(shorthandRegex, function(m, r, g, b) {
        return r + r + g + g + b + b;
    });

    var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : null;
}

export function rgbToHex(rgb) {
    if (rgb.startsWith('#')) return rgb.toLowerCase();
    const rgbValues = rgb.match(/\d+/g);
    if (!rgbValues) return rgb;
    return '#' + rgbValues.map(x => {
        const hex = parseInt(x).toString(16);
        return hex.length === 1 ? '0' + hex : hex;
    }).join('');
}

export function hsvToRgb(h, s, v) {
    let r, g, b;
    const i = Math.floor(h / 60);
    const f = h / 60 - i;
    const p = v * (1 - s);
    const q = v * (1 - f * s);
    const t = v * (1 - (1 - f) * s);

    switch (i % 6) {
        case 0: r = v; g = t; b = p; break;
        case 1: r = q; g = v; b = p; break;
        case 2: r = p; g = v; b = t; break;
        case 3: r = p; g = q; b = v; break;
        case 4: r = t; g = p; b = v; break;
        case 5: r = v; g = p; b = q; break;
    }

    return {
        r: Math.round(r * 255),
        g: Math.round(g * 255),
        b: Math.round(b * 255)
    };
}

export function hsvToRgbString(h, s, v) {
    const rgb = hsvToRgb(h, s, v);
    return `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
}

export function rgbToHsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, v = max;
    const d = max - min;
    s = max === 0 ? 0 : d / max;

    if (max === min) {
        h = 0; 
    } else {
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
    }
    return { h: h * 360, s, v };
}

export function stringToColor(str) {
    if (!str) return '#000000';
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const c = (hash & 0x00FFFFFF).toString(16).toUpperCase();
    return '#' + '00000'.substring(0, 6 - c.length) + c;
}

export function getContrastColor(hex) {
    if (!hex) return '#ffffff';
    const rgb = hexToRgb(hex);
    if (!rgb) return '#ffffff';
    
    // Calculate relative luminance
    // Formula: 0.299*R + 0.587*G + 0.114*B
    const brightness = (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000;
    
    // Return black for bright colors, white for dark colors
    return brightness > 128 ? '#000000' : '#ffffff';
}

export function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    let icon = '';
    if (type === 'error') icon = '⚠️';
    else if (type === 'success') icon = '✅';
    else icon = 'ℹ️';

    toast.innerHTML = `
        <span class="toast-icon">${icon}</span>
        <span class="toast-message">${message}</span>
    `;

    // Click to dismiss
    toast.style.cursor = 'pointer';
    toast.onclick = () => toast.remove();

    container.appendChild(toast);

    // Remove after 5 seconds (animation handles fade out visually)
    setTimeout(() => {
        toast.remove();
    }, 5000);
}

export function generateRandomUsername() {
    const adjectives = ['Petit', 'Grand', 'Joyeux', 'Rapide', 'Super', 'Mega', 'Ultra', 'Hyper', 'Mini', 'Maxi', 'Drôle', 'Fou', 'Sage', 'Brave', 'Fier'];
    const nouns = ['Chat', 'Chien', 'Oiseau', 'Lion', 'Tigre', 'Ours', 'Loup', 'Renard', 'Lapin', 'Dragon', 'Robot', 'Ninja', 'Panda', 'Koala', 'Aigle'];
    
    const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    const num = Math.floor(Math.random() * 100);
    
    return `${adj}${noun}${num}`;
}

export function copyToClipboard(text) {
    if (!text) return Promise.reject('No text to copy');

    // Try modern API first
    if (navigator.clipboard && navigator.clipboard.writeText) {
        return navigator.clipboard.writeText(text).catch(err => {
            console.warn('Clipboard API failed, trying fallback...', err);
            return fallbackCopy(text);
        });
    } else {
        return fallbackCopy(text);
    }
}

export function escapeHtml(text) {
    if (!text) return text;
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function fallbackCopy(text) {
    return new Promise((resolve, reject) => {
        try {
            const textArea = document.createElement("textarea");
            textArea.value = text;
            
            // Ensure it's not visible but part of DOM
            textArea.style.position = "fixed";
            textArea.style.left = "-9999px";
            textArea.style.top = "0";
            
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();
            
            const successful = document.execCommand('copy');
            document.body.removeChild(textArea);
            
            if (successful) resolve();
            else reject(new Error('execCommand returned false'));
        } catch (err) {
            reject(err);
        }
    });
}

export function playTickSound() {
    if (state.isMuted) return;

    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        
        osc.connect(gain);
        gain.connect(ctx.destination);
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(800, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(400, ctx.currentTime + 0.05);
        
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.05);
        
        osc.start();
        osc.stop(ctx.currentTime + 0.05);
    } catch (e) {
        console.error('Audio error:', e);
    }
}

export function calculateBrushSize(sliderValue) {
    const min = 1;
    const max = 400;
    const t = (sliderValue - min) / (max - min);
    const baseSize = min + (max - min) * Math.pow(t, 2);
    
    // Scale brush size based on resolution increase
    const scaleFactor = CANVAS_CONFIG.width / BASE_DIMENSIONS.width;
    return baseSize * scaleFactor;
}

export function calculateSliderValue(brushSize) {
    // Reverse scaling
    const scaleFactor = CANVAS_CONFIG.width / BASE_DIMENSIONS.width;
    const baseSize = brushSize / scaleFactor;

    const min = 1;
    const max = 400;
    const t = Math.sqrt((baseSize - min) / (max - min));
    return min + (max - min) * t;
}

