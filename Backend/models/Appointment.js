import mongoose from "mongoose"
const Schema = mongoose.Schema;
const appointmentSchema = new Schema({
    patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
    doctor: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor', required: true },
    date: { type: Date, required: true },
    // length in minutes, used for the doctor overlap check
    duration: { type: Number, default: 30, min: 5, max: 480 },
    status: { type: String, enum: ['scheduled', 'checked_in', 'completed', 'cancelled', 'no_show'], default: 'scheduled' },
    reason: { type: String, default: '' },
    notes: { type: String, default: '' },
}, { timestamps: true });

appointmentSchema.index({ doctor: 1, date: 1 });
appointmentSchema.index({ patient: 1, date: -1 });

const Appointment =
    mongoose.model('Appointment', appointmentSchema);

export default Appointment;
