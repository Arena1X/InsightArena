"use client";

import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes, type SelectHTMLAttributes } from "react";

// ─── Shared helpers ───────────────────────────────────────────────────────────

function baseInputCls(hasError: boolean) {
  return [
    "w-full rounded-xl border bg-[#0f172a]/80 px-4 py-3 text-sm text-white",
    "placeholder-[#475569] outline-none transition",
    "focus:ring-2 focus:ring-[#4FD1C5]/60",
    hasError
      ? "border-red-500/60 focus:border-red-500/60"
      : "border-white/10 focus:border-[#4FD1C5]/40",
  ].join(" ");
}

// ─── FieldError ───────────────────────────────────────────────────────────────

interface FieldErrorProps {
  message?: string;
}

export function FieldError({ message }: FieldErrorProps) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="mt-1.5 flex items-center gap-1 text-xs text-red-400"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 20 20"
        fill="currentColor"
        className="h-3.5 w-3.5 shrink-0"
        aria-hidden="true"
      >
        <path
          fillRule="evenodd"
          d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-8-5a.75.75 0 0 1 .75.75v4.5a.75.75 0 0 1-1.5 0v-4.5A.75.75 0 0 1 10 5Zm0 10a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"
          clipRule="evenodd"
        />
      </svg>
      {message}
    </p>
  );
}

// ─── FieldSuccess ─────────────────────────────────────────────────────────────

interface FieldSuccessProps {
  message?: string;
}

export function FieldSuccess({ message }: FieldSuccessProps) {
  if (!message) return null;
  return (
    <p className="mt-1.5 flex items-center gap-1 text-xs text-emerald-400">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 20 20"
        fill="currentColor"
        className="h-3.5 w-3.5 shrink-0"
        aria-hidden="true"
      >
        <path
          fillRule="evenodd"
          d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.857-9.809a.75.75 0 0 0-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z"
          clipRule="evenodd"
        />
      </svg>
      {message}
    </p>
  );
}

// ─── FormLabel ────────────────────────────────────────────────────────────────

interface FormLabelProps {
  htmlFor: string;
  required?: boolean;
  children: React.ReactNode;
}

export function FormLabel({ htmlFor, required, children }: FormLabelProps) {
  return (
    <label
      htmlFor={htmlFor}
      className="mb-1.5 block text-sm font-medium text-[#cbd5e1]"
    >
      {children}
      {required && <span className="ml-0.5 text-red-400">*</span>}
    </label>
  );
}

// ─── FormInput ────────────────────────────────────────────────────────────────

interface FormInputProps extends InputHTMLAttributes<HTMLInputElement> {
  id: string;
  label: string;
  error?: string;
  success?: string;
  required?: boolean;
}

export const FormInput = forwardRef<HTMLInputElement, FormInputProps>(
  ({ id, label, error, success, required, className, ...props }, ref) => {
    return (
      <div>
        <FormLabel htmlFor={id} required={required}>
          {label}
        </FormLabel>
        <input
          id={id}
          ref={ref}
          aria-describedby={error ? `${id}-error` : undefined}
          aria-invalid={!!error}
          className={`${baseInputCls(!!error)} ${className ?? ""}`}
          {...props}
        />
        <FieldError message={error} />
        {!error && <FieldSuccess message={success} />}
      </div>
    );
  }
);
FormInput.displayName = "FormInput";

// ─── FormTextarea ─────────────────────────────────────────────────────────────

interface FormTextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  id: string;
  label: string;
  error?: string;
  required?: boolean;
}

export const FormTextarea = forwardRef<HTMLTextAreaElement, FormTextareaProps>(
  ({ id, label, error, required, className, ...props }, ref) => {
    return (
      <div>
        <FormLabel htmlFor={id} required={required}>
          {label}
        </FormLabel>
        <textarea
          id={id}
          ref={ref}
          aria-describedby={error ? `${id}-error` : undefined}
          aria-invalid={!!error}
          className={`${baseInputCls(!!error)} resize-none ${className ?? ""}`}
          {...props}
        />
        <FieldError message={error} />
      </div>
    );
  }
);
FormTextarea.displayName = "FormTextarea";

