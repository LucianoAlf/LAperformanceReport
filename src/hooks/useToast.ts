import { useState, useCallback } from 'react';
import type { Toast, ToastType } from '@/components/ui/toast';

let toastCounter = 0;

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((
    type: ToastType,
    title: string,
    description?: string,
    duration?: number
  ) => {
    const id = `toast-${++toastCounter}`;
    const newToast: Toast = {
      id,
      type,
      title,
      description,
      duration,
    };

    setToasts((prev) => [...prev, newToast]);
    return id;
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const success = useCallback(
    (title: string, description?: string, duration?: number) => {
      return addToast('success', title, description, duration);
    },
    [addToast]
  );

  const error = useCallback(
    (title: string, description?: string, duration?: number) => {
      return addToast('error', title, description, duration);
    },
    [addToast]
  );

  const warning = useCallback(
    (title: string, description?: string, duration?: number) => {
      return addToast('warning', title, description, duration);
    },
    [addToast]
  );

  const info = useCallback(
    (title: string, description?: string, duration?: number) => {
      return addToast('info', title, description, duration);
    },
    [addToast]
  );

  return {
    toasts,
    addToast,
    removeToast,
    success,
    error,
    warning,
    info,
  };
}
