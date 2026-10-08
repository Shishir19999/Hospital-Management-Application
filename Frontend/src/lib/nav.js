// Menu per role: an entry shows when the role holds its permission and (if given) is in `roles`.
const ITEMS = [
  { to: '/', label: 'Overview', icon: 'dashboard', end: true, alias: { doctor: 'My day', nurse: 'Triage', receptionist: 'Front desk', pharmacist: 'Dispensing', lab_tech: 'Worklist' } },
  { to: '/queue', label: 'Queue', icon: 'queue', perm: 'queue.read' },
  { to: '/appointments', label: 'Appointments', icon: 'calendar', perm: 'appointments.read', roles: ['admin', 'doctor', 'nurse', 'receptionist'] },
  { to: '/visits', label: 'Visits', icon: 'visit', perm: 'visits.read' },
  { to: '/patients', label: 'Patients', icon: 'patients', perm: 'patients.read' },
  { to: '/doctors', label: 'Doctors', icon: 'doctors', perm: 'doctors.read', roles: ['admin', 'doctor', 'receptionist'] },
  { to: '/wards', label: 'Wards and beds', icon: 'bed', perm: 'wards.read' },
  { to: '/labs', label: 'Lab', icon: 'flask', perm: 'labs.read' },
  { to: '/pharmacy', label: 'Pharmacy', icon: 'pill', perm: 'pharmacy.dispense', roles: ['admin', 'pharmacist'] },
  { to: '/pharmacy/stock', label: 'Stock', icon: 'box', perm: 'inventory.read', roles: ['admin', 'pharmacist'] },
  { to: '/billing', label: 'Billing', icon: 'bill', perm: 'billing.read' },
  { to: '/reports', label: 'Reports', icon: 'chart', perm: 'reports.read' },
  { to: '/staff', label: 'Staff', icon: 'shield', perm: 'users.manage' },
  { to: '/audit', label: 'Audit log', icon: 'list', perm: 'audit.read' },
];

export const navFor = (role, can) =>
  ITEMS.filter((i) => (!i.perm || can(role, i.perm)) && (!i.roles || i.roles.includes(role))).map((i) => ({ ...i, label: i.alias?.[role] || i.label }));