// ─── FormSelect ───────────────────────────────────────────────────────────────

interface FormSelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  id: string;
  label: string;
  error?: string;
  required?: boolean;
  options: readonly string[];
}

export const FormSelect = forwardRef<HTMLSelectElement, FormSelectProps>(
  ({ id, label, error, required, options, className, ...props }, ref) => {
    return (
      <div>
        <FormLabel htmlFor={id} required={required}>
          {label}
        </FormLabel>
        <select
          id={id}
          ref={ref}
          aria-describedby={error ? `${id}-error` : undefined}
          aria-invalid={!!error}
          className={`${baseInputCls(!!error)} ${className ?? ""}`}
          {...props}
        >
          {options.map((opt) => (
            <option key={opt} value={opt} className="bg-[#0f172a]">
              {opt}
            </option>
          ))}
        </select>
        <FieldError message={error} />
      </div>
    );
  }
);
FormSelect.displayName = "FormSelect";

// ─── SubmitButton ─────────────────────────────────────────────────────────────

interface SubmitButtonProps {
  loading?: boolean;
  label: string;
  loadingLabel?: string;
  className?: string;
}

export function SubmitButton({
  loading,
  label,
  loadingLabel = "Submitting…",
  className,
}: SubmitButtonProps) {
  return (
    <button
      type="submit"
      disabled={loading}
      className={`inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#4FD1C5] px-6 py-3 text-sm font-semibold text-[#0f172a] transition hover:bg-[#38b2ac] disabled:opacity-60 disabled:cursor-not-allowed ${className ?? ""}`}
    >
      {loading ? (
        <>
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#0f172a] border-t-transparent" />
          {loadingLabel}
        </>
      ) : (
        label
      )}
    </button>
  );
}

// ─── FormSuccess banner ───────────────────────────────────────────────────────

interface FormSuccessBannerProps {
  title: string;
  message: string;
  onReset: () => void;
  resetLabel?: string;
}

export function FormSuccessBanner({
  title,
  message,
  onReset,
  resetLabel = "Go back",
}: FormSuccessBannerProps) {
  return (
    <div
      role="status"
      className="flex flex-col items-center gap-4 rounded-2xl border border-[#4FD1C5]/20 bg-[#0b1220] px-6 py-12 text-center"
    >
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[#4FD1C5]/10">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-7 w-7 text-[#4FD1C5]"
        >
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
          <polyline points="22 4 12 14.01 9 11.01" />
        </svg>
      </span>
      <h2 className="text-xl font-semibold text-white">{title}</h2>
      <p className="max-w-sm text-[#94a3b8]">{message}</p>
      <button
        type="button"
        onClick={onReset}
        className="mt-2 rounded-xl bg-[#4FD1C5] px-6 py-2.5 text-sm font-semibold text-[#0f172a] transition hover:bg-[#38b2ac]"
      >
        {resetLabel}
      </button>
    </div>
  );
}

// ─── FormErrorBanner ─────────────────────────────────────────────────────────

interface FormErrorBannerProps {
  message?: string;
  onRetry: () => void;
}

export function FormErrorBanner({
  message = "Something went wrong. Please try again.",
  onRetry,
}: FormErrorBannerProps) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-4 rounded-2xl border border-red-500/20 bg-[#0b1220] px-6 py-12 text-center"
    >
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-red-500/10">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-7 w-7 text-red-400"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </span>
      <h2 className="text-xl font-semibold text-white">Submission Failed</h2>
      <p className="max-w-sm text-[#94a3b8]">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-2 rounded-xl bg-red-500/20 px-6 py-2.5 text-sm font-semibold text-red-300 transition hover:bg-red-500/30"
      >
        Try again
      </button>
    </div>
  );
}
