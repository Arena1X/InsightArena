import type { Metadata } from "next";

// page.tsx is a client component, so its Open Graph tags must come from this server layout for link unfurlers.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ address: string }>;
}): Promise<Metadata> {
  const { address: rawAddress } = await params;
  const address = decodeURIComponent(rawAddress || "");
  const trimmed = address.trim();
  const displayName = trimmed.length <= 16 ? trimmed || "Unknown" : `${trimmed.slice(0, 6)}…${trimmed.slice(-6)}`;
  const title = `${displayName} | InsightArena`;
  const description = `Check out ${displayName}'s predictions on InsightArena.`;
  const url = `/profile/${encodeURIComponent(address)}`;

  return {
    title,
    description,
    openGraph: {
      type: "profile",
      title,
      description,
      url,
      siteName: "InsightArena",
      images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "InsightArena Platform" }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ["/twitter-image.png"],
    },
  };
}

export default function ProfileLayout({ children }: { children: React.ReactNode }) {
  return children;
}
