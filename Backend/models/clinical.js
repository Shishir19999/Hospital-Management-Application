import mongoose from "mongoose";

const { Schema } = mongoose;
const { ObjectId, Mixed } = Schema.Types;
const ref = (to, extra = {}) => ({ type: ObjectId, ref: to, default: null, ...extra });

function define(name, fields, indexes = []) {
    const schema = new Schema(fields, { timestamps: true, minimize: false });
    for (const ix of indexes) schema.index(...ix);
    return mongoose.models[name] || mongoose.model(name, schema);
}

const range = { low: Number, high: Number, critLow: Number, critHigh: Number };

export const QueueToken = define('QueueToken', {
    day: { type: String, required: true },
    seq: { type: Number, required: true },
    number: String,
    patient: ref('Patient', { required: true }),
    doctor: ref('Doctor'),
    appointment: ref('Appointment'),
    visit: ref('Visit'),
    priority: { type: String, enum: ['routine', 'urgent', 'emergency'], default: 'routine' },
    status: { type: String, enum: ['waiting', 'called', 'in_consult', 'done', 'skipped', 'cancelled'], default: 'waiting' },
    reason: { type: String, default: '' },
    room: { type: String, default: '' },
    issuedAt: Date, calledAt: Date, startedAt: Date, completedAt: Date,
}, [[{ day: 1, status: 1 }], [{ patient: 1 }]]);

export const Visit = define('Visit', {
    visitNo: { type: String, index: true },
    patient: ref('Patient', { required: true }),
    doctor: ref('Doctor'),
    appointment: ref('Appointment'),
    token: ref('QueueToken'),
    status: { type: String, enum: ['triage', 'in_consult', 'completed', 'cancelled'], default: 'triage' },
    chiefComplaint: { type: String, default: '' },
    vitals: { type: Mixed, default: {} },
    triagePriority: { type: String, default: 'routine' },
    triageNotes: { type: String, default: '' },
    triageBy: { type: String, default: '' },
    triageAt: Date,
    notes: { type: String, default: '' },
    plan: { type: String, default: '' },
    diagnoses: { type: [Mixed], default: [] },
    followUpDate: Date,
    startedAt: Date, consultStartedAt: Date, completedAt: Date,
    createdBy: { type: String, default: '' },
}, [[{ patient: 1, startedAt: -1 }], [{ doctor: 1, startedAt: -1 }], [{ status: 1 }]]);

export const Prescription = define('Prescription', {
    rxNo: { type: String, index: true },
    patient: ref('Patient', { required: true }),
    doctor: ref('Doctor'),
    visit: ref('Visit'),
    items: { type: [Mixed], default: [] },
    notes: { type: String, default: '' },
    status: { type: String, enum: ['issued', 'partial', 'dispensed', 'cancelled'], default: 'issued' },
    issuedAt: Date, dispensedAt: Date,
    dispensedBy: { type: String, default: '' },
    allergyOverride: { type: Boolean, default: false },
}, [[{ patient: 1, issuedAt: -1 }], [{ status: 1 }], [{ visit: 1 }]]);

export const InventoryItem = define('InventoryItem', {
    name: { type: String, required: true, unique: true },
    genericName: { type: String, default: '' },
    category: { type: String, default: '' },
    unit: { type: String, default: 'unit' },
    price: { type: Number, default: 0 },
    reorderLevel: { type: Number, default: 0 },
    sku: { type: String, default: '' },
    // Stock lots: [{ lot, qty, expiry }]
    batches: { type: [Mixed], default: [] },
});

export const StockMovement = define('StockMovement', {
    item: ref('InventoryItem', { required: true }),
    itemName: String,
    type: { type: String, enum: ['receive', 'dispense', 'adjust'] },
    qty: Number, lot: String, reason: String, ref: String, by: String, at: Date,
}, [[{ item: 1, at: -1 }]]);

export const LabTest = define('LabTest', {
    code: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    category: String, unit: { type: String, default: '' },
    ...range, price: { type: Number, default: 0 },
});

export const LabOrder = define('LabOrder', {
    orderNo: { type: String, index: true },
    patient: ref('Patient', { required: true }),
    doctor: ref('Doctor'),
    visit: ref('Visit'),
    test: ref('LabTest'),
    testCode: String, testName: String, unit: String, price: Number,
    range: { type: new Schema(range, { _id: false }), default: {} },
    priority: { type: String, enum: ['routine', 'urgent'], default: 'routine' },
    note: { type: String, default: '' },
    status: { type: String, enum: ['ordered', 'collected', 'resulted', 'cancelled'], default: 'ordered' },
    orderedAt: Date, orderedBy: String,
    collectedAt: Date, collectedBy: { type: String, default: '' },
    resultedAt: Date, resultedBy: { type: String, default: '' },
    value: Number, flag: String,
    abnormal: { type: Boolean, default: false }, critical: { type: Boolean, default: false },
    comment: { type: String, default: '' },
    reviewed: { type: Boolean, default: false }, reviewedAt: Date, reviewedBy: { type: String, default: '' },
}, [[{ patient: 1, orderedAt: -1 }], [{ status: 1 }], [{ visit: 1 }]]);

export const Invoice = define('Invoice', {
    invoiceNo: { type: String, index: true },
    patient: ref('Patient', { required: true }),
    visit: ref('Visit'),
    admission: ref('Admission'),
    lines: { type: [Mixed], default: [] },
    discount: { type: Mixed, default: null },
    taxRate: { type: Number, default: 0 },
    subtotal: Number, discountAmount: Number, tax: Number, total: Number,
    payments: { type: [Mixed], default: [] },
    paid: { type: Number, default: 0 },
    status: { type: String, enum: ['unpaid', 'partial', 'paid', 'void'], default: 'unpaid' },
    issuedAt: Date, dueDate: Date,
    notes: { type: String, default: '' },
    createdBy: { type: String, default: '' },
    voidReason: String, voidedBy: String, voidedAt: Date,
}, [[{ patient: 1, issuedAt: -1 }], [{ status: 1, dueDate: 1 }]]);

export const Ward = define('Ward', {
    name: { type: String, required: true, unique: true },
    type: { type: String, default: 'general' },
    floor: { type: Number, default: 0 },
    dailyRate: { type: Number, default: 0 },
});

export const Bed = define('Bed', {
    ward: ref('Ward', { required: true }),
    label: { type: String, required: true },
    status: { type: String, enum: ['available', 'occupied', 'cleaning', 'maintenance'], default: 'available' },
    admission: ref('Admission'),
}, [[{ ward: 1, label: 1 }]]);

export const Admission = define('Admission', {
    admissionNo: { type: String, index: true },
    patient: ref('Patient', { required: true }),
    doctor: ref('Doctor'),
    ward: ref('Ward'),
    bed: ref('Bed'),
    reason: String, diagnosis: { type: String, default: '' },
    status: { type: String, enum: ['admitted', 'discharged'], default: 'admitted' },
    admittedAt: Date, dischargedAt: Date,
    transfers: { type: [Mixed], default: [] },
    dischargeSummary: { type: String, default: '' },
    dischargeType: String, admittedBy: String,
}, [[{ patient: 1, status: 1 }]]);

export const AuditLog = define('AuditLog', {
    at: { type: Date, required: true },
    user: { type: String, default: '' }, userName: { type: String, default: '' }, role: { type: String, default: '' },
    action: String, entity: { type: String, default: '' }, entityId: { type: String, default: '' }, summary: { type: String, default: '' },
}, [[{ at: -1 }]]);

export const Counter = define('Counter', { name: { type: String, unique: true }, value: { type: Number, default: 0 } });
