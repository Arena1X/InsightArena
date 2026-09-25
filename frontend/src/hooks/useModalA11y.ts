/**
 * useModalA11y
 *
 * Shared accessibility hook for modal dialogs. Provides:
 *  - Focus trap: Tab/Shift+Tab cycles only through focusable elements inside
 *    the modal container.
 *  - Auto-focus: moves focus to the first focusable element (or the container
 *    itself as a fallback) when the modal opens.
 *  - Focus restoration: returns focus to whichever element triggered the modal
 *    when the modal closes.
 *  - Esc-to-close: pressing Escape calls onClose.
 *  - Scroll lock: adds `overflow-hidden` to <body> while the modal is open and
 *    removes it on cleanup (safe for concurrent modals via a ref-count on body).
 *
 * Usage:
 *   const { containerRef, titleId } = useModalA11y({ isOpen, onClose });
 *   <div ref={containerRef} role="dialog" aria-modal="true" aria-labelledby={titleId}>
 *     <h2 id={titleId}>My Modal</h2>
 *     …
 *   </div>
 */

import { useEffect, useId, useRef } from "react";

// ---------------------------------------------------------------------------
// Focusable element selector (standard list used by all major a11y libraries)
// ---------------------------------------------------------------------------
const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
  "details > summary",
  "audio[controls]",
  "video[controls]",
]
  .map((s) => `${s}:not([hidden]):not([aria-hidden='true'])`)
  .join(",");

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
}

// ---------------------------------------------------------------------------
// Scroll-lock helpers (reference-counted so nested modals work correctly)
// ---------------------------------------------------------------------------
const SCROLL_LOCK_CLASS = "overflow-hidden";
const SCROLL_LOCK_ATTR = "data-modal-count";

function lockScroll(): void {
  if (typeof document === "undefined") return;
  const body = document.body;
  const count = parseInt(body.getAttribute(SCROLL_LOCK_ATTR) ?? "0", 10);
  body.setAttribute(SCROLL_LOCK_ATTR, String(count + 1));
  body.classList.add(SCROLL_LOCK_CLASS);
}

function unlockScroll(): void {
  if (typeof document === "undefined") return;
  const body = document.body;
  const count = parseInt(body.getAttribute(SCROLL_LOCK_ATTR) ?? "1", 10);
  const next = count - 1;
  if (next <= 0) {
    body.removeAttribute(SCROLL_LOCK_ATTR);
    body.classList.remove(SCROLL_LOCK_CLASS);
  } else {
    body.setAttribute(SCROLL_LOCK_ATTR, String(next));
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface UseModalA11yOptions {
  /** Whether the modal is currently open. */
  isOpen: boolean;
  /** Callback to close the modal (called on Esc key). */
  onClose: () => void;
}

export interface UseModalA11yReturn {
  /**
   * Attach to the modal's root container element.
   * The hook uses this ref to query focusable children and set up the trap.
   */
  containerRef: React.RefObject<HTMLDivElement | null>;
  /**
   * A stable, unique id to use as the `id` of the modal's title element and
   * as the value of `aria-labelledby` on the container.
   */
  titleId: string;
}

export function useModalA11y({
  isOpen,
  onClose,
}: UseModalA11yOptions): UseModalA11yReturn {
  const containerRef = useRef<HTMLDivElement | null>(null);
  // Track which element had focus before the modal opened so we can restore it.
  const previousFocusRef = useRef<HTMLElement | null>(null);
  // Stable id for aria-labelledby wiring.
  const titleId = useId();

  useEffect(() => {
    if (!isOpen) return;

    // -----------------------------------------------------------------------
    // 1. Remember the element that currently has focus so we can restore it.
    // -----------------------------------------------------------------------
    previousFocusRef.current =
      (document.activeElement as HTMLElement | null) ?? null;

    // -----------------------------------------------------------------------
    // 2. Scroll lock
    // -----------------------------------------------------------------------
    lockScroll();

    // -----------------------------------------------------------------------
    // 3. Move focus into the modal on the next frame (so the DOM is painted).
    // -----------------------------------------------------------------------
    const autoFocusTimer = window.setTimeout(() => {
      const container = containerRef.current;
      if (!container) return;
      const focusable = getFocusableElements(container);
      if (focusable.length > 0) {
        focusable[0].focus();
      } else {
        // No interactive children — focus the container itself as a fallback
        // so keyboard users can still press Esc.
        if (!container.hasAttribute("tabindex")) {
          container.setAttribute("tabindex", "-1");
        }
        container.focus();
      }
    }, 0);

    // -----------------------------------------------------------------------
    // 4. Esc key handler
    // -----------------------------------------------------------------------
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== "Tab") return;

      const container = containerRef.current;
      if (!container) return;

      const focusable = getFocusableElements(container);
      if (focusable.length === 0) {
        // Nothing to cycle through — block Tab from leaving.
        event.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      // -------------------------------------------------------------------
      // 5. Focus trap: wrap around at boundaries.
      // -------------------------------------------------------------------
      if (event.shiftKey) {
        // Shift+Tab: if focus is on (or before) the first element, jump to last.
        if (
          document.activeElement === first ||
          !container.contains(document.activeElement)
        ) {
          event.preventDefault();
          last.focus();
        }
      } else {
        // Tab: if focus is on (or after) the last element, jump to first.
        if (
          document.activeElement === last ||
          !container.contains(document.activeElement)
        ) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      clearTimeout(autoFocusTimer);
      document.removeEventListener("keydown", handleKeyDown);

      // ---------------------------------------------------------------------
      // 6. Scroll unlock
      // ---------------------------------------------------------------------
      unlockScroll();

      // ---------------------------------------------------------------------
      // 7. Restore focus to the triggering element.
      // ---------------------------------------------------------------------
      const target = previousFocusRef.current;
      if (target && typeof target.focus === "function") {
        // Defer slightly so the modal's exit animation (if any) doesn't fight
        // with focus movement and so the focus event fires after the modal is
        // unmounted from the DOM.
        window.setTimeout(() => target.focus(), 0);
      }
    };
  }, [isOpen, onClose]);

  return { containerRef, titleId };
}
