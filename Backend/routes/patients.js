import express from "express";
import mongoose from "mongoose";
import Patient from "../models/Patient.js";
import Appointment from "../models/Appointment.js";
import { requireRole } from "../middleware/auth.js";
import { parsePaging, paginate, escapeRegex } from "../utils/paginate.js";

const router = express.Router();

// Read: any authenticated role. Create/update: admin + receptionist. Delete: admin.
const canWrite = requireRole('admin', 'receptionist');
const canDelete = requireRole('admin');

const GENDERS = ['Male', 'Female', 'Other'];

// Validate fields; for partial updates only supplied fields are checked.
function validatePatient(body, partial) {
  const errors = [];
  const out = {};
  if (!partial || body.name !== undefined) {
    if (typeof body.name !== 'string' || !body.name.trim()) errors.push('Name is required');
    else out.name = body.name.trim();
  }
  if (!partial || body.age !== undefined) {
    const age = Number(body.age);
    if (body.age === '' || body.age === null || !Number.isFinite(age) || age < 0 || age > 150) errors.push('Age must be a number between 0 and 150');
    else out.age = age;
  }
  if (!partial || body.gender !== undefined) {
    if (!GENDERS.includes(body.gender)) errors.push(`Gender must be one of: ${GENDERS.join(', ')}`);
    else out.gender = body.gender;
  }
  return { errors, out };
}

// Light, unpaginated list for dropdowns: [{ _id, name }]
router.get('/lookup', async (req, res) => {
  try {
    res.json(await Patient.find().select('name').sort({ name: 1 }).limit(5000).lean());
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Paginated list: ?page=1&limit=10&search=text -> { data, page, limit, total, pages }
router.get('/', async (req, res) => {
  try {
    const paging = parsePaging(req.query);
    const filter = paging.search ? { name: new RegExp(escapeRegex(paging.search), 'i') } : {};
    res.json(await paginate(Patient, filter, paging, { sort: { name: 1, _id: 1 } }));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Add patient
router.post('/add', canWrite, async (req, res) => {
  try {
    const { errors, out } = validatePatient(req.body || {}, false);
    if (errors.length) return res.status(400).json({ error: errors.join('; ') });
    const savedPatient = await new Patient(out).save();
    res.json(savedPatient);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Update patient. PUT/PATCH accept partial bodies; POST /update/:id kept for older clients.
const updatePatient = async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: "Invalid ID" });

  try {
    const patient = await Patient.findById(id);
    if (!patient) return res.status(404).json({ error: "Patient not found" });

    const { errors, out } = validatePatient(req.body || {}, true);
    if (errors.length) return res.status(400).json({ error: errors.join('; ') });
    Object.assign(patient, out);
    await patient.save();

    res.json('Patient updated!');
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};
router.put('/:id', canWrite, updatePatient);
router.patch('/:id', canWrite, updatePatient);
router.post('/update/:id', canWrite, updatePatient);

// Delete patient
router.delete('/delete/:id', canDelete, async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: "Invalid ID" });

  try {
    const patient = await Patient.findByIdAndDelete(id);
    if (!patient) return res.status(404).json({ error: "Patient not found" });

    await Appointment.deleteMany({ patient: id });
    res.json('Patient deleted!');
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Get patient appointment history
router.get('/:patientId/history', async (req, res) => {
  const { patientId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(patientId)) return res.status(400).json({ error: "Invalid patient ID" });

  try {
    const patient = await Patient.findById(patientId);
    if (!patient) return res.status(404).json({ error: "Patient not found" });

    const appointments = await Appointment.find({ patient: patientId })
      .populate('doctor', 'name specialty')
      .sort({ date: -1 });

    res.json(appointments);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
