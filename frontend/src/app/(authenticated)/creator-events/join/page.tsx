"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Ticket } from "lucide-react";

import InvitePreview from "@/component/creator-events/InvitePreview";
import { Button } from "@/component/ui/button";

function LoadingSkeleton() {
  return (
    <div className="mx-auto max-w-3xl animate-pulse space-y-6 px-4 py-12">
      <div className="h-8 w-48 rounded-full bg-white/10" />
      <div className="h-12 w-3/4 rounded-2xl bg-white/10" />
      <div className="h-4 w-full rounded-full bg-white/10" />
      <div className="grid gap-4 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-20 rounded-2xl bg-white/10" />
        ))}
      </div>
    </div>
  );
}

function CodeEntryForm() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = code.trim();
    if (!trimmed) {
      setError("Please enter an invite code.");
      return;
    }
    router.push(`/creator-events/join?code=${encodeURIComponent(trimmed)}`);
  };

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4">
      <div className="w-full max-w-md rounded-[2rem] border border-white/10 bg-slate-900/80 p-8 shadow-2xl shadow-black/30">
        <div className="mb-6 flex items-center gap-3">
          <div className="rounded-full border border-amber-500/20 bg-amber-500/10 p-3">
            <Ticket className="h-6 w-6 text-amber-400" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-white">Join an Event</h1>
            <p className="text-sm text-slate-400">Enter your invite code below</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <input
              type="text"
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
                setError(null);
              }}
              placeholder="e.g. APOLLO-2026"
              aria-label="Invite code"
              className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 font-mono text-sm text-white placeholder-slate-500 outline-none transition focus:border-amber-500/40 focus:ring-1 focus:ring-amber-500/20"
            />
            {error && (
              <p className="mt-2 text-sm text-rose-400">{error}</p>
            )}
          </div>
          <Button
            type="submit"
            size="lg"
            className="w-full rounded-full"
          >
            Look Up Event
            <ArrowRight className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}

function JoinPageContent() {
  const searchParams = useSearchParams();
  const code = searchParams.get("code");

  if (!code) return <CodeEntryForm />;

  return (
    <Suspense fallback={<LoadingSkeleton />}>
      <InvitePreview code={code} />
    </Suspense>
  );
}

export default function JoinPage() {
  return (
    <Suspense fallback={<LoadingSkeleton />}>
      <JoinPageContent />
    </Suspense>
  );
}
