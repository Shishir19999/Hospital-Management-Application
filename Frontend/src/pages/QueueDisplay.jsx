import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useFetch } from '../hooks/useFetch';
import { ThemeToggle } from '../ui/Shell';
import Icon from '../ui/Icon';
import { label } from '../lib/format';

// Waiting-room board: large tokens only, no patient names.
export default function QueueDisplay() {
  const { data, error } = useFetch('/queue', {}, { interval: 5000 });
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(t);
  }, []);
  const tokens = data?.tokens || [];
  const serving = tokens.filter((t) => t.status === 'called' || t.status === 'in_consult');
  const waiting = tokens.filter((t) => t.status === 'waiting');

  return (
    <div className="board">
      <header className="board-head">
        <h1>Outpatient queue</h1>
        <div className="board-tools">
          <time dateTime={now.toISOString()}>{now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</time>
          <ThemeToggle />
          <Link to="/queue" className="btn btn-ghost btn-sm"><Icon name="back" size={16} /> Exit board</Link>
        </div>
      </header>
      {error && <p className="form-error" role="alert">Connection problem. Retrying... ({error})</p>}
      <div className="board-grid">
        <section aria-labelledby="serving-h">
          <h2 id="serving-h">Now serving</h2>
          {serving.length === 0 && <p className="board-empty">No one is being called right now.</p>}
          <ul className="board-serving" aria-live="polite">
            {serving.map((t) => (
              <li key={t._id} className={t.status === 'called' ? 'called' : ''}>
                <span className="board-token">{t.number}</span>
                <span className="board-meta">
                  {t.doctor?.name || 'Doctor'}
                  <small>{t.room ? `Room ${t.room}` : label(t.status)}</small>
                </span>
              </li>
            ))}
          </ul>
        </section>
        <section aria-labelledby="next-h">
          <h2 id="next-h">Next in line <span className="board-count">{waiting.length} waiting</span></h2>
          {waiting.length === 0 && <p className="board-empty">The waiting room is clear.</p>}
          <ol className="board-next">
            {waiting.slice(0, 10).map((t) => (
              <li key={t._id} className={t.priority !== 'routine' ? `p-${t.priority}` : ''}>
                <span className="board-token sm">{t.number}</span>
                <span>{t.doctor?.name || 'First available doctor'}</span>
                {t.priority !== 'routine' && <strong className="board-flag">{t.priority}</strong>}
                <span className="board-wait">{t.waitMinutes} min</span>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  );
}
