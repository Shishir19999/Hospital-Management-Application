import { describe, expect, it } from 'vitest';
import { conflictIds, findConflicts } from './appointments';
import { csvCell, toCsv } from './csv';
import { can, ROLES } from './permissions';
import { navFor } from './nav';
import { money, timeAgo, toneOf } from './format';
import { paginateRows, sortRows } from './table';
import { validateAppointment, validateDoctor, validatePatient } from './validate';
import { dayKey, startOfWeek } from './dates';

const at = (iso, extra = {}) => ({ _id: iso, date: iso, status: 'scheduled', doctor: { _id: 'd1' }, patient: { _id: 'p1', name: 'Ann' }, ...extra });

describe('appointments', () => {
  it('finds overlaps for the same doctor only, ignoring cancelled and no-show ones', () => {
    const list = [
      at('2026-05-11T10:00:00', { duration: 60 }),
      at('2026-05-11T12:00:00', { doctor: { _id: 'd2' } }),
      at('2026-05-11T14:00:00', { status: 'cancelled' }),
      at('2026-05-11T15:00:00', { status: 'no_show' }),
    ];
    expect(findConflicts(list, { doctor: 'd1', date: '2026-05-11T10:30:00', duration: 30 })).toHaveLength(1);
    expect(findConflicts(list, { doctor: 'd1', date: '2026-05-11T11:00:00', duration: 30 })).toHaveLength(0);
    expect(findConflicts(list, { doctor: 'd1', date: '2026-05-11T14:00:00', duration: 30 })).toHaveLength(0);
    expect(findConflicts(list, { doctor: 'd1', date: '2026-05-11T15:10:00', duration: 30 })).toHaveLength(0);
    expect(findConflicts(list, { doctor: 'd2', date: '2026-05-11T12:15:00', duration: 30 })).toHaveLength(1);
    expect(findConflicts(list, { id: '2026-05-11T10:00:00', doctor: 'd1', date: '2026-05-11T10:30:00', duration: 30 })).toHaveLength(0);
  });

  it('lists every appointment that overlaps another', () => {
    const list = [
      at('a', { date: '2026-05-11T10:00:00', duration: 60 }),
      at('b', { date: '2026-05-11T10:30:00' }),
      at('c', { date: '2026-05-11T13:00:00' }),
    ].map((x, i) => ({ ...x, _id: 'abc'[i] }));
    expect([...conflictIds(list)].sort()).toEqual(['a', 'b']);
  });
});

describe('table, csv, dates', () => {
  it('sorts naturally and paginates safely', () => {
    const rows = [{ n: 'b10' }, { n: 'b2' }, { n: 'a1' }];
    expect(sortRows(rows, (r) => r.n, 'asc').map((r) => r.n)).toEqual(['a1', 'b2', 'b10']);
    expect(sortRows(rows, (r) => r.n, 'desc')[0].n).toBe('b10');
    expect(paginateRows([1, 2, 3, 4, 5], 9, 2)).toMatchObject({ page: 3, pages: 3, rows: [5] });
  });
  it('escapes csv cells and blocks formula injection', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('=SUM(A1)')).toBe("'=SUM(A1)");
    expect(csvCell(-5)).toBe('-5');
    expect(toCsv([{ label: 'N', value: (r) => r.n }], [{ n: 1 }, { n: 'x' }])).toBe('N\r\n1\r\nx');
  });
  it('weeks start on Monday', () => {
    expect(dayKey(startOfWeek(new Date('2026-05-17T10:00:00')))).toBe('2026-05-11');
  });
});

describe('permissions and menus', () => {
  it('uses the shared matrix', () => {
    expect(can('admin', 'doctors.manage')).toBe(true);
    expect(can('receptionist', 'doctors.manage')).toBe(false);
    expect(can('doctor', 'patients.update')).toBe(false);
    expect(can('doctor', 'appointments.status')).toBe(true);
    expect(can('nurse', 'visits.vitals')).toBe(true);
    expect(can('nurse', 'prescriptions.write')).toBe(false);
    expect(can('pharmacist', 'pharmacy.dispense')).toBe(true);
    expect(can('lab_tech', 'labs.result')).toBe(true);
  });
  it('gives every role its own menu with a role-specific home', () => {
    const names = Object.fromEntries(ROLES.map((r) => [r, navFor(r, can).map((i) => i.label)]));
    expect(names.admin).toEqual(expect.arrayContaining(['Overview', 'Reports', 'Audit log', 'Staff', 'Billing', 'Stock']));
    expect(names.doctor[0]).toBe('My day');
    expect(names.doctor).toEqual(expect.arrayContaining(['Queue', 'Visits', 'Lab']));
    expect(names.doctor).not.toContain('Billing');
    expect(names.nurse[0]).toBe('Triage');
    expect(names.nurse).toContain('Wards and beds');
    expect(names.receptionist[0]).toBe('Front desk');
    expect(names.receptionist).toEqual(expect.arrayContaining(['Billing', 'Appointments', 'Queue']));
    expect(names.receptionist).not.toContain('Visits');
    expect(names.pharmacist[0]).toBe('Dispensing');
    expect(names.pharmacist).toContain('Stock');
    expect(names.lab_tech[0]).toBe('Worklist');
    expect(names.lab_tech).not.toContain('Billing');
    expect(names.nurse).not.toContain('Audit log');
  });
});

describe('formatting and validation', () => {
  it('formats money, tones and relative time', () => {
    expect(money(1234.5)).toBe('$1,234.50');
    expect(toneOf('overdue')).toBe('bad');
    expect(toneOf('paid')).toBe('ok');
    expect(toneOf('unknown-thing')).toBe('neutral');
    const now = new Date('2026-10-08T12:00:00Z');
    expect(timeAgo('2026-10-08T11:30:00Z', now)).toBe('30 min ago');
    expect(timeAgo('2026-10-08T14:00:00Z', now)).toBe('in 2 h');
    expect(timeAgo('2026-10-08T12:00:20Z', now)).toBe('just now');
  });
  it('validates forms', () => {
    expect(Object.keys(validatePatient({ name: ' ', age: '', gender: '' }))).toEqual(['name', 'age', 'gender']);
    expect(validatePatient({ name: 'A', age: 30, gender: 'Other' })).toEqual({});
    expect(validateDoctor({ name: 'D', specialty: 'x' }, ['Cardiology']).specialty).toBeTruthy();
    const now = new Date('2026-05-10T10:00:00');
    expect(validateAppointment({ patient: 'p', doctor: 'd', date: '2026-05-09T10:00', duration: 30 }, now).date).toBeTruthy();
    expect(validateAppointment({ patient: 'p', doctor: 'd', date: '2026-05-11T10:00', duration: 30 }, now)).toEqual({});
    expect(validateAppointment({ patient: 'p', doctor: 'd', date: '2026-05-11T10:00', duration: 2 }, now).duration).toBeTruthy();
  });
});
