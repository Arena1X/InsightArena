/**
 * useQuickActions — derives the contextually relevant quick-action set from
 * the current user's role and recent activity.
 *
 * Issue #1559: QuickActions must not surface actions the user cannot perform.
 *
 * Rules
 * ─────
 * 1. Each action carries a `requiredRole` list.  The action is hidden when the
 *    user's role is NOT in that list.
 * 2. Actions that are hidden for role reasons carry a `hiddenReason` string
 *    that is shown only in dev builds (NODE_ENV !== "production") via a tooltip.
 * 3. Visible actions are ordered by `priority` (lower = higher in the list).
 *    Actions that match the user's recent activity are hoisted by subtracting
 *    an `activityBoost` from their base priority.
 * 4. The "View Slip" entry is synthetic — it only appears when the prediction
 *    slip has items and is always placed last.
 */

import { usePredictionSlip } from "@/context/PredictionSlipContext";
import { useWallet } from "@/context/WalletContext";
import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  Gift,
  PlusCircle,
  RefreshCw,
  Settings,
  ShoppingCart,
  Trophy,
  UserPlus,
  Zap,
} from "lucide-react";

// ── Role model ────────────────────────────────────────────────────────────────

export type UserRole =
  | "predictor"    // standard user — makes predictions, claims rewards
  | "creator"      // can create markets in addition to predicting
  | "oracle"       // resolves markets — cannot create or predict
  | "admin"        // all capabilities
  | "guest";       // unauthenticated — read-only

// ── Activity signal ───────────────────────────────────────────────────────────

export interface RecentActivity {
  /** True when the user has at least one open market they created. */
  hasOpenMarkets: boolean;
  /** True when the user has unclaimed rewards. */
  hasClaimableRewards: boolean;
  /** True when the user has unresolved markets awaiting oracle input. */
  hasPendingResolutions: boolean;
  /** Number of active predictions the user currently holds. */
  activePredictionCount: number;
}

export const DEFAULT_ACTIVITY: RecentActivity = {
  hasOpenMarkets: false,
  hasClaimableRewards: false,
  hasPendingResolutions: false,
  activePredictionCount: 0,
};

// ── Action definition ─────────────────────────────────────────────────────────

export interface QuickAction {
  id: string;
  label: string;
  Icon: LucideIcon;
  /** Tailwind classes for the button background / border. */
  bg: string;
  /** Tailwind class for the icon and label colour. */
  text: string;
  /** Base sort priority — lower appears first. */
  priority: number;
  /**
   * Roles that are allowed to see this action.
   * `["*"]` means visible to all authenticated roles.
   */
  requiredRoles: UserRole[] | ["*"];
  /**
   * Human-readable explanation of why this action is hidden for the current
   * role.  Shown only in non-production builds.
   */
  hiddenReason?: string;
  /** Called when the button is clicked. */
  onClick?: () => void;
}

// ── Static action catalogue ───────────────────────────────────────────────────

/** All possible quick actions.  Visibility is resolved at render time. */
const ACTION_CATALOGUE: Omit<QuickAction, "onClick">[] = [
  {
    id: "make-prediction",
    label: "Make Prediction",
    Icon: Zap,
    bg: "bg-orange-500/10 border-orange-500/20 hover:bg-orange-500/15",
    text: "text-orange-400",
    priority: 10,
    requiredRoles: ["predictor", "creator", "admin"],
    hiddenReason: "Oracles and guests cannot submit predictions.",
  },
  {
    id: "create-market",
    label: "Create Market",
    Icon: PlusCircle,
    bg: "bg-blue-500/10 border-blue-500/20 hover:bg-blue-500/15",
    text: "text-blue-400",
    priority: 20,
    requiredRoles: ["creator", "admin"],
    hiddenReason: "Only market creators and admins can open new markets.",
  },
  {
    id: "resolve-market",
    label: "Resolve Market",
    Icon: RefreshCw,
    bg: "bg-purple-500/10 border-purple-500/20 hover:bg-purple-500/15",
    text: "text-purple-400",
    priority: 15,
    requiredRoles: ["oracle", "admin"],
    hiddenReason: "Only oracle addresses can resolve markets.",
  },
  {
    id: "claim-rewards",
    label: "Claim Rewards",
    Icon: Gift,
    bg: "bg-yellow-500/10 border-yellow-500/20 hover:bg-yellow-500/15",
    text: "text-yellow-400",
    priority: 30,
    requiredRoles: ["predictor", "creator", "admin"],
    hiddenReason: "Oracles and guests do not accumulate prediction rewards.",
  },
  {
    id: "join-invite",
    label: "Join With Invite",
    Icon: UserPlus,
    bg: "bg-white/5 border-white/10 hover:bg-white/10",
    text: "text-gray-300",
    priority: 40,
    requiredRoles: ["*"],
  },
  {
    id: "leaderboard",
    label: "View Leaderboard",
    Icon: Trophy,
    bg: "bg-white/5 border-white/10 hover:bg-white/10",
    text: "text-gray-300",
    priority: 50,
    requiredRoles: ["*"],
  },
  {
    id: "my-markets",
    label: "My Markets",
    Icon: BarChart3,
    bg: "bg-white/5 border-white/10 hover:bg-white/10",
    text: "text-gray-300",
    priority: 35,
    requiredRoles: ["creator", "admin"],
    hiddenReason: "Only market creators have markets to manage.",
  },
  {
    id: "oracle-settings",
    label: "Oracle Settings",
    Icon: Settings,
    bg: "bg-purple-500/5 border-purple-500/15 hover:bg-purple-500/10",
    text: "text-purple-300",
    priority: 12,
    requiredRoles: ["oracle", "admin"],
    hiddenReason: "Only oracle addresses have oracle configuration.",
  },
];

