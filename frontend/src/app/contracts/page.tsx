import Link from "next/link";

import Footer from "@/component/Footer";
import Header from "@/component/Header";
import PageBackground from "@/component/PageBackground";

const CONTRACT_MODULES = [
  {
    name: "Market",
    description:
      "Manages prediction market creation, lifecycle, and outcome resolution. The core contract powering every market on InsightArena.",
  },
  {
    name: "Prediction",
    description:
      "Records user predictions, stake amounts, and computes payouts based on market outcomes and pool share.",
  },
  {
    name: "Escrow",
    description:
      "Holds staked XLM in trust until a market resolves. Ensures funds are only released to winners or refunded on cancellation.",
  },
  {
    name: "Season",
    description:
      "Tracks reputation-point accumulation across a time-bounded season and distributes season-end rewards.",
  },
  {
    name: "Invite",
    description:
      "Manages referral codes and invite-based onboarding bonuses, incentivising community growth.",
  },
  {
    name: "Governance",
    description:
      "Allows token holders to vote on protocol parameters such as fee rates, oracle sources, and feature flags.",
  },
  {
    name: "Liquidity",
    description:
      "Provides automated market-making depth so thin markets still offer competitive odds on both sides.",
  },
  {
    name: "Dispute",
    description:
      "Enables users to challenge market resolutions they believe are incorrect, triggering a decentralised arbitration process.",
  },
];

const DEPLOYED_ADDRESSES = [
  {
    network: "Testnet",
    contractId: "CXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
    status: "Active",
  },
  {
    network: "Mainnet",
    contractId: "TBD",
    status: "Pending",
  },
];

export default function ContractsPage() {
  return (
    <PageBackground>
      <Header />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-20 space-y-20">
        {/* Hero */}
        <section className="text-center space-y-4">
          <h1 className="text-4xl sm:text-5xl font-bold text-white">
            Smart Contracts
          </h1>
          <p className="text-lg text-gray-400 max-w-2xl mx-auto">
            InsightArena is built on Soroban — Stellar&rsquo;s smart-contract
            platform. Every market, prediction, and payout is governed by
            open-source, auditable on-chain logic.
          </p>
        </section>

        {/* Contract Modules */}
        <section className="space-y-6">
          <h2 className="text-2xl font-semibold text-white">Contract Modules</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {CONTRACT_MODULES.map((mod) => (
              <div
                key={mod.name}
                className="rounded-xl border border-white/10 bg-white/5 p-5 space-y-2 hover:border-blue-500/40 transition-colors"
              >
                <h3 className="text-lg font-semibold text-blue-400">
                  {mod.name}
                </h3>
                <p className="text-sm text-gray-400">{mod.description}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Deployed Addresses */}
        <section className="space-y-6">
          <h2 className="text-2xl font-semibold text-white">
            Deployed Addresses
          </h2>
          <div className="overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full text-sm text-left">
              <thead className="bg-white/5 text-gray-400 uppercase text-xs tracking-wider">
                <tr>
                  <th className="px-4 py-3">Network</th>
                  <th className="px-4 py-3">Contract ID</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {DEPLOYED_ADDRESSES.map((row) => (
                  <tr key={row.network} className="bg-black/20 hover:bg-white/5">
                    <td className="px-4 py-3 text-white font-medium">
                      {row.network}
                    </td>
                    <td className="px-4 py-3 text-gray-300 font-mono text-xs">
                      {row.contractId}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${
                          row.status === "Active"
                            ? "bg-emerald-500/20 text-emerald-400"
                            : "bg-yellow-500/20 text-yellow-400"
                        }`}
                      >
                        {row.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Security */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-white">Security</h2>
          <div className="rounded-xl border border-white/10 bg-white/5 p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <p className="text-gray-300 text-sm">
                All InsightArena contracts are open-source and available for
                public review on GitHub.
              </p>
              <p className="text-gray-500 text-xs">
                A third-party security audit is currently in progress.
              </p>
            </div>
            <span className="shrink-0 inline-flex items-center gap-2 rounded-full border border-yellow-500/40 bg-yellow-500/10 px-3 py-1 text-xs font-semibold text-yellow-400">
              <span className="size-2 rounded-full bg-yellow-400 animate-pulse" />
              Audit Pending
            </span>
          </div>
        </section>

        {/* Source Code */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-white">Source Code</h2>
          <p className="text-gray-400 text-sm">
            The full contract source is available on GitHub. Contributions and
            security disclosures are welcome.
          </p>
          <Link
            href="https://github.com/Arena1X/InsightArena/tree/main/contract"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg border border-blue-500/40 bg-blue-500/10 px-4 py-2 text-sm font-semibold text-blue-400 hover:bg-blue-500/20 transition-colors"
          >
            View on GitHub →
          </Link>
        </section>
      </main>

      <Footer />
    </PageBackground>
  );
}
