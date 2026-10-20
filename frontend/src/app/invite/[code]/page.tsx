"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader } from "lucide-react";
import { InviteErrorState } from "@/component/invite-error-state";

/**
 * Invite Code Page
 * 
 * This page handles redeeming invite codes for private markets.
 * 
 * Flow:
 * 1. User lands on /invite/[code] with a URL parameter
 * 2. Page attempts to redeem the code via the contract
 * 3. On success: redirects to the authenticated market view
 * 4. On error: displays the appropriate error state (invalid, expired, or maxUsed)
 * 
 * Error Code Mapping:
 * - 50: InvalidInviteCode (code doesn't exist or is inactive)
 * - 51: InviteCodeExpired (code has expired)
 * - 52: InviteCodeMaxUsed (code has reached usage limit)
 */

type ErrorType = "invalid" | "expired" | "maxUsed" | null;

interface InvitePageProps {
  params: {
    code: string;
  };
}

export default function InvitePage({ params }: InvitePageProps) {
  const router = useRouter();
  const { code } = params;
  const [errorType, setErrorType] = useState<ErrorType>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    /**
     * Attempt to redeem the invite code.
     * 
     * In a production implementation, this would:
     * 1. Connect to the user's wallet (if not already connected)
     * 2. Call contract.redeem_invite_code(userAddress, code)
     * 3. Handle the returned Result<u64, InsightArenaError>
     * 4. Map error codes to error types
     * 5. On success, redirect to /markets/[id] or authenticated dashboard
     * 
     * For now, this is a placeholder that demonstrates the logic flow.
     */
    const redeemInviteCode = async () => {
      try {
        setIsLoading(true);
        
        // TODO: Replace with actual contract call
        // This should:
        // 1. Get the contract client
        // 2. Call redeem_invite_code with the code parameter
        // 3. Handle the response
        
        // Placeholder: Simulate the contract call
        // In real implementation, you would call:
        // const client = useContractClient();
        // const marketId = await client.redeem_invite_code(userAddress, code);
        
        // For now, we log the code and show the loading state
        console.log("Attempting to redeem invite code:", code);
        
        // Simulate a delay
        await new Promise((resolve) => setTimeout(resolve, 1500));
        
        // This would be replaced with actual contract logic
        // If successful, redirect to the market:
        // router.push(`/markets/${marketId}`);
        
      } catch (error: any) {
        // Map contract error codes to error types
        const errorCode = error?.code;
        
        if (errorCode === 50) {
          setErrorType("invalid");
        } else if (errorCode === 51) {
          setErrorType("expired");
        } else if (errorCode === 52) {
          setErrorType("maxUsed");
        } else {
          // Unknown error defaults to invalid
          setErrorType("invalid");
        }
      } finally {
        setIsLoading(false);
      }
    };

    redeemInviteCode();
  }, [code, router]);

  // Show loading state while attempting redemption
  if (isLoading) {
    return (
      <section className="dark relative overflow-hidden rounded-[2rem] border border-white/10 bg-[#171d2d] text-white shadow-[0_25px_80px_rgba(1,6,20,0.45)]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(67,195,190,0.24),transparent_45%),radial-gradient(circle_at_bottom_right,rgba(79,209,197,0.18),transparent_35%)]" />

        <div className="relative flex items-center justify-center px-6 py-16 sm:px-10 min-h-[60vh]">
          <div className="w-full max-w-xl rounded-[1.75rem] border border-white/10 bg-[#111726]/90 p-8 text-center backdrop-blur">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[#43c3be]/15 text-[#43c3be] shadow-[0_0_0_8px_rgba(67,195,190,0.08)]">
              <Loader className="h-8 w-8 animate-spin" />
            </div>

            <p className="mt-6 text-xs font-semibold uppercase tracking-[0.3em] text-[#43c3be]">
              Processing
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Validating Invite Code
            </h1>
            <p className="mt-4 text-sm leading-7 text-[#97a0b5] sm:text-base">
              Please wait while we verify your invite code...
            </p>

            <div className="mt-8">
              <div className="inline-block">
                <div className="h-2 w-2 bg-[#43c3be] rounded-full animate-pulse" />
              </div>
            </div>
          </div>
        </div>
      </section>
    );
  }

  // Show error state if redemption failed
  if (errorType) {
    return <InviteErrorState errorType={errorType} code={code} />;
  }

  // If loading completes without error or redirect, show a success placeholder
  // (In production, this component would redirect before reaching this point)
  return (
    <section className="dark relative overflow-hidden rounded-[2rem] border border-white/10 bg-[#171d2d] text-white shadow-[0_25px_80px_rgba(1,6,20,0.45)]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(67,195,190,0.24),transparent_45%),radial-gradient(circle_at_bottom_right,rgba(79,209,197,0.18),transparent_35%)]" />

      <div className="relative flex items-center justify-center px-6 py-16 sm:px-10 min-h-[60vh]">
        <div className="w-full max-w-xl rounded-[1.75rem] border border-white/10 bg-[#111726]/90 p-8 text-center backdrop-blur">
          <p className="text-sm text-[#97a0b5]">
            Redirecting to market...
          </p>
        </div>
      </div>
    </section>
import type { Metadata } from "next";
import { Suspense } from "react";
import InvitePreview from "@/component/creator-events/InvitePreview";

interface PageProps {
  params: Promise<{ code: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { code } = await params;

  const title = `Event Invite — ${code}`;
  const description =
    "You've been invited to join a creator prediction event on InsightArena. Preview the event and join using your Stellar wallet.";

  return {
    title,
    description,
    openGraph: {
      type: "website",
      title: `Join the Event | InsightArena`,
      description,
      images: [
        {
          url: "/og-image.png",
          width: 1200,
          height: 630,
          alt: "InsightArena Event Invite",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: `Join the Event | InsightArena`,
      description,
      creator: "@InsightArena",
      images: ["/twitter-image.png"],
    },
  };
}

function InviteLoadingSkeleton() {
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

export default async function InvitePage({ params }: PageProps) {
  const { code } = await params;

  return (
    <Suspense fallback={<InviteLoadingSkeleton />}>
      <InvitePreview code={code} />
    </Suspense>
  );
}
