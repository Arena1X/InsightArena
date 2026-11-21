import React from "react";
import { render, screen, fireEvent, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import OrderPreviewModal from "./OrderPreviewModal";
import { computeOrderPreview, FEE_RATE, SLIPPAGE_RATE } from "@/lib/orderPreview";

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function renderModal(overrides: Partial<React.ComponentProps<typeof OrderPreviewModal>> = {}) {
  const defaults: React.ComponentProps<typeof OrderPreviewModal> = {
    marketName: "Bitcoin",
    price: "$39,422.76",
    isOpen: true,
    initialStake: 100,
    odds: 2,
    onCancel: vi.fn(),
    onConfirm: vi.fn(),
  };
  return render(<OrderPreviewModal {...defaults} {...overrides} />);
}

// ---------------------------------------------------------------------------
// 1. Preview reflects the entered stake and fees
// ---------------------------------------------------------------------------

describe("OrderPreviewModal – preview reflects stake and fees", () => {
  it("displays the initial stake in the breakdown", () => {
    renderModal({ initialStake: 50, odds: 2 });

    const breakdown = screen.getByRole("region", { name: /order breakdown/i });
    expect(within(breakdown).getByText(/\$50\.00/)).toBeInTheDocument();
  });

  it("computes fee as 2% of stake", () => {
    const stake = 200;
    const preview = computeOrderPreview(stake, 1);
    expect(preview.fee).toBeCloseTo(stake * FEE_RATE);
  });

  it("computes slippage as 0.5% of stake", () => {
    const stake = 200;
    const preview = computeOrderPreview(stake, 1);
    expect(preview.slippage).toBeCloseTo(stake * SLIPPAGE_RATE);
  });

  it("computes expected payout as (stake − fee) × odds", () => {
    const stake = 100;
    const odds = 2;
    const preview = computeOrderPreview(stake, odds);
    const expectedPayout = (stake - stake * FEE_RATE) * odds;
    expect(preview.expectedPayout).toBeCloseTo(expectedPayout);
  });

  it("shows the expected payout in the breakdown section", () => {
    // stake=100, odds=2 → fee=2, netStake=98, payout=196
    renderModal({ initialStake: 100, odds: 2 });

    const breakdown = screen.getByRole("region", { name: /order breakdown/i });
    // $196.00 payout displayed
    expect(within(breakdown).getByText(/\$196\.00/)).toBeInTheDocument();
  });

  it("shows the fee line in the breakdown", () => {
    renderModal({ initialStake: 100, odds: 2 });

    const breakdown = screen.getByRole("region", { name: /order breakdown/i });
    // Fee label includes the percentage
    expect(within(breakdown).getByText(/platform fee/i)).toBeInTheDocument();
    // Fee value: − $2.00
    expect(within(breakdown).getByText(/\$2\.00/)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 2. Submitting requires confirmation
// ---------------------------------------------------------------------------

describe("OrderPreviewModal – submitting requires confirmation", () => {
  it("does not call onConfirm when the modal has just opened (before clicking confirm)", () => {
    const onConfirm = vi.fn();
    renderModal({ onConfirm });
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("calls onConfirm with the current stake when Confirm Trade is clicked", async () => {
    const onConfirm = vi.fn();
    renderModal({ initialStake: 50, odds: 1, onConfirm });

    await userEvent.click(screen.getByRole("button", { name: /confirm trade/i }));
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(onConfirm).toHaveBeenCalledWith(50);
  });

  it("calls onCancel when the Cancel button is clicked (trade not submitted)", async () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    renderModal({ onCancel, onConfirm });

    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("calls onCancel when the ✕ close button is clicked", async () => {
    const onCancel = vi.fn();
    renderModal({ onCancel });

    await userEvent.click(screen.getByRole("button", { name: /close order preview/i }));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("renders nothing when isOpen is false", () => {
    const { container } = renderModal({ isOpen: false });
    expect(container).toBeEmptyDOMElement();
  });
});

// ---------------------------------------------------------------------------
// 3. Changing inputs updates the preview
// ---------------------------------------------------------------------------

describe("OrderPreviewModal – changing inputs updates the preview", () => {
  it("updates the payout when the user changes the stake input", async () => {
    const user = userEvent.setup();
    renderModal({ initialStake: 100, odds: 2 });

    const input = screen.getByRole("spinbutton", { name: /stake amount/i });

    // Clear the input and type a new value
    await user.clear(input);
    await user.type(input, "200");

    // stake=200, odds=2 → fee=4, netStake=196, payout=392
    const breakdown = screen.getByRole("region", { name: /order breakdown/i });
    expect(within(breakdown).getByText(/\$392\.00/)).toBeInTheDocument();
  });

  it("updates the fee line when the stake changes", async () => {
    const user = userEvent.setup();
    renderModal({ initialStake: 100, odds: 1 });

    const input = screen.getByRole("spinbutton", { name: /stake amount/i });
    await user.clear(input);
    await user.type(input, "50");

    // fee for $50 stake = $1.00
    const breakdown = screen.getByRole("region", { name: /order breakdown/i });
    expect(within(breakdown).getByText(/\$1\.00/)).toBeInTheDocument();
  });

  it("passes the updated stake to onConfirm after editing", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    renderModal({ initialStake: 100, odds: 1, onConfirm });

    const input = screen.getByRole("spinbutton", { name: /stake amount/i });
    await user.clear(input);
    await user.type(input, "250");

    await user.click(screen.getByRole("button", { name: /confirm trade/i }));
    expect(onConfirm).toHaveBeenCalledWith(250);
  });
});
