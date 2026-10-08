import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { useToast } from '../context/ToastContext';
import { useFetch } from '../hooks/useFetch';
import { can } from '../lib/permissions';
import { errorMessage } from '../api/errors';
import { fmtTime } from '../lib/dates';
import Icon from '../ui/Icon';
import { ErrorState, PageHeader, SkeletonList } from '../ui/Common';
import { Stat, Tag } from '../ui/Kit';
import { IssueTokenModal, VitalsModal } from '../ui/ClinicalForms';
import { ConfirmDialog } from '../ui/Modal';

export default function Queue() {
  const { role, user } = useAuth();
  const { doctors } = useData();
  const toast = useToast();
  const navigate = useNavigate();
  const [doctor, setDoctor] = useState(role === 'doctor' && user.doctor ? 'me' : '');
  const [issuing, setIssuing] = useState(false);
  const [triage, setTriage] = useState(null);
  const [cancel, setCancel] = useState(null);
  const [busy, setBusy] = useState('');
  const { data, loading, error, reload } = useFetch('/queue', { doctor }, { interval: 10000 });

  const act = async (t, action, extra) => {
    setBusy(t._id + action);
    try {
      const res = await api.post(`/queue/${t._id}/${action}`, extra || {});
      await reload();
      if (action === 'start' && res.visitRecord && can(role, 'visits.consult')) navigate(`/visits/${res.visitRecord._id}`);
      else toast.success(`${t.number}: ${action === 'call' ? 'called' : action === 'start' ? 'consultation started' : action === 'skip' ? 'skipped' : action === 'requeue' ? 'back in line' : 'cancelled'}.`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy('');
      setCancel(null);
    }
  };

  const openTriage = async (t) => {
    try {
      const visit = t.visit ? await api.get(`/visits/${t.visit}`) : null;
      setTriage({ token: t, visit, patient: t.patient });
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const tokens = data?.tokens || [];
  const stats = data?.stats;

  return (
    <>
      <PageHeader title="Outpatient queue" subtitle={data ? `Today, ${data.day}. Updates every few seconds.` : 'Today'}>
        <Link className="btn btn-ghost" to="/display" target="_blank" rel="noreferrer">
          <Icon name="tv" /> Display board
        </Link>
        {can(role, 'queue.issue') && (
          <button type="button" className="btn btn-primary" onClick={() => setIssuing(true)}>
            <Icon name="plus" /> Issue token
          </button>
        )}
      </PageHeader>

      {stats && (
        <div className="stat-grid">
          <Stat label="Waiting" value={stats.waiting} />
          <Stat label="With a doctor" value={stats.called + stats.inConsult} />
          <Stat label="Seen today" value={stats.done} />
          <Stat label="Average wait" value={`${stats.avgWaitMin} min`} />
        </div>
      )}

      <div className="toolbar">
        <div className="field">
          <label htmlFor="q-doc">Doctor</label>
          <select id="q-doc" value={doctor} onChange={(e) => setDoctor(e.target.value)}>
            <option value="">Everyone</option>
            {user.doctor && <option value="me">My patients</option>}
            {doctors.map((d) => (
              <option key={d._id} value={d._id}>{d.name}</option>
            ))}
          </select>
        </div>
      </div>

      {loading && <SkeletonList label="Loading queue" />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {data && tokens.length === 0 && (
        <div className="empty">
          <div className="empty-icon"><Icon name="queue" size={26} /></div>
          <h3>Nobody is in the queue</h3>
          <p>Issue a token when a patient arrives at the front desk.</p>
        </div>
      )}
      {tokens.length > 0 && (
        <div className="card table-card">
          <div className="table-scroll" tabIndex={0} role="region" aria-label="Queue">
            <table className="table">
              <caption className="sr-only">Today&apos;s queue</caption>
              <thead>
                <tr><th scope="col">Token</th><th scope="col">Patient</th><th scope="col">Priority</th><th scope="col">Doctor</th><th scope="col">Status</th><th scope="col">Waiting</th><th scope="col">Actions</th></tr>
              </thead>
              <tbody>
                {tokens.map((t) => (
                  <tr key={t._id} className={t.priority === 'emergency' ? 'row-alert' : ''}>
                    <td data-label="Token"><strong className="token-no">{t.number}</strong></td>
                    <td data-label="Patient">
                      <Link to={`/patients/${t.patient?._id}`}>{t.patient?.name}</Link>
                      <small className="muted block">{t.reason || ' '}</small>
                    </td>
                    <td data-label="Priority"><Tag value={t.priority} /></td>
                    <td data-label="Doctor">{t.doctor?.name || <span className="muted">Unassigned</span>}</td>
                    <td data-label="Status"><Tag value={t.status} />{t.position ? <small className="muted"> #{t.position}</small> : null}{t.visit && t.status === 'waiting' ? <small className="muted block">vitals taken</small> : null}</td>
                    <td data-label="Waiting">{['done', 'cancelled'].includes(t.status) ? fmtTime(t.completedAt || t.issuedAt) : `${t.waitMinutes} min`}</td>
                    <td data-label="Actions" className="actions">
                      <div className="row-actions">
                        {t.status === 'waiting' && can(role, 'visits.vitals') && (
                          <button type="button" className="btn btn-ghost btn-sm" onClick={() => openTriage(t)}>{t.visit ? 'Update vitals' : 'Triage'}</button>
                        )}
                        {t.status === 'waiting' && can(role, 'queue.update') && (
                          <button type="button" className="btn btn-primary btn-sm" disabled={!!busy} onClick={() => act(t, 'call')}><Icon name="play" size={14} /> Call</button>
                        )}
                        {t.status === 'called' && can(role, 'queue.update') && (
                          <button type="button" className="btn btn-primary btn-sm" disabled={!!busy} onClick={() => act(t, 'start')}>Start consult</button>
                        )}
                        {t.status === 'in_consult' && t.visit && can(role, 'visits.read') && (
                          <Link className="btn btn-primary btn-sm" to={`/visits/${t.visit}`}>Open visit</Link>
                        )}
                        {['waiting', 'called'].includes(t.status) && can(role, 'queue.update') && (
                          <button type="button" className="btn btn-ghost btn-sm" disabled={!!busy} onClick={() => act(t, 'skip')}><Icon name="skip" size={14} /> Skip</button>
                        )}
                        {t.status === 'skipped' && can(role, 'queue.update') && (
                          <button type="button" className="btn btn-ghost btn-sm" disabled={!!busy} onClick={() => act(t, 'requeue')}>Back in line</button>
                        )}
                        {['waiting', 'called', 'skipped'].includes(t.status) && can(role, 'queue.update') && (
                          <button type="button" className="btn btn-icon btn-ghost danger" aria-label={`Cancel token ${t.number}`} onClick={() => setCancel(t)}><Icon name="x" /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {issuing && <IssueTokenModal onClose={() => setIssuing(false)} onDone={reload} />}
      {triage && <VitalsModal visit={triage.visit} patient={triage.patient} token={triage.token} onClose={() => setTriage(null)} onDone={reload} />}
      {cancel && (
        <ConfirmDialog title="Cancel this token?" message={`Token ${cancel.number} for ${cancel.patient?.name} will be removed from the queue.`} confirmLabel="Cancel token" onConfirm={() => act(cancel, 'cancel')} onCancel={() => setCancel(null)} />
      )}
    </>
  );
}
