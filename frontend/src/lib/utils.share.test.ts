import { describe, expect, it } from "vitest";

import { buildShareUrl, getShareText } from "./utils";

describe("buildShareUrl", () => {
  it("resolves relative URLs and adds UTM params per entity", () => {
    const url = new URL(
      buildShareUrl("/events/9", { entity: "event", channel: "copy", origin: "https://insightarena.app" }),
    );
    expect(url.origin + url.pathname).toBe("https://insightarena.app/events/9");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      utm_source: "copy",
      utm_medium: "share",
      utm_campaign: "event_share",
    });
  });

  it("preserves existing params and hash and overwrites stale UTM params", () => {
    const url = new URL(
      buildShareUrl("https://insightarena.app/markets/1?tab=odds&utm_source=old#chart", {
        entity: "market",
        channel: "native",
        origin: "https://ignored.example",
      }),
    );
    expect(url.origin).toBe("https://insightarena.app");
    expect(url.searchParams.get("tab")).toBe("odds");
    expect(url.searchParams.getAll("utm_source")).toEqual(["native"]);
    expect(url.hash).toBe("#chart");
  });

  it("returns the input unchanged when it cannot be resolved", () => {
    expect(buildShareUrl("/markets/1", { entity: "market", channel: "copy", origin: "" })).toBe("/markets/1");
  });
});

describe("getShareText", () => {
  it("returns entity-specific copy", () => {
    expect(getShareText("market", "BTC 100k?")).toBe('What\'s your call on "BTC 100k?"? Make your prediction on InsightArena.');
    expect(getShareText("event", "Spring Cup")).toBe('Join "Spring Cup" and compete on InsightArena.');
    expect(getShareText("profile", "alice")).toBe("Check out alice's predictions on InsightArena.");
  });
});
