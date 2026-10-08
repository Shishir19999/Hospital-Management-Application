import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useFetch } from '../hooks/useFetch';
import { useFormSubmit } from '../hooks/useFormSubmit';
import { can } from '../lib/permissions';
import { fmtDateTime } from '../lib/dates';
import { label, money } from '../lib/format';
import { errorMessage } from '../api/errors';
import { labFlag } from '../../../shared/domain.js';
import Icon from '../ui/Icon';
import { Field, ErrorState, EmptyState, PageHeader, SkeletonList } from '../ui/Common';
import { FormActions, ServerError } from '../ui/FormParts';
import { ConfirmDialog, Modal } from '../ui/Modal';
import { ServerPager, Tabs, Tag } from '../ui/Kit';
import { useDebounced } from '../hooks/useDebounced';

const rangeText = (r = {}) => (r.low == null && r.high == null ? '-' : `${r.low ?? ''} - ${r.high ?? ''}`);

function ResultModal({ order, onClose, onDone }) {
  const toast = useToast();
  const [value, setValue] = useState(order.value ?? '');
  const [comment, setComment] = useState(order.comment || '');
  const live = value === '' ? null : labFlag(value, order.range);
  const { errors, serverError, busy, submit } = useFormSubmit({
    validate: () => (value === '' || !Number.isFinite(Number(value)) ? { value: 'Enter the measured value.' } : {}),
    save: () => api.post(`/labs/orders/${order._id}/result`, { value: Number(value), comment }),
    onDone: (o) => {
      toast[o.critical ? 'error' : 'success'](o.critical ? `Critical result saved for ${o.patient?.name}. Tell the doctor now.` : 'Result saved.');
      onDone();
      onClose();
    },
  });
  return (
    <Modal title={`Enter result: ${order.testName}`} onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <ServerError message={serverError} />
        <p><strong>{order.patient?.name}</strong> - order {order.orderNo}. Reference range: {rangeText(order.range)} {order.unit}</p>
        <Field label={`Value (${order.unit || 'units'})`} id="rs-val" error={errors.value}>
          <input id="rs-val" type="number" step="any" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} autoFocus aria-invalid={!!errors.value} />
        </Field>
        {live && <p className={live.critical ? 'form-error' : live.abnormal ? 'warn-box' : 'info-box'} role="status"><Icon name={live.abnormal ? 'warn' : 'check'} /> {label(live.flag)}{live.critical ? ' - critical value' : ''}</p>}
        <Field label="Comment" id="rs-c"><input id="rs-c" maxLength="300" value={comment} onChange={(e) => setComment(e.target.value)} /></Field>
        <FormActions busy={busy} onClose={onClose} label="Save result" />
      </form>
    </Modal>
  );
}

