# InsightArena Contract Architecture

## Overview

The InsightArena Soroban smart contract is the on-chain core of the platform. It manages prediction markets, escrow, seasons, leaderboards, invite codes, governance, liquidity pools, and reputation — all deployed as a single contract on the Stellar network.

The backend calls the contract via Soroban RPC (using the `@stellar/stellar-sdk`) to create markets, submit predictions, and resolve outcomes. The frontend reads contract events and state directly via Soroban RPC through the Freighter wallet extension. All financial flows (staking, payouts, refunds, treasury) are handled entirely on-chain.

---

## Module Map

| Module | Owns | Key exports |
|---|---|---|
| `config.rs` | Global config, TTL constants, pause mechanism | `initialize`, `get_config`, `ensure_not_paused`, all `extend_*_ttl` functions |
| `market.rs` | Market lifecycle, categories, analytics, conditional markets | `create_market`, `resolve_market`, `cancel_market`, `close_market`, `get_market`, `list_markets`, `get_outcome_distribution`, `get_platform_stats` |
| `prediction.rs` | Prediction submission, payout calculation, batch distribution | `submit_prediction`, `claim_payout`, `batch_distribute_payouts`, `get_prediction`, `list_market_predictions` |
| `escrow.rs` | XLM locking, refunds, payouts, reentrancy guard, treasury | `lock_stake`, `refund`, `release_payout`, `get_contract_balance`, `assert_escrow_solvent`, `add_to_treasury_balance` |
| `season.rs` | Seasons, leaderboard snapshots, reward distribution, season points | `create_season`, `finalize_season`, `update_leaderboard`, `get_leaderboard`, `reset_season_points`, `calculate_points` |
| `invite.rs` | Invite code generation, redemption, revocation | `generate_invite_code`, `redeem_invite_code`, `revoke_invite_code` |
| `dispute.rs` | Dispute filing and resolution | `raise_dispute`, `resolve_dispute` |
| `governance.rs` | Proposals, voting, execution | `create_proposal`, `vote`, `execute_proposal` |
| `liquidity.rs` | AMM pool, LP tokens, swaps, fee distribution | `add_liquidity`, `remove_liquidity`, `swap_outcome`, `get_outcome_price` |
| `reputation.rs` | Creator stats and reputation scoring | `on_market_created`, `on_market_resolved`, `calculate_creator_reputation`, `get_creator_stats` |
| `storage_types.rs` | All `DataKey` variants and struct definitions | All types |
| `errors.rs` | All error codes | `InsightArenaError` enum |

---

## Data Flow Diagrams

### Market Creation

```
create_market(creator, params)
  → validate params (time, outcomes, category, fees, stake bounds)
  → next_market_id() — increment MarketCount
  → Market::new() — construct struct
  → storage.set(DataKey::Market(id), market)
  → append_market_to_category_index(category, id)
  → emit MarketCreated event
  → reputation::on_market_created(creator)
  → return market_id
```

### Prediction Submission

```
submit_prediction(predictor, market_id, outcome, stake)
  → ensure_not_paused()
  → load Market — validate open, outcome valid, stake bounds
  → check allowlist if private market
  → check no duplicate prediction
  → escrow::lock_stake(predictor, stake) — XLM transfer to contract
  → market::add_volume(stake)
  → store Prediction record
  → append predictor to PredictorList
  → update market.total_pool and participant_count
  → update UserProfile stats
  → season::track_user_profile(predictor)
  → emit PredictionSubmitted event
```

### Market Resolution

```
resolve_market(oracle, market_id, outcome)
  → oracle.require_auth() — verify oracle signature
  → validate oracle matches config.oracle_address
  → load Market — validate resolution_time passed, not already resolved, outcome valid
  → market.is_resolved = true, resolved_outcome = outcome, resolved_at = now
  → persist Market
  → emit MarketResolved event
  → reputation::on_market_resolved(creator, participant_count)
  → [TODO] check_conditional_activation(market_id, outcome)
```

### Payout Claim

```
claim_payout(predictor, market_id)
  → ensure_not_paused()
  → predictor.require_auth()
  → load Market — validate resolved
  → load Prediction — validate not claimed, correct outcome
  → calculate winning_pool from PredictorList
  → compute gross_payout = stake + (stake * loser_pool / winning_pool)
  → deduct protocol_fee (protocol_fee_bps) and creator_fee (creator_fee_bps)
  → escrow::release_payout(predictor, net_payout)
  → escrow::add_to_treasury_balance(protocol_fee)
  → escrow::refund(creator, creator_fee)
  → mark prediction.payout_claimed = true
  → move Prediction from Persistent to Temporary storage
  → update UserProfile (winnings, correct_predictions, season_points)
  → season::track_user_profile(predictor)
  → emit PayoutClaimed event
```

### Season Finalization

```
finalize_season(admin, season_id)
  → admin.require_auth() — validate admin
  → load Season — validate not finalized, end_time passed
  → get_leaderboard(season_id) — load snapshot
  → compute_reward_payouts(snapshot, reward_pool)
     → top 3 get fixed shares (40%, 20%, 10%)
     → remaining pool distributed proportionally by points
  → for each payout: escrow::release_payout(user, amount)
  → season.is_finalized = true, top_winner = rank_1_user
  → persist Season
  → emit SeasonFinalized event
```

---

## Error Handling

