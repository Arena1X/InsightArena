# Contributing to InsightArena Soroban Contracts

Welcome to the InsightArena contracts repository. This guide covers everything you need to know to contribute to our Soroban smart contracts built on the Stellar network.

---

## Table of Contents

- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Repository Structure](#repository-structure)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Running CI Locally](#running-ci-locally)
- [Writing Tests](#writing-tests)
- [Code Style Guidelines](#code-style-guidelines)
- [Schema Changes](#schema-changes)
- [Documentation Standards](#documentation-standards)
- [Testnet Deployment](#testnet-deployment)
- [Pull Request Process](#pull-request-process)
- [Troubleshooting](#troubleshooting)
- [Additional Resources](#additional-resources)

---

## Overview

InsightArena uses three primary Soroban smart contracts:

1. **open-market** — Core prediction market contract for global public markets
2. **creator-event-manager** — Custom event hosting with invite-only access control
3. **staking-vault** — Token staking and vault management for platform incentives

All contracts are written in Rust using the [Soroban SDK](https://soroban.stellar.org) and compile to WebAssembly (WASM) for deployment on the Stellar network.

---

## Prerequisites

### Required Tools

- **Rust (stable)** — Install via rustup:
  ```bash
  curl https://sh.rustup.rs -sSf | sh -s -- -y
  source "$HOME/.cargo/env"
  ```

- **wasm32 target** — Required for compiling to WASM:
  ```bash
  rustup target add wasm32-unknown-unknown
  ```

- **Make** — For running common build tasks (usually pre-installed on Unix systems)

### Optional Tools

- **Soroban CLI** — For testnet deployment and smoke tests:
  ```bash
  cargo install --locked soroban-cli
  ```

- **cargo-llvm-cov** — For code coverage analysis (used in CI):
  ```bash
  cargo install cargo-llvm-cov
  ```

### Verify Installation

```bash
# Check Rust version
rustc --version

# Check wasm32 target is installed
rustup target list | grep wasm32-unknown-unknown

# Check Make is available
make --version
```

---

## Repository Structure

```
contracts/
├── open-market/              # Core prediction market contract
│   ├── src/
│   │   ├── lib.rs           # Contract entry points
│   │   ├── config.rs        # Protocol constants
│   │   ├── errors.rs        # Error types
│   │   ├── market.rs        # Market logic
│   │   ├── prediction.rs    # Prediction submission
│   │   ├── escrow.rs        # Fund management
│   │   ├── oracle.rs        # Oracle integration
│   │   └── ...
│   ├── tests/               # Integration tests
│   ├── scripts/             # Deployment scripts
│   ├── Cargo.toml
│   ├── Makefile
│   └── CONTRIBUTING.md      # Contract-specific guide
│
├── creator-event-manager/    # Custom event hosting contract
│   ├── src/
│   │   ├── lib.rs
│   │   ├── storage_types.rs
│   │   ├── errors.rs
│   │   └── ...
│   ├── tests/
│   ├── docs/                # API and architecture docs
│   ├── Cargo.toml
│   └── README.md
│
├── staking-vault/           # Token staking contract
│   ├── src/
│   ├── tests/
│   └── Cargo.toml
│
└── CONTRIBUTING.md          # This file
```

Each contract is an independent Cargo workspace with its own dependencies, tests, and build artifacts.

---

## Getting Started

### 1. Clone the Repository

```bash
git clone https://github.com/Arena1X/InsightArena.git
cd InsightArena/contracts
```

### 2. Build All Contracts

Each contract has its own build process. Navigate to the specific contract directory:

```bash
# Build open-market contract
cd open-market
make build

# Build creator-event-manager contract
cd ../creator-event-manager
cargo build --target wasm32-unknown-unknown --release

# Build staking-vault contract
cd ../staking-vault
cargo build --target wasm32-unknown-unknown --release
```

### 3. Run Tests

```bash
# Test open-market
cd open-market
make test

# Test creator-event-manager
cd ../creator-event-manager
cargo test

# Test staking-vault
cd ../staking-vault
cargo test
```

If all builds and tests pass, you're ready to start developing!

---

## Development Workflow

### Standard Workflow

1. **Create a feature branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes** in the appropriate contract's `src/` directory

3. **Run tests continuously** while developing:
   ```bash
   # Run specific test
   cargo test test_function_name -- --nocapture
   
   # Run all tests with output
   cargo test -- --nocapture
   
   # Run tests in watch mode (requires cargo-watch)
   cargo watch -x test
   ```

4. **Run full CI checks** before committing:
   ```bash
   # For open-market
   cd open-market
   make test && make build
   
   # For other contracts
   cargo test && cargo build --target wasm32-unknown-unknown --release
   ```

5. **Commit and push** only after all checks pass:
   ```bash
   git add .
   git commit -m "feat(open-market): add partial withdrawal feature"
   git push origin feature/your-feature-name
   ```

### Commit Message Format

Follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `test`: Adding or updating tests
- `refactor`: Code refactoring without behavior change
- `perf`: Performance improvements
- `chore`: Build process or tooling changes

**Scopes:**
- `open-market`
- `creator-event-manager`
- `staking-vault`
- `ci`

**Examples:**
```
feat(open-market): implement partial withdrawal mechanism
fix(creator-event-manager): prevent duplicate batch verification
docs(staking-vault): update API reference with new endpoints
test(open-market): add edge cases for market resolution
```

---

## Running CI Locally

GitHub Actions runs the following checks on every PR. Run them locally to catch issues early.

### For All Contracts

The CI workflow (`contract-ci.yml`) runs these steps for each contract:

1. **Unit Tests**
   ```bash
   cargo test
   ```

2. **Code Coverage**
   ```bash
   cargo llvm-cov --no-report
   cargo llvm-cov report --summary-only
   ```

3. **WASM Build**
   ```bash
   cargo build --target wasm32-unknown-unknown --release
   ```

### Quick CI Check Script

Create a helper script to run CI for all contracts:

```bash
#!/bin/bash
# save as contracts/check-ci.sh

set -e

echo "🔍 Checking open-market..."
cd open-market
cargo test
cargo build --target wasm32-unknown-unknown --release
cd ..

echo "🔍 Checking creator-event-manager..."
cd creator-event-manager
cargo test
cargo build --target wasm32-unknown-unknown --release
cd ..

echo "🔍 Checking staking-vault..."
cd staking-vault
cargo test
cargo build --target wasm32-unknown-unknown --release
cd ..

echo "✅ All CI checks passed!"
```

Make it executable and run:
```bash
chmod +x check-ci.sh
./check-ci.sh
```

### open-market Makefile Targets

The `open-market` contract includes a Makefile with convenient targets:

```bash
make help        # Show all available targets
make build       # Build contract WASM
make test        # Run unit tests
make smoke-test  # Run testnet smoke tests (requires funded account)
make clean       # Clean build artifacts
```

---

## Writing Tests

### Test Structure

Soroban contracts use Rust's built-in test framework with the Soroban SDK's `testutils` feature:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::Address as _, Address, Env};

    #[test]
    fn test_create_market() {
        let env = Env::default();
        env.mock_all_auths();
        
        let contract_id = env.register_contract(None, YourContract);
        let client = YourContractClient::new(&env, &contract_id);
        
        // Set up test data
        let admin = Address::generate(&env);
        let market_id = 1u64;
        
        // Execute contract function
        let result = client.create_market(&admin, &market_id);
        
        // Assert expected outcomes
        assert_eq!(result, expected_value);
    }
}
```

### Testing Guidelines

**DO:**
- ✅ Test both success and error paths
- ✅ Use descriptive test function names: `test_market_resolution_with_valid_oracle_data`
- ✅ Test edge cases: zero values, empty strings, boundary conditions
- ✅ Mock authentication with `env.mock_all_auths()` for quick tests
- ✅ Test time-sensitive logic with `env.ledger().set_timestamp()`
- ✅ Verify storage changes with direct storage reads
- ✅ Group related tests in modules

**DON'T:**
- ❌ Skip testing error conditions
- ❌ Write tests that depend on each other
- ❌ Use hardcoded addresses (use `Address::generate(&env)`)
- ❌ Ignore test warnings
- ❌ Test only the happy path

### Example Test Patterns

**Testing Errors:**
```rust
#[test]
#[should_panic(expected = "unauthorized")]
fn test_non_admin_cannot_pause() {
    let env = Env::default();
    // setup...
    let non_admin = Address::generate(&env);
    
    // This should panic with "unauthorized"
    client.pause_contract(&non_admin);
}
```

**Testing with Time:**
```rust
#[test]
fn test_prediction_after_deadline_fails() {
    let env = Env::default();
    // setup...
    
    // Set time to after deadline
    env.ledger().set_timestamp(deadline + 1);
    
    // Should fail
    let result = client.submit_prediction(&user, &market_id, &prediction);
    assert!(result.is_err());
}
```

**Testing Storage:**
```rust
#[test]
fn test_market_stored_correctly() {
    let env = Env::default();
    // setup and create market...
    
    // Read from storage directly
    let stored_market: Market = env.storage().get(&DataKey::Market(market_id)).unwrap();
    
    assert_eq!(stored_market.id, market_id);
    assert_eq!(stored_market.creator, admin);
}
```

### Running Tests

```bash
# Run all tests
cargo test

# Run specific test
cargo test test_market_resolution

# Run with output visible
cargo test -- --nocapture

# Run tests matching a pattern
cargo test prediction -- --nocapture

# Run tests in a specific file
cargo test --test integration_tests

# Run with backtrace on failure
RUST_BACKTRACE=1 cargo test
```

---

## Code Style Guidelines

### Rust Conventions

Follow the [Rust API Guidelines](https://rust-lang.github.io/api-guidelines/) and Soroban best practices:

1. **Use `rustfmt`** for automatic formatting:
   ```bash
   cargo fmt
   ```

2. **Fix lints** with `clippy`:
   ```bash
   cargo clippy -- -D warnings
   ```

3. **Naming Conventions:**
   - Functions: `snake_case`
   - Structs/Enums: `PascalCase`
   - Constants: `SCREAMING_SNAKE_CASE`
   - Contract methods: `snake_case`

### Contract-Specific Guidelines

**Function Signatures:**
```rust
// ✅ Good: Clear parameter names and types
pub fn submit_prediction(
    env: Env,
    predictor: Address,
    market_id: u64,
    outcome: Symbol,
) -> Result<u64, Error> {
    // implementation
}

// ❌ Bad: Unclear or abbreviated names
pub fn sub_pred(e: Env, p: Address, m: u64, o: Symbol) -> u64 {
    // implementation
}
```

**Error Handling:**
```rust
// ✅ Good: Use custom error types
if !is_admin(&env, &caller) {
    return Err(Error::Unauthorized);
}

// ❌ Bad: Use panic! directly
if !is_admin(&env, &caller) {
    panic!("unauthorized");
}
```

**Documentation:**
```rust
// ✅ Good: Document public functions
/// Submits a prediction for a specific market.
///
/// # Arguments
/// * `predictor` - Address of the user making the prediction
/// * `market_id` - Unique identifier of the market
/// * `outcome` - Predicted outcome symbol
///
/// # Returns
/// Returns the prediction ID on success
///
/// # Errors
/// * `Error::MarketNotFound` - If market doesn't exist
/// * `Error::DeadlinePassed` - If prediction deadline has passed
pub fn submit_prediction(/* ... */) -> Result<u64, Error> {
    // implementation
}
```

**Storage Access:**
```rust
// ✅ Good: Use typed storage keys
let market = env.storage()
    .instance()
    .get(&DataKey::Market(market_id))
    .ok_or(Error::MarketNotFound)?;

// ❌ Bad: Use raw storage keys
let market = env.storage()
    .instance()
    .get(&Symbol::new(&env, "market_1"))
    .unwrap();
```

### Performance Considerations

- Minimize storage reads/writes (they're expensive)
- Use `instance()` storage for contract-lifetime data
- Use `persistent()` storage for user-specific data that shouldn't expire
- Use `temporary()` storage for short-lived data
- Batch operations when possible
- Extend TTL proactively for frequently accessed data

---

## Schema Changes

Storage schema changes are **high-risk** and require careful planning.

### Schema Documentation

Each contract with complex storage must maintain schema documentation:
- `open-market/STORAGE_SCHEMA.md` — Full storage schema reference
- Contract-specific architecture docs

### Rules for Schema Changes

**Safe (Additive) Changes:**
- ✅ Adding new `DataKey` variants
- ✅ Adding optional fields to structs (`Option<T>`)
- ✅ Adding new storage entries

**Breaking Changes (Require Migration):**
- ⚠️ Renaming `DataKey` variants
- ⚠️ Reordering `DataKey` enum
- ⚠️ Changing field types in stored structs
- ⚠️ Removing fields from structs
- ⚠️ Changing storage types (Instance → Persistent)

### Migration Process

1. **Document the change** in schema docs
2. **Write migration function** if needed
3. **Add migration tests** to verify data integrity
4. **Update all call sites** that reference changed keys
5. **Test on testnet** before mainnet deployment

**Example Migration:**
```rust
/// Migrates old Market schema to new version with optional field
pub fn migrate_market_v1_to_v2(env: &Env, market_id: u64) {
    let old_market: MarketV1 = env.storage()
        .instance()
        .get(&DataKey::Market(market_id))
        .expect("Market not found");
    
    let new_market = MarketV2 {
        id: old_market.id,
        creator: old_market.creator,
        new_field: None, // Safe default for new field
        // ... other fields
    };
    
    env.storage()
        .instance()
        .set(&DataKey::Market(market_id), &new_market);
}
```

---

## Documentation Standards

### Required Documentation

**For Every Contract:**
- `README.md` — Overview, features, quick start
- `CONTRIBUTING.md` — Development guide (like this file)

**For Complex Contracts:**
- `ARCHITECTURE.md` — System design and module structure
- `API_REFERENCE.md` — Complete API documentation
- `STORAGE_SCHEMA.md` — On-chain data schema
- `SECURITY_AUDIT.md` — Security considerations and audit notes

### Writing Good Documentation

**Code Comments:**
```rust
// ✅ Good: Explain WHY, not WHAT
// Use ceil division to ensure we never under-collect fees
let fee = (amount * fee_rate + 99) / 100;

// ❌ Bad: Restate the code
// Multiply amount by fee rate and divide by 100
let fee = (amount * fee_rate) / 100;
```

**Function Documentation:**
```rust
/// Resolves a market with the final outcome.
///
/// Only the authorized oracle can call this function. Once resolved,
/// the market cannot accept new predictions and winnings become claimable.
///
/// # Arguments
/// * `oracle` - Address of the authorized oracle
/// * `market_id` - ID of the market to resolve
/// * `outcome` - Winning outcome symbol
///
/// # Returns
/// Number of winning predictions
///
/// # Errors
/// * `Error::Unauthorized` - Caller is not the authorized oracle
/// * `Error::MarketNotFound` - Market doesn't exist
/// * `Error::AlreadyResolved` - Market was already resolved
///
/// # Example
/// ```ignore
/// let winner_count = contract.resolve_market(&oracle, &1u64, &symbol_short!("WIN"));
/// ```
pub fn resolve_market(
    env: Env,
    oracle: Address,
    market_id: u64,
    outcome: Symbol,
) -> Result<u32, Error> {
    // implementation
}
```

### Keeping Docs Updated

- Update documentation in the same PR as code changes
- Run `cargo doc` to verify doc comments compile
- Link related documents together
- Keep examples runnable or mark them `ignore`

```bash
# Generate and view documentation
cargo doc --open
```

---

## Testnet Deployment

### Prerequisites

1. **Funded Soroban Testnet Account:**
   ```bash
   # Create new identity
   soroban config identity generate my-account
   
   # Get address
   soroban config identity address my-account
   
   # Fund via Friendbot
   curl "https://friendbot.stellar.org?addr=$(soroban config identity address my-account)"
   ```

2. **Configure Network:**
   ```bash
   soroban config network add testnet \
     --rpc-url https://soroban-testnet.stellar.org \
     --network-passphrase "Test SDF Network ; September 2015"
   ```

### Deploying a Contract

```bash
# 1. Build the contract
cd open-market  # or creator-event-manager, staking-vault
cargo build --target wasm32-unknown-unknown --release

# 2. Deploy to testnet
soroban contract deploy \
  --wasm target/wasm32-unknown-unknown/release/insightarena_contract.wasm \
  --source my-account \
  --network testnet

# Output: CONTRACT_ID (starting with 'C')

# 3. Initialize the contract (parameters vary by contract)
soroban contract invoke \
  --id <CONTRACT_ID> \
  --source my-account \
  --network testnet \
  -- initialize \
  --admin <ADMIN_ADDRESS> \
  --<other-params> <values>
```

### Contract-Specific Initialization

**open-market:**
```bash
soroban contract invoke \
  --id $CONTRACT_ID \
  --source my-account \
  --network testnet \
  -- initialize \
  --admin $ADMIN_ADDRESS \
  --oracle $ORACLE_ADDRESS
```

**creator-event-manager:**
```bash
soroban contract invoke \
  --id $CONTRACT_ID \
  --source my-account \
  --network testnet \
  -- initialize \
  --admin $ADMIN_ADDRESS \
  --ai_agent $AI_AGENT_ADDRESS \
  --treasury $TREASURY_ADDRESS \
  --xlm_token $XLM_TOKEN_ADDRESS \
  --initial_creation_fee 1000000
```

### Environment Configuration

After deploying, update the backend `.env`:

```bash
# Backend configuration
STELLAR_NETWORK=testnet
SOROBAN_CONTRACT_ID=<your-deployed-contract-id>
SERVER_SECRET_KEY=<backend-signer-secret>
SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
```

### Smoke Tests

Run end-to-end tests on testnet (open-market only):

```bash
cd open-market
make smoke-test

# Or with custom credentials
ADMIN_SECRET=<secret> USER1_SECRET=<secret> USER2_SECRET=<secret> \
  bash scripts/smoke_test.sh
```

---

## Pull Request Process

### Before Opening a PR

**Checklist:**
- [ ] All tests pass: `cargo test`
- [ ] WASM builds successfully: `cargo build --target wasm32-unknown-unknown --release`
- [ ] Code is formatted: `cargo fmt`
- [ ] No clippy warnings: `cargo clippy -- -D warnings`
- [ ] New features have tests
- [ ] Documentation is updated
- [ ] Schema changes are documented
- [ ] Commit messages follow convention

### PR Title Format

```
<type>(<scope>): <description>

Examples:
feat(open-market): add partial withdrawal support
fix(creator-event-manager): prevent duplicate batch verification
docs(staking-vault): update API reference
```

### PR Description Template

```markdown
## Description
Brief description of what this PR does.

## Motivation
Why is this change needed? What problem does it solve?

## Changes
- Bullet list of specific changes
- Include file paths for major changes

## Testing
- [ ] Unit tests added/updated
- [ ] Integration tests pass
- [ ] Tested on testnet (if applicable)

## Schema Impact
- [ ] No schema changes
- [ ] Additive schema changes (backward compatible)
- [ ] Breaking schema changes (migration required)

## Documentation
- [ ] Code comments added
- [ ] README updated (if needed)
- [ ] API docs updated (if needed)

## Checklist
- [ ] CI passes locally
- [ ] Code is formatted and linted
- [ ] Reviewed my own code
```

### Review Process

1. **Automated Checks** — CI must pass (tests, build, coverage)
2. **Code Review** — At least one approval required
3. **Schema Review** — Breaking changes need extra scrutiny
4. **Security Review** — Financial logic requires careful review
5. **Documentation Review** — Docs must match code changes

### Merging

- Target branch: `main` (or `develop` if your repo uses that)
- Squash merge preferred for clean history
- Delete branch after merge

---

## Troubleshooting

### Common Issues

#### `wasm32-unknown-unknown` target missing

**Error:**
```
error[E0463]: can't find crate for `std`
```

**Solution:**
```bash
rustup target add wasm32-unknown-unknown
```

#### Cargo test fails with panic output

**Problem:** Can't see panic messages

**Solution:**
```bash
cargo test -- --nocapture
```

#### Build fails after schema change

**Problem:** Old tests reference renamed `DataKey`

**Solution:**
1. Check `storage_types.rs` for changes
2. Update all call sites
3. Update tests
4. Run `cargo clean && cargo build`

#### Rust toolchain out of date

**Solution:**
```bash
rustup update stable
rustup default stable
```

#### pnpm/npm errors (backend integration)

**Problem:** Wrong directory

**Solution:**
Contracts use `cargo`, not `pnpm`. Navigate to correct directory:
```bash
# Wrong: contracts/ directory (no package.json here)
# Right: backend/ directory for pnpm
cd ../backend
pnpm install
```

#### Can't deploy to testnet — insufficient funds

**Solution:**
```bash
# Get your address
soroban config identity address my-account

# Fund via Friendbot
curl "https://friendbot.stellar.org?addr=$(soroban config identity address my-account)"

# Wait 5 seconds and try again
```

#### Contract invocation fails with `HostError`

**Common causes:**
- Wrong parameter types
- Contract not initialized
- Storage key not found
- Authorization failed

**Debug steps:**
1. Check function signature matches invocation
2. Verify contract is initialized
3. Check storage exists for keys being read
4. Ensure `env.mock_all_auths()` in tests

### Getting Help

**Before asking:**
1. Check this CONTRIBUTING guide
2. Check contract-specific docs (`open-market/CONTRIBUTING.md`, etc.)
3. Review existing issues on GitHub
4. Search Soroban documentation: https://soroban.stellar.org

**When asking:**
- Include full error message
- Share relevant code snippet
- Describe what you expected vs. what happened
- Mention which contract you're working on

**Where to ask:**
- GitHub Issues — Bug reports and feature requests
- GitHub Discussions — General questions
- Telegram — https://t.me/+hR9dZKau8f84YTk0
- Stellar Discord — Soroban channel

---

## Additional Resources

### Official Documentation

- **Soroban Docs:** https://soroban.stellar.org
- **Soroban SDK:** https://docs.rs/soroban-sdk
- **Stellar Network:** https://stellar.org
- **Rust Book:** https://doc.rust-lang.org/book/

### Project Documentation

- **Root Contributing Guide:** `../CONTRIBUTING.md`
- **Backend Contributing:** `../backend/CONTRIBUTING.md`
- **Frontend Contributing:** `../frontend/CONTRIBUTING.md`

### Contract-Specific Docs

**open-market:**
- `open-market/CONTRIBUTING.md` — Development guide
- `open-market/ARCHITECTURE.md` — System architecture
- `open-market/STORAGE_SCHEMA.md` — Storage schema
- `open-market/SECURITY_AUDIT.md` — Security notes

**creator-event-manager:**
- `creator-event-manager/README.md` — Overview and quick start
- `creator-event-manager/docs/` — Detailed documentation

**staking-vault:**
- `staking-vault/README.md` — Contract documentation

### Learning Resources

- **Soroban Examples:** https://github.com/stellar/soroban-examples
- **Rust by Example:** https://doc.rust-lang.org/rust-by-example/
- **Soroban Quest:** https://quest.stellar.org/soroban

---

## Community

We're glad you're here! Join the community:

- **Telegram:** https://t.me/+hR9dZKau8f84YTk0
- **GitHub:** https://github.com/Arena1X/InsightArena
- **Stellar Discord:** #soroban channel

---

**Happy coding! 🚀**

If you have questions or need help, don't hesitate to reach out through any of the community channels above.
