"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AlertCircle } from "lucide-react";
import { useWallet } from "@/context/WalletContext";
import { PROFILE_GATED_ROUTES } from "@/component/AuthGuard";
import { DashboardShell } from "@/component/dashboard-shell";
import { getMissingProfileFields, type ProfileFieldDef } from "@/lib/api";
import PageBackground from "@/component/PageBackground";
import Header from "@/component/Header";
import Footer from "@/component/Footer";

interface ProfileGateWrapperProps {
  children: ReactNode;
}

const DISMISSED_STORAGE_KEY = "insightarena.profile-gate-dismissed.v1";

function readDismissedRoutes(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.sessionStorage.getItem(DISMISSED_STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return new Set(
      Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === "string") : [],
    );
  } catch {
    return new Set();
  }
}

function writeDismissedRoutes(routes: Set<string>) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(DISMISSED_STORAGE_KEY, JSON.stringify(Array.from(routes)));
  } catch {
    // Storage unavailable — dismissal just won't persist across reloads.
  }
}

function ProfileGatePrompt({
  missingFields,
  critical,
  onDismiss,
}: {
  missingFields: ProfileFieldDef[];
  critical: boolean;
  onDismiss?: () => void;
}) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-6 py-12">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/5 p-8 text-center backdrop-blur">
        <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full border border-orange-400/30 bg-orange-500/10">
          <AlertCircle className="h-6 w-6 text-orange-400" />
        </div>
        <h2 className="text-xl font-bold text-white">
          Complete your profile to continue
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-gray-400">
          {critical
            ? "This page needs a few more details on your profile before you can use it."
            : "Finish setting up your profile to get the full experience here."}
        </p>

        <ul className="mt-6 space-y-3 text-left" data-testid="missing-fields">
          {missingFields.map((field) => (
            <li key={field.key} className="flex items-start gap-2.5 text-sm text-gray-300">
              <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-orange-400" />
              <span>
                <span className="font-medium text-white">{field.label}</span>{" "}
                — {field.description}
              </span>
            </li>
          ))}
        </ul>

        <Link
          href="/settings#profile"
          className="mt-8 block w-full rounded-xl bg-orange-500 px-6 py-3 text-sm font-semibold text-white transition hover:bg-orange-600"
        >
          Complete Profile
        </Link>

        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="mt-3 w-full rounded-xl px-6 py-2 text-xs font-medium text-gray-500 transition hover:text-gray-300"
          >
            Not now
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * When an unauthenticated user visits /profile, bypass the DashboardShell
 * and render the page directly with the standard public page layout instead.
 * The profile page itself renders the "connect wallet" gate card.
 *
 * For authenticated users on routes in PROFILE_GATED_ROUTES, an incomplete
 * profile shows a guided prompt (still inside the DashboardShell) instead of
 * the page — listing exactly which fields are missing and linking straight
 * to where they're fixed. Non-critical gates can be dismissed for now.
 */
export function ProfileGateWrapper({ children }: ProfileGateWrapperProps) {
  const pathname = usePathname();
  const { isAuthenticated, user } = useWallet();
  const [dismissedRoutes, setDismissedRoutes] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    setDismissedRoutes(readDismissedRoutes());
  }, []);

  if (pathname === "/profile" && !isAuthenticated) {
    return (
      <PageBackground>
        <Header />
        <main className="min-h-screen pt-20">{children}</main>
        <Footer />
      </PageBackground>
    );
  }

  const gateConfig = pathname ? PROFILE_GATED_ROUTES[pathname] : undefined;

  if (isAuthenticated && gateConfig) {
    const missingFields = getMissingProfileFields(user);
    const isDismissed = pathname ? dismissedRoutes.has(pathname) : false;

    if (missingFields.length > 0 && (gateConfig.critical || !isDismissed)) {
      return (
        <DashboardShell>
          <ProfileGatePrompt
            missingFields={missingFields}
            critical={gateConfig.critical}
            onDismiss={
              gateConfig.critical
                ? undefined
                : () => {
                    setDismissedRoutes((prev) => {
                      const next = new Set(prev).add(pathname!);
                      writeDismissedRoutes(next);
                      return next;
                    });
                  }
            }
          />
        </DashboardShell>
      );
    }
  }

  // Authenticated with a complete profile, or not a gated route — render normally.
  return <>{children}</>;
}
