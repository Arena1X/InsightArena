"use client";

import { useMemo, useState } from "react";
import { TrendingUp, Trophy, Gift, Users, Bell, Megaphone } from "lucide-react";
import { EmptyState } from "@/component/ui/empty-state";
import { Tabs, TabsList, TabsTrigger } from "@/component/ui/tabs";
import { useNotifications, type NotificationItem } from "@/context/NotificationContext";

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
  notifications: initialNotifications,
}: NotificationsCardProps) {
  const context = useNotifications();
  // Use prop if provided (for testing), otherwise use context
  const notifications = initialNotifications ?? context.notifications;
  const contextUnreadCount = context.unreadCount;
  
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
    setMarkAllError(null);

    try {
      // Call the context's markAllAsRead which handles optimistic update and rollback
      await context.markAllAsRead();
    } catch (error) {
      setMarkAllError(
        error instanceof Error
          ? error.message
          : "Couldn't mark notifications as read. Please try again.",
      );
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
