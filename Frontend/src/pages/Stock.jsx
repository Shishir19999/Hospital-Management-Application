import { useState } from 'react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useFetch } from '../hooks/useFetch';
import { useFormSubmit } from '../hooks/useFormSubmit';
import { can } from '../lib/permissions';
import { downloadCsv } from '../lib/csv';
import { fmtDate, fmtDateTime } from '../lib/dates';
import { money } from '../lib/format';
import Icon from '../ui/Icon';
import { Field, ErrorState, EmptyState, PageHeader, SkeletonList } from '../ui/Common';
import { FormActions, ServerError } from '../ui/FormParts';
import { Modal } from '../ui/Modal';
import { ServerPager, Tag } from '../ui/Kit';
import { useDebounced } from '../hooks/useDebounced';

const future = (days) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);

function ItemModal({ onClose, onDone }) {
  const toast = useToast();
  const [v, setV] = useState({ name: '', genericName: '', category: '', unit: 'tablet', price: '', reorderLevel: '20', lot: '', qty: '', expiry: future(365) });
  const set = (k) => (e) => setV((x) => ({ ...x, [k]: e.target.value }));
  const { errors, serverError, busy, submit } = useFormSubmit({
    validate: () => {
      const e = {};
      if (!v.name.trim()) e.name = 'Enter the item name.';
      if (!(Number(v.price) >= 0) || v.price === '') e.price = 'Enter a price.';
      if (v.qty && !v.lot.trim()) e.lot = 'Opening stock needs a lot number.';
      return e;
    },
    save: () => {
      const body = { name: v.name.trim(), genericName: v.genericName, category: v.category, unit: v.unit, price: Number(v.price), reorderLevel: Number(v.reorderLevel) };
      if (v.qty) Object.assign(body, { lot: v.lot.trim(), qty: Number(v.qty), expiry: new Date(`${v.expiry}T00:00:00Z`).toISOString() });
      return api.post('/inventory', body);
    },
    onDone: () => {
      toast.success('Stock item added.');
      onDone();
      onClose();
    },
  });
  return (
    <Modal title="Add stock item" onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <ServerError message={serverError} />
        <Field label="Name and strength" id="si-name" error={errors.name}><input id="si-name" value={v.name} onChange={set('name')} autoFocus aria-invalid={!!errors.name} /></Field>
        <div className="field-row">
          <Field label="Generic name" id="si-gen"><input id="si-gen" value={v.genericName} onChange={set('genericName')} /></Field>
          <Field label="Category" id="si-cat"><input id="si-cat" value={v.category} onChange={set('category')} /></Field>
        </div>
        <div className="field-row">
          <Field label="Unit" id="si-unit"><input id="si-unit" value={v.unit} onChange={set('unit')} /></Field>
          <Field label="Price per unit" id="si-price" error={errors.price}><input id="si-price" type="number" min="0" step="0.01" value={v.price} onChange={set('price')} aria-invalid={!!errors.price} /></Field>
        </div>
        <Field label="Reorder level" id="si-re" hint="Flagged as low at or below this quantity"><input id="si-re" type="number" min="0" value={v.reorderLevel} onChange={set('reorderLevel')} /></Field>
        <fieldset className="fieldset">
          <legend>Opening stock (optional)</legend>
          <div className="field-row field-row-3">
            <Field label="Lot number" id="si-lot" error={errors.lot}><input id="si-lot" value={v.lot} onChange={set('lot')} aria-invalid={!!errors.lot} /></Field>
            <Field label="Quantity" id="si-qty"><input id="si-qty" type="number" min="1" value={v.qty} onChange={set('qty')} /></Field>
            <Field label="Expiry" id="si-exp"><input id="si-exp" type="date" value={v.expiry} onChange={set('expiry')} /></Field>
          </div>
        </fieldset>
        <FormActions busy={busy} onClose={onClose} label="Add item" />
      </form>
    </Modal>
  );
}

