"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import { markAllNotificationsAsRead } from "@/lib/api";

export interface NotificationItem {
  id: string;
  type: "market" | "competition" | "reward" | "social" | "dispute" | "system";
  icon: "trend" | "trophy" | "gift" | "users" | "megaphone";
  message: string;
  timestamp: string;
  isRead: boolean;
}

export interface NotificationContextValue {
  notifications: NotificationItem[];
  unreadCount: number;
  setNotifications: (notifications: NotificationItem[]) => void;
  updateNotification: (id: string, updates: Partial<NotificationItem>) => void;
  markAllAsRead: () => Promise<void>;
}

const DEFAULT_CONTEXT_VALUE: NotificationContextValue = {
  notifications: [],
  unreadCount: 0,
  setNotifications: () => {},
  updateNotification: () => {},
  markAllAsRead: async () => {},
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

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [notifications, setNotifications] = useState<NotificationItem[]>(
    mockNotifications,
  );
  const markAllRequestId = useRef(0);

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.isRead).length,
    [notifications],
  );

  const updateNotification = useCallback(
    (id: string, updates: Partial<NotificationItem>) => {
      setNotifications((current) =>
        current.map((n) =>
          n.id === id ? { ...n, ...updates } : n,
        ),
      );
    },
    [],
  );

  const markAllAsRead = useCallback(async () => {
    const unreadIds = new Set(
      notifications
        .filter((notification) => !notification.isRead)
        .map((notification) => notification.id),
    );
    if (unreadIds.size === 0) return;
    const requestId = ++markAllRequestId.current;

    setNotifications((current) =>
      current.map((notification) =>
        unreadIds.has(notification.id) && !notification.isRead
          ? { ...notification, isRead: true }
          : notification,
      ),
    );

    try {
      await markAllNotificationsAsRead();
    } catch (error) {
      if (requestId === markAllRequestId.current) {
        setNotifications((current) =>
          current.map((notification) =>
            unreadIds.has(notification.id) && notification.isRead
              ? { ...notification, isRead: false }
              : notification,
          ),
        );
      }
      throw error;
    }
  }, [notifications]);

  const value: NotificationContextValue = useMemo(
    () => ({
      notifications,
      unreadCount,
      setNotifications,
      updateNotification,
      markAllAsRead,
    }),
    [notifications, unreadCount, updateNotification, markAllAsRead],
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
