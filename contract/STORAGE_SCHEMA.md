# InsightArena Smart Contract — On-Chain Data Schema

**Contract:** InsightArena Prediction Market
**SDK version:** soroban-sdk 22.0.0
**Source of truth:** `src/storage_types.rs`, `src/ttl.rs`, `src/config.rs`
**Last updated:** 2026-03-28

---

## Storage type reference

| Type | Lifetime | Cost | Archival risk |
|------|----------|------|--------------|
| **Persistent** | Manual TTL extension required | Highest | Yes — can be archived if TTL expires |
| **Temporary** | Auto-expires each ledger | Lowest | No |
| **Instance** | Lives with contract WASM | Medium | No (extends with contract) |

---

## DataKey Variants

All keys are defined in `src/storage_types.rs` as `pub enum DataKey`.

| Key | Rust Type | Stored Value | Storage | TTL Policy | Hot/Cold | Approx. Size |
|-----|-----------|--------------|---------|------------|----------|-------------|
| `Market(u64)` | `Market` | Full market struct including pool, state flags, outcomes list, and fee config | Persistent | 30 days (`LEDGER_BUMP_MARKET = 432_000`), renewed on every read and write | **Hot** — read/written on every prediction, close, and resolution | ~500 bytes |
| `PredictorList(u64)` | `Vec<Address>` | Ordered list of all predictor addresses for a market (used for mass refunds on cancel) | Persistent | 30 days, renewed alongside `Market` key | **Hot** — appended on every `submit_prediction` | ~32 bytes × N predictors |
| `Prediction(u64, Address)` | `Prediction` | A single user's prediction record: stake, outcome, `payout_claimed` flag, payout amount | Persistent → Temporary after claim | 30 days while active; shortened to 7 days (`LEDGER_BUMP_PREDICTION_CLAIMED = 100_800`) after `claim_payout` | **Hot** (pre-claim) / **Cold** (post-claim) | ~120 bytes |
| `User(Address)` | `UserProfile` | User stats: total predictions, correct count, total staked, total winnings, season points, reputation score, join timestamp | Persistent | 90 days (`LEDGER_BUMP_USER = 1_296_000`), renewed on every update | **Hot** — updated on every `claim_payout` | ~100 bytes |
| `UserList` | `Vec<Address>` | Singleton list of all addresses with a persisted user profile | Persistent | No dedicated TTL bump — inherits market bumps indirectly | **Cold** — appended only on first interaction per user | ~32 bytes × N users |
| `Season(u32)` | `Season` | Season metadata: start/end times, reward pool, participant count, active/finalized flags, top winner | Persistent | ~1 year (`LEDGER_BUMP_PERMANENT = 5_184_000`), renewed on access | **Cold** — mutated on `create_season`, `finalize_season` only | ~120 bytes |
| `ActiveSeason` | `u32` | ID of the currently active season | Persistent | ~1 year, renewed alongside Season entries | **Hot** — read on every `claim_payout` to award season points | ~4 bytes |
| `Leaderboard(u32)` | `LeaderboardSnapshot` | Snapshot of ranked entries (rank, user, points, correct/total predictions) for a season | Persistent | ~1 year, renewed alongside `Season(u32)` | **Cold** — written only at season finalization | ~80 bytes × N entries |
| `SnapshotSeasonList` | `Vec<u32>` | Singleton list of season IDs that have a finalized leaderboard snapshot | Persistent | No dedicated bump | **Cold** — appended once per finalized season | ~4 bytes × N seasons |
| `InviteCode(Symbol)` | `InviteCode` | Invite code metadata: market ID, creator, max uses, current uses, expiry, active flag | Persistent | 7 days (`LEDGER_BUMP_INVITE = 100_800`), renewed on generation and redemption | **Cold** — accessed only during invite lifecycle | ~80 bytes |
| `MarketAllowlist(u64)` | `Vec<Address>` | Set-like list of addresses approved to predict in a private market | Persistent | 30 days, renewed with parent market | **Cold** — updated only on invite redemption | ~32 bytes × N allowed users |
| `Config` | `Config` | Global platform config: admin, protocol fee bps, max creator fee bps, min stake, oracle address, XLM token address, paused flag | Persistent | ~1 year (`LEDGER_BUMP_PERMANENT`), renewed on every read and write | **Hot** — read by every function that calls `get_config` | ~130 bytes |
| `Treasury` | `i128` | Cumulative protocol fees accrued (in stroops); logical counter separate from actual token balance | Persistent | 30 days (`PERSISTENT_BUMP = 518_400`), renewed on every write | **Hot** — updated on every `claim_payout` | ~16 bytes |
| `MarketCount` | `u64` | Global counter of total markets ever created; used as the next market ID | Persistent | No dedicated bump | **Hot** — read and incremented on every `create_market` | ~8 bytes |
| `SeasonCount` | `u32` | Global counter of total seasons ever created | Persistent | No dedicated bump | **Cold** — incremented only on `create_season` | ~4 bytes |
| `Paused` | `bool` | Emergency pause flag; when present and `true`, all non-admin entry points revert | Persistent | Inherits Config TTL bump (written atomically with Config) | **Cold** — set only in emergencies | ~1 byte |
| `Categories` | `Vec<Symbol>` | Whitelist of valid market categories (e.g. Sports, Crypto, Politics) | **Instance** | Extends with contract WASM TTL; explicitly bumped on `initialize` | **Hot** — read on every `create_market` | ~10 bytes × N categories |
| `CategoryIndex(Symbol)` | `Vec<u64>` | Ordered list of market IDs in creation order for a given category | Persistent | No dedicated bump | **Cold** — appended on `create_market` | ~8 bytes × N markets in category |
| `Proposal(u32)` | `GovernanceProposal` | Governance proposal: title, description, vote counts, state, execution target | Persistent | No dedicated bump | **Cold** — accessed only during governance votes | ~200 bytes |
| `ProposalCount` | `u32` | Global counter of governance proposals; used as the next proposal ID | Persistent | No dedicated bump | **Cold** — incremented only on `create_proposal` | ~4 bytes |
| `ProposalVote(u32, Address)` | `bool` | Whether a given voter has already voted on a given proposal (prevents double-voting) | Persistent | No dedicated bump | **Cold** — written once per voter per proposal | ~1 byte |
| `Dispute(u64)` | `Dispute` | Active dispute record for a market: disputer address, bond amount, filing timestamp | Persistent | Inherits market TTL bump | **Cold** — written only when a dispute is raised | ~72 bytes |
| `PlatformVolume` | `i128` | Cumulative total XLM staked across all markets (in stroops) | Persistent | No dedicated bump | **Hot** — incremented on every `submit_prediction` | ~16 bytes |
| `CreatorStats(Address)` | `CreatorStats` | Per-creator aggregate stats: markets created/resolved, avg participant count, dispute count, reputation score | Persistent | No dedicated bump | **Cold** — updated on market resolution | ~24 bytes |
| `EscrowLock` | `bool` | Temporary reentrancy guard for escrow operations; presence = lock held | **Temporary** | Auto-expires each ledger; explicitly removed after each transfer | **Hot** (during transfers) | ~1 byte |