function ReceiveModal({ item, onClose, onDone }) {
  const toast = useToast();
  const [v, setV] = useState({ lot: '', qty: '', expiry: future(365) });
  const set = (k) => (e) => setV((x) => ({ ...x, [k]: e.target.value }));
  const { errors, serverError, busy, submit } = useFormSubmit({
    validate: () => {
      const e = {};
      if (!v.lot.trim()) e.lot = 'Enter the lot number.';
      if (!(Number(v.qty) > 0)) e.qty = 'Enter a quantity.';
      if (!v.expiry) e.expiry = 'Choose an expiry date.';
      return e;
    },
    save: () => api.post(`/inventory/${item._id}/receive`, { lot: v.lot.trim(), qty: Number(v.qty), expiry: new Date(`${v.expiry}T00:00:00Z`).toISOString() }),
    onDone: () => {
      toast.success(`${v.qty} units of ${item.name} received.`);
      onDone();
      onClose();
    },
  });
  return (
    <Modal title={`Receive stock: ${item.name}`} onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <ServerError message={serverError} />
        <div className="field-row field-row-3">
          <Field label="Lot number" id="rc-lot" error={errors.lot}><input id="rc-lot" value={v.lot} onChange={set('lot')} autoFocus aria-invalid={!!errors.lot} /></Field>
          <Field label="Quantity" id="rc-qty" error={errors.qty}><input id="rc-qty" type="number" min="1" value={v.qty} onChange={set('qty')} aria-invalid={!!errors.qty} /></Field>
          <Field label="Expiry" id="rc-exp" error={errors.expiry}><input id="rc-exp" type="date" value={v.expiry} onChange={set('expiry')} aria-invalid={!!errors.expiry} /></Field>
        </div>
        <FormActions busy={busy} onClose={onClose} label="Receive" />
      </form>
    </Modal>
  );
}

function AdjustModal({ item, onClose, onDone }) {
  const toast = useToast();
  const [v, setV] = useState({ lot: item.batches[0]?.lot || '', delta: '', reason: '' });
  const set = (k) => (e) => setV((x) => ({ ...x, [k]: e.target.value }));
  const { errors, serverError, busy, submit } = useFormSubmit({
    validate: () => {
      const e = {};
      if (!v.lot) e.lot = 'Choose a lot.';
      if (!Number(v.delta)) e.delta = 'Enter a change such as -5 or 10.';
      if (!v.reason.trim()) e.reason = 'Give a reason.';
      return e;
    },
    save: () => api.post(`/inventory/${item._id}/adjust`, { lot: v.lot, delta: Number(v.delta), reason: v.reason.trim() }),
    onDone: () => {
      toast.success('Stock adjusted.');
      onDone();
      onClose();
    },
  });
  return (
    <Modal title={`Adjust stock: ${item.name}`} onClose={onClose}>
      {item.batches.length === 0 ? <p className="muted">There are no lots to adjust. Receive stock first.</p> : (
        <form onSubmit={submit} noValidate>
          <ServerError message={serverError} />
          <Field label="Lot" id="ad-lot" error={errors.lot}>
            <select id="ad-lot" value={v.lot} onChange={set('lot')}>
              {item.batches.map((b) => (<option key={b.lot} value={b.lot}>{b.lot} ({b.qty} units, expires {fmtDate(b.expiry)})</option>))}
            </select>
          </Field>
          <div className="field-row">
            <Field label="Change (+ or -)" id="ad-delta" error={errors.delta}><input id="ad-delta" type="number" value={v.delta} onChange={set('delta')} aria-invalid={!!errors.delta} /></Field>
            <Field label="Reason" id="ad-reason" error={errors.reason}><input id="ad-reason" value={v.reason} onChange={set('reason')} placeholder="Damaged, count correction..." aria-invalid={!!errors.reason} /></Field>
          </div>
          <FormActions busy={busy} onClose={onClose} label="Save adjustment" />
        </form>
      )}
    </Modal>
  );
}

