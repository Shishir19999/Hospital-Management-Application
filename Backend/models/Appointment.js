import mongoose from "mongoose"
const Schema = mongoose.Schema;
const appointmentSchema = new Schema({
    patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
    doctor: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor', required: true },
    date: { type: Date, required: true },
});
 
const Appointment =
    mongoose.model('Appointment', appointmentSchema);
 
export default Appointment;