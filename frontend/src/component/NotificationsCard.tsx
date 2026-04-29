"use client";

import { TrendingUp, Trophy, Gift, Users } from "lucide-react";

interface NotificationItem {
  id: string;
  type: "market" | "competition" | "reward" | "social";
  icon: "trend" | "trophy" | "gift" | "users";
  message: string;
  timestamp: string;
  isRead: boolean;
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
};

const iconColorMap = {
  trend: "text-orange-400",
  trophy: "text-orange-400",
  gift: "text-yellow-400",
  users: "text-gray-300",
};

const iconBgMap = {
  trend: "bg-orange-500/10",
  trophy: "bg-orange-500/10",
  gift: "bg-yellow-500/10",
  users: "bg-white/10",
};

export default function NotificationsCard() {
  const unreadCount = mockNotifications.filter((n) => !n.isRead).length;

  return (
    <div className="relative rounded-2xl border border-white/10 bg-white/5 p-6 w-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-white font-semibold text-lg">Notifications</h2>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <div className="w-2 h-2 bg-orange-400 rounded-full" />
          )}
          <div className="w-2 h-2 bg-red-500 rounded-full" />
        </div>
      </div>

      {/* Notifications List */}
      <div className="space-y-0">
        {mockNotifications.map((notification, index) => {
          const IconComponent = iconMap[notification.icon];
          const isLast = index === mockNotifications.length - 1;

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
    </div>
  );
}
