InsightArena is a next-generation decentralized prediction market platform built natively on the **[Stellar network](https://stellar.org/)**. By leveraging Stellar's high-throughput consensus protocol and the robust **Soroban** smart contract environment, InsightArena provides users with a lightning-fast, highly secure, and incredibly cost-effective way to participate in global prediction events and competitive leaderboard challenges.

Users can submit predictions on real-world outcomes such as sports results, crypto prices, or other measurable events. Thanks to Stellar's nearly instant transaction finality and fraction-of-a-cent fees, participants can interact with markets seamlessly without the friction found on other blockchains. All predictions, outcomes, and payouts are automatically resolved and recorded transparently through secure Soroban smart contracts.

In addition to regular global markets, **any user can easily create their own custom prediction events and leaderboards**. Creators can open these events to the public or make them private competitions, generating special invite codes that friends can use to join in. Whether public or private, participants earn points based on performance and compete for top rewards.

By fusing traditional prediction markets with gamified competition, and powering it all with Stellar's enterprise-grade infrastructure, InsightArena creates an engaging, transparent, and trust-minimized ecosystem where users can test their insights, host private challenges, compete globally, and earn rewards based on their accuracy.

---

## Repository Structure

```
InsightArena/
├── frontend/    # React / Next.js web application
├── contract/    # Soroban smart contracts (Rust)
└── backend/     # NestJS backend services and APIs (pnpm)
```

---

## Core Features

- Decentralized prediction markets
- On-chain escrow and automated payouts
- Transparent leaderboard rankings
- Seasonal competitions with reward pools
- Low transaction fees via Stellar
- Fast settlement and finality
- Built with Soroban smart contracts

---

## Technology Stack

| Layer           | Technology       |
| --------------- | ---------------- |
| Blockchain      | Stellar Network  |
| Smart Contracts | Soroban (Rust)   |
| Frontend        | React / Next.js  |
| Backend         | NestJS (Node.js) |
| Package Manager | pnpm (Backend)   |
| Asset Model     | XLM (Stellar)    |

---

## Getting Started

1. **Prerequisites**: Install [Rust](https://www.rust-lang.org/), [Stellar CLI](https://developers.stellar.org/docs/smart-contracts/getting-started/setup#install-the-stellar-cli), [Node.js](https://nodejs.org/), and [pnpm](https://pnpm.io/).
2. **Smart Contracts**: Navigate to `/contract`, run `stellar contract build` and deploy to Futurenet or Testnet.
3. **Backend**: Navigate to `/backend`, run `pnpm install`, and configure `.env` with your contract IDs.
4. **Frontend**: Navigate to `/frontend`, run `npm install` and `npm run dev` to launch the local interface.

---

## Vision

InsightArena aims to redefine decentralized prediction markets by combining transparent smart contract infrastructure with competitive gamification. Built exclusively on Stellar's fast and low-cost network, the platform enables global users to participate, compete, and earn in a secure and trust-minimized environment.

InsightArena is not just about predicting outcomes, it's about proving insight.


Join our community on Telegram to get started:  
👉 https://t.me/+hR9dZKau8f84YTk0