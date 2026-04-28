# Contributing to InsightArena

Thanks for your interest in contributing. This guide covers everything you need to get started with the **backend** (NestJS) and **contract** (Soroban/Rust) and how to make sure your changes pass CI before opening a PR.

---

## Table of Contents

- [Project Structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Backend Setup](#backend-setup)
- [Contract Setup](#contract-setup)
- [Running CI Locally](#running-ci-locally)
- [GitHub Actions Workflows](#github-actions-workflows)
- [Pull Request Checklist](#pull-request-checklist)
- [Troubleshooting](#troubleshooting)

---

## Project Structure

```
InsightArena/
├── backend/     # NestJS API (Node.js 20, pnpm)
├── contract/    # Soroban smart contracts (Rust)
└── frontend/    # Next.js web app
```

CI is scoped — backend workflows only trigger on changes under `backend/`, contract workflows trigger on all PRs.

---

## Prerequisites

### Backend

- Node.js 20+
- pnpm 9 — `npm install -g pnpm@9`
- PostgreSQL (local or Docker)
- Make

### Contract

- Rust (stable) — `curl https://sh.rustup.rs -sSf | sh`
- wasm32 target — `rustup target add wasm32-unknown-unknown`
- Soroban CLI (for testnet deployment/smoke tests)
- Make

---

## Backend Setup

```bash
cd backend

# 1. Install dependencies
pnpm install

# 2. Configure environment
cp .env.example .env
# Edit .env with your local DB credentials and secrets

# 3. Run database migrations
pnpm run migration:run

# 4. Start in dev mode
pnpm run start:dev
```

API will be available at `http://localhost:3000/api/v1`  
Swagger docs at `http://localhost:3000/api/v1/docs`

---

## Contract Setup

```bash
cd contract

# 1. Build the WASM artifact
make build

# 2. Run unit tests
make test
```

For testnet smoke tests (optional, requires a funded Soroban identity):

```bash
make smoke-test
```

---

## Running CI Locally

**Always run CI locally before pushing.** This mirrors exactly what GitHub Actions runs.

### Backend

```bash
cd backend

# Run all checks at once (lint + test + build)
make ci

# Or individually
make lint    # ESLint
make test    # Jest unit tests
make build   # TypeScript compilation
```

All three must pass. If `make ci` exits with no errors, your PR will pass the backend workflow.

### Contract

```bash
cd contract

make test    # cargo test --lib
make build   # cargo build --target wasm32-unknown-unknown --release
```

Both must pass. This mirrors the `build-and-test` job in `contract-ci.yml`.

---

## GitHub Actions Workflows

### `backend-ci.yml`

Triggers on push/PR when files under `backend/` change.

| Job   | Command          | What it checks                        |
| ----- | ---------------- | ------------------------------------- |
| Lint  | `pnpm run lint`  | ESLint rules across all source files  |
| Test  | `pnpm run test`  | Jest unit tests (`*.spec.ts`)         |
| Build | `pnpm run build` | TypeScript compilation via NestJS CLI |

All three jobs run in parallel. A PR cannot be merged if any job fails.

### `contract-ci.yml`

Triggers on push to `main` and all PRs.

| Job        | Command                                                 | What it checks                  |
| ---------- | ------------------------------------------------------- | ------------------------------- |
| Unit Tests | `cargo test`                                            | All Rust unit tests             |
| WASM Build | `cargo build --target wasm32-unknown-unknown --release` | Contract compiles to valid WASM |

---

## Pull Request Checklist

Before opening a PR, confirm:

- [ ] `make ci` passes locally (backend changes)
- [ ] `make test && make build` passes locally (contract changes)
- [ ] No new lint errors introduced
- [ ] New logic has corresponding unit tests
- [ ] `.env.example` updated if new env vars were added
- [ ] PR targets the `develop` branch (not `main` directly)
- [ ] PR description explains what changed and why

---

## Troubleshooting

### Backend: lint fails

```bash
# Auto-fix most issues
pnpm run lint

# If issues remain, check the output and fix manually
```

### Backend: tests fail

```bash
# Run a specific test file
pnpm run test -- path/to/file.spec.ts

# Run in watch mode for debugging
pnpm run test:watch
```

### Backend: build fails

```bash
# Clean and rebuild
make clean && make build
```

### Contract: cargo test fails

```bash
# Run with output to see panic messages
cargo test -- --nocapture
```

### Contract: WASM build fails

```bash
# Make sure the target is installed
rustup target add wasm32-unknown-unknown

# Clean and retry
cargo clean && make build
```

### pnpm frozen lockfile error

If you see `ERR_PNPM_OUTDATED_LOCKFILE`, your lockfile is out of sync:

```bash
pnpm install  # updates the lockfile
```

Then commit the updated `pnpm-lock.yaml`.

---

## Community

Join the Telegram to ask questions or discuss contributions:  
👉 https://t.me/+hR9dZKau8f84YTk0
