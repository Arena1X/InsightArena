import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import AdminFeesPage from "./page";

describe("AdminFeesPage", () => {
  beforeEach(() => {
    vi.stubGlobal("alert", vi.fn());
  });

  it("recomputes the sample trade preview when a fee changes", async () => {
    const user = userEvent.setup();
    render(<AdminFeesPage />);

    expect(screen.getByTestId("preview-total-fees")).toHaveTextContent("$3.70");
    expect(screen.getByTestId("preview-net-stake")).toHaveTextContent("$96.30");

    const platformInput = screen.getByLabelText("Platform fee percentage");
    await user.clear(platformInput);
    await user.type(platformInput, "4");

    expect(screen.getByTestId("preview-platform-fee")).toHaveTextContent("$4.00");
    expect(screen.getByTestId("preview-total-fees")).toHaveTextContent("$5.20");
    expect(screen.getByTestId("preview-net-stake")).toHaveTextContent("$94.80");
  });

  it("blocks saving when the platform fee exceeds 500 bps", async () => {
    const user = userEvent.setup();
    render(<AdminFeesPage />);

    const platformInput = screen.getByLabelText("Platform fee percentage");
    await user.clear(platformInput);
    await user.type(platformInput, "5.1");

    expect(screen.getByRole("alert")).toHaveTextContent("500 bps");
    expect(screen.getByRole("button", { name: "Save fee schedule" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Save fee schedule" }));
    expect(vi.mocked(alert)).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
