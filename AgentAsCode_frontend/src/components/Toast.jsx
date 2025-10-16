import React from 'react';

function Toast({ message, type = 'success', visible, onClose }) {
  if (!visible) return null;

  return (
    <div className={`toast ${type === 'error' ? 'toast-error' : 'toast-success'}`} role="status" aria-live="polite">
      <span className="toast-message">{message}</span>
      <button className="toast-close" onClick={onClose} aria-label="Close notification">×</button>
    </div>
  );
}

export default Toast;
