import { addDays, startOfDay } from '../lib/dates';

// Small deterministic PRNG so the seed looks the same for every visitor.
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST = ['Aarav', 'Maya', 'Liam', 'Sofia', 'Noah', 'Priya', 'Ethan', 'Amara', 'Lucas', 'Hana', 'Omar', 'Elena', 'Daniel', 'Zara', 'Mateo', 'Isla', 'Kenji', 'Nora', 'Samir', 'Chloe', 'Arjun', 'Leila', 'Owen', 'Tara'];
const LAST = ['Sharma', 'Okafor', 'Novak', 'Reyes', 'Lindqvist', 'Haddad', 'Moreau', 'Tanaka', 'Fischer', 'Mbeki', 'Costa', 'Petrov', 'Bianchi', 'Karimi', 'Dubois', 'Walsh', 'Nakamura', 'Silva', 'Rahman', 'Jensen'];
const DOC_SPECIALTIES = ['Cardiology', 'Dermatology', 'Neurology', 'Pediatrics', 'Orthopedics', 'Family Medicine', 'Psychiatry', 'Oncology', 'Ophthalmology', 'Gynecology/Obstetrics', 'Endocrinology', 'General Surgery'];
const CONDITIONS = ['Hypertension', 'Type 2 diabetes', 'Asthma', 'Seasonal allergies', 'Migraine', 'Hypothyroidism', 'Lower back pain', 'Anxiety', 'None recorded'];
const BLOOD = ['A+', 'A-', 'B+', 'B-', 'AB+', 'O+', 'O-'];
const NOTES = [
  'Routine check-up. Vitals within normal range.',
  'Follow-up on previous prescription. Dosage adjusted.',
  'Blood work ordered; results to be reviewed next visit.',
  'Reported mild symptoms improving. Continue current plan.',
  'Referred for imaging. Patient advised to rest and hydrate.',
  'Discussed lifestyle changes and diet. Review in 3 months.',
  'Vaccination administered. No adverse reaction observed.',
  'Pain management reviewed. Physiotherapy recommended.',
];

const SLOT_MINUTES = 30;
const SLOTS = 16; // 09:00 - 17:00

export function buildSeed(now = new Date()) {
  const rnd = mulberry32(20261007);
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const nowMs = new Date(now).getTime();

  const doctors = DOC_SPECIALTIES.map((specialty, i) => ({
    _id: `d${i + 1}`,
    name: `Dr. ${FIRST[(i * 5 + 3) % FIRST.length]} ${LAST[(i * 3 + 1) % LAST.length]}`,
    specialty,
    workingDays: i % 4 === 3 ? [1, 2, 3, 4] : [1, 2, 3, 4, 5],
    hours: '09:00-17:00',
  }));

  const patients = Array.from({ length: 60 }, (_, i) => {
    const first = FIRST[i % FIRST.length];
    const last = LAST[(i * 7 + 2) % LAST.length];
    const age = Math.min(94, Math.round(3 + rnd() * rnd() * 60 + rnd() * 35));
    return {
      _id: `p${i + 1}`,
      name: `${first} ${last}`,
      age,
      gender: rnd() < 0.48 ? 'Female' : rnd() < 0.96 ? 'Male' : 'Other',
      email: `${first}.${last}${i + 1}@example.com`.toLowerCase(),
      phone: `+1 555 01${String(10 + i).padStart(2, '0')}`,
      bloodGroup: pick(BLOOD),
      conditions: pick(CONDITIONS),
    };
  });

  const appointments = [];
  let n = 0;
  const today = startOfDay(now);
  for (const doc of doctors) {
    for (let off = -35; off <= 28; off++) {
      const day = addDays(today, off);
      const dow = day.getDay();
      if (!doc.workingDays.includes(dow)) continue;
      const near = Math.abs(off) <= 7;
      const count = near ? 2 + Math.floor(rnd() * 3) : Math.floor(rnd() * 3);
      const used = new Set();
      for (let k = 0; k < count; k++) {
        const slot = Math.floor(rnd() * SLOTS);
        if (used.has(slot)) continue;
        const long = rnd() < 0.2 && slot < SLOTS - 1 && !used.has(slot + 1);
        used.add(slot);
        if (long) used.add(slot + 1);
        const start = new Date(day);
        start.setHours(9, slot * SLOT_MINUTES, 0, 0);
        const past = start.getTime() < nowMs;
        let status = 'scheduled';
        if (past) status = rnd() < 0.88 ? 'completed' : 'cancelled';
        else if (rnd() < 0.08) status = 'cancelled';
        const patient = pick(patients);
        appointments.push({
          _id: `a${++n}`,
          patient: patient._id,
          doctor: doc._id,
          date: start.toISOString(),
          duration: long ? 60 : 30,
          status,
          notes: status === 'completed' ? pick(NOTES) : '',
        });
      }
    }
  }
  return { patients, doctors, appointments };
}
