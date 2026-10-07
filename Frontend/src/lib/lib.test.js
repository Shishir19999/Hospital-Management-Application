import { describe, expect, it } from 'vitest';
import { conflictIds, effectiveStatus, findConflicts } from './appointments';
import { csvCell, toCsv } from './csv';
import { can } from './permissions';
import { globalSearch } from './search';
import { ageBuckets, appointmentsPerDay, appointmentsPerWeek, dashboardStats, doctorsBySpecialty, genderMix } from './stats';
import { paginateRows, sortRows } from './table';
import { validateAppointment, validateDoctor, validatePatient } from './validate';
import { dayKey, startOfWeek } from './dates';

const at = (iso, extra = {}) => ({ _id: iso, date: iso, doctor: { _id: 'd1' }, patient: { _id: 'p1', name: 'Ann' }, ...extra });

describe('appointments', () => {
  it('derives a status when none is stored', () => {
    const now = new Date('2026-05-10T12:00:00');
    expect(effectiveStatus(at('2026-05-09T10:00:00'), now)).toBe('completed');
    expect(effectiveStatus(at('2026-05-11T10:00:00'), now)).toBe('scheduled');
    expect(effectiveStatus(at('2026-05-11T10:00:00', { status: 'cancelled' }), now)).toBe('cancelled');
  });

  it('finds overlaps for the same doctor only, ignoring cancelled ones', () => {
    const list = [
      at('2026-05-11T10:00:00', { duration: 60 }),
      at('2026-05-11T12:00:00', { doctor: { _id: 'd2' } }),
      at('2026-05-11T14:00:00', { status: 'cancelled' }),
    ];
    const overlap = { doctor: 'd1', date: '2026-05-11T10:30:00', duration: 30 };
    expect(findConflicts(list, overlap)).toHaveLength(1);
    expect(findConflicts(list, { doctor: 'd1', date: '2026-05-11T11:00:00', duration: 30 })).toHaveLength(0);
    expect(findConflicts(list, { doctor: 'd1', date: '2026-05-11T14:00:00', duration: 30 })).toHaveLength(0);
    expect(findConflicts(list, { doctor: 'd2', date: '2026-05-11T12:15:00', duration: 30 })).toHaveLength(1);
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

describe('stats', () => {
  const appts = [
    at('2026-05-11T10:00:00'),
    at('2026-05-11T11:00:00', { status: 'cancelled' }),
    at('2026-05-12T09:00:00'),
  ];
  it('counts appointments per day without cancelled ones', () => {
    const days = appointmentsPerDay(appts, new Date('2026-05-11T00:00:00'), 3);
    expect(days.map((d) => d.value)).toEqual([1, 1, 0]);
  });
  it('groups by Monday-based weeks', () => {
    const weeks = appointmentsPerWeek(appts, new Date('2026-05-14T00:00:00'), 2);
    expect(weeks.map((w) => w.value)).toEqual([0, 2]);
    expect(dayKey(startOfWeek(new Date('2026-05-17T10:00:00')))).toBe('2026-05-11');
  });
  it('summarises doctors, patients and dashboard counters', () => {
    expect(doctorsBySpecialty([{ specialty: 'B' }, { specialty: 'A' }, { specialty: 'B' }])).toEqual([
      { label: 'B', value: 2 },
      { label: 'A', value: 1 },
    ]);
    const patients = [{ age: 5, gender: 'Male' }, { age: 40, gender: 'Female' }, { age: 70, gender: 'Female' }];
    expect(genderMix(patients)).toEqual([{ label: 'Female', value: 2 }, { label: 'Male', value: 1 }]);
    expect(ageBuckets(patients).map((b) => b.value)).toEqual([1, 0, 1, 0, 1]);
    const s = dashboardStats({ patients, doctors: [{}], appointments: appts }, new Date('2026-05-11T08:00:00'));
    expect(s).toMatchObject({ patients: 3, doctors: 1, today: 1, upcoming: 2, cancelled: 1 });
  });
});

describe('table, csv, search, permissions, validation', () => {
  it('sorts naturally and paginates safely', () => {
    const rows = [{ n: 'b10' }, { n: 'b2' }, { n: 'a1' }];
    expect(sortRows(rows, (r) => r.n, 'asc').map((r) => r.n)).toEqual(['a1', 'b2', 'b10']);
    expect(sortRows(rows, (r) => r.n, 'desc')[0].n).toBe('b10');
    const p = paginateRows([1, 2, 3, 4, 5], 9, 2);
    expect(p).toMatchObject({ page: 3, pages: 3, rows: [5] });
  });
  it('escapes csv cells and blocks formula injection', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('=SUM(A1)')).toBe("'=SUM(A1)");
    expect(csvCell(-5)).toBe('-5');
    expect(toCsv([{ label: 'N', value: (r) => r.n }], [{ n: 1 }, { n: 'x' }])).toBe('N\r\n1\r\nx');
  });
  it('searches across collections', () => {
    const data = {
      patients: [{ _id: 'p1', name: 'Maya Reyes' }],
      doctors: [{ _id: 'd1', name: 'Dr. Reyes', specialty: 'Cardiology' }],
      appointments: [at('2026-05-11T10:00:00', { patient: { name: 'Maya Reyes' }, doctor: { name: 'Dr. Reyes' } })],
    };
    const r = globalSearch('reyes', data);
    expect([r.patients.length, r.doctors.length, r.appointments.length]).toEqual([1, 1, 1]);
    expect(globalSearch('  ', data).patients).toEqual([]);
  });
  it('applies role permissions', () => {
    expect(can('admin', 'doctors', 'create')).toBe(true);
    expect(can('receptionist', 'doctors', 'create')).toBe(false);
    expect(can('doctor', 'patients', 'update')).toBe(false);
    expect(can('doctor', 'appointments', 'status')).toBe(true);
    expect(can('receptionist', 'patients', 'remove')).toBe(false);
  });
  it('validates forms', () => {
    expect(Object.keys(validatePatient({ name: ' ', age: '', gender: '' }))).toEqual(['name', 'age', 'gender']);
    expect(validatePatient({ name: 'A', age: 30, gender: 'Other' })).toEqual({});
    expect(validateDoctor({ name: 'D', specialty: 'x' }, ['Cardiology']).specialty).toBeTruthy();
    const now = new Date('2026-05-10T10:00:00');
    expect(validateAppointment({ patient: 'p', doctor: 'd', date: '2026-05-09T10:00', duration: 30 }, now).date).toBeTruthy();
    expect(validateAppointment({ patient: 'p', doctor: 'd', date: '2026-05-11T10:00', duration: 30 }, now)).toEqual({});
    expect(validateAppointment({ patient: 'p', doctor: 'd', date: '2026-05-09T10:00', duration: 30 }, now, { requireFuture: false })).toEqual({});
    expect(validateAppointment({ patient: 'p', doctor: 'd', date: '2026-05-11T10:00', duration: 2 }, now).duration).toBeTruthy();
  });
});
