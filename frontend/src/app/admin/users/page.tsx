"use client";

import { useCallback, useEffect, useState } from "react";
import { Flag, ShieldOff, ShieldCheck, Search, Loader2 } from "lucide-react";

import AdminGuard from "@/component/admin/AdminGuard";
import { ConfirmDialog } from "@/component/ui/confirm-dialog";
import { useDebounce } from "@/hooks/useDebounce";
import { useWallet } from "@/context/WalletContext";
import {
  listAdminUsers,
  banAdminUser,
  unbanAdminUser,
  flagAdminUser,
  type AdminUser,
} from "@/lib/api";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PendingAction =
  | { kind: "ban"; user: AdminUser }
  | { kind: "unban"; user: AdminUser }
  | { kind: "flag"; user: AdminUser };

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatusBadge({ isBanned }: { isBanned: boolean }) {
  return (
    <span
      className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
        isBanned
          ? "bg-rose-500/15 text-rose-300"
          : "bg-emerald-500/15 text-emerald-300"
      }`}
    >
      {isBanned ? "Banned" : "Active"}
    </span>
  );
}

function ActionButtons({
  user,
  onBan,
  onUnban,
  onFlag,
  busy,
}: {
  user: AdminUser;
  onBan: (user: AdminUser) => void;
  onUnban: (user: AdminUser) => void;
  onFlag: (user: AdminUser) => void;
  busy: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      {user.is_banned ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => onUnban(user)}
          aria-label={`Unban ${user.username ?? user.stellar_address}`}
          className="flex items-center gap-1.5 rounded-2xl bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-50"
        >
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
          Unban
        </button>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => onBan(user)}
          aria-label={`Ban ${user.username ?? user.stellar_address}`}
          className="flex items-center gap-1.5 rounded-2xl bg-rose-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-rose-400 disabled:opacity-50"
        >
          <ShieldOff className="h-3.5 w-3.5" aria-hidden="true" />
          Ban
        </button>
      )}
      <button
        type="button"
        disabled={busy}
        onClick={() => onFlag(user)}
        aria-label={`Flag ${user.username ?? user.stellar_address} for review`}
        className="flex items-center gap-1.5 rounded-2xl border border-orange-500/30 bg-orange-500/10 px-3 py-1.5 text-xs font-semibold text-orange-300 transition hover:bg-orange-500/20 disabled:opacity-50"
      >
        <Flag className="h-3.5 w-3.5" aria-hidden="true" />
        Flag
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page (inner — rendered after AdminGuard confirms access)
// ---------------------------------------------------------------------------

function AdminUsersPageInner() {
  const { token } = useWallet();

  // Search / pagination state
  const [rawSearch, setRawSearch] = useState("");
  const debouncedSearch = useDebounce(rawSearch, 400);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;

  // Data state
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Action state
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  // Track which user IDs are currently being mutated for per-row busy state
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());

  // ---------------------------------------------------------------------------
  // Fetch users
  // ---------------------------------------------------------------------------

  const fetchUsers = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    setFetchError(null);
    try {
      const result = await listAdminUsers(
        { search: debouncedSearch || undefined, page, limit: PAGE_SIZE },
        token,
      );
      setUsers(result.data);
      setTotalPages(result.meta.totalPages);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load users.";
      setFetchError(msg);
    } finally {
      setIsLoading(false);
    }
  }, [token, debouncedSearch, page]);

  // Re-fetch when debounced search or page changes
  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // Reset to page 1 when search term changes
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  // ---------------------------------------------------------------------------
  // Action handlers
  // ---------------------------------------------------------------------------

  function handleBan(user: AdminUser) {
    setActionError(null);
    setPendingAction({ kind: "ban", user });
  }
  function handleUnban(user: AdminUser) {
    setActionError(null);
    setPendingAction({ kind: "unban", user });
  }
  function handleFlag(user: AdminUser) {
    setActionError(null);
    setPendingAction({ kind: "flag", user });
  }

  async function handleConfirm(reason?: string) {
    if (!pendingAction || !token) return;
    const { kind, user } = pendingAction;

    setPendingAction(null);
    setActionBusy(true);
    setBusyIds((prev) => new Set(prev).add(user.id));
    setActionError(null);

    try {
      if (kind === "ban") {
        const updated = await banAdminUser(user.id, reason!, token);
        setUsers((prev) =>
          prev.map((u) => (u.id === updated.id ? updated : u)),
        );
      } else if (kind === "unban") {
        const updated = await unbanAdminUser(user.id, token);
        setUsers((prev) =>
          prev.map((u) => (u.id === updated.id ? updated : u)),
        );
      } else {
        await flagAdminUser(user.id, reason!, token);
        // Flag doesn't change ban state; just show success by refreshing
        await fetchUsers();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Action failed.";
      setActionError(msg);
    } finally {
      setActionBusy(false);
      setBusyIds((prev) => {
        const next = new Set(prev);
        next.delete(user.id);
        return next;
      });
    }
  }

  function handleCancel() {
    setPendingAction(null);
  }

  // ---------------------------------------------------------------------------
  // Dialog config derived from pendingAction
  // ---------------------------------------------------------------------------

  const dialogOpen = pendingAction !== null;

  const dialogProps = (() => {
    if (!pendingAction) return null;
    const displayName =
      pendingAction.user.username ??
      pendingAction.user.stellar_address.slice(0, 12) + "…";

    if (pendingAction.kind === "ban") {
      return {
        title: `Ban ${displayName}?`,
        description:
          "This will immediately restrict the user from the platform. You must provide a reason.",
        confirmLabel: "Ban user",
        variant: "destructive" as const,
        reasonLabel: "Reason for ban",
        reasonPlaceholder: "Describe why this account is being banned…",
      };
    }
    if (pendingAction.kind === "unban") {
      return {
        title: `Unban ${displayName}?`,
        description: "This will restore the user's access to the platform.",
        confirmLabel: "Unban user",
        variant: "default" as const,
        reasonLabel: undefined,
        reasonPlaceholder: undefined,
      };
    }
    // flag
    return {
      title: `Flag ${displayName} for review?`,
      description:
        "A flag will queue this account for manual moderation review.",
      confirmLabel: "Submit flag",
      variant: "destructive" as const,
      reasonLabel: "Reason for flag",
      reasonPlaceholder: "Describe the concern with this account…",
    };
  })();

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <section className="space-y-8" data-testid="admin-users-page">
      {/* Header */}
      <header className="rounded-3xl border border-white/10 bg-slate-950/90 p-8 shadow-xl">
        <p className="text-sm uppercase tracking-[0.3em] text-orange-400/90">
          User management
        </p>
        <h1 className="mt-3 text-3xl font-semibold text-white">
          Search and moderate users
        </h1>
        <p className="mt-3 max-w-2xl text-sm text-gray-400">
          Lookup wallet addresses, check reputation, and ban, unban, or flag
          users for review.
        </p>
      </header>

      {/* Search bar */}
      <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-white">Search users</h2>
            <p className="mt-2 text-sm text-gray-400">
              Filter by wallet address or username.
            </p>
          </div>
          <div className="relative w-full max-w-md">
            <Search
              className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500"
              aria-hidden="true"
            />
            <label htmlFor="user-search" className="sr-only">
              Search by wallet address or username
            </label>
            <input
              id="user-search"
              type="search"
              value={rawSearch}
              onChange={(e) => setRawSearch(e.target.value)}
              placeholder="Address or username…"
              aria-label="Search by wallet address or username"
              className="w-full rounded-3xl border border-white/10 bg-slate-950/80 py-3 pl-10 pr-4 text-white outline-none transition focus:border-orange-400 focus:ring-2 focus:ring-orange-400/20"
            />
            {isLoading && (
              <Loader2
                className="absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-gray-500"
                aria-hidden="true"
              />
            )}
          </div>
        </div>
      </div>

      {/* Action error banner */}
      {actionError && (
        <div
          role="alert"
          className="rounded-2xl border border-rose-500/20 bg-rose-500/5 px-4 py-3 text-sm text-rose-400"
        >
          {actionError}
        </div>
      )}

      {/* Users table */}
      <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-white">
              Reputation &amp; status
            </h2>
            <p className="mt-2 text-sm text-gray-400">
              Manage account access quickly.
            </p>
          </div>
          <span className="rounded-full bg-white/5 px-3 py-1 text-sm text-gray-300">
            {isLoading ? "Loading…" : `${users.length} records shown`}
          </span>
        </div>

        <div className="mt-6 overflow-hidden rounded-3xl border border-white/10 bg-slate-950/90">
          {fetchError ? (
            <p
              role="alert"
              className="p-6 text-center text-sm text-rose-400"
            >
              {fetchError}
            </p>
          ) : (
            <table
              className="min-w-full text-left text-sm text-gray-200"
              aria-label="Users table"
            >
              <thead className="bg-slate-950/90 text-gray-400">
                <tr>
                  <th scope="col" className="px-4 py-4">
                    Address / Username
                  </th>
                  <th scope="col" className="px-4 py-4 hidden sm:table-cell">
                    Reputation
                  </th>
                  <th scope="col" className="px-4 py-4 hidden md:table-cell">
                    Predictions
                  </th>
                  <th scope="col" className="px-4 py-4">
                    Status
                  </th>
                  <th scope="col" className="px-4 py-4">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {isLoading && users.length === 0 ? (
                  // Skeleton rows while loading
                  [...Array(5)].map((_, i) => (
                    <tr
                      key={i}
                      className="animate-pulse border-t border-white/5"
                    >
                      {[...Array(5)].map((__, j) => (
                        <td key={j} className="px-4 py-4">
                          <div className="h-4 rounded bg-white/10" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : users.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-10 text-center text-sm text-gray-500"
                    >
                      No users found
                      {rawSearch ? ` matching "${rawSearch}"` : ""}.
                    </td>
                  </tr>
                ) : (
                  users.map((user) => (
                    <tr
                      key={user.id}
                      data-testid={`user-row-${user.id}`}
                      className="border-t border-white/5 hover:bg-white/5"
                    >
                      <td className="px-4 py-4">
                        <div className="flex flex-col gap-0.5">
                          {user.username && (
                            <span className="font-medium text-white">
                              {user.username}
                            </span>
                          )}
                          <span className="break-all text-xs text-gray-400">
                            {user.stellar_address}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-gray-300 hidden sm:table-cell">
                        {user.reputation_score}
                      </td>
                      <td className="px-4 py-4 text-gray-300 hidden md:table-cell">
                        {user.total_predictions}
                      </td>
                      <td className="px-4 py-4">
                        <StatusBadge isBanned={user.is_banned} />
                      </td>
                      <td className="px-4 py-4">
                        <ActionButtons
                          user={user}
                          onBan={handleBan}
                          onUnban={handleUnban}
                          onFlag={handleFlag}
                          busy={
                            actionBusy || busyIds.has(user.id)
                          }
                        />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-4 flex items-center justify-between text-sm text-gray-400">
            <button
              type="button"
              disabled={page <= 1 || isLoading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded-xl border border-white/10 px-3 py-1.5 transition hover:bg-white/5 disabled:opacity-40"
            >
              ← Previous
            </button>
            <span>
              Page {page} of {totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages || isLoading}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="rounded-xl border border-white/10 px-3 py-1.5 transition hover:bg-white/5 disabled:opacity-40"
            >
              Next →
            </button>
          </div>
        )}
      </div>

      {/* Confirmation dialog */}
      {dialogProps && (
        <ConfirmDialog
          open={dialogOpen}
          title={dialogProps.title}
          description={dialogProps.description}
          confirmLabel={dialogProps.confirmLabel}
          variant={dialogProps.variant}
          reasonLabel={dialogProps.reasonLabel}
          reasonPlaceholder={dialogProps.reasonPlaceholder}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
        />
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Default export — wrapped in AdminGuard
// ---------------------------------------------------------------------------

export default function AdminUsersPage() {
  return (
    <AdminGuard>
      <AdminUsersPageInner />
    </AdminGuard>
  );
}
