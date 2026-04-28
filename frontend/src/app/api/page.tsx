"use client";

import type { ReactNode } from "react";

import Header from "@/component/Header";
import Footer from "@/component/Footer";
import PageBackground from "@/component/PageBackground";

const Section = ({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) => (
  <section className="rounded-[1.75rem] border border-white/10 bg-[#111726]/85 p-8 backdrop-blur">
    <h2 className="text-2xl font-bold text-white">{title}</h2>
    <div className="mt-4 text-[#9aa4bc]">{children}</div>
  </section>
);

export default function ApiDocumentationPage() {
  return (
    <PageBackground>
      <div className="flex min-h-screen flex-col">
        <Header />

        <main className="mx-auto w-full max-w-6xl flex-1 px-6 pb-16 pt-32">
          <header className="mb-10 space-y-4">
            <div className="inline-flex items-center rounded-full border border-[#4FD1C5]/25 bg-[#4FD1C5]/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-[#9debe4]">
              Developer API
            </div>
            <h1 className="text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
              InsightArena API Documentation
            </h1>
            <p className="max-w-3xl text-base text-[#9aa4bc] sm:text-lg">
              Integrate markets, leaderboards, and events into your own apps.
              This page covers base URLs, authentication, endpoints, and common
              examples.
            </p>
          </header>

          <div className="space-y-8">
            <Section title="Base URL">
              <p className="mb-4">
                All requests are served over HTTPS. Use the base URL below for
                all REST endpoints.
              </p>
              <pre className="overflow-x-auto rounded-xl border border-white/10 bg-[#0b1220] p-4 text-sm text-white">
                <code>{`https://api.insightarena.com/v1`}</code>
              </pre>
            </Section>

            <Section title="Authentication">
              <p className="mb-4">
                Authenticate by connecting a wallet, signing a challenge, and
                exchanging that signature for a short-lived bearer token.
              </p>
              <ol className="list-decimal space-y-2 pl-5">
                <li>Request a challenge string for your address.</li>
                <li>Sign the challenge with your wallet provider.</li>
                <li>Exchange the signature for a JWT access token.</li>
                <li>
                  Send the token on subsequent requests via{" "}
                  <span className="font-mono text-white">Authorization</span>.
                </li>
              </ol>
              <pre className="mt-5 overflow-x-auto rounded-xl border border-white/10 bg-[#0b1220] p-4 text-sm text-white">
                <code>{`Authorization: Bearer <token>`}</code>
              </pre>
            </Section>

            <Section title="Key Endpoints">
              <p className="mb-6">
                Common endpoints are grouped below. Response bodies are JSON
                unless otherwise noted.
              </p>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-[#0b1220] p-5">
                  <h3 className="text-sm font-semibold uppercase tracking-widest text-orange-500">
                    Events
                  </h3>
                  <ul className="mt-3 space-y-2 font-mono text-sm text-gray-200">
                    <li>GET /events</li>
                    <li>GET /events/:id</li>
                    <li>GET /events/:id/markets</li>
                  </ul>
                </div>
                <div className="rounded-2xl border border-white/10 bg-[#0b1220] p-5">
                  <h3 className="text-sm font-semibold uppercase tracking-widest text-[#4FD1C5]">
                    Markets
                  </h3>
                  <ul className="mt-3 space-y-2 font-mono text-sm text-gray-200">
                    <li>GET /markets</li>
                    <li>GET /markets/:id</li>
                    <li>POST /markets/:id/orders</li>
                  </ul>
                </div>
                <div className="rounded-2xl border border-white/10 bg-[#0b1220] p-5">
                  <h3 className="text-sm font-semibold uppercase tracking-widest text-[#A78BFA]">
                    Leaderboard
                  </h3>
                  <ul className="mt-3 space-y-2 font-mono text-sm text-gray-200">
                    <li>GET /leaderboard</li>
                    <li>GET /leaderboard/:address</li>
                    <li>GET /leaderboard/stats</li>
                  </ul>
                </div>
                <div className="rounded-2xl border border-white/10 bg-[#0b1220] p-5">
                  <h3 className="text-sm font-semibold uppercase tracking-widest text-[#F5C451]">
                    Wallet
                  </h3>
                  <ul className="mt-3 space-y-2 font-mono text-sm text-gray-200">
                    <li>POST /auth/challenge</li>
                    <li>POST /auth/verify</li>
                    <li>GET /me</li>
                  </ul>
                </div>
              </div>
            </Section>

            <Section title="Example Requests">
              <p className="mb-4">
                Fetch upcoming events and place an order. Replace identifiers
                with real values from your environment.
              </p>
              <pre className="overflow-x-auto rounded-xl border border-white/10 bg-[#0b1220] p-4 text-sm text-white">
                <code>{`# List events
curl -s https://api.insightarena.com/v1/events | jq

# Create an order (authenticated)
curl -s https://api.insightarena.com/v1/markets/123/orders \\
  -H "Authorization: Bearer <token>" \\
  -H "Content-Type: application/json" \\
  -d '{"side":"YES","amount":"25"}'`}</code>
              </pre>
            </Section>

            <Section title="Rate Limits & Errors">
              <p className="mb-4">
                Clients are rate-limited per IP and per token. When you exceed
                a limit, you will receive an HTTP{" "}
                <span className="font-mono text-white">429</span>.
              </p>
              <div className="overflow-hidden rounded-2xl border border-white/10">
                <table className="w-full text-left text-sm">
                  <thead className="bg-[#0b1220] text-xs uppercase tracking-widest text-[#6f7891]">
                    <tr>
                      <th className="px-4 py-3">Code</th>
                      <th className="px-4 py-3">Meaning</th>
                      <th className="px-4 py-3">Typical Fix</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10 bg-[#111726] text-gray-200">
                    <tr>
                      <td className="px-4 py-3 font-mono">401</td>
                      <td className="px-4 py-3">Missing/invalid token</td>
                      <td className="px-4 py-3">Re-authenticate</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-3 font-mono">403</td>
                      <td className="px-4 py-3">Insufficient permissions</td>
                      <td className="px-4 py-3">Verify account/roles</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-3 font-mono">429</td>
                      <td className="px-4 py-3">Rate limited</td>
                      <td className="px-4 py-3">Backoff + retry</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-3 font-mono">500</td>
                      <td className="px-4 py-3">Server error</td>
                      <td className="px-4 py-3">Retry later</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </Section>
          </div>
        </main>

        <Footer />
      </div>
    </PageBackground>
  );
}
