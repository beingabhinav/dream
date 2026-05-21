const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-change-me';

if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
    console.warn('WARNING: JWT_SECRET is not set. Configure it in your deployment environment.');
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
app.post('/api/dreams', authenticateToken, (req, res) => {
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
    // Simulate AI response
    res.status(201).json({
        ...dream,
        aiResponse: `This is a demo AI response for your dream: "${description}"`
    });
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
