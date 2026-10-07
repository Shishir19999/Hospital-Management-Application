import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { useAuth } from './AuthContext';
import { errorMessage } from '../api/errors';

const DataContext = createContext(null);
const EMPTY = { patients: [], doctors: [], appointments: [] };

// Loads every collection once and exposes mutations that refresh afterwards.
function Loader({ children }) {
  const { token } = useAuth();
  const [data, setData] = useState(EMPTY);
  const [state, setState] = useState('loading'); // loading | ready | error
  const [error, setError] = useState('');

  const apply = useCallback((result) => {
    setData(result);
    setState('ready');
    setError('');
  }, []);
  const fail = useCallback((err) => {
    setError(errorMessage(err));
    setState('error');
  }, []);

  const fetchAll = () => Promise.all([api.patients.list(), api.doctors.list(), api.appointments.list()]).then(
    ([patients, doctors, appointments]) => ({ patients, doctors, appointments })
  );
  const load = useCallback(() => fetchAll().then(apply, fail), [apply, fail]);

  useEffect(() => {
    if (!token) return undefined;
    let live = true;
    fetchAll().then(
      (r) => live && apply(r),
      (e) => live && fail(e)
    );
    return () => {
      live = false;
    };
  }, [token, apply, fail]);

  // Run a mutation, then re-sync from the source of truth.
  const mutate = useCallback(
    async (fn) => {
      const result = await fn();
      await load();
      return result;
    },
    [load]
  );

  const value = useMemo(
    () => ({
      ...data,
      state,
      error,
      reload: async () => {
        setState('loading');
        await load();
      },
      mutate,
      patientById: (id) => data.patients.find((p) => p._id === id),
      doctorById: (id) => data.doctors.find((d) => d._id === id),
    }),
    [data, state, error, load, mutate]
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
