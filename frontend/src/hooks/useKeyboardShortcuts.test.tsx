import { renderHook } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useKeyboardShortcuts } from "./useKeyboardShortcuts";

describe("useKeyboardShortcuts", () => {
  let mockAction1: ReturnType<typeof vi.fn>;
  let mockAction2: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockAction1 = vi.fn();
    mockAction2 = vi.fn();
  });

  it("should trigger shortcut action when key is pressed outside input", () => {
    const shortcuts = [
      {
        key: "t",
        description: "Test action",
        action: mockAction1,
      },
    ];

    renderHook(() => useKeyboardShortcuts({ shortcuts, enabled: true }));

    // Simulate key press on document body
    const event = new KeyboardEvent("keydown", { key: "t" });
    window.dispatchEvent(event);

    expect(mockAction1).toHaveBeenCalledTimes(1);
  });

  it("should suppress shortcuts while typing in input field", () => {
    const shortcuts = [
      {
        key: "t",
        description: "Test action",
        action: mockAction1,
      },
    ];

    renderHook(() => useKeyboardShortcuts({ shortcuts, enabled: true }));

    // Create an input element and set it as the event target
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();

    // Simulate key press in input field
    const event = new KeyboardEvent("keydown", {
      key: "t",
      bubbles: true,
    });
    Object.defineProperty(event, "target", { value: input, enumerable: true });
    window.dispatchEvent(event);

    expect(mockAction1).not.toHaveBeenCalled();

    document.body.removeChild(input);
  });

  it("should suppress shortcuts while typing in textarea", () => {
    const shortcuts = [
      {
        key: "s",
        description: "Save action",
        action: mockAction1,
      },
    ];

    renderHook(() => useKeyboardShortcuts({ shortcuts, enabled: true }));

    const textarea = document.createElement("textarea");
    document.body.appendChild(textarea);
    textarea.focus();

    const event = new KeyboardEvent("keydown", {
      key: "s",
      bubbles: true,
    });
    Object.defineProperty(event, "target", { value: textarea, enumerable: true });
    window.dispatchEvent(event);

    expect(mockAction1).not.toHaveBeenCalled();

    document.body.removeChild(textarea);
  });

  it("should suppress shortcuts in contenteditable elements", () => {
    const shortcuts = [
      {
        key: "b",
        description: "Bold action",
        action: mockAction1,
      },
    ];

    renderHook(() => useKeyboardShortcuts({ shortcuts, enabled: true }));

    const div = document.createElement("div");
    div.contentEditable = "true";
    document.body.appendChild(div);
    div.focus();

    const event = new KeyboardEvent("keydown", {
      key: "b",
      bubbles: true,
    });
    Object.defineProperty(event, "target", { value: div, enumerable: true });
    window.dispatchEvent(event);

    expect(mockAction1).not.toHaveBeenCalled();

    document.body.removeChild(div);
  });

  it("should handle shortcuts with modifiers", () => {
    const shortcuts = [
      {
        key: "s",
        description: "Save with Ctrl",
        action: mockAction1,
        modifiers: { ctrl: true },
      },
    ];

    renderHook(() => useKeyboardShortcuts({ shortcuts, enabled: true }));

    // Should not trigger without modifier
    let event = new KeyboardEvent("keydown", { key: "s" });
    window.dispatchEvent(event);
    expect(mockAction1).not.toHaveBeenCalled();

    // Should trigger with Ctrl
    event = new KeyboardEvent("keydown", { key: "s", ctrlKey: true });
    window.dispatchEvent(event);
    expect(mockAction1).toHaveBeenCalledTimes(1);
  });

  it("should handle multiple different shortcuts", () => {
    const shortcuts = [
      {
        key: "t",
        description: "Trade",
        action: mockAction1,
      },
      {
        key: "f",
        description: "Focus",
        action: mockAction2,
      },
    ];

    renderHook(() => useKeyboardShortcuts({ shortcuts, enabled: true }));

    let event = new KeyboardEvent("keydown", { key: "t" });
    window.dispatchEvent(event);
    expect(mockAction1).toHaveBeenCalledTimes(1);
    expect(mockAction2).not.toHaveBeenCalled();

    event = new KeyboardEvent("keydown", { key: "f" });
    window.dispatchEvent(event);
    expect(mockAction1).toHaveBeenCalledTimes(1);
    expect(mockAction2).toHaveBeenCalledTimes(1);
  });

  it("should not trigger shortcuts when disabled", () => {
    const shortcuts = [
      {
        key: "t",
        description: "Test action",
        action: mockAction1,
      },
    ];

    renderHook(() => useKeyboardShortcuts({ shortcuts, enabled: false }));

    const event = new KeyboardEvent("keydown", { key: "t" });
    window.dispatchEvent(event);

    expect(mockAction1).not.toHaveBeenCalled();
  });

  it("should handle case-insensitive key matching", () => {
    const shortcuts = [
      {
        key: "T",
        description: "Trade",
        action: mockAction1,
      },
    ];

    renderHook(() => useKeyboardShortcuts({ shortcuts, enabled: true }));

    const event = new KeyboardEvent("keydown", { key: "t" });
    window.dispatchEvent(event);

    expect(mockAction1).toHaveBeenCalledTimes(1);
  });

  it("should prevent default behavior when shortcut is triggered", () => {
    const shortcuts = [
      {
        key: "t",
        description: "Test action",
        action: mockAction1,
      },
    ];

    renderHook(() => useKeyboardShortcuts({ shortcuts, enabled: true }));

    const event = new KeyboardEvent("keydown", { key: "t" });
    const preventDefaultSpy = vi.spyOn(event, "preventDefault");
    window.dispatchEvent(event);

    expect(preventDefaultSpy).toHaveBeenCalled();
    expect(mockAction1).toHaveBeenCalledTimes(1);
  });

  it("should handle special keys like Escape", () => {
    const shortcuts = [
      {
        key: "Escape",
        description: "Close overlay",
        action: mockAction1,
      },
    ];

    renderHook(() => useKeyboardShortcuts({ shortcuts, enabled: true }));

    const event = new KeyboardEvent("keydown", { key: "Escape" });
    window.dispatchEvent(event);

    expect(mockAction1).toHaveBeenCalledTimes(1);
  });

  it("should clean up event listeners on unmount", () => {
    const shortcuts = [
      {
        key: "t",
        description: "Test action",
        action: mockAction1,
      },
    ];

    const { unmount } = renderHook(() =>
      useKeyboardShortcuts({ shortcuts, enabled: true })
    );

    unmount();

    const event = new KeyboardEvent("keydown", { key: "t" });
    window.dispatchEvent(event);

    expect(mockAction1).not.toHaveBeenCalled();
  });
});
