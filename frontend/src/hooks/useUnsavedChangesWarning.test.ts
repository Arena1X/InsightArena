import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useUnsavedChangesWarning } from "./useUnsavedChangesWarning";

// Mock next/navigation
const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

describe("useUnsavedChangesWarning", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPush.mockClear();
    vi.spyOn(window, "confirm");
  });

  it("prevents navigation when hasUnsavedChanges is true", () => {
    renderHook(() => useUnsavedChangesWarning(true));

    const event = new Event("beforeunload", { cancelable: true }) as BeforeUnloadEvent;
    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
  });

  it("allows navigation when hasUnsavedChanges is false", () => {
    renderHook(() => useUnsavedChangesWarning(false));

    const event = new Event("beforeunload", { cancelable: true }) as BeforeUnloadEvent;
    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
  });

  it("updates behavior when hasUnsavedChanges changes from false to true", () => {
    const { rerender } = renderHook(
      ({ hasChanges }) => useUnsavedChangesWarning(hasChanges),
      { initialProps: { hasChanges: false } }
    );

    // Initially no changes - should allow navigation
    let event = new Event("beforeunload", { cancelable: true }) as BeforeUnloadEvent;
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);

    // Update to have changes
    rerender({ hasChanges: true });

    // Now should prevent navigation
    event = new Event("beforeunload", { cancelable: true }) as BeforeUnloadEvent;
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it("updates behavior when hasUnsavedChanges changes from true to false", () => {
    const { rerender } = renderHook(
      ({ hasChanges }) => useUnsavedChangesWarning(hasChanges),
      { initialProps: { hasChanges: true } }
    );

    // Initially has changes - should prevent navigation
    let event = new Event("beforeunload", { cancelable: true }) as BeforeUnloadEvent;
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);

    // Update to no changes
    rerender({ hasChanges: false });

    // Now should allow navigation
    event = new Event("beforeunload", { cancelable: true }) as BeforeUnloadEvent;
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  it("navigateWithConfirmation shows confirmation when hasUnsavedChanges is true and user confirms", () => {
    (window.confirm as any).mockReturnValue(true);

    const { result } = renderHook(() => useUnsavedChangesWarning(true));

    const navigated = result.current.navigateWithConfirmation("/some-path");

    expect(window.confirm).toHaveBeenCalledWith(
      "You have unsaved changes. Are you sure you want to leave?"
    );
    expect(navigated).toBe(true);
    expect(mockPush).toHaveBeenCalledWith("/some-path");
  });

  it("navigateWithConfirmation shows confirmation when hasUnsavedChanges is true and user cancels", () => {
    (window.confirm as any).mockReturnValue(false);

    const { result } = renderHook(() => useUnsavedChangesWarning(true));

    const navigated = result.current.navigateWithConfirmation("/some-path");

    expect(window.confirm).toHaveBeenCalledWith(
      "You have unsaved changes. Are you sure you want to leave?"
    );
    expect(navigated).toBe(false);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("navigateWithConfirmation navigates without confirmation when hasUnsavedChanges is false", () => {
    const { result } = renderHook(() => useUnsavedChangesWarning(false));

    const navigated = result.current.navigateWithConfirmation("/some-path");

    expect(window.confirm).not.toHaveBeenCalled();
    expect(navigated).toBe(true);
    expect(mockPush).toHaveBeenCalledWith("/some-path");
  });

  it("uses custom message when provided", () => {
    (window.confirm as any).mockReturnValue(false);

    const customMessage = "Custom warning message!";
    const { result } = renderHook(() =>
      useUnsavedChangesWarning(true, customMessage)
    );

    result.current.navigateWithConfirmation("/some-path");

    expect(window.confirm).toHaveBeenCalledWith(customMessage);
  });

  it("cleans up event listener on unmount", () => {
    const addEventListenerSpy = vi.spyOn(window, "addEventListener");
    const removeEventListenerSpy = vi.spyOn(window, "removeEventListener");

    const { unmount } = renderHook(() => useUnsavedChangesWarning(true));

    expect(addEventListenerSpy).toHaveBeenCalledWith(
      "beforeunload",
      expect.any(Function)
    );

    unmount();

    expect(removeEventListenerSpy).toHaveBeenCalledWith(
      "beforeunload",
      expect.any(Function)
    );
  });
});
