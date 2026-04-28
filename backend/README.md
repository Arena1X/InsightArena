# InsightArena — Backend

NestJS REST API powering the InsightArena prediction market platform. Handles authentication, market management, predictions, leaderboards, competitions, analytics, and Soroban contract orchestration on the Stellar network.

---

## Tech Stack

| Layer           | Technology            |
| --------------- | --------------------- |
| Framework       | NestJS 11             |
| Language        | TypeScript 5          |
| Database        | PostgreSQL + TypeORM  |
| Auth            | JWT + Passport        |
| Blockchain      | Stellar SDK + Soroban |
| Package Manager | pnpm 9                |
| Testing         | Jest                  |
| Docs            | Swagger / OpenAPI     |

---

## Prerequisites

- Node.js 20+
- pnpm 9 — `npm install -g pnpm`
- PostgreSQL (local or Docker)
- Make

---

## Getting Started

```bash
# 1. Install dependencies
pnpm install

# 2. Configure environment
cp .env.example .env
# Edit .env with your DB credentials and secrets

# 3. Run database migrations
pnpm run migration:run

# 4. Start in development mode
pnpm run start:dev
```

API base URL: `http://localhost:3000/api/v1`  
Swagger UI: `http://localhost:3000/api/v1/docs`  
OpenAPI JSON: `http://localhost:3000/api/v1/docs-json`

---

## Environment Variables

| Variable              | Description                       |
| --------------------- | --------------------------------- |
| `DATABASE_URL`        | PostgreSQL connection string      |
| `JWT_SECRET`          | JWT signing secret (min 32 chars) |
| `JWT_EXPIRES_IN`      | Token expiry e.g. `7d`            |
| `STELLAR_NETWORK`     | `testnet` or `mainnet`            |
| `SOROBAN_CONTRACT_ID` | Deployed contract ID              |
| `PORT`                | Server port (default `3000`)      |

---

## Scripts

```bash
pnpm run start:dev     # Development with watch mode
pnpm run start:prod    # Production
pnpm run build         # Compile TypeScript
pnpm run lint          # Run ESLint (auto-fix)
pnpm run test          # Run unit tests
pnpm run test:cov      # Run tests with coverage
pnpm run test:e2e      # Run end-to-end tests
pnpm run format        # Format with Prettier
```

---

## Database Migrations

```bash
# Run all pending migrations
pnpm run migration:run

# Generate a new migration from entity changes
pnpm run migration:generate -- src/migrations/MigrationName

# Revert the last migration
pnpm run migration:revert
```

---

## Project Structure

```
src/
├── auth/           # JWT authentication and wallet verification
├── users/          # User profiles and management
├── markets/        # Prediction market CRUD and lifecycle
├── predictions/    # Prediction submission and resolution
├── leaderboard/    # Rankings and scoring
├── competitions/   # Competition management
├── analytics/      # Platform analytics and history
├── achievements/   # User achievement tracking
├── admin/          # Admin controls and moderation
├── health/         # Health check endpoint
├── common/         # Guards, decorators, interceptors, filters
└── config/         # Environment validation and TypeORM config
```

---

## Health Check

```bash
curl http://localhost:3000/api/v1/health
```

Returns `200 OK` when the service, database, and disk are healthy. Returns `503` otherwise.

---

## CI

Before committing, run the full pipeline locally:

```bash
make ci
```

This runs lint → test → build in sequence. See [CONTRIBUTING.md](.github/CONTRIBUTING.md) for the full guide.

---

## Contributing

See [.github/CONTRIBUTING.md](.github/CONTRIBUTING.md).
