import { useEffect } from 'react';
import { BrowserRouter, HashRouter, Link, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { IS_DEMO } from './api';
import { AuthProvider, useAuth } from './context/AuthContext';
import { DataProvider } from './context/DataContext';
import { ThemeProvider } from './context/ThemeContext';
import { ToastProvider } from './context/ToastContext';
import Appointments from './pages/Appointments';
import Dashboard from './pages/Dashboard';
import DoctorDetail from './pages/DoctorDetail';
import Doctors from './pages/Doctors';
import Login from './pages/Login';
import PatientDetail from './pages/PatientDetail';
import Patients from './pages/Patients';
import { EmptyState } from './ui/Common';
import { AppHeader, DemoBanner } from './ui/Shell';
import './styles.css';

// HashRouter keeps deep links working on static hosting under a sub-path.
const Router = IS_DEMO ? HashRouter : BrowserRouter;

function Page({ title, children }) {
  const { pathname } = useLocation();
  useEffect(() => {
    document.title = `${title} | MediCare HMS`;
    window.scrollTo(0, 0);
  }, [title, pathname]);
  return children;
}

function Protected() {
  const { token } = useAuth();
  if (!token) return <Navigate to="/login" replace />;
  return (
    <>
      <AppHeader />
      <main id="main" className="container">
        <Outlet />
      </main>
    </>
  );
}

const NotFound = () => (
  <main id="main" className="container">
    <EmptyState
      title="Page not found"
      text="The page you are looking for does not exist or has moved."
      action={
        <Link className="btn btn-primary" to="/">
          Go to dashboard
        </Link>
      }
    />
  </main>
);

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <AuthProvider>
          <DataProvider>
            <Router>
              <a className="skip-link" href="#main" onClick={(e) => { e.preventDefault(); document.getElementById('main')?.focus(); }}>
                Skip to content
              </a>
              {IS_DEMO && <DemoBanner />}
              <Routes>
                <Route path="/login" element={<Page title="Sign in"><Login /></Page>} />
                <Route element={<Protected />}>
                  <Route path="/" element={<Page title="Dashboard"><Dashboard /></Page>} />
                  <Route path="/appointments" element={<Page title="Appointments"><Appointments /></Page>} />
                  <Route path="/patients" element={<Page title="Patients"><Patients /></Page>} />
                  <Route path="/patients/:id" element={<Page title="Patient"><PatientDetail /></Page>} />
                  <Route path="/doctors" element={<Page title="Doctors"><Doctors /></Page>} />
                  <Route path="/doctors/:id" element={<Page title="Doctor"><DoctorDetail /></Page>} />
                </Route>
                <Route path="*" element={<Page title="Not found"><NotFound /></Page>} />
              </Routes>
            </Router>
          </DataProvider>
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
