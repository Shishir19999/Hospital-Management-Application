// Mirrors the backend rules: who may create, edit or delete each resource.
const RULES = {
  patients: { create: ['admin', 'receptionist'], update: ['admin', 'receptionist'], remove: ['admin'] },
  doctors: { create: ['admin'], update: ['admin'], remove: ['admin'] },
  appointments: {
    create: ['admin', 'receptionist'],
    update: ['admin', 'receptionist'],
    remove: ['admin', 'receptionist'],
    status: ['admin', 'doctor', 'receptionist'],
  },
};

export const can = (role, resource, action) => !!RULES[resource]?.[action]?.includes(role);
