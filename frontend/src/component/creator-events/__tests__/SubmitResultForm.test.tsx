import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SubmitResultForm from "../SubmitResultForm";

describe("SubmitResultForm", () => {
  it("treats a non-numeric score as empty (required), matching a number input's own input filtering", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(
      <SubmitResultForm teamA="Team A" teamB="Team B" onSubmit={onSubmit} onCancel={vi.fn()} />,
    );

    // A type="number" input filters out non-numeric characters as they're
    // typed, so "abc" never actually lands in the field -- it stays empty.
    await user.type(screen.getByLabelText("Team A Score"), "abc");
    await user.type(screen.getByLabelText("Team B Score"), "2");
    await user.click(screen.getByRole("button", { name: /review result/i }));

    expect(screen.getByText("Team A score is required.")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("blocks submission for a score outside 0-20", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(
      <SubmitResultForm teamA="Team A" teamB="Team B" onSubmit={onSubmit} onCancel={vi.fn()} />,
    );

    await user.type(screen.getByLabelText("Team A Score"), "21");
    await user.type(screen.getByLabelText("Team B Score"), "1");
    await user.click(screen.getByRole("button", { name: /review result/i }));

    expect(screen.getByText(/score must be an integer between 0 and 20/i)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("requires both scores to be filled in", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(
      <SubmitResultForm teamA="Team A" teamB="Team B" onSubmit={onSubmit} onCancel={vi.fn()} />,
    );

    await user.click(screen.getByRole("button", { name: /review result/i }));

    expect(screen.getByText("Team A score is required.")).toBeInTheDocument();
    expect(screen.getByText("Team B score is required.")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("shows a confirmation summary before calling onSubmit, and does not call it until confirmed", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(
      <SubmitResultForm teamA="Team A" teamB="Team B" onSubmit={onSubmit} onCancel={vi.fn()} />,
    );

    await user.type(screen.getByLabelText("Team A Score"), "3");
    await user.type(screen.getByLabelText("Team B Score"), "1");
    await user.click(screen.getByRole("button", { name: /review result/i }));

    // Confirmation step: the summary is shown, but onSubmit has not fired yet.
    expect(screen.getByText("Confirm Result")).toBeInTheDocument();
    expect(screen.getByText("Team A 3 – 1 Team B")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /confirm & submit/i }));

    expect(onSubmit).toHaveBeenCalledWith(3, 1);
  });

  it("returns to the editable form from the confirmation step via Back, without submitting", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(
      <SubmitResultForm teamA="Team A" teamB="Team B" onSubmit={onSubmit} onCancel={vi.fn()} />,
    );

    await user.type(screen.getByLabelText("Team A Score"), "3");
    await user.type(screen.getByLabelText("Team B Score"), "1");
    await user.click(screen.getByRole("button", { name: /review result/i }));
    await user.click(screen.getByRole("button", { name: /back/i }));

    expect(screen.getByLabelText("Team A Score")).toHaveValue(3);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("renders a read-only finalized view and does not accept a new submission when isFinalized is true", () => {
    const onSubmit = vi.fn();
    render(
      <SubmitResultForm
        teamA="Team A"
        teamB="Team B"
        initialResult="2-1"
        isFinalized
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByText("Match Result Finalized")).toBeInTheDocument();
    expect(screen.getByText(/2.*1/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Team A Score")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /review result/i })).not.toBeInTheDocument();
  });

  it("calls onCancel from the finalized view's Close button", async () => {
    const onCancel = vi.fn();
    const user = userEvent.setup();
    render(
      <SubmitResultForm
        teamA="Team A"
        teamB="Team B"
        initialResult="2-1"
        isFinalized
        onSubmit={vi.fn()}
        onCancel={onCancel}
      />,
    );

    await user.click(screen.getByRole("button", { name: /close/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
