import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RouteErrorState } from "./route-error-state";

describe("RouteErrorState", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("logs the route error and retries only the failed segment", () => {
    const error = Object.assign(new Error("Could not load"), {
      digest: "error-reference",
    });
    const reset = vi.fn();
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    render(
      <RouteErrorState
        error={error}
        reset={reset}
        routeLabel="Dashboard"
        description="Please retry."
        fullScreen={false}
      />,
    );

    expect(screen.getByText("Dashboard hit an unexpected problem")).toBeInTheDocument();
    expect(screen.getByText("Reference: error-reference")).toBeInTheDocument();
    expect(consoleError).toHaveBeenCalledWith(
      "[Route Error Boundary] Dashboard",
      expect.objectContaining({
        message: "Could not load",
        digest: "error-reference",
        error,
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: /try again/i }));

    expect(reset).toHaveBeenCalledTimes(1);
  });
});
