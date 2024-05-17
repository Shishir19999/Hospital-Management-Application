import React from 'react';
import '../CSS/Doctors.css';

const DoctorCard = ({ doctor, onEdit, onDelete }) => {
  return (
    <div className="doctor-card">
      
        <h4>{doctor.name} </h4>
        <p>Specialist: {doctor.specialty}</p>
      
     
      <div className="btn-container">
        <button onClick={() => onEdit(doctor)}>Edit</button>
        <button onClick={() => onDelete(doctor._id)}>Delete</button>
      </div>
    </div>
  );
};

export default DoctorCard;
