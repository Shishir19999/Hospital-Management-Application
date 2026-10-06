import mongoose from "mongoose";
import dotenv from "dotenv";
import { createApp } from './app.js';

dotenv.config();

if (!process.env.JWT_SECRET) {
  console.error('JWT_SECRET is not set. Copy .env.example to .env and set it.');
  process.exit(1);
}

const PORT = process.env.PORT || 8080;
const HOST = process.env.HOST || '0.0.0.0'; // reachable from other devices on the LAN

mongoose.connect(process.env.MONGODB_URL)
  .then(() => console.log('Connected to MongoDB'))
  .catch((err) => console.error('MongoDB connection error:', err));

createApp().listen(PORT, HOST, () => console.log(`Server is running on ${HOST}:${PORT}`));
