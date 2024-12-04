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
router.route('/add').post(async (req, res) => {
    const { patient, doctor, date } = req.body;

    try {
        const existingPatient = await Patient.findById(patient);
        if (!existingPatient) {
            return res.status(404).json('Patient not found');
        }
        const newAppointment = new Appointment({ patient, doctor, date });
        const savedAppointment = await newAppointment.save();

        // Add patient to doctor's history
        const doctorRecord = await Doctor.findById(doctor);
        if (doctorRecord && !doctorRecord.history.includes(patient)) {
            doctorRecord.history.push(patient);
            await doctorRecord.save();
        }

        res.json(savedAppointment);
    } catch (err) {
        res.status(400).json('Error: ' + err);
    }
});

// Update appointment
router.route('/update/:id').post(async (req, res) => {
    const { patient, doctor, date } = req.body;

    try {
        const appointment = await Appointment.findById(req.params.id);
        if (!appointment) {
            return res.status(404).json('Appointment not found');
        }

        appointment.patient = patient;
        appointment.doctor = doctor;
        appointment.date = date;

        await appointment.save();
        res.json('Appointment updated!');
    } catch (err) {
        res.status(400).json('Error: ' + err);
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
