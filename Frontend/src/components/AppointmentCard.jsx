import React from 'react';
import '../CSS/Appointment.css';

const AppointmentCard = ({ appointment, onEdit, onDelete, onViewHistory }) => {
  return (
    <div className="appointment-card">
      <p>
        <span>Patient:</span> {appointment.patient?.name || 'Unknown'}
      </p>
      <p>
        <span>Doctor:</span> {appointment.doctor?.name || 'Unknown'} (
        {appointment.doctor?.specialty || 'N/A'})
      </p>
      <p>
        <span>Date:</span> {new Date(appointment.date).toLocaleDateString()}
      </p>
      <div className="btn-container">
        <button onClick={() => onEdit(appointment)}>Edit</button>
        <button onClick={() => onDelete(appointment._id)}>Delete</button>
        {onViewHistory && (
          <button onClick={() => onViewHistory(appointment._id)}>View History</button>
        )}
      </div>
    </div>
  );
};

export default AppointmentCard;
