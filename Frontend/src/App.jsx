import {
  BrowserRouter as Router,
  Routes,
  Route,
  Link,
  useLocation,
} from 'react-router-dom';
import Appointments from './components/Appointments';
import Doctors from './components/Doctors';
import Patients from './components/Patients';
import Login from './components/Login';
import ProtectedRoute from './components/ProtectedRoute';
import { AuthProvider, useAuth } from './context/AuthContext';
import './CSS/App.css';

const NavBar = () => {
  const { pathname } = useLocation();
  const { user, logout } = useAuth();
  const isLinkActive = (path) =>
    pathname === path || (path === '/appointments' && pathname === '/');
  if (!user) return null;
  return (
    <nav>
      <ul>
        <li className={isLinkActive('/appointments') ? 'active' : ''}>
          <Link to="/appointments">Appointments</Link>
        </li>
        <li className={isLinkActive('/doctors') ? 'active' : ''}>
          <Link to="/doctors">Doctors</Link>
        </li>
        <li className={isLinkActive('/patients') ? 'active' : ''}>
          <Link to="/patients">Patients</Link>
        </li>
        <li>
          <span>{user.name} ({user.role})</span>{' '}
          <button onClick={logout}>Logout</button>
        </li>
      </ul>
    </nav>
  );
};

const App = () => {
  return (
    <AuthProvider>
      <Router>
        <div className="container">
          <h1 style={{ color: 'green' }}>Hospital Managment App</h1>
          <NavBar />

          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/appointments" element={<ProtectedRoute><Appointments /></ProtectedRoute>} />
            <Route path="/" element={<ProtectedRoute><Appointments /></ProtectedRoute>} />
            <Route path="/doctors" element={<ProtectedRoute><Doctors /></ProtectedRoute>} />
            <Route path="/patients" element={<ProtectedRoute><Patients /></ProtectedRoute>} />
          </Routes>
        </div>
      </Router>
    </AuthProvider>
  );
};

export default App;
