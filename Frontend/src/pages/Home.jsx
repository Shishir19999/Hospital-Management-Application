import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useFetch } from '../hooks/useFetch';
import { errorMessage } from '../api/errors';
import { fmtDate, fmtTime, fmtDateTime } from '../lib/dates';
import { money, timeAgo, ROLE_HOME } from '../lib/format';
import Icon from '../ui/Icon';
import { ErrorState, SkeletonCards, SkeletonList } from '../ui/Common';
import { Stat, Tag } from '../ui/Kit';
import { IssueTokenModal, VitalsModal, PaymentModal } from '../ui/ClinicalForms';
import { AppointmentFormModal, PatientFormModal } from '../ui/Forms';

function Block({ title, to, linkLabel = 'See all', children, id }) {
  return (
    <section className="card section" aria-labelledby={id}>
      <div className="card-head">
        <h2 id={id}>{title}</h2>
        {to && <Link to={to} className="btn btn-ghost btn-sm">{linkLabel}</Link>}
      </div>
      {children}
    </section>
  );
}
const Empty = ({ children }) => <p className="muted">{children}</p>;

function Greeting({ user, role, sub }) {
  return (
    <section className="banner">
      <div className="banner-copy">
        <h1>{ROLE_HOME[role]}: welcome, {user?.name?.replace(/^Dr\.?\s+/i, '').split(' ')[0]}</h1>
        <p>{fmtDate(new Date())}. {sub}</p>
      </div>
    </section>
  );
}

function QueueList({ tokens, empty, extra }) {
  if (!tokens?.length) return <Empty>{empty}</Empty>;
  return (
    <ul className="plain-list queue-mini">
      {tokens.slice(0, 7).map((t) => (
        <li key={t._id}>
          <strong className="token-no">{t.number}</strong>
          <span>{t.patient?.name} <small className="muted">{t.doctor?.name || 'any doctor'}</small></span>
          <span><Tag value={t.priority} /> <Tag value={t.status} /> <small className="muted">{t.waitMinutes} min</small>{extra?.(t)}</span>
        </li>
      ))}
    </ul>
  );
}

// ------------------------------------------------------------------ admin
function AdminHome({ d }) {
  const k = d.kpis;
  return (
    <>
      <div className="stat-grid">
        <Stat label="Patients" value={k.patients} to="/patients" />
        <Stat label="Visits today" value={k.visitsToday} to="/visits" />
        <Stat label="Appointments today" value={k.appointmentsToday} to="/appointments" />
        <Stat label="Waiting in queue" value={d.queue.waiting} to="/queue" hint={`avg wait ${d.queue.avgWaitMin} min`} />
        <Stat label="Collected today" value={money(k.revenueToday)} to="/billing" />
        <Stat label="Outstanding" value={money(k.outstanding)} to="/billing" hint={`${k.overdue} overdue`} tone={k.overdue ? 'bad' : undefined} />
        <Stat label="Bed occupancy" value={`${k.occupancyPct}%`} to="/wards" hint={`${d.beds.available} beds free`} />
        <Stat label="Stock alerts" value={k.lowStock} to="/pharmacy/stock" tone={k.lowStock ? 'warn' : undefined} hint={`${k.pendingLabs} lab tests pending`} />
      </div>
      <div className="dash-grid">
        <Block title="Needs attention" id="ah-alerts" to="/notifications">
          {d.alerts.length === 0 ? <Empty>Nothing needs attention right now.</Empty> : (
            <ul className="plain-list">
              {d.alerts.map((n) => (<li key={n.id}><Tag tone={n.kind === 'critical' ? 'bad' : 'warn'}>{n.kind}</Tag> <Link to={n.link || '/notifications'}>{n.title}</Link> <small className="muted">{n.body}</small></li>))}
            </ul>
          )}
        </Block>
        <Block title="Recent activity" id="ah-audit" to="/audit">
          <ul className="plain-list">
            {d.recentActivity.map((a) => (<li key={a._id}><strong>{a.userName}</strong> <small className="muted">{timeAgo(a.at)}</small><br />{a.summary || a.action}</li>))}
          </ul>
        </Block>
      </div>
      <p><Link className="btn btn-ghost" to="/reports"><Icon name="chart" /> Open reports</Link></p>
    </>
  );
}

