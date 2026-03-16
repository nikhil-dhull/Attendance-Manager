require('dotenv').config();
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const path = require('path');
const connectDB = require('./config/db');
const User = require('./models/User');
const Subject = require('./models/Subject');
const passport = require('passport');

const app = express();
const PORT = process.env.PORT || 3000;

// Connect to MongoDB & Initialize Admin
connectDB().then(async () => {
    // Create Admin User if not exists
    const adminEmail = 'nikhildhull5652@gmail.com';
    const adminExists = await User.findOne({ email: adminEmail });
    if (!adminExists) {
        const hashedPassword = await bcrypt.hash('123456789@Nikhil', 10);
        const admin = new User({
            username: 'admin',
            email: adminEmail,
            password_hash: hashedPassword,
            role: 'admin'
        });
        await admin.save();
        console.log('Admin user created');
    } else if (adminExists.role !== 'admin') {
        adminExists.role = 'admin';
        await adminExists.save();
        console.log('Existing admin user role updated');
    }
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session configuration
app.use(session({
    secret: process.env.SESSION_SECRET || 'super_secret_genz_key_123!@#',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: false, 
        maxAge: 1000 * 60 * 60 * 24 
    }
}));

// Initialize Passport
require('./config/passport');
app.use(passport.initialize());
app.use(passport.session());

// Test route
app.get('/api/ping', (req, res) => {
    res.json({ message: 'pong' });
});

// Serve static files from the frontend directory
app.use(express.static(path.join(__dirname, '../frontend')));

// Auth Middleware
const requireAuth = (req, res, next) => {
    if (req.session.userId) {
        next();
    } else {
        res.status(401).json({ error: 'Unauthorized' });
    }
};

const isAdmin = async (req, res, next) => {
    console.log('isAdmin middleware check for:', req.session.userId);
    if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
    try {
        const user = await User.findById(req.session.userId);
        console.log('User found:', user ? user.username : 'none', 'Role:', user ? user.role : 'none');
        if (user && user.role === 'admin') {
            next();
        } else {
            console.log('Access denied: not an admin');
            res.status(403).json({ error: 'Forbidden: Admins only' });
        }
    } catch (err) {
        console.error('isAdmin error:', err);
        res.status(500).json({ error: 'Server error' });
    }
};

// --- AUTHENTICATION ROUTES ---

// Signup
app.post('/api/signup', async (req, res) => {
    const { username, email, password } = req.body;
    if (!username || !email || !password) return res.status(400).json({ error: 'All fields are required' });

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        
        const newUser = new User({
            username,
            email,
            password_hash: hashedPassword
        });

        await newUser.save();
        
        // Log them in immediately
        req.session.userId = newUser._id;
        req.session.username = username;
        res.status(201).json({ message: 'User created successfully', username });
    } catch (err) {
        if (err.code === 11000) {
            return res.status(400).json({ error: 'Username already exists' });
        }
        res.status(500).json({ error: 'Server error' });
    }
});

// Login
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    try {
        const user = await User.findOne({ email });
        if (!user) return res.status(401).json({ error: 'Invalid credentials' });

        const match = await bcrypt.compare(password, user.password_hash);
        if (match) {
            req.session.userId = user._id;
            req.session.username = user.username;
            req.session.role = user.role;
            res.json({ message: 'Logged in successfully', username: user.username, role: user.role });
        } else {
            res.status(401).json({ error: 'Invalid credentials' });
        }
    } catch (err) {
        res.status(500).json({ error: 'Database error' });
    }
});

// Google OAuth Routes
app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

app.get('/auth/google/callback', 
    passport.authenticate('google', { failureRedirect: '/login.html' }),
    (req, res) => {
        // Successful authentication
        req.session.userId = req.user._id;
        req.session.username = req.user.username;
        req.session.role = req.user.role;
        res.redirect('/');
    }
);

