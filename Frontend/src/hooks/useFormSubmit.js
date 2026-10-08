import { useState } from 'react';
import { errorMessage } from '../api/errors';

// Runs validation, shows inline + server errors, and calls onDone after a successful save.
export function useFormSubmit({ validate = () => ({}), save, onDone }) {
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e?.preventDefault();
    const errs = validate();
    setErrors(errs);
    setServerError('');
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      const result = await save();
      setBusy(false);
      onDone?.(result);
    } catch (err) {
      setServerError(errorMessage(err));
      setBusy(false);
    }
  };
  return { errors, serverError, busy, submit, setServerError };
}
