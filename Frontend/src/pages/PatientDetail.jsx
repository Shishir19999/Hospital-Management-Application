import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { useToast } from '../context/ToastContext';
import { useFetch } from '../hooks/useFetch';
import { can } from '../lib/permissions';
import { downloadCsv } from '../lib/csv';
import { APPOINTMENT_CSV } from '../lib/exports';
import { fmtDate, fmtDateTime } from '../lib/dates';
import { label, money } from '../lib/format';
import { errorMessage } from '../api/errors';
import Icon from '../ui/Icon';
import { ConfirmDialog } from '../ui/Modal';
import { EmptyState, ErrorState, PageHeader, SkeletonList } from '../ui/Common';
import { AppointmentFormModal, PatientFormModal } from '../ui/Forms';
import { IssueTokenModal } from '../ui/ClinicalForms';
import { LineChart } from '../ui/Charts';
import { Dl, PrintButton, Section, Tabs, Tag } from '../ui/Kit';

function vitalSeries(visits) {
  const rows = [...visits].filter((v) => v.vitals && Object.keys(v.vitals).length).sort((a, b) => new Date(a.startedAt) - new Date(b.startedAt));
  const pts = (key) => rows.filter((v) => v.vitals[key] != null).map((v) => ({ t: v.startedAt, v: v.vitals[key] }));
  return { rows, pts };
}

