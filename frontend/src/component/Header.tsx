"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { ChevronDown, Copy } from "lucide-react";
import { useWallet } from "@/context/WalletContext";

export default function Header() {
  const pathname = usePathname();
  const { address, isAuthenticated, logout, openConnectModal } = useWallet();

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const mobileMenuRef = useRef<HTMLDivElement | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const dropdownButtonRef = useRef<HTMLButtonElement | null>(null);

  const navLinks = [
    { name: "Home", link: "/" },
    { name: "Events", link: "/events" },
    { name: "Leaderboard", link: "/leaderboard" },
    { name: "Docs", link: "/docs" },
    { name: "Profile", link: "/dashboard" },
  ];

  const isActive = (path: string) => {
    if (path === "/") return pathname === "/";
    return pathname === path || pathname.startsWith(`${path}/`);
  };

  const truncateAddress = (walletAddress: string) =>
    `${walletAddress.slice(0, 4)}...${walletAddress.slice(-4)}`;

  const truncateAddressForDropdown = (walletAddress: string) =>
    walletAddress.length <= 16
      ? walletAddress
      : `${walletAddress.slice(0, 12)}...${walletAddress.slice(-4)}`;

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

  useEffect(() => {
    if (!isDropdownOpen) return;

    const handleOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;

      if (
        dropdownRef.current?.contains(target) ||
        dropdownButtonRef.current?.contains(target)
      ) {
        return;
      }

      setIsDropdownOpen(false);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setIsDropdownOpen(false);
      dropdownButtonRef.current?.focus();
    };

    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isDropdownOpen]);

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
    setIsDropdownOpen(false);
    setIsMobileMenuOpen(false);
  };

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

              {!isAuthenticated ? (
                <button
                  type="button"
                  className="hidden md:inline-flex rounded-lg bg-orange-500 px-6 py-2 font-semibold text-white hover:bg-orange-600"
                  onClick={() => openConnectModal()}
                >
                  Connect Wallet
                </button>
              ) : (
                <div className="relative hidden md:block">
                  <button
                    ref={dropdownButtonRef}
                    type="button"
                    onClick={() => setIsDropdownOpen((prev) => !prev)}
                    aria-haspopup="menu"
                    aria-expanded={isDropdownOpen}
                    className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-[#111726] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#0f1628]"
                  >
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-40" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
                    </span>
                    <span className="font-mono">
                      {address ? truncateAddress(address) : ""}
                    </span>
                    <ChevronDown className="h-4 w-4 text-gray-300" />
                  </button>

                  {isDropdownOpen && (
                    <div
                      ref={dropdownRef}
                      role="menu"
                      aria-label="Wallet menu"
                      className="absolute right-0 mt-3 w-64 rounded-xl border border-white/10 bg-[#111726] shadow-xl"
                    >
                      <div className="flex items-center justify-between gap-2 px-4 py-3">
                        <p
                          className="min-w-0 truncate font-mono text-xs text-gray-200"
                          title={address ?? ""}
                        >
                          {address ? truncateAddressForDropdown(address) : ""}
                        </p>
                        <button
                          type="button"
                          onClick={handleCopyAddress}
                          aria-label="Copy wallet address"
                          className="inline-flex items-center justify-center rounded-md p-2 text-gray-200 hover:bg-white/5 hover:text-white"
                          title={copied ? "Copied!" : "Copy address"}
                        >
                          <Copy className="h-4 w-4" />
                        </button>
                      </div>
                      <div className="border-t border-white/10" />
                      <div className="flex flex-col p-2">
                        <Link
                          href="/profile"
                          role="menuitem"
                          className="rounded-lg px-3 py-2 text-sm text-gray-200 hover:bg-white/5 hover:text-white"
                          onClick={() => setIsDropdownOpen(false)}
                        >
                          View Profile
                        </Link>
                        <Link
                          href="/dashboard"
                          role="menuitem"
                          className="rounded-lg px-3 py-2 text-sm text-gray-200 hover:bg-white/5 hover:text-white"
                          onClick={() => setIsDropdownOpen(false)}
                        >
                          Dashboard
                        </Link>
                        <Link
                          href="/wallet"
                          role="menuitem"
                          className="rounded-lg px-3 py-2 text-sm text-gray-200 hover:bg-white/5 hover:text-white"
                          onClick={() => setIsDropdownOpen(false)}
                        >
                          Wallet
                        </Link>
                      </div>
                      <div className="border-t border-white/10" />
                      <div className="p-2">
                        <button
                          type="button"
                          role="menuitem"
                          onClick={handleDisconnect}
                          className="w-full rounded-lg px-3 py-2 text-left text-sm font-semibold text-red-400 hover:bg-white/5"
                        >
                          Disconnect
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
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

          <div className="mt-4 border-t border-white/10 pt-4">
            {!isAuthenticated ? (
              <button
                type="button"
                className="w-full rounded-lg bg-orange-500 px-4 py-3 font-semibold text-white hover:bg-orange-600"
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  openConnectModal();
                }}
              >
                Connect Wallet
              </button>
            ) : (
              <>
                <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-[#111726] px-4 py-3 text-white">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-400" />
                    <span className="truncate font-mono text-sm">
                      {address ? truncateAddress(address) : ""}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleCopyAddress}
                    aria-label="Copy wallet address"
                    className="inline-flex items-center justify-center rounded-md p-2 text-gray-200 hover:bg-white/5 hover:text-white"
                    title={copied ? "Copied!" : "Copy address"}
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={handleDisconnect}
                  className="mt-3 w-full rounded-lg border border-white/10 bg-transparent px-4 py-3 text-left font-semibold text-red-400 hover:bg-white/5"
                >
                  Disconnect
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
