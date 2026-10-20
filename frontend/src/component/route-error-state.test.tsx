import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RouteErrorState, buildErrorReportUrl } from "./route-error-state";

const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, push: vi.fn() }),
}));

function renderState(error: Error & { digest?: string; status?: number }, reset = vi.fn()) {
  render(
    <RouteErrorState
      error={error}
      reset={reset}
      routeLabel="Dashboard"
      description="Please retry."
      fullScreen={false}
    />,
  );
  return reset;
}

describe("RouteErrorState", () => {
  beforeEach(() => {
    refresh.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("logs the route error and shows the digest reference", () => {
    const error = Object.assign(new Error("Could not load"), {
      digest: "error-reference",
    });
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    renderState(error);

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
  });

  it("retry re-invokes the route loader and resets the boundary without a full reload", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const reload = vi.fn();
    const originalLocation = window.location;
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...originalLocation, reload },
    });

    const reset = renderState(Object.assign(new Error("boom"), { digest: "abc" }));

    fireEvent.click(screen.getByRole("button", { name: /try again/i }));

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(reset).toHaveBeenCalledTimes(1);
    expect(reload).not.toHaveBeenCalled();

    Object.defineProperty(window, "location", { configurable: true, value: originalLocation });
  });

  it("report link includes the error digest", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    renderState(Object.assign(new Error("boom"), { digest: "digest-1234" }));

    const link = screen.getByRole("link", { name: /report issue/i });
    const href = link.getAttribute("href") ?? "";
    const params = new URL(href).searchParams;

    expect(href.startsWith("https://github.com/Arena1X/InsightArena/issues/new?")).toBe(true);
    expect(params.get("title")).toContain("digest-1234");
    expect(params.get("body")).toContain("**Error digest:** digest-1234");
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("marks the digest as unavailable when the error has none", () => {
    const url = new URL(buildErrorReportUrl({ routeLabel: "Wallet", error: new Error("x") }));
    expect(url.searchParams.get("body")).toContain("**Error digest:** unavailable");
  });

  it("renders the not-found state for Next notFound() errors instead of the runtime error", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    renderState(Object.assign(new Error("NEXT_HTTP_ERROR_FALLBACK;404"), {
      digest: "NEXT_HTTP_ERROR_FALLBACK;404",
    }));

    expect(screen.getByText("Page Not Found")).toBeInTheDocument();
    expect(screen.queryByText(/hit an unexpected problem/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /try again/i })).not.toBeInTheDocument();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("renders the not-found state for HTTP 404 loader errors", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    renderState(Object.assign(new Error("Market not found"), { status: 404 }));

    expect(screen.getByText("Page Not Found")).toBeInTheDocument();
  });

  it("treats other HTTP errors as runtime errors", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    renderState(Object.assign(new Error("Server exploded"), { status: 500 }));

    expect(screen.getByText("Dashboard hit an unexpected problem")).toBeInTheDocument();
    expect(screen.queryByText("Page Not Found")).not.toBeInTheDocument();
  });
});
