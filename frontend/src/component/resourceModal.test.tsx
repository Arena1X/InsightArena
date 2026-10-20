/**
 * Smoke tests for ResourcesModal (resourceModal.tsx)
 *
 * Mirrors the structure of courseModal.test.tsx — confirms ARIA wiring and
 * the a11y behaviours provided by useModalA11y are correctly plumbed in.
 *
 * Covered:
 *  - Nothing renders when open=false
 *  - role="dialog", aria-modal="true", and aria-labelledby are present when open
 *  - aria-labelledby points to the visible heading text
 *  - Close button is present and keyboard-accessible
 *  - Pressing Esc calls onClose
 *  - Clicking the backdrop calls onClose
 *  - Clicking the close button calls onClose
 *  - Body scroll is locked while open and unlocked on close
 */

import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import ResourcesModal from "./resourceModal";

describe("ResourcesModal", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = "";
    document.body.removeAttribute("data-modal-count");
    document.body.classList.remove("overflow-hidden");
  });

  it("renders nothing when open is false", () => {
    render(<ResourcesModal open={false} onClose={vi.fn()} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders the dialog when open is true", () => {
    render(<ResourcesModal open={true} onClose={vi.fn()} />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("has aria-modal='true' on the dialog element", () => {
    render(<ResourcesModal open={true} onClose={vi.fn()} />);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
  });

  it("has aria-labelledby pointing to the heading", () => {
    render(<ResourcesModal open={true} onClose={vi.fn()} />);
    const dialog = screen.getByRole("dialog");
    const labelledById = dialog.getAttribute("aria-labelledby");
    expect(labelledById).toBeTruthy();

    const heading = document.getElementById(labelledById!);
    expect(heading).not.toBeNull();
    expect(heading!.textContent).toMatch(/Learning Resources/i);
  });

  it("has an accessible close button", () => {
    render(<ResourcesModal open={true} onClose={vi.fn()} />);
    const closeBtn = screen.getByRole("button", { name: /close learning resources menu/i });
    expect(closeBtn).toBeInTheDocument();
  });

  it("calls onClose when the close button is clicked", () => {
    const onClose = vi.fn();
    render(<ResourcesModal open={true} onClose={onClose} />);
    const closeBtn = screen.getByRole("button", { name: /close learning resources menu/i });
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when Escape is pressed", () => {
    const onClose = vi.fn();
    render(<ResourcesModal open={true} onClose={onClose} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when the backdrop is clicked", () => {
    const onClose = vi.fn();
    const { container } = render(<ResourcesModal open={true} onClose={onClose} />);
    const backdrop = container.querySelector(".fixed.inset-0.z-40") as HTMLElement;
    expect(backdrop).not.toBeNull();
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("locks body scroll while open and unlocks on close", () => {
    const { rerender } = render(<ResourcesModal open={true} onClose={vi.fn()} />);
    expect(document.body.classList.contains("overflow-hidden")).toBe(true);

    rerender(<ResourcesModal open={false} onClose={vi.fn()} />);
    expect(document.body.classList.contains("overflow-hidden")).toBe(false);
  });
});
