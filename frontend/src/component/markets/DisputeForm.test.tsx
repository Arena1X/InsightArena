import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import DisputeForm from "./DisputeForm";

const VALID_REASON = "This resolution does not match the publicly reported result.";

describe("DisputeForm", () => {
  it("keeps submit disabled until the reason reaches 20 characters", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(
      <DisputeForm
        marketId="m1"
        marketTitle="Test Market"
        submitting={false}
        submitError={null}
        submitSuccess={null}
        onSubmit={onSubmit}
      />,
    );

    const submitButton = screen.getByRole("button", { name: "Submit dispute" });
    expect(submitButton).toBeDisabled();

    await user.type(screen.getByPlaceholderText(/Explain why/), VALID_REASON);
    expect(submitButton).toBeEnabled();
  });

  it("submits the selected category alongside the reason and evidence links", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(
      <DisputeForm
        marketId="m1"
        marketTitle="Test Market"
        submitting={false}
        submitError={null}
        submitSuccess={null}
        onSubmit={onSubmit}
      />,
    );

    await user.selectOptions(
      screen.getByLabelText("Dispute reason category"),
      "manipulation",
    );
    await user.type(screen.getByPlaceholderText(/Explain why/), VALID_REASON);

    const evidenceInput = screen.getByPlaceholderText("https://example.com/proof");
    await user.type(evidenceInput, "https://example.com/proof.png");
    await user.click(screen.getByRole("button", { name: "Add" }));

    await user.click(screen.getByRole("button", { name: "Submit dispute" }));

    expect(onSubmit).toHaveBeenCalledWith({
      marketId: "m1",
      category: "manipulation",
      reason: VALID_REASON,
      evidenceLinks: ["https://example.com/proof.png"],
    });
  });

  it("rejects a non-http(s) evidence link locally, without adding it", async () => {
    const user = userEvent.setup();
    render(
      <DisputeForm
        marketId="m1"
        marketTitle="Test Market"
        submitting={false}
        submitError={null}
        submitSuccess={null}
        onSubmit={vi.fn()}
      />,
    );

    await user.type(
      screen.getByPlaceholderText("https://example.com/proof"),
      "not-a-url",
    );
    await user.click(screen.getByRole("button", { name: "Add" }));

    expect(screen.getByText("Evidence must be a valid URL.")).toBeInTheDocument();
    expect(screen.queryByText("not-a-url")).not.toBeInTheDocument();
  });

  it("disables the entire form and shows a notice once the dispute window has closed", () => {
    render(
      <DisputeForm
        marketId="m1"
        marketTitle="Test Market"
        submitting={false}
        submitError={null}
        submitSuccess={null}
        disputeWindowClosed
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByTestId("dispute-window-closed-notice")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Submit dispute" })).toBeDisabled();
    expect(screen.getByPlaceholderText(/Explain why/)).toBeDisabled();
    expect(
      screen.getByPlaceholderText("https://example.com/proof"),
    ).toBeDisabled();
  });

  it("blocks submission client-side if the window closes after the form opened", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(
      <DisputeForm
        marketId="m1"
        marketTitle="Test Market"
        submitting={false}
        submitError={null}
        submitSuccess={null}
        disputeWindowClosed={false}
        onSubmit={onSubmit}
      />,
    );

    await user.type(screen.getByPlaceholderText(/Explain why/), VALID_REASON);

    rerender(
      <DisputeForm
        marketId="m1"
        marketTitle="Test Market"
        submitting={false}
        submitError={null}
        submitSuccess={null}
        disputeWindowClosed
        onSubmit={onSubmit}
      />,
    );

    expect(screen.getByRole("button", { name: "Submit dispute" })).toBeDisabled();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("shows the submitting label and disables the button while submitting", () => {
    render(
      <DisputeForm
        marketId="m1"
        marketTitle="Test Market"
        submitting
        submitError={null}
        submitSuccess={null}
        onSubmit={vi.fn()}
      />,
    );

    const button = screen.getByRole("button", { name: "Submitting…" });
    expect(button).toBeDisabled();
  });

  it("surfaces a submitError from the parent hook", () => {
    render(
      <DisputeForm
        marketId="m1"
        marketTitle="Test Market"
        submitting={false}
        submitError="Market is not resolved yet."
        submitSuccess={null}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByText("Market is not resolved yet.")).toBeInTheDocument();
  });

  it("calls onCancel when Cancel is clicked", async () => {
    const onCancel = vi.fn();
    const user = userEvent.setup();
    render(
      <DisputeForm
        marketId="m1"
        marketTitle="Test Market"
        submitting={false}
        submitError={null}
        submitSuccess={null}
        onSubmit={vi.fn()}
        onCancel={onCancel}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
