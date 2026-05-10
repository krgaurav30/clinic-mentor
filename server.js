require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' })); // Increased limit to handle base64 images

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// API Endpoint to proxy requests to OpenAI
app.post('/api/chat', async (req, res) => {
    try {
        const { messages, model, temperature, max_tokens } = req.body;

        if (!process.env.OPENAI_API_KEY) {
            return res.status(500).json({ error: { message: "Server configuration error: OPENAI_API_KEY is missing." } });
        }

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
            },
            body: JSON.stringify({
                model: model || 'gpt-4o',
                messages: messages,
                temperature: temperature || 0.7,
                max_tokens: max_tokens || 1500
            })
        });

        const data = await response.json();

        if (!response.ok) {
            return res.status(response.status).json(data);
        }

        res.json(data);
    } catch (error) {
        console.error('Error proxying request to OpenAI:', error);
        res.status(500).json({ error: { message: 'Failed to communicate with OpenAI from the backend.' } });
    }
});

// Fallback to index.html for any unknown routes (SPA behavior)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
