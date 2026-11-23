/**
 * Tests for NotificationsCard — Issue #1543
 *
 * Covers:
 *  1. Category tabs narrow the visible notification list.
 *  2. "Mark all as read" clears the unread badge across every category.
 */

import { describe, expect, it, vi, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import NotificationsCard from "./NotificationsCard";
import {
  NotificationProvider,
  useNotifications,
} from "@/context/NotificationContext";
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
    type: "dispute" as const,
    icon: "megaphone" as const,
    message: "A dispute was opened on your market",
    timestamp: "3d ago",
    isRead: false,
  },
];

function renderWithProvider(component: React.ReactElement) {
  return render(
    <NotificationProvider>
      <SeedNotifications>{component}</SeedNotifications>
    </NotificationProvider>
  );
}

function SeedNotifications({ children }: { children: React.ReactNode }) {
  const { setNotifications } = useNotifications();

  useEffect(() => {
    setNotifications(notifications);
  }, [setNotifications]);

  return children;
}

describe("NotificationsCard", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("filters the list when a category tab is selected", async () => {
    renderWithProvider(<NotificationsCard />);

    expect(await screen.findByText("Your BTC prediction settles in 3 hours")).toBeVisible();
    expect(screen.getByText("Rewards from Weekend Market Clash claimable")).toBeVisible();
    expect(screen.getByText("A dispute was opened on your market")).toBeVisible();

    fireEvent.mouseDown(screen.getByRole("tab", { name: /Rewards/ }));

    expect(screen.getByText("Rewards from Weekend Market Clash claimable")).toBeVisible();
    expect(screen.queryByText("Your BTC prediction settles in 3 hours")).not.toBeInTheDocument();
    expect(screen.queryByText("A dispute was opened on your market")).not.toBeInTheDocument();
  });

  it("marks every notification as read and clears unread counts across all tabs", async () => {
    renderWithProvider(<NotificationsCard />);

    const markAllButton = await screen.findByRole("button", { name: "Mark all as read" });
    fireEvent.click(markAllButton);

    expect(screen.queryByRole("button", { name: "Mark all as read" })).not.toBeInTheDocument();
    expect(screen.queryByText("3", { selector: "span" })).not.toBeInTheDocument();
  });
});
