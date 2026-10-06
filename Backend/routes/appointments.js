import express from "express";
import mongoose from "mongoose";
const router = express.Router();
import Appointment from '../models/Appointment.js';
import Patient from '../models/Patient.js';
import Doctor from '../models/Doctor.js';
import { requireRole } from '../middleware/auth.js';
import { parsePaging, paginate, escapeRegex } from '../utils/paginate.js';

// Read: any authenticated role. Create/update/delete: admin + receptionist.
const canWrite = requireRole('admin', 'receptionist');

const DEFAULT_DURATION = 30; // minutes
const MAX_DURATION = 480;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// True when [start, end) overlaps an existing appointment of the same doctor.
async function findConflict(doctorId, start, durationMin, excludeId) {
  const end = new Date(start.getTime() + durationMin * 60000);
  // Candidates start before our end and no earlier than the longest possible duration before our start.
  const candidates = await Appointment.find({
    doctor: doctorId,
    date: { $lt: end, $gt: new Date(start.getTime() - MAX_DURATION * 60000) },
    ...(excludeId ? { _id: { $ne: excludeId } } : {}),
  });
  return candidates.find((a) => {
    const aEnd = a.date.getTime() + (a.duration || DEFAULT_DURATION) * 60000;
    return a.date.getTime() < end.getTime() && aEnd > start.getTime();
  });
}

// Validates the final (merged) values and checks the doctor is free.
async function validateAppointment({ patient, doctor, date, duration }, excludeId) {
  if (!mongoose.Types.ObjectId.isValid(patient)) throw new HttpError(400, 'A valid patient is required');
  if (!mongoose.Types.ObjectId.isValid(doctor)) throw new HttpError(400, 'A valid doctor is required');

  const start = new Date(date);
  if (!date || Number.isNaN(start.getTime())) throw new HttpError(400, 'A valid appointment date is required');
  if (start <= new Date()) throw new HttpError(400, 'Appointment date must be in the future');

  const mins = duration === undefined || duration === null || duration === '' ? DEFAULT_DURATION : Number(duration);
  if (!Number.isFinite(mins) || mins < 5 || mins > MAX_DURATION) {
    throw new HttpError(400, `Duration must be between 5 and ${MAX_DURATION} minutes`);
  }

  const existingPatient = await Patient.findById(patient);
  if (!existingPatient) throw new HttpError(404, 'Patient not found');
  const existingDoctor = await Doctor.findById(doctor);
  if (!existingDoctor) throw new HttpError(404, 'Doctor not found');

  const clash = await findConflict(doctor, start, mins, excludeId);
  if (clash) throw new HttpError(409, 'Doctor already has an appointment that overlaps this time');

  return { start, mins, existingDoctor };
}

const sendError = (res, err) => {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  res.status(400).json({ error: err.message });
};

// Paginated list (soonest first): ?page&limit&search (patient or doctor name)
router.get('/', async (req, res) => {
    try {
        const paging = parsePaging(req.query);
        let filter = {};
        if (paging.search) {
            const rx = new RegExp(escapeRegex(paging.search), 'i');
            const [pids, dids] = await Promise.all([
                Patient.find({ name: rx }).distinct('_id'),
                Doctor.find({ $or: [{ name: rx }, { specialty: rx }] }).distinct('_id'),
            ]);
            filter = { $or: [{ patient: { $in: pids } }, { doctor: { $in: dids } }] };
        }
        res.json(await paginate(Appointment, filter, paging, {
            sort: { date: 1, _id: 1 },
            populate: [['patient', 'name age gender'], ['doctor', 'name specialty']],
        }));
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// Add new appointment with validations and doctor conflict check
router.post('/add', canWrite, async (req, res) => {
    const { patient, doctor, date, duration } = req.body || {};
    try {
        const { start, mins, existingDoctor } = await validateAppointment({ patient, doctor, date, duration });

        const savedAppointment = await new Appointment({ patient, doctor, date: start, duration: mins }).save();

        // Add patient to doctor's history
        if (!existingDoctor.history.some((p) => p.toString() === String(patient))) {
            existingDoctor.history.push(patient);
            await existingDoctor.save();
        }

        await savedAppointment.populate('patient', 'name age gender');
        await savedAppointment.populate('doctor', 'name specialty');
        res.json(savedAppointment);
    } catch (err) {
        sendError(res, err);
    }
});

// Update appointment. PUT/PATCH accept partial bodies (merged with the stored values);
// POST /update/:id is kept for older clients.
const updateAppointment = async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ error: 'Invalid ID' });
  try {
    const appointment = await Appointment.findById(req.params.id);
    if (!appointment) throw new HttpError(404, 'Appointment not found');

    const body = req.body || {};
    const merged = {
      patient: body.patient ?? appointment.patient.toString(),
      doctor: body.doctor ?? appointment.doctor.toString(),
      date: body.date ?? appointment.date,
      duration: body.duration ?? appointment.duration,
    };
    const { start, mins, existingDoctor } = await validateAppointment(merged, appointment._id);

    appointment.patient = merged.patient;
    appointment.doctor = merged.doctor;
    appointment.date = start;
    appointment.duration = mins;
    const updatedAppointment = await appointment.save();

    if (!existingDoctor.history.some((p) => p.toString() === String(merged.patient))) {
      existingDoctor.history.push(merged.patient);
      await existingDoctor.save();
    }

    await updatedAppointment.populate('patient', 'name age gender');
    await updatedAppointment.populate('doctor', 'name specialty');

    res.json(updatedAppointment);
  } catch (err) {
    sendError(res, err);
  }
};
router.put('/:id', canWrite, updateAppointment);
router.patch('/:id', canWrite, updateAppointment);
router.post('/update/:id', canWrite, updateAppointment);

// Delete appointment
router.route('/delete/:id').delete(canWrite, async (req, res) => {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ error: 'Invalid ID' });
    try {
        const appointment = await Appointment.findByIdAndDelete(req.params.id);

        if (!appointment) {
            return res.status(404).json('Appointment not found');
        }

        res.json('Appointment deleted.');
    } catch (err) {
        res.status(400).json('Error: ' + err);
    }
});

export default router;
