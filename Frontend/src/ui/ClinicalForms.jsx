import { useMemo, useState } from 'react';
import { Modal } from './Modal';
import { Field } from './Common';
import { FormActions, ServerError } from './FormParts';
import { PatientPicker, Tag } from './Kit';
import Icon from './Icon';
import { api } from '../api';
import { useData } from '../context/DataContext';
import { useToast } from '../context/ToastContext';
import { useFetch } from '../hooks/useFetch';
import { useFormSubmit } from '../hooks/useFormSubmit';
import { FREQUENCIES, bmi, bmiCategory, suggestPriority, suggestQty, vitalFlags } from '../../../shared/domain.js';
import { money } from '../lib/format';

const PRIORITY_OPTIONS = [['routine', 'Routine'], ['urgent', 'Urgent'], ['emergency', 'Emergency']];

// ------------------------------------------------------------------ queue token
export function IssueTokenModal({ patient, appointment, onClose, onDone }) {
  const { patients, doctors } = useData();
  const toast = useToast();
  const [v, setV] = useState({
    patient: patient?._id || appointment?.patient?._id || '',
    doctor: appointment?.doctor?._id || '',
    priority: 'routine',
    reason: appointment?.reason || '',
  });
  const set = (k) => (e) => setV((x) => ({ ...x, [k]: e.target.value }));
  const { errors, serverError, busy, submit } = useFormSubmit({
    validate: () => (v.patient ? {} : { patient: 'Choose a patient.' }),
    save: () => (appointment ? api.post(`/appointments/${appointment._id}/check-in`, {}) : api.post('/queue/issue', { ...v, doctor: v.doctor || null })),
    onDone: (t) => {
      toast.success(`Token ${t.number} issued.`);
      onDone?.(t);
      onClose();
    },
  });
  return (
    <Modal title={appointment ? 'Check in patient' : 'Issue queue token'} onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <ServerError message={serverError} />
        {appointment ? (
          <p>
            Check in <strong>{appointment.patient?.name}</strong> for the appointment with {appointment.doctor?.name}. A token will be issued.
          </p>
        ) : (
          <>
            {patient ? (
              <p>
                Patient: <strong>{patient.name}</strong>
              </p>
            ) : (
              <PatientPicker patients={patients} value={v.patient} onChange={(id) => setV((x) => ({ ...x, patient: id }))} error={errors.patient} id="qt-patient" />
            )}
            <div className="field-row">
              <Field label="Doctor (optional)" id="qt-doc">
                <select id="qt-doc" value={v.doctor} onChange={set('doctor')}>
                  <option value="">Any available doctor</option>
                  {doctors.map((d) => (
                    <option key={d._id} value={d._id}>
                      {d.name} ({d.specialty})
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Priority" id="qt-pri">
                <select id="qt-pri" value={v.priority} onChange={set('priority')}>
                  {PRIORITY_OPTIONS.map(([k, l]) => (
                    <option key={k} value={k}>
                      {l}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Reason for visit" id="qt-reason">
              <input id="qt-reason" maxLength="200" value={v.reason} onChange={set('reason')} />
            </Field>
          </>
        )}
        <FormActions busy={busy} onClose={onClose} label={appointment ? 'Check in' : 'Issue token'} />
      </form>
    </Modal>
  );
}

// ------------------------------------------------------------------ triage vitals
const VITAL_FIELDS = [
  ['systolic', 'Systolic (mmHg)', 50, 300],
  ['diastolic', 'Diastolic (mmHg)', 30, 200],
  ['pulse', 'Pulse (bpm)', 20, 250],
  ['tempC', 'Temperature (C)', 30, 45],
  ['spo2', 'SpO2 (%)', 50, 100],
  ['respRate', 'Resp. rate (/min)', 4, 80],
  ['weightKg', 'Weight (kg)', 0.3, 500],
  ['heightCm', 'Height (cm)', 20, 260],
];
const FLAG_TEXT = { normal: 'Normal', low: 'Low', high: 'High', critical: 'Critical' };

export function VitalsModal({ visit, patient, token, onClose, onDone }) {
  const { doctors } = useData();
  const toast = useToast();
  const cur = visit?.vitals || {};
  const [v, setV] = useState(() => ({
    chiefComplaint: visit?.chiefComplaint || token?.reason || '',
    priority: '',
    doctor: visit?.doctor?._id || token?.doctor?._id || '',
    triageNotes: visit?.triageNotes || '',
    ...Object.fromEntries(VITAL_FIELDS.map(([k]) => [k, cur[k] ?? ''])),
  }));
  const set = (k) => (e) => setV((x) => ({ ...x, [k]: e.target.value }));
  const nums = useMemo(() => Object.fromEntries(VITAL_FIELDS.map(([k]) => [k, v[k] === '' ? undefined : Number(v[k])]).filter(([, n]) => n !== undefined && Number.isFinite(n))), [v]);
  const flags = vitalFlags(nums);
  const suggested = Object.keys(nums).length ? suggestPriority(nums) : 'routine';
  const bmiVal = bmi(nums.weightKg, nums.heightCm);

  const { errors, serverError, busy, submit } = useFormSubmit({
    validate: () => {
      const e = {};
      for (const [k, , lo, hi] of VITAL_FIELDS) {
        if (nums[k] !== undefined && (nums[k] < lo || nums[k] > hi)) e[k] = `Between ${lo} and ${hi}.`;
      }
      if ((nums.systolic === undefined) !== (nums.diastolic === undefined)) e.systolic = 'Enter both blood pressure values.';
      else if (nums.systolic !== undefined && nums.systolic <= nums.diastolic) e.systolic = 'Systolic must be higher than diastolic.';
      if (!Object.keys(nums).length) e.systolic = e.systolic || 'Record at least one vital sign.';
      return e;
    },
    save: () => {
      const body = { chiefComplaint: v.chiefComplaint, vitals: nums, priority: v.priority || undefined, triageNotes: v.triageNotes };
      if (v.doctor) body.doctor = v.doctor;
      if (visit) return api.patch(`/visits/${visit._id}/triage`, body);
      return api.post('/visits', { ...body, patient: patient._id, token: token?._id });
    },
    onDone: (saved) => {
      toast.success('Vitals saved.');
      onDone?.(saved);
      onClose();
    },
  });

  return (
    <Modal title={`Triage: ${patient?.name || visit?.patient?.name || ''}`} onClose={onClose} wide>
      <form onSubmit={submit} noValidate>
        <ServerError message={serverError} />
        <Field label="Chief complaint" id="vt-cc">
          <input id="vt-cc" maxLength="300" value={v.chiefComplaint} onChange={set('chiefComplaint')} autoFocus />
        </Field>
        <div className="vitals-grid">
          {VITAL_FIELDS.map(([k, l, lo, hi]) => (
            <Field key={k} label={l} id={`vt-${k}`} error={errors[k]}>
              <input id={`vt-${k}`} type="number" inputMode="decimal" min={lo} max={hi} step="any" value={v[k]} onChange={set(k)} aria-invalid={!!errors[k]} />
              {flags[k === 'systolic' || k === 'diastolic' ? 'bp' : k] && v[k] !== '' && (
                <Tag tone={{ normal: 'ok', low: 'warn', high: 'warn', critical: 'bad' }[flags[k === 'systolic' || k === 'diastolic' ? 'bp' : k]]}>
                  {FLAG_TEXT[flags[k === 'systolic' || k === 'diastolic' ? 'bp' : k]]}
                </Tag>
              )}
            </Field>
          ))}
        </div>
        <p className="info-box" role="status">
          <Icon name="info" /> BMI: <strong>{bmiVal ?? '-'}</strong> {bmiVal ? `(${bmiCategory(bmiVal)})` : ''}. Suggested priority: <strong>{suggested}</strong>.
        </p>
        <div className="field-row">
          <Field label="Priority" id="vt-pri">
            <select id="vt-pri" value={v.priority} onChange={set('priority')}>
              <option value="">Use suggestion ({suggested})</option>
              {PRIORITY_OPTIONS.map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Assign doctor" id="vt-doc">
            <select id="vt-doc" value={v.doctor} onChange={set('doctor')}>
              <option value="">Leave unassigned</option>
              {doctors.map((d) => (
                <option key={d._id} value={d._id}>
                  {d.name} ({d.specialty})
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Triage notes" id="vt-notes">
          <textarea id="vt-notes" rows="2" maxLength="500" value={v.triageNotes} onChange={set('triageNotes')} />
        </Field>
        <FormActions busy={busy} onClose={onClose} label="Save vitals" />
      </form>
    </Modal>
  );
}

// ------------------------------------------------------------------ lab order
export function LabOrderModal({ visit, patient, onClose, onDone }) {
  const toast = useToast();
  const { data, loading } = useFetch('/labs/tests');
  const [picked, setPicked] = useState([]);
  const [priority, setPriority] = useState('routine');
  const [filter, setFilter] = useState('');
  const groups = useMemo(() => {
    const m = new Map();
    for (const t of data || []) {
      if (filter && !`${t.name} ${t.code}`.toLowerCase().includes(filter.toLowerCase())) continue;
      if (!m.has(t.category)) m.set(t.category, []);
      m.get(t.category).push(t);
    }
    return [...m.entries()];
  }, [data, filter]);
  const total = (data || []).filter((t) => picked.includes(t._id)).reduce((s, t) => s + t.price, 0);
  const { errors, serverError, busy, submit } = useFormSubmit({
    validate: () => (picked.length ? {} : { tests: 'Choose at least one test.' }),
    save: () => api.post('/labs/orders', { patient: patient._id, visit: visit?._id, tests: picked, priority }),
    onDone: (orders) => {
      toast.success(`${orders.length} lab test${orders.length > 1 ? 's' : ''} ordered.`);
      onDone?.(orders);
      onClose();
    },
  });
  return (
    <Modal title="Order lab tests" onClose={onClose} wide>
      <form onSubmit={submit} noValidate>
        <ServerError message={serverError} />
        <div className="field-row">
          <Field label="Find a test" id="lo-q">
            <input id="lo-q" type="search" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Name or code" autoFocus />
          </Field>
          <Field label="Priority" id="lo-pri">
            <select id="lo-pri" value={priority} onChange={(e) => setPriority(e.target.value)}>
              <option value="routine">Routine</option>
              <option value="urgent">Urgent</option>
            </select>
          </Field>
        </div>
        {loading && <p className="muted">Loading tests...</p>}
        <div className="test-list" role="group" aria-label="Available tests">
          {groups.map(([cat, tests]) => (
            <fieldset key={cat} className="fieldset">
              <legend>{cat}</legend>
              {tests.map((t) => (
                <label key={t._id} className="check">
                  <input type="checkbox" checked={picked.includes(t._id)} onChange={() => setPicked((p) => (p.includes(t._id) ? p.filter((x) => x !== t._id) : [...p, t._id]))} />
                  <span>
                    {t.name} <small className="muted">{t.code} - {money(t.price)}</small>
                  </span>
                </label>
              ))}
            </fieldset>
          ))}
        </div>
        {errors.tests && <small className="field-error" role="alert">{errors.tests}</small>}
        <p className="muted">{picked.length} selected - {money(total)}</p>
        <FormActions busy={busy} onClose={onClose} label="Place order" />
      </form>
    </Modal>
  );
}

// ------------------------------------------------------------------ prescription
const emptyItem = () => ({ drug: '', inventoryItem: null, dose: '', frequency: 'BD', durationDays: 5, instructions: '', qty: '' });

export function PrescribeModal({ visit, onClose, onDone }) {
  const toast = useToast();
  const stock = useFetch('/inventory', { limit: 100 });
  const [items, setItems] = useState([emptyItem()]);
  const [notes, setNotes] = useState('');
  const [allergy, setAllergy] = useState('');
  const inv = stock.data?.data || [];
  const patch = (i, p) => setItems((list) => list.map((it, j) => (j === i ? { ...it, ...p } : it)));
  const pickDrug = (i, text) => {
    const hit = inv.find((x) => x.name.toLowerCase() === text.toLowerCase());
    patch(i, { drug: text, inventoryItem: hit?._id || null, dose: items[i].dose || (hit ? `1 ${hit.unit}` : '') });
  };

  const { errors, serverError, busy, submit, setServerError } = useFormSubmit({
    validate: () => {
      const e = {};
      items.forEach((it, i) => {
        if (!it.drug.trim()) e[`drug${i}`] = 'Name the medicine.';
        if (!it.dose.trim()) e[`dose${i}`] = 'Enter the dose.';
        if (!(Number(it.durationDays) >= 1)) e[`days${i}`] = 'At least 1 day.';
      });
      return e;
    },
    save: () => {
      setAllergy('');
      return api.post('/prescriptions', {
        visit: visit._id,
        notes,
        overrideAllergy: allergy === 'confirm' ? true : undefined,
        items: items.map((it) => ({ ...it, durationDays: Number(it.durationDays), qty: it.qty ? Number(it.qty) : undefined, inventoryItem: it.inventoryItem || undefined })),
      });
    },
    onDone: (rx) => {
      toast.success(`Prescription ${rx.rxNo} issued.`);
      onDone?.(rx);
      onClose();
    },
  });

  // an allergy alert comes back as a conflict; offer a deliberate second step
  const wrapped = async (e) => {
    e.preventDefault();
    await submit(e);
  };
  const needsConfirm = /^Allergy alert/.test(serverError);

  return (
    <Modal title="Write prescription" onClose={onClose} wide>
      <form onSubmit={wrapped} noValidate>
        {needsConfirm ? (
          <div className="warn-box" role="alert">
            <Icon name="warn" /> {serverError}
            <button
              type="button"
              className="btn btn-sm btn-danger"
              onClick={() => {
                setAllergy('confirm');
                setServerError('');
                setTimeout(() => document.getElementById('rx-submit')?.click(), 0);
              }}
            >
              Prescribe anyway
            </button>
          </div>
        ) : (
          <ServerError message={serverError} />
        )}
        <datalist id="rx-drugs">
          {inv.map((d) => (
            <option key={d._id} value={d.name} />
          ))}
        </datalist>
        {items.map((it, i) => (
          <fieldset key={i} className="fieldset rx-row">
            <legend>Medicine {i + 1}</legend>
            <div className="field-row">
              <Field label="Medicine" id={`rx-drug-${i}`} error={errors[`drug${i}`]}>
                <input id={`rx-drug-${i}`} list="rx-drugs" value={it.drug} onChange={(e) => pickDrug(i, e.target.value)} autoComplete="off" aria-invalid={!!errors[`drug${i}`]} />
              </Field>
              <Field label="Dose" id={`rx-dose-${i}`} error={errors[`dose${i}`]}>
                <input id={`rx-dose-${i}`} value={it.dose} onChange={(e) => patch(i, { dose: e.target.value })} placeholder="500 mg" aria-invalid={!!errors[`dose${i}`]} />
              </Field>
            </div>
            <div className="field-row field-row-3">
              <Field label="Frequency" id={`rx-freq-${i}`}>
                <select id={`rx-freq-${i}`} value={it.frequency} onChange={(e) => patch(i, { frequency: e.target.value })}>
                  {Object.entries(FREQUENCIES).map(([k, f]) => (
                    <option key={k} value={k}>
                      {k} - {f.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Days" id={`rx-days-${i}`} error={errors[`days${i}`]}>
                <input id={`rx-days-${i}`} type="number" min="1" max="365" value={it.durationDays} onChange={(e) => patch(i, { durationDays: e.target.value })} />
              </Field>
              <Field label="Quantity" id={`rx-qty-${i}`} hint={`Suggested ${suggestQty(it.frequency, it.durationDays)}`}>
                <input id={`rx-qty-${i}`} type="number" min="1" value={it.qty} onChange={(e) => patch(i, { qty: e.target.value })} placeholder={String(suggestQty(it.frequency, it.durationDays))} />
              </Field>
            </div>
            <Field label="Instructions" id={`rx-ins-${i}`}>
              <input id={`rx-ins-${i}`} value={it.instructions} onChange={(e) => patch(i, { instructions: e.target.value })} placeholder="After food" />
            </Field>
            {items.length > 1 && (
              <button type="button" className="btn btn-ghost btn-sm danger" onClick={() => setItems((l) => l.filter((_, j) => j !== i))}>
                <Icon name="trash" size={14} /> Remove medicine
              </button>
            )}
          </fieldset>
        ))}
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setItems((l) => [...l, emptyItem()])}>
          <Icon name="plus" size={14} /> Add another medicine
        </button>
        <Field label="Notes for the pharmacist" id="rx-notes">
          <input id="rx-notes" maxLength="500" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <div className="form-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button id="rx-submit" type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Saving...' : 'Issue prescription'}</button>
        </div>
      </form>
    </Modal>
  );
}

// ------------------------------------------------------------------ payment
const METHODS = [['cash', 'Cash'], ['card', 'Card'], ['upi', 'UPI / wallet'], ['insurance', 'Insurance'], ['bank', 'Bank transfer']];
export function PaymentModal({ invoice, onClose, onDone }) {
  const toast = useToast();
  const [v, setV] = useState({ amount: String(invoice.balance), method: 'cash', reference: '' });
  const set = (k) => (e) => setV((x) => ({ ...x, [k]: e.target.value }));
  const { errors, serverError, busy, submit } = useFormSubmit({
    validate: () => {
      const a = Number(v.amount);
      if (!(a > 0)) return { amount: 'Enter an amount above zero.' };
      if (a > invoice.balance + 0.0001) return { amount: `The balance due is ${money(invoice.balance)}.` };
      return {};
    },
    save: () => api.post(`/invoices/${invoice._id}/payments`, { amount: Number(v.amount), method: v.method, reference: v.reference }),
    onDone: (inv) => {
      toast.success(inv.status === 'paid' ? 'Invoice paid in full.' : 'Payment recorded.');
      onDone?.(inv);
      onClose();
    },
  });
  return (
    <Modal title={`Take payment: ${invoice.invoiceNo}`} onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <ServerError message={serverError} />
        <p>
          Total {money(invoice.total)}, paid {money(invoice.paid)}, balance due <strong>{money(invoice.balance)}</strong>.
        </p>
        <div className="field-row">
          <Field label="Amount" id="pay-amt" error={errors.amount}>
            <input id="pay-amt" type="number" min="0.01" step="0.01" value={v.amount} onChange={set('amount')} autoFocus aria-invalid={!!errors.amount} />
          </Field>
          <Field label="Method" id="pay-method">
            <select id="pay-method" value={v.method} onChange={set('method')}>
              {METHODS.map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Reference (optional)" id="pay-ref">
          <input id="pay-ref" maxLength="60" value={v.reference} onChange={set('reference')} placeholder="Card slip or transaction no." />
        </Field>
        <FormActions busy={busy} onClose={onClose} label="Record payment" />
      </form>
    </Modal>
  );
}