// ── Role resolver ─────────────────────────────────────────────────────────────

/**
 * Derive the user role from available wallet context.
 *
 * In production this would call a backend or read an on-chain role field.
 * This thin shim derives a sensible default from the connection state so the
 * hook is testable without a real RPC call.
 */
export function resolveRole(
  isAuthenticated: boolean,
  address: string | null,
  /**
   * Optional role override injected in tests or from a real role-lookup result.
   * When omitted, falls back to the heuristic below.
   */
  roleOverride?: UserRole,
): UserRole {
  if (!isAuthenticated || !address) return "guest";
  if (roleOverride) return roleOverride;
  // Default authenticated users to "predictor".  A real implementation would
  // read a contract mapping or JWT claim.
  return "predictor";
}

// ── Visible / hidden partition ────────────────────────────────────────────────

function isAllowedForRole(action: Omit<QuickAction, "onClick">, role: UserRole): boolean {
  if (action.requiredRoles[0] === "*") return true;
  return (action.requiredRoles as UserRole[]).includes(role);
}

// ── Priority with activity boost ──────────────────────────────────────────────

function effectivePriority(
  action: Omit<QuickAction, "onClick">,
  activity: RecentActivity,
): number {
  let boost = 0;

  switch (action.id) {
    case "claim-rewards":
      if (activity.hasClaimableRewards) boost = 15; // hoist it near the top
      break;
    case "resolve-market":
      if (activity.hasPendingResolutions) boost = 10;
      break;
    case "make-prediction":
      if (activity.activePredictionCount > 0) boost = 5;
      break;
    case "my-markets":
      if (activity.hasOpenMarkets) boost = 12;
      break;
    default:
      break;
  }

  return action.priority - boost;
}

// ── Public hook ───────────────────────────────────────────────────────────────

export interface UseQuickActionsResult {
  /** Actions the user is allowed to perform, sorted by relevance. */
  visible: QuickAction[];
  /**
   * Actions hidden because of the current role.
   * Non-empty only in dev builds; always empty in production to keep the
   * bundle free of "why hidden" text.
   */
  hidden: (Omit<QuickAction, "onClick"> & { hiddenReason: string })[];
  role: UserRole;
}

export function useQuickActions(
  activity: RecentActivity = DEFAULT_ACTIVITY,
  /**
   * Optional role override — used in tests and for role-lookup results from
   * a parent component.
   */
  roleOverride?: UserRole,
  /** Callback factory — receives the action id, returns a click handler. */
  onAction?: (id: string) => (() => void) | undefined,
): UseQuickActionsResult {
  const { isAuthenticated, address } = useWallet();
  const { itemCount, toggleSlip } = usePredictionSlip();

  const role = resolveRole(isAuthenticated, address, roleOverride);
  const isDev = process.env.NODE_ENV !== "production";

  const visible: QuickAction[] = [];
  const hidden: (Omit<QuickAction, "onClick"> & { hiddenReason: string })[] = [];

  for (const action of ACTION_CATALOGUE) {
    if (isAllowedForRole(action, role)) {
      visible.push({
        ...action,
        priority: effectivePriority(action, activity),
        onClick: onAction?.(action.id),
      });
    } else if (isDev && action.hiddenReason) {
      hidden.push(action as Omit<QuickAction, "onClick"> & { hiddenReason: string });
    }
  }

  // Sort by effective priority (ascending).
  visible.sort((a, b) => a.priority - b.priority);

  // Synthetic "View Slip" entry — always last.
  if (itemCount > 0) {
    visible.push({
      id: "view-slip",
      label: `View Slip (${itemCount})`,
      Icon: ShoppingCart,
      bg: "bg-teal-500/10 border-teal-500/20 hover:bg-teal-500/15",
      text: "text-teal-400",
      priority: 9999,
      requiredRoles: ["*"],
      onClick: toggleSlip,
    });
  }

  return { visible, hidden, role };
}
