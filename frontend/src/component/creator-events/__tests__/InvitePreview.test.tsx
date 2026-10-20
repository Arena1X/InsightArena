import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import InvitePreview, { getInviteCodeState } from "../InvitePreview";
import type { CreatorEvent, CreatorEventMatch } from "@/context/CreatorEventsContext";
import { useWallet } from "@/context/WalletContext";
import { useCreatorEvents } from "@/context/CreatorEventsContext";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

vi.mock("@/context/WalletContext", () => ({
  useWallet: vi.fn(),
}));

vi.mock("@/context/CreatorEventsContext", () => ({
  useCreatorEvents: vi.fn(),
}));

const mockedUseWallet = vi.mocked(useWallet);
const mockedUseCreatorEvents = vi.mocked(useCreatorEvents);

function buildEvent(overrides: Partial<CreatorEvent> = {}): CreatorEvent {
  return {
    id: "event-001",
    title: "Apollo Tournament",
    description: "An invite-only prediction tournament.",
    creator: "GCF5T...9V2H",
    maxParticipants: 100,
    participants: 72,
    status: "Active",
    inviteCode: "APOLLO-2026",
    matchesCount: 4,
    createdAt: "2026-06-01T09:00:00Z",
    startsAt: "2026-06-10T18:00:00Z",
    endsAt: "2026-12-24T23:59:59Z",
    durationDays: 14,
    prizePool: { amount: 5000, currency: "XLM", display: "5,000 XLM" },
    rewardSplit: [{ rank: 1, percentage: 100, label: "Winner" }],
    entryFee: { amount: 25, currency: "XLM", display: "25 XLM" },
    branding: {
      accentColor: "#F59E0B",
      backgroundColor: "#111827",
      bannerImage: "/banner.jpg",
      logoText: "AP",
    },
    pointsMultiplier: 1.5,
    joined: false,
    ...overrides,
  };
}

function mockContext(
  overrides: Partial<{
    getEventByCode: (code: string) => Promise<CreatorEvent | null>;
    getEventMatches: (eventId: string) => Promise<CreatorEventMatch[]>;
    joinEvent: (code: string) => Promise<boolean>;
    eventCache: Record<string, CreatorEvent>;
  }> = {},
) {
  mockedUseCreatorEvents.mockReturnValue({
    getEventByCode: overrides.getEventByCode ?? (async () => null),
    getEventMatches: overrides.getEventMatches ?? (async () => []),
    joinEvent: overrides.joinEvent ?? (async () => true),
    eventCache: overrides.eventCache ?? {},
  } as unknown as ReturnType<typeof useCreatorEvents>);
}

describe("getInviteCodeState", () => {
  const now = new Date("2026-09-28T00:00:00Z");

  it("returns 'cancelled' for a cancelled event regardless of other fields", () => {
    expect(
      getInviteCodeState(
        { status: "Cancelled", endsAt: "2099-01-01T00:00:00Z", participants: 1, maxParticipants: 100 },
        now,
      ),
    ).toBe("cancelled");
  });

  it("returns 'expired' once endsAt has passed", () => {
    expect(
      getInviteCodeState(
        { status: "Active", endsAt: "2026-01-01T00:00:00Z", participants: 1, maxParticipants: 100 },
        now,
      ),
    ).toBe("expired");
  });

  it("returns 'max_used' when participants have reached maxParticipants", () => {
    expect(
      getInviteCodeState(
        { status: "Active", endsAt: "2099-01-01T00:00:00Z", participants: 100, maxParticipants: 100 },
        now,
      ),
    ).toBe("max_used");
  });

  it("returns 'valid' when none of the terminal conditions apply", () => {
    expect(
      getInviteCodeState(
        { status: "Active", endsAt: "2099-01-01T00:00:00Z", participants: 50, maxParticipants: 100 },
        now,
      ),
    ).toBe("valid");
  });

  it("prioritises 'cancelled' over an also-expired or also-full event", () => {
    expect(
      getInviteCodeState(
        { status: "Cancelled", endsAt: "2020-01-01T00:00:00Z", participants: 100, maxParticipants: 100 },
        now,
      ),
    ).toBe("cancelled");
  });
});

