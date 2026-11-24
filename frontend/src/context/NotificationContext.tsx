"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  markAllNotificationsAsRead,
  markNotificationAsRead,
} from "@/lib/api";

export interface NotificationItem {
  id: string;
  type: "market" | "competition" | "reward" | "social" | "dispute" | "system";
  icon: "trend" | "trophy" | "gift" | "users" | "megaphone";
  message: string;
  timestamp: string;
  isRead: boolean;
}

export interface ServerNotificationSnapshot {
  notifications?: NotificationItem[];
  unreadCount?: number;
}

interface NotificationState {
  notifications: NotificationItem[];
  /**
   * Authoritative unread count from the server when a reconcile or mutation
   * response supplies a count without a full notification list. When `null`,
   * the badge count is derived directly from `notifications`.
   */
  serverUnreadCount: number | null;
}

export interface NotificationContextValue {
  notifications: NotificationItem[];
  unreadCount: number;
  setNotifications: (notifications: NotificationItem[]) => void;
  updateNotification: (id: string, updates: Partial<NotificationItem>) => void;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  reconcile: (snapshot?: ServerNotificationSnapshot) => Promise<void>;
}

export interface NotificationProviderProps {
  children: React.ReactNode;
  initialNotifications?: NotificationItem[];
  /**
   * Optional server reconciliation callback invoked after each mutation so the
   * unread badge and notification list stay aligned with authoritative server
   * state.
   */
  reconcileWithServer?: () => Promise<ServerNotificationSnapshot | null | undefined>;
}

/**
 * Clamps any unread count to a non-negative integer so the badge never displays
 * negative or non-finite values.
 */
export function clampUnreadCount(count: number): number {
  if (!Number.isFinite(count)) return 0;
  return Math.max(0, Math.floor(count));
}

/**
 * Single source of truth for deriving the unread badge count from context state.
 */
export function deriveUnreadCount(
  notifications: NotificationItem[],
  serverUnreadCount: number | null = null,
): number {
  if (serverUnreadCount !== null) {
    return clampUnreadCount(serverUnreadCount);
  }
  const localUnread = notifications.reduce(
    (count, notification) => count + (notification.isRead ? 0 : 1),
    0,
  );
  return clampUnreadCount(localUnread);
}

function isServerSnapshot(
  value: unknown,
): value is ServerNotificationSnapshot {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    Array.isArray(record.notifications) ||
    typeof record.unreadCount === "number"
  );
}

function applyServerSnapshot(
  current: NotificationState,
  snapshot: ServerNotificationSnapshot,
): NotificationState {
  const nextNotifications = Array.isArray(snapshot.notifications)
    ? snapshot.notifications
    : current.notifications;

  if (typeof snapshot.unreadCount === "number") {
    return {
      notifications: nextNotifications,
      serverUnreadCount: clampUnreadCount(snapshot.unreadCount),
    };
  }

  return {
    notifications: nextNotifications,
    serverUnreadCount: null,
  };
}

const DEFAULT_CONTEXT_VALUE: NotificationContextValue = {
  notifications: [],
  unreadCount: 0,
  setNotifications: () => {},
  updateNotification: () => {},
  markAsRead: async () => {},
  markAllAsRead: async () => {},
  reconcile: async () => {},
};

const NotificationContext = createContext<NotificationContextValue>(
  DEFAULT_CONTEXT_VALUE,
);

// Mock data for initial state
const mockNotifications: NotificationItem[] = [
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
  {
    id: "4",
    type: "social",
    icon: "users",
    message: "Invite to Crypto Elite League",
    timestamp: "1d ago",
    isRead: true,
  },
];

