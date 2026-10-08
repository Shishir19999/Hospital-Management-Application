import { useMemo, useState } from 'react';
import { Modal } from './Modal';
import { Field } from './Common';
import { FormActions, ServerError } from './FormParts';
import { PatientPicker } from './Kit';
import Icon from './Icon';
import { api } from '../api';
import { useData } from '../context/DataContext';
import { useToast } from '../context/ToastContext';
import { useFormSubmit } from '../hooks/useFormSubmit';
import { computeTotals, lineAmount } from '../../../shared/domain.js';
import { SERVICES } from '../../../shared/catalog.js';
import { money } from '../lib/format';

const TYPES = [['consultation', 'Consultation'], ['procedure', 'Procedure'], ['lab', 'Lab'], ['pharmacy', 'Pharmacy'], ['bed', 'Bed'], ['other', 'Other']];
const blank = () => ({ type: 'procedure', description: '', qty: 1, unitPrice: '' });

export function InvoiceFormModal({ invoice, patientId, onClose, onSaved }) {
  const { patients } = useData();
  const toast = useToast();
  const [patient, setPatient] = useState(invoice?.patient?._id || patientId || '');
  const [lines, setLines] = useState(invoice ? invoice.lines.map((l) => ({ ...l })) : [blank()]);
  const [discType, setDiscType] = useState(invoice?.discount?.type || 'percent');
  const [discValue, setDiscValue] = useState(invoice?.discount?.value ?? '');
  const [taxRate, setTaxRate] = useState(invoice?.taxRate ?? 0);
  const [due, setDue] = useState(() => (invoice?.dueDate || new Date(Date.now() + 14 * 86400000).toISOString()).slice(0, 10));
  const [notes, setNotes] = useState(invoice?.notes || '');

  const num = (l) => ({ ...l, qty: Number(l.qty) || 0, unitPrice: Number(l.unitPrice) || 0 });
  const discount = useMemo(() => (Number(discValue) > 0 ? { type: discType, value: Number(discValue) } : null), [discType, discValue]);
  const totals = useMemo(() => computeTotals({ lines: lines.map(num), discount, taxRate: Number(taxRate) || 0 }), [lines, discount, taxRate]);
  const patch = (i, p) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...p } : l)));

  const { errors, serverError, busy, submit } = useFormSubmit({
    validate: () => {
      const e = {};
      if (!patient) e.patient = 'Choose a patient.';
      lines.forEach((l, i) => {
        if (!l.description.trim()) e[`d${i}`] = 'Describe the item.';
        if (!(Number(l.qty) > 0)) e[`q${i}`] = 'Quantity above zero.';
        if (l.unitPrice === '' || Number(l.unitPrice) < 0) e[`p${i}`] = 'Enter a price.';
      });
      return e;
    },
    save: () => {
      const body = { lines: lines.map((l) => ({ type: l.type, description: l.description.trim(), qty: Number(l.qty), unitPrice: Number(l.unitPrice) })), discount, taxRate: Number(taxRate) || 0, dueDate: new Date(`${due}T23:59:00`).toISOString(), notes };
      return invoice ? api.put(`/invoices/${invoice._id}`, body) : api.post('/invoices', { ...body, patient });
    },
    onDone: (inv) => {
      toast.success(invoice ? 'Invoice updated.' : `Invoice ${inv.invoiceNo} created.`);
      onSaved?.(inv);
      onClose();
    },
  });

  return (
    <Modal title={invoice ? `Edit ${invoice.invoiceNo}` : 'New invoice'} onClose={onClose} wide>
      <form onSubmit={submit} noValidate>
        <ServerError message={serverError} />
        {invoice ? <p>Patient: <strong>{invoice.patient?.name}</strong></p> : <PatientPicker patients={patients} value={patient} onChange={setPatient} error={errors.patient} id="in-patient" />}
        <datalist id="in-services">{SERVICES.map((s) => (<option key={s.name} value={s.name} />))}</datalist>
        {lines.map((l, i) => (
          <fieldset key={i} className="fieldset line-row">
            <legend>Item {i + 1}</legend>
            <div className="field-row field-row-lines">
              <Field label="Type" id={`in-t-${i}`}>
                <select id={`in-t-${i}`} value={l.type} onChange={(e) => patch(i, { type: e.target.value })}>{TYPES.map(([k, t]) => (<option key={k} value={k}>{t}</option>))}</select>
              </Field>
              <Field label="Description" id={`in-d-${i}`} error={errors[`d${i}`]}>
                <input id={`in-d-${i}`} list="in-services" value={l.description} onChange={(e) => {
                  const hit = SERVICES.find((s) => s.name === e.target.value);
                  patch(i, { description: e.target.value, ...(hit && !l.unitPrice ? { unitPrice: hit.price } : {}) });
                }} aria-invalid={!!errors[`d${i}`]} />
              </Field>
              <Field label="Qty" id={`in-q-${i}`} error={errors[`q${i}`]}><input id={`in-q-${i}`} type="number" min="0.01" step="any" value={l.qty} onChange={(e) => patch(i, { qty: e.target.value })} /></Field>
              <Field label="Unit price" id={`in-p-${i}`} error={errors[`p${i}`]}><input id={`in-p-${i}`} type="number" min="0" step="0.01" value={l.unitPrice} onChange={(e) => patch(i, { unitPrice: e.target.value })} /></Field>
              <div className="line-amount"><span className="muted">Amount</span><strong>{money(lineAmount(num(l)))}</strong></div>
            </div>
            {lines.length > 1 && <button type="button" className="btn btn-ghost btn-sm danger" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}><Icon name="trash" size={14} /> Remove item</button>}
          </fieldset>
        ))}
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setLines((ls) => [...ls, blank()])}><Icon name="plus" size={14} /> Add item</button>
        <div className="field-row field-row-3">
          <Field label="Discount" id="in-dv"><input id="in-dv" type="number" min="0" step="0.01" value={discValue} onChange={(e) => setDiscValue(e.target.value)} /></Field>
          <Field label="Discount type" id="in-dt"><select id="in-dt" value={discType} onChange={(e) => setDiscType(e.target.value)}><option value="percent">Percent</option><option value="amount">Amount</option></select></Field>
          <Field label="Tax rate (%)" id="in-tax"><input id="in-tax" type="number" min="0" max="100" step="0.1" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} /></Field>
        </div>
        <div className="field-row">
          <Field label="Due date" id="in-due"><input id="in-due" type="date" value={due} onChange={(e) => setDue(e.target.value)} /></Field>
          <Field label="Notes" id="in-notes"><input id="in-notes" maxLength="300" value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        </div>
        <dl className="totals" aria-label="Totals">
          <div><dt>Subtotal</dt><dd>{money(totals.subtotal)}</dd></div>
          {totals.discountAmount > 0 && <div><dt>Discount</dt><dd>-{money(totals.discountAmount)}</dd></div>}
          {totals.tax > 0 && <div><dt>Tax</dt><dd>{money(totals.tax)}</dd></div>}
          <div className="grand"><dt>Total</dt><dd>{money(totals.total)}</dd></div>
        </dl>
        <FormActions busy={busy} onClose={onClose} label={invoice ? 'Save invoice' : 'Create invoice'} />
      </form>
    </Modal>
  );
}
