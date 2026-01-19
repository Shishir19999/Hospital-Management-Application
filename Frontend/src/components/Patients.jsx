import React, { useState, useEffect } from 'react';
import axios from 'axios';
import '../CSS/Patients.css';
import PatientCard from './PatientCard';

const Patients = () => {
  const [patients, setPatients] = useState([]);
  const [newPatient, setNewPatient] = useState({ name: '', age: '', gender: '' });
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [history, setHistory] = useState([]);
  const [showHistoryModal, setShowHistoryModal] = useState(false);

  // Fetch patients
  useEffect(() => {
    axios.get('http://localhost:8080/patients')
      .then(res => setPatients(res.data))
      .catch(err => console.error('Error fetching patients:', err));
  }, []);

  // Add patient
  const handleAddPatient = (e) => {
    e.preventDefault();
    if (!newPatient.name || !newPatient.age || !newPatient.gender) {
      return alert('All fields are required');
    }
    axios.post('http://localhost:8080/patients/add', newPatient)
      .then(res => {
        setPatients([...patients, res.data]);
        setNewPatient({ name: '', age: '', gender: '' });
      })
      .catch(err => console.error('Error adding patient:', err));
  };

  // Update patient
  const handleUpdatePatient = (id, e) => {
    e.preventDefault();
    if (!selectedPatient.name || !selectedPatient.age || !selectedPatient.gender) {
      return alert('All fields are required');
    }
    axios.post(`http://localhost:8080/patients/update/${id}`, selectedPatient)
      .then(() => {
        setPatients(patients.map(p => p._id === id ? { ...selectedPatient, _id: id } : p));
        setSelectedPatient(null);
        setIsEditMode(false);
      })
      .catch(err => console.error('Error updating patient:', err));
  };

  // Delete patient
  const handleDeletePatient = (id) => {
    axios.delete(`http://localhost:8080/patients/delete/${id}`)
      .then(() => setPatients(patients.filter(p => p._id !== id)))
      .catch(err => console.error('Error deleting patient:', err));
  };

  // Edit patient
  const handleEditPatient = (patient) => {
    setSelectedPatient(patient);
    setIsEditMode(true);
  };

  // View history
  const handleViewHistory = (patient) => {
    if (!patient?._id) return alert('Patient ID not found');

    axios.get(`http://localhost:8080/patients/${patient._id}/history`)
      .then(res => {
        setHistory(res.data);
        setSelectedPatient(patient);
        setShowHistoryModal(true);
      })
      .catch(err => console.error('Error fetching history:', err));
  };

  const handleCloseHistoryModal = () => {
    setHistory([]);
    setSelectedPatient(null);
    setShowHistoryModal(false);
  };

  return (
    <div className="patient-main">
      <div className="Add-editPatientTitle">
        <h3>{isEditMode ? 'Edit Patient' : 'Add New Patient'}</h3>
        <div className="form-main">
          <div className="form-sections">
            <form onSubmit={isEditMode ? (e) => handleUpdatePatient(selectedPatient._id, e) : handleAddPatient}>
              
              <div className="form-row">
                <label>Name:</label>
                <input
                  type="text"
                  value={isEditMode ? selectedPatient.name : newPatient.name}
                  onChange={e => isEditMode ? setSelectedPatient({ ...selectedPatient, name: e.target.value }) : setNewPatient({ ...newPatient, name: e.target.value })}
                />
              </div>

              <div className="form-row">
                <label>Age:</label>
                <input
                  type="number"
                  value={isEditMode ? selectedPatient.age : newPatient.age}
                  onChange={e => isEditMode ? setSelectedPatient({ ...selectedPatient, age: e.target.value }) : setNewPatient({ ...newPatient, age: e.target.value })}
                />
              </div>

              <div className="form-row">
                <label>Gender:</label>
                <select
                  value={isEditMode ? selectedPatient.gender : newPatient.gender}
                  onChange={e => isEditMode ? setSelectedPatient({ ...selectedPatient, gender: e.target.value }) : setNewPatient({ ...newPatient, gender: e.target.value })}
                >
                  <option value="" disabled>Select Gender</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <button type="submit">{isEditMode ? 'Update Patient' : 'Add Patient'}</button>
            </form>
          </div>
        </div>
      </div>

      {/* Patient List */}
      <div className="Patient-List">
        <h3>Patient List ({patients.length})</h3>
        <div className="patients-section">
          <div className="patient-list">
            {patients.map(patient => (
              <PatientCard
                key={patient._id}
                patient={patient}
                onEdit={handleEditPatient}
                onDelete={handleDeletePatient}
                onViewHistory={handleViewHistory}
              />
            ))}
          </div>
        </div>
      </div>

      {/* History Modal */}
      {showHistoryModal && (
        <div className="patient-history-modal" onClick={handleCloseHistoryModal}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h4>History for {selectedPatient?.name}</h4>
            <button className="close-btn" onClick={handleCloseHistoryModal}>✕</button>
            {history.length > 0 ? (
              <table>
                <thead>
                  <tr>
                    <th>Doctor</th>
                    <th>Specialty</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map(h => (
                    <tr key={h._id}>
                      <td>{h.doctor?.name || '-'}</td>
                      <td>{h.doctor?.specialty || '-'}</td>
                      <td>{new Date(h.date).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <p>No appointment history found.</p>}
          </div>
        </div>
      )}

    </div>
  );
};

export default Patients;
