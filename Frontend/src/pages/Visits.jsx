import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useFetch } from '../hooks/useFetch';
import { can } from '../lib/permissions';
import { downloadCsv } from '../lib/csv';
import { VISIT_CSV } from '../lib/exports';
import { fmtDateTime } from '../lib/dates';
import { label } from '../lib/format';
import Icon from '../ui/Icon';
import { EmptyState, ErrorState, PageHeader, SkeletonList } from '../ui/Common';
import { ServerPager, Tag } from '../ui/Kit';
import { useDebounced } from '../hooks/useDebounced';

export default function Visits() {
  const { role, user } = useAuth();
  const [status, setStatus] = useState(role === 'doctor' ? 'open' : '');
  const [mine, setMine] = useState(role === 'doctor' && !!user.doctor);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const search = useDebounced(q.trim());
  const { data, loading, error, reload } = useFetch('/visits', { status, search, page, limit: 12, doctor: mine ? 'me' : '' });
  const rows = data?.data || [];

  return (
    <>
      <PageHeader title="Visits" subtitle="Consultations from triage to completion">
        <button type="button" className="btn btn-ghost" disabled={!rows.length} onClick={() => downloadCsv('visits.csv', VISIT_CSV, rows)}>
          <Icon name="download" /> Export CSV
        </button>
      </PageHeader>
      <div className="toolbar">
        <div className="field">
          <label htmlFor="v-q">Search</label>
          <input id="v-q" type="search" placeholder="Patient, complaint, diagnosis or visit number" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
        </div>
        <div className="field">
          <label htmlFor="v-st">Status</label>
          <select id="v-st" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            <option value="">All</option>
            <option value="open">Open (triage or consulting)</option>
            {['triage', 'in_consult', 'completed', 'cancelled'].map((s) => (<option key={s} value={s}>{label(s)}</option>))}
          </select>
        </div>
        {user.doctor && (
          <div className="field">
            <label htmlFor="v-mine">Doctor</label>
            <select id="v-mine" value={mine ? 'me' : ''} onChange={(e) => { setMine(e.target.value === 'me'); setPage(1); }}>
              <option value="me">My visits</option>
              <option value="">All doctors</option>
            </select>
          </div>
        )}
      </div>
      {loading && <SkeletonList label="Loading visits" />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {data && rows.length === 0 && <EmptyState title="No visits found" text="Visits appear here once a patient has been triaged or a consultation has started." />}
      {rows.length > 0 && (
        <div className="card table-card">
          <div className="table-scroll" tabIndex={0} role="region" aria-label="Visits">
            <table className="table">
              <caption className="sr-only">Visits</caption>
              <thead>
                <tr><th scope="col">Visit</th><th scope="col">Started</th><th scope="col">Patient</th><th scope="col">Doctor</th><th scope="col">Complaint and diagnosis</th><th scope="col">Status</th></tr>
              </thead>
              <tbody>
                {rows.map((v) => (
                  <tr key={v._id}>
                    <td data-label="Visit">{can(role, 'visits.read') ? <Link to={`/visits/${v._id}`}>{v.visitNo}</Link> : v.visitNo}</td>
                    <td data-label="Started">{fmtDateTime(v.startedAt)}</td>
                    <td data-label="Patient"><Link to={`/patients/${v.patient?._id}`}>{v.patient?.name}</Link></td>
                    <td data-label="Doctor">{v.doctor?.name || <span className="muted">Unassigned</span>}</td>
                    <td data-label="Complaint">{v.chiefComplaint || '-'}{v.diagnoses?.length ? <small className="muted block">{v.diagnoses.map((d) => d.name).join(', ')}</small> : null}</td>
                    <td data-label="Status"><Tag value={v.status} />{v.triagePriority && v.triagePriority !== 'routine' && v.status !== 'completed' ? <> <Tag value={v.triagePriority} /></> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ServerPager page={data.page} pages={data.pages} total={data.total} onPage={setPage} label="visits" />
        </div>
      )}
    </>
  );
}
