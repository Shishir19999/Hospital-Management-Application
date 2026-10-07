import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { useToast } from '../context/ToastContext';
import { can } from '../lib/permissions';
import { downloadCsv } from '../lib/csv';
import { effectiveStatus, refId } from '../lib/appointments';
import { SPECIALTIES } from '../lib/constants';
import { errorMessage } from '../api/errors';
import DataTable from '../ui/DataTable';
import Icon from '../ui/Icon';
import { ConfirmDialog } from '../ui/Modal';
import { EmptyState, ErrorState, PageHeader, SkeletonList } from '../ui/Common';
import { DoctorFormModal } from '../ui/Forms';

export default function Doctors() {
  const { role } = useAuth();
  const { doctors, appointments, state, error, reload, mutate } = useData();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [spec, setSpec] = useState('');
  const [form, setForm] = useState(null);
  const [toDelete, setToDelete] = useState(null);

  const load = useMemo(() => {
    const m = new Map();
    for (const a of appointments) {
      if (effectiveStatus(a) !== 'scheduled') continue;
      m.set(refId(a.doctor), (m.get(refId(a.doctor)) || 0) + 1);
    }
    return m;
  }, [appointments]);

  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return doctors.filter((d) => (!spec || d.specialty === spec) && (!t || `${d.name} ${d.specialty}`.toLowerCase().includes(t)));
  }, [doctors, q, spec]);

  const columns = [
    { key: 'name', label: 'Name', sort: (d) => d.name, render: (d) => <Link to={`/doctors/${d._id}`}>{d.name}</Link> },
    { key: 'specialty', label: 'Specialty', sort: (d) => d.specialty },
    { key: 'upcoming', label: 'Upcoming', className: 'num', sort: (d) => load.get(d._id) || 0, render: (d) => load.get(d._id) || 0 },
    {
      key: 'actions',
      label: 'Actions',
      className: 'actions',
      render: (d) => (
        <div className="row-actions">
          <Link className="btn btn-ghost btn-sm" to={`/doctors/${d._id}`}>
            Schedule
          </Link>
          {can(role, 'doctors', 'update') && (
            <button type="button" className="btn btn-icon btn-ghost" aria-label={`Edit ${d.name}`} onClick={() => setForm(d)}>
              <Icon name="edit" />
            </button>
          )}
          {can(role, 'doctors', 'remove') && (
            <button type="button" className="btn btn-icon btn-ghost danger" aria-label={`Delete ${d.name}`} onClick={() => setToDelete(d)}>
              <Icon name="trash" />
            </button>
          )}
        </div>
      ),
    },
  ];

  const remove = async () => {
    try {
      await mutate(() => api.doctors.remove(toDelete._id));
      toast.success(`${toDelete.name} was removed.`);
    } catch (err) {
      toast.error(errorMessage(err));
    }
    setToDelete(null);
  };

  return (
    <>
      <PageHeader title="Doctors" subtitle={`${doctors.length} doctors across ${new Set(doctors.map((d) => d.specialty)).size} specialties`}>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={!rows.length}
          onClick={() =>
            downloadCsv('doctors.csv', [{ label: 'Name', value: (d) => d.name }, { label: 'Specialty', value: (d) => d.specialty }], rows)
          }
        >
          <Icon name="download" /> Export CSV
        </button>
        {can(role, 'doctors', 'create') && (
          <button type="button" className="btn btn-primary" onClick={() => setForm('new')}>
            <Icon name="plus" /> Add doctor
          </button>
        )}
      </PageHeader>

      <div className="toolbar">
        <div className="field">
          <label htmlFor="dr-q">Search doctors</label>
          <input id="dr-q" type="search" placeholder="Name or specialty" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="dr-s">Specialty</label>
          <select id="dr-s" value={spec} onChange={(e) => setSpec(e.target.value)}>
            <option value="">All</option>
            {SPECIALTIES.filter((s) => doctors.some((d) => d.specialty === s)).map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>

      {state === 'loading' && <SkeletonList label="Loading doctors" />}
      {state === 'error' && <ErrorState message={error} onRetry={reload} />}
      {state === 'ready' && (
        <DataTable
          caption="Doctors"
          columns={columns}
          rows={rows}
          initialSort={{ key: 'name', dir: 'asc' }}
          empty={<EmptyState title="No doctors found" text="Adjust the search or specialty filter." />}
        />
      )}

      {form && <DoctorFormModal doctor={form === 'new' ? null : form} onClose={() => setForm(null)} />}
      {toDelete && (
        <ConfirmDialog
          title="Delete doctor?"
          message={`${toDelete.name} will be removed and their appointments may be affected. This cannot be undone.`}
          onConfirm={remove}
          onCancel={() => setToDelete(null)}
        />
      )}
    </>
  );
}