| Error | Code | When returned |
|---|---|---|
| `AlreadyInitialized` | 1 | `initialize` called more than once |
| `NotInitialized` | 2 | Any function called before `initialize` |
| `Unauthorized` | 3 | Caller lacks required role (non-admin, non-creator, non-oracle) |
| `InvalidSignature` | 4 | Cryptographic signature verification failed |
| `MarketNotFound` | 10 | Market lookup returns nothing from storage |
| `MarketAlreadyResolved` | 11 | Second resolution attempted on a resolved market |
| `MarketNotResolved` | 12 | Payout claim attempted before resolution |
| `MarketExpired` | 13 | Prediction submitted after `end_time` |
| `MarketNotStarted` | 14 | Prediction submitted before `start_time` |
| `MarketStillOpen` | 15 | Resolution attempted while market is still accepting predictions |
| `InvalidOutcome` | 16 | Predicted outcome not in `outcome_options` |
| `InvalidTimeRange` | 17 | `end_time <= start_time` or `resolution_time < end_time` |
| `InvalidFee` | 18 | `creator_fee_bps` exceeds 500 (5%) |
| `MarketAlreadyCancelled` | 19 | `cancel_market` called on already-cancelled market |
| `PredictionNotFound` | 20 | Prediction lookup for `(market_id, predictor)` returns nothing |
| `AlreadyPredicted` | 21 | User already has a prediction in this market |
| `StakeTooLow` | 22 | Stake below `min_stake` |
| `StakeTooHigh` | 23 | Stake above `max_stake` |
| `PayoutAlreadyClaimed` | 24 | `payout_claimed` is already true |
| `InsufficientFunds` | 30 | Payout or refund exceeds available escrow balance |
| `TransferFailed` | 31 | Native XLM transfer via Stellar asset contract failed |
| `EscrowEmpty` | 32 | Market `total_pool` is zero during resolution or refund |
| `SeasonNotActive` | 40 | Points award targets a closed season |
| `SeasonAlreadyFinalized` | 41 | Second finalization attempted |
| `SeasonNotFound` | 42 | Season lookup returns nothing |
| `InvalidInviteCode` | 50 | Invite code does not exist or does not match market |
| `InviteCodeExpired` | 51 | `expires_at` is in the past |
| `InviteCodeMaxUsed` | 52 | `current_uses >= max_uses` |
| `DisputeWindowClosed` | 60 | Dispute filed after the dispute window |
| `DisputeAlreadyFiled` | 61 | A dispute already exists for this market |
| `DisputeNotFound` | 62 | No active dispute for this market |
| `UserNotFound` | 63 | User profile lookup returns nothing |
| `Overflow` | 100 | Arithmetic operation exceeds i128/u32 range |
| `Paused` | 101 | Contract is in emergency-paused state |
| `InvalidInput` | 102 | Argument fails basic validation (empty string, zero-length list, etc.) |
| `ConditionalDepthExceeded` | 103 | Nested conditional market depth limit exceeded |

---

## TTL Strategy

Soroban persistent storage entries expire unless their TTL is extended. The contract bumps TTLs on every read and write using the constants defined in `config.rs`.

| Storage category | TTL | Rationale |
|---|---|---|
| Markets | ~30 days (`LEDGER_BUMP_MARKET` = 432,000 ledgers) | Active markets must be accessible for the full prediction window; TTL is refreshed on every interaction |
| Predictions (active) | ~30 days | Predictions must remain readable until the market resolves and the user claims |
| Predictions (claimed) | ~7 days (`LEDGER_BUMP_PREDICTION_CLAIMED` = 100,800 ledgers) | After claim, the record moves to temporary storage and is only needed for short-term audit |
| User profiles | ~90 days (`LEDGER_BUMP_USER` = 1,296,000 ledgers) | Users may be inactive for weeks between seasons; profiles must survive the gap |
| Config / Seasons | ~1 year (`LEDGER_BUMP_PERMANENT` = 5,184,000 ledgers) | Global config and season records are permanent platform state |
| Invite codes | ~7 days (`LEDGER_BUMP_INVITE` = 100,800 ledgers) | Invite codes are short-lived by design; they expire at or before the market's `end_time` |

---

## Security Model

### Reentrancy Guard

`DataKey::EscrowLock` is stored in **temporary storage** and acts as a mutex around all XLM transfers. Before any `transfer` call the escrow module sets the lock; after the transfer completes it is cleared. If the lock is already set when a function tries to acquire it, the call reverts. Temporary storage is used so the lock cannot be left permanently set by a failed transaction.

### Admin-only Functions

The following functions call `config.admin.require_auth()` and revert with `Unauthorized` if the caller is not the stored admin:

- `initialize` (one-time setup)
- `set_paused` / `transfer_admin` / `update_oracle` / `update_protocol_fee`
- `create_season` / `finalize_season`
- `create_proposal` / `execute_proposal` (governance)
- `cancel_market` (admin path; creator path uses creator auth)

### Oracle-only Resolution

`resolve_market` validates that the caller's address equals `config.oracle_address`. The oracle must sign the transaction (`oracle.require_auth()`). No other address can resolve a market.

### Pause Mechanism

`ensure_not_paused()` is called at the top of every user-facing entry point (`submit_prediction`, `claim_payout`, `redeem_invite_code`, etc.). It reads `Config.is_paused` and returns `Err(Paused)` if true. Admin functions bypass this check so the admin can still operate during a pause.

### Replay Prevention

Challenge nonces for wallet authentication are single-use and are validated and invalidated in the backend before the signed transaction reaches the contract. The contract itself does not track nonces — replay prevention at the auth layer is handled off-chain.
