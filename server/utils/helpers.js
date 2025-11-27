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
        if (word[i] === ' ' || word[i] === '-') {
            hint += word[i];
        } else if (revealedIndices.includes(i)) {
            hint += word[i];
        } else {
            hint += '_';
        }
        hint += ' '; // Add space for readability
    }
    return hint.trim();
}

module.exports = { shuffle, generateHint };