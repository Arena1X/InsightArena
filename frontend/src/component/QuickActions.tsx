"use client";

/**
 * QuickActions — contextually relevant shortcuts for the dashboard.
 *
 * Issue #1559: shows only actions the current user can actually perform,
 * ordered by role + recent activity.  Hidden actions surface a tooltip
 * explaining why in development builds.
 */

import React from "react";
import {
  DEFAULT_ACTIVITY,
  type RecentActivity,
  type UserRole,
  useQuickActions,
} from "@/hooks/useQuickActions";
import { useRouter } from "next/navigation";

// ── Props ─────────────────────────────────────────────────────────────────────

interface QuickActionsProps {
  /**
   * Signals about what the user has been doing recently.  The parent component
   * (or a data-fetching hook) should supply these based on live data.
   * Defaults to the zero-activity baseline so the component is safe to render
   * without a data fetch.
   */
  activity?: RecentActivity;
  /**
   * Optional role override — useful for testing or for passing in a role
   * resolved from an on-chain lookup in the parent.
   */
  roleOverride?: UserRole;
}

// ── Component ─────────────────────────────────────────────────────────────────

const QuickActions = ({
  activity = DEFAULT_ACTIVITY,
  roleOverride,
}: QuickActionsProps) => {
  const router = useRouter();
  const isDev = process.env.NODE_ENV !== "production";

  // Map action ids to navigation/callbacks.  Kept here so the hook stays
  // free of routing concerns and remains easily testable.
  const handleAction = (id: string): (() => void) | undefined => {
    const routes: Record<string, string> = {
      "make-prediction":  "/markets",
      "create-market":    "/markets/create",
      "resolve-market":   "/oracle",
      "claim-rewards":    "/rewards",
      "join-invite":      "/invite",
      "leaderboard":      "/leaderboards",
      "my-markets":       "/my-markets",
      "oracle-settings":  "/settings/oracle",
    };
    const route = routes[id];
    return route ? () => router.push(route) : undefined;
  };

  const { visible, hidden, role } = useQuickActions(
    activity,
    roleOverride,
    handleAction,
  );

  return (
    <section className="mt-10 mb-6 px-4" data-testid="quick-actions">
      <h2 className="text-center text-white text-xl font-bold mb-6">
        Quick Actions
      </h2>

      {/* Visible actions */}
      <div
        className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-5xl mx-auto"
        data-role={isDev ? role : undefined}
      >
        {visible.map((action) => (
          <button
            key={action.id}
            type="button"
            data-testid={`quick-action-${action.id}`}
            aria-label={action.label}
            onClick={action.onClick}
            className={`${action.bg} aspect-square rounded-2xl border flex flex-col items-center justify-center p-4 transition-colors relative`}
          >
            <div className={`${action.text} mb-2`}>
              <action.Icon size={28} />
            </div>
            <span
              className={`${action.text} text-sm font-medium text-center leading-tight`}
            >
              {action.label}
            </span>
          </button>
        ))}
      </div>

      {/* Dev-only: show hidden actions with tooltip */}
      {isDev && hidden.length > 0 && (
        <div
          className="mt-4 max-w-5xl mx-auto"
          data-testid="quick-actions-hidden"
          aria-hidden="true"
        >
          <p className="text-xs text-gray-600 mb-2 text-center">
            Hidden actions (dev only):
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 opacity-30">
            {hidden.map((action) => (
              <div
                key={action.id}
                title={action.hiddenReason}
                data-testid={`hidden-action-${action.id}`}
                className="aspect-square rounded-2xl border border-white/5 bg-white/2 flex flex-col items-center justify-center p-4 cursor-not-allowed relative"
              >
                <div className="text-gray-600 mb-2">
                  <action.Icon size={28} />
                </div>
                <span className="text-gray-600 text-sm font-medium text-center leading-tight">
                  {action.label}
                </span>
                {/* Tooltip icon */}
                <span
                  className="absolute top-2 right-2 text-[10px] text-gray-500 border border-gray-700 rounded-full w-4 h-4 flex items-center justify-center"
                  title={action.hiddenReason}
                >
                  ?
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
};

export default QuickActions;
