import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { useToast } from '../context/ToastContext';
import { can } from '../lib/permissions';
import { downloadCsv } from '../lib/csv';
import { PATIENT_CSV } from '../lib/exports';
import { errorMessage } from '../api/errors';
import { GENDERS } from '../lib/validate';
import DataTable from '../ui/DataTable';
import Icon from '../ui/Icon';
import { ConfirmDialog } from '../ui/Modal';
import { EmptyState, ErrorState, PageHeader, SkeletonList } from '../ui/Common';
import { PatientFormModal } from '../ui/Forms';

export default function Patients() {
  const { role } = useAuth();
  const { patients, state, error, reload, mutate } = useData();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [gender, setGender] = useState('');
  const [form, setForm] = useState(null); // null | 'new' | patient
  const [toDelete, setToDelete] = useState(null);

  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return patients.filter(
      (p) => (!gender || p.gender === gender) && (!t || `${p.name} ${p.email || ''} ${p.phone || ''}`.toLowerCase().includes(t))
    );
  }, [patients, q, gender]);

  const columns = [
    {
      key: 'name',
      label: 'Name',
      sort: (p) => p.name,
      render: (p) => <Link to={`/patients/${p._id}`}>{p.name}</Link>,
    },
    { key: 'age', label: 'Age', sort: (p) => Number(p.age), className: 'num' },
    { key: 'gender', label: 'Gender', sort: (p) => p.gender },
    ...(api.capabilities.extras
      ? [
          { key: 'phone', label: 'Phone', sort: (p) => p.phone, render: (p) => p.phone || '-' },
          { key: 'cond', label: 'Conditions', sort: (p) => p.conditions, render: (p) => p.conditions || '-' },
        ]
      : []),
    {
      key: 'actions',
      label: 'Actions',
      className: 'actions',
      render: (p) => (
        <div className="row-actions">
          <Link className="btn btn-ghost btn-sm" to={`/patients/${p._id}`}>
            View
          </Link>
          {can(role, 'patients', 'update') && (
            <button type="button" className="btn btn-icon btn-ghost" aria-label={`Edit ${p.name}`} onClick={() => setForm(p)}>
              <Icon name="edit" />
            </button>
          )}
          {can(role, 'patients', 'remove') && (
            <button type="button" className="btn btn-icon btn-ghost danger" aria-label={`Delete ${p.name}`} onClick={() => setToDelete(p)}>
              <Icon name="trash" />
            </button>
          )}
        </div>
      ),
    },
  ];

  const remove = async () => {
    try {
      await mutate(() => api.patients.remove(toDelete._id));
      toast.success(`${toDelete.name} was deleted along with their appointments.`);
    } catch (err) {
      toast.error(errorMessage(err));
    }
    setToDelete(null);
  };

  return (
    <>
      <PageHeader title="Patients" subtitle={`${patients.length} registered patients`}>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={!rows.length}
          onClick={() => downloadCsv('patients.csv', PATIENT_CSV, rows)}
        >
          <Icon name="download" /> Export CSV
        </button>
        {can(role, 'patients', 'create') && (
          <button type="button" className="btn btn-primary" onClick={() => setForm('new')}>
            <Icon name="plus" /> Add patient
          </button>
        )}
      </PageHeader>

      <div className="toolbar">
        <div className="field">
          <label htmlFor="pt-q">Search patients</label>
          <input id="pt-q" type="search" placeholder="Name, email or phone" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="pt-g">Gender</label>
          <select id="pt-g" value={gender} onChange={(e) => setGender(e.target.value)}>
            <option value="">All</option>
            {GENDERS.map((g) => (
              <option key={g}>{g}</option>
            ))}
          </select>
        </div>
      </div>

      {state === 'loading' && <SkeletonList label="Loading patients" />}
      {state === 'error' && <ErrorState message={error} onRetry={reload} />}
      {state === 'ready' && (
        <DataTable
          caption="Patients"
          columns={columns}
          rows={rows}
          initialSort={{ key: 'name', dir: 'asc' }}
          empty={
            <EmptyState
              title={patients.length ? 'No patients match your filters' : 'No patients yet'}
              text={patients.length ? 'Try a different search or clear the gender filter.' : 'Add the first patient to get started.'}
              action={
                !patients.length && can(role, 'patients', 'create') ? (
                  <button type="button" className="btn btn-primary" onClick={() => setForm('new')}>
                    Add patient
                  </button>
                ) : null
              }
            />
          }
        />
      )}

      {form && <PatientFormModal patient={form === 'new' ? null : form} onClose={() => setForm(null)} />}
      {toDelete && (
        <ConfirmDialog
          title="Delete patient?"
          message={`${toDelete.name} and all of their appointments will be removed. This cannot be undone.`}
          onConfirm={remove}
          onCancel={() => setToDelete(null)}
        />
      )}
    </>
  );
}
