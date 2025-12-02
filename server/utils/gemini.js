const { GoogleGenAI } = require("@google/genai");

class GeminiService {
    constructor() {
        this.apiKey = process.env.GEMINI_API_KEY;
        if (!this.apiKey) {
            console.error('⚠️ GEMINI_API_KEY not found in environment variables');
        }
        // Initialisation du client avec le nouveau SDK
        this.client = this.apiKey ? new GoogleGenAI({ apiKey: this.apiKey }) : null;
    }

    async generateWords(theme, count) {
        if (!this.client) {
            console.error('❌ Gemini API not initialized');
            return this.getFallbackWords(count);
        }

        try {
            console.log(`🤖 Calling Gemini API for theme: "${theme}" (${count} words)`);
            
            const prompt = `Génère exactement ${count} mots en français liés au thème "${theme}". 
Les mots doivent être :
- Des noms communs (pas de verbes, pas d'adjectifs)
- En minuscules
- Avec les accents corrects (ex: "éléphant" et non "elephant")
- De difficulté variée (mélange de mots courants et originaux)
- Adaptés pour être dessinés dans un jeu de type Pictionary
- Différents des propositions précédentes si possible

Réponds UNIQUEMENT avec les mots séparés par des virgules, sans numérotation ni explication.
Exemple de format attendu: chat,chien,oiseau
Seed: ${Math.random()}`; // Ajout d'un seed aléatoire pour varier les réponses

            // Appel avec le nouveau SDK
            const response = await this.client.models.generateContent({
                model: 'gemini-2.0-flash',
                contents: prompt,
                config: {
                    temperature: 1.6, // Augmente la créativité et la diversité
                }
            });

            // La réponse est accessible directement via .text (plus besoin de .response.text())
            const text = response.text;
            
            console.log('📥 Gemini API response:', text);
            
            // Parse the response
            // Handle potential newlines or different separators
            const words = text
                .replace(/[\n\r]/g, ',') // Replace newlines with commas
                .split(',')
                .map(w => w.trim().toLowerCase())
                .filter(w => w.length > 0 && w.length <= 30);
            
            // Remove duplicates
            const uniqueWords = [...new Set(words)].slice(0, count);
            
            // If we didn't get enough words, pad with fallback only if missing significantly
            if (uniqueWords.length < count) {
                if (uniqueWords.length >= count * 0.5) {
                    console.warn(`⚠️ Gemini returned only ${uniqueWords.length}/${count} words. Keeping as is (>= 50%).`);
                } else {
                    console.warn(`⚠️ Gemini returned only ${uniqueWords.length}/${count} words, using fallback for remaining`);
                    const fallback = this.getFallbackWords(count - uniqueWords.length);
                    uniqueWords.push(...fallback);
                }
            }
            
            console.log('✅ Generated words:', uniqueWords);
            return uniqueWords;
            
        } catch (error) {
            console.error('❌ Gemini API error:', error);
            return this.getFallbackWords(count);
        }
    }

    getFallbackWords(count) {
        const fallback = ['chat', 'chien', 'maison', 'arbre', 'soleil', 'voiture', 'fleur', 'oiseau'];
        const words = [];
        for (let i = 0; i < count; i++) {
            words.push(fallback[i % fallback.length]);
        }
        console.log('⚠️ Using fallback words:', words);
        return words;
    }
}

module.exports = new GeminiService();
