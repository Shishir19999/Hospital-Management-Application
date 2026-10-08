import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { useAuth } from './AuthContext';
import { errorMessage } from '../api/errors';

const DataContext = createContext(null);

// Patients and doctors are needed on almost every screen (pickers, names), so they load once per session.
function Loader({ children }) {
  const { token } = useAuth();
  const [data, setData] = useState({ patients: [], doctors: [] });
  const [state, setState] = useState('loading'); // loading | ready | error
  const [error, setError] = useState('');

  const fetchBoth = () => Promise.all([api.all('/patients'), api.all('/doctors')]).then(([patients, doctors]) => ({ patients, doctors }));

  const load = useCallback(async () => {
    try {
      setData(await fetchBoth());
      setState('ready');
      setError('');
    } catch (err) {
      setError(errorMessage(err));
      setState('error');
    }
  }, []);

  useEffect(() => {
    if (!token) return undefined;
    let live = true;
    fetchBoth().then(
      (r) => {
        if (live) {
          setData(r);
          setState('ready');
        }
      },
      (e) => {
        if (live) {
          setError(errorMessage(e));
          setState('error');
        }
      }
    );
    return () => {
      live = false;
    };
  }, [token]);

  const value = useMemo(
    () => ({
      ...data,
      state,
      error,
      reload: async () => {
        setState('loading');
        await load();
      },
      refresh: load,
      patientById: (id) => data.patients.find((p) => p._id === id),
      doctorById: (id) => data.doctors.find((d) => d._id === id),
    }),
    [data, state, error, load]
  );
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

// A fresh provider per session, so one user's data never shows up for the next.
export function DataProvider({ children }) {
  const { token } = useAuth();
  return <Loader key={token || 'anonymous'}>{children}</Loader>;
}

// eslint-disable-next-line react-refresh/only-export-components
export const useData = () => useContext(DataContext);
