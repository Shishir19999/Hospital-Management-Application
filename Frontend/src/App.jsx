import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, HashRouter, Link, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { IS_DEMO } from './api';
import { AuthProvider, useAuth } from './context/AuthContext';
import { DataProvider } from './context/DataContext';
import { ThemeProvider } from './context/ThemeContext';
import { ToastProvider } from './context/ToastContext';
import { can, ROLE_LABELS } from './lib/permissions';
import Login from './pages/Login';
import { EmptyState, SkeletonList } from './ui/Common';
import { AppShell, DemoBanner } from './ui/Shell';
import './styles.css';
import './hospital.css';

const Appointments = lazy(() => import('./pages/Appointments'));
const Audit = lazy(() => import('./pages/Audit'));
const Billing = lazy(() => import('./pages/Billing'));
const DoctorDetail = lazy(() => import('./pages/DoctorDetail'));
const Doctors = lazy(() => import('./pages/Doctors'));
const Home = lazy(() => import('./pages/Home'));
const InvoiceDetail = lazy(() => import('./pages/InvoiceDetail'));
const Labs = lazy(() => import('./pages/Labs'));
const Notifications = lazy(() => import('./pages/Notifications'));
const PatientDetail = lazy(() => import('./pages/PatientDetail'));
const Patients = lazy(() => import('./pages/Patients'));
const Pharmacy = lazy(() => import('./pages/Pharmacy'));
const Queue = lazy(() => import('./pages/Queue'));
const QueueDisplay = lazy(() => import('./pages/QueueDisplay'));
const Reports = lazy(() => import('./pages/Reports'));
const Staff = lazy(() => import('./pages/Staff'));
const Stock = lazy(() => import('./pages/Stock'));
const VisitDetail = lazy(() => import('./pages/VisitDetail'));
const Visits = lazy(() => import('./pages/Visits'));
const Wards = lazy(() => import('./pages/Wards'));

// HashRouter keeps deep links working on static hosting under a sub-path.
const Router = IS_DEMO ? HashRouter : BrowserRouter;

function Page({ title, perm, children }) {
  const { pathname } = useLocation();
  const { role } = useAuth();
  useEffect(() => {
    document.title = `${title} | MediCare HMS`;
    window.scrollTo(0, 0);
  }, [title, pathname]);
  if (perm && !can(role, perm)) {
    return (
      <EmptyState
        title="You do not have access to this page"
        text={`Your ${ROLE_LABELS[role] || role} role cannot open ${title.toLowerCase()}. Ask an administrator if you think this is a mistake.`}
        action={<Link className="btn btn-primary" to="/">Back to my home</Link>}
      />
    );
  }
  return children;
}

function RequireAuth() {
  const { token } = useAuth();
  const { pathname } = useLocation();
  if (!token) return <Navigate to="/login" replace state={{ from: pathname }} />;
  return <Outlet />;
}

const NotFound = () => (
  <EmptyState
    title="Page not found"
    text="The page you are looking for does not exist or has moved."
    action={<Link className="btn btn-primary" to="/">Go to my home</Link>}
  />
);

const route = (title, element, perm) => (
  <Page title={title} perm={perm}>
    <Suspense fallback={<SkeletonList rows={5} label="Loading page" />}>{element}</Suspense>
  </Page>
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
                <Route element={<RequireAuth />}>
                  <Route path="/display" element={route('Queue board', <QueueDisplay />, 'queue.read')} />
                  <Route element={<AppShell />}>
                    <Route path="/" element={route('Home', <Home />)} />
                    <Route path="/appointments" element={route('Appointments', <Appointments />, 'appointments.read')} />
                    <Route path="/patients" element={route('Patients', <Patients />, 'patients.read')} />
                    <Route path="/patients/:id" element={route('Patient', <PatientDetail />, 'patients.read')} />
                    <Route path="/doctors" element={route('Doctors', <Doctors />, 'doctors.read')} />
                    <Route path="/doctors/:id" element={route('Doctor', <DoctorDetail />, 'doctors.read')} />
                    <Route path="/queue" element={route('Queue', <Queue />, 'queue.read')} />
                    <Route path="/visits" element={route('Visits', <Visits />, 'visits.read')} />
                    <Route path="/visits/:id" element={route('Visit', <VisitDetail />, 'visits.read')} />
                    <Route path="/pharmacy" element={route('Dispensing', <Pharmacy />, 'prescriptions.read')} />
                    <Route path="/pharmacy/stock" element={route('Stock', <Stock />, 'inventory.read')} />
                    <Route path="/labs" element={route('Laboratory', <Labs />, 'labs.read')} />
                    <Route path="/billing" element={route('Billing', <Billing />, 'billing.read')} />
                    <Route path="/billing/:id" element={route('Invoice', <InvoiceDetail />, 'billing.read')} />
                    <Route path="/wards" element={route('Wards and beds', <Wards />, 'wards.read')} />
                    <Route path="/reports" element={route('Reports', <Reports />, 'reports.read')} />
                    <Route path="/audit" element={route('Audit log', <Audit />, 'audit.read')} />
                    <Route path="/staff" element={route('Staff', <Staff />, 'users.manage')} />
                    <Route path="/notifications" element={route('Notifications', <Notifications />, 'notifications.read')} />
                    <Route path="*" element={route('Not found', <NotFound />)} />
                  </Route>
                </Route>
                <Route path="*" element={<Navigate to="/login" replace />} />
              </Routes>
            </Router>
          </DataProvider>
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
