import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { API_URL } from '../api/config';
import AppointmentCard from './AppointmentCard.jsx';
import '../CSS/Appointment.css';
import Pagination from './Pagination';
import { EMPTY_META } from './paginationMeta';

const PAGE_SIZE = 9;

// Format a stored date for a datetime-local input (local time, minute precision)
const toLocalInput = (iso) => {
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const Appointments = () => {
  const [appointments, setAppointments] = useState([]);
  const [meta, setMeta] = useState(EMPTY_META);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [reload, setReload] = useState(0);
  const [patients, setPatients] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [newAppointment, setNewAppointment] = useState({
    patient: '',
    doctor: '',
    date: '',
  });
  const [selectedAppointment, setSelectedAppointment] = useState(null);
  const [isEditMode, setIsEditMode] = useState(false);

  // Dropdown options come from the light, unpaginated lookup endpoints.
  useEffect(() => {
    axios
      .get(`${API_URL}/patients/lookup`)
      .then((res) => setPatients(res.data))
      .catch((err) => console.error('Error fetching patients:', err));

    axios
      .get(`${API_URL}/doctors/lookup`)
      .then((res) => setDoctors(res.data))
      .catch((err) => console.error('Error fetching doctors:', err));
  }, []);

  // Fetch the current page of appointments
  useEffect(() => {
    axios
      .get(`${API_URL}/appointments`, { params: { page, limit: PAGE_SIZE, search } })
      .then((res) => {
        const { data, ...rest } = res.data;
        if (!data.length && rest.page > rest.pages) return setPage(rest.pages);
        setAppointments(data);
        setMeta(rest);
      })
      .catch((err) => console.error('Error fetching appointments:', err));
  }, [page, search, reload]);

  const refresh = () => setReload((n) => n + 1);
  const changeSearch = useCallback((v) => { setSearch(v); setPage(1); }, []);

  const isFutureDate = (date) => new Date(date) > new Date();

  // Add appointment
  const handleAddAppointment = (e) => {
    e.preventDefault();
    if (!newAppointment.patient || !newAppointment.doctor || !newAppointment.date) {
      return alert('Please select patient, doctor, and date.');
    }
    if (!isFutureDate(newAppointment.date)) {
      return alert('Appointment date must be in the future.');
    }
    axios
      .post(`${API_URL}/appointments/add`, newAppointment)
      .then(() => {
        refresh();
        setNewAppointment({ patient: '', doctor: '', date: '' });
      })
      .catch((err) => { console.error('Error adding appointment:', err); alert(err.response?.data?.error || 'Error adding appointment'); });
  };

  // Update appointment
  const handleUpdateAppointment = (id, e) => {
    e.preventDefault();
    if (!selectedAppointment.patient || !selectedAppointment.doctor || !selectedAppointment.date) {
      return alert('Please select patient, doctor, and date.');
    }
    if (!isFutureDate(selectedAppointment.date)) {
      return alert('Appointment date must be in the future.');
    }
    axios
      .put(`${API_URL}/appointments/${id}`, selectedAppointment)
      .then(() => {
        refresh();
        setSelectedAppointment(null);
        setIsEditMode(false);
      })
      .catch((err) => { console.error('Error updating appointment:', err); alert(err.response?.data?.error || 'Error updating appointment'); });
  };

  // Delete appointment
  const handleDeleteAppointment = (id) => {
    axios
      .delete(`${API_URL}/appointments/delete/${id}`)
      .then(() => refresh())
      .catch((err) => console.error('Error deleting appointment:', err));
  };

  // Edit appointment
  const handleEditAppointment = (appointment) => {
    setSelectedAppointment({
      _id: appointment._id,
      patient: appointment.patient._id,
      doctor: appointment.doctor._id,
      date: toLocalInput(appointment.date),
    });
    setIsEditMode(true);
  };

  return (
    <div className="main-container" style={{ width: '100%' }}>
      {/* Form Section */}
      <div className="add-editAppointmentTitle">
          {isEditMode ? 'Edit Appointment' : 'Add New Appointment'}
      <div className="form-sections">
        
        

        <form
          onSubmit={
            isEditMode
              ? (e) => handleUpdateAppointment(selectedAppointment._id, e)
              : handleAddAppointment
          }
        >
          <div className="form-row">
            <label>Patient:</label>
            <select
              value={isEditMode ? selectedAppointment.patient : newAppointment.patient}
              onChange={(e) =>
                isEditMode
                  ? setSelectedAppointment({ ...selectedAppointment, patient: e.target.value })
                  : setNewAppointment({ ...newAppointment, patient: e.target.value })
              }
            >
              <option value="">--Select Patient--</option>
              {patients.map((p) => (
                <option key={p._id} value={p._id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div className="form-row">
            <label>Doctor:</label>
            <select
              value={isEditMode ? selectedAppointment.doctor : newAppointment.doctor}
              onChange={(e) =>
                isEditMode
                  ? setSelectedAppointment({ ...selectedAppointment, doctor: e.target.value })
                  : setNewAppointment({ ...newAppointment, doctor: e.target.value })
              }
            >
              <option value="">--Select Doctor--</option>
              {doctors.map((d) => (
                <option key={d._id} value={d._id}>
                  {d.name} ({d.specialty})
                </option>
              ))}
            </select>
          </div>

          <div className="form-row">
            <label>Date and time:</label>
            <input
              type="datetime-local"
              value={isEditMode ? selectedAppointment.date : newAppointment.date}
              onChange={(e) =>
                isEditMode
                  ? setSelectedAppointment({ ...selectedAppointment, date: e.target.value })
                  : setNewAppointment({ ...newAppointment, date: e.target.value })
              }
            />
          </div>

          <button type="submit">{isEditMode ? 'Update Appointment' : 'Add Appointment'}</button>
        </form>
      </div>
</div>
      {/* Appointment List Section */}
      <div className="appointments-section">
        <h3 style={{ textAlign: 'center' }}>Appointments ({meta.total})</h3>
        <Pagination meta={meta} onPage={setPage} search={search} onSearch={changeSearch} placeholder="Search patient or doctor..." />
        <div className="appointment-list">
          {appointments.map((appointment) => (
            <AppointmentCard
              key={appointment._id}
              appointment={appointment}
              onEdit={handleEditAppointment}
              onDelete={handleDeleteAppointment}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default Appointments;
