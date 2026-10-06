import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { API_URL } from '../api/config';
import DoctorCard from './DoctorCard';
import '../CSS/Doctors.css';
import { SPECIALTIES } from './Constants';
import Pagination from './Pagination';
import { EMPTY_META } from './paginationMeta';

const PAGE_SIZE = 9;

const Doctors = () => {
  const [doctors, setDoctors] = useState([]);
  const [meta, setMeta] = useState(EMPTY_META);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [reload, setReload] = useState(0);
  const [newDoctor, setNewDoctor] = useState({ name: '', specialty: '' });
  const [selectedDoctor, setSelectedDoctor] = useState(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [history, setHistory] = useState([]);
  const [historyDoctor, setHistoryDoctor] = useState(null);
  const [showHistoryModal, setShowHistoryModal] = useState(false);

  // Fetch the current page (re-runs on page/search change or after a mutation)
  useEffect(() => {
    axios
      .get(`${API_URL}/doctors`, { params: { page, limit: PAGE_SIZE, search } })
      .then((res) => {
        const { data, ...rest } = res.data;
        if (!data.length && rest.page > rest.pages) return setPage(rest.pages);
        setDoctors(data);
        setMeta(rest);
      })
      .catch((err) => console.error('Error fetching doctors:', err));
  }, [page, search, reload]);

  const refresh = () => setReload((n) => n + 1);
  const changeSearch = useCallback((v) => { setSearch(v); setPage(1); }, []);

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
      .post(`${API_URL}/doctors/add`, newDoctor)
      .then(() => {
        refresh();
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
      .put(`${API_URL}/doctors/${id}`, selectedDoctor)
      .then(() => {
        refresh();
        setSelectedDoctor(null);
        setIsEditMode(false);
      })
      .catch((err) => console.error('Error updating doctor:', err));
  };

  // Delete doctor
  const handleDeleteDoctor = (id) => {
    axios
      .delete(`${API_URL}/doctors/delete/${id}`)
      .then(() => refresh())
      .catch((err) => console.error('Error deleting doctor:', err));
  };

  // Edit doctor
  const handleEditDoctor = (doctor) => {
    setSelectedDoctor(doctor);
    setIsEditMode(true);
  };

  // View patient history
  const handleViewPatientsHistory = async (doctor) => {
    const doctorId = doctor._id;
    try {
      setHistoryDoctor(doctor);
      const res = await axios.get(
        `${API_URL}/doctors/${doctorId}/patient-history`
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
        <h3>Doctor List ({meta.total})</h3>
        <Pagination meta={meta} onPage={setPage} search={search} onSearch={changeSearch} placeholder="Search doctors..." />
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
            <h4>Patient History for {historyDoctor?.name}</h4>

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