function TestModal({ test, onClose, onDone }) {
  const toast = useToast();
  const [v, setV] = useState({ code: test?.code || '', name: test?.name || '', category: test?.category || '', unit: test?.unit || '', low: test?.low ?? '', high: test?.high ?? '', critLow: test?.critLow ?? '', critHigh: test?.critHigh ?? '', price: test?.price ?? '' });
  const set = (k) => (e) => setV((x) => ({ ...x, [k]: e.target.value }));
  const num = (x) => (x === '' ? null : Number(x));
  const { errors, serverError, busy, submit } = useFormSubmit({
    validate: () => {
      const e = {};
      if (!v.code.trim()) e.code = 'Enter a short code.';
      if (!v.name.trim()) e.name = 'Enter the test name.';
      if (!v.category.trim()) e.category = 'Enter a category.';
      if (v.price === '' || Number(v.price) < 0) e.price = 'Enter a price.';
      return e;
    },
    save: () => {
      const body = { code: v.code.trim(), name: v.name.trim(), category: v.category.trim(), unit: v.unit, low: num(v.low), high: num(v.high), critLow: num(v.critLow), critHigh: num(v.critHigh), price: Number(v.price) };
      return test ? api.put(`/labs/tests/${test._id}`, body) : api.post('/labs/tests', body);
    },
    onDone: () => {
      toast.success('Test saved.');
      onDone();
      onClose();
    },
  });
  return (
    <Modal title={test ? 'Edit test' : 'Add test'} onClose={onClose} wide>
      <form onSubmit={submit} noValidate>
        <ServerError message={serverError} />
        <div className="field-row">
          <Field label="Code" id="lt-code" error={errors.code}><input id="lt-code" value={v.code} onChange={set('code')} autoFocus aria-invalid={!!errors.code} /></Field>
          <Field label="Name" id="lt-name" error={errors.name}><input id="lt-name" value={v.name} onChange={set('name')} aria-invalid={!!errors.name} /></Field>
        </div>
        <div className="field-row">
          <Field label="Category" id="lt-cat" error={errors.category}><input id="lt-cat" value={v.category} onChange={set('category')} aria-invalid={!!errors.category} /></Field>
          <Field label="Unit" id="lt-unit"><input id="lt-unit" value={v.unit} onChange={set('unit')} /></Field>
        </div>
        <fieldset className="fieldset">
          <legend>Reference ranges (leave empty when not applicable)</legend>
          <div className="field-row field-row-4">
            <Field label="Normal from" id="lt-low"><input id="lt-low" type="number" step="any" value={v.low} onChange={set('low')} /></Field>
            <Field label="Normal to" id="lt-high"><input id="lt-high" type="number" step="any" value={v.high} onChange={set('high')} /></Field>
            <Field label="Critical below" id="lt-cl"><input id="lt-cl" type="number" step="any" value={v.critLow} onChange={set('critLow')} /></Field>
            <Field label="Critical above" id="lt-ch"><input id="lt-ch" type="number" step="any" value={v.critHigh} onChange={set('critHigh')} /></Field>
          </div>
        </fieldset>
        <Field label="Price" id="lt-price" error={errors.price}><input id="lt-price" type="number" min="0" step="0.01" value={v.price} onChange={set('price')} aria-invalid={!!errors.price} /></Field>
        <FormActions busy={busy} onClose={onClose} label="Save test" />
      </form>
    </Modal>
  );
}

