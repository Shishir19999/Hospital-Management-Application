import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useFetch } from '../hooks/useFetch';
import { useFormSubmit } from '../hooks/useFormSubmit';
import { can } from '../lib/permissions';
import { fmtDate, fmtDateTime, toLocalInput } from '../lib/dates';
import { money } from '../lib/format';
import { errorMessage } from '../api/errors';
import { DIAGNOSES } from '../../../shared/catalog.js';
import { FREQUENCIES } from '../../../shared/domain.js';
import Icon from '../ui/Icon';
import { ConfirmDialog } from '../ui/Modal';
import { Field, ErrorState, PageHeader, SkeletonList } from '../ui/Common';
import { ServerError } from '../ui/FormParts';
import { Dl, Section, Tag } from '../ui/Kit';
import { LabOrderModal, PrescribeModal, VitalsModal } from '../ui/ClinicalForms';

const VITAL_ROWS = [
  ['bp', 'Blood pressure', (v) => (v.systolic != null ? `${v.systolic}/${v.diastolic} mmHg` : null)],
  ['pulse', 'Pulse', (v) => (v.pulse != null ? `${v.pulse} bpm` : null)],
  ['tempC', 'Temperature', (v) => (v.tempC != null ? `${v.tempC} C` : null)],
  ['spo2', 'Oxygen saturation', (v) => (v.spo2 != null ? `${v.spo2} %` : null)],
  ['respRate', 'Respiratory rate', (v) => (v.respRate != null ? `${v.respRate} /min` : null)],
];

function PrescriptionSheet({ rx, visit }) {
  return (
    <div className="print-only rx-sheet">
      <h1>MediCare HMS - Prescription</h1>
      <p>
        {rx.rxNo} - {fmtDate(rx.issuedAt)}
      </p>
      <p>
        <strong>Patient:</strong> {visit.patient.name} ({visit.patient.mrn}), {visit.patient.age} y, {visit.patient.gender}
        {visit.patient.allergies?.length ? <><br /><strong>Allergies:</strong> {visit.patient.allergies.join(', ')}</> : null}
      </p>
      <ol>
        {rx.items.map((i, k) => (
          <li key={k}>
            <strong>{i.drug}</strong> - {i.dose}, {FREQUENCIES[i.frequency]?.label || i.frequency}, for {i.durationDays} days (qty {i.qty}). {i.instructions}
          </li>
        ))}
      </ol>
      {rx.notes && <p>Note: {rx.notes}</p>}
      <p className="rx-sign">Prescribed by {visit.doctor?.name || '________'}</p>
    </div>
  );
}

