"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useWallet } from "@/context/WalletContext";
import { useTheme } from "@/context/ThemeContext";
import { useConfirm } from "@/hooks/useConfirm";
import { useToast } from "@/hooks/useToast";
import { MobileMenu } from "./header/MobileMenu";
import { NavLinks } from "./header/NavLinksComponent";
import { UserWalletControls } from "./header/UserWalletControls";
import { WalletBalanceDisplay } from "./header/WalletBalanceDisplay";
import { isActivePath } from "./header/navLinks";

const MOBILE_MENU_ID = "mobile-navigation-menu";

export default function Header() {
  const pathname = usePathname();
  const { address, isAuthenticated, isRestoring, logout, openConnectModal } =
    useWallet();
  const { theme, toggleTheme } = useTheme();
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
      if (
        !target ||
        dropdownRef.current?.contains(target) ||
        dropdownButtonRef.current?.contains(target)
      )
        return;
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
      description:
        "You'll need to reconnect your wallet to trade or view your account.",
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
            <NavLinks isActive={isActive} />
            <div className="flex items-center gap-3">
              <WalletBalanceDisplay />
              <button
                type="button"
                onClick={toggleTheme}
                aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-700 text-gray-300 hover:bg-gray-900 hover:text-white transition-colors"
              >
                {theme === "dark" ? (
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />
                  </svg>
                ) : (
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z" />
                  </svg>
                )}
              </button>
              <button
                ref={menuButtonRef}
                type="button"
                aria-label="Open mobile menu"
                aria-haspopup="dialog"
                aria-expanded={isMobileMenuOpen}
                aria-controls={MOBILE_MENU_ID}
                className="inline-flex md:hidden rounded-lg border border-gray-700 p-2 text-white hover:bg-gray-900"
                onClick={() => setIsMobileMenuOpen(true)}
              >
                ☰
              </button>
              <UserWalletControls
                address={address}
                copied={copied}
                isActive={isActive}
                isAuthenticated={isAuthenticated}
                isDropdownOpen={isDropdownOpen}
                isRestoring={isRestoring}
                dropdownButtonRef={dropdownButtonRef}
                dropdownRef={dropdownRef}
                onConnect={openConnectModal}
                onCopyAddress={handleCopyAddress}
                onDisconnect={handleDisconnect}
                setIsDropdownOpen={setIsDropdownOpen}
              />
            </div>
          </nav>
        </div>
      </header>
      <MobileMenu
        address={address}
        copied={copied}
        id={MOBILE_MENU_ID}
        isActive={isActive}
        isAuthenticated={isAuthenticated}
        isOpen={isMobileMenuOpen}
        isRestoring={isRestoring}
        menuRef={mobileMenuRef}
        onClose={() => setIsMobileMenuOpen(false)}
        onConnect={openConnectModal}
        onCopyAddress={handleCopyAddress}
        onDisconnect={handleDisconnect}
      />
    </>
  );
}
