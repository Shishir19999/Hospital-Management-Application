import { fmtDateTime } from './dates';
import { label } from './format';

export const PATIENT_CSV = [
  { label: 'Record number', value: (p) => p.mrn },
  { label: 'Name', value: (p) => p.name },
  { label: 'Age', value: (p) => p.age },
  { label: 'Gender', value: (p) => p.gender },
  { label: 'Phone', value: (p) => p.phone },
  { label: 'Email', value: (p) => p.email },
  { label: 'Blood group', value: (p) => p.bloodGroup },
  { label: 'Allergies', value: (p) => (p.allergies || []).join('; ') },
  { label: 'Conditions', value: (p) => p.conditions },
];

export const APPOINTMENT_CSV = [
  { label: 'Date', value: (a) => fmtDateTime(a.date) },
  { label: 'Patient', value: (a) => a.patient?.name },
  { label: 'Doctor', value: (a) => a.doctor?.name },
  { label: 'Specialty', value: (a) => a.doctor?.specialty },
  { label: 'Duration (min)', value: (a) => a.duration || 30 },
  { label: 'Status', value: (a) => label(a.status) },
  { label: 'Reason', value: (a) => a.reason },
];

export const INVOICE_CSV = [
  { label: 'Invoice', value: (i) => i.invoiceNo },
  { label: 'Patient', value: (i) => i.patient?.name },
  { label: 'Issued', value: (i) => fmtDateTime(i.issuedAt) },
  { label: 'Due', value: (i) => fmtDateTime(i.dueDate) },
  { label: 'Total', value: (i) => i.total },
  { label: 'Paid', value: (i) => i.paid },
  { label: 'Balance', value: (i) => i.balance },
  { label: 'Status', value: (i) => i.displayStatus },
];

export const VISIT_CSV = [
  { label: 'Visit', value: (v) => v.visitNo },
  { label: 'Started', value: (v) => fmtDateTime(v.startedAt) },
  { label: 'Patient', value: (v) => v.patient?.name },
  { label: 'Doctor', value: (v) => v.doctor?.name },
  { label: 'Complaint', value: (v) => v.chiefComplaint },
  { label: 'Diagnoses', value: (v) => (v.diagnoses || []).map((d) => d.name).join('; ') },
  { label: 'Status', value: (v) => label(v.status) },
];

export const AUDIT_CSV = [
  { label: 'When', value: (a) => fmtDateTime(a.at) },
  { label: 'Who', value: (a) => a.userName },
  { label: 'Role', value: (a) => label(a.role) },
  { label: 'Action', value: (a) => a.action },
  { label: 'Details', value: (a) => a.summary },
];
