const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-change-me';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
    console.warn('WARNING: JWT_SECRET is not set. Configure it in your deployment environment.');
}

if (process.env.NODE_ENV === 'production' && !GEMINI_API_KEY) {
    console.warn('WARNING: GEMINI_API_KEY is not set. AI responses will use the local fallback.');
}

// Middleware
app.use(cors({
    origin: process.env.CORS_ORIGIN || true,
    credentials: true
}));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Temporary storage (replace with proper database in production)
const users = [];
const dreams = [];

function localDreamAnalysis({ description, sleepQuality, sleepHours, feelings }) {
    const dream = String(description || '').toLowerCase();
    const parts = [
        `Based on your ${sleepQuality || 'average'} sleep quality and ${sleepHours || 'unknown'} hours of sleep, this dream may reflect how your mind was processing recent emotion and memory.`
    ];

    if (feelings) {
        parts.push(`The feeling of ${feelings} on waking is important because dream emotion often points to what your attention is trying to resolve.`);
    }
    if (dream.includes('fly') || dream.includes('flying')) {
        parts.push('Flying often points toward freedom, distance from pressure, or a wish to see a situation from above.');
    }
    if (dream.includes('fall') || dream.includes('falling')) {
        parts.push('Falling can suggest uncertainty, loss of control, or a transition that feels hard to steady.');
    }
    if (dream.includes('chase') || dream.includes('running')) {
        parts.push('Being chased may reflect avoidance, pressure, or a conflict your waking mind has not fully faced.');
    }
    if (dream.includes('water')) {
        parts.push('Water often mirrors emotional depth, clarity, overwhelm, or renewal depending on how it appeared.');
    }
    if (dream.includes('house') || dream.includes('home')) {
        parts.push('A house or home commonly represents the self, family patterns, or the private spaces of your life.');
    }

    parts.push('Tell me which symbol, feeling, or scene stood out most, and we can go deeper.');
    return parts.join(' ');
}

function fallbackChatReply(message) {
    const lower = String(message || '').toLowerCase();

    if (lower.includes('recurring')) {
        return 'Recurring dreams often return because a pattern is still active. Track what repeats, what changes, and what emotion is present each time.';
    }
    if (lower.includes('nightmare')) {
        return 'Nightmares can be the mind rehearsing threat, stress, or unresolved emotion. A helpful first step is naming the fear and imagining one small change that gives you agency.';
    }
    if (lower.includes('lucid')) {
        return 'Lucid dreaming starts with recall. Keep a short dream journal, look for recurring signs, and practice simple reality checks during the day.';
    }
    if (lower.includes('symbol')) {
        return 'Dream symbols become clearer when paired with your own associations. Choose one symbol and notice the first memory, person, or feeling it brings up.';
    }
    if (lower.includes('water')) {
        return 'Water often represents emotion. Calm water can suggest steadiness, while waves, floods, or murky water may point to intensity or uncertainty.';
    }
    if (lower.includes('flying')) {
        return 'Flying dreams often carry themes of freedom, perspective, ambition, or escape. The key detail is whether the flight felt effortless or difficult.';
    }

    return 'Share the strongest image from the dream and how it felt. The best interpretations usually start from emotion, then move into symbols.';
}

async function generateWithGemini(prompt) {
    if (!GEMINI_API_KEY) return null;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': GEMINI_API_KEY
        },
        body: JSON.stringify({
            contents: [
                {
                    role: 'user',
                    parts: [{ text: prompt }]
                }
            ],
            generationConfig: {
                temperature: 0.7,
                maxOutputTokens: 450
            }
        })
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(data.error?.message || 'Gemini request failed');
    }

    return data.candidates?.[0]?.content?.parts
        ?.map((part) => part.text || '')
        .join('')
        .trim() || null;
}

