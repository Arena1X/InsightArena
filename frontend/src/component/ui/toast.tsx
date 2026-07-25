"use client";

import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, Info, X, XCircle } from "lucide-react";

import type { ToastItem, ToastVariant } from "@/context/ToastContext";
import { cn } from "@/lib/utils";

const VARIANT_STYLES: Record<
  ToastVariant,
  { icon: React.ComponentType<{ className?: string }>; classes: string; iconClasses: string }
> = {
  success: {
    icon: CheckCircle2,
    classes:
      "border-emerald-300 bg-white text-emerald-900 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-100",
    iconClasses: "text-emerald-600 dark:text-emerald-400",
  },
  error: {
    icon: XCircle,
    classes:
      "border-red-300 bg-white text-red-900 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-100",
    iconClasses: "text-red-600 dark:text-red-400",
  },
  info: {
    icon: Info,
    classes:
      "border-sky-300 bg-white text-sky-900 dark:border-[#4FD1C5]/40 dark:bg-[#4FD1C5]/10 dark:text-[#e6fffb]",
    iconClasses: "text-sky-600 dark:text-[#4FD1C5]",
  },
};

interface ToastViewportProps {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
}

export function ToastViewport({ toasts, onDismiss, onPause, onResume }: ToastViewportProps) {
  return (
    <div
      className="pointer-events-none fixed bottom-4 right-4 z-[200] flex w-full max-w-sm flex-col gap-2 sm:bottom-6 sm:right-6"
      role="region"
      aria-label="Notifications"
    >
      <AnimatePresence initial={false}>
        {toasts.map((toast) => (
          <ToastCard
            key={toast.id}
            toast={toast}
            onDismiss={() => onDismiss(toast.id)}
            onPause={() => onPause(toast.id)}
            onResume={() => onResume(toast.id)}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}

function ToastCard({
  toast,
  onDismiss,
  onPause,
  onResume,
}: {
  toast: ToastItem;
  onDismiss: () => void;
  onPause: () => void;
  onResume: () => void;
}) {
  const { icon: Icon, classes, iconClasses } = VARIANT_STYLES[toast.variant];

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, x: 32, transition: { duration: 0.15 } }}
      transition={{ type: "spring", stiffness: 400, damping: 32 }}
      role={toast.variant === "error" ? "alert" : "status"}
      aria-live={toast.variant === "error" ? "assertive" : "polite"}
      aria-atomic="true"
      onMouseEnter={onPause}
      onMouseLeave={onResume}
      className={cn(
        "pointer-events-auto flex w-full items-start gap-3 rounded-xl border p-4 shadow-lg backdrop-blur-sm",
        classes,
      )}
    >
      <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", iconClasses)} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        {toast.title && <p className="text-sm font-semibold">{toast.title}</p>}
        <p className="text-sm leading-snug break-words opacity-90">{toast.description}</p>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss notification"
        className="shrink-0 rounded-md p-1 opacity-60 transition hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current"
      >
        <X className="h-4 w-4" />
      </button>
    </motion.div>
  );
}
