"use client";

import { createContext, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ToastViewport } from "@/component/ui/toast";

export type ToastVariant = "success" | "error" | "info";

export interface ToastOptions {
  title?: string;
  description: string;
  variant?: ToastVariant;
  /** Milliseconds before auto-dismiss. Pass 0 to disable auto-dismiss. */
  duration?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export interface ToastItem extends Required<Pick<ToastOptions, "description" | "variant" | "duration">> {
  id: string;
  title?: string;
  action?: ToastOptions["action"];
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
const MAX_TOASTS = 5;
const DEDUP_WINDOW_MS = 3000;

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
  const toastsRef = useRef<ToastItem[]>([]);
  const queueRef = useRef<ToastItem[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const recentMessages = useRef<Map<string, number>>(new Map());

  const clearTimer = useCallback((id: string) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  useEffect(() => {
    const activeTimers = timers;
    return () => {
      for (const timer of activeTimers.current.values()) {
        clearTimeout(timer);
      }
      activeTimers.current.clear();
    };
  }, []);

  const scheduleDismissRef = useRef<(id: string, duration: number) => void>(() => {});

  const dismiss = useCallback(
    (id: string) => {
      clearTimer(id);
      const wasVisible = toastsRef.current.some((toast) => toast.id === id);
      if (!wasVisible) {
        queueRef.current = queueRef.current.filter((toast) => toast.id !== id);
        return;
      }

      const next = toastsRef.current.filter((toast) => toast.id !== id);
      while (next.length < MAX_TOASTS && queueRef.current.length > 0) {
        const promoted = queueRef.current.shift()!;
        next.push(promoted);
        scheduleDismissRef.current(promoted.id, promoted.duration);
      }

      toastsRef.current = next;
      setToasts(next);
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

  scheduleDismissRef.current = scheduleDismiss;

  const show = useCallback(
    (options: ToastOptions) => {
      const variant = options.variant ?? "info";
      const description = options.description;
      const duration = options.duration ?? DEFAULT_DURATION;
      const now = Date.now();

      // Coalesce duplicate active toasts (visible or queued)
      const existingVisible = toastsRef.current.find(
        (toast) => toast.description === description && toast.variant === variant,
      );
      if (existingVisible) {
        recentMessages.current.set(description, now);
        scheduleDismiss(existingVisible.id, duration);
        return "";
      }

      const existingQueued = queueRef.current.find(
        (toast) => toast.description === description && toast.variant === variant,
      );
      if (existingQueued) {
        recentMessages.current.set(description, now);
        return "";
      }

      // Dedup: skip identical messages within the window
      const lastSeen = recentMessages.current.get(description);
      if (lastSeen && now - lastSeen < DEDUP_WINDOW_MS) {
        return "";
      }

      recentMessages.current.set(description, now);

      // Clean old dedup entries
      if (recentMessages.current.size > 50) {
        for (const [msg, ts] of recentMessages.current) {
          if (now - ts > DEDUP_WINDOW_MS) recentMessages.current.delete(msg);
        }
      }

      const id = generateId();
      const toast: ToastItem = {
        id,
        title: options.title,
        description,
        variant,
        duration,
        action: options.action,
      };

      // Cap visible toasts and queue the rest
      if (toastsRef.current.length >= MAX_TOASTS) {
        queueRef.current.push(toast);
        return id;
      }

      const next = [...toastsRef.current, toast];
      toastsRef.current = next;
      setToasts(next);

      scheduleDismiss(id, duration);
      return id;
    },
    [scheduleDismiss],
  );

  const pause = useCallback((id: string) => clearTimer(id), [clearTimer]);
  const resume = useCallback(
    (id: string) => {
      const toast = toastsRef.current.find((t) => t.id === id);
      if (toast) scheduleDismiss(id, toast.duration);
    },
    [scheduleDismiss],
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