// ------------------------------------------------------------------ doctor
function DoctorHome({ d, reload }) {
  const toast = useToast();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const waiting = d.queue.tokens.filter((t) => t.status === 'waiting');
  const called = d.queue.tokens.find((t) => t.status === 'called');
  const callNext = async () => {
    setBusy(true);
    try {
      await api.post(`/queue/${waiting[0]._id}/call`, {});
      toast.success(`${waiting[0].number} called.`);
      reload();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  const start = async (t) => {
    try {
      const res = await api.post(`/queue/${t._id}/start`, {});
      navigate(`/visits/${res.visitRecord._id}`);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };
  return (
    <>
      <div className="stat-grid">
        <Stat label="Appointments today" value={d.appointments.length} to="/appointments" />
        <Stat label="Waiting now" value={d.queue.stats.waiting} to="/queue" hint={`avg wait ${d.queue.stats.avgWaitMin} min`} />
        <Stat label="Open visits" value={d.openVisits.length} to="/visits" />
        <Stat label="Results to review" value={d.labsToReview.length} to="/labs" tone={d.labsToReview.some((l) => l.critical) ? 'bad' : undefined} />
      </div>
      <div className="dash-grid">
        <Block title="Patient queue" id="dh-q" to="/queue" linkLabel="Open queue">
          <div className="inline-actions">
            {called ? <button type="button" className="btn btn-primary" onClick={() => start(called)}>Start consult with {called.number}</button>
              : <button type="button" className="btn btn-primary" disabled={!waiting.length || busy} onClick={callNext}><Icon name="play" size={14} /> Call next patient</button>}
          </div>
          <QueueList tokens={d.queue.tokens} empty="No one is waiting." />
        </Block>
        <Block title="Today's appointments" id="dh-a" to="/appointments">
          {d.appointments.length === 0 ? <Empty>No appointments today.</Empty> : (
            <ul className="plain-list">
              {d.appointments.map((a) => (<li key={a._id}><time>{fmtTime(a.date)}</time> <Link to={`/patients/${a.patient?._id}`}>{a.patient?.name}</Link> <Tag value={a.status} /><small className="muted block">{a.reason}</small></li>))}
            </ul>
          )}
        </Block>
        <Block title="Open visits" id="dh-v" to="/visits">
          {d.openVisits.length === 0 ? <Empty>No open visits.</Empty> : (
            <ul className="plain-list">
              {d.openVisits.slice(0, 6).map((v) => (<li key={v._id}><Link to={`/visits/${v._id}`}>{v.visitNo}</Link> {v.patient?.name} <Tag value={v.status} /><small className="muted block">{v.chiefComplaint}</small></li>))}
            </ul>
          )}
        </Block>
        <Block title="Lab results to review" id="dh-l" to="/labs">
          {d.labsToReview.length === 0 ? <Empty>Nothing waiting for review.</Empty> : (
            <ul className="plain-list">
              {d.labsToReview.map((l) => (<li key={l._id}>{l.patient?.name}: {l.testName} <strong>{l.value} {l.unit}</strong> <Tag value={l.flag} /></li>))}
            </ul>
          )}
        </Block>
        {d.admitted.length > 0 && (
          <Block title="My inpatients" id="dh-i" to="/wards">
            <ul className="plain-list">{d.admitted.map((a) => (<li key={a._id}><Link to={`/patients/${a.patient?._id}`}>{a.patient?.name}</Link> <small className="muted">{a.ward?.name}</small></li>))}</ul>
          </Block>
        )}
      </div>
    </>
  );
}

// ------------------------------------------------------------------ nurse
function NurseHome({ d, reload }) {
  const [triage, setTriage] = useState(null);
  const open = async (t) => {
    const visit = t.visit ? await api.get(`/visits/${t.visit}`) : null;
    setTriage({ token: t, visit, patient: t.patient });
  };
  return (
    <>
      <div className="stat-grid">
        <Stat label="Awaiting triage" value={d.awaitingTriage.length} to="/queue" tone={d.awaitingTriage.some((t) => t.priority === 'emergency') ? 'bad' : undefined} />
        <Stat label="Waiting overall" value={d.queue.stats.waiting} to="/queue" />
        <Stat label="Inpatients" value={d.inpatients.length} to="/wards" />
        <Stat label="Beds free" value={d.beds.available} to="/wards" hint={`${d.beds.occupancyPct}% occupied`} />
        <Stat label="Samples to collect" value={d.samplesToCollect} to="/labs" />
      </div>
      <div className="dash-grid">
        <Block title="Triage and vitals" id="nh-t" to="/queue" linkLabel="Open queue">
          {d.awaitingTriage.length === 0 ? <Empty>Nobody is waiting for vitals.</Empty> : (
            <ul className="plain-list queue-mini">
              {d.awaitingTriage.slice(0, 8).map((t) => (
                <li key={t._id}>
                  <strong className="token-no">{t.number}</strong>
                  <span>{t.patient?.name} <small className="muted">{t.reason}</small></span>
                  <span><Tag value={t.priority} /> <button type="button" className="btn btn-primary btn-sm" onClick={() => open(t)}>Take vitals</button></span>
                </li>
              ))}
            </ul>
          )}
        </Block>
        <Block title="Ward round" id="nh-w" to="/wards" linkLabel="Bed board">
          {d.inpatients.length === 0 ? <Empty>No inpatients.</Empty> : (
            <ul className="plain-list">
              {d.inpatients.slice(0, 10).map((a) => (<li key={a._id}><strong>{a.bedLabel}</strong> <Link to={`/patients/${a.patient?._id}`}>{a.patient?.name}</Link> <small className="muted">{a.ward?.name}, {a.doctor?.name}</small></li>))}
            </ul>
          )}
        </Block>
        <Block title="Visits in triage" id="nh-v" to="/visits">
          {d.openVisits.length === 0 ? <Empty>None.</Empty> : (
            <ul className="plain-list">{d.openVisits.slice(0, 6).map((v) => (<li key={v._id}><Link to={`/visits/${v._id}`}>{v.visitNo}</Link> {v.patient?.name} <Tag value={v.triagePriority} /></li>))}</ul>
          )}
        </Block>
      </div>
      {triage && <VitalsModal visit={triage.visit} patient={triage.patient} token={triage.token} onClose={() => setTriage(null)} onDone={reload} />}
    </>
  );
}

// ------------------------------------------------------------------ receptionist
function ReceptionHome({ d, reload }) {
  const [modal, setModal] = useState('');
  const [checkin, setCheckin] = useState(null);
  const [paying, setPaying] = useState(null);
  return (
    <>
      <div className="stat-grid">
        <Stat label="Appointments today" value={d.appointments.length} to="/appointments" />
        <Stat label="Waiting in queue" value={d.queue.stats.waiting} to="/queue" hint={`avg wait ${d.queue.stats.avgWaitMin} min`} />
        <Stat label="Open invoices" value={d.openInvoices.length} to="/billing" />
        <Stat label="Beds free" value={d.beds.available} to="/wards" />
      </div>
      <div className="quick-actions" role="group" aria-label="Quick actions">
        <button type="button" className="btn btn-primary" onClick={() => setModal('patient')}><Icon name="plus" /> Register patient</button>
        <button type="button" className="btn btn-primary" onClick={() => setModal('appt')}><Icon name="calendar" /> Book appointment</button>
        <button type="button" className="btn btn-primary" onClick={() => setModal('token')}><Icon name="queue" /> Issue token</button>
      </div>
      <div className="dash-grid">
        <Block title="Today's appointments" id="rh-a" to="/appointments">
          {d.appointments.length === 0 ? <Empty>No appointments today.</Empty> : (
            <ul className="plain-list">
              {d.appointments.map((a) => (
                <li key={a._id}>
                  <time>{fmtTime(a.date)}</time> {a.patient?.name} <small className="muted">with {a.doctor?.name}</small> <Tag value={a.status} />
                  {a.status === 'scheduled' && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCheckin(a)}>Check in</button>}
                </li>
              ))}
            </ul>
          )}
        </Block>
        <Block title="Queue" id="rh-q" to="/queue" linkLabel="Open queue">
          <QueueList tokens={d.queue.tokens} empty="The queue is empty." />
        </Block>
        <Block title="Billing counter" id="rh-b" to="/billing">
          {d.openInvoices.length === 0 ? <Empty>No open invoices.</Empty> : (
            <ul className="plain-list">
              {d.openInvoices.map((i) => (
                <li key={i._id}><Link to={`/billing/${i._id}`}>{i.invoiceNo}</Link> {i.patient?.name} <strong>{money(i.balance)}</strong> <Tag value={i.displayStatus} />
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPaying(i)}>Take payment</button></li>
              ))}
            </ul>
          )}
        </Block>
      </div>
      {modal === 'patient' && <PatientFormModal onClose={() => setModal('')} onSaved={reload} />}
      {modal === 'appt' && <AppointmentFormModal onClose={() => setModal('')} onSaved={reload} />}
      {modal === 'token' && <IssueTokenModal onClose={() => setModal('')} onDone={reload} />}
      {checkin && <IssueTokenModal appointment={checkin} onClose={() => setCheckin(null)} onDone={reload} />}
      {paying && <PaymentModal invoice={paying} onClose={() => setPaying(null)} onDone={reload} />}
    </>
  );
}

// ------------------------------------------------------------------ pharmacist
function PharmacyHome({ d }) {
  return (
    <>
      <div className="stat-grid">
        <Stat label="To dispense" value={d.stats.pending} to="/pharmacy" />
        <Stat label="Dispensed today" value={d.stats.dispensedToday} />
        <Stat label="Low or out of stock" value={d.lowStock.length} to="/pharmacy/stock" tone={d.lowStock.length ? 'warn' : undefined} />
        <Stat label="Expiring or expired" value={d.expiring.length} to="/pharmacy/stock" tone={d.expiring.length ? 'warn' : undefined} />
      </div>
      <div className="dash-grid">
        <Block title="Prescriptions waiting" id="ph-p" to="/pharmacy" linkLabel="Open dispensing">
          {d.pending.length === 0 ? <Empty>Nothing waiting.</Empty> : (
            <ul className="plain-list">
              {d.pending.map((r) => (<li key={r._id}><strong>{r.rxNo}</strong> {r.patient?.name} <small className="muted">{r.items.map((i) => i.drug).join(', ')}</small> <Tag value={r.status} /></li>))}
            </ul>
          )}
        </Block>
        <Block title="Stock to reorder" id="ph-s" to="/pharmacy/stock" linkLabel="Open stock">
          {d.lowStock.length === 0 ? <Empty>All items are above their reorder level.</Empty> : (
            <ul className="plain-list">{d.lowStock.map((i) => (<li key={i._id}>{i.name}: <strong>{i.stock}</strong> left <Tag value={i.stockStatus} /></li>))}</ul>
          )}
        </Block>
        <Block title="Expiry watch" id="ph-e" to="/pharmacy/stock" linkLabel="Open stock">
          {d.expiring.length === 0 ? <Empty>No lots near expiry.</Empty> : (
            <ul className="plain-list">{d.expiring.map((i) => (<li key={i._id}>{i.name}: earliest {fmtDate(i.nextExpiry)} <Tag value={i.expiryStatus} /></li>))}</ul>
          )}
        </Block>
      </div>
    </>
  );
}

// ------------------------------------------------------------------ lab technician
function LabHome({ d }) {
  return (
    <>
      <div className="stat-grid">
        <Stat label="Samples to collect" value={d.stats.toCollect} to="/labs" />
        <Stat label="Awaiting results" value={d.stats.toResult} to="/labs" />
        <Stat label="Resulted today" value={d.stats.resultedToday} />
      </div>
      <div className="dash-grid">
        <Block title="Worklist" id="lh-w" to="/labs" linkLabel="Open worklist">
          {d.worklist.length === 0 ? <Empty>The worklist is empty.</Empty> : (
            <ul className="plain-list">
              {d.worklist.map((o) => (<li key={o._id}><strong>{o.testName}</strong> {o.patient?.name} <Tag value={o.status} /> {o.priority === 'urgent' && <Tag value="urgent" />}<small className="muted block">{o.orderNo}, ordered {timeAgo(o.orderedAt)}</small></li>))}
            </ul>
          )}
        </Block>
        <Block title="Recent critical results" id="lh-c" to="/labs">
          {d.critical.length === 0 ? <Empty>No critical results recently.</Empty> : (
            <ul className="plain-list">{d.critical.map((o) => (<li key={o._id}>{o.patient?.name}: {o.testName} <strong>{o.value} {o.unit}</strong> <Tag value={o.flag} /><small className="muted block">{fmtDateTime(o.resultedAt)}</small></li>))}</ul>
          )}
        </Block>
      </div>
    </>
  );
}

const SUB = {
  admin: 'A snapshot of the whole hospital.',
  doctor: 'Your patients, queue and results.',
  nurse: 'Triage, vitals and the ward round.',
  receptionist: 'Arrivals, bookings and the billing counter.',
  pharmacist: 'Prescriptions and stock.',
  lab_tech: 'Samples and results.',
};

export default function Home() {
  const { user, role } = useAuth();
  const { data, loading, error, reload } = useFetch('/dashboard', {}, { interval: 20000 });
  return (
    <>
      <Greeting user={user} role={role} sub={SUB[role]} />
      {loading && (<><SkeletonCards count={4} /><SkeletonList rows={4} label="Loading overview" /></>)}
      {error && <ErrorState message={error} onRetry={reload} />}
      {data && role === 'admin' && <AdminHome d={data} />}
      {data && role === 'doctor' && <DoctorHome d={data} reload={reload} />}
      {data && role === 'nurse' && <NurseHome d={data} reload={reload} />}
      {data && role === 'receptionist' && <ReceptionHome d={data} reload={reload} />}
      {data && role === 'pharmacist' && <PharmacyHome d={data} />}
      {data && role === 'lab_tech' && <LabHome d={data} />}
    </>
  );
}
