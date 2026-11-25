"use client";

import { createContext, useCallback, useRef, useState } from "react";

import { ConfirmDialog, type ConfirmVariant } from "@/component/ui/confirm-dialog";

export interface ConfirmOptions {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ConfirmVariant;
  /** Optional async/sync handler executed before the dialog resolves and closes. */
  onConfirm?: () => void | Promise<void>;
}

export type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

export const ConfirmContext = createContext<ConfirmFn | null>(null);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [request, setRequest] = useState<ConfirmOptions | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const resolveRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((options) => {
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
      setIsPending(false);
      setError(null);
      setRequest(options);
    });
  }, []);

  const settle = useCallback((value: boolean) => {
    setIsPending(false);
    setError(null);
    resolveRef.current?.(value);
    resolveRef.current = null;
    setRequest(null);
  }, []);

  const handleConfirm = useCallback(async () => {
    if (isPending) return;
    if (!request?.onConfirm) {
      settle(true);
      return;
    }

    setIsPending(true);
    setError(null);
    try {
      await request.onConfirm();
      settle(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
      setIsPending(false);
    }
  }, [isPending, request, settle]);

  const handleCancel = useCallback(() => {
    if (isPending) return;
    settle(false);
  }, [isPending, settle]);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <ConfirmDialog
        open={request !== null}
        title={request?.title ?? ""}
        description={request?.description}
        confirmLabel={request?.confirmLabel}
        cancelLabel={request?.cancelLabel}
        variant={request?.variant}
        loading={isPending}
        error={error}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    </ConfirmContext.Provider>
  );
}
