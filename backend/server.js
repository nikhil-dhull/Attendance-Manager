require('dotenv').config();
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const path = require('path');
const connectDB = require('./config/db');
const User = require('./models/User');
const Subject = require('./models/Subject');
const passport = require('passport');
const nodemailer = require('nodemailer');

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

// Forgot Password - Send OTP
app.post('/api/forgot-password', async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    try {
        const user = await User.findOne({ email: email.trim() });
        if (!user) return res.status(404).json({ error: 'User not found' });

        // Generate 6-digit OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        user.resetPasswordOTP = otp;
        user.resetPasswordOTPExpires = Date.now() + 600000; // 10 minutes
        await user.save();


        const transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST?.trim(),
            // ye change ki h
            port: parseInt(process.env.SMTP_PORT?.trim(), 10),
            secure: false,
            auth: {
                user: process.env.SMTP_USER?.trim(),
                pass: process.env.SMTP_PASS?.trim()
            }
        });

        const mailOptions = {
            to: user.email,
            from: process.env.SMTP_USER?.trim(),
            subject: 'Your Password Reset OTP - Attendance Pro',
            text: `Your One-Time Password (OTP) for resetting your password is: ${otp}`,
            html: `
                <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f1f5f9; padding: 40px; color: #1e293b;">
                    <div style="max-width: 500px; margin: 0 auto; background: white; border-radius: 24px; padding: 40px; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1);">
                        <div style="text-align: center; margin-bottom: 24px;">
                            <h1 style="color: #6366f1; margin: 0; font-size: 28px; font-weight: 800;">Attendance Pro</h1>
                            <p style="color: #64748b; margin: 4px 0 0 0; font-size: 16px;">Security Verification</p>
                        </div>
                        <p style="font-size: 16px; line-height: 1.6; color: #475569; text-align: center;">
                            You requested to reset your password. Use the following 6-digit One-Time Password (OTP) to proceed:
                        </p>
                        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 16px; padding: 24px; text-align: center; margin: 32px 0;">
                            <span style="font-size: 36px; font-weight: 800; letter-spacing: 8px; color: #1e293b;">${otp}</span>
                        </div>
                        <p style="font-size: 14px; color: #94a3b8; text-align: center; margin-bottom: 0;">
                            This OTP will expire in <strong>10 minutes</strong>.<br>
                            If you didn't request this, please ignore this email.
                        </p>
                        <div style="border-top: 1px solid #f1f5f9; margin-top: 40px; padding-top: 24px; text-align: center; font-size: 12px; color: #cbd5e1;">
                            &copy; ${new Date().getFullYear()} Attendance Pro. Modern Attendance Management.
                        </div>
                    </div>
                </div>
            `
        };

        await transporter.sendMail(mailOptions);
        res.json({ message: 'OTP sent to your email' });
    } catch (err) {
        console.error('Forgot password error:', err);
        res.status(500).json({ error: 'Error sending OTP' });
    }
});

// Reset Password using OTP
app.post('/api/reset-password-otp', async (req, res) => {
    const { email, otp, password } = req.body;
    if (!email || !otp || !password) {
        return res.status(400).json({ error: 'All fields are required' });
    }

    try {
        const user = await User.findOne({
            email: email.trim(),
            resetPasswordOTP: otp.trim(),
            resetPasswordOTPExpires: { $gt: Date.now() }
        });

        if (!user) return res.status(400).json({ error: 'Invalid or expired OTP' });

        user.password_hash = await bcrypt.hash(password, 10);
        user.resetPasswordOTP = undefined;
        user.resetPasswordOTPExpires = undefined;
        // Also clear old token fields if they exist
        user.resetPasswordToken = undefined;
        user.resetPasswordExpires = undefined;
        
        await user.save();

        res.json({ message: 'Password has been reset successfully' });
    } catch (err) {
        console.error('Reset password error:', err);
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



