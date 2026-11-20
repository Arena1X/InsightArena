"use client";

import { useMemo, useState } from "react";

const marketGroups = [
  {
    title: "Active markets",
    items: [
      {
        id: "MKT-112",
        title: "Will XLM hit 0.10 by Q4 2026?",
        volume: "480.2K",
        status: "Active",
      },
      {
        id: "MKT-147",
        title: "Will the InsightArena DAO approve the fee change?",
        volume: "260.8K",
        status: "Active",
      },
    ],
  },
  {
    title: "Pending markets",
    items: [
      {
        id: "MKT-189",
        title: "Will Stellar protocol activate new quorum?",
        volume: "34.5K",
        status: "Pending",
      },
    ],
  },
  {
    title: "Resolved markets",
    items: [
      {
        id: "MKT-087",
        title: "Will the 2026 global event close above 2.5M visitors?",
        volume: "598.6K",
        status: "Resolved",
      },
    ],
  },
  {
    title: "Disputed markets",
    items: [
      {
        id: "MKT-213",
        title: "Will the price feed oracle disagree on event outcome?",
        volume: "76.1K",
        status: "Disputed",
      },
    ],
  },
];

type BulkFailure = { id: string; reason: string };

// Simulated bulk endpoint. Replace with the real API call when available.
async function bulkSetFeatured(
  ids: string[],
  featured: boolean,
): Promise<{ failed: BulkFailure[] }> {
  const failed: BulkFailure[] = [];
  await Promise.all(
    ids.map(async (id) => {
      try {
        // Placeholder for the real request, e.g.:
        // await api.post(`/admin/markets/${id}/featured`, { featured });
        await Promise.resolve();
      } catch (error) {
        failed.push({
          id,
          reason: error instanceof Error ? error.message : "Request failed",
        });
      }
    }),
  );
  return { failed };
}

export default function AdminMarketsPage() {
  const actions = useMemo(
    () => ["Approve", "Reject", "Force Resolve"] as const,
    [],
  );

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [featured, setFeatured] = useState<Set<string>>(new Set());
  const [failures, setFailures] = useState<BulkFailure[]>([]);
  const [busy, setBusy] = useState(false);

  const handleAction = (marketId: string, action: string) => {
    alert(`Action: ${action} on ${marketId}`);
  };

  const toggleSelected = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleBulkFeature = async (nextFeatured: boolean) => {
    const ids = Array.from(selected);
    if (ids.length === 0 || busy) return;

    setBusy(true);
    setFailures([]);

    // Optimistic update: apply immediately to all selected rows.
    setFeatured((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => {
        if (nextFeatured) {
          next.add(id);
        } else {
          next.delete(id);
        }
      });
      return next;
    });

    const { failed } = await bulkSetFeatured(ids, nextFeatured);

    // Reconcile: revert only the rows that failed, keep successes.
    if (failed.length > 0) {
      setFeatured((prev) => {
        const next = new Set(prev);
        failed.forEach(({ id }) => {
          if (nextFeatured) {
            next.delete(id);
          } else {
            next.add(id);
          }
        });
        return next;
      });
    }

    setFailures(failed);
    setBusy(false);
  };

  return (
    <section className="space-y-8">
      <header className="rounded-3xl border border-white/10 bg-slate-950/90 p-8 shadow-xl">
        <p className="text-sm uppercase tracking-[0.3em] text-orange-400/90">Market moderation</p>
        <h1 className="mt-3 text-3xl font-semibold text-white">Review and act on markets</h1>
        <p className="mt-3 max-w-2xl text-sm text-gray-400">
          Use this dashboard to approve pending markets, monitor active listings, and resolve disputes.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-3 rounded-3xl border border-white/10 bg-slate-900/80 p-4">
        <span className="text-sm text-gray-300">
          {selected.size} selected
        </span>
        <button
          type="button"
          disabled={selected.size === 0 || busy}
          onClick={() => handleBulkFeature(true)}
          className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-gray-200 transition hover:border-orange-500/30 hover:bg-orange-500/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          Feature selected
        </button>
        <button
          type="button"
          disabled={selected.size === 0 || busy}
          onClick={() => handleBulkFeature(false)}
          className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-gray-200 transition hover:border-orange-500/30 hover:bg-orange-500/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          Unfeature selected
        </button>
      </div>

      {failures.length > 0 && (
        <div
          role="alert"
          className="rounded-3xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200"
        >
          <p className="font-medium">
            {failures.length} market{failures.length === 1 ? "" : "s"} failed to update:
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {failures.map(({ id, reason }) => (
              <li key={id}>
                <span className="font-mono">{id}</span> — {reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-2">
        {marketGroups.map((group) => (
          <div
            key={group.title}
            className="rounded-3xl border border-white/10 bg-slate-900/80 p-6 shadow-sm"
          >
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-white">{group.title}</h2>
                <p className="mt-1 text-sm text-gray-400">{group.items.length} markets</p>
              </div>
              <span className="rounded-full bg-white/5 px-3 py-1 text-sm text-gray-300">
                {group.title === "Active markets" ? "Live" : group.title}
              </span>
            </div>
            <div className="mt-6 space-y-4">
              {group.items.map((market) => (
                <div
                  key={market.id}
                  className="rounded-3xl border border-white/10 bg-slate-950/80 p-5"
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        aria-label={`Select ${market.id}`}
                        checked={selected.has(market.id)}
                        onChange={() => toggleSelected(market.id)}
                        className="mt-1 h-4 w-4 rounded border-white/20 bg-slate-900 text-orange-500 focus:ring-orange-500/40"
                      />
                      <div>
                        <p className="text-xs uppercase tracking-[0.32em] text-gray-500">{market.id}</p>
                        <h3 className="mt-2 text-lg font-semibold text-white">{market.title}</h3>
                        <p className="mt-1 text-sm text-gray-400">Volume: {market.volume} XLM</p>
                        {featured.has(market.id) && (
                          <span className="mt-2 inline-block rounded-full bg-orange-500/15 px-3 py-1 text-xs font-medium text-orange-300">
                            Featured
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {actions.map((label) => (
                        <button
                          key={label}
                          type="button"
                          onClick={() => handleAction(market.id, label)}
                          className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-gray-200 transition hover:border-orange-500/30 hover:bg-orange-500/10 hover:text-white"
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