---

## Struct field sizes (reference)

Approximate serialized sizes for Soroban `#[contracttype]` structs on-chain.

### `Market`
| Field | Type | Size |
|-------|------|------|
| `market_id` | `u64` | 8 bytes |
| `creator` | `Address` | 32 bytes |
| `title` | `String` | variable (~50 bytes typical) |
| `description` | `String` | variable (~200 bytes typical) |
| `category` | `Symbol` | ≤9 bytes |
| `outcome_options` | `Vec<Symbol>` | ≤9 bytes × N outcomes |
| `start_time` | `u64` | 8 bytes |
| `end_time` | `u64` | 8 bytes |
| `resolution_time` | `u64` | 8 bytes |
| `resolved_outcome` | `Option<Symbol>` | ≤10 bytes |
| `resolved_at` | `Option<u64>` | 9 bytes |
| `is_closed / is_resolved / is_cancelled / is_public` | `bool ×4` | 4 bytes |
| `total_pool` | `i128` | 16 bytes |
| `creator_fee_bps` | `u32` | 4 bytes |
| `min_stake / max_stake` | `i128 ×2` | 32 bytes |
| `participant_count` | `u32` | 4 bytes |
| `dispute_window` | `u64` | 8 bytes |
| **Total (typical)** | | **~450–550 bytes** |

### `Prediction`
| Field | Type | Size |
|-------|------|------|
| `market_id` | `u64` | 8 bytes |
| `predictor` | `Address` | 32 bytes |
| `chosen_outcome` | `Symbol` | ≤9 bytes |
| `stake_amount` | `i128` | 16 bytes |
| `submitted_at` | `u64` | 8 bytes |
| `payout_claimed` | `bool` | 1 byte |
| `payout_amount` | `i128` | 16 bytes |
| **Total** | | **~90–100 bytes** |

