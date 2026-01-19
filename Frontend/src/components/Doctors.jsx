import React, { useState, useEffect } from 'react';
import axios from 'axios';
import DoctorCard from './DoctorCard';
import '../CSS/Doctors.css';
import { SPECIALTIES } from './Constants';

const Doctors = () => {
  const [doctors, setDoctors] = useState([]);
  const [newDoctor, setNewDoctor] = useState({ name: '', specialty: '' });
  const [selectedDoctor, setSelectedDoctor] = useState(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [history, setHistory] = useState([]);
  const [showHistoryModal, setShowHistoryModal] = useState(false);

  // Fetch doctors
  useEffect(() => {
    axios
      .get('http://localhost:8080/doctors')
      .then((res) => setDoctors(res.data))
      .catch((err) => console.error('Error fetching doctors:', err));
  }, []);

  // Disable background scroll when modal is open
  useEffect(() => {
    document.body.style.overflow = showHistoryModal ? 'hidden' : 'auto';
    return () => (document.body.style.overflow = 'auto');
  }, [showHistoryModal]);

  // Add doctor
  const handleAddDoctor = (e) => {
    e.preventDefault();
    if (!SPECIALTIES.includes(newDoctor.specialty)) {
      return alert('Please select a valid specialty');
    }
    axios
      .post('http://localhost:8080/doctors/add', newDoctor)
      .then((res) => {
        setDoctors([...doctors, res.data]);
        setNewDoctor({ name: '', specialty: '' });
      })
      .catch((err) => console.error('Error adding doctor:', err));
  };

  // Update doctor
  const handleUpdateDoctor = (id, e) => {
    e.preventDefault();
    if (!SPECIALTIES.includes(selectedDoctor.specialty)) {
      return alert('Please select a valid specialty');
    }
    axios
      .post(`http://localhost:8080/doctors/update/${id}`, selectedDoctor)
      .then(() => {
        setDoctors(
          doctors.map((doc) =>
            doc._id === id ? { ...selectedDoctor, _id: id } : doc
          )
        );
        setSelectedDoctor(null);
        setIsEditMode(false);
      })
      .catch((err) => console.error('Error updating doctor:', err));
  };

  // Delete doctor
  const handleDeleteDoctor = (id) => {
    axios
      .delete(`http://localhost:8080/doctors/delete/${id}`)
      .then(() => setDoctors(doctors.filter((doc) => doc._id !== id)))
      .catch((err) => console.error('Error deleting doctor:', err));
  };

  // Edit doctor
  const handleEditDoctor = (doctor) => {
    setSelectedDoctor(doctor);
    setIsEditMode(true);
  };

  // View patient history
  const handleViewPatientsHistory = async (doctorId) => {
    try {
      const res = await axios.get(
        `http://localhost:8080/doctors/${doctorId}/patient-history`
      );
      setHistory(res.data);
      setShowHistoryModal(true);
    } catch (err) {
      console.error('Error fetching patient history:', err);
      alert('Failed to fetch patient history.');
    }
  };

  const handleCloseHistoryModal = () => {
    setHistory([]);
    setShowHistoryModal(false);
  };

  return (
    <div className="main-doc-container">
      {/* Add/Edit Doctor Form */}
      <div className="Add-editDoctorTitle">
        <h3>{isEditMode ? 'Edit Doctor' : 'Add New Doctor'}</h3>
        <div className="form-main">
          <div className="form-sections">
            <form
              onSubmit={
                isEditMode
                  ? (e) => handleUpdateDoctor(selectedDoctor._id, e)
                  : handleAddDoctor
              }
              className="doctor-form"
            >
              <div className="form-row">
                <label>Name:</label>
                <input
                  type="text"
                  value={isEditMode ? selectedDoctor.name : newDoctor.name}
                  onChange={(e) =>
                    isEditMode
                      ? setSelectedDoctor({
                          ...selectedDoctor,
                          name: e.target.value,
                        })
                      : setNewDoctor({ ...newDoctor, name: e.target.value })
                  }
                  placeholder="Enter doctor's name"
                />
              </div>

              <div className="form-row">
                <label>Specialty:</label>
                <select
                  value={
                    isEditMode ? selectedDoctor.specialty : newDoctor.specialty
                  }
                  onChange={(e) =>
                    isEditMode
                      ? setSelectedDoctor({
                          ...selectedDoctor,
                          specialty: e.target.value,
                        })
                      : setNewDoctor({ ...newDoctor, specialty: e.target.value })
                  }
                >
                  <option value="">--Select Specialty--</option>
                  {SPECIALTIES.map((spec) => (
                    <option key={spec} value={spec}>
                      {spec}
                    </option>
                  ))}
                </select>
              </div>

              <button type="submit">
                {isEditMode ? 'Update Doctor' : 'Add Doctor'}
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* Doctor List */}
      <div className="doctor-list">
        <h3>Doctor List ({doctors.length})</h3>
        <div className="doctors-section">
          {doctors.map((doctor) => (
            <DoctorCard
              key={doctor._id}
              doctor={doctor}
              onEdit={handleEditDoctor}
              onDelete={handleDeleteDoctor}
              onViewPatientsHistory={handleViewPatientsHistory}
            />
          ))}
        </div>
      </div>

      {/* Patient History Modal */}
      {showHistoryModal && (
        <div
          className="doctor-history-modal"
          onClick={handleCloseHistoryModal}
        >
          <div
            className="modal-content"
            onClick={(e) => e.stopPropagation()}
          >
            <h4>Patient History for {selectedDoctor?.name}</h4>

            <button className="close-btn" onClick={handleCloseHistoryModal}>
              ✕
            </button>

            {history.length > 0 ? (
              <table>
                <thead>
                  <tr>
                    <th>Patient Name</th>
                    <th>Age</th>
                    <th>Gender</th>
                    <th>Appointment Date</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((h) => (
                    <tr key={h._id}>
                      <td>{h.patient?.name || 'Unknown'}</td>
                      <td>{h.patient?.age || '-'}</td>
                      <td>{h.patient?.gender || '-'}</td>
                      <td>{new Date(h.date).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p>No patient history found.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Doctors;
