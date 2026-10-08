import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import User from "../models/User.js";

export function signToken(user) {
    return jwt.sign(
        { id: String(user._id), role: user.role, name: user.name, tv: user.tokenVersion ?? 0 },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRE || '1d' }
    );
}

// Verifies "Authorization: Bearer <token>", then checks the user still exists, is active and the
// token's version matches (logout bumps tokenVersion, revoking every earlier token).
// Resolves to { user } or { error }; the shared engine decides whether authentication is required.
export async function authenticateRequest(req) {
    const header = req.headers.authorization;
    if (!header) return { user: null };
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) return { error: 'Authentication required' };
    let payload;
    try {
        payload = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
        return { error: 'Invalid or expired token' };
    }
    const user = await User.findById(payload.id).select('role name tokenVersion doctor active');
    if (!user) return { error: 'User no longer exists' };
    if ((payload.tv ?? 0) !== (user.tokenVersion ?? 0)) return { error: 'Token has been revoked' };
    if (user.active === false) return { error: 'This account has been disabled' };
    return { user: { id: String(user._id), role: user.role, name: user.name, doctor: user.doctor ? String(user.doctor) : null } };
}

// Password helpers handed to the shared services.
export const passwordHelpers = {
    hashPassword: (plain) => bcrypt.hash(plain, 10),
    // Returns the full user (with ObjectId fields as plain strings) or null.
    async verifyPassword(email, plain) {
        const user = await User.findOne({ email }).select('+password');
        if (!user || !(await user.comparePassword(plain))) return null;
        const doc = user.toObject();
        delete doc.password;
        return JSON.parse(JSON.stringify(doc));
    },
    signToken,
};
