import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { useToast } from '../context/ToastContext';
import { useFetch } from '../hooks/useFetch';
import { useFormSubmit } from '../hooks/useFormSubmit';
import { can } from '../lib/permissions';
import { fmtDate, fmtDateTime } from '../lib/dates';
import { label, money } from '../lib/format';
import { errorMessage } from '../api/errors';
import { WARD_TYPES } from '../../../shared/catalog.js';
import { daysStayed } from '../../../shared/domain.js';
import Icon from '../ui/Icon';
import { Field, ErrorState, PageHeader, SkeletonList } from '../ui/Common';
import { FormActions, ServerError } from '../ui/FormParts';
import { ConfirmDialog, Modal } from '../ui/Modal';
import { PatientPicker, Stat, Tabs, Tag } from '../ui/Kit';

function AdmitModal({ wards, bed, onClose, onDone }) {
  const { patients, doctors } = useData();
  const toast = useToast();
  const free = wards.flatMap((w) => w.beds.filter((b) => b.status === 'available').map((b) => ({ ...b, wardName: w.name })));
  const [v, setV] = useState({ patient: '', bed: bed?._id || '', doctor: '', reason: '', diagnosis: '' });
  const set = (k) => (e) => setV((x) => ({ ...x, [k]: e.target.value }));
  const { errors, serverError, busy, submit } = useFormSubmit({
    validate: () => {
      const e = {};
      if (!v.patient) e.patient = 'Choose a patient.';
      if (!v.bed) e.bed = 'Choose a bed.';
      if (!v.doctor) e.doctor = 'Choose the responsible doctor.';
      if (!v.reason.trim()) e.reason = 'Give the reason for admission.';
      return e;
    },
    save: () => api.post('/admissions', v),
    onDone: (a) => {
      toast.success(`${a.patient?.name} admitted (${a.admissionNo}).`);
      onDone();
      onClose();
    },
  });
  return (
    <Modal title="Admit patient" onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <ServerError message={serverError} />
        <PatientPicker patients={patients} value={v.patient} onChange={(id) => setV((x) => ({ ...x, patient: id }))} error={errors.patient} id="ad-patient" />
        <Field label="Bed" id="ad-bed" error={errors.bed}>
          <select id="ad-bed" value={v.bed} onChange={set('bed')} aria-invalid={!!errors.bed}>
            <option value="">Select a free bed...</option>
            {free.map((b) => (<option key={b._id} value={b._id}>{b.wardName} - {b.label}</option>))}
          </select>
        </Field>
        <Field label="Responsible doctor" id="ad-doc" error={errors.doctor}>
          <select id="ad-doc" value={v.doctor} onChange={set('doctor')} aria-invalid={!!errors.doctor}>
            <option value="">Select...</option>
            {doctors.map((d) => (<option key={d._id} value={d._id}>{d.name} ({d.specialty})</option>))}
          </select>
        </Field>
        <Field label="Reason for admission" id="ad-reason" error={errors.reason}><input id="ad-reason" maxLength="200" value={v.reason} onChange={set('reason')} aria-invalid={!!errors.reason} /></Field>
        <Field label="Working diagnosis" id="ad-dx"><input id="ad-dx" maxLength="200" value={v.diagnosis} onChange={set('diagnosis')} /></Field>
        <FormActions busy={busy} onClose={onClose} label="Admit" />
      </form>
    </Modal>
  );
}

function TransferModal({ wards, admission, onClose, onDone }) {
  const toast = useToast();
  const free = wards.flatMap((w) => w.beds.filter((b) => b.status === 'available').map((b) => ({ ...b, wardName: w.name })));
  const [bed, setBed] = useState('');
  const [reason, setReason] = useState('');
  const { errors, serverError, busy, submit } = useFormSubmit({
    validate: () => ({ ...(bed ? {} : { bed: 'Choose the new bed.' }), ...(reason.trim() ? {} : { reason: 'Give a reason.' }) }),
    save: () => api.post(`/admissions/${admission._id}/transfer`, { bed, reason: reason.trim() }),
    onDone: () => {
      toast.success('Patient transferred.');
      onDone();
      onClose();
    },
  });
  return (
    <Modal title={`Transfer ${admission.patient?.name}`} onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <ServerError message={serverError} />
        <Field label="New bed" id="tr-bed" error={errors.bed}>
          <select id="tr-bed" value={bed} onChange={(e) => setBed(e.target.value)} autoFocus aria-invalid={!!errors.bed}>
            <option value="">Select a free bed...</option>
            {free.map((b) => (<option key={b._id} value={b._id}>{b.wardName} - {b.label}</option>))}
          </select>
        </Field>
        <Field label="Reason" id="tr-reason" error={errors.reason}><input id="tr-reason" maxLength="200" value={reason} onChange={(e) => setReason(e.target.value)} aria-invalid={!!errors.reason} /></Field>
        <FormActions busy={busy} onClose={onClose} label="Transfer" />
      </form>
    </Modal>
  );
}

