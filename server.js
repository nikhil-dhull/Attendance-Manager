const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const path = require('path');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Session configuration
app.use(session({
    secret: 'super_secret_genz_key_123!@#',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: false, // Set to true if using HTTPS in production
        maxAge: 1000 * 60 * 60 * 24 // 24 hours
    }
}));

// Auth Middleware
const requireAuth = (req, res, next) => {
    if (req.session.userId) {
        next();
    } else {
        res.status(401).json({ error: 'Unauthorized' });
    }
};

// --- AUTHENTICATION ROUTES ---

// Signup
app.post('/api/signup', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        
        db.run('INSERT INTO users (username, password_hash) VALUES (?, ?)', [username, hashedPassword], function(err) {
            if (err) {
                if (err.message.includes('UNIQUE constraint failed')) {
                    return res.status(400).json({ error: 'Username already exists' });
                }
                return res.status(500).json({ error: 'Database error' });
            }
            
            // Log them in immediately
            req.session.userId = this.lastID;
            req.session.username = username;
            res.status(201).json({ message: 'User created successfully', username });
        });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Login
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

    db.get('SELECT * FROM users WHERE username = ?', [username], async (err, user) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        if (!user) return res.status(401).json({ error: 'Invalid credentials' });

        const match = await bcrypt.compare(password, user.password_hash);
        if (match) {
            req.session.userId = user.id;
            req.session.username = user.username;
            res.json({ message: 'Logged in successfully', username: user.username });
        } else {
            res.status(401).json({ error: 'Invalid credentials' });
        }
    });
});

// Logout
app.post('/api/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) return res.status(500).json({ error: 'Could not log out' });
        res.json({ message: 'Logged out successfully' });
    });
});

// Check Session
app.get('/api/session', (req, res) => {
    if (req.session.userId) {
        res.json({ loggedIn: true, username: req.session.username });
    } else {
        res.json({ loggedIn: false });
    }
});

// --- SUBJECTS API ---

// Get all subjects for current user
app.get('/api/subjects', requireAuth, (req, res) => {
    db.all('SELECT * FROM subjects WHERE user_id = ?', [req.session.userId], (err, rows) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json(rows);
    });
});

// Add a new subject
app.post('/api/subjects', requireAuth, (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Subject name required' });

    db.run('INSERT INTO subjects (user_id, name, attended, total) VALUES (?, ?, 0, 0)', 
        [req.session.userId, name], 
        function(err) {
            if (err) return res.status(500).json({ error: 'Database error' });
            res.status(201).json({ id: this.lastID, name: name, attended: 0, total: 0 });
        }
    );
});

// Update a subject (name and attendance marks)
app.put('/api/subjects/:id', requireAuth, (req, res) => {
    const subjectId = req.params.id;
    const { name, attended, total } = req.body;
    
    db.run('UPDATE subjects SET name = ?, attended = ?, total = ? WHERE id = ? AND user_id = ?',
        [name, attended, total, subjectId, req.session.userId],
        function(err) {
            if (err) return res.status(500).json({ error: 'Database error' });
            if (this.changes === 0) return res.status(404).json({ error: 'Subject not found or unauthorized' });
            res.json({ message: 'Subject updated successfully' });
        }
    );
});

// Delete a subject
app.delete('/api/subjects/:id', requireAuth, (req, res) => {
    const subjectId = req.params.id;
    
    db.run('DELETE FROM subjects WHERE id = ? AND user_id = ?',
        [subjectId, req.session.userId],
        function(err) {
            if (err) return res.status(500).json({ error: 'Database error' });
            if (this.changes === 0) return res.status(404).json({ error: 'Subject not found or unauthorized' });
            res.json({ message: 'Subject deleted successfully' });
        }
    );
});

// Start server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
