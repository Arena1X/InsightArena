"use client";

import Link from "next/link";
import { Copy } from "lucide-react";
import { RefObject } from "react";
import { NAV_LINKS, truncateAddress } from "./navLinks";

type MobileMenuProps = {
  address: string | null | undefined;
  copied: boolean;
  id: string;
  isActive: (path: string) => boolean;
  isAuthenticated: boolean;
  isOpen: boolean;
  isRestoring: boolean;
  menuRef: RefObject<HTMLDivElement | null>;
  onClose: () => void;
  onConnect: () => void;
  onCopyAddress: () => void;
  onDisconnect: () => void;
};

export function MobileMenu({
  address,
  copied,
  id,
  isActive,
  isAuthenticated,
  isOpen,
  isRestoring,
  menuRef,
  onClose,
  onConnect,
  onCopyAddress,
  onDisconnect,
}: MobileMenuProps) {
  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-black/60 transition-opacity md:hidden ${
          isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        onClick={onClose}
      />
      <div
        ref={menuRef}
        id={id}
        role="dialog"
        aria-modal="true"
        aria-label="Mobile navigation"
        className={`fixed top-0 right-0 z-50 h-full w-80 bg-zinc-950 p-6 transition-transform md:hidden ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex flex-col gap-4">
          {NAV_LINKS.map((link) => {
            const active = isActive(link.link);

            return (
              <Link
                key={link.name}
                href={link.link}
                aria-current={active ? "page" : undefined}
                className={`rounded-md px-2 py-2 text-lg ${
                  active ? "bg-orange-500 text-white" : "text-gray-200 hover:bg-zinc-900"
                }`}
                onClick={onClose}
              >
                {link.name}
              </Link>
            );
          })}
          <div className="mt-4 border-t border-white/10 pt-4">
            <Link
              href="/profile"
              aria-current={isActive("/profile") ? "page" : undefined}
              className={`mb-3 block rounded-md px-2 py-2 text-lg ${
                isActive("/profile")
                  ? "bg-orange-500 text-white"
                  : "text-gray-200 hover:bg-zinc-900"
              }`}
              onClick={onClose}
            >
              Profile
            </Link>
            {isRestoring && !isAuthenticated ? (
              <div className="flex w-full items-center justify-center gap-2 rounded-lg border border-white/10 bg-[#111726] px-4 py-3 text-sm font-semibold text-gray-400">
                <span className="h-2 w-2 animate-pulse rounded-full bg-gray-500" />
                Loading...
              </div>
            ) : !isAuthenticated ? (
              <button
                type="button"
                className="w-full rounded-lg bg-orange-500 px-4 py-3 font-semibold text-white hover:bg-orange-600"
                onClick={() => {
                  onClose();
                  onConnect();
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
                    onClick={onCopyAddress}
                    aria-label="Copy wallet address"
                    className="inline-flex items-center justify-center rounded-md p-2 text-gray-200 hover:bg-white/5 hover:text-white"
                    title={copied ? "Copied!" : "Copy address"}
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={onDisconnect}
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
