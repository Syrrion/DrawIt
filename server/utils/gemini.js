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
            
            const prompt = `Tu es un générateur de mots pour un jeu de Pictionary.
Ton objectif est de générer une liste de mots STRICTEMENT liés au thème : "${theme}".

Règles impératives :
1. Génère exactement ${count} mots.
2. Les mots doivent être des NOMS COMMUNS (pas de verbes, pas d'adjectifs).
3. Les mots doivent être CONCRETS et VISUELS (dessinables).
4. Les mots doivent être en FRANÇAIS, en minuscules, avec les accents.
5. INTERDIT : mots génériques (ex: "chose", "objet"), mots abstraits, mots en anglais, mots hors-sujet.
6. Si le thème est précis, sois précis. Ne t'éloigne pas du sujet.

Format de réponse attendu :
mot1,mot2,mot3,...

Réponds UNIQUEMENT avec la liste de mots séparés par des virgules. Pas de phrase d'introduction, pas de numérotation.`;

            // Appel avec le nouveau SDK
            const response = await this.client.models.generateContent({
                model: 'gemini-2.0-flash',
                contents: prompt,
                config: {
                    temperature: 1.0, // Réduit pour plus de cohérence et moins d'hallucinations
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
            
            // If we didn't get enough words, throw error instead of fallback
            if (uniqueWords.length < count) {
                if (uniqueWords.length >= count * 0.5) {
                    console.warn(`⚠️ Gemini returned only ${uniqueWords.length}/${count} words. Keeping as is (>= 50%).`);
                } else {
                    console.error(`❌ Gemini returned only ${uniqueWords.length}/${count} words. Too few results.`);
                    throw new Error("L'IA n'a pas généré assez de mots valides pour ce thème.");
                }
            }
            
            console.log('✅ Generated words:', uniqueWords);
            return uniqueWords;
            
        } catch (error) {
            console.error('❌ Gemini API error:', error);
            throw error; // Propagate error to Game class
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
