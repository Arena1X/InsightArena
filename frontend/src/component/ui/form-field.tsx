import { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";
import { AlertCircle } from "lucide-react";

interface FormFieldProps {
  label?: string;
  error?: string;
  touched?: boolean;
  required?: boolean;
  helperText?: string;
  children: ReactNode;
}

export function FormField({
  label,
  error,
  touched,
  required,
  helperText,
  children,
}: FormFieldProps) {
  const showError = touched && error;

  return (
    <div className="space-y-2">
      {label && (
        <label className="block text-sm font-medium text-slate-300">
          {label}
          {required && <span className="text-rose-400 ml-1">*</span>}
        </label>
      )}

      {children}

      {showError && (
        <div className="flex items-center gap-1.5 text-sm text-rose-400">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {!showError && helperText && (
        <p className="text-xs text-slate-500">{helperText}</p>
      )}
    </div>
  );
}

interface TextInputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: string;
  touched?: boolean;
}

export function TextInput({
  className,
  error,
  touched,
  ...props
}: TextInputProps) {
  const hasError = touched && error;

  return (
    <input
      className={`
        w-full rounded-xl border bg-slate-950/90 px-4 py-2.5 text-sm text-white
        outline-none transition-colors placeholder:text-slate-600
        ${
          hasError
            ? "border-rose-500/50 focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20"
            : "border-white/10 focus:border-orange-400 focus:ring-2 focus:ring-orange-400/20"
        }
        ${className || ""}
      `}
      aria-invalid={hasError ? "true" : "false"}
      aria-describedby={
        hasError ? `${props.id}-error` : props["aria-describedby"]
      }
      {...props}
    />
  );
}

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: string;
  touched?: boolean;
}

export function Textarea({
  className,
  error,
  touched,
  ...props
}: TextareaProps) {
  const hasError = touched && error;

  return (
    <textarea
      className={`
        w-full rounded-xl border bg-slate-950/90 px-4 py-2.5 text-sm text-white
        outline-none transition-colors placeholder:text-slate-600 resize-none
        ${
          hasError
            ? "border-rose-500/50 focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20"
            : "border-white/10 focus:border-orange-400 focus:ring-2 focus:ring-orange-400/20"
        }
        ${className || ""}
      `}
      aria-invalid={hasError ? "true" : "false"}
      aria-describedby={
        hasError ? `${props.id}-error` : props["aria-describedby"]
      }
      {...props}
    />
  );
}

interface SelectProps extends InputHTMLAttributes<HTMLSelectElement> {
  error?: string;
  touched?: boolean;
  options: Array<{ value: string; label: string }>;
}

export function Select({
  className,
  error,
  touched,
  options,
  ...props
}: SelectProps) {
  const hasError = touched && error;

  return (
    <select
      className={`
        w-full rounded-xl border bg-slate-950/90 px-4 py-2.5 text-sm text-white
        outline-none transition-colors appearance-none
        ${
          hasError
            ? "border-rose-500/50 focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20"
            : "border-white/10 focus:border-orange-400 focus:ring-2 focus:ring-orange-400/20"
        }
        ${className || ""}
      `}
      aria-invalid={hasError ? "true" : "false"}
      aria-describedby={
        hasError ? `${props.id}-error` : props["aria-describedby"]
      }
      {...props}
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}