function Catalog() {
  const { role } = useAuth();
  const toast = useToast();
  const { data, loading, error, reload } = useFetch('/labs/tests');
  const [edit, setEdit] = useState(null);
  const [del, setDel] = useState(null);
  const manage = can(role, 'labs.catalog.manage');
  const remove = async () => {
    try {
      await api.del(`/labs/tests/${del._id}`);
      toast.success(`${del.name} removed.`);
      reload();
    } catch (err) {
      toast.error(errorMessage(err));
    }
    setDel(null);
  };
  return (
    <>
      {manage && <div className="toolbar-actions"><button type="button" className="btn btn-primary btn-sm" onClick={() => setEdit('new')}><Icon name="plus" size={14} /> Add test</button></div>}
      {loading && <SkeletonList label="Loading catalogue" />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {data && (
        <div className="card table-card">
          <div className="table-scroll" tabIndex={0} role="region" aria-label="Test catalogue">
            <table className="table">
              <caption className="sr-only">Test catalogue</caption>
              <thead><tr><th scope="col">Code</th><th scope="col">Test</th><th scope="col">Category</th><th scope="col">Normal range</th><th scope="col">Critical</th><th scope="col" className="num">Price</th>{manage && <th scope="col">Actions</th>}</tr></thead>
              <tbody>
                {data.map((t) => (
                  <tr key={t._id}>
                    <td data-label="Code"><code>{t.code}</code></td><td data-label="Test">{t.name}</td><td data-label="Category">{t.category}</td>
                    <td data-label="Normal range">{rangeText(t)} {t.unit}</td>
                    <td data-label="Critical">{t.critLow != null ? `< ${t.critLow}` : ''} {t.critHigh != null ? `> ${t.critHigh}` : ''}{t.critLow == null && t.critHigh == null ? '-' : ''}</td>
                    <td data-label="Price" className="num">{money(t.price)}</td>
                    {manage && (
                      <td data-label="Actions" className="actions">
                        <div className="row-actions">
                          <button type="button" className="btn btn-icon btn-ghost" aria-label={`Edit ${t.name}`} onClick={() => setEdit(t)}><Icon name="edit" /></button>
                          <button type="button" className="btn btn-icon btn-ghost danger" aria-label={`Delete ${t.name}`} onClick={() => setDel(t)}><Icon name="trash" /></button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {edit && <TestModal test={edit === 'new' ? null : edit} onClose={() => setEdit(null)} onDone={reload} />}
      {del && <ConfirmDialog title="Remove test?" message={`${del.name} will no longer be offered. Existing orders keep their details.`} onConfirm={remove} onCancel={() => setDel(null)} />}
    </>
  );
}

export default function Labs() {
  const { role, user } = useAuth();
  const toast = useToast();
  const [tab, setTab] = useState(role === 'doctor' ? 'review' : 'work');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState(null);
  const search = useDebounced(q.trim());
  const params = {
    work: { status: 'open' },
    review: { unreviewed: '1', doctor: role === 'doctor' && user.doctor ? 'me' : '' },
    done: { status: 'resulted' },
  }[tab] || {};
  const { data, loading, error, reload } = useFetch('/labs/orders', { ...params, search, page, limit: 12 }, { enabled: tab !== 'catalog', interval: 20000 });
  const rows = data?.data || [];

  const act = async (o, action, msg) => {
    try {
      await api.post(`/labs/orders/${o._id}/${action}`, {});
      toast.success(msg);
      reload();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <>
      <PageHeader title="Laboratory" subtitle="Collect samples, enter results and review abnormal values" />
      <Tabs label="Lab sections" value={tab} onChange={(t) => { setTab(t); setPage(1); }} tabs={[
        { value: 'work', label: 'Worklist' }, { value: 'review', label: 'To review' }, { value: 'done', label: 'All results' }, { value: 'catalog', label: 'Test catalogue' },
      ]} />
      {tab === 'catalog' ? <Catalog /> : (
        <>
          <div className="toolbar">
            <div className="field"><label htmlFor="lb-q">Search</label><input id="lb-q" type="search" placeholder="Patient, test or order number" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} /></div>
          </div>
          {loading && <SkeletonList label="Loading lab orders" />}
          {error && <ErrorState message={error} onRetry={reload} />}
          {data && rows.length === 0 && <EmptyState title={tab === 'work' ? 'The worklist is empty' : tab === 'review' ? 'Nothing to review' : 'No results yet'} text="New orders and results appear here automatically." />}
          {rows.length > 0 && (
            <div className="card table-card">
              <div className="table-scroll" tabIndex={0} role="region" aria-label="Lab orders">
                <table className="table">
                  <caption className="sr-only">Lab orders</caption>
                  <thead><tr><th scope="col">Order</th><th scope="col">Patient</th><th scope="col">Test</th><th scope="col">Ordered</th><th scope="col">Status</th><th scope="col">Result</th><th scope="col">Actions</th></tr></thead>
                  <tbody>
                    {rows.map((o) => (
                      <tr key={o._id} className={o.critical && !o.reviewed ? 'row-alert' : ''}>
                        <td data-label="Order">{o.orderNo}{o.priority === 'urgent' && <> <Tag value="urgent" /></>}</td>
                        <td data-label="Patient"><Link to={`/patients/${o.patient?._id}`}>{o.patient?.name}</Link></td>
                        <td data-label="Test">{o.testName}</td>
                        <td data-label="Ordered">{fmtDateTime(o.orderedAt)}</td>
                        <td data-label="Status"><Tag value={o.status} /></td>
                        <td data-label="Result">{o.status === 'resulted' ? <>{o.value} {o.unit} <Tag value={o.flag} /> <small className="muted block">ref {rangeText(o.range)}</small></> : '-'}</td>
                        <td data-label="Actions" className="actions">
                          <div className="row-actions">
                            {o.status === 'ordered' && can(role, 'labs.collect') && <button type="button" className="btn btn-ghost btn-sm" onClick={() => act(o, 'collect', 'Sample marked as collected.')}>Collect sample</button>}
                            {o.status === 'collected' && can(role, 'labs.result') && <button type="button" className="btn btn-primary btn-sm" onClick={() => setResult(o)}>Enter result</button>}
                            {o.status === 'resulted' && !o.reviewed && can(role, 'labs.review') && <button type="button" className="btn btn-primary btn-sm" onClick={() => act(o, 'review', 'Marked as reviewed.')}>Mark reviewed</button>}
                            {o.status === 'resulted' && o.reviewed && <span className="muted">Reviewed</span>}
                            {o.status === 'resulted' && can(role, 'labs.result') && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setResult(o)}>Amend</button>}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <ServerPager page={data.page} pages={data.pages} total={data.total} onPage={setPage} label="orders" />
            </div>
          )}
        </>
      )}
      {result && <ResultModal order={result} onClose={() => setResult(null)} onDone={reload} />}
    </>
  );
}
