"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";

import { Button } from "@/component/ui/button";

type AppNotFoundProps = {
  compact?: boolean;
};

export function AppNotFound({ compact = false }: AppNotFoundProps) {
  return (
    <div
      className={`flex min-h-full items-center justify-center ${
        compact ? "px-4 py-10 sm:px-6" : "px-6 py-16 sm:px-8"
      }`}
    >
      <div className="w-full max-w-2xl rounded-[28px] border border-white/10 bg-transparent p-8 text-white shadow-[0_24px_80px_rgba(0,0,0,0.35)] backdrop-blur text-center flex flex-col items-center">
        <div className="mb-6 inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-orange-500 bg-orange-500/12 text-orange-500">
          <AlertTriangle className="h-7 w-7" />
        </div>
        <p className="text-sm font-medium uppercase tracking-[0.32em] text-orange-500/80">
          Error 404
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
          Page Not Found
        </h1>
        <p className="mt-4 max-w-xl text-sm leading-7 text-[#9ca3b4] sm:text-base">
          The page you are looking for doesn't exist or has been moved.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row justify-center w-full">
          <Button
            asChild
            className="h-11 rounded-xl bg-orange-500 px-8 text-sm font-semibold text-white hover:bg-orange-600"
          >
            <Link href="/">Return to Home</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
