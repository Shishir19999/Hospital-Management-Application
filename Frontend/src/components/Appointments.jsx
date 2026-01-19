import React, { useState, useEffect } from 'react';
import axios from 'axios';
import AppointmentCard from './AppointmentCard.jsx';
import '../CSS/Appointment.css';

const Appointments = () => {
  const [appointments, setAppointments] = useState([]);
  const [patients, setPatients] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [newAppointment, setNewAppointment] = useState({
    patient: '',
    doctor: '',
    date: '',
  });
  const [selectedAppointment, setSelectedAppointment] = useState(null);
  const [isEditMode, setIsEditMode] = useState(false);

  // Fetch appointments, patients, and doctors
  useEffect(() => {
    axios
      .get('http://localhost:8080/appointments')
      .then((res) => setAppointments(res.data))
      .catch((err) => console.error('Error fetching appointments:', err));

    axios
      .get('http://localhost:8080/patients')
      .then((res) => setPatients(res.data))
      .catch((err) => console.error('Error fetching patients:', err));

    axios
      .get('http://localhost:8080/doctors')
      .then((res) => setDoctors(res.data))
      .catch((err) => console.error('Error fetching doctors:', err));
  }, []);

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
      .post('http://localhost:8080/appointments/add', newAppointment)
      .then((res) => {
        setAppointments([...appointments, res.data]);
        setNewAppointment({ patient: '', doctor: '', date: '' });
      })
      .catch((err) => console.error('Error adding appointment:', err));
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
      .post(`http://localhost:8080/appointments/update/${id}`, selectedAppointment)
      .then((res) => {
        setAppointments(
          appointments.map((app) => (app._id === id ? res.data : app))
        );
        setSelectedAppointment(null);
        setIsEditMode(false);
      })
      .catch((err) => console.error('Error updating appointment:', err));
  };

  // Delete appointment
  const handleDeleteAppointment = (id) => {
    axios
      .delete(`http://localhost:8080/appointments/delete/${id}`)
      .then(() => setAppointments(appointments.filter((app) => app._id !== id)))
      .catch((err) => console.error('Error deleting appointment:', err));
  };

  // Edit appointment
  const handleEditAppointment = (appointment) => {
    setSelectedAppointment({
      _id: appointment._id,
      patient: appointment.patient._id,
      doctor: appointment.doctor._id,
      date: appointment.date.slice(0, 10),
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
            <label>Date:</label>
            <input
              type="date"
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
        <h3 style={{ textAlign: 'center' }}>Appointments ({appointments.length})</h3>
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
