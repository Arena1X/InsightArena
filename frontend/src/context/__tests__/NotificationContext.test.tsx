import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  NotificationProvider,
  clampUnreadCount,
  deriveUnreadCount,
  useNotifications,
  type NotificationItem,
  type ServerNotificationSnapshot,
} from "../NotificationContext";
import * as apiModule from "@/lib/api";

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual("@/lib/api");
  return {
    ...actual,
    markNotificationAsRead: vi.fn(),
    markAllNotificationsAsRead: vi.fn(),
  };
});

const sampleNotifications: NotificationItem[] = [
  {
    id: "1",
    type: "market",
    icon: "trend",
    message: "Your BTC prediction settles in 3 hours",
    timestamp: "2h ago",
    isRead: false,
  },
  {
    id: "2",
    type: "competition",
    icon: "trophy",
    message: "You moved up 3 spots on leaderboard",
    timestamp: "5h ago",
    isRead: false,
  },
  {
    id: "3",
    type: "reward",
    icon: "gift",
    message: "Rewards from Weekend Market Clash claimable",
    timestamp: "1d ago",
    isRead: true,
  },
];

function createWrapper(options?: {
  initialNotifications?: NotificationItem[];
  reconcileWithServer?: () => Promise<ServerNotificationSnapshot | null | undefined>;
}) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <NotificationProvider
        initialNotifications={options?.initialNotifications ?? sampleNotifications}
        reconcileWithServer={options?.reconcileWithServer}
      >
        {children}
      </NotificationProvider>
    );
  };
}

