import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useFetch } from '../hooks/useFetch';
import { can } from '../lib/permissions';
import { fmtDate, fmtDateTime } from '../lib/dates';
import { label, money } from '../lib/format';
import Icon from '../ui/Icon';
import { ErrorState, PageHeader, SkeletonList, Field } from '../ui/Common';
import { InvoiceFormModal } from '../ui/InvoiceForm';
import { PaymentModal } from '../ui/ClinicalForms';
import { Modal } from '../ui/Modal';
import { ServerError, FormActions } from '../ui/FormParts';
import { useFormSubmit } from '../hooks/useFormSubmit';
import { PrintButton, Section, Tag } from '../ui/Kit';

function VoidModal({ invoice, onClose, onDone }) {
  const toast = useToast();
  const [reason, setReason] = useState('');
  const { errors, serverError, busy, submit } = useFormSubmit({
    validate: () => (reason.trim() ? {} : { reason: 'Give a reason for voiding.' }),
    save: () => api.post(`/invoices/${invoice._id}/void`, { reason: reason.trim() }),
    onDone: () => {
      toast.success(`${invoice.invoiceNo} voided.`);
      onDone();
      onClose();
    },
  });
  return (
    <Modal title={`Void ${invoice.invoiceNo}?`} onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <ServerError message={serverError} />
        <p>A void invoice stays on record but can no longer be paid. Only unpaid invoices can be voided.</p>
        <Field label="Reason" id="vo-r" error={errors.reason}><input id="vo-r" value={reason} onChange={(e) => setReason(e.target.value)} autoFocus aria-invalid={!!errors.reason} /></Field>
        <FormActions busy={busy} onClose={onClose} label="Void invoice" />
      </form>
    </Modal>
  );
}

export default function InvoiceDetail() {
  const { id } = useParams();
  const { role } = useAuth();
  const { data: inv, loading, error, reload } = useFetch(`/invoices/${id}`);
  const [modal, setModal] = useState('');
  const [receipt, setReceipt] = useState(null);

  if (loading) return <SkeletonList rows={6} label="Loading invoice" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  const open = ['unpaid', 'partial'].includes(inv.status);
  const printReceipt = (p) => {
    setReceipt(p);
    setTimeout(() => window.print(), 60);
  };

  return (
    <div className={receipt ? 'printing-rx' : ''}>
      <div className="screen-only print-area">
        <Link to="/billing" className="back-link no-print"><Icon name="back" size={16} /> All invoices</Link>
        <PageHeader title={`Invoice ${inv.invoiceNo}`} subtitle={`${inv.patient?.name} (${inv.patient?.mrn || ''}) - issued ${fmtDate(inv.issuedAt)}, due ${fmtDate(inv.dueDate)}`}>
          <Tag value={inv.displayStatus} />
          <PrintButton label="Print invoice" className="btn btn-ghost" />
          {open && can(role, 'billing.pay') && <button type="button" className="btn btn-primary" onClick={() => setModal('pay')}>Take payment</button>}
          {can(role, 'billing.write') && inv.status !== 'void' && !inv.payments.length && <button type="button" className="btn btn-ghost" onClick={() => setModal('edit')}><Icon name="edit" /> Edit</button>}
          {can(role, 'billing.void') && inv.status === 'unpaid' && <button type="button" className="btn btn-ghost danger" onClick={() => setModal('void')}>Void</button>}
        </PageHeader>
        {inv.status === 'void' && <p className="warn-box" role="note">Voided by {inv.voidedBy}: {inv.voidReason}</p>}

        <Section title="Items" id="iv-items">
          <div className="table-scroll" tabIndex={0} role="region" aria-label="Invoice items">
            <table className="table">
              <thead><tr><th scope="col">Description</th><th scope="col">Type</th><th scope="col" className="num">Qty</th><th scope="col" className="num">Unit price</th><th scope="col" className="num">Amount</th></tr></thead>
              <tbody>
                {inv.lines.map((l, i) => (
                  <tr key={i}>
                    <td data-label="Description">{l.description}</td><td data-label="Type">{label(l.type)}</td><td data-label="Qty" className="num">{l.qty}</td>
                    <td data-label="Unit price" className="num">{money(l.unitPrice)}</td><td data-label="Amount" className="num">{money(l.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <dl className="totals" aria-label="Totals">
            <div><dt>Subtotal</dt><dd>{money(inv.subtotal)}</dd></div>
            {inv.discountAmount > 0 && <div><dt>Discount{inv.discount?.type === 'percent' ? ` (${inv.discount.value}%)` : ''}</dt><dd>-{money(inv.discountAmount)}</dd></div>}
            {inv.tax > 0 && <div><dt>Tax ({inv.taxRate}%)</dt><dd>{money(inv.tax)}</dd></div>}
            <div className="grand"><dt>Total</dt><dd>{money(inv.total)}</dd></div>
            <div><dt>Paid</dt><dd>{money(inv.paid)}</dd></div>
            <div className="grand"><dt>Balance due</dt><dd>{money(inv.balance)}</dd></div>
          </dl>
          {inv.notes && <p className="muted">Notes: {inv.notes}</p>}
        </Section>

        <Section title="Payments" id="iv-pay">
          {inv.payments.length === 0 ? <p className="muted">No payments yet.</p> : (
            <div className="table-scroll" tabIndex={0} role="region" aria-label="Payments">
              <table className="table">
                <thead><tr><th scope="col">Receipt</th><th scope="col">When</th><th scope="col">Method</th><th scope="col">Reference</th><th scope="col">Taken by</th><th scope="col" className="num">Amount</th><th scope="col" className="no-print">Print</th></tr></thead>
                <tbody>
                  {inv.payments.map((p) => (
                    <tr key={p.receiptNo}>
                      <td data-label="Receipt">{p.receiptNo}</td><td data-label="When">{fmtDateTime(p.at)}</td><td data-label="Method">{label(p.method)}</td><td data-label="Reference">{p.reference || '-'}</td><td data-label="Taken by">{p.by}</td>
                      <td data-label="Amount" className="num">{money(p.amount)}</td>
                      <td data-label="Print" className="no-print"><button type="button" className="btn btn-ghost btn-sm" onClick={() => printReceipt(p)}><Icon name="print" size={14} /> Receipt</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>
      </div>

      {receipt && (
        <div className="print-only rx-sheet">
          <h1>MediCare HMS - Payment receipt</h1>
          <p>{receipt.receiptNo} - {fmtDateTime(receipt.at)}</p>
          <p><strong>Received from:</strong> {inv.patient?.name} ({inv.patient?.mrn})</p>
          <p><strong>For invoice:</strong> {inv.invoiceNo} (total {money(inv.total)})</p>
          <p><strong>Amount:</strong> {money(receipt.amount)} by {label(receipt.method)}{receipt.reference ? `, ref ${receipt.reference}` : ''}</p>
          <p><strong>Balance after this payment:</strong> {money(inv.total - inv.payments.filter((p) => new Date(p.at) <= new Date(receipt.at)).reduce((s, p) => s + p.amount, 0))}</p>
          <p className="rx-sign">Received by {receipt.by}</p>
        </div>
      )}
      {modal === 'pay' && <PaymentModal invoice={inv} onClose={() => setModal('')} onDone={reload} />}
      {modal === 'edit' && <InvoiceFormModal invoice={inv} onClose={() => setModal('')} onSaved={reload} />}
      {modal === 'void' && <VoidModal invoice={inv} onClose={() => setModal('')} onDone={reload} />}
    </div>
  );
}
