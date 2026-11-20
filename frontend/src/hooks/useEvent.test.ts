import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useEvent, calculateCapacityFill, isEventFull, hasWaitlistConfigured } from "./useEvent";
import { useCreatorEvents } from "@/context/CreatorEventsContext";
import type { CreatorEvent } from "@/context/CreatorEventsContext";

vi.mock("@/context/CreatorEventsContext", () => ({
  useCreatorEvents: vi.fn(),
}));

const mockedUseCreatorEvents = vi.mocked(useCreatorEvents);

function buildEvent(overrides: Partial<CreatorEvent> = {}): CreatorEvent {
  return {
    id: "event-1",
    title: "Test Event",
    description: "A test event",
    creator: "creator-address",
    maxParticipants: 100,
    participants: 10,
    status: "Active",
    inviteCode: "ABC123",
    matchesCount: 3,
    createdAt: "2026-01-01T00:00:00.000Z",
    startsAt: "2026-01-02T00:00:00.000Z",
    endsAt: "2026-01-03T00:00:00.000Z",
    durationDays: 1,
    prizePool: { amount: 100, currency: "XLM", display: "100 XLM" },
    rewardSplit: [],
    entryFee: { amount: 0, currency: "XLM", display: "0 XLM" },
    branding: {
      accentColor: "",
      backgroundColor: "",
      bannerImage: "",
      logoText: "",
    },
    pointsMultiplier: 1,
    ...overrides,
  };
}

function mockGetEvent(getEvent: ReturnType<typeof vi.fn>) {
  mockedUseCreatorEvents.mockReturnValue({
    getEvent,
  } as unknown as ReturnType<typeof useCreatorEvents>);
}

describe("useEvent", () => {
  beforeEach(() => {
    mockedUseCreatorEvents.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("transitions from loading to success when the event resolves", async () => {
    const event = buildEvent();
    const getEvent = vi.fn().mockResolvedValue(event);
    mockGetEvent(getEvent);

    const { result } = renderHook(() => useEvent("event-1"));

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.event).toEqual(event);
    expect(result.current.error).toBeNull();
    expect(result.current.isFull).toBe(false);
    expect(result.current.capacityPercentage).toBe(10);
    expect(getEvent).toHaveBeenCalledWith("event-1");
  });

  it("calculates full state and 100% capacity fill from event fixture when participants reach max", async () => {
    const fullEvent = buildEvent({ participants: 100, maxParticipants: 100, hasWaitlist: true });
    const getEvent = vi.fn().mockResolvedValue(fullEvent);
    mockGetEvent(getEvent);

    const { result } = renderHook(() => useEvent("event-1"));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.isFull).toBe(true);
    expect(result.current.capacityPercentage).toBe(100);
    expect(result.current.hasWaitlist).toBe(true);
  });

  it("transitions from loading to error when the fetch rejects", async () => {
    const getEvent = vi.fn().mockRejectedValue(new Error("network down"));
    mockGetEvent(getEvent);

    const { result } = renderHook(() => useEvent("event-1"));

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.error).toBe("Network error. Please check your connection and try again.");
    expect(console.error).toHaveBeenCalledWith(
      "useEvent failed for event-1:",
      expect.any(Error),
    );
    expect(result.current.event).toBeNull();
  });

  it("short-circuits and never calls getEvent when eventId is empty", () => {
    const getEvent = vi.fn();
    mockGetEvent(getEvent);

    const { result } = renderHook(() => useEvent(""));

    expect(getEvent).not.toHaveBeenCalled();
    expect(result.current.isLoading).toBe(true);
  });

  describe("helper functions", () => {
    it("calculateCapacityFill computes correct percentage derived from fixtures", () => {
      expect(calculateCapacityFill(50, 100)).toBe(50);
      expect(calculateCapacityFill(100, 100)).toBe(100);
      expect(calculateCapacityFill(0, 50)).toBe(0);
      expect(calculateCapacityFill(12, 0)).toBe(0);
    });

    it("isEventFull returns true when participants reach or exceed maxParticipants", () => {
      expect(isEventFull({ participants: 10, maxParticipants: 10 })).toBe(true);
      expect(isEventFull({ participants: 11, maxParticipants: 10 })).toBe(true);
      expect(isEventFull({ participants: 9, maxParticipants: 10 })).toBe(false);
      expect(isEventFull(null)).toBe(false);
    });

    it("hasWaitlistConfigured detects waitlist configuration on fixtures", () => {
      expect(hasWaitlistConfigured({ hasWaitlist: true, maxParticipants: 10, participants: 10 })).toBe(true);
      expect(hasWaitlistConfigured({ waitlistConfigured: true, maxParticipants: 10, participants: 10 })).toBe(true);
      expect(hasWaitlistConfigured({ maxParticipants: 10, participants: 10 })).toBe(false);
    });
  });
});