function ConsultPanel({ visit, canConsult, reload }) {
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);
  const [dx, setDx] = useState('');
  const [form, setForm] = useState(() => ({
    notes: visit.notes || '',
    plan: visit.plan || '',
    diagnoses: visit.diagnoses || [],
    followUpDate: visit.followUpDate ? toLocalInput(visit.followUpDate).slice(0, 10) : '',
    chiefComplaint: visit.chiefComplaint || '',
  }));
  const body = () => ({
    notes: form.notes, plan: form.plan, diagnoses: form.diagnoses, chiefComplaint: form.chiefComplaint,
    followUpDate: form.followUpDate ? new Date(`${form.followUpDate}T09:00`).toISOString() : null,
  });
  const save = useFormSubmit({
    save: () => api.patch(`/visits/${visit._id}/consult`, body()),
    onDone: () => {
      toast.success('Consultation notes saved.');
      reload();
    },
  });
  const addDx = () => {
    const text = dx.trim();
    if (!text) return;
    const hit = DIAGNOSES.find((d) => `${d.code} ${d.name}`.toLowerCase() === text.toLowerCase() || d.name.toLowerCase() === text.toLowerCase());
    const entry = hit ? { code: hit.code, name: hit.name } : { code: '', name: text };
    if (!form.diagnoses.some((d) => d.name === entry.name)) setForm((f) => ({ ...f, diagnoses: [...f.diagnoses, entry] }));
    setDx('');
  };
  const complete = async () => {
    try {
      await api.patch(`/visits/${visit._id}/consult`, body());
      await api.post(`/visits/${visit._id}/complete`, {});
      toast.success('Visit completed.');
      setConfirm(false);
      reload();
    } catch (err) {
      toast.error(errorMessage(err));
      setConfirm(false);
    }
  };
  return (
    <Section title="Consultation" id="vd-consult" actions={canConsult && (
      <button type="button" className="btn btn-primary btn-sm" onClick={() => setConfirm(true)}><Icon name="check" size={14} /> Complete visit</button>
    )}>
      {canConsult ? (
        <form onSubmit={save.submit} noValidate>
          <ServerError message={save.serverError} />
          <Field label="Chief complaint" id="vc-cc"><input id="vc-cc" maxLength="300" value={form.chiefComplaint} onChange={(e) => setForm({ ...form, chiefComplaint: e.target.value })} /></Field>
          <Field label="Examination and notes" id="vc-notes"><textarea id="vc-notes" rows="4" maxLength="4000" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
          <div className="field">
            <label htmlFor="vc-dx">Diagnoses</label>
            <div className="inline-add">
              <input id="vc-dx" list="dx-list" value={dx} onChange={(e) => setDx(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addDx(); } }} placeholder="Search or type a diagnosis" autoComplete="off" />
              <button type="button" className="btn btn-ghost" onClick={addDx}>Add</button>
            </div>
            <datalist id="dx-list">{DIAGNOSES.map((d) => (<option key={d.code} value={d.name}>{d.code}</option>))}</datalist>
            <ul className="chip-list" aria-label="Chosen diagnoses">
              {form.diagnoses.map((d) => (
                <li key={d.name}>
                  <span className="chip">{d.code && <code>{d.code}</code>} {d.name}
                    <button type="button" className="chip-x" aria-label={`Remove ${d.name}`} onClick={() => setForm({ ...form, diagnoses: form.diagnoses.filter((x) => x.name !== d.name) })}><Icon name="x" size={12} /></button>
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <Field label="Plan and advice" id="vc-plan"><textarea id="vc-plan" rows="2" maxLength="1000" value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value })} /></Field>
          <Field label="Follow-up on" id="vc-fu"><input id="vc-fu" type="date" value={form.followUpDate} onChange={(e) => setForm({ ...form, followUpDate: e.target.value })} /></Field>
          <div className="form-actions"><button type="submit" className="btn btn-primary" disabled={save.busy}>{save.busy ? 'Saving...' : 'Save notes'}</button></div>
        </form>
      ) : (
        <Dl items={[
          ['Notes', visit.notes],
          ['Diagnoses', visit.diagnoses?.length ? visit.diagnoses.map((d) => d.name).join(', ') : null],
          ['Plan', visit.plan],
          ['Follow-up', visit.followUpDate ? fmtDate(visit.followUpDate) : null],
          visit.completedAt && ['Completed', fmtDateTime(visit.completedAt)],
        ]} />
      )}
      {confirm && (
        <ConfirmDialog
          title="Complete this visit?"
          message={form.diagnoses.length ? 'The visit will be closed and the patient marked as seen. Notes and diagnoses are saved first.' : 'Add at least one diagnosis before completing the visit.'}
          confirmLabel="Complete visit"
          onConfirm={complete}
          onCancel={() => setConfirm(false)}
        />
      )}
    </Section>
  );
}

