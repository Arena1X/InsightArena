"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

export default function Header() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const mobileMenuRef = useRef<HTMLDivElement | null>(null);

  const navLinks = [
    { name: "Home", link: "/" },
    { name: "Events", link: "/events" },
    { name: "Leaderboard", link: "/leaderboard" },
    { name: "Docs", link: "/docs" },
    { name: "Dashboard", link: "/dashboard" },
  ];

  useEffect(() => {
    if (!isMobileMenuOpen) {
      return;
    }

    const getFocusableElements = () => {
      if (!mobileMenuRef.current) {
        return [] as HTMLElement[];
      }

      return Array.from(
        mobileMenuRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      );
    };

    const focusableElements = getFocusableElements();
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    firstElement?.focus();

    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsMobileMenuOpen(false);
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const updatedFocusableElements = getFocusableElements();
      if (updatedFocusableElements.length === 0) {
        return;
      }

      const updatedFirst = updatedFocusableElements[0];
      const updatedLast =
        updatedFocusableElements[updatedFocusableElements.length - 1];
      const activeElement = document.activeElement;

      if (event.shiftKey && activeElement === updatedFirst) {
        event.preventDefault();
        updatedLast.focus();
      } else if (!event.shiftKey && activeElement === updatedLast) {
        event.preventDefault();
        updatedFirst.focus();
      }
    };

    document.addEventListener("keydown", handleKeydown);
    document.body.classList.add("overflow-hidden");

    return () => {
      document.removeEventListener("keydown", handleKeydown);
      document.body.classList.remove("overflow-hidden");
      menuButtonRef.current?.focus();
    };
  }, [isMobileMenuOpen]);

  return (
    <>
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

            <div className="flex items-center gap-3">
              <button
                ref={menuButtonRef}
                type="button"
                aria-label="Open mobile menu"
                aria-haspopup="dialog"
                aria-expanded={isMobileMenuOpen}
                aria-controls="mobile-navigation-menu"
                className="inline-flex md:hidden items-center justify-center rounded-lg border border-gray-700 p-2 text-white transition-colors hover:border-gray-500 hover:bg-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4FD1C5]"
                onClick={() => setIsMobileMenuOpen(true)}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="h-6 w-6"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M4 6h16M4 12h16M4 18h16"
                  />
                </svg>
              </button>

              <button
                type="button"
                aria-label="Connect wallet"
                className="hidden md:inline-flex rounded-lg bg-orange-500 px-6 py-2 font-semibold text-white transition-colors hover:bg-orange-600"
              >
                Connect Wallet
              </button>
            </div>
          </nav>
        </div>
      </header>

      <div
        className={`fixed inset-0 z-40 bg-black/60 transition-opacity duration-300 md:hidden ${
          isMobileMenuOpen
            ? "pointer-events-auto opacity-100"
            : "pointer-events-none opacity-0"
        }`}
        aria-hidden="true"
        onClick={() => setIsMobileMenuOpen(false)}
      />

      <div
        id="mobile-navigation-menu"
        ref={mobileMenuRef}
        role="dialog"
        aria-modal="true"
        aria-label="Mobile navigation menu"
        className={`fixed top-0 right-0 z-50 h-full w-80 max-w-[85vw] bg-zinc-950/95 border-l border-zinc-800 p-6 shadow-2xl transition-transform duration-300 ease-out md:hidden ${
          isMobileMenuOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="mb-8 flex items-center justify-between">
          <span className="text-lg font-semibold text-white">Menu</span>
          <button
            type="button"
            aria-label="Close mobile menu"
            className="rounded-lg border border-gray-700 p-2 text-white transition-colors hover:border-gray-500 hover:bg-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4FD1C5]"
            onClick={() => setIsMobileMenuOpen(false)}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="h-6 w-6"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 6l12 12M18 6L6 18"
              />
            </svg>
          </button>
        </div>

        <div className="flex flex-col gap-4">
          {navLinks.map((link) => (
            <Link
              key={link.name}
              href={link.link}
              className="rounded-md px-2 py-2 text-lg text-gray-200 transition-colors hover:bg-zinc-900 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4FD1C5]"
              onClick={() => setIsMobileMenuOpen(false)}
            >
              {link.name}
            </Link>
          ))}

          <button
            type="button"
            aria-label="Connect wallet"
            className="mt-2 rounded-lg bg-orange-500 px-6 py-3 font-semibold text-white transition-colors hover:bg-orange-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-300"
            onClick={() => setIsMobileMenuOpen(false)}
          >
            Connect Wallet
          </button>
        </div>
      </div>
    </>
  );
}
