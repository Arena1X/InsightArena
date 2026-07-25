"use client";

import { createContext, useCallback, useMemo, useRef, useState } from "react";

import { ToastViewport } from "@/component/ui/toast";

export type ToastVariant = "success" | "error" | "info";

export interface ToastOptions {
  title?: string;
  description: string;
  variant?: ToastVariant;
  /** Milliseconds before auto-dismiss. Pass 0 to disable auto-dismiss. */
  duration?: number;
}

export interface ToastItem extends Required<Pick<ToastOptions, "description" | "variant" | "duration">> {
  id: string;
  title?: string;
}

export interface ToastContextValue {
  toasts: ToastItem[];
  show: (options: ToastOptions) => string;
  dismiss: (id: string) => void;
  success: (description: string, options?: Omit<ToastOptions, "description" | "variant">) => string;
  error: (description: string, options?: Omit<ToastOptions, "description" | "variant">) => string;
  info: (description: string, options?: Omit<ToastOptions, "description" | "variant">) => string;
}

export const ToastContext = createContext<ToastContextValue | null>(null);

const DEFAULT_DURATION = 5000;

let idCounter = 0;
function generateId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  idCounter += 1;
  return `toast-${idCounter}-${Date.now()}`;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const clearTimer = useCallback((id: string) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const dismiss = useCallback(
    (id: string) => {
      clearTimer(id);
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    },
    [clearTimer],
  );

  const scheduleDismiss = useCallback(
    (id: string, duration: number) => {
      clearTimer(id);
      if (duration <= 0) return;
      const timer = setTimeout(() => dismiss(id), duration);
      timers.current.set(id, timer);
    },
    [clearTimer, dismiss],
  );

  const show = useCallback(
    (options: ToastOptions) => {
      const id = generateId();
      const duration = options.duration ?? DEFAULT_DURATION;
      const toast: ToastItem = {
        id,
        title: options.title,
        description: options.description,
        variant: options.variant ?? "info",
        duration,
      };
      setToasts((prev) => [...prev, toast]);
      scheduleDismiss(id, duration);
      return id;
    },
    [scheduleDismiss],
  );

  const pause = useCallback((id: string) => clearTimer(id), [clearTimer]);
  const resume = useCallback(
    (id: string) => {
      const toast = toasts.find((t) => t.id === id);
      if (toast) scheduleDismiss(id, toast.duration);
    },
    [toasts, scheduleDismiss],
  );

  const success = useCallback<ToastContextValue["success"]>(
    (description, options) => show({ ...options, description, variant: "success" }),
    [show],
  );
  const error = useCallback<ToastContextValue["error"]>(
    (description, options) => show({ ...options, description, variant: "error" }),
    [show],
  );
  const info = useCallback<ToastContextValue["info"]>(
    (description, options) => show({ ...options, description, variant: "info" }),
    [show],
  );

  const value = useMemo<ToastContextValue>(
    () => ({ toasts, show, dismiss, success, error, info }),
    [toasts, show, dismiss, success, error, info],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} onPause={pause} onResume={resume} />
    </ToastContext.Provider>
  );
}
