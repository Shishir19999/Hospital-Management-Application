import mongoose from "mongoose"
const Schema = mongoose.Schema;
const doctorSchema = new Schema({
    name: { type: String, required: true },
    specialty: { type: String, required: true },
    // Patients this doctor has seen (the doctor's patient history).
    history: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Patient',
        },
      ],
    fee: { type: Number, default: 30 },
    room: { type: String, default: '' },
    // Weekly schedule used for availability and slot suggestions.
    workingDays: { type: [Number], default: [1, 2, 3, 4, 5] },
    startTime: { type: String, default: '09:00' },
    endTime: { type: String, default: '17:00' },
    slotMinutes: { type: Number, default: 30 },
    breakStart: { type: String, default: '13:00' },
    breakEnd: { type: String, default: '14:00' },
    daysOff: { type: [String], default: [] },
}, { timestamps: true });

const Doctor =
    mongoose.model('Doctor', doctorSchema);

export default Doctor;
