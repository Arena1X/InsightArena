import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Standardized inline field error.
 * Renders nothing when `msg` is falsy — no layout shift.
 */
export function FieldError({
  msg,
  id,
  className,
}: {
  msg?: string;
  id?: string;
  className?: string;
}) {
  if (!msg) return null;
  return (
    <p
      id={id}
      role="alert"
      aria-live="polite"
      className={cn("mt-1 text-xs text-rose-400", className)}
    >
      {msg}
    </p>
  );
}

/**
 * Standardized form label.
 */
export function FormLabel({
  htmlFor,
  children,
  className,
}: {
  htmlFor: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className={cn("block text-sm font-medium text-slate-300", className)}
    >
      {children}
    </label>
  );
}

/**
 * Returns consistent input class names.
 * Pass `hasError=true` to apply error ring.
 */
export function inputCls(hasError = false) {
  return cn(
    "w-full rounded-2xl border bg-slate-950/90 px-4 py-3 text-sm text-white outline-none",
    "transition placeholder:text-slate-600",
    "focus:border-orange-400 focus:ring-2 focus:ring-orange-400/20",
    hasError
      ? "border-rose-500 focus:border-rose-500 focus:ring-rose-500/20 aria-invalid:border-rose-500"
      : "border-white/10",
  );
}
