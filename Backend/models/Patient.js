import mongoose from "mongoose"
const Schema = mongoose.Schema;
const patientSchema = new Schema({
    name: { type: String, required: true },
    age: { type: Number, required: true },
    gender: { type: String, required: true },
    mrn: { type: String, index: true, sparse: true },
    phone: { type: String, default: '' },
    email: { type: String, default: '' },
    bloodGroup: { type: String, default: '' },
    allergies: { type: [String], default: [] },
    conditions: { type: String, default: '' },
    address: { type: String, default: '' },
    emergencyContact: { type: String, default: '' },
    doctor: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Doctor',
      },
}, { timestamps: true });
patientSchema.index({ name: 1 });
const Patient = mongoose.model('Patient', patientSchema);
export default Patient;
