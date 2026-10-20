"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const navigationItems = [
  { href: "/admin/dashboard", label: "Overview" },
  { href: "/admin/fees", label: "Creator Fees" },
  { href: "/admin/markets", label: "Markets" },
  { href: "/admin/users", label: "Users" },
];

type AdminShellProps = {
  children: ReactNode;
};

export default function AdminShell({ children }: AdminShellProps) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto flex min-h-screen max-w-[1700px] flex-col lg:flex-row">
        <aside className="w-full border-b border-white/10 bg-slate-950/95 lg:w-[280px] lg:border-r lg:border-b-0">
          <div className="border-b border-white/10 px-6 py-6">
            <p className="text-sm uppercase tracking-[0.35em] text-gray-400">Admin Console</p>
            <h2 className="mt-4 text-2xl font-semibold text-white">InsightArena</h2>
            <p className="mt-2 text-sm text-gray-400">Platform operations and support tools.</p>
          </div>

          <nav className="space-y-1 px-4 py-6" aria-label="Admin navigation">
            {navigationItems.map(({ href, label }) => {
              const isActive = pathname === href;

              return (
                <Link
                  key={href}
                  href={href}
                  className={`block rounded-2xl border px-4 py-3 text-sm font-medium transition ${
                    isActive
                      ? "border-orange-500/30 bg-orange-500/10 text-orange-300 shadow-sm shadow-orange-500/5"
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
              <p className="font-semibold text-white">Admin access</p>
              <p className="mt-2 text-xs leading-5 text-gray-400">
                Only allowlisted Stellar wallets can view these pages.
              </p>
            </div>
            <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-4">
              <p className="text-xs uppercase tracking-[0.28em] text-gray-500">Quick links</p>
              <ul className="mt-3 space-y-2 text-sm text-gray-300">
                <li>Dashboard metrics</li>
                <li>Fee schedule</li>
                <li>Market moderation</li>
                <li>User controls</li>
              </ul>
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
