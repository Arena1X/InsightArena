import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { OptimisticPredictionIndicator } from "./OptimisticPredictionIndicator";

describe("OptimisticPredictionIndicator", () => {
  it("announces a rollback and exposes a keyboard-operable retry", () => {
    const retry = vi.fn();
    render(
      <OptimisticPredictionIndicator
        status="failed"
        amount={25}
        direction="no"
        error="Rejected on-chain"
        onRetry={retry}
      />,
    );

    expect(screen.getByRole("alert")).toHaveAttribute("aria-live", "assertive");
    expect(screen.getByText("Rejected on-chain")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(retry).toHaveBeenCalledOnce();
  });
});