describe("NotificationContext — Unread badge accuracy (Issue #2177)", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("Single source of truth & marking read", () => {
    it("marking read decrements the badge correctly", async () => {
      let resolveApi!: () => void;
      vi.mocked(apiModule.markNotificationAsRead).mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            resolveApi = resolve;
          }),
      );

      const { result } = renderHook(() => useNotifications(), {
        wrapper: createWrapper(),
      });

      expect(result.current.unreadCount).toBe(2);

      let pendingPromise!: Promise<void>;
      act(() => {
        pendingPromise = result.current.markAsRead("1");
      });

      // Optimistic decrement before server resolves
      expect(result.current.unreadCount).toBe(1);
      expect(result.current.notifications.find((n) => n.id === "1")?.isRead).toBe(
        true,
      );

      await act(async () => {
        resolveApi();
        await pendingPromise;
      });

      expect(apiModule.markNotificationAsRead).toHaveBeenCalledWith("1");
      expect(result.current.unreadCount).toBe(1);

      // Marking an already-read notification is a no-op and does not double-decrement
      await act(async () => {
        await result.current.markAsRead("1");
      });
      expect(result.current.unreadCount).toBe(1);
      expect(apiModule.markNotificationAsRead).toHaveBeenCalledTimes(1);
    });

    it("rolls back optimistic markAsRead when the server mutation fails", async () => {
      vi.mocked(apiModule.markNotificationAsRead).mockRejectedValueOnce(
        new Error("Server unavailable"),
      );

      const { result } = renderHook(() => useNotifications(), {
        wrapper: createWrapper(),
      });

      expect(result.current.unreadCount).toBe(2);

      await act(async () => {
        await expect(result.current.markAsRead("1")).rejects.toThrow(
          "Server unavailable",
        );
      });

      expect(result.current.unreadCount).toBe(2);
      expect(result.current.notifications.find((n) => n.id === "1")?.isRead).toBe(
        false,
      );
    });

    it("derives unread count accurately when updateNotification toggles isRead", () => {
      const { result } = renderHook(() => useNotifications(), {
        wrapper: createWrapper(),
      });

      expect(result.current.unreadCount).toBe(2);

      act(() => {
        result.current.updateNotification("2", { isRead: true });
      });
      expect(result.current.unreadCount).toBe(1);

      act(() => {
        result.current.updateNotification("3", { isRead: false });
      });
      expect(result.current.unreadCount).toBe(2);
    });
  });

  describe("Server reconciliation corrects drift", () => {
    it("reconciles with the server after markAsRead to correct unread count drift", async () => {
      vi.mocked(apiModule.markNotificationAsRead).mockResolvedValueOnce(undefined);
      const reconcileWithServer = vi
        .fn<() => Promise<ServerNotificationSnapshot>>()
        .mockResolvedValueOnce({ unreadCount: 4 });

      const { result } = renderHook(() => useNotifications(), {
        wrapper: createWrapper({ reconcileWithServer }),
      });

      expect(result.current.unreadCount).toBe(2);

      await act(async () => {
        await result.current.markAsRead("1");
      });

      expect(reconcileWithServer).toHaveBeenCalledTimes(1);
      expect(result.current.unreadCount).toBe(4);
    });

    it("reconciles with the server after markAllAsRead when new unread items exist on server", async () => {
      vi.mocked(apiModule.markAllNotificationsAsRead).mockResolvedValueOnce({
        unreadCount: 0,
      });
      const serverList: NotificationItem[] = [
        ...sampleNotifications.map((n) => ({ ...n, isRead: true })),
        {
          id: "4",
          type: "system",
          icon: "megaphone",
          message: "New notification arrived on server",
          timestamp: "just now",
          isRead: false,
        },
      ];
      const reconcileWithServer = vi
        .fn<() => Promise<ServerNotificationSnapshot>>()
        .mockResolvedValueOnce({ notifications: serverList });

      const { result } = renderHook(() => useNotifications(), {
        wrapper: createWrapper({ reconcileWithServer }),
      });

      await act(async () => {
        await result.current.markAllAsRead();
      });

      expect(reconcileWithServer).toHaveBeenCalledTimes(1);
      expect(result.current.notifications).toHaveLength(4);
      expect(result.current.unreadCount).toBe(1);
    });

    it("applies authoritative unreadCount directly from mutation response", async () => {
      vi.mocked(apiModule.markNotificationAsRead).mockResolvedValueOnce({
        unreadCount: 3,
      });

      const { result } = renderHook(() => useNotifications(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.markAsRead("1");
      });

      expect(result.current.unreadCount).toBe(3);
    });

    it("ignores stale server reconcile responses from superseded mutations", async () => {
      let resolveFirstReconcile!: (value: ServerNotificationSnapshot) => void;
      let firstReconcileStarted!: () => void;
      const firstReconcileStartedPromise = new Promise<void>((resolve) => {
        firstReconcileStarted = resolve;
      });

      const reconcileWithServer = vi
        .fn<() => Promise<ServerNotificationSnapshot>>()
        .mockImplementationOnce(() => {
          firstReconcileStarted();
          return new Promise((resolve) => {
            resolveFirstReconcile = resolve;
          });
        })
        .mockResolvedValueOnce({ unreadCount: 0 });

      vi.mocked(apiModule.markNotificationAsRead).mockResolvedValue(undefined);

      const { result } = renderHook(() => useNotifications(), {
        wrapper: createWrapper({ reconcileWithServer }),
      });

      let firstMutation!: Promise<void>;
      act(() => {
        firstMutation = result.current.markAsRead("1");
      });

      // Wait until the first mutation's reconcile request is in flight
      await firstReconcileStartedPromise;

      // Trigger a newer mutation whose reconcile finishes with 0
      await act(async () => {
        await result.current.markAsRead("2");
      });

      expect(result.current.unreadCount).toBe(0);

      // Now the stale first reconcile resolves with 5 — must not overwrite
      await act(async () => {
        resolveFirstReconcile({ unreadCount: 5 });
        await firstMutation;
      });

      expect(result.current.unreadCount).toBe(0);
    });
  });

  describe("Count never goes negative", () => {
    it("clampUnreadCount and deriveUnreadCount never return negative values", () => {
      expect(clampUnreadCount(-1)).toBe(0);
      expect(clampUnreadCount(-42)).toBe(0);
      expect(clampUnreadCount(-0)).toBe(0);
      expect(clampUnreadCount(Number.NaN)).toBe(0);
      expect(clampUnreadCount(Number.NEGATIVE_INFINITY)).toBe(0);
      expect(clampUnreadCount(3.9)).toBe(3);

      expect(deriveUnreadCount(sampleNotifications, -10)).toBe(0);
      expect(deriveUnreadCount([], null)).toBe(0);
    });

    it("clamps negative unreadCount returned by server reconcile to zero", async () => {
      vi.mocked(apiModule.markNotificationAsRead).mockResolvedValueOnce(undefined);
      const reconcileWithServer = vi
        .fn<() => Promise<ServerNotificationSnapshot>>()
        .mockResolvedValueOnce({ unreadCount: -5 });

      const { result } = renderHook(() => useNotifications(), {
        wrapper: createWrapper({ reconcileWithServer }),
      });

      await act(async () => {
        await result.current.markAsRead("1");
      });

      expect(result.current.unreadCount).toBe(0);
    });

    it("never goes negative when marking read while server count is already zero", async () => {
      vi.mocked(apiModule.markNotificationAsRead).mockResolvedValueOnce(undefined);

      const { result } = renderHook(() => useNotifications(), {
        wrapper: createWrapper(),
      });

      // Simulate server reporting 0 unread while local list still has unread items
      await act(async () => {
        await result.current.reconcile({ unreadCount: 0 });
      });
      expect(result.current.unreadCount).toBe(0);

      // Marking a locally-unread item read must clamp at 0, not -1
      await act(async () => {
        await result.current.markAsRead("1");
      });
      expect(result.current.unreadCount).toBe(0);

      // Marking an unknown or already-read item also keeps count at 0
      await act(async () => {
        await result.current.markAsRead("non-existent");
        await result.current.markAsRead("3");
      });
      expect(result.current.unreadCount).toBe(0);
    });
  });
});
