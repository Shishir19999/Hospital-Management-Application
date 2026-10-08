import { useState } from 'react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { useToast } from '../context/ToastContext';
import { useFetch } from '../hooks/useFetch';
import { useFormSubmit } from '../hooks/useFormSubmit';
import { ROLES, ROLE_LABELS } from '../lib/permissions';
import { errorMessage } from '../api/errors';
import Icon from '../ui/Icon';
import { Field, ErrorState, EmptyState, PageHeader, SkeletonList } from '../ui/Common';
import { FormActions, ServerError } from '../ui/FormParts';
import { ConfirmDialog, Modal } from '../ui/Modal';
import { ServerPager, Tag } from '../ui/Kit';
import { useDebounced } from '../hooks/useDebounced';

function StaffModal({ person, onClose, onDone }) {
  const { doctors } = useData();
  const toast = useToast();
  const [v, setV] = useState({ name: person?.name || '', email: person?.email || '', password: '', role: person?.role || 'receptionist', doctor: person?.doctor || '' });
  const set = (k) => (e) => setV((x) => ({ ...x, [k]: e.target.value }));
  const { errors, serverError, busy, submit } = useFormSubmit({
    validate: () => {
      const e = {};
      if (!v.name.trim()) e.name = 'Enter the name.';
      if (!person && !/^\S+@\S+\.\S+$/.test(v.email)) e.email = 'Enter a valid email address.';
      if ((!person || v.password) && v.password.length < 6) e.password = 'Password must be at least 6 characters.';
      if (v.role === 'doctor' && !v.doctor) e.doctor = 'Link the account to a doctor record.';
      return e;
    },
    save: () => {
      const body = { name: v.name.trim(), role: v.role, doctor: v.role === 'doctor' ? v.doctor : null };
      if (v.password) body.password = v.password;
      return person ? api.patch(`/users/${person.id}`, body) : api.post('/auth/register', { ...body, email: v.email.trim() });
    },
    onDone: () => {
      toast.success(person ? 'Account updated.' : 'Account created.');
      onDone();
      onClose();
    },
  });
  return (
    <Modal title={person ? `Edit ${person.name}` : 'Add staff account'} onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <ServerError message={serverError} />
        <Field label="Name" id="sf-name" error={errors.name}><input id="sf-name" value={v.name} onChange={set('name')} autoFocus aria-invalid={!!errors.name} /></Field>
        {!person && <Field label="Email" id="sf-email" error={errors.email}><input id="sf-email" type="email" value={v.email} onChange={set('email')} placeholder="you@example.com" aria-invalid={!!errors.email} /></Field>}
        <Field label={person ? 'New password (leave empty to keep)' : 'Password'} id="sf-pass" error={errors.password}><input id="sf-pass" type="password" autoComplete="new-password" value={v.password} onChange={set('password')} aria-invalid={!!errors.password} /></Field>
        <Field label="Role" id="sf-role">
          <select id="sf-role" value={v.role} onChange={set('role')}>{ROLES.map((r) => (<option key={r} value={r}>{ROLE_LABELS[r]}</option>))}</select>
        </Field>
        {v.role === 'doctor' && (
          <Field label="Doctor record" id="sf-doc" error={errors.doctor}>
            <select id="sf-doc" value={v.doctor} onChange={set('doctor')} aria-invalid={!!errors.doctor}>
              <option value="">Select...</option>
              {doctors.map((d) => (<option key={d._id} value={d._id}>{d.name}</option>))}
            </select>
          </Field>
        )}
        <FormActions busy={busy} onClose={onClose} label={person ? 'Save changes' : 'Create account'} />
      </form>
    </Modal>
  );
}

export default function Staff() {
  const { user } = useAuth();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [form, setForm] = useState(null);
  const [toDelete, setToDelete] = useState(null);
  const search = useDebounced(q.trim());
  const { data, loading, error, reload } = useFetch('/users', { search, page, limit: 12 });
  const rows = data?.data || [];

  const toggle = async (p) => {
    try {
      await api.patch(`/users/${p.id}`, { active: !p.active });
      toast.success(p.active ? `${p.name} was disabled and signed out.` : `${p.name} can sign in again.`);
      reload();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };
  const remove = async () => {
    try {
      await api.del(`/users/${toDelete.id}`);
      toast.success(`${toDelete.name} was removed.`);
      reload();
    } catch (err) {
      toast.error(errorMessage(err));
    }
    setToDelete(null);
  };

  return (
    <>
      <PageHeader title="Staff accounts" subtitle="Create sign-ins and choose what each person may do">
        <button type="button" className="btn btn-primary" onClick={() => setForm('new')}><Icon name="plus" /> Add account</button>
      </PageHeader>
      <div className="toolbar">
        <div className="field"><label htmlFor="sf-q">Search</label><input id="sf-q" type="search" placeholder="Name or email" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} /></div>
      </div>
      {loading && <SkeletonList label="Loading staff" />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {data && rows.length === 0 && <EmptyState title="No accounts found" />}
      {rows.length > 0 && (
        <div className="card table-card">
          <div className="table-scroll" tabIndex={0} role="region" aria-label="Staff accounts">
            <table className="table">
              <caption className="sr-only">Staff accounts</caption>
              <thead><tr><th scope="col">Name</th><th scope="col">Email</th><th scope="col">Role</th><th scope="col">Status</th><th scope="col">Actions</th></tr></thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id}>
                    <td data-label="Name">{p.name}{p.id === user.id && <small className="muted"> (you)</small>}</td>
                    <td data-label="Email">{p.email}</td>
                    <td data-label="Role">{ROLE_LABELS[p.role]}</td>
                    <td data-label="Status"><Tag tone={p.active ? 'ok' : 'neutral'}>{p.active ? 'Active' : 'Disabled'}</Tag></td>
                    <td data-label="Actions" className="actions">
                      <div className="row-actions">
                        <button type="button" className="btn btn-icon btn-ghost" aria-label={`Edit ${p.name}`} onClick={() => setForm(p)}><Icon name="edit" /></button>
                        {p.id !== user.id && <button type="button" className="btn btn-ghost btn-sm" onClick={() => toggle(p)}>{p.active ? 'Disable' : 'Enable'}</button>}
                        {p.id !== user.id && <button type="button" className="btn btn-icon btn-ghost danger" aria-label={`Delete ${p.name}`} onClick={() => setToDelete(p)}><Icon name="trash" /></button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ServerPager page={data.page} pages={data.pages} total={data.total} onPage={setPage} label="accounts" />
        </div>
      )}
      {form && <StaffModal person={form === 'new' ? null : form} onClose={() => setForm(null)} onDone={reload} />}
      {toDelete && <ConfirmDialog title="Delete account?" message={`${toDelete.name} (${toDelete.email}) will no longer be able to sign in.`} onConfirm={remove} onCancel={() => setToDelete(null)} />}
    </>
  );
}
