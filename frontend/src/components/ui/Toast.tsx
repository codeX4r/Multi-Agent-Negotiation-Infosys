'use client';

import { useEffect } from 'react';
import { useUIStore } from '@/stores/ui-store';

export function ToastContainer() {
  const { toasts, dismissToast } = useUIStore();

  useEffect(() => {
    const timers = toasts.map(t =>
      t.duration && t.duration > 0 ? setTimeout(() => dismissToast(t.id), t.duration) : null
    );
    return () => timers.forEach(t => t && clearTimeout(t));
  }, [toasts, dismissToast]);

  if (toasts.length === 0) return null;

  return (
    <div className="toast-container" style={{ position: 'fixed', right: 22, bottom: 22, zIndex: 200, display: 'flex', flexDirection: 'column', gap: 8, pointerEvents: 'none' }}>
      {toasts.map(toast => (
        <div
          key={toast.id}
          className="toast show"
          style={{ pointerEvents: 'auto', maxWidth: 380 }}
          onClick={() => dismissToast(toast.id)}
        >
          {toast.message}
        </div>
      ))}
    </div>
  );
}