export default function PatientDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { role } = useAuth();
  const { refresh } = useData();
  const toast = useToast();
  const { data, loading, error, reload } = useFetch(`/patients/${id}/summary`);
  const [tab, setTab] = useState('timeline');
  const [edit, setEdit] = useState(false);
  const [booking, setBooking] = useState(false);
  const [queueing, setQueueing] = useState(false);
  const [confirm, setConfirm] = useState(false);

  const events = useMemo(() => {
    if (!data) return [];
    const ev = [];
    for (const v of data.visits || []) ev.push({ at: v.startedAt, kind: 'Visit', tone: v.status, title: `${v.visitNo}: ${v.chiefComplaint || 'Consultation'}`, text: [v.doctor?.name, (v.diagnoses || []).map((d) => d.name).join(', ')].filter(Boolean).join(' - '), to: can(role, 'visits.read') ? `/visits/${v._id}` : null });
    for (const a of data.appointments || []) ev.push({ at: a.date, kind: 'Appointment', tone: a.status, title: `Appointment with ${a.doctor?.name}`, text: a.reason, status: a.status });
    for (const l of data.labs || []) ev.push({ at: l.resultedAt || l.orderedAt, kind: 'Lab', tone: l.abnormal ? 'high' : l.status, title: `${l.testName}${l.status === 'resulted' ? `: ${l.value} ${l.unit}` : ` (${l.status})`}`, text: l.abnormal ? `Flag: ${label(l.flag)}` : '' });
    for (const r of data.prescriptions || []) ev.push({ at: r.issuedAt, kind: 'Prescription', tone: r.status, title: `${r.rxNo}: ${r.items.map((i) => i.drug).join(', ')}`, text: r.doctor?.name });
    for (const i of data.invoices || []) ev.push({ at: i.issuedAt, kind: 'Bill', tone: i.status, title: `${i.invoiceNo}: ${money(i.total)}`, text: `Paid ${money(i.paid)}`, to: `/billing/${i._id}` });
    for (const a of data.admissions || []) ev.push({ at: a.admittedAt, kind: 'Admission', tone: a.status, title: `${a.admissionNo}: ${a.ward?.name || 'Ward'}`, text: a.reason });
    return ev.sort((a, b) => new Date(b.at) - new Date(a.at));
  }, [data, role]);

  if (loading) return <SkeletonList rows={6} label="Loading patient" />;
  if (error) {
    return error === 'Patient not found' ? (
      <EmptyState title="Patient not found" text="This record may have been deleted." action={<Link className="btn btn-primary" to="/patients">Back to patients</Link>} />
    ) : (
      <ErrorState message={error} onRetry={reload} />
    );
  }
  const { patient } = data;
  const visits = data.visits || [];
  const completed = visits.filter((v) => v.status === 'completed');
  const { rows: vrows, pts } = vitalSeries(visits);

  const remove = async () => {
    try {
      await api.del(`/patients/delete/${patient._id}`);
      await refresh();
      toast.success(`${patient.name} was deleted.`);
      navigate('/patients');
    } catch (err) {
      toast.error(errorMessage(err));
      setConfirm(false);
    }
  };

  const tabs = [
    { value: 'timeline', label: 'Timeline', count: events.length },
    data.visits && { value: 'vitals', label: 'Vitals', count: vrows.length },
    data.prescriptions && { value: 'meds', label: 'Medications', count: data.prescriptions.length },
    data.labs && { value: 'labs', label: 'Lab results', count: data.labs.length },
    data.invoices && { value: 'bills', label: 'Bills', count: data.invoices.length },
    data.admissions && { value: 'stays', label: 'Admissions', count: data.admissions.length },
  ].filter(Boolean);
  const panel = (value, title, children) => (
    <div role="tabpanel" aria-labelledby={`tab-${value}`} hidden={tab !== value} className="tab-panel">
      <h2 className="print-only">{title}</h2>
      {children}
    </div>
  );
  const history = data.appointments || [];

  return (
    <div className="print-area">
      <Link to="/patients" className="back-link no-print">
        <Icon name="back" size={16} /> All patients
      </Link>
      <PageHeader title={patient.name} subtitle={`${patient.mrn || ''} - patient summary, printed ${fmtDate(new Date())}`}>
        <PrintButton label="Print summary" className="btn btn-ghost" />
        {history.length > 0 && (
          <button type="button" className="btn btn-ghost" onClick={() => downloadCsv(`${patient.name.replace(/\s+/g, '-').toLowerCase()}-appointments.csv`, APPOINTMENT_CSV, history)}>
            <Icon name="download" /> Export CSV
          </button>
        )}
        {can(role, 'queue.issue') && (
          <button type="button" className="btn btn-ghost" onClick={() => setQueueing(true)}>
            <Icon name="queue" /> Add to queue
          </button>
        )}
        {can(role, 'appointments.write') && (
          <button type="button" className="btn btn-primary" onClick={() => setBooking(true)}>
            <Icon name="plus" /> Book appointment
          </button>
        )}
        {can(role, 'patients.update') && (
          <button type="button" className="btn btn-ghost" onClick={() => setEdit(true)}>
            <Icon name="edit" /> Edit
          </button>
        )}
        {can(role, 'patients.remove') && (
          <button type="button" className="btn btn-ghost danger" onClick={() => setConfirm(true)}>
            <Icon name="trash" /> Delete
          </button>
        )}
      </PageHeader>

      {patient.allergies?.length > 0 && (
        <p className="warn-box" role="note">
          <Icon name="warn" /> Allergies: <strong>{patient.allergies.join(', ')}</strong>
        </p>
      )}

      <div className="detail-grid">
        <Section title="Details" id="pd-details">
          <Dl
            items={[
              ['Age', `${patient.age} years`],
              ['Gender', patient.gender],
              ['Blood group', patient.bloodGroup],
              ['Phone', patient.phone],
              ['Email', patient.email],
              ['Address', patient.address],
              ['Emergency contact', patient.emergencyContact],
              ['Known conditions', patient.conditions],
              ['Primary doctor', patient.doctor?.name],
            ]}
          />
          <div className="mini-stats">
            <div>
              <strong>{completed.length}</strong>
              <span className="muted">completed visits</span>
            </div>
            <div>
              <strong>{history.filter((a) => a.status === 'scheduled' && new Date(a.date) > new Date()).length}</strong>
              <span className="muted">upcoming</span>
            </div>
            <div>
              <strong>{new Set(completed.map((v) => v.doctor?._id)).size}</strong>
              <span className="muted">doctors seen</span>
            </div>
          </div>
        </Section>

        <section className="card section" aria-label="Clinical record">
          <Tabs tabs={tabs} value={tab} onChange={setTab} label="Patient record sections" />
          {panel('timeline', 'Timeline', events.length === 0 ? (
            <p className="muted">Nothing on record yet.</p>
          ) : (
            <ol className="timeline">
              {events.slice(0, 60).map((e, i) => (
                <li key={`${e.kind}-${i}`}>
                  <div className="tl-head">
                    <strong>{fmtDateTime(e.at)}</strong>
                    <span>
                      <Tag tone="neutral">{e.kind}</Tag> <Tag value={e.tone} />
                    </span>
                  </div>
                  <div>{e.to ? <Link to={e.to}>{e.title}</Link> : e.title}</div>
                  {e.text && <p className="tl-note">{e.text}</p>}
                </li>
              ))}
            </ol>
          ))}
          {data.visits && panel('vitals', 'Vitals', vrows.length === 0 ? (
            <p className="muted">No vital signs recorded yet.</p>
          ) : (
            <>
              <div className="chart-grid-2">
                <div>
                  <h3>Blood pressure (mmHg)</h3>
                  <LineChart title="Blood pressure" unit=" mmHg" band={[60, 120]} series={[{ name: 'Systolic', points: pts('systolic') }, { name: 'Diastolic', points: pts('diastolic') }]} />
                </div>
                <div>
                  <h3>Pulse (bpm)</h3>
                  <LineChart title="Pulse" unit=" bpm" band={[60, 100]} series={[{ name: 'Pulse', points: pts('pulse') }]} />
                </div>
                <div>
                  <h3>Temperature (C)</h3>
                  <LineChart title="Temperature" unit=" C" band={[36, 37.5]} series={[{ name: 'Temperature', points: pts('tempC') }]} />
                </div>
                <div>
                  <h3>Oxygen saturation (%)</h3>
                  <LineChart title="Oxygen saturation" unit="%" band={[95, 100]} series={[{ name: 'SpO2', points: pts('spo2') }]} />
                </div>
                <div>
                  <h3>Weight (kg)</h3>
                  <LineChart title="Weight" unit=" kg" series={[{ name: 'Weight', points: pts('weightKg') }]} />
                </div>
              </div>
              <div className="table-scroll" tabIndex={0} role="region" aria-label="Vitals table">
                <table className="table">
                  <thead><tr><th scope="col">Date</th><th scope="col">BP</th><th scope="col">Pulse</th><th scope="col">Temp</th><th scope="col">SpO2</th><th scope="col">BMI</th></tr></thead>
                  <tbody>
                    {[...vrows].reverse().slice(0, 12).map((v) => (
                      <tr key={v._id}>
                        <td data-label="Date">{fmtDate(v.startedAt)}</td>
                        <td data-label="BP">{v.vitals.systolic ? `${v.vitals.systolic}/${v.vitals.diastolic}` : '-'} {v.flags?.bp && v.flags.bp !== 'normal' && <Tag value={v.flags.bp} />}</td>
                        <td data-label="Pulse">{v.vitals.pulse ?? '-'}</td>
                        <td data-label="Temp">{v.vitals.tempC ?? '-'}</td>
                        <td data-label="SpO2">{v.vitals.spo2 ?? '-'}</td>
                        <td data-label="BMI">{v.vitals.bmi ?? '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ))}
          {data.prescriptions && panel('meds', 'Medications', data.prescriptions.length === 0 ? (
            <p className="muted">No prescriptions yet.</p>
          ) : (
            <ul className="plain-list rx-list">
              {data.prescriptions.map((r) => (
                <li key={r._id}>
                  <div className="tl-head">
                    <strong>{r.rxNo}</strong> <span><span className="muted">{fmtDate(r.issuedAt)} - {r.doctor?.name}</span> <Tag value={r.status} /></span>
                  </div>
                  <ul>
                    {r.items.map((i, k) => (
                      <li key={k}>{i.drug} - {i.dose}, {i.frequency} for {i.durationDays} days{i.instructions ? ` (${i.instructions})` : ''}</li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          ))}
          {data.labs && panel('labs', 'Lab results', data.labs.length === 0 ? (
            <p className="muted">No lab tests ordered.</p>
          ) : (
            <div className="table-scroll" tabIndex={0} role="region" aria-label="Lab results table">
              <table className="table">
                <thead><tr><th scope="col">Test</th><th scope="col">Result</th><th scope="col">Reference</th><th scope="col">Flag</th><th scope="col">Date</th></tr></thead>
                <tbody>
                  {data.labs.map((l) => (
                    <tr key={l._id}>
                      <td data-label="Test">{l.testName}</td>
                      <td data-label="Result">{l.status === 'resulted' ? `${l.value} ${l.unit}` : <Tag value={l.status} />}</td>
                      <td data-label="Reference">{l.range?.low ?? ''}{l.range?.low != null || l.range?.high != null ? ' - ' : ''}{l.range?.high ?? ''}</td>
                      <td data-label="Flag">{l.status === 'resulted' ? <Tag value={l.flag} /> : '-'}</td>
                      <td data-label="Date">{fmtDate(l.resultedAt || l.orderedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
          {data.invoices && panel('bills', 'Bills', data.invoices.length === 0 ? (
            <p className="muted">No bills yet.</p>
          ) : (
            <div className="table-scroll" tabIndex={0} role="region" aria-label="Bills table">
              <table className="table">
                <thead><tr><th scope="col">Invoice</th><th scope="col">Date</th><th scope="col" className="num">Total</th><th scope="col" className="num">Paid</th><th scope="col">Status</th></tr></thead>
                <tbody>
                  {data.invoices.map((i) => (
                    <tr key={i._id}>
                      <td data-label="Invoice"><Link to={`/billing/${i._id}`}>{i.invoiceNo}</Link></td>
                      <td data-label="Date">{fmtDate(i.issuedAt)}</td>
                      <td data-label="Total" className="num">{money(i.total)}</td>
                      <td data-label="Paid" className="num">{money(i.paid)}</td>
                      <td data-label="Status"><Tag value={i.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
          {data.admissions && panel('stays', 'Admissions', data.admissions.length === 0 ? (
            <p className="muted">No admissions.</p>
          ) : (
            <ul className="plain-list">
              {data.admissions.map((a) => (
                <li key={a._id}>
                  <strong>{a.admissionNo}</strong> <Tag value={a.status} /> - {a.ward?.name}, admitted {fmtDate(a.admittedAt)}
                  {a.dischargedAt ? `, discharged ${fmtDate(a.dischargedAt)}` : ''}. {a.reason}
                  {a.dischargeSummary && <p className="tl-note">{a.dischargeSummary}</p>}
                </li>
              ))}
            </ul>
          ))}
        </section>
      </div>

      {edit && <PatientFormModal patient={patient} onClose={() => setEdit(false)} onSaved={reload} />}
      {booking && <AppointmentFormModal preset={{ patient: patient._id }} onClose={() => setBooking(false)} onSaved={reload} />}
      {queueing && <IssueTokenModal patient={patient} onClose={() => setQueueing(false)} onDone={reload} />}
      {confirm && (
        <ConfirmDialog
          title="Delete patient?"
          message={`${patient.name} will be removed. Patients with visits, bills or admissions cannot be deleted. This cannot be undone.`}
          onConfirm={remove}
          onCancel={() => setConfirm(false)}
        />
      )}
    </div>
  );
}
