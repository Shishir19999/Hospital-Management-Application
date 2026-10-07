import { effectiveStatus } from './appointments';
import { fmtDateTime } from './dates';

export const PATIENT_CSV = [
  { label: 'Name', value: (p) => p.name },
  { label: 'Age', value: (p) => p.age },
  { label: 'Gender', value: (p) => p.gender },
  { label: 'Email', value: (p) => p.email },
  { label: 'Phone', value: (p) => p.phone },
  { label: 'Blood group', value: (p) => p.bloodGroup },
  { label: 'Conditions', value: (p) => p.conditions },
];

export const APPOINTMENT_CSV = [
  { label: 'Date', value: (a) => fmtDateTime(a.date) },
  { label: 'Patient', value: (a) => a.patient?.name },
  { label: 'Doctor', value: (a) => a.doctor?.name },
  { label: 'Specialty', value: (a) => a.doctor?.specialty },
  { label: 'Duration (min)', value: (a) => a.duration || 30 },
  { label: 'Status', value: (a) => effectiveStatus(a) },
  { label: 'Notes', value: (a) => a.notes },
];
