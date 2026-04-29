"use client";

import RewardsWalletCard from "@/component/RewardsWalletCard";
import NotificationsCard from "@/component/NotificationsCard";
import { useWallet } from "@/context/WalletContext";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  ChevronDown,
  BarChart3,
  Gift,
  LayoutDashboard,
  Menu,
  Settings,
  Sword,
  Trophy,
  User,
  Wallet,
  X,
  Home,
} from "lucide-react";

function truncateAddress(address: string): string {
  if (address.length < 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

const navigation = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Markets", href: "/markets", icon: BarChart3 },
  { label: "My Predictions", href: "/my-predictions", icon: Sword },
  { label: "Competitions", href: "/competitions", icon: Trophy },
  { label: "Leaderboards", href: "/leaderboards", icon: BarChart3 },
  { label: "Rewards", href: "/rewards", icon: Gift },
  { label: "Wallet", href: "/wallet", icon: Wallet },
  { label: "Profile", href: "/profile", icon: User },
  { label: "Settings", href: "/settings", icon: Settings },
];

function Brand() {
  return (
    <Link
      href="/dashboard"
      className="flex items-center gap-3 rounded-2xl px-6 py-6 text-white transition hover:bg-white/5"
    >
      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-orange-500 text-xs font-bold text-white shadow-[0_0_0_6px_rgba(249,115,22,0.15)]">
        IA
      </span>
      <div className="min-w-0">
        <p className="truncate text-base font-semibold tracking-tight">
          InsightArena
        </p>
        <p className="text-xs text-gray-400">Prediction Markets</p>
      </div>
    </Link>
  );
}

type SidebarContentProps = {
  onNavigate?: () => void;
};

function SidebarContent({ onNavigate }: SidebarContentProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { address, logout } = useWallet();
  const [copied, setCopied] = useState(false);

  const handleCopyAddress = async () => {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy address:", err);
    }
  };

  const handleDisconnect = () => {
    logout();
    router.push("/");
  };

  return (
    <div className="flex h-full flex-col bg-transparent text-white">
      <div className="border-b border-white/10">
        <Brand />
      </div>

      <nav
        className="flex-1 space-y-1 overflow-y-auto px-3 py-5"
        aria-label="Dashboard navigation"
      >
        {navigation.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href;

          return (
            <Link
              key={href}
              href={href}
              onClick={onNavigate}
              aria-current={isActive ? "page" : undefined}
              className={`group relative flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition ${
                isActive
                  ? "bg-white/10 text-white shadow-[inset_3px_0_0_0_#f97316]"
                  : "text-gray-400 hover:bg-white/5 hover:text-white"
              }`}
            >
              <Icon
                className={`h-4 w-4 ${
                  isActive
                    ? "text-orange-400"
                    : "text-gray-500 group-hover:text-white"
                }`}
              />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-white/10 px-4 py-4">
        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4">
          <p className="text-xs uppercase tracking-[0.24em] text-gray-400">
            Connected
          </p>
          <div className="mt-2 flex items-center justify-between gap-2">
            <p
              className="truncate text-sm font-semibold text-white cursor-help"
              title={address ?? ""}
            >
              {address ? truncateAddress(address) : "Not connected"}
            </p>
            {address && (
              <button
                type="button"
                onClick={handleCopyAddress}
                aria-label="Copy wallet address"
                className="text-xs text-orange-400 hover:text-orange-300 transition"
                title={copied ? "Copied!" : "Copy address"}
              >
                {copied ? "✓" : "📋"}
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={handleDisconnect}
            aria-label="Disconnect wallet"
            className="mt-3 text-sm font-medium text-orange-400 transition hover:text-orange-300"
          >
            Disconnect
          </button>
        </div>
      </div>
    </div>
  );
}

function TopNavigation() {
  const { address, user } = useWallet();

  const displayName = user?.username ?? "Alex";

  return (
    <section className="border-b border-white/10 px-6">
      <div className="flex items-center justify-between gap-6 py-4">
        {/* Home button */}
        <Link
          href="/"
          className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-transparent p-3 text-white transition hover:bg-white/5 hover:border-orange-500/50 xl:self-start"
          aria-label="Go to homepage"
        >
          <Home className="h-5 w-5" />
        </Link>

        {/* Greeting — single line */}
        <h1 className="text-xl font-semibold tracking-tight text-white sm:text-2xl">
          Welcome back,{" "}
          <span className="text-orange-400 font-bold">{displayName}</span>
        </h1>

        {/* Actions */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            aria-label="Make a prediction"
            className="rounded-xl bg-orange-500/90 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-orange-500"
          >
            Make Prediction
          </button>
          <button
            type="button"
            aria-label="Create a competition"
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-transparent px-5 py-2.5 text-sm font-medium text-gray-400 transition hover:bg-white/5 hover:text-white"
          >
            Create Competition
            <ChevronDown className="h-4 w-4" />
          </button>
        </div>
      </div>
    </section>
  );
}

type DashboardShellProps = {
  children: ReactNode;
};

export function DashboardShell({ children }: DashboardShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  return (
    <div className="dark relative min-h-screen overflow-x-hidden bg-gradient-to-br from-gray-900 via-black to-gray-900 text-white">
      {/* Landing-page network lines background */}
      <div className="pointer-events-none absolute inset-0 z-0 h-full w-full">
        <svg
          className="h-full w-full opacity-15"
          viewBox="0 0 1000 1000"
          preserveAspectRatio="xMidYMid slice"
        >
          <defs>
            <linearGradient
              id="dashLineGradient"
              x1="0%"
              y1="0%"
              x2="100%"
              y2="100%"
            >
              <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.2" />
            </linearGradient>
          </defs>
          <path
            d="M100,200 Q300,100 500,200 T900,200"
            stroke="url(#dashLineGradient)"
            strokeWidth="2"
            fill="none"
          />
          <path
            d="M200,400 Q400,300 600,400 T1000,400"
            stroke="url(#dashLineGradient)"
            strokeWidth="2"
            fill="none"
          />
          <path
            d="M50,600 Q250,500 450,600 T850,600"
            stroke="url(#dashLineGradient)"
            strokeWidth="2"
            fill="none"
          />
          <path
            d="M150,800 Q350,700 550,800 T950,800"
            stroke="url(#dashLineGradient)"
            strokeWidth="2"
            fill="none"
          />
        </svg>
      </div>

      <div className="relative z-10 flex min-h-screen">
        <aside className="hidden w-[280px] shrink-0 border-r border-white/10 lg:fixed lg:inset-y-0 lg:flex">
          <div className="w-full">
            <SidebarContent />
          </div>
        </aside>

        <div className="flex min-h-screen w-full flex-col lg:pl-[280px]">
          <header className="sticky top-0 z-30 flex items-center justify-between border-b border-white/10 bg-gray-900/80 px-4 py-4 backdrop-blur lg:hidden">
            <Brand />
            <button
              type="button"
              aria-label="Open navigation menu"
              className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white"
              onClick={() => setMobileOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </button>
          </header>

          <div className="sticky top-[72px] z-20 bg-gray-900/80 backdrop-blur lg:top-0">
            <TopNavigation />
          </div>

          <div className="flex gap-6 p-6">
            <main id="dashboard-main-content" className="flex-1">
              {children}
            </main>

            {pathname === "/dashboard" && (
              <aside className="xl:block w-[300px] space-y-6">
                <RewardsWalletCard />
                <NotificationsCard />
              </aside>
            )}
          </div>
        </div>
      </div>

      <div
        className={`fixed inset-0 z-50 lg:hidden transition-[visibility] duration-300 ${
          mobileOpen ? "visible" : "invisible"
        }`}
        aria-hidden={!mobileOpen}
      >
        <button
          type="button"
          aria-label="Close navigation overlay"
          className={`absolute inset-0 bg-black/70 backdrop-blur-sm transition-opacity duration-300 ease-out ${
            mobileOpen ? "opacity-100" : "pointer-events-none opacity-0"
          }`}
          onClick={() => setMobileOpen(false)}
        />
        <div
          className={`relative h-full w-[86%] max-w-[320px] border-r border-white/10 shadow-[20px_0_80px_rgba(0,0,0,0.45)] transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
            mobileOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <button
            type="button"
            aria-label="Close navigation menu"
            className="absolute top-4 right-4 z-10 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white transition hover:bg-white/10"
            onClick={() => setMobileOpen(false)}
          >
            <X className="h-5 w-5" />
          </button>
          <SidebarContent onNavigate={() => setMobileOpen(false)} />
        </div>
      </div>
    </div>
  );
}
