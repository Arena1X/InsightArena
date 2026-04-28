import type { Metadata, Viewport } from "next";
import { Suspense } from "react";

import { StandardPageLoadingSkeleton } from "@/component/loading-route-skeletons";
import { WalletProvider } from "@/context/WalletContext";

import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://insightarena.com"),
  title: {
    default: "InsightArena | Decentralized Prediction Market on Stellar",
    template: "%s | InsightArena",
  },
  description:
    "Join the premier decentralized prediction market built on Stellar. Trade predictions, compete in leaderboards, and earn rewards with provably fair gaming.",
  keywords: [
    "prediction market",
    "decentralized",
    "Stellar",
    "blockchain",
    "trading",
    "DeFi",
    "crypto predictions",
    "leaderboard",
    "competitions",
  ],
  alternates: {
    canonical: "https://insightarena.com",
  },
  authors: [{ name: "InsightArena Team" }],
  creator: "InsightArena",
  publisher: "InsightArena",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://insightarena.com",
    title: "InsightArena | Decentralized Prediction Market",
    description: "The premier decentralized prediction market built on Stellar",
    siteName: "InsightArena",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "InsightArena Platform",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "InsightArena | Decentralized Prediction Market",
    description: "Trade predictions on Stellar blockchain",
    creator: "@InsightArena",
    images: ["/twitter-image.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon-16x16.png",
    apple: "/apple-touch-icon.png",
  },
  manifest: "/site.webmanifest",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#141824",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans antialiased bg-[#141824] text-white">
        <WalletProvider>
          <a href="#main-content" className="skip-link">
            Skip to main content
          </a>
          <div id="main-content" tabIndex={-1}>
            <Suspense fallback={<StandardPageLoadingSkeleton />}>
              {children}
            </Suspense>
          </div>
        </WalletProvider>
      </body>
    </html>
  );
}
