import { beforeEach, describe, expect, it } from "vitest";
import {
  dismissCoachInsight,
  getCoachLifecycleStorageKey,
  getInsightId,
  getIsoWeekString,
  isCoachInsightHidden,
  snoozeCoachInsight,
} from "./coach";

describe("getIsoWeekString", () => {
  it("returns the ISO week for a mid-week date", () => {
    // 2026-08-19 is a Wednesday in ISO week 34 of 2026.
    expect(getIsoWeekString("2026-08-19T10:00:00Z")).toBe("2026-W34");
  });

  it("attributes a year-boundary date to the ISO year it belongs to", () => {
    // Dec 31 2025 is a Wednesday and falls in ISO week 1 of 2026.
    expect(getIsoWeekString("2025-12-31T00:00:00Z")).toBe("2026-W01");
  });

  it("returns null for an unparseable date", () => {
    expect(getIsoWeekString("not-a-date")).toBeNull();
  });
});

describe("getInsightId", () => {
  it("derives the id from the ISO week of the timestamp", () => {
    expect(getInsightId("2026-08-19T10:00:00Z")).toBe("2026-W34");
  });

  it("falls back to the raw timestamp when it can't be parsed", () => {
    expect(getInsightId("garbage")).toBe("garbage");
  });
});

describe("coach insight dismiss/snooze lifecycle", () => {
  const wallet = "GADDRESS";
  const insightId = "2026-W34";

  beforeEach(() => {
    localStorage.clear();
  });

  it("is not hidden by default", () => {
    expect(isCoachInsightHidden(wallet, insightId, "2026-W34")).toBe(false);
  });

  it("hides an insight permanently once dismissed", () => {
    dismissCoachInsight(wallet, insightId);
    expect(isCoachInsightHidden(wallet, insightId, "2026-W34")).toBe(true);
    // Still hidden in a later week — dismissal is permanent.
    expect(isCoachInsightHidden(wallet, insightId, "2026-W40")).toBe(true);
  });

  it("hides a snoozed insight only until the following ISO week", () => {
    snoozeCoachInsight(wallet, insightId, "2026-W34");
    expect(isCoachInsightHidden(wallet, insightId, "2026-W34")).toBe(true);
    expect(isCoachInsightHidden(wallet, insightId, "2026-W35")).toBe(false);
  });

  it("keeps dismissed/snoozed state scoped to a single wallet", () => {
    dismissCoachInsight(wallet, insightId);
    expect(isCoachInsightHidden("GOTHERWALLET", insightId, "2026-W34")).toBe(
      false,
    );
  });

  it("does not throw twice when dismissing the same insight repeatedly", () => {
    dismissCoachInsight(wallet, insightId);
    expect(() => dismissCoachInsight(wallet, insightId)).not.toThrow();
    expect(isCoachInsightHidden(wallet, insightId, "2026-W34")).toBe(true);
  });

  it("derives a distinct, deterministic storage key per wallet", () => {
    expect(getCoachLifecycleStorageKey("GADDRESS")).toBe(
      "insightarena.coach-insight.v1:GADDRESS",
    );
    expect(getCoachLifecycleStorageKey(null)).toBe(
      "insightarena.coach-insight.v1:anonymous",
    );
  });
});