function DischargeModal({ admission, onClose, onDone }) {
  const toast = useToast();
  const navigate = useNavigate();
  const { role } = useAuth();
  const [summary, setSummary] = useState('');
  const [type, setType] = useState('routine');
  const [done, setDone] = useState(null);
  const { errors, serverError, busy, submit } = useFormSubmit({
    validate: () => (summary.trim() ? {} : { summary: 'Write a short discharge summary.' }),
    save: () => api.post(`/admissions/${admission._id}/discharge`, { summary: summary.trim(), type }),
    onDone: (a) => {
      toast.success(`${a.patient?.name} discharged.`);
      onDone();
      setDone(a);
    },
  });
  const makeInvoice = async () => {
    try {
      const inv = await api.post(`/invoices/from-admission/${admission._id}`, {});
      onClose();
      navigate(`/billing/${inv._id}`);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };
  if (done) {
    return (
      <Modal title="Patient discharged" onClose={onClose}>
        <p>{done.patient?.name} left bed {admission.bedLabel || ''} after <strong>{done.charges.days}</strong> day{done.charges.days > 1 ? 's' : ''}. Bed charges: <strong>{money(done.charges.amount)}</strong> ({money(done.charges.dailyRate)} per day).</p>
        <p className="muted">A discharge summary is saved on the patient record and can be printed from there.</p>
        <div className="form-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Close</button>
          {can(role, 'billing.write') && <button type="button" className="btn btn-primary" onClick={makeInvoice}>Create bed invoice</button>}
          <Link className="btn btn-ghost" to={`/patients/${done.patient?._id}`} onClick={onClose}>Open patient</Link>
        </div>
      </Modal>
    );
  }
  return (
    <Modal title={`Discharge ${admission.patient?.name}`} onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <ServerError message={serverError} />
        <Field label="Discharge type" id="dc-type">
          <select id="dc-type" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="routine">Routine discharge</option><option value="against_advice">Against medical advice</option><option value="referred">Referred elsewhere</option><option value="deceased">Deceased</option>
          </select>
        </Field>
        <Field label="Discharge summary" id="dc-sum" error={errors.summary}><textarea id="dc-sum" rows="4" maxLength="2000" value={summary} onChange={(e) => setSummary(e.target.value)} autoFocus aria-invalid={!!errors.summary} /></Field>
        <FormActions busy={busy} onClose={onClose} label="Discharge" />
      </form>
    </Modal>
  );
}

function WardModal({ onClose, onDone }) {
  const toast = useToast();
  const [v, setV] = useState({ name: '', type: 'general', floor: 1, dailyRate: 40, beds: 8 });
  const set = (k) => (e) => setV((x) => ({ ...x, [k]: e.target.value }));
  const { errors, serverError, busy, submit } = useFormSubmit({
    validate: () => (v.name.trim() ? {} : { name: 'Enter the ward name.' }),
    save: () => api.post('/wards', { ...v, name: v.name.trim(), floor: Number(v.floor), dailyRate: Number(v.dailyRate), beds: Number(v.beds) }),
    onDone: () => {
      toast.success('Ward added.');
      onDone();
      onClose();
    },
  });
  return (
    <Modal title="Add ward" onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <ServerError message={serverError} />
        <Field label="Ward name" id="wd-name" error={errors.name}><input id="wd-name" value={v.name} onChange={set('name')} autoFocus aria-invalid={!!errors.name} /></Field>
        <div className="field-row">
          <Field label="Type" id="wd-type"><select id="wd-type" value={v.type} onChange={set('type')}>{WARD_TYPES.map((t) => (<option key={t}>{t}</option>))}</select></Field>
          <Field label="Floor" id="wd-floor"><input id="wd-floor" type="number" min="0" value={v.floor} onChange={set('floor')} /></Field>
        </div>
        <div className="field-row">
          <Field label="Daily rate" id="wd-rate"><input id="wd-rate" type="number" min="0" value={v.dailyRate} onChange={set('dailyRate')} /></Field>
          <Field label="Number of beds" id="wd-beds"><input id="wd-beds" type="number" min="0" max="60" value={v.beds} onChange={set('beds')} /></Field>
        </div>
        <FormActions busy={busy} onClose={onClose} label="Add ward" />
      </form>
    </Modal>
  );
}

function BedModal({ bed, ward, wards, onClose, onChanged }) {
  const { role } = useAuth();
  const toast = useToast();
  const [sub, setSub] = useState('');
  const a = bed.admission;
  const setStatus = async (status) => {
    try {
      await api.patch(`/beds/${bed._id}/status`, { status });
      toast.success(`Bed ${bed.label} is now ${status}.`);
      onChanged();
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };
  if (sub === 'transfer') return <TransferModal wards={wards} admission={{ ...a, bedLabel: bed.label }} onClose={onClose} onDone={onChanged} />;
  if (sub === 'discharge') return <DischargeModal admission={{ ...a, bedLabel: bed.label }} onClose={onClose} onDone={onChanged} />;
  if (sub === 'admit') return <AdmitModal wards={wards} bed={bed} onClose={onClose} onDone={onChanged} />;
  return (
    <Modal title={`${ward.name}: bed ${bed.label}`} onClose={onClose}>
      <p><Tag value={bed.status} /> {ward.type} ward, floor {ward.floor}, {money(ward.dailyRate)} per day</p>
      {a && (
        <dl className="facts">
          <div><dt>Patient</dt><dd><Link to={`/patients/${a.patient?._id}`} onClick={onClose}>{a.patient?.name}</Link> ({a.patient?.mrn})</dd></div>
          <div><dt>Doctor</dt><dd>{a.doctor?.name}</dd></div>
          <div><dt>Admitted</dt><dd>{fmtDateTime(a.admittedAt)} ({daysStayed(a.admittedAt)} day{daysStayed(a.admittedAt) > 1 ? 's' : ''})</dd></div>
          <div><dt>Reason</dt><dd>{a.reason}</dd></div>
          {a.diagnosis && <div><dt>Diagnosis</dt><dd>{a.diagnosis}</dd></div>}
        </dl>
      )}
      <div className="form-actions wrap">
        {bed.status === 'available' && can(role, 'admissions.admit') && <button type="button" className="btn btn-primary" onClick={() => setSub('admit')}>Admit a patient here</button>}
        {bed.status === 'occupied' && can(role, 'admissions.transfer') && <button type="button" className="btn btn-ghost" onClick={() => setSub('transfer')}>Transfer</button>}
        {bed.status === 'occupied' && can(role, 'admissions.discharge') && <button type="button" className="btn btn-primary" onClick={() => setSub('discharge')}>Discharge</button>}
        {bed.status === 'cleaning' && can(role, 'beds.status') && <button type="button" className="btn btn-primary" onClick={() => setStatus('available')}>Mark as clean and ready</button>}
        {bed.status === 'available' && can(role, 'beds.status') && <button type="button" className="btn btn-ghost" onClick={() => setStatus('maintenance')}>Take out of service</button>}
        {bed.status === 'maintenance' && can(role, 'beds.status') && <button type="button" className="btn btn-primary" onClick={() => setStatus('available')}>Return to service</button>}
        <button type="button" className="btn btn-ghost" onClick={onClose}>Close</button>
      </div>
    </Modal>
  );
}

function Stays() {
  const [status, setStatus] = useState('admitted');
  const { data, loading, error, reload } = useFetch('/admissions', { status, limit: 50 });
  return (
    <>
      <div className="toolbar">
        <div className="field"><label htmlFor="ad-st">Show</label><select id="ad-st" value={status} onChange={(e) => setStatus(e.target.value)}><option value="admitted">Current inpatients</option><option value="discharged">Discharged</option></select></div>
      </div>
      {loading && <SkeletonList label="Loading admissions" />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {data && (
        <div className="card table-card">
          <div className="table-scroll" tabIndex={0} role="region" aria-label="Admissions">
            <table className="table">
              <caption className="sr-only">Admissions</caption>
              <thead><tr><th scope="col">Admission</th><th scope="col">Patient</th><th scope="col">Ward and bed</th><th scope="col">Doctor</th><th scope="col">Admitted</th><th scope="col">{status === 'admitted' ? 'Days' : 'Discharged'}</th></tr></thead>
              <tbody>
                {data.data.length === 0 && <tr><td colSpan="6" className="muted">No admissions here.</td></tr>}
                {data.data.map((a) => (
                  <tr key={a._id}>
                    <td data-label="Admission">{a.admissionNo}</td>
                    <td data-label="Patient"><Link to={`/patients/${a.patient?._id}`}>{a.patient?.name}</Link></td>
                    <td data-label="Ward and bed">{a.ward?.name} {a.bedLabel}</td>
                    <td data-label="Doctor">{a.doctor?.name}</td>
                    <td data-label="Admitted">{fmtDate(a.admittedAt)}</td>
                    <td data-label="Days">{status === 'admitted' ? daysStayed(a.admittedAt) : fmtDate(a.dischargedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}

export default function Wards() {
  const { role } = useAuth();
  const toast = useToast();
  const { data, loading, error, reload } = useFetch('/wards', {}, { interval: 20000 });
  const [tab, setTab] = useState('board');
  const [admit, setAdmit] = useState(false);
  const [wardForm, setWardForm] = useState(false);
  const [bed, setBed] = useState(null);
  const [delWard, setDelWard] = useState(null);
  const [addBed, setAddBed] = useState(null);
  const wards = useMemo(() => data?.wards || [], [data]);

  const removeWard = async () => {
    try {
      await api.del(`/wards/${delWard._id}`);
      toast.success(`${delWard.name} removed.`);
      reload();
    } catch (err) {
      toast.error(errorMessage(err));
    }
    setDelWard(null);
  };
  const newBed = async (w) => {
    const label2 = `${w.name.replace(/[^A-Za-z0-9]/g, '').slice(0, 3).toUpperCase()}-${String(w.beds.length + 1).padStart(2, '0')}`;
    try {
      await api.post(`/wards/${w._id}/beds`, { label: label2 });
      toast.success(`Bed ${label2} added.`);
      reload();
    } catch (err) {
      toast.error(errorMessage(err));
    }
    setAddBed(null);
  };

  const t = data?.totals;
  return (
    <>
      <PageHeader title="Wards and beds" subtitle="Live bed board, admissions, transfers and discharges">
        {can(role, 'admissions.admit') && <button type="button" className="btn btn-primary" onClick={() => setAdmit(true)}><Icon name="plus" /> Admit patient</button>}
        {can(role, 'wards.manage') && <button type="button" className="btn btn-ghost" onClick={() => setWardForm(true)}>Add ward</button>}
      </PageHeader>
      {t && (
        <div className="stat-grid">
          <Stat label="Occupancy" value={`${t.occupancyPct}%`} hint={`${t.occupied} of ${t.total - t.maintenance} usable beds`} />
          <Stat label="Available" value={t.available} />
          <Stat label="Being cleaned" value={t.cleaning} />
          <Stat label="Out of service" value={t.maintenance} />
        </div>
      )}
      <Tabs label="Ward views" value={tab} onChange={setTab} tabs={[{ value: 'board', label: 'Bed board' }, { value: 'stays', label: 'Admissions' }]} />
      {tab === 'stays' ? <Stays /> : (
        <>
          {loading && <SkeletonList label="Loading wards" />}
          {error && <ErrorState message={error} onRetry={reload} />}
          {wards.map((w) => (
            <section key={w._id} className="card section" aria-labelledby={`w-${w._id}`}>
              <div className="card-head">
                <h2 id={`w-${w._id}`}>{w.name} <small className="muted">floor {w.floor}, {w.type}, {w.stats.occupied}/{w.stats.total - w.stats.maintenance} occupied</small></h2>
                {can(role, 'wards.manage') && (
                  <div className="card-actions">
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAddBed(w)}>Add bed</button>
                    <button type="button" className="btn btn-ghost btn-sm danger" onClick={() => setDelWard(w)}>Remove ward</button>
                  </div>
                )}
              </div>
              <ul className="beds" aria-label={`Beds in ${w.name}`}>
                {w.beds.map((b) => (
                  <li key={b._id}>
                    <button type="button" className={`bed bed-${b.status}`} onClick={() => setBed({ bed: b, ward: w })} aria-label={`Bed ${b.label}, ${b.status}${b.admission ? `, ${b.admission.patient?.name}` : ''}`}>
                      <strong>{b.label}</strong>
                      <span>{b.admission ? b.admission.patient?.name : label(b.status)}</span>
                    </button>
                  </li>
                ))}
                {w.beds.length === 0 && <li className="muted">No beds yet.</li>}
              </ul>
            </section>
          ))}
        </>
      )}
      {admit && <AdmitModal wards={wards} onClose={() => setAdmit(false)} onDone={reload} />}
      {wardForm && <WardModal onClose={() => setWardForm(false)} onDone={reload} />}
      {bed && <BedModal bed={bed.bed} ward={bed.ward} wards={wards} onClose={() => setBed(null)} onChanged={reload} />}
      {delWard && <ConfirmDialog title="Remove ward?" message={`${delWard.name} and its beds will be removed. Wards with admitted patients cannot be removed.`} confirmLabel="Remove" onConfirm={removeWard} onCancel={() => setDelWard(null)} />}
      {addBed && <ConfirmDialog title="Add a bed?" message={`One more bed will be added to ${addBed.name}.`} confirmLabel="Add bed" onConfirm={() => newBed(addBed)} onCancel={() => setAddBed(null)} />}
    </>
  );
}
