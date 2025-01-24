import express from 'express';
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { saveToBackup } from './utils/fileOps.js';

dotenv.config();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Middleware
app.use(express.json());
app.use(express.static('views'));

const cleanGeneratedCode = (text) => {
    // Remove markdown code blocks if present
    text = text.replace(/```(html|javascript|css)?\n/g, '');
    text = text.replace(/```\n?/g, '');
    
    // Ensure we have proper HTML structure
    if (!text.includes('<!DOCTYPE html>')) {
        text = `<!DOCTYPE html>\n${text}`;
    }
    
    return text.trim();
};

// Logging
const logError = (error, context) => {
    console.error('Error Details:', {
        timestamp: new Date().toISOString(),
        context,
        message: error.message,
        stack: error.stack
    });
};

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'loading.html'));
});

app.get('/history', async (req, res) => {
    try {
        const historyPath = path.join(__dirname, 'data', 'backup.json');
        let history = [];
        
        try {
            const data = await fs.readFile(historyPath, 'utf8');
            history = JSON.parse(data);
        } catch (error) {
            // If file doesn't exist, create it with empty array
            await fs.writeFile(historyPath, '[]');
        }
        
        res.json(history);
    } catch (error) {
        console.error('History fetch error:', error);
        res.status(500).json({ error: 'Failed to fetch history' });
    }
});

app.post('/generate', async (req, res) => {
    try {
        const prompt = req.body.prompt;
        
        if (!prompt) {
            return res.status(400).json({ error: 'Prompt is required' });
        }

        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });
        
        const systemInstruction = `systemInstruction:
            -You are a full frontend webpage generator, there will not be any backend code. 
            -You will only return completely functional and outstanding quality code without any 3rd party dependencies.
            - Your response should be a full HTML page with CSS and JavaScript included. 
            - The page should be responsive and mobile-friendly.
            - The HTML should be well-structured and semantic.
            - Use emojis instead of images, if required.
            - All JS and CSS should be inlined.
            Example Response:
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Website Generator</title>
                <style>
                    /* Add your CSS styles here */
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>There is no website</h1>
                    <div class="input-container">
                        <input type="text" id="prompt" placeholder="unless you want one...">
                        <button type="button" onclick="generateWebsite()">Generate</button>
                    </div>
                    <div class="loading" style="display: none;">
                        <div class="spinner"></div>
                        <p class="status">Generating your unique website...</p>
                    </div>
                </div>
                <script>
                    const generateWebsite = async () => {
                        const promptInput = document.getElementById('prompt');
                        const loading = document.querySelector('.loading');
                        const container = document.querySelector('.container');
                        
                        try {
                            loading.style.display = 'flex';
                            container.style.display = 'none';
                            
                            const response = await fetch('/generate', {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                },
                                body: JSON.stringify({ prompt: promptInput.value })
                            });
                            
                            if (!response.ok) throw new Error('Generation failed');
                            const html = await response.text();
                            document.open();
                            document.write(html);
                            document.close();
                        } catch (error) {
                            console.error('Error:', error);
                            loading.style.display = 'none';
                            container.style.display = 'flex';
                            alert('Generation failed. Please try again.');
                        }
                    };
                </script>
            </body>
            </html>`;

        const result = await model.generateContent({
            contents: [
                { role: 'user', parts: [{ text: systemInstruction }, { text: "\nGenerate a webpage based on this prompt: " + prompt }]}],
            generationConfig: {
                temperature: 0.7,
                maxOutputTokens: 8192,
            },
        });

        const website = cleanGeneratedCode(result.response.text());

        if (!website || !website.includes('<html')) {
            throw new Error('Invalid generation: Missing HTML structure');
        }

        // Save to backup
        await saveToBackup(prompt, website);

        res.send(website);

    } catch (error) {
        logError(error, 'Website Generation');
        res.status(500).send(`
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <title>Error</title>
                <style>
                    body { font-family: system-ui; text-align: center; padding: 50px; }
                    .error { max-width: 600px; margin: 0 auto; }
                    button { padding: 10px 20px; margin-top: 20px; }
                </style>
            </head>
            <body>
                <div class="error">
                    <h2>Generation Failed</h2>
                    <p>Please try again with a different prompt</p>
                    <button onclick="window.location='/'">Try Again</button>
                </div>
            </body>
            </html>
        `);
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
