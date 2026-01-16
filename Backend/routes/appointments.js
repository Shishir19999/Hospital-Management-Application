import express from "express";
const router = express.Router();
import Appointment from '../models/Appointment.js';
import Patient from '../models/Patient.js';
import Doctor from '../models/Doctor.js';

// Get all appointments with populated fields
router.route('/').get((req, res) => {
    Appointment.find()
        .populate('patient', 'name age gender')
        .populate('doctor', 'name specialty')
        .then(appointments => res.json(appointments))
        .catch(err => res.status(400).json('Error: ' + err));
});

// Add new appointment
// Add new appointment with validations
router.route('/add').post(async (req, res) => {
    const { patient, doctor, date } = req.body;

    try {
        // 1️⃣ Validate patient exists
        const existingPatient = await Patient.findById(patient);
        if (!existingPatient) {
            return res.status(404).json({ error: 'Patient not found' });
        }

        // 2️⃣ Validate doctor exists
        const existingDoctor = await Doctor.findById(doctor);
        if (!existingDoctor) {
            return res.status(404).json({ error: 'Doctor not found' });
        }

        // 3️⃣ Validate appointment date is in the future
        const appointmentDate = new Date(date);
        const now = new Date();
        if (appointmentDate <= now) {
            return res.status(400).json({ error: 'Appointment date must be in the future' });
        }

        // 4️⃣ Create the appointment
        const newAppointment = new Appointment({ patient, doctor, date: appointmentDate });
        const savedAppointment = await newAppointment.save();

        // 5️⃣ Add patient to doctor's history (optional)
        if (!existingDoctor.history.includes(patient)) {
            existingDoctor.history.push(patient);
            await existingDoctor.save();
        }

        res.json(savedAppointment);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// Update appointment with validations
router.route('/update/:id').post(async (req, res) => {
  const { patient, doctor, date } = req.body;

  try {
    // 1️⃣ Find appointment
    const appointment = await Appointment.findById(req.params.id);
    if (!appointment) {
      return res.status(404).json({ error: 'Appointment not found' });
    }

    // 2️⃣ Validate patient exists
    const existingPatient = await Patient.findById(patient);
    if (!existingPatient) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    // 3️⃣ Validate doctor exists
    const existingDoctor = await Doctor.findById(doctor);
    if (!existingDoctor) {
      return res.status(404).json({ error: 'Doctor not found' });
    }

    // 4️⃣ Validate appointment date is in the future
    const appointmentDate = new Date(date);
    if (appointmentDate <= new Date()) {
      return res.status(400).json({ error: 'Appointment date must be in the future' });
    }

    // 5️⃣ Update appointment
    appointment.patient = patient;
    appointment.doctor = doctor;
    appointment.date = appointmentDate;
    const updatedAppointment = await appointment.save();

    // 6️⃣ Optional: update doctor history
    if (!existingDoctor.history.includes(patient)) {
      existingDoctor.history.push(patient);
      await existingDoctor.save();
    }

    // 7️⃣ Populate patient and doctor before sending back
    await updatedAppointment.populate('patient', 'name age gender');
    await updatedAppointment.populate('doctor', 'name specialty');

    res.json(updatedAppointment);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Delete appointment
router.route('/delete/:id').delete(async (req, res) => {
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
