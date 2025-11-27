const fs = require('fs');
const path = require('path');

let dictionary = [];

function loadDictionary(basePath) {
    const dictPath = path.join(basePath, 'dictionary.txt');
    try {
        dictionary = fs.readFileSync(dictPath, 'utf-8')
            .split('\n')
            .map(w => w.trim())
            .filter(w => w.length > 0);
        console.log(`Dictionary loaded: ${dictionary.length} words`);
    } catch (err) {
        console.error('Error loading dictionary:', err);
        dictionary = ['POMME', 'MAISON', 'CHAT', 'CHIEN']; // Fallback
    }
}

function getRandomWords(count) {
    const words = [];
    if (dictionary.length === 0) return ['ERROR'];
    
    for (let i = 0; i < count; i++) {
        let word = dictionary[Math.floor(Math.random() * dictionary.length)];
        // Replace special characters like œ
        if (word) {
            word = word.replace(/œ/g, 'oe').replace(/Œ/g, 'OE');
            words.push(word);
        }
    }
    return words;
}

function getRandomWord() {
    if (dictionary.length === 0) return 'ERROR';
    const word = dictionary[Math.floor(Math.random() * dictionary.length)];
    return word ? word.replace(/œ/g, 'oe').replace(/Œ/g, 'OE') : 'ERROR';
}

module.exports = { loadDictionary, getRandomWords, getRandomWord };