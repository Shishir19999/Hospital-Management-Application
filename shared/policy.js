// Single source of truth for who may do what. The API server and the browser-only
// preview both authorise every request through `can`, so they cannot drift apart.
export const ROLES = ['admin', 'doctor', 'nurse', 'receptionist', 'pharmacist', 'lab_tech'];

export const ROLE_LABELS = {
  admin: 'Admin',
  doctor: 'Doctor',
  nurse: 'Nurse',
  receptionist: 'Receptionist',
  pharmacist: 'Pharmacist',
  lab_tech: 'Lab technician',
};

const ALL = ROLES;
const CLINICAL = ['admin', 'doctor', 'nurse'];

// permission -> roles allowed
export const PERMISSIONS = {
  // directory
  'patients.read': ALL,
  'patients.create': ['admin', 'receptionist', 'nurse'],
  'patients.update': ['admin', 'receptionist', 'nurse'],
  'patients.remove': ['admin'],
  'doctors.read': ALL,
  'doctors.manage': ['admin'],
  'doctors.schedule': ['admin'],
  'users.manage': ['admin'],
  // appointments and queue
  'appointments.read': ALL,
  'appointments.write': ['admin', 'receptionist'],
  'appointments.status': ['admin', 'doctor', 'nurse', 'receptionist'],
  'queue.read': ['admin', 'doctor', 'nurse', 'receptionist'],
  'queue.issue': ['admin', 'nurse', 'receptionist'],
  'queue.update': ['admin', 'doctor', 'nurse', 'receptionist'],
  // clinical
  'visits.read': CLINICAL,
  'visits.create': CLINICAL,
  'visits.vitals': CLINICAL,
  'visits.consult': ['admin', 'doctor'],
  'prescriptions.read': [...CLINICAL, 'pharmacist'],
  'prescriptions.write': ['admin', 'doctor'],
  'pharmacy.dispense': ['admin', 'pharmacist'],
  'inventory.read': [...CLINICAL, 'pharmacist'],
  'inventory.manage': ['admin', 'pharmacist'],
  'labs.catalog.read': ALL,
  'labs.catalog.manage': ['admin'],
  'labs.read': [...CLINICAL, 'lab_tech'],
  'labs.order': ['admin', 'doctor'],
  'labs.collect': ['admin', 'nurse', 'lab_tech'],
  'labs.result': ['admin', 'lab_tech'],
  'labs.review': ['admin', 'doctor'],
  // money
  'billing.read': ['admin', 'receptionist'],
  'billing.write': ['admin', 'receptionist'],
  'billing.pay': ['admin', 'receptionist'],
  'billing.void': ['admin'],
  // wards
  'wards.read': ['admin', 'doctor', 'nurse', 'receptionist'],
  'wards.manage': ['admin'],
  'beds.status': ['admin', 'nurse'],
  'admissions.admit': ['admin', 'doctor', 'nurse', 'receptionist'],
  'admissions.transfer': ['admin', 'doctor', 'nurse'],
  'admissions.discharge': ['admin', 'doctor'],
  // insight
  'reports.read': ['admin'],
  'audit.read': ['admin'],
  'notifications.read': ALL,
  'search.read': ALL,
  'dashboard.read': ALL,
};

export const PERMISSION_KEYS = Object.keys(PERMISSIONS);

export const isRole = (r) => ROLES.includes(r);
export const can = (role, perm) => !!PERMISSIONS[perm]?.includes(role);
export const rolesFor = (perm) => [...(PERMISSIONS[perm] || [])];
export const permsFor = (role) => PERMISSION_KEYS.filter((p) => can(role, p));
