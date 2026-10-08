import { scheduleOf } from '../../../shared/domain.js';

export const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const daysText = (d) => scheduleOf(d).workingDays.map((n) => DAY_NAMES[n]).join(' ');
