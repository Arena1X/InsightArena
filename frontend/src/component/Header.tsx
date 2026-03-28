"use client";

import Link from "next/link";

export default function Header() {
  const navLinks = [
    { name: "Home", link: "/" },
    { name: "Events", link: "/events" },
    { name: "Leaderboard", link: "/lead" },
    { name: "Docs", link: "/docs" },
    { name: "Dashboard", link: "/dashboard" },
  ];
  return (
    <header className="fixed top-0 left-0 right-0 z-50 border-b border-gray-800 bg-black/80 backdrop-blur-sm">
      <div className="max-w-7xl mx-auto px-6 py-4">
        <nav
          className="flex items-center justify-between"
          aria-label="Primary navigation"
        >
          <div>
            <Link
              href="/"
              className="text-xl font-bold text-white hover:text-[#4FD1C5] transition-colors"
              aria-label="Go to InsightArena homepage"
            >
              InsightArena
            </Link>
          </div>
          <div>
            <div className="hidden md:flex items-center space-x-6">
              {navLinks.map((link) => (
                <Link
                  key={link.name}
                  href={link.link}
                  className="text-gray-200 transition-colors hover:text-white"
                >
                  {link.name}
                </Link>
              ))}
            </div>
          </div>

          <button
            type="button"
            aria-label="Connect wallet"
            className="rounded-lg bg-orange-500 px-6 py-2 font-semibold text-white transition-colors hover:bg-orange-600"
          >
            Connect Wallet
          </button>
        </nav>
      </div>
    </header>
  );
}
