"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

export default function Header() {
  const pathname = usePathname();

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

  const isActive = (path: string) => {
    if (path === "/") return pathname === "/";
    return pathname === path || pathname.startsWith(`${path}/`);
  };

  useEffect(() => {
    if (!isMobileMenuOpen) return;

    const getFocusableElements = () => {
      if (!mobileMenuRef.current) return [] as HTMLElement[];

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

      if (event.key !== "Tab") return;

      const updatedFocusableElements = getFocusableElements();
      if (updatedFocusableElements.length === 0) return;

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
            <Link
              href="/"
              className="text-xl font-bold text-white hover:text-[#4FD1C5]"
            >
              InsightArena
            </Link>

            {/* DESKTOP NAV */}
            <div className="hidden md:flex items-center space-x-6">
              {navLinks.map((link) => {
                const active = isActive(link.link);

                return (
                  <Link
                    key={link.name}
                    href={link.link}
                    aria-current={active ? "page" : undefined}
                    className={`relative transition-colors ${
                      active
                        ? "text-white font-semibold"
                        : "text-gray-200 hover:text-white"
                    }`}
                  >
                    {link.name}

                    {/* underline indicator */}
                    <span
                      className={`absolute left-0 right-0 -bottom-1 h-0.5 bg-orange-500 transition-opacity ${
                        active ? "opacity-100" : "opacity-0"
                      }`}
                    />
                  </Link>
                );
              })}
            </div>

            {/* RIGHT SIDE */}
            <div className="flex items-center gap-3">
              <button
                ref={menuButtonRef}
                type="button"
                aria-label="Open mobile menu"
                aria-haspopup="dialog"
                aria-expanded={isMobileMenuOpen}
                aria-controls="mobile-navigation-menu"
                className="inline-flex md:hidden rounded-lg border border-gray-700 p-2 text-white hover:bg-gray-900"
                onClick={() => setIsMobileMenuOpen(true)}
              >
                ☰
              </button>

              <button className="hidden md:inline-flex rounded-lg bg-orange-500 px-6 py-2 font-semibold text-white hover:bg-orange-600">
                Connect Wallet
              </button>
            </div>
          </nav>
        </div>
      </header>

      {/* OVERLAY */}
      <div
        className={`fixed inset-0 z-40 bg-black/60 transition-opacity md:hidden ${
          isMobileMenuOpen
            ? "opacity-100 pointer-events-auto"
            : "opacity-0 pointer-events-none"
        }`}
        onClick={() => setIsMobileMenuOpen(false)}
      />

      {/* MOBILE MENU */}
      <div
        ref={mobileMenuRef}
        className={`fixed top-0 right-0 z-50 h-full w-80 bg-zinc-950 p-6 transition-transform md:hidden ${
          isMobileMenuOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex flex-col gap-4">
          {navLinks.map((link) => {
            const active = isActive(link.link);

            return (
              <Link
                key={link.name}
                href={link.link}
                aria-current={active ? "page" : undefined}
                className={`rounded-md px-2 py-2 text-lg ${
                  active
                    ? "bg-orange-500 text-white"
                    : "text-gray-200 hover:bg-zinc-900"
                }`}
                onClick={() => setIsMobileMenuOpen(false)}
              >
                {link.name}
              </Link>
            );
          })}
        </div>
      </div>
    </>
  );
}