export function NotificationProvider({
  children,
  initialNotifications = mockNotifications,
  reconcileWithServer,
}: NotificationProviderProps) {
  const [state, setState] = useState<NotificationState>({
    notifications: initialNotifications,
    serverUnreadCount: null,
  });
  const stateRef = useRef<NotificationState>(state);
  stateRef.current = state;

  const latestMutationId = useRef(0);

  const unreadCount = useMemo(
    () => deriveUnreadCount(state.notifications, state.serverUnreadCount),
    [state.notifications, state.serverUnreadCount],
  );

  const setNotifications = useCallback((nextNotifications: NotificationItem[]) => {
    setState({
      notifications: nextNotifications,
      serverUnreadCount: null,
    });
  }, []);

  const updateNotification = useCallback(
    (id: string, updates: Partial<NotificationItem>) => {
      setState((current) => {
        let delta = 0;
        const nextNotifications = current.notifications.map((n) => {
          if (n.id !== id) return n;
          const updated = { ...n, ...updates };
          if (n.isRead !== updated.isRead) {
            delta += updated.isRead ? -1 : 1;
          }
          return updated;
        });

        return {
          notifications: nextNotifications,
          serverUnreadCount:
            current.serverUnreadCount !== null
              ? clampUnreadCount(current.serverUnreadCount + delta)
              : null,
        };
      });
    },
    [],
  );

  const reconcileAfterMutation = useCallback(
    async (mutationId: number, mutationResponse?: unknown) => {
      if (mutationId !== latestMutationId.current) return;

      if (isServerSnapshot(mutationResponse)) {
        setState((current) => applyServerSnapshot(current, mutationResponse));
      }

      if (!reconcileWithServer) return;

      try {
        const snapshot = await reconcileWithServer();
        if (
          mutationId === latestMutationId.current &&
          isServerSnapshot(snapshot)
        ) {
          setState((current) => applyServerSnapshot(current, snapshot));
        }
      } catch {
        // Reconcile is best-effort after a successful mutation; keep current state.
      }
    },
    [reconcileWithServer],
  );

  const reconcile = useCallback(
    async (snapshot?: ServerNotificationSnapshot) => {
      const mutationId = ++latestMutationId.current;

      if (isServerSnapshot(snapshot)) {
        setState((current) => applyServerSnapshot(current, snapshot));
        return;
      }

      if (!reconcileWithServer) return;

      const serverSnapshot = await reconcileWithServer();
      if (
        mutationId === latestMutationId.current &&
        isServerSnapshot(serverSnapshot)
      ) {
        setState((current) => applyServerSnapshot(current, serverSnapshot));
      }
    },
    [reconcileWithServer],
  );

  const markAsRead = useCallback(
    async (id: string) => {
      const target = stateRef.current.notifications.find((n) => n.id === id);
      if (!target || target.isRead) return;

      const mutationId = ++latestMutationId.current;
      const previousServerUnreadCount = stateRef.current.serverUnreadCount;

      setState((current) => ({
        notifications: current.notifications.map((notification) =>
          notification.id === id && !notification.isRead
            ? { ...notification, isRead: true }
            : notification,
        ),
        serverUnreadCount:
          current.serverUnreadCount !== null
            ? clampUnreadCount(current.serverUnreadCount - 1)
            : null,
      }));

      try {
        const response = await markNotificationAsRead(id);
        await reconcileAfterMutation(mutationId, response);
      } catch (error) {
        if (mutationId === latestMutationId.current) {
          setState((current) => ({
            notifications: current.notifications.map((notification) =>
              notification.id === id && notification.isRead
                ? { ...notification, isRead: false }
                : notification,
            ),
            serverUnreadCount:
              previousServerUnreadCount !== null
                ? clampUnreadCount(previousServerUnreadCount)
                : current.serverUnreadCount,
          }));
        }
        throw error;
      }
    },
    [reconcileAfterMutation],
  );

  const markAllAsRead = useCallback(async () => {
    const unreadIds = new Set(
      stateRef.current.notifications
        .filter((notification) => !notification.isRead)
        .map((notification) => notification.id),
    );
    const hasServerUnread =
      stateRef.current.serverUnreadCount !== null &&
      stateRef.current.serverUnreadCount > 0;

    if (unreadIds.size === 0 && !hasServerUnread) return;

    const mutationId = ++latestMutationId.current;
    const previousServerUnreadCount = stateRef.current.serverUnreadCount;

    setState((current) => ({
      notifications: current.notifications.map((notification) =>
        unreadIds.has(notification.id) && !notification.isRead
          ? { ...notification, isRead: true }
          : notification,
      ),
      serverUnreadCount: current.serverUnreadCount !== null ? 0 : null,
    }));

    try {
      const response = await markAllNotificationsAsRead();
      await reconcileAfterMutation(mutationId, response);
    } catch (error) {
      if (mutationId === latestMutationId.current) {
        setState((current) => ({
          notifications: current.notifications.map((notification) =>
            unreadIds.has(notification.id) && notification.isRead
              ? { ...notification, isRead: false }
              : notification,
          ),
          serverUnreadCount:
            previousServerUnreadCount !== null
              ? clampUnreadCount(previousServerUnreadCount)
              : current.serverUnreadCount,
        }));
      }
      throw error;
    }
  }, [reconcileAfterMutation]);

  const value: NotificationContextValue = useMemo(
    () => ({
      notifications: state.notifications,
      unreadCount,
      setNotifications,
      updateNotification,
      markAsRead,
      markAllAsRead,
      reconcile,
    }),
    [
      state.notifications,
      unreadCount,
      setNotifications,
      updateNotification,
      markAsRead,
      markAllAsRead,
      reconcile,
    ],
  );

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}

/**
 * Hook to access the notifications context.
 * Returns notifications, unread count, and actions to update them.
 */
export function useNotifications(): NotificationContextValue {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error("useNotifications must be used within a NotificationProvider");
  }
  return context;
}
