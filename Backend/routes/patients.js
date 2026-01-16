import express from "express";
import mongoose from "mongoose";
import Patient from "../models/Patient.js";
import Appointment from "../models/Appointment.js";

const router = express.Router();

// Get all patients
router.get('/', async (req, res) => {
  try {
    const patients = await Patient.find();
    res.json(patients);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Add patient
router.post('/add', async (req, res) => {
  try {
    const { name, age, gender } = req.body;
    const newPatient = new Patient({ name, age, gender });
    const savedPatient = await newPatient.save();
    res.json(savedPatient);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Update patient
router.post('/update/:id', async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: "Invalid ID" });

  try {
    const patient = await Patient.findById(id);
    if (!patient) return res.status(404).json({ error: "Patient not found" });

    patient.name = req.body.name;
    patient.age = req.body.age;
    patient.gender = req.body.gender;
    await patient.save();

    res.json('Patient updated!');
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Delete patient
router.delete('/delete/:id', async (req, res) => {
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
