# staking-vault

Staking & fee-sharing vault for InsightArena (Soroban / Rust).

Users stake the platform token for a lock period to earn **boosted reward
shares**, and receive a pro-rata cut of protocol fees pushed in by a
`fee_source` contract (e.g. `open-market`). Longer locks earn a higher boost.

## Layout

| File                 | Responsibility                                            |
| -------------------- | --------------------------------------------------------- |
| `src/lib.rs`         | Contract entry point (`StakingVault`) and public methods  |
| `src/storage_types.rs` | `DataKey`, `Config`, `PoolState`, `Position`, `LockTier` |
| `src/pool.rs`        | Accumulator-per-share reward accounting                   |
| `src/lock.rs`        | Lock-tier lookup and share-boost math                     |
| `src/fees.rs`        | Fee intake from the `fee_source` contract                 |
| `src/errors.rs`      | `StakingError` codes                                       |
| `tests/`             | Integration tests                                          |

## Status

**Skeleton.** All public methods and helpers are stubbed with `todo!()` and
document the intended behaviour. Implement in this order:

1. `initialize` + storage read/write helpers
2. `stake` / `unstake` with `lock` + `pool` math
3. `deposit_fees` distribution
4. `claim_rewards` and view methods

## Build & test

```bash
cargo build --target wasm32-unknown-unknown --release
cargo test
```
