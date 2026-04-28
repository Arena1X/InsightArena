"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, Home, RefreshCcw } from "lucide-react";

import { Button } from "@/component/ui/button";

type RouteErrorStateProps = {
  error: Error & { digest?: string };
  reset: () => void;
  routeLabel: string;
  description: string;
  fullScreen?: boolean;
};

export function RouteErrorState({
  error,
  reset,
  routeLabel,
  description,
  fullScreen = true,
}: RouteErrorStateProps) {
  useEffect(() => {
    console.error(`[Route Error Boundary] ${routeLabel}`, {
      message: error.message,
      digest: error.digest,
      error,
    });
  }, [error, routeLabel]);

  return (
    <section className="dark relative overflow-hidden rounded-[2rem] border border-white/10 bg-[#171d2d] text-white shadow-[0_25px_80px_rgba(1,6,20,0.45)]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(67,195,190,0.24),transparent_45%),radial-gradient(circle_at_bottom_right,rgba(79,209,197,0.18),transparent_35%)]" />

      <div
        className={`relative flex items-center justify-center px-6 py-16 sm:px-10 ${
          fullScreen ? "min-h-screen" : "min-h-[60vh]"
        }`}
      >
        <div className="w-full max-w-xl rounded-[1.75rem] border border-white/10 bg-[#111726]/90 p-8 text-center backdrop-blur">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[#43c3be]/15 text-[#43c3be] shadow-[0_0_0_8px_rgba(67,195,190,0.08)]">
            <AlertTriangle className="h-8 w-8" />
          </div>

          <p className="mt-6 text-xs font-semibold uppercase tracking-[0.3em] text-[#43c3be]">
            Something Went Wrong
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            {routeLabel} hit an unexpected problem
          </h1>
          <p className="mt-4 text-sm leading-7 text-[#97a0b5] sm:text-base">
            {description}
          </p>

          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Button
              type="button"
              onClick={reset}
              className="h-11 rounded-xl bg-[#2f9e9d] px-6 text-sm font-semibold text-white hover:bg-[#38adaa]"
            >
              <RefreshCcw className="h-4 w-4" />
              Try again
            </Button>
            <Button
              asChild
              variant="outline"
              className="h-11 rounded-xl border-white/10 bg-white/5 px-6 text-sm font-medium text-white hover:bg-white/10 hover:text-white"
            >
              <Link href="/">
                <Home className="h-4 w-4" />
                Back to home
              </Link>
            </Button>
          </div>

          {error.digest ? (
            <p className="mt-6 text-xs text-[#6f7891]">
              Reference: {error.digest}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
