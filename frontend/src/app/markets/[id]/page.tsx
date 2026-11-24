import type { Metadata } from "next";
import { env } from "@/lib/env";
import MarketDetailClient from "./MarketDetailClient";

interface MarketMetadataPayload {
  id?: string;
  title?: string;
  description?: string;
  category?: string;
  probability?: number;
}

const DEFAULT_TITLE = "Market Details | InsightArena";
const DEFAULT_DESCRIPTION =
  "Explore live prediction market odds, liquidity, and outcomes on InsightArena.";

async function fetchMarketForMetadata(
  id: string,
): Promise<MarketMetadataPayload | null> {
  if (!id || !env.API_URL) return null;
  try {
    const res = await fetch(
      `${env.API_URL}/markets/${encodeURIComponent(id)}`,
      { next: { revalidate: 60 } },
    );
    if (!res.ok) return null;
    return (await res.json()) as MarketMetadataPayload;
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }> | { id: string };
}): Promise<Metadata> {
  const { id } = await params;
  const market = await fetchMarketForMetadata(id);

  const marketTitle = market?.title?.trim();
  const title = marketTitle ? `${marketTitle} | InsightArena` : DEFAULT_TITLE;
  const description =
    market?.description?.trim() ||
    (marketTitle
      ? `Predict the outcome of "${marketTitle}" on InsightArena.`
      : DEFAULT_DESCRIPTION);

  const url = env.APP_URL
    ? `${env.APP_URL}/markets/${encodeURIComponent(id)}`
    : undefined;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      siteName: "InsightArena",
      ...(url ? { url } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export default function MarketDetailPage() {
  return <MarketDetailClient />;
}
