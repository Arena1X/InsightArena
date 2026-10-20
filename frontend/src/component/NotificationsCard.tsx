"use client";

import { useMemo, useState } from "react";
import { TrendingUp, Trophy, Gift, Users, Bell, Megaphone } from "lucide-react";
import { EmptyState } from "@/component/ui/empty-state";
import { Tabs, TabsList, TabsTrigger } from "@/component/ui/tabs";

interface NotificationItem {
  id: string;
  type: "market" | "competition" | "reward" | "social" | "dispute" | "system";
  icon: "trend" | "trophy" | "gift" | "users" | "megaphone";
  message: string;
  timestamp: string;
  isRead: boolean;
}

type NotificationCategory = "all" | "predictions" | "rewards" | "disputes" | "system";

const CATEGORY_TABS: { key: NotificationCategory; label: string }[] = [
  { key: "all", label: "All" },
  { key: "predictions", label: "Predictions" },
  { key: "rewards", label: "Rewards" },
  { key: "disputes", label: "Disputes" },
  { key: "system", label: "System" },
];

/** Maps a notification's underlying `type` to the tab category it belongs to. */
function categoryForType(type: NotificationItem["type"]): Exclude<NotificationCategory, "all"> {
  switch (type) {
    case "market":
    case "competition":
    case "social":
      return "predictions";
    case "reward":
      return "rewards";
    case "dispute":
      return "disputes";
    case "system":
      return "system";
  }
}

// Mock data matching the Figma design
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

const iconMap = {
  trend: TrendingUp,
  trophy: Trophy,
  gift: Gift,
  users: Users,
  megaphone: Megaphone,
};

const iconColorMap = {
  trend: "text-orange-400",
  trophy: "text-orange-400",
  gift: "text-yellow-400",
  users: "text-gray-300",
  megaphone: "text-blue-300",
};

const iconBgMap = {
  trend: "bg-orange-500/10",
  trophy: "bg-orange-500/10",
  gift: "bg-yellow-500/10",
  users: "bg-white/10",
  megaphone: "bg-blue-500/10",
};

interface NotificationsCardProps {
  notifications?: NotificationItem[];
}

export default function NotificationsCard({
  notifications: initialNotifications = mockNotifications,
}: NotificationsCardProps) {
  const [notifications, setNotifications] = useState(initialNotifications);
  const [activeCategory, setActiveCategory] = useState<NotificationCategory>("all");
  const [markAllError, setMarkAllError] = useState<string | null>(null);

  const unreadCountByCategory = useMemo(() => {
    const counts: Record<NotificationCategory, number> = {
      all: 0,
      predictions: 0,
      rewards: 0,
      disputes: 0,
      system: 0,
    };
    for (const notification of notifications) {
      if (notification.isRead) continue;
      counts.all += 1;
      counts[categoryForType(notification.type)] += 1;
    }
    return counts;
  }, [notifications]);

  const filteredNotifications = useMemo(() => {
    if (activeCategory === "all") return notifications;
    return notifications.filter((n) => categoryForType(n.type) === activeCategory);
  }, [notifications, activeCategory]);

  const unreadCount = unreadCountByCategory.all;

  async function handleMarkAllRead() {
    const previous = notifications;
    setMarkAllError(null);
    setNotifications((current) => current.map((n) => ({ ...n, isRead: true })));

    try {
      // No dedicated "mark all read" endpoint exists yet; this is the
      // integration point for one once the backend adds it.
      await Promise.resolve();
    } catch {
      setNotifications(previous);
      setMarkAllError("Couldn't mark notifications as read. Please try again.");
    }
  }

  return (
    <div className="relative rounded-2xl border border-white/10 bg-white/5 p-6 w-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-white font-semibold text-lg">Notifications</h2>
        <div className="flex items-center gap-3">
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={handleMarkAllRead}
              className="text-xs font-medium text-orange-300 hover:text-orange-200 transition-colors"
            >
              Mark all as read
            </button>
          )}
          <div className="w-2 h-2 bg-red-500 rounded-full" />
        </div>
      </div>

      {markAllError && (
        <p className="mb-3 text-xs text-red-400" role="alert">
          {markAllError}
        </p>
      )}

      {/* Category filter tabs */}
      <Tabs
        value={activeCategory}
        onValueChange={(value) => setActiveCategory(value as NotificationCategory)}
        className="mb-4"
      >
        <TabsList>
          {CATEGORY_TABS.map((tab) => {
            const count = unreadCountByCategory[tab.key];
            return (
              <TabsTrigger key={tab.key} value={tab.key} className="gap-1.5">
                {tab.label}
                {count > 0 && (
                  <span className="ml-1 rounded-full bg-orange-500/20 px-1.5 text-[10px] font-semibold text-orange-300">
                    {count}
                  </span>
                )}
              </TabsTrigger>
            );
          })}
        </TabsList>
      </Tabs>

      {/* Notifications List */}
      {filteredNotifications.length === 0 ? (
        <EmptyState
          icon={<Bell className="h-7 w-7" />}
          title="No notifications yet"
          description="We'll let you know when there's something new for you."
        />
      ) : (
        <div className="space-y-0">
          {filteredNotifications.map((notification, index) => {
            const IconComponent = iconMap[notification.icon];
            const isLast = index === filteredNotifications.length - 1;

            return (
              <div key={notification.id}>
                <div className="flex items-start gap-4 py-4">
                  {/* Icon Box */}
                  <div
                    className={`flex-shrink-0 w-10 h-10 rounded-xl ${iconBgMap[notification.icon]} flex items-center justify-center`}
                  >
                    <IconComponent
                      className={`h-5 w-5 ${iconColorMap[notification.icon]}`}
                    />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <p className="text-gray-300 text-sm leading-relaxed mb-1">
                      {notification.message}
                    </p>
                    <span className="text-xs text-gray-500">
                      {notification.timestamp}
                    </span>
                  </div>
                </div>

                {/* Divider line (subtle, matching Figma stroke color) */}
                {!isLast && <div className="border-b border-white/5 ml-14" />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
