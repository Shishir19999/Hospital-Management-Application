// Idempotent seed: demo users, doctors, patients and upcoming appointments. Run with `npm run seed`.
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../models/User.js';
import Doctor from '../models/Doctor.js';
import Patient from '../models/Patient.js';
import Appointment from '../models/Appointment.js';
import { faker } from '@faker-js/faker';

dotenv.config();
faker.seed(20260602);
const REF = new Date('2026-10-06T00:00:00Z'); // fixed reference date
const EXTRA_DOCTORS = 15, EXTRA_PATIENTS = 140, APPTS_PER_DOCTOR = 15;
const SPECIALTIES = ['Cardiology', 'Neurology', 'Pediatrics', 'Orthopedics', 'Dermatology', 'Oncology', 'Psychiatry', 'Radiology', 'Gastroenterology', 'Endocrinology', 'Ophthalmology', 'ENT', 'Urology', 'Nephrology', 'Pulmonology', 'Gynecology', 'General Medicine', 'Rheumatology', 'Anesthesiology', 'Emergency Medicine'];

const users = [
  { name: 'Admin User', email: 'admin@example.com', password: 'Admin@123', role: 'admin' },
  { name: 'Rita Receptionist', email: 'receptionist@example.com', password: 'Reception@123', role: 'receptionist' },
  { name: 'Dr. Demo', email: 'doctor@example.com', password: 'Doctor@123', role: 'doctor' },
];
const doctors = [
  ['Dr. Anita Sharma', 'Cardiology'], ['Dr. Rahul Mehta', 'Neurology'], ['Dr. Priya Nair', 'Pediatrics'],
  ['Dr. Karan Verma', 'Orthopedics'], ['Dr. Sara Khan', 'Dermatology'],
];
const patients = [
  ['John Carter', 45, 'Male'], ['Maria Lopez', 32, 'Female'], ['Aarav Patel', 8, 'Male'], ['Emily Chen', 27, 'Female'],
  ['Robert Brown', 67, 'Male'], ['Fatima Ali', 54, 'Female'], ['Liam Walker', 19, 'Male'], ['Sofia Rossi', 39, 'Female'],
  ['Noah Kim', 12, 'Male'], ['Alex Morgan', 30, 'Other'],
];

await mongoose.connect(process.env.MONGODB_URL || 'mongodb://127.0.0.1:27017/hospital');

for (const u of users) {
  if (!(await User.exists({ email: u.email }))) await User.create(u); // password hashed by the model hook
}
const doctorDocs = [];
for (const [name, specialty] of doctors) {
  doctorDocs.push((await Doctor.findOne({ name })) || (await Doctor.create({ name, specialty })));
}
const patientDocs = [];
for (const [name, age, gender] of patients) {
  patientDocs.push((await Patient.findOne({ name })) || (await Patient.create({ name, age, gender })));
}

// One upcoming appointment per patient, spread over the next days; skipped when the patient already has one with that doctor.
const base = new Date(REF.getTime() + 24 * 3600e3);
base.setUTCHours(9, 0, 0, 0); // legacy demo slots occupy 09:00-10:30 UTC; generated ones start at 11:00
let added = 0;
for (let i = 0; i < patientDocs.length; i++) {
  const doctor = doctorDocs[i % doctorDocs.length];
  const patient = patientDocs[i];
  if (await Appointment.exists({ patient: patient._id, doctor: doctor._id })) continue;
  const date = new Date(base.getTime() + Math.floor(i / doctorDocs.length) * 24 * 3600e3 + (i % doctorDocs.length) * 30 * 60e3);
  await Appointment.create({ patient: patient._id, doctor: doctor._id, date, duration: 30 });
  await Doctor.updateOne({ _id: doctor._id }, { $addToSet: { history: patient._id } });
  added++;
}

// Extra doctors (natural key: name) and patients (natural key: name)
const usedNames = new Set(doctorDocs.map((d) => d.name));
for (let i = 0; i < EXTRA_DOCTORS; i++) {
  let name;
  do { name = `Dr. ${faker.person.firstName()} ${faker.person.lastName()}`; } while (usedNames.has(name));
  usedNames.add(name);
  doctorDocs.push((await Doctor.findOne({ name })) || (await Doctor.create({ name, specialty: SPECIALTIES[(i + 5) % SPECIALTIES.length] })));
}
const usedPatients = new Set(patientDocs.map((p) => p.name));
for (let i = 0; i < EXTRA_PATIENTS; i++) {
  let name;
  do { name = faker.person.fullName(); } while (usedPatients.has(name));
  usedPatients.add(name);
  const age = faker.number.int({ min: 1, max: 90 });
  const gender = faker.helpers.arrayElement(['Male', 'Female', 'Male', 'Female', 'Other']);
  const doctor = faker.helpers.arrayElement(doctorDocs)._id;
  let p = await Patient.findOne({ name });
  if (!p) p = await Patient.create({ name, age, gender, doctor });
  patientDocs.push(p);
}

// Generated appointments: weekdays 11:00-17:30 UTC on a 30-min grid, 30 or 60 min long, never overlapping per doctor.
// Upserted by (doctor, date); roughly 60% past and 40% future relative to the fixed reference date.
const taken = new Set(); // `${doctorIndex}|${slotMillis}`
let generated = 0;
for (let d = 0; d < doctorDocs.length; d++) {
  let made = 0, guard = 0;
  while (made < APPTS_PER_DOCTOR && guard++ < 500) {
    const past = faker.number.float() < 0.6;
    const offset = past ? -faker.number.int({ min: 1, max: 90 }) : faker.number.int({ min: 1, max: 60 });
    const day = new Date(REF.getTime() + offset * 24 * 3600e3);
    if ([0, 6].includes(day.getUTCDay())) continue;
    const slot = faker.number.int({ min: 0, max: 12 }); // 11:00 .. 17:00
    const wantsLong = faker.number.float() < 0.3;
    const duration = wantsLong && slot <= 11 ? 60 : 30;
    const cells = duration / 30;
    const startMs = day.getTime() + (11 * 60 + slot * 30) * 60e3;
    const keys = Array.from({ length: cells }, (_, c) => `${d}|${startMs + c * 30 * 60e3}`);
    if (keys.some((k) => taken.has(k))) continue;
    keys.forEach((k) => taken.add(k));
    const patient = faker.helpers.arrayElement(patientDocs);
    await Appointment.updateOne({ doctor: doctorDocs[d]._id, date: new Date(startMs) }, { $set: { patient: patient._id, duration } }, { upsert: true });
    await Doctor.updateOne({ _id: doctorDocs[d]._id }, { $addToSet: { history: patient._id } });
    made++; generated++;
  }
}

console.log(`Seed done in "${mongoose.connection.name}": ${await User.countDocuments()} users, ${await Doctor.countDocuments()} doctors, ${await Patient.countDocuments()} patients, ${await Appointment.countDocuments()} appointments (+${added} new).`);
await mongoose.disconnect();
