import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { errorMessage } from '../api/errors';

// Loads GET `path` with `params`; reload() refetches, `interval` (ms) polls while the tab is visible.
export function useFetch(path, params, { enabled = true, interval = 0, all = false } = {}) {
  const [state, setState] = useState({ data: null, error: '', loading: enabled });
  const key = JSON.stringify([path, params, all]);
  const alive = useRef(true);
  const seq = useRef(0);

  const run = useCallback(
    async (quiet) => {
      const my = ++seq.current;
      if (!quiet) setState((s) => ({ ...s, loading: true, error: '' }));
      try {
        const data = all ? await api.all(path, params) : await api.get(path, params);
        if (alive.current && my === seq.current) setState({ data, error: '', loading: false });
        return data;
      } catch (err) {
        if (alive.current && my === seq.current) setState((s) => ({ data: quiet ? s.data : null, error: errorMessage(err), loading: false }));
        return null;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key]
  );

  useEffect(() => {
    alive.current = true;
    if (enabled) run(false);
    else setState({ data: null, error: '', loading: false });
    return () => {
      alive.current = false;
    };
  }, [run, enabled]);

  useEffect(() => {
    if (!interval || !enabled) return undefined;
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') run(true);
    }, interval);
    return () => clearInterval(t);
  }, [interval, enabled, run]);

  const reload = useCallback(() => run(true), [run]);
  return { ...state, reload };
}
