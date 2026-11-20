import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RouteErrorState, buildErrorReportUrl } from "./route-error-state";
import { classifyError } from "./error-classifier";

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

describe("classifyError", () => {
  it("classifies a network TypeError as 'network' with the connection headline", () => {
    const err = Object.assign(new TypeError("Failed to fetch"), {});
    const result = classifyError(err);
    expect(result.errorClass).toBe("network");
    expect(result.headline).toBe("Connection Problem");
  });

  it("classifies a 401 status error as 'auth'", () => {
    const err = Object.assign(new Error("Unauthorized"), { status: 401 });
    const result = classifyError(err);
    expect(result.errorClass).toBe("auth");
    expect(result.headline).toBe("Access Denied");
  });

  it("classifies a 403 status error as 'auth'", () => {
    const err = Object.assign(new Error("Forbidden"), { status: 403 });
    const result = classifyError(err);
    expect(result.errorClass).toBe("auth");
  });

  it("classifies a 500 status error as 'server'", () => {
    const err = Object.assign(new Error("Internal Server Error"), { status: 500 });
    const result = classifyError(err);
    expect(result.errorClass).toBe("server");
    expect(result.headline).toBe("Server Error");
  });

  it("classifies a 503 status error as 'server'", () => {
    const err = Object.assign(new Error("Service Unavailable"), { status: 503 });
    const result = classifyError(err);
    expect(result.errorClass).toBe("server");
  });

  it("classifies a timeout message error as 'timeout'", () => {
    const err = new Error("Request timed out after 30s");
    const result = classifyError(err);
    expect(result.errorClass).toBe("timeout");
    expect(result.headline).toBe("Request Timed Out");
  });

  it("classifies a chunk-load error by message", () => {
    const err = new Error("Loading chunk 42 failed");
    const result = classifyError(err);
    expect(result.errorClass).toBe("chunk-load");
    expect(result.headline).toBe("Update Available");
  });

  it("classifies an unknown error with the generic headline", () => {
    const err = new Error("Something obscure");
    const result = classifyError(err);
    expect(result.errorClass).toBe("unknown");
    expect(result.headline).toBe("Something Went Wrong");
  });

  it("classifies a 408 status error as 'timeout'", () => {
    const err = Object.assign(new Error("Timeout"), { status: 408 });
    const result = classifyError(err);
    expect(result.errorClass).toBe("timeout");
  });
});

describe("RouteErrorState error-class messages", () => {
  beforeEach(() => {
    refresh.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the connection headline for a network TypeError", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const err = Object.assign(new TypeError("Failed to fetch"), {});
    renderState(err);
    expect(screen.getByText("Connection Problem")).toBeInTheDocument();
    expect(screen.getByText("Check your internet connection and try again.")).toBeInTheDocument();
  });

  it("shows the server error headline for a 500 error", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const err = Object.assign(new Error("Server exploded"), { status: 500 });
    renderState(err);
    expect(screen.getByText("Server Error")).toBeInTheDocument();
    expect(screen.getByText("Our servers ran into an issue. We've been notified and are working on a fix.")).toBeInTheDocument();
  });

  it("shows the update available headline for a chunk-load error", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const err = new Error("Loading chunk 7 failed");
    renderState(err);
    expect(screen.getByText("Update Available")).toBeInTheDocument();
  });

  it("shows the access denied headline for a 401 error", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const err = Object.assign(new Error("Unauthorized"), { status: 401 });
    renderState(err);
    expect(screen.getByText("Access Denied")).toBeInTheDocument();
  });

  it("shows caller description only for unknown errors", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const err = new Error("Something obscure");
    renderState(err);
    // The generic detail from classifyError is shown
    expect(screen.getByText("An unexpected error occurred. Retrying usually fixes this.")).toBeInTheDocument();
    // The caller description is also shown for unknown errors
    expect(screen.getByText("Please retry.")).toBeInTheDocument();
  });

  it("does not show caller description for known error classes", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const err = Object.assign(new Error("Server exploded"), { status: 500 });
    renderState(err);
    // The caller description 'Please retry.' should NOT appear for known errors
    expect(screen.queryByText("Please retry.")).not.toBeInTheDocument();
  });
});
