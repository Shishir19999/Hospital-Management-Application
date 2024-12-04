import React from 'react';
import '../CSS/Doctors.css';

const DoctorCard = ({ doctor, onEdit, onDelete ,onViewPatientsHistory}) => {
  return (
    <div className="doctor-card">
      
        <h4>{doctor.name} </h4>
        <p>Specialist: {doctor.specialty}</p>
      
     
      <div className="btn-container">
        <button onClick={() => onEdit(doctor)}>Edit</button>
        <button onClick={() => onDelete(doctor._id)}>Delete</button>
        <button onClick={() => onViewPatientsHistory(doctor._id)}>View Patient History</button>
      </div>
    </div>
  );
};

export default DoctorCard;
