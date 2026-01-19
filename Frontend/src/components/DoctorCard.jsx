import React from 'react';
import '../CSS/Doctors.css';

const DoctorCard = ({ doctor, onEdit, onDelete, onViewPatientsHistory }) => (
  <div className="doctor-card">
    <h4>Name: {doctor.name}</h4>
    <p>Specialty: {doctor.specialty}</p>

    <div className="btn-container" style={{ width: '100%' }}>
      <button onClick={() => onEdit(doctor)}>Edit</button>
      <button onClick={() => onDelete(doctor._id)}>Delete</button>
      <button onClick={() => onViewPatientsHistory(doctor)}>View History</button>
    </div>
  </div>
);

export default DoctorCard;
