# Contributing to InsightArena Contract

Soroban smart contract for the InsightArena prediction market platform, built with Rust and the [Soroban SDK](https://soroban.stellar.org) on the Stellar network.

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [Getting Started](#getting-started)
- [Project Structure](#project-structure)
- [Development Workflow](#development-workflow)
- [Running CI Locally](#running-ci-locally)
- [Writing Tests](#writing-tests)
- [Schema Changes](#schema-changes)
- [Testnet Deployment](#testnet-deployment)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites

- **Rust (stable)** — install via rustup:
  ```bash
  curl https://sh.rustup.rs -sSf | sh -s -- -y
  source "$HOME/.cargo/env"
  ```
- **wasm32 target:**
  ```bash
  rustup target add wasm32-unknown-unknown
  ```
- **Make** — for running common tasks
- **Soroban CLI** (optional, for testnet deployment and smoke tests):
  ```bash
  cargo install --locked soroban-cli
  ```

---

## Getting Started

```bash
cd contract

# Build the contract
make build

# Run all unit tests
make test
```

That's it for local development. No database, no environment variables needed.

---

## Project Structure

```
contract/
├── src/
│   ├── lib.rs              # Contract entry points and module wiring
│   ├── config.rs           # Global config and protocol constants
│   ├── errors.rs           # Contract error types and codes
│   ├── market.rs           # Market creation, update, and resolution
│   ├── prediction.rs       # Prediction submission and validation
│   ├── escrow.rs           # Stake locking and pooled fund accounting
│   ├── oracle.rs           # Outcome/oracle integration
│   ├── governance.rs       # Admin and governance controls
│   ├── reputation.rs       # Reputation scoring
│   ├── season.rs           # Season boundaries and state
│   ├── analytics.rs        # Aggregation and read logic
│   ├── invite.rs           # Invite/referral pathways
│   ├── security.rs         # Security helpers and guardrails
│   ├── storage_types.rs    # Storage key/value schema definitions
│   ├── ttl.rs              # TTL extension and storage retention
│   └── prediction_tests.rs # Contract-focused test scenarios
├── tests/                  # Integration tests
├── scripts/
│   └── smoke_test.sh       # End-to-end testnet smoke test
├── Cargo.toml
├── Makefile
├── STORAGE_SCHEMA.md       # On-chain data schema reference
└── SECURITY_AUDIT.md       # Security audit notes
```

---

## Development Workflow

```bash
# 1. Create a feature branch
git checkout -b feature/your-feature-name

# 2. Make your changes in src/

# 3. Run tests continuously while developing
cargo test -- --nocapture

# 4. Run full CI checks before committing
make test && make build

# 5. Commit and push only if both pass
git add .
git commit -m "feat: describe your change"
git push origin feature/your-feature-name
```

---

## Running CI Locally

The GitHub Actions workflow (`contract-ci.yml`) runs two checks on every PR. Mirror them locally before pushing:

### 1. Unit tests

```bash
make test
# runs: cargo test --lib
```

### 2. WASM build

```bash
make build
# runs: cargo build --target wasm32-unknown-unknown --release
```

Both must pass. If `make test && make build` exits cleanly, your PR will pass CI.

### All available make targets

```bash
make build       # Compile contract to WASM
make test        # Run unit tests
make smoke-test  # Run end-to-end testnet smoke tests
make clean       # Remove build artifacts
make help        # List all targets
```

---

## Writing Tests

Unit tests live alongside source files (e.g. `src/prediction_tests.rs`) and in `tests/`.

The Soroban SDK provides a test environment via the `testutils` feature — already configured in `Cargo.toml`:

```toml
[dev-dependencies]
soroban-sdk = { version = "22.0.0", features = ["testutils"] }
```

Basic test structure:

```rust
#[cfg(test)]
mod tests {
    use soroban_sdk::{testutils::Address as _, Address, Env};

    #[test]
    fn test_your_feature() {
        let env = Env::default();
        // set up contract, invoke functions, assert outcomes
    }
}
```

Guidelines:

- Test both success and error paths
- Use descriptive test function names
- Test edge cases — zero stakes, expired markets, duplicate predictions
- Run with `--nocapture` to see `println!` output during debugging:
  ```bash
  cargo test test_your_feature -- --nocapture
  ```

---

## Schema Changes

The on-chain storage schema is documented in [STORAGE_SCHEMA.md](./STORAGE_SCHEMA.md) and the full contract architecture is in [ARCHITECTURE.md](./ARCHITECTURE.md). Read both before touching `storage_types.rs`.

Key rules:

- **Adding** a new `DataKey` variant is safe (additive)
- **Renaming or reordering** `DataKey` variants is a breaking change — existing on-chain keys become unreachable
- **Adding fields to structs** requires using `Option<T>` for backward compatibility or a migration function
- Any schema-affecting change must update `STORAGE_SCHEMA.md` and include migration tests

---

## Testnet Deployment

Only needed if you're testing a full end-to-end flow. Requires a funded Soroban testnet identity.

```bash
# Build WASM artifact
make build

# Deploy to testnet (adapt identity and network to your setup)
soroban contract deploy \
  --wasm target/wasm32-unknown-unknown/release/insightarena_contract.wasm \
  --source <your-identity> \
  --network testnet
```

After deploying, set these in the backend `.env`:

```
STELLAR_NETWORK=testnet
SOROBAN_CONTRACT_ID=<deployed-contract-id>
SERVER_SECRET_KEY=<backend-signer-key>
SOROBAN_RPC_URL=<soroban-rpc-endpoint>
```

### Smoke Tests

Validates a full end-to-end flow on testnet (fund wallets → deploy → create market → submit predictions → resolve → claim payouts):

```bash
make smoke-test

# Or with custom secrets
ADMIN_SECRET=<secret> USER1_SECRET=<secret> USER2_SECRET=<secret> \
  bash scripts/smoke_test.sh
```

---

## Troubleshooting

### wasm32 target missing

```bash
rustup target add wasm32-unknown-unknown
```

### cargo test fails — see panic output

```bash
cargo test -- --nocapture
```

### Build fails after schema change

If you renamed a `DataKey` variant, existing tests that reference old keys will fail. Check `storage_types.rs` and update all call sites.

### Clean build

```bash
make clean && make build
```

### Rust toolchain out of date

```bash
rustup update stable
```

---
