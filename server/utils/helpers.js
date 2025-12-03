function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

function generateHint(word, revealedIndices) {
    if (!word) return '';
    let hint = '';
    for (let i = 0; i < word.length; i++) {
        // Reveal if it's not a letter (including accents) or number, OR if index is revealed
        // Regex matches letters (A-Z, a-z), numbers (0-9), and accented characters (\u00C0-\u00FF)
        const isHiddenChar = /[a-zA-Z0-9\u00C0-\u00FF]/.test(word[i]);
        
        if (!isHiddenChar || revealedIndices.includes(i)) {
            hint += word[i];
        } else {
            hint += '_';
        }
        hint += ' '; // Add space for readability
    }
    return hint.trim();
}

module.exports = { shuffle, generateHint };