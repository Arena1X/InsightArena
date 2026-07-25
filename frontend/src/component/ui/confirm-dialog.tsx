"use client";

import { Dialog, DialogBackdrop, DialogPanel, DialogTitle } from "@headlessui/react";
import { AlertTriangle } from "lucide-react";

import { cn } from "@/lib/utils";

export type ConfirmVariant = "default" | "destructive";

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ConfirmVariant;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "default",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
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
                <AlertTriangle className="h-5 w-5 text-red-400" aria-hidden="true" />
              </div>
            )}
            <div className="min-w-0">
              <DialogTitle as="h2" className="text-lg font-semibold text-white">
                {title}
              </DialogTitle>
              {description && (
                <p className="mt-2 text-sm text-[#9aa4bc]">{description}</p>
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
              onClick={onConfirm}
              autoFocus
              className={cn(
                "rounded-xl px-4 py-2 text-sm font-semibold transition",
                variant === "destructive"
                  ? "bg-red-500 text-white hover:bg-red-600"
                  : "bg-[#4FD1C5] text-[#0a0f1a] hover:bg-[#43bfb4]",
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
