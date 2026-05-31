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
