"use client";

import {
  Dialog,
  DialogBackdrop,
  DialogPanel,
  DialogTitle,
} from "@headlessui/react";
import { AlertTriangle } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

export type ConfirmVariant = "default" | "destructive";

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ConfirmVariant;
  /**
   * When provided the dialog renders a labelled textarea for capturing a
   * reason before confirming.  The confirm button is disabled until the user
   * types at least one non-whitespace character.
   */
  reasonLabel?: string;
  /** Placeholder text for the reason textarea. */
  reasonPlaceholder?: string;
  onConfirm: (reason?: string) => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "default",
  reasonLabel,
  reasonPlaceholder = "Enter a reason…",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const [reason, setReason] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Reset reason each time the dialog opens so old text doesn't bleed through.
  useEffect(() => {
    if (open) {
      setReason("");
    }
  }, [open]);

  // Auto-focus the textarea when it is shown.
  useEffect(() => {
    if (open && reasonLabel && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [open, reasonLabel]);

  const requiresReason = Boolean(reasonLabel);
  const reasonTrimmed = reason.trim();
  const confirmDisabled = requiresReason && reasonTrimmed.length === 0;

  function handleConfirm() {
    if (confirmDisabled) return;
    onConfirm(requiresReason ? reasonTrimmed : undefined);
  }

  return (
    <Dialog open={open} onClose={onCancel} transition className="relative z-[300]">
      <DialogBackdrop
        transition
        className="fixed inset-0 bg-black/60 backdrop-blur-sm duration-200 ease-out data-closed:opacity-0"
      />
      <div className="fixed inset-0 flex w-screen items-center justify-center p-4">
        <DialogPanel
          transition
          className={cn(
            "w-full max-w-md rounded-2xl border border-white/10 bg-[#111726] p-6 shadow-2xl",
            "duration-200 ease-out data-closed:scale-95 data-closed:opacity-0",
          )}
        >
          <div className="flex items-start gap-4">
            {variant === "destructive" && (
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-500/10">
                <AlertTriangle
                  className="h-5 w-5 text-red-400"
                  aria-hidden="true"
                />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <DialogTitle as="h2" className="text-lg font-semibold text-white">
                {title}
              </DialogTitle>
              {description && (
                <p className="mt-2 text-sm text-[#9aa4bc]">{description}</p>
              )}

              {/* Optional reason input */}
              {reasonLabel && (
                <div className="mt-4">
                  <label
                    htmlFor="confirm-dialog-reason"
                    className="block text-sm font-medium text-gray-300"
                  >
                    {reasonLabel}
                    <span className="ml-1 text-red-400" aria-hidden="true">
                      *
                    </span>
                  </label>
                  <textarea
                    id="confirm-dialog-reason"
                    ref={textareaRef}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder={reasonPlaceholder}
                    rows={3}
                    maxLength={500}
                    aria-required="true"
                    aria-describedby={
                      reasonTrimmed.length === 0
                        ? "confirm-dialog-reason-hint"
                        : undefined
                    }
                    className="mt-1.5 w-full resize-none rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-orange-500/50 focus:outline-none focus:ring-1 focus:ring-orange-500/30"
                  />
                  {reasonTrimmed.length === 0 && (
                    <p
                      id="confirm-dialog-reason-hint"
                      className="mt-1 text-xs text-gray-500"
                    >
                      A reason is required before confirming.
                    </p>
                  )}
                  <p className="mt-1 text-right text-xs text-gray-600">
                    {reason.length}/500
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-xl border border-white/10 bg-transparent px-4 py-2 text-sm font-medium text-white transition hover:bg-white/5"
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={confirmDisabled}
              autoFocus={!reasonLabel}
              aria-disabled={confirmDisabled}
              className={cn(
                "rounded-xl px-4 py-2 text-sm font-semibold transition",
                variant === "destructive"
                  ? "bg-red-500 text-white hover:bg-red-600 disabled:bg-red-500/40 disabled:cursor-not-allowed"
                  : "bg-[#4FD1C5] text-[#0a0f1a] hover:bg-[#43bfb4] disabled:bg-[#4FD1C5]/40 disabled:cursor-not-allowed",
              )}
            >
              {confirmLabel}
            </button>
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  );
}