### `UserProfile`
| Field | Type | Size |
|-------|------|------|
| `address` | `Address` | 32 bytes |
| `total_predictions` | `u32` | 4 bytes |
| `correct_predictions` | `u32` | 4 bytes |
| `total_staked` | `i128` | 16 bytes |
| `total_winnings` | `i128` | 16 bytes |
| `season_points` | `u32` | 4 bytes |
| `reputation_score` | `u32` | 4 bytes |
| `joined_at` | `u64` | 8 bytes |
| **Total** | | **~88 bytes** |

### `Season`
| Field | Type | Size |
|-------|------|------|
| `season_id` | `u32` | 4 bytes |
| `start_time / end_time` | `u64 ×2` | 16 bytes |
| `reward_pool` | `i128` | 16 bytes |
| `participant_count` | `u32` | 4 bytes |
| `is_active / is_finalized` | `bool ×2` | 2 bytes |
| `top_winner` | `Option<Address>` | 33 bytes |
| **Total** | | **~75 bytes** |

### `InviteCode`
| Field | Type | Size |
|-------|------|------|
| `code` | `Symbol` | ≤9 bytes |
| `market_id` | `u64` | 8 bytes |
| `creator` | `Address` | 32 bytes |
| `max_uses / current_uses` | `u32 ×2` | 8 bytes |
| `expires_at` | `u64` | 8 bytes |
| `is_active` | `bool` | 1 byte |
| **Total** | | **~66 bytes** |

---

## Key access patterns

### Hot keys (read/written on most transactions)
- `Config` — read by every function via `get_config`
- `Market(u64)` — read and written on predictions, close, and resolution
- `PredictorList(u64)` — appended on every prediction submission
- `Treasury` — incremented on every payout claim
- `PlatformVolume` — incremented on every prediction submission
- `User(Address)` — updated on every payout claim
- `ActiveSeason` — read on every payout claim to award season points
- `EscrowLock` (temporary) — set and removed on every escrow operation

### Cold keys (accessed infrequently)
- `Leaderboard(u32)` — written once per season finalization
- `Season(u32)` — written on season lifecycle events only
- `InviteCode(Symbol)` — accessed only during invite lifecycle
- `MarketAllowlist(u64)` — updated only on invite redemption
- `Proposal(u32)` / `ProposalVote(u32, Address)` — governance only
- `Dispute(u64)` — written only when a dispute is raised
- `CreatorStats(Address)` — updated on market resolution only
- `SnapshotSeasonList` — appended once per finalized season

---

## TTL constants reference

Defined in `src/ttl.rs` and `src/config.rs`. All values are in ledgers (~6 seconds per ledger on Stellar Mainnet).

| Constant | Ledgers | Approx. Duration | Applied to |
|----------|---------|-----------------|------------|
| `LEDGER_BUMP_MARKET` | 432,000 | ~30 days | `Market`, `PredictorList` |
| `LEDGER_BUMP_PREDICTION_CLAIMED` | 100,800 | ~7 days | `Prediction` after payout claimed |
| `LEDGER_BUMP_USER` | 1,296,000 | ~90 days | `User` |
| `LEDGER_BUMP_INVITE` | 100,800 | ~7 days | `InviteCode` |
| `LEDGER_BUMP_PERMANENT` | 5,184,000 | ~1 year | `Config`, `Season`, `Leaderboard` |
| `PERSISTENT_BUMP` | 518,400 | ~30 days | `Config` (via `config.rs`) |
| `PERSISTENT_THRESHOLD` | 501,120 | ~29 days | Bump trigger for `Config` |

TTL extension uses a threshold pattern: storage is only extended when remaining TTL drops below `threshold(max) = max - 14_400` (~1 day buffer), preventing unnecessary ledger writes on every access.

---

## Schema upgrade notes

- All keys use `#[contracttype]` serialization — key format is stable across SDK patch versions.
- Adding a new `DataKey` variant does not break existing entries (additive change).
- Renaming or reordering `DataKey` variants is a breaking change — existing on-chain keys become unreachable.
- Struct field additions require migration if old entries need to be read (add `Option<T>` fields or migrate with a one-time upgrade function).
- Any schema-affecting change must include migration tests and a version bump in this document.
