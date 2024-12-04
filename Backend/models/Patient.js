import mongoose from "mongoose"
const Schema = mongoose.Schema;
const patientSchema = new Schema({
    name: { type: String, required: true },
    age: { type: Number, required: true },
    gender: { type: String, required: true },
    doctor: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Doctor',
      },
});
const Patient = mongoose.model('Patient', patientSchema);
export default Patient;