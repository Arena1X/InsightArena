/**
 * Tests for useModalA11y
 *
 * Covers:
 *  - Focus moves into the modal on open (auto-focus)
 *  - Tab wraps from last focusable element back to first (focus trap)
 *  - Shift+Tab wraps from first focusable element back to last (focus trap)
 *  - Tab is blocked when the modal has no focusable children
 *  - Esc calls onClose
 *  - Focus is restored to the triggering element after the modal closes
 *  - scroll-lock class is added to <body> on open and removed on close
 *  - scroll-lock ref-count: a second modal opening does not remove the class
 *    when only the first one closes
 *  - titleId is a stable, non-empty string
 */

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useModalA11y } from "./useModalA11y";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal DOM structure that mimics a rendered modal. */
function buildModalDOM(focusableCount = 2): {
  container: HTMLDivElement;
  buttons: HTMLButtonElement[];
  triggerButton: HTMLButtonElement;
} {
  const container = document.createElement("div");
  const buttons: HTMLButtonElement[] = [];
  for (let i = 0; i < focusableCount; i++) {
    const btn = document.createElement("button");
    btn.textContent = `Button ${i + 1}`;
    container.appendChild(btn);
    buttons.push(btn);
  }
  document.body.appendChild(container);

  const triggerButton = document.createElement("button");
  triggerButton.textContent = "Open modal";
  document.body.appendChild(triggerButton);

  return { container, buttons, triggerButton };
}

