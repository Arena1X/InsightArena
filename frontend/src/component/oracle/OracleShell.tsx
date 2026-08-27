"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const navigationItems = [
  { href: "/oracle", label: "Dashboard" },
  { href: "/oracle/creator-events", label: "Pending Matches" },
];

type OracleShellProps = {
  children: ReactNode;
};

export default function OracleShell({ children }: OracleShellProps) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto flex min-h-screen max-w-[1700px] flex-col lg:flex-row">
        <aside className="w-full border-b border-white/10 bg-slate-950/95 lg:w-[280px] lg:border-r lg:border-b-0">
          <div className="border-b border-white/10 px-6 py-6">
            <p className="text-sm uppercase tracking-[0.35em] text-amber-300/70">
              AI Oracle
            </p>
            <h2 className="mt-4 text-2xl font-semibold text-white">
              InsightArena
            </h2>
            <p className="mt-2 text-sm text-gray-400">
              Submit match results for creator events.
            </p>
          </div>

          <nav className="space-y-1 px-4 py-6" aria-label="Oracle navigation">
            {navigationItems.map(({ href, label }) => {
              const isActive =
                pathname === href ||
                (href !== "/oracle" && pathname.startsWith(`${href}/`));
              return (
                <Link
                  key={href}
                  href={href}
                  className={`block rounded-2xl border px-4 py-3 text-sm font-medium transition ${
                    isActive
                      ? "border-amber-500/30 bg-amber-500/10 text-amber-300 shadow-sm shadow-amber-500/5"
                      : "border-transparent text-gray-300 hover:border-white/10 hover:bg-white/5 hover:text-white"
                  }`}
                  aria-current={isActive ? "page" : undefined}
                >
                  {label}
                </Link>
              );
            })}
          </nav>

          <div className="space-y-4 border-t border-white/10 px-6 py-6 text-sm text-gray-400">
            <div>
              <p className="font-semibold text-white">Oracle access</p>
              <p className="mt-2 text-xs leading-5 text-gray-400">
                Only the configured AI agent wallet can submit results.
              </p>
            </div>
          </div>
        </aside>

        <main className="flex-1 bg-slate-950/95 px-4 py-6 lg:px-8">
          <div className="mx-auto w-full max-w-[1240px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
