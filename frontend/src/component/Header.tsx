"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useWallet } from "@/context/WalletContext";
import WalletBalanceBadge from "@/component/header/WalletBalanceBadge";

export default function Header() {
  const pathname = usePathname();
  const { address, isAuthenticated, isRestoring, logout, openConnectModal } = useWallet();
  const confirm = useConfirm();
  const toast = useToast();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const mobileMenuRef = useRef<HTMLDivElement | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const dropdownButtonRef = useRef<HTMLButtonElement | null>(null);
  const isActive = (path: string) => isActivePath(pathname, path);

  useEffect(() => {
    if (!isMobileMenuOpen) return;
    const getFocusableElements = () =>
      Array.from(
        mobileMenuRef.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );
    getFocusableElements()[0]?.focus();
    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsMobileMenuOpen(false);
        return;
      }
      if (event.key !== "Tab") return;
      const focusableElements = getFocusableElements();
      if (focusableElements.length === 0) return;
      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
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
      if (!target || dropdownRef.current?.contains(target) || dropdownButtonRef.current?.contains(target)) return;
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

  const handleDisconnect = async () => {
    setIsDropdownOpen(false);
    setIsMobileMenuOpen(false);
    const confirmed = await confirm({
      title: "Disconnect wallet?",
      description: "You'll need to reconnect your wallet to trade or view your account.",
      confirmLabel: "Disconnect",
      variant: "destructive",
    });
    if (!confirmed) return;
    logout();
    toast.success("Wallet disconnected");
  };

  return (
    <>
      <header className="fixed top-0 left-0 right-0 z-50 border-b border-gray-800 bg-black/80 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <nav className="flex items-center justify-between" aria-label="Primary navigation">
            <Link href="/" className="text-xl font-bold text-white hover:text-[#4FD1C5]">InsightArena</Link>
            <NavLinks isActive={isActive} />
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

              {/* Profile link — desktop only, sits beside wallet button */}
              <Link
                href="/profile"
                aria-current={isActive("/profile") ? "page" : undefined}
                className={`relative hidden md:inline-flex transition-colors ${
                  isActive("/profile")
                    ? "text-white font-semibold"
                    : "text-gray-200 hover:text-white"
                }`}
              >
                Profile
                <span
                  className={`absolute left-0 right-0 -bottom-1 h-0.5 bg-orange-500 transition-opacity ${
                    isActive("/profile") ? "opacity-100" : "opacity-0"
                  }`}
                />
              </Link>
              {/* Notification Bell */}
              <Link
                href="/notifications"
                className="relative hidden md:inline-flex items-center text-gray-200 hover:text-white"
              >
                <Bell className="h-5 w-5" />
                <span className="absolute -top-1 -right-1 flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-orange-500" />
                </span>
              </Link>

              <WalletBalanceBadge />

              {isRestoring && !isAuthenticated ? (
                <div className="hidden md:inline-flex items-center gap-2 rounded-lg border border-white/10 bg-[#111726] px-6 py-2 text-sm font-semibold text-gray-400">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-gray-500" />
                  Loading...
                </div>
              ) : !isAuthenticated ? (
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
      <MobileMenu address={address} copied={copied} id={MOBILE_MENU_ID} isActive={isActive} isAuthenticated={isAuthenticated} isOpen={isMobileMenuOpen} isRestoring={isRestoring} menuRef={mobileMenuRef} onClose={() => setIsMobileMenuOpen(false)} onConnect={openConnectModal} onCopyAddress={handleCopyAddress} onDisconnect={handleDisconnect} />
    </>
  );
}
