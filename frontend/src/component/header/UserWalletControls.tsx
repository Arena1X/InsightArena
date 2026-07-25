"use client";

import Link from "next/link";
import { Bell, ChevronDown, Copy } from "lucide-react";
import { RefObject } from "react";
import { truncateAddress, truncateAddressForDropdown } from "./navLinks";

type UserWalletControlsProps = {
  address: string | null | undefined;
  copied: boolean;
  isActive: (path: string) => boolean;
  isAuthenticated: boolean;
  isDropdownOpen: boolean;
  isRestoring: boolean;
  dropdownButtonRef: RefObject<HTMLButtonElement | null>;
  dropdownRef: RefObject<HTMLDivElement | null>;
  onConnect: () => void;
  onCopyAddress: () => void;
  onDisconnect: () => void;
  setIsDropdownOpen: (isOpen: boolean | ((previous: boolean) => boolean)) => void;
};

export function UserWalletControls({
  address,
  copied,
  isActive,
  isAuthenticated,
  isDropdownOpen,
  isRestoring,
  dropdownButtonRef,
  dropdownRef,
  onConnect,
  onCopyAddress,
  onDisconnect,
  setIsDropdownOpen,
}: UserWalletControlsProps) {
  return (
    <>
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
      {isRestoring && !isAuthenticated ? (
        <div className="hidden md:inline-flex items-center gap-2 rounded-lg border border-white/10 bg-[#111726] px-6 py-2 text-sm font-semibold text-gray-400">
          <span className="h-2 w-2 animate-pulse rounded-full bg-gray-500" />
          Loading...
        </div>
      ) : !isAuthenticated ? (
        <button
          type="button"
          className="hidden md:inline-flex rounded-lg bg-orange-500 px-6 py-2 font-semibold text-white hover:bg-orange-600"
          onClick={onConnect}
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
            <span className="font-mono">{address ? truncateAddress(address) : ""}</span>
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
                <p className="min-w-0 truncate font-mono text-xs text-gray-200" title={address ?? ""}>
                  {address ? truncateAddressForDropdown(address) : ""}
                </p>
                <button
                  type="button"
                  onClick={onCopyAddress}
                  aria-label="Copy wallet address"
                  className="inline-flex items-center justify-center rounded-md p-2 text-gray-200 hover:bg-white/5 hover:text-white"
                  title={copied ? "Copied!" : "Copy address"}
                >
                  <Copy className="h-4 w-4" />
                </button>
              </div>
              <div className="border-t border-white/10" />
              <div className="flex flex-col p-2">
                {[
                  ["/profile", "View Profile"],
                  ["/dashboard", "Dashboard"],
                  ["/wallet", "Wallet"],
                ].map(([href, label]) => (
                  <Link
                    key={href}
                    href={href}
                    role="menuitem"
                    className="rounded-lg px-3 py-2 text-sm text-gray-200 hover:bg-white/5 hover:text-white"
                    onClick={() => setIsDropdownOpen(false)}
                  >
                    {label}
                  </Link>
                ))}
              </div>
              <div className="border-t border-white/10" />
              <div className="p-2">
                <button
                  type="button"
                  role="menuitem"
                  onClick={onDisconnect}
                  className="w-full rounded-lg px-3 py-2 text-left text-sm font-semibold text-red-400 hover:bg-white/5"
                >
                  Disconnect
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
