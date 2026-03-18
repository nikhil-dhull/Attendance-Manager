const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/User');

passport.serializeUser((user, done) => {
    done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
    try {
        const user = await User.findById(id);
        done(null, user);
    } catch (err) {
        done(err, null);
    }
});

const clientID = (process.env.GOOGLE_CLIENT_ID || '').trim();
const clientSecret = (process.env.GOOGLE_CLIENT_SECRET || '').trim();
const callbackURL = (process.env.GOOGLE_CALLBACK_URL || '').trim();

console.log('--- Google OAuth Configuration ---');
console.log('CallbackURL:', callbackURL);
console.log('-------------------------------');

passport.use(new GoogleStrategy({
    clientID,
    clientSecret,
    callbackURL
}, async (accessToken, refreshToken, profile, done) => {
    try {
        let user = await User.findOne({ googleId: profile.id });
        if (!user) {
            // Check if user with same email exists
            const email = profile.emails && profile.emails.length > 0 ? profile.emails[0].value : null;
            if (!email) return done(new Error('No email found in Google profile'), null);

            user = await User.findOne({ email: email });
            
            if (user) {
                // Link Google account to existing email account
                user.googleId = profile.id;
                await user.save();
            } else {
                // Create new user
                let username = profile.displayName || email.split('@')[0];
                
                // Handle username collision
                const existingUsername = await User.findOne({ username });
                if (existingUsername) {
                    const crypto = require('crypto');
                    username = `${username}_${crypto.randomBytes(2).toString('hex')}`;
                }

                user = new User({
                    username: username,
                    email: email,
                    googleId: profile.id,
                    role: 'user' // Explicitly set role, though default is 'user'
                });
                await user.save();
            }
        }
        return done(null, user);
    } catch (err) {
        return done(err, null);
    }
}));
