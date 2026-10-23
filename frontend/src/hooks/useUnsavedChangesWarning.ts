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

    const handleLinkClick = (e: MouseEvent) => {
      if (
        !hasUnsavedChanges ||
        e.defaultPrevented ||
        e.button !== 0 ||
        e.metaKey ||
        e.ctrlKey ||
        e.shiftKey ||
        e.altKey ||
        !(e.target instanceof Element)
      ) {
        return;
      }

      const link = e.target.closest<HTMLAnchorElement>("a[href]");
      if (
        !link ||
        link.hasAttribute("download") ||
        (link.target && link.target !== "_self")
      ) {
        return;
      }

      const destination = new URL(link.href, window.location.href);
      if (
        destination.origin !== window.location.origin ||
        (destination.pathname === window.location.pathname &&
          destination.search === window.location.search)
      ) {
        return;
      }

      e.preventDefault();
      e.stopImmediatePropagation();
      if (window.confirm(message)) {
        router.push(
          `${destination.pathname}${destination.search}${destination.hash}`,
        );
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("click", handleLinkClick, true);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("click", handleLinkClick, true);
    };
  }, [hasUnsavedChanges, message, router]);

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