function HistoryModal({ item, onClose }) {
  const { data, loading } = useFetch(`/inventory/${item._id}/movements`);
  return (
    <Modal title={`Stock history: ${item.name}`} onClose={onClose} wide>
      {loading && <p className="muted">Loading...</p>}
      {data && data.length === 0 && <p className="muted">No movements recorded.</p>}
      {data && data.length > 0 && (
        <div className="table-scroll" tabIndex={0} role="region" aria-label="Stock movements">
          <table className="table">
            <thead><tr><th scope="col">When</th><th scope="col">Type</th><th scope="col" className="num">Qty</th><th scope="col">Lot</th><th scope="col">Reason</th><th scope="col">By</th></tr></thead>
            <tbody>
              {data.map((m) => (
                <tr key={m._id}>
                  <td data-label="When">{fmtDateTime(m.at)}</td><td data-label="Type">{m.type}</td><td data-label="Qty" className="num">{m.qty > 0 ? `+${m.qty}` : m.qty}</td>
                  <td data-label="Lot">{m.lot}</td><td data-label="Reason">{m.reason}</td><td data-label="By">{m.by}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}

export default function Stock() {
  const { role } = useAuth();
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState(null); // { kind, item }
  const search = useDebounced(q.trim());
  const { data, loading, error, reload } = useFetch('/inventory', { status, search, page, limit: 12 });
  const rows = data?.data || [];
  const manage = can(role, 'inventory.manage');
  return (
    <>
      <PageHeader title="Stock" subtitle="Medicines, quantities and expiry dates">
        <button type="button" className="btn btn-ghost" disabled={!rows.length} onClick={() => downloadCsv('stock.csv', [
          { label: 'Item', value: (i) => i.name }, { label: 'Category', value: (i) => i.category }, { label: 'In stock', value: (i) => i.stock },
          { label: 'Reorder level', value: (i) => i.reorderLevel }, { label: 'Next expiry', value: (i) => (i.nextExpiry ? i.nextExpiry.slice(0, 10) : '') }, { label: 'Price', value: (i) => i.price },
        ], rows)}>
          <Icon name="download" /> Export CSV
        </button>
        {manage && <button type="button" className="btn btn-primary" onClick={() => setModal({ kind: 'new' })}><Icon name="plus" /> Add item</button>}
      </PageHeader>
      <div className="toolbar">
        <div className="field"><label htmlFor="st-q">Search</label><input id="st-q" type="search" placeholder="Name, generic name or category" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} /></div>
        <div className="field">
          <label htmlFor="st-f">Show</label>
          <select id="st-f" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            <option value="">Everything</option><option value="low">Low or out of stock</option><option value="out">Out of stock</option><option value="expiring">Expiring or expired</option><option value="ok">Healthy</option>
          </select>
        </div>
      </div>
      {loading && <SkeletonList label="Loading stock" />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {data && rows.length === 0 && <EmptyState title="No stock items match" text="Change the filter or add a new item." />}
      {rows.length > 0 && (
        <div className="card table-card">
          <div className="table-scroll" tabIndex={0} role="region" aria-label="Stock">
            <table className="table">
              <caption className="sr-only">Stock</caption>
              <thead><tr><th scope="col">Item</th><th scope="col">Category</th><th scope="col" className="num">In stock</th><th scope="col" className="num">Reorder at</th><th scope="col">Next expiry</th><th scope="col">Status</th><th scope="col">Actions</th></tr></thead>
              <tbody>
                {rows.map((i) => (
                  <tr key={i._id}>
                    <td data-label="Item"><strong>{i.name}</strong><small className="muted block">{money(i.price)} per {i.unit}</small></td>
                    <td data-label="Category">{i.category || '-'}</td>
                    <td data-label="In stock" className="num">{i.stock}</td>
                    <td data-label="Reorder at" className="num">{i.reorderLevel}</td>
                    <td data-label="Next expiry">{i.nextExpiry ? fmtDate(i.nextExpiry) : '-'}</td>
                    <td data-label="Status">
                      {i.stockStatus === 'ok' && i.expiryStatus === 'ok' ? <Tag value="ok">Healthy</Tag> : <>
                        {i.stockStatus !== 'ok' && <Tag value={i.stockStatus}>{i.stockStatus === 'out' ? 'Out of stock' : 'Low stock'}</Tag>}{' '}
                        {i.expiryStatus !== 'ok' && <Tag value={i.expiryStatus}>{i.expiryStatus === 'expired' ? 'Has expired lot' : 'Expiring soon'}</Tag>}
                      </>}
                    </td>
                    <td data-label="Actions" className="actions">
                      <div className="row-actions">
                        {manage && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setModal({ kind: 'receive', item: i })}>Receive</button>}
                        {manage && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setModal({ kind: 'adjust', item: i })}>Adjust</button>}
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setModal({ kind: 'history', item: i })}>History</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ServerPager page={data.page} pages={data.pages} total={data.total} onPage={setPage} label="items" />
        </div>
      )}
      {modal?.kind === 'new' && <ItemModal onClose={() => setModal(null)} onDone={reload} />}
      {modal?.kind === 'receive' && <ReceiveModal item={modal.item} onClose={() => setModal(null)} onDone={reload} />}
      {modal?.kind === 'adjust' && <AdjustModal item={modal.item} onClose={() => setModal(null)} onDone={reload} />}
      {modal?.kind === 'history' && <HistoryModal item={modal.item} onClose={() => setModal(null)} />}
    </>
  );
}