/** Fire a keyboard event on document. */
function fireKey(key: string, shiftKey = false) {
  document.dispatchEvent(
    new KeyboardEvent("keydown", { key, shiftKey, bubbles: true, cancelable: true }),
  );
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe("useModalA11y", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Clean body between tests
    document.body.innerHTML = "";
    document.body.removeAttribute("data-modal-count");
    document.body.classList.remove("overflow-hidden");
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // -------------------------------------------------------------------------
  // titleId
  // -------------------------------------------------------------------------
  describe("titleId", () => {
    it("returns a non-empty string", () => {
      const { result } = renderHook(() =>
        useModalA11y({ isOpen: false, onClose: vi.fn() }),
      );
      expect(result.current.titleId).toBeTruthy();
      expect(typeof result.current.titleId).toBe("string");
    });

    it("is stable across re-renders", () => {
      const { result, rerender } = renderHook(
        ({ isOpen }: { isOpen: boolean }) =>
          useModalA11y({ isOpen, onClose: vi.fn() }),
        { initialProps: { isOpen: false } },
      );
      const first = result.current.titleId;
      rerender({ isOpen: true });
      expect(result.current.titleId).toBe(first);
    });
  });

  // -------------------------------------------------------------------------
  // Scroll lock
  // -------------------------------------------------------------------------
  describe("scroll lock", () => {
    it("adds overflow-hidden to <body> when modal opens", () => {
      renderHook(() => useModalA11y({ isOpen: true, onClose: vi.fn() }));
      expect(document.body.classList.contains("overflow-hidden")).toBe(true);
    });

    it("removes overflow-hidden from <body> when modal closes", () => {
      const { rerender } = renderHook(
        ({ isOpen }: { isOpen: boolean }) =>
          useModalA11y({ isOpen, onClose: vi.fn() }),
        { initialProps: { isOpen: true } },
      );
      expect(document.body.classList.contains("overflow-hidden")).toBe(true);
      rerender({ isOpen: false });
      expect(document.body.classList.contains("overflow-hidden")).toBe(false);
    });

    it("does not remove overflow-hidden while a second modal is still open", () => {
      // Open two modals.
      const { rerender: rerender1 } = renderHook(
        ({ isOpen }: { isOpen: boolean }) =>
          useModalA11y({ isOpen, onClose: vi.fn() }),
        { initialProps: { isOpen: true } },
      );
      renderHook(() => useModalA11y({ isOpen: true, onClose: vi.fn() }));

      // Close only the first modal.
      rerender1({ isOpen: false });

      // The second modal is still open, so the lock must remain.
      expect(document.body.classList.contains("overflow-hidden")).toBe(true);
    });

    it("removes overflow-hidden after both modals close", () => {
      const { rerender: r1 } = renderHook(
        ({ isOpen }: { isOpen: boolean }) =>
          useModalA11y({ isOpen, onClose: vi.fn() }),
        { initialProps: { isOpen: true } },
      );
      const { rerender: r2 } = renderHook(
        ({ isOpen }: { isOpen: boolean }) =>
          useModalA11y({ isOpen, onClose: vi.fn() }),
        { initialProps: { isOpen: true } },
      );

      r1({ isOpen: false });
      r2({ isOpen: false });

      expect(document.body.classList.contains("overflow-hidden")).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Auto-focus on open
  // -------------------------------------------------------------------------
  describe("auto-focus on open", () => {
    it("moves focus to the first focusable element inside the container", () => {
      const { container, buttons } = buildModalDOM(2);

      const { result } = renderHook(() =>
        useModalA11y({ isOpen: true, onClose: vi.fn() }),
      );

      // Wire the ref manually (simulates React attaching the ref).
      act(() => {
        (result.current.containerRef as React.MutableRefObject<HTMLDivElement>).current =
          container;
      });

      // Flush the setTimeout(0) inside the hook.
      act(() => {
        vi.runAllTimers();
      });

      expect(document.activeElement).toBe(buttons[0]);
    });

    it("focuses the container itself when it has no focusable children", () => {
      const container = document.createElement("div");
      document.body.appendChild(container);

      const { result } = renderHook(() =>
        useModalA11y({ isOpen: true, onClose: vi.fn() }),
      );

      act(() => {
        (result.current.containerRef as React.MutableRefObject<HTMLDivElement>).current =
          container;
      });

      act(() => {
        vi.runAllTimers();
      });

      expect(document.activeElement).toBe(container);
      // The hook should have added tabindex="-1" so the container is focusable.
      expect(container.getAttribute("tabindex")).toBe("-1");
    });
  });

  // -------------------------------------------------------------------------
  // Esc key
  // -------------------------------------------------------------------------
  describe("Esc key", () => {
    it("calls onClose when Escape is pressed while modal is open", () => {
      const onClose = vi.fn();
      renderHook(() => useModalA11y({ isOpen: true, onClose }));

      fireKey("Escape");

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("does not call onClose when modal is closed", () => {
      const onClose = vi.fn();
      renderHook(() => useModalA11y({ isOpen: false, onClose }));

      fireKey("Escape");

      expect(onClose).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Focus trap — Tab
  // -------------------------------------------------------------------------
  describe("focus trap — Tab", () => {
    it("wraps focus from the last focusable element to the first on Tab", () => {
      const { container, buttons } = buildModalDOM(3);

      const { result } = renderHook(() =>
        useModalA11y({ isOpen: true, onClose: vi.fn() }),
      );

      act(() => {
        (result.current.containerRef as React.MutableRefObject<HTMLDivElement>).current =
          container;
      });

      // Put focus on the last button.
      buttons[2].focus();
      expect(document.activeElement).toBe(buttons[2]);

      // Tab from the last element.
      fireKey("Tab");

      // Focus should have wrapped to the first button.
      expect(document.activeElement).toBe(buttons[0]);
    });

    it("does not interfere with Tab when focus is on an intermediate element", () => {
      const { container, buttons } = buildModalDOM(3);

      const { result } = renderHook(() =>
        useModalA11y({ isOpen: true, onClose: vi.fn() }),
      );

      act(() => {
        (result.current.containerRef as React.MutableRefObject<HTMLDivElement>).current =
          container;
      });

      // Focus is on the middle button — Tab should not be intercepted.
      buttons[1].focus();
      const event = new KeyboardEvent("keydown", {
        key: "Tab",
        bubbles: true,
        cancelable: true,
      });
      const preventSpy = vi.spyOn(event, "preventDefault");
      document.dispatchEvent(event);

      // preventDefault must NOT have been called for a mid-list Tab.
      expect(preventSpy).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Focus trap — Shift+Tab
  // -------------------------------------------------------------------------
  describe("focus trap — Shift+Tab", () => {
    it("wraps focus from the first focusable element to the last on Shift+Tab", () => {
      const { container, buttons } = buildModalDOM(3);

      const { result } = renderHook(() =>
        useModalA11y({ isOpen: true, onClose: vi.fn() }),
      );

      act(() => {
        (result.current.containerRef as React.MutableRefObject<HTMLDivElement>).current =
          container;
      });

      // Put focus on the first button.
      buttons[0].focus();
      expect(document.activeElement).toBe(buttons[0]);

      // Shift+Tab from the first element.
      fireKey("Tab", true);

      // Focus should have wrapped to the last button.
      expect(document.activeElement).toBe(buttons[2]);
    });
  });

  // -------------------------------------------------------------------------
  // Focus trap — no focusable children
  // -------------------------------------------------------------------------
  describe("focus trap — no focusable children", () => {
    it("prevents Tab from leaving the container when there are no focusable children", () => {
      const container = document.createElement("div");
      document.body.appendChild(container);

      const { result } = renderHook(() =>
        useModalA11y({ isOpen: true, onClose: vi.fn() }),
      );

      act(() => {
        (result.current.containerRef as React.MutableRefObject<HTMLDivElement>).current =
          container;
      });

      const event = new KeyboardEvent("keydown", {
        key: "Tab",
        bubbles: true,
        cancelable: true,
      });
      const preventSpy = vi.spyOn(event, "preventDefault");
      document.dispatchEvent(event);

      expect(preventSpy).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------------
  // Focus restoration
  // -------------------------------------------------------------------------
  describe("focus restoration", () => {
    it("restores focus to the triggering element after the modal closes", () => {
      const { triggerButton } = buildModalDOM(2);

      // Simulate the trigger button having focus before the modal opens.
      triggerButton.focus();
      expect(document.activeElement).toBe(triggerButton);

      const { rerender } = renderHook(
        ({ isOpen }: { isOpen: boolean }) =>
          useModalA11y({ isOpen, onClose: vi.fn() }),
        { initialProps: { isOpen: true } },
      );

      // Close the modal.
      rerender({ isOpen: false });

      // Flush the deferred focus restoration.
      act(() => {
        vi.runAllTimers();
      });

      expect(document.activeElement).toBe(triggerButton);
    });

    it("does not throw when the previous focus target no longer exists in the DOM", () => {
      const orphan = document.createElement("button");
      document.body.appendChild(orphan);
      orphan.focus();

      const { rerender } = renderHook(
        ({ isOpen }: { isOpen: boolean }) =>
          useModalA11y({ isOpen, onClose: vi.fn() }),
        { initialProps: { isOpen: true } },
      );

      // Remove the element before the modal closes.
      orphan.remove();

      expect(() => {
        rerender({ isOpen: false });
        act(() => {
          vi.runAllTimers();
        });
      }).not.toThrow();
    });
  });
});