// Forgot Password
app.post('/api/forgot-password', async (req, res) => {
    const { email } = req.body;
    try {
        const user = await User.findOne({ email });
        if (!user) return res.status(404).json({ error: 'User not found' });

        const crypto = require('crypto');
        const token = crypto.randomBytes(20).toString('hex');
        user.resetPasswordToken = token;
        user.resetPasswordExpires = Date.now() + 3600000; // 1 hour
        await user.save();

        const nodemailer = require('nodemailer');
        const transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: process.env.SMTP_PORT,
            secure: false,
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS
            }
        });

        const resetUrl = `http://${req.headers.host}/reset-password.html?token=${token}`;
        const mailOptions = {
            to: user.email,
            from: process.env.SMTP_USER,
            subject: 'Password Reset',
            text: `You are receiving this because you (or someone else) have requested the reset of the password for your account.\n\n` +
                  `Please click on the following link, or paste this into your browser to complete the process:\n\n` +
                  `${resetUrl}\n\n` +
                  `If you did not request this, please ignore this email and your password will remain unchanged.\n`
        };

        await transporter.sendMail(mailOptions);
        res.json({ message: 'Reset email sent' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error sending email' });
    }
});

// Reset Password
app.post('/api/reset-password/:token', async (req, res) => {
    try {
        const user = await User.findOne({
            resetPasswordToken: req.params.token,
            resetPasswordExpires: { $gt: Date.now() }
        });

        if (!user) return res.status(400).json({ error: 'Password reset token is invalid or has expired' });

        user.password_hash = await bcrypt.hash(req.body.password, 10);
        user.resetPasswordToken = undefined;
        user.resetPasswordExpires = undefined;
        await user.save();

        res.json({ message: 'Password has been reset' });
    } catch (err) {
        res.status(500).json({ error: 'Error resetting password' });
    }
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
        res.json({ 
            loggedIn: true, 
            username: req.session.username,
            role: req.session.role 
        });
    } else {
        res.json({ loggedIn: false });
    }
});

// Admin Stats
app.get('/api/admin/stats', isAdmin, async (req, res) => {
    console.log('Admin stats route reached');
    try {
        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);

        const usersThisMonth = await User.countDocuments({
            createdAt: { $gte: startOfMonth }
        });

        const totalUsers = await User.countDocuments();
        const totalSubjects = await Subject.countDocuments();

        res.json({
            usersThisMonth,
            totalUsers,
            totalSubjects
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error fetching stats' });
    }
});

// --- SUBJECTS API ---

// Get all subjects for current user
app.get('/api/subjects', requireAuth, async (req, res) => {
    try {
        const subjects = await Subject.find({ user_id: req.session.userId });
        res.json(subjects);
    } catch (err) {
        res.status(500).json({ error: 'Database error' });
    }
});

// Add a new subject
app.post('/api/subjects', requireAuth, async (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Subject name required' });

    try {
        const newSubject = new Subject({
            user_id: req.session.userId,
            name,
            attended: 0,
            total: 0
        });
        await newSubject.save();
        res.status(201).json(newSubject);
    } catch (err) {
        res.status(500).json({ error: 'Database error' });
    }
});

// Update a subject (name and attendance marks)
app.put('/api/subjects/:id', requireAuth, async (req, res) => {
    const subjectId = req.params.id;
    const { name, attended, total } = req.body;
    
    try {
        const updatedSubject = await Subject.findOneAndUpdate(
            { _id: subjectId, user_id: req.session.userId },
            { name, attended, total },
            { new: true }
        );

        if (!updatedSubject) return res.status(404).json({ error: 'Subject not found or unauthorized' });
        res.json({ message: 'Subject updated successfully', subject: updatedSubject });
    } catch (err) {
        res.status(500).json({ error: 'Database error' });
    }
});

// Delete a subject
app.delete('/api/subjects/:id', requireAuth, async (req, res) => {
    const subjectId = req.params.id;
    
    try {
        const deletedSubject = await Subject.findOneAndDelete({ _id: subjectId, user_id: req.session.userId });
        if (!deletedSubject) return res.status(404).json({ error: 'Subject not found or unauthorized' });
        res.json({ message: 'Subject deleted successfully' });
    } catch (err) {
        res.status(500).json({ error: 'Database error' });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