async function createAiResponse({ mode, message, dreamData, conversationHistory = [] }) {
    const safeMode = mode || 'assistant';
    const prompt = [
        'You are DreamScape AI, a thoughtful dream analysis assistant.',
        'Keep replies helpful, grounded, and under 180 words.',
        'Avoid diagnosing medical or mental health conditions.',
        '',
        `Mode: ${safeMode}`,
        dreamData ? `Dream: ${dreamData.description || ''}` : '',
        dreamData ? `Sleep quality: ${dreamData.sleepQuality || 'average'}` : '',
        dreamData ? `Sleep hours: ${dreamData.sleepHours || 'unknown'}` : '',
        dreamData ? `Waking feelings: ${dreamData.feelings || 'not provided'}` : '',
        conversationHistory.length ? `Recent conversation: ${JSON.stringify(conversationHistory.slice(-6))}` : '',
        message ? `User message: ${message}` : '',
        '',
        safeMode === 'dream'
            ? 'Give an interpretation with likely themes, symbols, emotions, and one gentle follow-up question.'
            : 'Answer the user in the context of dream interpretation.'
    ].filter(Boolean).join('\n');

    try {
        const geminiText = await generateWithGemini(prompt);
        if (geminiText) return geminiText;
    } catch (error) {
        console.error('Gemini error:', error.message);
    }

    return safeMode === 'dream'
        ? localDreamAnalysis(dreamData || {})
        : fallbackChatReply(message);
}

// Authentication middleware
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.sendStatus(401);

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
};

// Serve login page
app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Routes
app.post('/api/register', async (req, res) => {
    try {
        const name = String(req.body.name || '').trim();
        const email = String(req.body.email || '').trim().toLowerCase();
        const password = String(req.body.password || '');

        if (!name || !email || !password) {
            return res.status(400).json({ message: 'Name, email, and password are required' });
        }

        if (password.length < 8) {
            return res.status(400).json({ message: 'Password must be at least 8 characters' });
        }

        // Check if user already exists
        if (users.find(u => u.email === email)) {
            return res.status(400).json({ message: 'User already exists' });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create user
        const user = {
            id: users.length + 1,
            name,
            email,
            password: hashedPassword
        };

        users.push(user);

        res.status(201).json({ message: 'User created successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Error creating user' });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const email = String(req.body.email || '').trim().toLowerCase();
        const password = String(req.body.password || '');

        if (!email || !password) {
            return res.status(400).json({ message: 'Email and password are required' });
        }

        // Find user
        const user = users.find(u => u.email === email);
        if (!user) {
            return res.status(400).json({ message: 'User not found' });
        }

        // Check password
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(400).json({ message: 'Invalid password' });
        }

        // Create token
        const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });

        res.json({ token, user: { id: user.id, name: user.name, email: user.email } });
    } catch (error) {
        res.status(500).json({ message: 'Error logging in' });
    }
});

// Dream routes
app.post('/api/dreams', authenticateToken, async (req, res) => {
    const description = String(req.body.description || '').trim();
    const sleepQuality = String(req.body.sleepQuality || 'average').trim();
    const sleepHours = Number(req.body.sleepHours || 0);
    const feelings = String(req.body.feelings || '').trim();

    if (!description) {
        return res.status(400).json({ message: 'Dream description is required' });
    }
    
    const dream = {
        id: dreams.length + 1,
        userId: req.user.id,
        description,
        sleepQuality,
        sleepHours,
        feelings,
        timestamp: new Date()
    };

    dreams.push(dream);
    const aiResponse = await createAiResponse({
        mode: 'dream',
        dreamData: dream
    });

    res.status(201).json({
        ...dream,
        aiResponse
    });
});

app.post('/api/analyze', async (req, res) => {
    const mode = String(req.body.mode || 'assistant').trim();
    const message = String(req.body.message || '').trim();
    const dreamData = req.body.dreamData || null;
    const conversationHistory = Array.isArray(req.body.conversationHistory) ? req.body.conversationHistory : [];

    if (!message && mode !== 'dream') {
        return res.status(400).json({ message: 'Message is required' });
    }

    const response = await createAiResponse({
        mode,
        message,
        dreamData,
        conversationHistory
    });

    res.json({ response });
});

app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', app: 'dreamscape-ai' });
});

app.get('/api/dreams', authenticateToken, (req, res) => {
    const userDreams = dreams.filter(dream => dream.userId === req.user.id);
    res.json(userDreams);
});

// Catch-all route to handle client-side routing
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
}

module.exports = app;
