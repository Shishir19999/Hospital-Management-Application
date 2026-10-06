import express from "express"
import mongoose from "mongoose";
const router = express.Router();
import Doctor from '../models/Doctor.js';
import Patient from "../models/Patient.js";
import Appointment from "../models/Appointment.js";
import { requireRole } from "../middleware/auth.js";
import { parsePaging, paginate, escapeRegex } from "../utils/paginate.js";

// Read: any authenticated role. Create/update/delete: admin only.
const adminOnly = requireRole('admin');

function validateDoctor(body, partial) {
    const errors = [];
    const out = {};
    for (const field of ['name', 'specialty']) {
        if (!partial || body[field] !== undefined) {
            if (typeof body[field] !== 'string' || !body[field].trim()) errors.push(`${field} is required`);
            else out[field] = body[field].trim();
        }
    }
    return { errors, out };
}

// Light, unpaginated list for dropdowns: [{ _id, name, specialty }]
router.get('/lookup', async (req, res) => {
    try {
        res.json(await Doctor.find().select('name specialty').sort({ name: 1 }).limit(5000).lean());
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// Paginated list: ?page=1&limit=10&search=text (name or specialty)
router.get('/', async (req, res) => {
    try {
        const paging = parsePaging(req.query);
        const rx = paging.search && new RegExp(escapeRegex(paging.search), 'i');
        const filter = rx ? { $or: [{ name: rx }, { specialty: rx }] } : {};
        res.json(await paginate(Doctor, filter, paging, { sort: { name: 1, _id: 1 } }));
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// Add new doctor
router.post('/add', adminOnly, async (req, res) => {
    const { errors, out } = validateDoctor(req.body || {}, false);
    if (errors.length) return res.status(400).json({ error: errors.join('; ') });
    try {
        const savedDoctor = await new Doctor(out).save();
        res.json(savedDoctor);
    } catch (err) {
        res.status(400).json('Error: ' + err);
    }
});

// Update doctor data. PUT/PATCH accept partial bodies; POST /update/:id kept for older clients.
const updateDoctor = async (req, res) => {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ error: 'Invalid ID' });
    try {
        const doctor = await Doctor.findById(req.params.id);
        if (!doctor) return res.status(404).json('Doctor not found');

        const { errors, out } = validateDoctor(req.body || {}, true);
        if (errors.length) return res.status(400).json({ error: errors.join('; ') });
        Object.assign(doctor, out);
        await doctor.save();
        res.json('Doctor updated!');
    } catch (err) {
        res.status(400).json('Error: ' + err);
    }
};
router.put('/:id', adminOnly, updateDoctor);
router.patch('/:id', adminOnly, updateDoctor);
router.post('/update/:id', adminOnly, updateDoctor);

// Delete doctor by ID
router.delete('/delete/:id', adminOnly, async (req, res) => {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ error: 'Invalid ID' });
    try {
        const doctor = await Doctor.findByIdAndDelete(req.params.id);
        if (!doctor) {
            return res.status(404).json('Doctor not found');
        }

        // Optional: Clear doctor references in patients or appointments
        await Patient.updateMany({ doctor: doctor._id }, { $unset: { doctor: "" } });

        res.json('Doctor deleted!');
    } catch (err) {
        res.status(400).json('Error: ' + err);
    }
});

// Get patient history for a doctor
router.route('/:doctorId/patient-history').get(async (req, res) => {
  const { doctorId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(doctorId)) return res.status(400).json({ error: 'Invalid doctor ID' });

  try {
    const doctor = await Doctor.findById(doctorId);
    if (!doctor) {
      return res.status(404).json({ error: 'Doctor not found' });
    }

    const appointments = await Appointment.find({ doctor: doctorId })
      .populate('patient', 'name age gender')
      .sort({ date: -1 });

    res.json(appointments);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
