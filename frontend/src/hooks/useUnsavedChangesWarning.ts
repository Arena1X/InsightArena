import { useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

/**
 * Hook to warn users before navigating away with unsaved changes.
 * Handles both browser navigation (beforeunload) and Next.js routing.
 *
 * @param hasUnsavedChanges - Boolean indicating if there are unsaved changes
 * @param message - Optional custom warning message
 */
export function useUnsavedChangesWarning(
  hasUnsavedChanges: boolean,
  message = "You have unsaved changes. Are you sure you want to leave?"
) {
  const router = useRouter();

  // Handle browser navigation (refresh, close tab, etc.)
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = message;
        return message;
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedChanges, message]);

  // Provide a method to navigate with confirmation
  const navigateWithConfirmation = useCallback(
    (url: string) => {
      if (hasUnsavedChanges) {
        const confirmed = window.confirm(message);
        if (confirmed) {
          router.push(url);
        }
        return confirmed;
      } else {
        router.push(url);
        return true;
      }
    },
    [hasUnsavedChanges, message, router]
  );

  return { navigateWithConfirmation };
}
