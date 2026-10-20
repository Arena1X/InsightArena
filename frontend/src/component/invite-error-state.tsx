"use client";

import Link from "next/link";
import { AlertTriangle, Home, Mail } from "lucide-react";

import { Button } from "@/component/ui/button";

type InviteErrorType = "invalid" | "expired" | "maxUsed";

interface InviteErrorStateProps {
  errorType: InviteErrorType;
  code: string;
}

const errorConfig: Record<
  InviteErrorType,
  {
    title: string;
    description: string;
    icon: "alert";
    primaryCta: { label: string; href: string };
    secondaryCta: { label: string; href: string };
  }
> = {
  invalid: {
    title: "Invalid Invite Code",
    description:
      "This invite code doesn't exist or is no longer active. The code may have been deactivated or never existed.",
    icon: "alert",
    primaryCta: {
      label: "Request New Invite",
      href: "/contact",
    },
    secondaryCta: {
      label: "Browse Public Markets",
      href: "/events",
    },
  },
  expired: {
    title: "Invite Code Expired",
    description:
      "This invite code has expired and can no longer be used. Invite codes are only valid for a limited time.",
    icon: "alert",
    primaryCta: {
      label: "Request New Invite",
      href: "/contact",
    },
    secondaryCta: {
      label: "Browse Public Markets",
      href: "/events",
    },
  },
  maxUsed: {
    title: "Invite Code Limit Reached",
    description:
      "This invite code has reached its usage limit. The code was only valid for a limited number of redemptions and can no longer be used.",
    icon: "alert",
    primaryCta: {
      label: "Request New Invite",
      href: "/contact",
    },
    secondaryCta: {
      label: "Browse Public Markets",
      href: "/events",
    },
  },
};

export function InviteErrorState({
  errorType,
  code,
}: InviteErrorStateProps) {
  const config = errorConfig[errorType];

  return (
    <section className="dark relative overflow-hidden rounded-[2rem] border border-white/10 bg-[#171d2d] text-white shadow-[0_25px_80px_rgba(1,6,20,0.45)]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(67,195,190,0.24),transparent_45%),radial-gradient(circle_at_bottom_right,rgba(79,209,197,0.18),transparent_35%)]" />

      <div className="relative flex items-center justify-center px-6 py-16 sm:px-10 min-h-[60vh]">
        <div className="w-full max-w-xl rounded-[1.75rem] border border-white/10 bg-[#111726]/90 p-8 text-center backdrop-blur">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[#43c3be]/15 text-[#43c3be] shadow-[0_0_0_8px_rgba(67,195,190,0.08)]">
            <AlertTriangle className="h-8 w-8" />
          </div>

          <p className="mt-6 text-xs font-semibold uppercase tracking-[0.3em] text-[#43c3be]">
            Unable to Redeem
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            {config.title}
          </h1>
          <p className="mt-4 text-sm leading-7 text-[#97a0b5] sm:text-base">
            {config.description}
          </p>

          {code && (
            <div className="mt-6 rounded-lg bg-[#0f1419]/60 p-3 border border-white/5">
              <p className="text-xs text-[#6f7891] mb-1">Code:</p>
              <p className="font-mono text-sm text-[#43c3be]">{code}</p>
            </div>
          )}

          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Button
              asChild
              className="h-11 rounded-xl bg-[#2f9e9d] px-6 text-sm font-semibold text-white hover:bg-[#38adaa]"
            >
              <Link href={config.primaryCta.href}>
                <Mail className="h-4 w-4" />
                {config.primaryCta.label}
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              className="h-11 rounded-xl border-white/10 bg-white/5 px-6 text-sm font-medium text-white hover:bg-white/10 hover:text-white"
            >
              <Link href={config.secondaryCta.href}>
                <Home className="h-4 w-4" />
                {config.secondaryCta.label}
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
