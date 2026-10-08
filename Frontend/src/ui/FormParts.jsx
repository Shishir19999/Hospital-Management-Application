export function FormActions({ busy, onClose, label, cancelLabel = 'Cancel' }) {
  return (
    <div className="form-actions">
      <button type="button" className="btn btn-ghost" onClick={onClose}>
        {cancelLabel}
      </button>
      <button type="submit" className="btn btn-primary" disabled={busy}>
        {busy ? 'Saving...' : label}
      </button>
    </div>
  );
}

export const ServerError = ({ message }) =>
  message ? (
    <p className="form-error" role="alert">
      {message}
    </p>
  ) : null;
