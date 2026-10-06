import jwt from "jsonwebtoken";
import User from "../models/User.js";

export function signToken(user) {
    return jwt.sign(
        { id: user._id.toString(), role: user.role, name: user.name, tv: user.tokenVersion ?? 0 },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRE || '1d' }
    );
}

// Verifies "Authorization: Bearer <token>", then checks the user still exists and the
// token's version matches (logout bumps tokenVersion, revoking every earlier token).
// Sets req.user = { id, role, name }.
export async function authenticate(req, res, next) {
    const [scheme, token] = (req.headers.authorization || '').split(' ');
    if (scheme !== 'Bearer' || !token) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    let payload;
    try {
        payload = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
        return res.status(401).json({ error: 'Invalid or expired token' });
    }
    try {
        const user = await User.findById(payload.id).select('role name tokenVersion');
        if (!user) return res.status(401).json({ error: 'User no longer exists' });
        if ((payload.tv ?? 0) !== (user.tokenVersion ?? 0)) {
            return res.status(401).json({ error: 'Token has been revoked' });
        }
        req.user = { id: user._id.toString(), role: user.role, name: user.name };
        next();
    } catch (err) {
        return res.status(500).json({ error: 'Internal Server Error' });
    }
}

// Use after authenticate: requireRole('admin', 'receptionist')
export const requireRole = (...roles) => (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
        return res.status(403).json({ error: 'You do not have permission to perform this action' });
    }
    next();
};
