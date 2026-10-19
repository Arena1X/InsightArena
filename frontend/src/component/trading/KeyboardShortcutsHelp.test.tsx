import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import KeyboardShortcutsHelp from "./KeyboardShortcutsHelp";

describe("KeyboardShortcutsHelp", () => {
  const mockShortcuts = [
    {
      key: "t",
      description: "Trade first market",
    },
    {
      key: "f",
      description: "Focus search",
    },
    {
      key: "?",
      description: "Show help",
    },
    {
      key: "s",
      description: "Save with Ctrl",
      modifiers: { ctrl: true },
    },
    {
      key: "1",
      description: "Switch tab with Shift",
      modifiers: { shift: true },
    },
  ];

  it("should render help overlay when isOpen is true", () => {
    render(
      <KeyboardShortcutsHelp
        isOpen={true}
        onClose={vi.fn()}
        shortcuts={mockShortcuts}
      />
    );

    expect(screen.getByTestId("keyboard-shortcuts-overlay")).toBeInTheDocument();
    expect(screen.getByText("Keyboard Shortcuts")).toBeInTheDocument();
  });

  it("should not render when isOpen is false", () => {
    render(
      <KeyboardShortcutsHelp
        isOpen={false}
        onClose={vi.fn()}
        shortcuts={mockShortcuts}
      />
    );

    expect(screen.queryByTestId("keyboard-shortcuts-overlay")).not.toBeInTheDocument();
  });

  it("should list all available shortcuts", () => {
    render(
      <KeyboardShortcutsHelp
        isOpen={true}
        onClose={vi.fn()}
        shortcuts={mockShortcuts}
      />
    );

    expect(screen.getByText("Trade first market")).toBeInTheDocument();
    expect(screen.getByText("Focus search")).toBeInTheDocument();
    expect(screen.getByText("Show help")).toBeInTheDocument();
    expect(screen.getByText("Save with Ctrl")).toBeInTheDocument();
    expect(screen.getByText("Switch tab with Shift")).toBeInTheDocument();
  });

  it("should display correct shortcut keys", () => {
    render(
      <KeyboardShortcutsHelp
        isOpen={true}
        onClose={vi.fn()}
        shortcuts={mockShortcuts}
      />
    );

    const shortcutItems = screen.getAllByTestId("shortcut-item");
    expect(shortcutItems).toHaveLength(5);

    // Check that keys are displayed in uppercase within shortcut items
    const kbdElements = shortcutItems[0].querySelectorAll("kbd");
    expect(kbdElements[0].textContent).toBe("T");
    
    const kbdElements2 = shortcutItems[1].querySelectorAll("kbd");
    expect(kbdElements2[0].textContent).toBe("F");
    
    const kbdElements3 = shortcutItems[2].querySelectorAll("kbd");
    expect(kbdElements3[0].textContent).toBe("?");
  });

  it("should format shortcuts with modifiers correctly", () => {
    render(
      <KeyboardShortcutsHelp
        isOpen={true}
        onClose={vi.fn()}
        shortcuts={mockShortcuts}
      />
    );

    // Check for Ctrl + S
    expect(screen.getByText("Ctrl + S")).toBeInTheDocument();
    
    // Check for Shift + 1
    expect(screen.getByText("Shift + 1")).toBeInTheDocument();
  });

  it("should call onClose when close button is clicked", () => {
    const mockOnClose = vi.fn();
    render(
      <KeyboardShortcutsHelp
        isOpen={true}
        onClose={mockOnClose}
        shortcuts={mockShortcuts}
      />
    );

    const closeButton = screen.getByLabelText("Close keyboard shortcuts help");
    fireEvent.click(closeButton);

    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it("should call onClose when clicking outside the modal", () => {
    const mockOnClose = vi.fn();
    render(
      <KeyboardShortcutsHelp
        isOpen={true}
        onClose={mockOnClose}
        shortcuts={mockShortcuts}
      />
    );

    const overlay = screen.getByTestId("keyboard-shortcuts-overlay");
    fireEvent.click(overlay);

    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it("should not close when clicking inside the modal content", () => {
    const mockOnClose = vi.fn();
    render(
      <KeyboardShortcutsHelp
        isOpen={true}
        onClose={mockOnClose}
        shortcuts={mockShortcuts}
      />
    );

    const title = screen.getByText("Keyboard Shortcuts");
    fireEvent.click(title);

    expect(mockOnClose).not.toHaveBeenCalled();
  });

  it("should have proper accessibility attributes", () => {
    render(
      <KeyboardShortcutsHelp
        isOpen={true}
        onClose={vi.fn()}
        shortcuts={mockShortcuts}
      />
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("aria-labelledby", "shortcuts-title");

    const title = screen.getByText("Keyboard Shortcuts");
    expect(title).toHaveAttribute("id", "shortcuts-title");
  });

  it("should show tip about using ? key", () => {
    render(
      <KeyboardShortcutsHelp
        isOpen={true}
        onClose={vi.fn()}
        shortcuts={mockShortcuts}
      />
    );

    expect(screen.getByText(/Press/)).toBeInTheDocument();
    expect(screen.getByText(/anytime to view this help overlay/)).toBeInTheDocument();
  });

  it("should render empty shortcuts list gracefully", () => {
    render(
      <KeyboardShortcutsHelp
        isOpen={true}
        onClose={vi.fn()}
        shortcuts={[]}
      />
    );

    expect(screen.getByText("Keyboard Shortcuts")).toBeInTheDocument();
    expect(screen.queryAllByTestId("shortcut-item")).toHaveLength(0);
  });

  it("should format complex modifier combinations", () => {
    const complexShortcuts = [
      {
        key: "z",
        description: "Undo",
        modifiers: { ctrl: true, shift: true },
      },
      {
        key: "a",
        description: "Select all",
        modifiers: { ctrl: true, alt: true, shift: true },
      },
    ];

    render(
      <KeyboardShortcutsHelp
        isOpen={true}
        onClose={vi.fn()}
        shortcuts={complexShortcuts}
      />
    );

    expect(screen.getByText("Ctrl + Shift + Z")).toBeInTheDocument();
    expect(screen.getByText("Ctrl + Shift + Alt + A")).toBeInTheDocument();
  });
});
