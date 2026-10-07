import { useMemo } from 'react';
import Icon from './Icon';
import { addDays, dayKey, fmtTime } from '../lib/dates';
import { effectiveStatus } from '../lib/appointments';

// Seven-day agenda; overlapping bookings of the same doctor are flagged.
export default function WeekAgenda({ weekStart, appointments, conflicts, onSelect, showDoctor = true }) {
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const byDay = useMemo(() => {
    const m = new Map();
    for (const a of appointments) {
      const k = dayKey(a.date);
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(a);
    }
    for (const list of m.values()) list.sort((x, y) => new Date(x.date) - new Date(y.date));
    return m;
  }, [appointments]);
  const today = dayKey(new Date());

  return (
    <div className="week" role="list" aria-label="Weekly agenda">
      {days.map((d) => {
        const list = byDay.get(dayKey(d)) || [];
        return (
          <section key={dayKey(d)} className={`week-day${dayKey(d) === today ? ' is-today' : ''}`} role="listitem">
            <h3>
              {d.toLocaleDateString(undefined, { weekday: 'short' })} <span>{d.getDate()}</span>
              <small className="muted">{list.length ? `${list.length} booked` : ''}</small>
            </h3>
            {list.length === 0 && <p className="muted week-empty">Free</p>}
            {list.map((a) => {
              const s = effectiveStatus(a);
              const clash = conflicts?.has(a._id);
              return (
                <button
                  type="button"
                  key={a._id}
                  className={`slot slot-${s}${clash ? ' slot-clash' : ''}`}
                  onClick={() => onSelect?.(a)}
                  aria-label={`${fmtTime(a.date)} ${a.patient?.name} with ${a.doctor?.name}, ${s}${clash ? ', conflict' : ''}`}
                >
                  <time>{fmtTime(a.date)}</time>
                  <span className="slot-name">{a.patient?.name}</span>
                  {showDoctor && <small>{a.doctor?.name}</small>}
                  {clash && (
                    <span className="slot-warn">
                      <Icon name="warn" size={13} /> Overlap
                    </span>
                  )}
                </button>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}
