import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { useToast } from '../context/ToastContext';
import { can } from '../lib/permissions';
import { STATUSES, effectiveStatus } from '../lib/appointments';
import { errorMessage } from '../api/errors';
import { StatusBadge } from './Common';

// Badge for read-only cases, a select for roles that may move the workflow along.
export default function StatusControl({ appointment }) {
  const { role } = useAuth();
  const { mutate } = useData();
  const toast = useToast();
  if (!api.capabilities.status || !can(role, 'appointments', 'status')) return <StatusBadge appointment={appointment} />;

  const change = async (e) => {
    const status = e.target.value;
    try {
      await mutate(() => api.appointments.update(appointment._id, { status }));
      toast.success(`Appointment marked ${status}.`);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };
  const s = effectiveStatus(appointment);
  return (
    <select
      className={`status-select badge-${s}`}
      value={s}
      onChange={change}
      aria-label={`Status for ${appointment.patient?.name || 'appointment'}`}
    >
      {STATUSES.map((x) => (
        <option key={x} value={x}>
          {x}
        </option>
      ))}
    </select>
  );
}