describe("InvitePreview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedUseWallet.mockReturnValue({
      address: null,
      openConnectModal: vi.fn(),
    } as unknown as ReturnType<typeof useWallet>);
  });

  it("renders a not-found state for an unknown code", async () => {
    mockContext({ getEventByCode: async () => null });

    render(<InvitePreview code="UNKNOWN" />);

    expect(await screen.findByText("Invite Not Found")).toBeInTheDocument();
    expect(screen.queryByTestId("invite-join-cta")).not.toBeInTheDocument();
  });

  it("renders a distinct cancelled state and hides the join flow", async () => {
    mockContext({
      getEventByCode: async () => buildEvent({ status: "Cancelled" }),
    });

    render(<InvitePreview code="APOLLO-2026" />);

    expect(await screen.findByTestId("invite-state-cancelled")).toBeInTheDocument();
    expect(screen.getByText("Event Cancelled")).toBeInTheDocument();
    expect(screen.queryByTestId("invite-join-cta")).not.toBeInTheDocument();
    expect(screen.queryByTestId("invite-connect-wallet-cta")).not.toBeInTheDocument();
  });

  it("renders a distinct expired state and hides the join flow", async () => {
    mockContext({
      getEventByCode: async () =>
        buildEvent({ endsAt: "2020-01-01T00:00:00Z" }),
    });

    render(<InvitePreview code="APOLLO-2026" />);

    expect(await screen.findByTestId("invite-state-expired")).toBeInTheDocument();
    expect(screen.getByText("Invite Expired")).toBeInTheDocument();
    expect(screen.queryByTestId("invite-join-cta")).not.toBeInTheDocument();
  });

  it("renders a distinct max-used state and hides the join flow", async () => {
    mockContext({
      getEventByCode: async () =>
        buildEvent({ participants: 100, maxParticipants: 100 }),
    });

    render(<InvitePreview code="APOLLO-2026" />);

    expect(await screen.findByTestId("invite-state-max-used")).toBeInTheDocument();
    expect(screen.getByText("Event Full")).toBeInTheDocument();
    expect(screen.queryByTestId("invite-join-cta")).not.toBeInTheDocument();
  });

  it("shows the join CTA for a valid, unauthenticated visitor and opens the connect flow instead of navigating away", async () => {
    const openConnectModal = vi.fn();
    mockedUseWallet.mockReturnValue({
      address: null,
      openConnectModal,
    } as unknown as ReturnType<typeof useWallet>);
    mockContext({ getEventByCode: async () => buildEvent() });

    const user = userEvent.setup();
    render(<InvitePreview code="APOLLO-2026" />);

    const cta = await screen.findByTestId("invite-connect-wallet-cta");
    expect(cta).toHaveTextContent("Connect Wallet to Join");

    await user.click(cta);

    // Connecting opens an in-place modal rather than routing away, so the
    // visitor lands back on this same invite preview once connected.
    expect(openConnectModal).toHaveBeenCalledTimes(1);
    expect(push).not.toHaveBeenCalled();
  });

  it("shows the join CTA once connected for a valid invite", async () => {
    mockedUseWallet.mockReturnValue({
      address: "GVISITOR",
      openConnectModal: vi.fn(),
    } as unknown as ReturnType<typeof useWallet>);
    mockContext({ getEventByCode: async () => buildEvent() });

    render(<InvitePreview code="APOLLO-2026" />);

    const cta = await screen.findByTestId("invite-join-cta");
    expect(cta).toHaveTextContent("Join Event");
  });

  it("lets an already-joined participant reach the event even past the invite window", async () => {
    mockedUseWallet.mockReturnValue({
      address: "GVISITOR",
      openConnectModal: vi.fn(),
    } as unknown as ReturnType<typeof useWallet>);
    mockContext({
      getEventByCode: async () =>
        buildEvent({ endsAt: "2020-01-01T00:00:00Z", joined: true }),
    });

    render(<InvitePreview code="APOLLO-2026" />);

    // Not the terminal expired dead-end — the participant already has access.
    await waitFor(() =>
      expect(screen.queryByTestId("invite-state-expired")).not.toBeInTheDocument(),
    );
    expect(await screen.findByTestId("invite-view-event-cta")).toBeInTheDocument();
  });
});
