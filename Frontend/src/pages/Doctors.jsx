import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { useToast } from '../context/ToastContext';
import { can } from '../lib/permissions';
import { errorMessage } from '../api/errors';
import { scheduleOf } from '../../../shared/domain.js';
import DataTable from '../ui/DataTable';
import Icon from '../ui/Icon';
import { ConfirmDialog } from '../ui/Modal';
import { EmptyState, ErrorState, PageHeader, SkeletonList } from '../ui/Common';
import { DoctorFormModal } from '../ui/Forms';
import { money } from '../lib/format';
import { daysText } from '../lib/schedule';

export default function Doctors() {
  const { role } = useAuth();
  const { doctors, state, error, reload, refresh } = useData();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [spec, setSpec] = useState('');
  const [form, setForm] = useState(null);
  const [toDelete, setToDelete] = useState(null);

  const specialties = useMemo(() => [...new Set(doctors.map((d) => d.specialty))].sort((a, b) => a.localeCompare(b)), [doctors]);
  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return doctors.filter((d) => (!spec || d.specialty === spec) && (!t || `${d.name} ${d.specialty}`.toLowerCase().includes(t)));
  }, [doctors, q, spec]);

  const columns = [
    { key: 'name', label: 'Name', sort: (d) => d.name, render: (d) => <Link to={`/doctors/${d._id}`}>{d.name}</Link> },
    { key: 'specialty', label: 'Specialty', sort: (d) => d.specialty },
    { key: 'days', label: 'Works', render: (d) => <span>{daysText(d)} <span className="muted">{scheduleOf(d).startTime}-{scheduleOf(d).endTime}</span></span> },
    { key: 'room', label: 'Room', sort: (d) => d.room || '', render: (d) => d.room || '-' },
    { key: 'fee', label: 'Fee', sort: (d) => d.fee || 0, className: 'num', render: (d) => money(d.fee) },
    {
      key: 'actions',
      label: 'Actions',
      className: 'actions',
      render: (d) => (
        <div className="row-actions">
          <Link className="btn btn-ghost btn-sm" to={`/doctors/${d._id}`}>View</Link>
          {can(role, 'doctors.manage') && (
            <>
              <button type="button" className="btn btn-icon btn-ghost" aria-label={`Edit ${d.name}`} onClick={() => setForm(d)}>
                <Icon name="edit" />
              </button>
              <button type="button" className="btn btn-icon btn-ghost danger" aria-label={`Delete ${d.name}`} onClick={() => setToDelete(d)}>
                <Icon name="trash" />
              </button>
            </>
          )}
        </div>
      ),
    },
  ];

  const remove = async () => {
    try {
      await api.del(`/doctors/delete/${toDelete._id}`);
      await refresh();
      toast.success(`${toDelete.name} was deleted.`);
    } catch (err) {
      toast.error(errorMessage(err));
    }
    setToDelete(null);
  };

  return (
    <>
      <PageHeader title="Doctors" subtitle={`${doctors.length} doctors across ${specialties.length} specialties`}>
        {can(role, 'doctors.manage') && (
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
            {specialties.map((s) => (
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
          empty={<EmptyState title="No doctors match your filters" text="Try a different search or specialty." />}
        />
      )}
      {form && <DoctorFormModal doctor={form === 'new' ? null : form} onClose={() => setForm(null)} />}
      {toDelete && (
        <ConfirmDialog
          title="Delete doctor?"
          message={`${toDelete.name} and their upcoming appointments will be removed. Doctors with visit records cannot be deleted.`}
          onConfirm={remove}
          onCancel={() => setToDelete(null)}
        />
      )}
    </>
  );
}
