"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
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
    const previousNotifications = notifications;

    // Optimistic update: mark all as read immediately
    setNotifications((current) =>
      current.map((n) => ({ ...n, isRead: true })),
    );

    try {
      // Call the API to persist the change
      await markAllNotificationsAsRead();
    } catch (error) {
      // On error, roll back to the previous state
      setNotifications(previousNotifications);
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
