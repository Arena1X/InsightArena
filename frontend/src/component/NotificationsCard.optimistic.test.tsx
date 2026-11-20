/**
 * Tests for optimistic UI in mark-all-read — Issue #2000
 *
 * Covers:
 *  1. Mark-all-read updates UI immediately (before API responds).
 *  2. A failed request rolls back the read state.
 *  3. Unread badge updates in sync with mark-all-read.
 */

import { describe, expect, it, vi, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import NotificationsCard from "./NotificationsCard";
import { NotificationProvider, useNotifications } from "@/context/NotificationContext";
import UserWalletControls from "@/component/header/UserWalletControls";
import * as apiModule from "@/lib/api";

// Mock the API module
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual("@/lib/api");
  return {
    ...actual,
    markAllNotificationsAsRead: vi.fn(),
  };
});

const notifications = [
  {
    id: "1",
    type: "market" as const,
    icon: "trend" as const,
    message: "Your BTC prediction settles in 3 hours",
    timestamp: "2h ago",
    isRead: false,
  },
  {
    id: "2",
    type: "reward" as const,
    icon: "gift" as const,
    message: "Rewards from Weekend Market Clash claimable",
    timestamp: "1d ago",
    isRead: false,
  },
  {
    id: "3",
    type: "competition" as const,
    icon: "trophy" as const,
    message: "You moved up 3 spots on leaderboard",
    timestamp: "5h ago",
    isRead: false,
  },
];

function renderWithProvider(component: React.ReactElement) {
  return render(
    <NotificationProvider>
      {component}
    </NotificationProvider>
  );
}

// Wrapper component for testing badge sync
function TestBadgeSync() {
  const { unreadCount } = useNotifications();
  return (
    <div>
      <UserWalletControls
        address="G123456789"
        copied={false}
        isActive={() => false}
        isAuthenticated={true}
        isDropdownOpen={false}
        isRestoring={false}
        dropdownButtonRef={null}
        dropdownRef={null}
        onConnect={() => {}}
        onCopyAddress={() => {}}
        onDisconnect={() => {}}
        setIsDropdownOpen={() => {}}
      />
      <NotificationsCard notifications={notifications} />
      <div data-testid="unread-count">{unreadCount}</div>
    </div>
  );
}

describe("NotificationsCard — Optimistic UI (Issue #2000)", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("Test 1: Mark-all-read updates UI immediately (optimistic)", async () => {
    const mockApi = vi.spyOn(apiModule, "markAllNotificationsAsRead");
    mockApi.mockImplementation(
      () => new Promise((resolve) => setTimeout(resolve, 100))
    );

    renderWithProvider(
      <NotificationsCard notifications={notifications} />
    );

    // Verify initial state: 3 unread notifications
    expect(screen.getByRole("button", { name: "Mark all as read" })).toBeInTheDocument();
    expect(screen.getByText("3", { selector: "span" })).toBeInTheDocument();

    // Click mark all as read
    const markAllButton = screen.getByRole("button", { name: "Mark all as read" });
    fireEvent.click(markAllButton);

    // Verify optimistic UI update happens immediately (before API responds)
    expect(
      screen.queryByRole("button", { name: "Mark all as read" })
    ).not.toBeInTheDocument();
    expect(screen.queryByText("3", { selector: "span" })).not.toBeInTheDocument();

    // Wait for API call to complete
    await waitFor(() => {
      expect(mockApi).toHaveBeenCalledTimes(1);
    });
  });

  it("Test 2: Failed request rolls back the read state and shows error", async () => {
    const mockApi = vi.spyOn(apiModule, "markAllNotificationsAsRead");
    mockApi.mockRejectedValue(new Error("Network error"));

    renderWithProvider(
      <NotificationsCard notifications={notifications} />
    );

    // Verify initial state
    expect(screen.getByRole("button", { name: "Mark all as read" })).toBeInTheDocument();
    expect(screen.getByText("3", { selector: "span" })).toBeInTheDocument();

    // Click mark all as read
    const markAllButton = screen.getByRole("button", { name: "Mark all as read" });
    fireEvent.click(markAllButton);

    // Verify optimistic UI update (happens immediately)
    expect(
      screen.queryByRole("button", { name: "Mark all as read" })
    ).not.toBeInTheDocument();

    // Wait for API to fail and rollback
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Mark all as read" })).toBeInTheDocument();
    });

    // Verify unread counts are restored
    expect(screen.getByText("3", { selector: "span" })).toBeInTheDocument();

    // Verify error message is displayed
    expect(
      screen.getByRole("alert", { hidden: false })
    ).toHaveTextContent("Network error");
  });

  it("Test 3: Unread badge updates in sync with mark-all-read", async () => {
    const mockApi = vi.spyOn(apiModule, "markAllNotificationsAsRead");
    mockApi.mockResolvedValue(undefined);

    renderWithProvider(<TestBadgeSync />);

    // Verify initial unread count is 3
    expect(screen.getByTestId("unread-count")).toHaveTextContent("3");

    // Verify badge is visible
    const bellIcon = screen.getByRole("link", { name: "" }).querySelector("svg");
    expect(bellIcon).toBeInTheDocument();

    // Get the badge dot (should be visible when unreadCount > 0)
    const badgeDot = screen.getByRole("link", { name: "" }).querySelector("span span span");
    expect(badgeDot).toBeInTheDocument();

    // Click mark all as read
    const markAllButton = screen.getByRole("button", { name: "Mark all as read" });
    fireEvent.click(markAllButton);

    // Verify unread count is updated to 0 optimistically
    await waitFor(() => {
      expect(screen.getByTestId("unread-count")).toHaveTextContent("0");
    });

    // Wait for API to succeed
    await waitFor(() => {
      expect(mockApi).toHaveBeenCalledTimes(1);
    });

    // Verify badge is now hidden (unreadCount === 0)
    const linkElement = screen.getByRole("link", { name: "" });
    // The badge span should not have the animated ping span when unreadCount is 0
    expect(linkElement.querySelectorAll("span").length).toBeLessThan(3);
  });
});
