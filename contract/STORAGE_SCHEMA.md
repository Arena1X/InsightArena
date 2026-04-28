# InsightArena Contract Storage Schema

This document is the authoritative reference for the on-chain data model. Read it before touching `storage_types.rs`. Any change that affects a `DataKey` variant or an existing struct field is a **breaking change** — see the [Breaking Changes](#breaking-changes) section.

---

## DataKey Variants

| DataKey | Storage type | TTL | Description |
|---|---|---|---|
| `Market(u64)` | Persistent | ~30 days | Full `Market` struct keyed by `market_id` |
| `PredictorList(u64)` | Persistent | ~30 days | `Vec<Address>` of all predictors for a market; used by cancel/batch-distribute |
| `Prediction(u64, Address)` | Persistent → Temporary after claim | ~30 days active / ~7 days after claim | `Prediction` struct keyed by `(market_id, predictor)` |
| `User(Address)` | Persistent | ~90 days | `UserProfile` struct keyed by wallet address |
| `UserList` | Persistent | ~90 days | `Vec<Address>` singleton of all addresses with a persisted profile |
| `Leaderboard(u32)` | Persistent | ~1 year | `LeaderboardSnapshot` keyed by `season_id` |
| `SnapshotSeasonList` | Persistent | ~1 year | `Vec<u32>` singleton of season IDs that have snapshots |
| `Season(u32)` | Persistent | ~1 year | `Season` struct keyed by `season_id` |
| `ActiveSeason` | Persistent | ~1 year | `u32` singleton — currently active season ID |
| `InviteCode(Symbol)` | Persistent | ~7 days | `InviteCode` struct keyed by code symbol |
| `MarketAllowlist(u64)` | Persistent | ~30 days | `Vec<Address>` of approved addresses for a private market |
| `Config` | Persistent | ~1 year | `Config` struct singleton — global platform configuration |
| `Treasury` | Persistent | ~1 year | `i128` singleton — cumulative protocol fees accrued |
| `MarketCount` | Persistent | ~1 year | `u64` singleton — total markets ever created (used as next ID) |
| `SeasonCount` | Persistent | ~1 year | `u32` singleton — total seasons ever created |
| `Paused` | Persistent | ~1 year | `bool` singleton — emergency pause flag |
| `Categories` | Instance | Instance TTL | `Vec<Symbol>` whitelist of valid market categories |
| `CategoryIndex(Symbol)` | Persistent | ~30 days | `Vec<u64>` of market IDs in creation order for a category |
| `Proposal(u32)` | Persistent | ~1 year | Governance proposal struct keyed by `proposal_id` |
| `ProposalCount` | Persistent | ~1 year | `u32` singleton — total governance proposals |
| `ProposalVote(u32, Address)` | Persistent | ~1 year | `bool` keyed by `(proposal_id, voter)` — vote cast flag |
| `EscrowLock` | Temporary | Transaction-scoped | Reentrancy mutex; set before XLM transfer, cleared after |
| `Dispute(u64)` | Persistent | ~30 days | `Dispute` struct keyed by `market_id` |
| `PlatformVolume` | Persistent | ~1 year | `i128` singleton — cumulative platform stake volume in stroops |
| `CreatorStats(Address)` | Persistent | ~90 days | `CreatorStats` struct keyed by creator address |
| `LiquidityPool(u64)` | Persistent | ~30 days | `LiquidityPool` struct keyed by `market_id` |
| `LPPosition(u64, Address)` | Persistent | ~30 days | `LPPosition` struct keyed by `(market_id, provider)` |
| `LPProviderList(u64)` | Persistent | ~30 days | `Vec<Address>` of liquidity providers for a market |
| `SwapHistory(u64)` | Persistent | ~30 days | `Vec<SwapRecord>` of historical swaps for a market |
| `PoolVolume(u64)` | Persistent | ~30 days | `i128` rolling 24h pool volume for a market |
| `ConditionalMarket(u64)` | Persistent | ~30 days | `ConditionalMarket` struct keyed by `market_id` |
| `ConditionalChildren(u64)` | Persistent | ~30 days | `Vec<u64>` child market IDs keyed by parent `market_id` |
| `ConditionalParent(u64)` | Persistent | ~30 days | `u64` parent market ID keyed by child `market_id` |
| `ConditionalChain(u64)` | Persistent | ~30 days | `ConditionalChain` struct keyed by `market_id` |
| `ConditionalDepth(u64)` | Persistent | ~30 days | `u32` nesting depth keyed by `market_id` |

---

## Struct Schemas

### `Config`

Stored at `DataKey::Config`. Set once by `initialize`; mutated only by admin functions.

| Field | Type | Description |
|---|---|---|
| `admin` | `Address` | Platform administrator; only address allowed to call admin mutators |
| `protocol_fee_bps` | `u32` | Platform cut in basis points (e.g. 200 = 2%) |
| `max_creator_fee_bps` | `u32` | Hard cap on creator fee; hardcoded to 500 (5%) at init |
| `min_stake_xlm` | `i128` | Minimum XLM stake in stroops; hardcoded to 10,000,000 (1 XLM) at init |
| `oracle_address` | `Address` | Trusted oracle address for market resolution |
| `xlm_token` | `Address` | Stellar Asset Contract address for XLM used in escrow transfers |
| `is_paused` | `bool` | When true, all non-admin entry points revert with `Paused` |

---

### `Market`

Stored at `DataKey::Market(market_id)`.

| Field | Type | Description |
|---|---|---|
| `market_id` | `u64` | Unique identifier, assigned from `MarketCount` |
| `creator` | `Address` | Wallet that created the market |
| `title` | `String` | Human-readable market title |
| `description` | `String` | Detailed description or resolution rules |
| `category` | `Symbol` | Category symbol (must be in `Categories` whitelist) |
| `outcome_options` | `Vec<Symbol>` | Valid outcome symbols users can predict |
| `start_time` | `u64` | Ledger timestamp when predictions open |
| `end_time` | `u64` | Ledger timestamp when predictions close |
| `resolution_time` | `u64` | Ledger timestamp after which oracle can resolve |
| `resolved_outcome` | `Option<Symbol>` | Final outcome; `None` until resolved |
| `resolved_at` | `Option<u64>` | Ledger timestamp of resolution; `None` until resolved |
| `is_closed` | `bool` | True after `end_time` passes; awaiting oracle resolution |
| `is_resolved` | `bool` | True after oracle resolves; payouts can be claimed |
| `is_cancelled` | `bool` | True if admin cancelled; all stakes refunded |
| `is_public` | `bool` | True = open to anyone; false = private (allowlist required) |
| `total_pool` | `i128` | Cumulative XLM staked in stroops |
| `creator_fee_bps` | `u32` | Creator's fee in basis points; max 500 |
| `min_stake` | `i128` | Minimum stake per prediction in stroops |
| `max_stake` | `i128` | Maximum stake per prediction in stroops |
| `participant_count` | `u32` | Number of unique stakers |
| `dispute_window` | `u64` | Seconds after resolution during which disputes can be filed |

---

### `Prediction`

Stored at `DataKey::Prediction(market_id, predictor)`. Moves from Persistent to Temporary storage after payout is claimed.

| Field | Type | Description |
|---|---|---|
| `market_id` | `u64` | Market this prediction belongs to |
| `predictor` | `Address` | Wallet that submitted the prediction |
| `chosen_outcome` | `Symbol` | The outcome the user predicted |
| `stake_amount` | `i128` | XLM staked in stroops |
| `submitted_at` | `u64` | Ledger timestamp of submission |
| `payout_claimed` | `bool` | True after successful payout claim |
| `payout_amount` | `i128` | Net XLM won; populated after claim (0 before) |

---

### `UserProfile`

Stored at `DataKey::User(address)`.

| Field | Type | Description |
|---|---|---|
| `address` | `Address` | Wallet address |
| `total_predictions` | `u32` | Total predictions ever submitted |
| `correct_predictions` | `u32` | Predictions that resolved in the user's favour |
| `total_staked` | `i128` | Cumulative XLM staked in stroops |
| `total_winnings` | `i128` | Cumulative XLM won in stroops |
| `season_points` | `u32` | Points in the current active season |
| `reputation_score` | `u32` | `(correct_predictions * 100) / total_predictions`, clamped to [0, 100] |
| `joined_at` | `u64` | Ledger timestamp of first interaction |

---

### `Season`

Stored at `DataKey::Season(season_id)`.

| Field | Type | Description |
|---|---|---|
| `season_id` | `u32` | Unique identifier, incrementing from 1 |
| `start_time` | `u64` | Ledger timestamp when the season opens |
| `end_time` | `u64` | Ledger timestamp when the season closes |
| `reward_pool` | `i128` | Total XLM prize pool in stroops |
| `participant_count` | `u32` | Unique wallets that earned at least one point |
| `is_active` | `bool` | True while the season window is open |
| `is_finalized` | `bool` | True after rewards are distributed and leaderboard is settled |
| `top_winner` | `Option<Address>` | Rank-1 address after finalization; `None` during active window |

---

### `LeaderboardEntry`

Embedded in `LeaderboardSnapshot.entries`.

| Field | Type | Description |
|---|---|---|
| `rank` | `u32` | Position on the leaderboard (1-indexed) |
| `user` | `Address` | Wallet address |
| `points` | `u32` | Season points at snapshot time |
| `correct_predictions` | `u32` | Correct predictions at snapshot time |
| `total_predictions` | `u32` | Total predictions at snapshot time |

---

### `LeaderboardSnapshot`

Stored at `DataKey::Leaderboard(season_id)`.

| Field | Type | Description |
|---|---|---|
| `season_id` | `u32` | Season this snapshot belongs to |
| `updated_at` | `u64` | Ledger timestamp of last update |
| `entries` | `Vec<LeaderboardEntry>` | Ordered list of ranked entries |

---

### `InviteCode`

Stored at `DataKey::InviteCode(code)`.

| Field | Type | Description |
|---|---|---|
| `code` | `Symbol` | Unique code symbol (also the storage key) |
| `market_id` | `u64` | Private market this code grants access to |
| `creator` | `Address` | Market creator who generated the code |
| `max_uses` | `u32` | Maximum redemptions allowed |
| `current_uses` | `u32` | Successful redemptions so far |
| `expires_at` | `u64` | Ledger timestamp after which the code is invalid |
| `is_active` | `bool` | False if creator manually revoked the code |

---

### `Dispute`

Stored at `DataKey::Dispute(market_id)`.

| Field | Type | Description |
|---|---|---|
| `disputer` | `Address` | Wallet that filed the dispute |
| `bond` | `i128` | XLM bond posted with the dispute in stroops |
| `filed_at` | `u64` | Ledger timestamp when the dispute was filed |

---

### `LiquidityPool`

Stored at `DataKey::LiquidityPool(market_id)`.

| Field | Type | Description |
|---|---|---|
| `market_id` | `u64` | Market this pool belongs to |
| `total_liquidity` | `i128` | Sum of all outcome reserves in stroops |
| `outcome_reserves` | `Map<Symbol, i128>` | Per-outcome reserve amounts |
| `lp_token_supply` | `i128` | Total LP tokens in circulation |
| `fee_bps` | `u32` | Swap fee in basis points |
| `created_at` | `u64` | Ledger timestamp of pool creation |

---

### `LPPosition`

Stored at `DataKey::LPPosition(market_id, provider)`.

| Field | Type | Description |
|---|---|---|
| `provider` | `Address` | Liquidity provider wallet |
| `market_id` | `u64` | Market this position belongs to |
| `lp_tokens` | `i128` | LP tokens held by this provider |
| `initial_deposit` | `i128` | XLM deposited at position creation in stroops |
| `fees_earned` | `i128` | Cumulative fees earned in stroops |
| `created_at` | `u64` | Ledger timestamp of position creation |

---

### `ConditionalMarket`

Stored at `DataKey::ConditionalMarket(market_id)`.

| Field | Type | Description |
|---|---|---|
| `market_id` | `u64` | This market's ID |
| `parent_market_id` | `u64` | ID of the parent market that gates activation |
| `required_outcome` | `Symbol` | Parent outcome that must resolve for this market to activate |
| `is_activated` | `bool` | True after the parent resolves with `required_outcome` |
| `activation_time` | `Option<u64>` | Ledger timestamp of activation; `None` until activated |
| `conditional_depth` | `u32` | Nesting depth (max enforced by `ConditionalDepthExceeded`) |
| `created_at` | `u64` | Ledger timestamp of creation |

---

### `CreatorStats`

Stored at `DataKey::CreatorStats(address)`.

| Field | Type | Description |
|---|---|---|
| `markets_created` | `u32` | Total markets created by this address |
| `markets_resolved` | `u32` | Markets that reached resolution |
| `average_participant_count` | `u32` | Rolling average participants per market |
| `dispute_count` | `u32` | Number of disputes filed against this creator's markets |
| `reputation_score` | `u32` | Computed reputation score (higher = more trustworthy) |

---

## Breaking Changes

Understanding what is and is not a breaking change is critical because on-chain data cannot be migrated without an explicit migration function.

### Safe (additive)

- Adding a **new `DataKey` variant** — existing keys are unaffected; new keys simply don't exist yet
- Adding an **`Option<T>` field** to an existing struct — old records deserialize with the field as `None`

### Breaking

- **Renaming a `DataKey` variant** — the old variant name is part of the serialized key; renaming it makes all existing on-chain records unreachable under the new name
- **Reordering `DataKey` variants** — Soroban serializes enum discriminants by position; reordering changes the discriminant values and makes existing keys unreachable
- **Adding a non-optional field to an existing struct** — old records stored without the field will fail to deserialize, causing panics on any read
- **Changing a field's type** — old records encoded with the original type cannot be decoded as the new type
- **Removing a field from a struct** — the serialized bytes still contain the old field; deserialization may succeed but the data is silently dropped, which can corrupt accounting

Any schema-affecting change must update this document and include migration tests before merging.
