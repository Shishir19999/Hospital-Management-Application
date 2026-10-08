// Seeds a realistic hospital: staff for every role, 20 doctors, 200 patients, a month of appointments,
// visits, prescriptions, lab orders, invoices, wards and beds, stock and today's live queue.
//   npm run seed            seeds an empty database (refuses to touch existing data)
//   npm run seed -- --reset wipes the hospital collections first, then seeds
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import { MODELS, Counter } from '../models/index.js';
import { buildDataset } from '../../shared/seed.js';

dotenv.config();
const reset = process.argv.includes('--reset');

await mongoose.connect(process.env.MONGODB_URL || 'mongodb://127.0.0.1:27017/hospital');
const existing = await MODELS.users.estimatedDocumentCount();
if (existing && !reset) {
  console.log(`"${mongoose.connection.name}" already has data. Run "npm run seed -- --reset" to replace it.`);
  await mongoose.disconnect();
  process.exit(0);
}
if (reset) {
  for (const model of Object.values(MODELS)) await model.deleteMany({});
  await Counter.deleteMany({});
}

const { collections, counters } = buildDataset({ now: new Date(), tz: new Date().getTimezoneOffset() });

// Passwords are stored hashed; everything else is inserted as built.
const hashes = new Map();
for (const u of collections.users) {
  if (!hashes.has(u.password)) hashes.set(u.password, await bcrypt.hash(u.password, 10));
  u.password = hashes.get(u.password);
}

for (const [name, docs] of Object.entries(collections)) {
  if (docs.length) await MODELS[name].insertMany(docs);
}
for (const [name, value] of Object.entries(counters)) await Counter.updateOne({ name }, { $set: { value } }, { upsert: true });

const counts = Object.entries(collections).map(([k, v]) => `${v.length} ${k}`).join(', ');
console.log(`Seeded "${mongoose.connection.name}": ${counts}.`);
await mongoose.disconnect();
