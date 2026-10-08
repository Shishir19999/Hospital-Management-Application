import User from "./User.js";
import Patient from "./Patient.js";
import Doctor from "./Doctor.js";
import Appointment from "./Appointment.js";
import * as c from "./clinical.js";

// Collection names used by the shared services -> Mongoose models.
export const MODELS = {
    users: User,
    patients: Patient,
    doctors: Doctor,
    appointments: Appointment,
    queue: c.QueueToken,
    visits: c.Visit,
    prescriptions: c.Prescription,
    inventory: c.InventoryItem,
    movements: c.StockMovement,
    labTests: c.LabTest,
    labOrders: c.LabOrder,
    invoices: c.Invoice,
    wards: c.Ward,
    beds: c.Bed,
    admissions: c.Admission,
    audit: c.AuditLog,
};

export { User, Patient, Doctor, Appointment };
export const Counter = c.Counter;
