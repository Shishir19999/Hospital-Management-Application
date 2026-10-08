export const money = (n, currency = 'USD') => new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(Number(n) || 0);

const TONES = {
  // appointments
  scheduled: 'info', checked_in: 'warn', completed: 'ok', cancelled: 'bad', no_show: 'bad',
  // queue
  waiting: 'info', called: 'warn', in_consult: 'warn', done: 'ok', skipped: 'neutral',
  // visits, labs, rx
  triage: 'info', ordered: 'info', collected: 'warn', resulted: 'ok', issued: 'info', partial: 'warn', dispensed: 'ok',
  // billing
  unpaid: 'info', paid: 'ok', overdue: 'bad', void: 'neutral',
  // beds
  available: 'ok', occupied: 'warn', cleaning: 'info', maintenance: 'neutral', admitted: 'warn', discharged: 'ok',
  // priority and stock
  routine: 'neutral', urgent: 'warn', emergency: 'bad', low: 'warn', out: 'bad', expired: 'bad', expiring: 'warn', ok: 'ok',
  high: 'warn', normal: 'ok', critical: 'bad', critical_high: 'bad', critical_low: 'bad',
};
export const toneOf = (s) => TONES[s] || 'neutral';
export const label = (s) => String(s ?? '').replace(/_/g, ' ');

export const ROLE_HOME = {
  admin: 'Operations overview',
  doctor: 'My day',
  nurse: 'Triage and wards',
  receptionist: 'Front desk',
  pharmacist: 'Dispensing',
  lab_tech: 'Lab worklist',
};

export function timeAgo(iso, now = new Date()) {
  const diff = Math.round((new Date(iso) - new Date(now)) / 60000);
  const m = Math.abs(diff);
  if (m < 1) return 'just now';
  const text = m < 60 ? `${m} min` : m < 1440 ? `${Math.round(m / 60)} h` : `${Math.round(m / 1440)} d`;
  return diff > 0 ? `in ${text}` : `${text} ago`;
}
