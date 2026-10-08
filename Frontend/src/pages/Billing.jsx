import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useToast } from '../context/ToastContext';
import { errorMessage } from '../api/errors';
import { Section } from '../ui/Kit';
import { useAuth } from '../context/AuthContext';
import { useFetch } from '../hooks/useFetch';
import { can } from '../lib/permissions';
import { downloadCsv } from '../lib/csv';
import { INVOICE_CSV } from '../lib/exports';
import { fmtDate } from '../lib/dates';
import { money } from '../lib/format';
import Icon from '../ui/Icon';
import { ErrorState, EmptyState, PageHeader, SkeletonList } from '../ui/Common';
import { InvoiceFormModal } from '../ui/InvoiceForm';
import { PaymentModal } from '../ui/ClinicalForms';
import { ServerPager, Stat, Tabs, Tag } from '../ui/Kit';
import { useDebounced } from '../hooks/useDebounced';

export default function Billing() {
  const { role } = useAuth();
  const [tab, setTab] = useState('open');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [form, setForm] = useState(false);
  const [paying, setPaying] = useState(null);
  const navigate = useNavigate();
  const toast = useToast();
  const unbilled = useFetch('/billing/unbilled', {}, { enabled: can(role, 'billing.write') });
  const bill = async (kind, id) => {
    try {
      const inv = await api.post(kind === 'visit' ? '/invoices/from-visit/' + id : '/invoices/from-admission/' + id, {});
      toast.success('Invoice ' + inv.invoiceNo + ' created.');
      navigate('/billing/' + inv._id);
    } catch (err) {
      toast.error(errorMessage(err));
      unbilled.reload();
    }
  };
  const search = useDebounced(q.trim());
  const { data, loading, error, reload } = useFetch('/invoices', { status: tab === 'all' ? '' : tab, search, page, limit: 12 });
  const overdue = useFetch('/invoices', { status: 'overdue', limit: 1 });
  const open = useFetch('/invoices', { status: 'open', limit: 1 });
  const rows = data?.data || [];
  const refresh = () => { reload(); overdue.reload(); open.reload(); };

  return (
    <>
      <PageHeader title="Billing counter" subtitle="Invoices, payments and receipts">
        <button type="button" className="btn btn-ghost" disabled={!rows.length} onClick={() => downloadCsv('invoices.csv', INVOICE_CSV, rows)}><Icon name="download" /> Export CSV</button>
        {can(role, 'billing.write') && <button type="button" className="btn btn-primary" onClick={() => setForm(true)}><Icon name="plus" /> New invoice</button>}
      </PageHeader>
      <div className="stat-grid">
        <Stat label="Open invoices" value={open.data?.total ?? '...'} hint="unpaid or part paid" />
        <Stat label="Overdue" value={overdue.data?.total ?? '...'} tone={overdue.data?.total ? 'bad' : undefined} hint="past their due date" />
      </div>
      {unbilled.data && (unbilled.data.visits.length > 0 || unbilled.data.admissions.length > 0) && (
        <Section title="Ready to bill" id="bl-ready">
          <ul className="plain-list">
            {unbilled.data.visits.map((v) => (
              <li key={v._id}><strong>{v.visitNo}</strong> {v.patient?.name} <small className="muted">seen by {v.doctor?.name}, {fmtDate(v.completedAt)}</small> <button type="button" className="btn btn-primary btn-sm" onClick={() => bill('visit', v._id)}>Create invoice</button></li>
            ))}
            {unbilled.data.admissions.map((a) => (
              <li key={a._id}><strong>{a.admissionNo}</strong> {a.patient?.name} <small className="muted">discharged {fmtDate(a.dischargedAt)} from {a.ward?.name}</small> <button type="button" className="btn btn-primary btn-sm" onClick={() => bill('admission', a._id)}>Create bed invoice</button></li>
            ))}
          </ul>
        </Section>
      )}
      <Tabs label="Invoice lists" value={tab} onChange={(t) => { setTab(t); setPage(1); }} tabs={[{ value: 'open', label: 'Open' }, { value: 'overdue', label: 'Overdue' }, { value: 'paid', label: 'Paid' }, { value: 'void', label: 'Void' }, { value: 'all', label: 'All' }]} />
      <div className="toolbar">
        <div className="field"><label htmlFor="bl-q">Search</label><input id="bl-q" type="search" placeholder="Patient, record number or invoice number" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} /></div>
      </div>
      {loading && <SkeletonList label="Loading invoices" />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {data && rows.length === 0 && <EmptyState title="No invoices here" text="Invoices are created from a completed visit, an admission or manually." />}
      {rows.length > 0 && (
        <div className="card table-card">
          <div className="table-scroll" tabIndex={0} role="region" aria-label="Invoices">
            <table className="table">
              <caption className="sr-only">Invoices</caption>
              <thead><tr><th scope="col">Invoice</th><th scope="col">Patient</th><th scope="col">Issued</th><th scope="col">Due</th><th scope="col" className="num">Total</th><th scope="col" className="num">Balance</th><th scope="col">Status</th><th scope="col">Actions</th></tr></thead>
              <tbody>
                {rows.map((i) => (
                  <tr key={i._id}>
                    <td data-label="Invoice"><Link to={`/billing/${i._id}`}>{i.invoiceNo}</Link></td>
                    <td data-label="Patient">{i.patient?.name}</td>
                    <td data-label="Issued">{fmtDate(i.issuedAt)}</td>
                    <td data-label="Due">{fmtDate(i.dueDate)}</td>
                    <td data-label="Total" className="num">{money(i.total)}</td>
                    <td data-label="Balance" className="num">{money(i.balance)}</td>
                    <td data-label="Status"><Tag value={i.displayStatus} /></td>
                    <td data-label="Actions" className="actions">
                      <div className="row-actions">
                        <Link className="btn btn-ghost btn-sm" to={`/billing/${i._id}`}>Open</Link>
                        {can(role, 'billing.pay') && ['unpaid', 'partial'].includes(i.status) && <button type="button" className="btn btn-primary btn-sm" onClick={() => setPaying(i)}>Take payment</button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ServerPager page={data.page} pages={data.pages} total={data.total} onPage={setPage} label="invoices" />
        </div>
      )}
      {form && <InvoiceFormModal onClose={() => setForm(false)} onSaved={refresh} />}
      {paying && <PaymentModal invoice={paying} onClose={() => setPaying(null)} onDone={refresh} />}
    </>
  );
}
