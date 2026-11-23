import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ShareButton } from "./ShareButton";

vi.mock("@/lib/env", () => ({
  env: { API_URL: "", APP_URL: "https://insightarena.app" },
}));

const writeText = vi.fn<(text: string) => Promise<void>>();

function setNativeShare(share: ((data: ShareData) => Promise<void>) | undefined) {
  Object.defineProperty(navigator, "share", { configurable: true, writable: true, value: share });
}

describe("ShareButton", () => {
  beforeEach(() => {
    writeText.mockReset().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    setNativeShare(undefined);
  });

  afterEach(() => {
    setNativeShare(undefined);
    vi.useRealTimers();
  });

  it("copies an attributed market link and shows feedback when Web Share is unavailable", async () => {
    render(<ShareButton title="Will BTC hit 100k?" url="/markets/42" />);

    fireEvent.click(screen.getByRole("button", { name: /copy link to market/i }));

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const copied = new URL(writeText.mock.calls[0][0]);
    expect(copied.origin + copied.pathname).toBe("https://insightarena.app/markets/42");
    expect(copied.searchParams.get("utm_source")).toBe("copy");
    expect(copied.searchParams.get("utm_medium")).toBe("share");
    expect(copied.searchParams.get("utm_campaign")).toBe("market_share");

    expect(await screen.findByText("Copied!")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Link copied to clipboard");
  });

  it("clears the copied feedback after a short delay", async () => {
    vi.useFakeTimers();
    render(<ShareButton title="Market" url="/markets/1" />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /copy link/i }));
    });
    expect(screen.getByText("Copied!")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.queryByText("Copied!")).not.toBeInTheDocument();
  });

  it("reports a clipboard failure", async () => {
    writeText.mockRejectedValue(new Error("denied"));
    render(<ShareButton title="Market" url="/markets/1" />);

    fireEvent.click(screen.getByRole("button", { name: /copy link/i }));

    expect(await screen.findByText("Copy failed")).toBeInTheDocument();
  });

  it("uses the native share sheet with per-entity text when available", async () => {
    const share = vi.fn<(data: ShareData) => Promise<void>>().mockResolvedValue(undefined);
    setNativeShare(share);

    render(<ShareButton title="Spring Cup" entity="event" url="https://insightarena.app/events/7" />);

    fireEvent.click(await screen.findByRole("button", { name: /share event/i }));

    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    const data = share.mock.calls[0][0];
    expect(data.title).toBe("Spring Cup");
    expect(data.text).toBe('Join "Spring Cup" and compete on InsightArena.');
    const shared = new URL(data.url!);
    expect(shared.searchParams.get("utm_source")).toBe("native");
    expect(shared.searchParams.get("utm_campaign")).toBe("event_share");
    expect(writeText).not.toHaveBeenCalled();
  });

  it("does not fall back to the clipboard when the user dismisses the share sheet", async () => {
    setNativeShare(vi.fn().mockRejectedValue(new DOMException("cancelled", "AbortError")));
    render(<ShareButton title="Market" url="/markets/1" />);

    fireEvent.click(await screen.findByRole("button", { name: /share market/i }));

    await waitFor(() => expect(navigator.share).toHaveBeenCalled());
    expect(writeText).not.toHaveBeenCalled();
  });

  it("falls back to the clipboard when native share fails", async () => {
    setNativeShare(vi.fn().mockRejectedValue(new DOMException("blocked", "NotAllowedError")));
    render(<ShareButton title="Market" url="/markets/1" />);

    fireEvent.click(await screen.findByRole("button", { name: /share market/i }));

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(new URL(writeText.mock.calls[0][0]).searchParams.get("utm_source")).toBe("copy");
  });

  it("builds a profile tweet with profile text and twitter attribution", () => {
    render(<ShareButton title="alice" entity="profile" url="/profile/GABC" />);

    const href = screen.getByRole("link", { name: /share on x/i }).getAttribute("href")!;
    const text = new URL(href).searchParams.get("text")!;
    expect(text).toContain("Check out alice's predictions on InsightArena.");
    expect(text).toContain("https://insightarena.app/profile/GABC?utm_source=twitter");
    expect(text).toContain("utm_campaign=profile_share");
  });
});