export default function VisitDetail() {
  const { id } = useParams();
  const { role } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const { data: visit, loading, error, reload } = useFetch(`/visits/${id}`);
  const [modal, setModal] = useState('');
  const [printing, setPrinting] = useState(null);

  const open = visit && (visit.status === 'triage' || visit.status === 'in_consult');
  const canConsult = open && can(role, 'visits.consult');

  if (loading) return <SkeletonList rows={6} label="Loading visit" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  const cancelRx = async (rx) => {
    try {
      await api.post(`/prescriptions/${rx._id}/cancel`, {});
      toast.success(`${rx.rxNo} cancelled.`);
      reload();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };
  const review = async (o) => {
    try {
      await api.post(`/labs/orders/${o._id}/review`, {});
      toast.success('Result marked as reviewed.');
      reload();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };
  const makeInvoice = async () => {
    try {
      const inv = await api.post(`/invoices/from-visit/${id}`, {});
      toast.success(`Invoice ${inv.invoiceNo} created.`);
      navigate(`/billing/${inv._id}`);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };
  const printRx = (rx) => {
    setPrinting(rx);
    setTimeout(() => window.print(), 60);
  };

  const patient = visit.patient;
  const vit = visit.vitals || {};

  return (
    <div className={printing ? 'printing-rx' : ''}>
      <div className="screen-only">
        <Link to="/visits" className="back-link"><Icon name="back" size={16} /> All visits</Link>
        <PageHeader title={`${visit.visitNo}: ${patient.name}`} subtitle={`${patient.mrn} - ${patient.age} years, ${patient.gender} - started ${fmtDateTime(visit.startedAt)}`}>
          <Tag value={visit.status} />
        </PageHeader>
        {patient.allergies?.length > 0 && (
          <p className="warn-box" role="note"><Icon name="warn" /> Allergies: <strong>{patient.allergies.join(', ')}</strong></p>
        )}

        <div className="detail-grid">
          <Section
            title="Triage and vitals"
            id="vd-triage"
            actions={open && can(role, 'visits.vitals') && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setModal('vitals')}><Icon name="edit" size={14} /> {Object.keys(vit).length ? 'Update vitals' : 'Record vitals'}</button>
            )}
          >
            <Dl items={[
              ['Chief complaint', visit.chiefComplaint],
              ['Doctor', visit.doctor?.name],
              ['Priority', <Tag key="p" value={visit.triagePriority} />],
              ...VITAL_ROWS.map(([k, l, f]) => [l, f(vit) ? <span key={k}>{f(vit)} {visit.flags?.[k] && visit.flags[k] !== 'normal' ? <Tag value={visit.flags[k]} /> : null}</span> : null]),
              ['BMI', vit.bmi ? `${vit.bmi} (${visit.bmiCategory})` : null],
              ['Weight and height', vit.weightKg ? `${vit.weightKg} kg, ${vit.heightCm || '-'} cm` : null],
              visit.triageBy && ['Recorded by', `${visit.triageBy}${visit.triageAt ? `, ${fmtDateTime(visit.triageAt)}` : ''}`],
            ]} />
            {visit.triageNotes && <p className="tl-note">{visit.triageNotes}</p>}
          </Section>

          <ConsultPanel visit={visit} canConsult={canConsult} reload={reload} />
        </div>

        {visit.prescriptions && (
          <Section
            title="Prescriptions"
            id="vd-rx"
            actions={open && can(role, 'prescriptions.write') && (
              <button type="button" className="btn btn-primary btn-sm" onClick={() => setModal('rx')}><Icon name="plus" size={14} /> Write prescription</button>
            )}
          >
            {visit.prescriptions.length === 0 ? <p className="muted">No prescriptions for this visit.</p> : (
              <ul className="plain-list rx-list">
                {visit.prescriptions.map((r) => (
                  <li key={r._id}>
                    <div className="tl-head">
                      <strong>{r.rxNo}</strong>
                      <span><Tag value={r.status} /> <button type="button" className="btn btn-ghost btn-sm" onClick={() => printRx(r)}><Icon name="print" size={14} /> Print</button>
                        {can(role, 'prescriptions.write') && r.status === 'issued' && <button type="button" className="btn btn-ghost btn-sm danger" onClick={() => cancelRx(r)}>Cancel</button>}</span>
                    </div>
                    <ul>
                      {r.items.map((i, k) => (<li key={k}>{i.drug} - {i.dose}, {i.frequency} x {i.durationDays} days, qty {i.qty}{i.dispensedQty ? ` (dispensed ${i.dispensedQty})` : ''}{i.instructions ? ` - ${i.instructions}` : ''}</li>))}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        )}

        {visit.labs && (
          <Section
            title="Lab tests"
            id="vd-labs"
            actions={open && can(role, 'labs.order') && (
              <button type="button" className="btn btn-primary btn-sm" onClick={() => setModal('labs')}><Icon name="plus" size={14} /> Order tests</button>
            )}
          >
            {visit.labs.length === 0 ? <p className="muted">No tests ordered.</p> : (
              <div className="table-scroll" tabIndex={0} role="region" aria-label="Lab tests">
                <table className="table">
                  <thead><tr><th scope="col">Test</th><th scope="col">Status</th><th scope="col">Result</th><th scope="col">Reference</th><th scope="col">Flag</th><th scope="col">Actions</th></tr></thead>
                  <tbody>
                    {visit.labs.map((o) => (
                      <tr key={o._id}>
                        <td data-label="Test">{o.testName} {o.priority === 'urgent' && <Tag value="urgent" />}</td>
                        <td data-label="Status"><Tag value={o.status} /></td>
                        <td data-label="Result">{o.status === 'resulted' ? `${o.value} ${o.unit}` : '-'}</td>
                        <td data-label="Reference">{o.range?.low ?? '-'} to {o.range?.high ?? '-'}</td>
                        <td data-label="Flag">{o.status === 'resulted' ? <Tag value={o.flag} /> : '-'}</td>
                        <td data-label="Actions">
                          {o.status === 'resulted' && !o.reviewed && can(role, 'labs.review') && <button type="button" className="btn btn-ghost btn-sm" onClick={() => review(o)}>Mark reviewed</button>}
                          {o.reviewed && <span className="muted">Reviewed</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
        )}

        {visit.invoices && (
          <Section title="Billing" id="vd-bill">
            {visit.invoices.length > 0 ? (
              <ul className="plain-list">
                {visit.invoices.map((i) => (<li key={i._id}><Link to={`/billing/${i._id}`}>{i.invoiceNo}</Link> - {money(i.total)} <Tag value={i.status} /></li>))}
              </ul>
            ) : (
              <p className="muted">No invoice yet.</p>
            )}
            {visit.invoices.length === 0 && can(role, 'billing.write') && (
              <button type="button" className="btn btn-primary btn-sm" onClick={makeInvoice}>Create invoice from this visit</button>
            )}
          </Section>
        )}
      </div>

      {printing && <PrescriptionSheet rx={printing} visit={visit} />}
      {modal === 'vitals' && <VitalsModal visit={visit} patient={patient} onClose={() => setModal('')} onDone={reload} />}
      {modal === 'rx' && <PrescribeModal visit={visit} onClose={() => setModal('')} onDone={reload} />}
      {modal === 'labs' && <LabOrderModal visit={visit} patient={patient} onClose={() => setModal('')} onDone={reload} />}
    </div>
  );
}
