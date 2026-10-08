import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useFetch } from '../hooks/useFetch';
import { useFormSubmit } from '../hooks/useFormSubmit';
import { can } from '../lib/permissions';
import { fmtDateTime } from '../lib/dates';
import { ErrorState, EmptyState, PageHeader, SkeletonList } from '../ui/Common';
import { FormActions, ServerError } from '../ui/FormParts';
import { Modal } from '../ui/Modal';
import { ServerPager, Tabs, Tag } from '../ui/Kit';
import { useDebounced } from '../hooks/useDebounced';

function DispenseModal({ rxId, onClose, onDone }) {
  const toast = useToast();
  const { data: rx, loading, error } = useFetch(`/prescriptions/${rxId}`);
  const { data: inv } = useFetch('/inventory', { limit: 100 });
  const [qty, setQty] = useState({});
  const [pick, setPick] = useState({});
  const { serverError, busy, submit } = useFormSubmit({
    save: () => {
      const items = rx.items
        .map((it, index) => ({ index, qty: Number(qty[index] ?? it.qty - it.dispensedQty), inventoryItem: pick[index] || undefined }))
        .filter((x) => x.qty > 0 && rx.items[x.index].qty - rx.items[x.index].dispensedQty > 0);
      return api.post(`/prescriptions/${rxId}/dispense`, { items });
    },
    onDone: (r) => {
      toast.success(r.status === 'dispensed' ? `${r.rxNo} fully dispensed.` : `${r.rxNo} partly dispensed.`);
      onDone?.(r);
      onClose();
    },
  });
  return (
    <Modal title={rx ? `Dispense ${rx.rxNo}` : 'Dispense'} onClose={onClose} wide>
      {loading && <p className="muted">Loading...</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
      {rx && (
        <form onSubmit={submit} noValidate>
          <ServerError message={serverError} />
          <p>
            <strong>{rx.patient?.name}</strong> ({rx.patient?.mrn}), prescribed by {rx.doctor?.name}.
          </p>
          {rx.patient?.allergies?.length > 0 && <p className="warn-box" role="note">Allergies: <strong>{rx.patient.allergies.join(', ')}</strong></p>}
          {rx.notes && <p className="info-box">Note from the doctor: {rx.notes}</p>}
          <div className="table-scroll" tabIndex={0} role="region" aria-label="Items to dispense">
            <table className="table">
              <thead><tr><th scope="col">Medicine</th><th scope="col">Directions</th><th scope="col" className="num">Remaining</th><th scope="col" className="num">In stock</th><th scope="col">Dispense</th></tr></thead>
              <tbody>
                {rx.items.map((it, i) => {
                  const remaining = it.qty - it.dispensedQty;
                  return (
                    <tr key={i}>
                      <td data-label="Medicine">
                        {it.drug}
                        {!it.inventoryItem && (
                          <select aria-label={`Stock item for ${it.drug}`} value={pick[i] || ''} onChange={(e) => setPick({ ...pick, [i]: e.target.value })}>
                            <option value="">Choose stock item...</option>
                            {(inv?.data || []).map((s) => (<option key={s._id} value={s._id}>{s.name} ({s.stock})</option>))}
                          </select>
                        )}
                      </td>
                      <td data-label="Directions">{it.dose}, {it.frequency} x {it.durationDays} d{it.instructions ? `, ${it.instructions}` : ''}</td>
                      <td data-label="Remaining" className="num">{remaining}</td>
                      <td data-label="In stock" className="num">{it.inventoryItem ? <Tag tone={it.stock >= remaining ? 'ok' : it.stock > 0 ? 'warn' : 'bad'}>{it.stock}</Tag> : '-'}</td>
                      <td data-label="Dispense">
                        <input aria-label={`Quantity of ${it.drug} to dispense`} type="number" min="0" max={remaining} value={qty[i] ?? remaining} disabled={remaining <= 0} onChange={(e) => setQty({ ...qty, [i]: e.target.value })} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <FormActions busy={busy} onClose={onClose} label="Dispense" />
        </form>
      )}
    </Modal>
  );
}

export default function Pharmacy() {
  const { role } = useAuth();
  const [tab, setTab] = useState('pending');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [dispensing, setDispensing] = useState(null);
  const search = useDebounced(q.trim());
  const { data, loading, error, reload } = useFetch('/prescriptions', { status: tab === 'pending' ? 'pending' : tab === 'done' ? 'dispensed' : '', search, page, limit: 10 }, { interval: 20000 });
  const rows = data?.data || [];
  return (
    <>
      <PageHeader title="Dispensing" subtitle="Prescriptions waiting at the pharmacy counter">
        <Link className="btn btn-ghost" to="/pharmacy/stock">Manage stock</Link>
      </PageHeader>
      <Tabs label="Prescription lists" value={tab} onChange={(t) => { setTab(t); setPage(1); }} tabs={[{ value: 'pending', label: 'To dispense' }, { value: 'done', label: 'Dispensed' }, { value: 'all', label: 'All' }]} />
      <div className="toolbar">
        <div className="field">
          <label htmlFor="rx-q">Search</label>
          <input id="rx-q" type="search" placeholder="Patient, record number or prescription number" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
        </div>
      </div>
      {loading && <SkeletonList label="Loading prescriptions" />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {data && rows.length === 0 && <EmptyState title={tab === 'pending' ? 'Nothing waiting' : 'No prescriptions found'} text={tab === 'pending' ? 'New prescriptions from doctors appear here.' : 'Try a different search.'} />}
      {rows.length > 0 && (
        <div className="card table-card">
          <div className="table-scroll" tabIndex={0} role="region" aria-label="Prescriptions">
            <table className="table">
              <caption className="sr-only">Prescriptions</caption>
              <thead><tr><th scope="col">Prescription</th><th scope="col">Issued</th><th scope="col">Patient</th><th scope="col">Doctor</th><th scope="col">Medicines</th><th scope="col">Status</th><th scope="col">Actions</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r._id}>
                    <td data-label="Prescription"><strong>{r.rxNo}</strong></td>
                    <td data-label="Issued">{fmtDateTime(r.issuedAt)}</td>
                    <td data-label="Patient">{r.patient?.name}</td>
                    <td data-label="Doctor">{r.doctor?.name}</td>
                    <td data-label="Medicines">{r.items.map((i) => i.drug).join(', ')}</td>
                    <td data-label="Status"><Tag value={r.status} /></td>
                    <td data-label="Actions" className="actions">
                      {can(role, 'pharmacy.dispense') && ['issued', 'partial'].includes(r.status) && (
                        <button type="button" className="btn btn-primary btn-sm" onClick={() => setDispensing(r._id)}>Dispense</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ServerPager page={data.page} pages={data.pages} total={data.total} onPage={setPage} label="prescriptions" />
        </div>
      )}
      {dispensing && <DispenseModal rxId={dispensing} onClose={() => setDispensing(null)} onDone={reload} />}
    </>
  );
}
