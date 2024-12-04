import mongoose from "mongoose"
const Schema = mongoose.Schema;
const doctorSchema = new Schema({
    name: { type: String, required: true },
    specialty: { type: String, required: true },
    history: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Patient',
        },
      ],
});
 
const Doctor =
    mongoose.model('Doctor', doctorSchema);
 
export default Doctor;