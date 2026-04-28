InsightArena is a next-generation decentralized prediction market platform built natively on the **[Stellar network](https://stellar.org/)**. By leveraging Stellar's high-throughput consensus protocol and the robust **Soroban** smart contract environment, InsightArena provides users with a lightning-fast, highly secure, and incredibly cost-effective way to participate in global prediction events and competitive leaderboard challenges.

Users can submit predictions on real-world outcomes such as sports results, crypto prices, or other measurable events. Thanks to Stellar's nearly instant transaction finality and fraction-of-a-cent fees, participants can interact with markets seamlessly without the friction found on other blockchains. All predictions, outcomes, and payouts are automatically resolved and recorded transparently through secure Soroban smart contracts.

In addition to regular global markets, **any user can easily create their own custom prediction events and leaderboards**. Creators can open these events to the public or make them private competitions, generating special invite codes that friends can use to join in. Whether public or private, participants earn points based on performance and compete for top rewards.

By fusing traditional prediction markets with gamified competition, and powering it all with Stellar's enterprise-grade infrastructure, InsightArena creates an engaging, transparent, and trust-minimized ecosystem where users can test their insights, host private challenges, compete globally, and earn rewards based on their accuracy.

InsightArena is a next-generation decentralized prediction market platform built natively on the **[Stellar network](https://stellar.org/)**. By leveraging Stellar's high-throughput consensus protocol and the robust **Soroban** smart contract environment, InsightArena provides users with a lightning-fast, highly secure, and incredibly cost-effective way to participate in global prediction events and competitive leaderboard challenges.

Users can submit predictions on real-world outcomes such as sports results, crypto prices, or other measurable events. Thanks to Stellar's nearly instant transaction finality and fraction-of-a-cent fees, participants can interact with markets seamlessly without the friction found on other blockchains. All predictions, outcomes, and payouts are automatically resolved and recorded transparently through secure Soroban smart contracts.

In addition to regular global markets, **any user can easily create their own custom prediction events and leaderboards**. Creators can open these events to the public or make them private competitions, generating special invite codes that friends can use to join in. Whether public or private, participants earn points based on performance and compete for top rewards.

By fusing traditional prediction markets with gamified competition, and powering it all with Stellar's enterprise-grade infrastructure, InsightArena creates an engaging, transparent, and trust-minimized ecosystem where users can test their insights, host private challenges, compete globally, and earn rewards based on their accuracy.

## Live Platform

- **Frontend**: https://insightarena.com
- **API Docs**: https://api.insightarena.com/docs

## Repository Structure

```
InsightArena/
├── frontend/    # React / Next.js web application
├── contract/    # Soroban smart contracts (Rust)
└── backend/     # NestJS backend services and APIs (pnpm)
```

## Quick Start

### Prerequisites

- Node.js 20+ → https://nodejs.org
- pnpm 9 → npm install -g pnpm@9
- Rust (stable) → curl https://sh.rustup.rs -sSf | sh
- wasm32 target → rustup target add wasm32-unknown-unknown
- PostgreSQL 14+ → https://postgresql.org
- Make

### 1. Clone

```bash
git clone https://github.com/Arena1X/InsightArena.git
cd InsightArena
```

### 2. Backend (NestJS API)

```bash
cd backend
cp .env.example .env
# Edit .env — set DATABASE_URL, JWT_SECRET, SERVER_SECRET_KEY
pnpm install
pnpm migration:run
pnpm start:dev
# → http://localhost:3000/api/v1
# → http://localhost:3000/api/v1/docs (Swagger UI)
```

### 3. Frontend (Next.js)

```bash
cd frontend
cp .env.example .env.local
# Set NEXT_PUBLIC_API_URL=http://localhost:3000
pnpm install
pnpm dev
# → http://localhost:3001
```

### 4. Contract (Soroban/Rust) — optional

```bash
cd contract
make build   # compile to WASM
make test    # run unit tests
```

## Architecture

```
┌─────────────────┐     REST API      ┌──────────────────┐
│   Next.js       │ ────────────────► │   NestJS         │
│   Frontend      │ ◄──────────────── │   Backend        │
│   :3001         │                   │   :3000          │
└─────────────────┘                   └────────┬─────────┘
        │                                      │
        │  Soroban RPC                         │ TypeORM
        │  (Freighter wallet)                  ▼
        ▼                             ┌──────────────────┐
┌─────────────────┐                   │   PostgreSQL     │
│   Soroban       │                   │   Database       │
│   Contract      │                   └──────────────────┘
│   (Stellar)     │
└─────────────────┘
```

## Core Features

- Decentralized prediction markets
- On-chain escrow and automated payouts
- Transparent leaderboard rankings
- Seasonal competitions with reward pools
- Low transaction fees via Stellar
- Fast settlement and finality
- Built with Soroban smart contracts

## Technology Stack

| Layer           | Technology                  |
| --------------- | --------------------------- |
| Blockchain      | Stellar Network             |
| Smart Contracts | Soroban (Rust)              |
| Frontend        | Next.js 14 / React 18 / Tailwind CSS |
| Backend         | NestJS (Node.js)            |
| Package Manager | pnpm (Backend)              |
| Asset Model     | XLM (Stellar)               |

## Contributing

- Backend: [backend/CONTRIBUTING.md](backend/CONTRIBUTING.md)
- Contract: [contract/CONTRIBUTING.md](contract/CONTRIBUTING.md)
- Frontend: [frontend/CONTRIBUTING.md](frontend/CONTRIBUTING.md)
- Root guide: [CONTRIBUTING.md](CONTRIBUTING.md)

## Community

Join our community:
- **Telegram**: https://t.me/+hR9dZKau8f84YTk0
- **Twitter**: https://twitter.com/InsightArena
- **Discord**: https://discord.gg/InsightArena
- **GitHub Issues**: https://github.com/Arena1X/InsightArena/issues

## License

MIT

---

## Vision

InsightArena aims to redefine decentralized prediction markets by combining transparent smart contract infrastructure with competitive gamification. Built exclusively on Stellar's fast and low-cost network, the platform enables global users to participate, compete, and earn in a secure and trust-minimized environment.

InsightArena is not just about predicting outcomes, it's about proving insight.  
