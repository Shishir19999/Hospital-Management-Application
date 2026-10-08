import mongoose from "mongoose";
import bcrypt from "bcryptjs";

export { ROLES } from "../../shared/policy.js";
import { ROLES } from "../../shared/policy.js";

const HASHED = /^\$2[aby]\$\d\d\$/;

const userSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, select: false },
    role: { type: String, enum: ROLES, default: 'receptionist', required: true },
    // Doctor accounts point at their Doctor record (used for "my day" and "my patients").
    doctor: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor', default: null },
    active: { type: Boolean, default: true },
    // Bumped on logout; tokens carry the version they were issued with.
    tokenVersion: { type: Number, default: 0 },
    // Notification ids the user has dismissed.
    readNotifications: { type: [String], default: [] },
}, { timestamps: true });

userSchema.pre('save', async function () {
    if (!this.isModified('password') || HASHED.test(this.password)) return;
    this.password = await bcrypt.hash(this.password, 10);
});

userSchema.methods.comparePassword = function (plain) {
    return bcrypt.compare(plain, this.password);
};

const User = mongoose.models.User || mongoose.model('User', userSchema);

export default User;
