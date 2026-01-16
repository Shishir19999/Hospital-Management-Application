import React from 'react';
import '../CSS/Patients.css';

const PatientCard = ({ patient, onEdit, onDelete, onViewHistory }) => (
  <div className="patient-card">
    <h4>Name: {patient.name}</h4>
    <p>Age: {patient.age}</p>
    <p>Gender: {patient.gender}</p>
    <div className="btn-container" style={{ width: '100%' }}>
      <button onClick={() => onEdit(patient)}>Edit</button>
      <button onClick={() => onDelete(patient._id)}>Delete</button>
      <button onClick={() => onViewHistory(patient)}>View History</button>
    </div>
  </div>
);

export default PatientCard;
