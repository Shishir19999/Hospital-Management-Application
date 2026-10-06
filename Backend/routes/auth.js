import express from "express";
import User, { ROLES } from "../models/User.js";
import { authenticate, requireRole, signToken } from "../middleware/auth.js";

const router = express.Router();

const publicUser = (u) => ({ id: u._id, name: u.name, email: u.email, role: u.role });

// Tells the frontend whether the first admin still has to be created.
router.get('/status', async (req, res) => {
    try {
        res.json({ needsSetup: (await User.estimatedDocumentCount()) === 0 });
    } catch (err) {
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Register. The very first account becomes admin (public). After that only admins can create users.
router.post('/register', async (req, res, next) => {
    try {
        if ((await User.estimatedDocumentCount()) === 0) {
            req.firstUser = true;
            return next();
        }
        authenticate(req, res, (err) => {
            if (err) return next(err);
            requireRole('admin')(req, res, next);
        });
    } catch (err) {
        res.status(500).json({ error: 'Internal Server Error' });
    }
}, async (req, res) => {
    try {
        const { name, email, password, role } = req.body || {};
        if (typeof name !== 'string' || !name.trim()) return res.status(400).json({ error: 'Name is required' });
        if (typeof email !== 'string' || !/^\S+@\S+\.\S+$/.test(email.trim())) return res.status(400).json({ error: 'A valid email is required' });
        if (typeof password !== 'string' || password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

        let finalRole = 'admin';
        if (!req.firstUser) {
            finalRole = role || 'receptionist';
            if (!ROLES.includes(finalRole)) return res.status(400).json({ error: `Role must be one of: ${ROLES.join(', ')}` });
        }
        if (await User.exists({ email: email.trim().toLowerCase() })) {
            return res.status(409).json({ error: 'Email already registered' });
        }
        const user = await User.create({ name: name.trim(), email, password, role: finalRole });
        const body = { user: publicUser(user) };
        if (req.firstUser) body.token = signToken(user);
        res.status(201).json(body);
    } catch (err) {
        if (err.code === 11000) return res.status(409).json({ error: 'Email already registered' });
        res.status(400).json({ error: err.message });
    }
});

router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body || {};
        if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }
        const user = await User.findOne({ email: email.trim().toLowerCase() }).select('+password');
        if (!user || !(await user.comparePassword(password))) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        res.json({ token: signToken(user), user: publicUser(user) });
    } catch (err) {
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

router.get('/me', authenticate, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) return res.status(401).json({ error: 'User no longer exists' });
        res.json({ user: publicUser(user) });
    } catch (err) {
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Revokes every token issued so far for this user (all devices).
router.post('/logout', authenticate, async (req, res) => {
    try {
        await User.updateOne({ _id: req.user.id }, { $inc: { tokenVersion: 1 } });
        res.json({ message: 'Logged out' });
    } catch (err) {
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

export default router;
