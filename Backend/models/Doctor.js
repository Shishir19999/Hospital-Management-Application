import mongoose from "mongoose"
const Schema = mongoose.Schema;
const doctorSchema = new Schema({
    name: { type: String, required: true },
    specialty: { type: String, required: true },
    // Add more fields as needed
});
 
const Doctor =
    mongoose.model('Doctor', doctorSchema);
 
export default Doctor;