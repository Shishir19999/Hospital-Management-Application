import mongoose from "mongoose";
import bcrypt from "bcryptjs";

export const ROLES = ['admin', 'doctor', 'receptionist'];

const userSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, select: false },
    role: { type: String, enum: ROLES, default: 'receptionist', required: true },
    // Bumped on logout; tokens carry the version they were issued with.
    tokenVersion: { type: Number, default: 0 },
}, { timestamps: true });

userSchema.pre('save', async function () {
    if (!this.isModified('password')) return;
    this.password = await bcrypt.hash(this.password, 10);
});

userSchema.methods.comparePassword = function (plain) {
    return bcrypt.compare(plain, this.password);
};

const User = mongoose.models.User || mongoose.model('User', userSchema);

export default User;
