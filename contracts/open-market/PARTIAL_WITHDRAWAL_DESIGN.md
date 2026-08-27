# Partial Position Withdrawal Feature

## Overview

The partial position withdrawal feature allows predictors to reduce their stake exposure before a market reaches its lock time (`market.end_time`). This improves capital efficiency by enabling users to exit positions when their conviction changes or market conditions shift, rather than being locked in until resolution.

## Problem Statement

Previously, once a predictor staked on an outcome, funds were locked until market resolution. Users could not reduce exposure even if:
- Their conviction in the outcome decreased
- They needed capital for other opportunities
- Market conditions made their position undesirable

This harmed user experience and capital efficiency, as funds were unnecessarily locked for the full market duration.

## Solution Design

### Key Features

1. **Time Window**: Withdrawals are only allowed before `market.end_time` (the lock time).
2. **Early-Exit Fee**: A configurable fee (default 5% / 500 bps) is deducted from withdrawals.
3. **Fee Distribution**: The fee is redistributed pro-rata to remaining participants, rewarding those who stay.
4. **Partial or Full Exit**: Users can withdraw part of their stake or exit completely.
5. **Position Recalculation**: Market state (total_pool, participant_count) is updated exactly.

### Architecture

#### Storage Changes

**Config Addition** (`Config` struct in `storage_types.rs`):
```rust
pub early_exit_fee_bps: u32,  // Configurable fee in basis points (default 500 = 5%)
```

**Error Types** (`errors.rs`):
- `WithdrawalAfterLockTime (113)`: Withdrawal attempted after `market.end_time`
- `InvalidWithdrawalAmount (114)`: Withdrawal amount is zero or negative
- `WithdrawalExceedsStake (115)`: Withdrawal amount exceeds user's current stake

#### Core Functions

**`withdraw_position(env, predictor, market_id, withdrawal_amount) -> (refund_amount, fee_amount)`**

Located in `prediction.rs`. Main entry point for partial withdrawals.

**Algorithm:**
1. Validate: Platform not paused, market exists, current time < lock time
2. Validate: Predictor has active stake, withdrawal is positive and ≤ stake
3. Calculate fee: `fee_amount = withdrawal_amount * early_exit_fee_bps / 10_000`
4. Calculate refund: `refund_amount = withdrawal_amount - fee_amount`
5. Reduce market pool: `market.total_pool -= withdrawal_amount`
6. Reduce predictor stake: `prediction.stake_amount -= withdrawal_amount`
7. If stake reaches zero: Remove predictor from market (decrement participant_count, remove prediction record)
8. Distribute fee: `distribute_early_exit_fee_to_participants()` pro-rata by remaining stake
9. Release refund via escrow: `escrow::release_payout(predictor, refund_amount)`
10. Update UserProfile: Decrease total_staked by withdrawal_amount
11. Emit event with market_id, predictor, withdrawal_amount, fee_amount, refund_amount

**`distribute_early_exit_fee_to_participants(env, market_id, total_fee, total_remaining_pool)`**

Iterates through all predictors in the market. For each remaining participant:
```
fee_share = total_fee * predictor_stake / total_remaining_pool
predictor.stake_amount += fee_share
```

Updates market.total_pool to reflect fee redistribution (fees enter the pool from remaining participants' perspective).

**Invariant Check**: `sum(fee_shares_distributed) <= total_fee` (due to integer division)

#### Configuration

**Admin Function** (`config.rs`):
```rust
pub fn set_early_exit_fee_bps(env, admin, new_fee_bps) -> Result<(), InsightArenaError>
```

Validates: `0 <= new_fee_bps <= 10_000` (100%)

Default: 500 bps (5%)

**View Function**:
```rust
pub fn get_early_exit_fee_estimate(env, withdrawal_amount) -> (refund_amount, fee_amount)
```

Allows users to pre-calculate fees before submitting a withdrawal.

### Acceptance Criteria

✅ **Partial withdrawals reduce position and liquidity by exactly the withdrawn amount minus fee**
- `prediction.stake_amount -= withdrawal_amount`
- `market.total_pool -= withdrawal_amount`
- Refunded amount = `withdrawal_amount - fee`

✅ **Withdrawals are rejected after lock time**
- Guard: `now >= market.end_time` → `WithdrawalAfterLockTime`

✅ **Early-exit fee is conserved (deducted = redistributed)**
- Fee deducted from withdrawer: `fee = withdrawal_amount * bps / 10_000`
- Fee distributed to participants: `sum(fee_shares) = fee` (with integer division)
- Market pool accounts for redistribution: `market.total_pool += accumulated_fees`

✅ **Tests cover partial, full, and post-lock withdrawal attempts**
- `test_partial_withdrawal_reduces_position`: 40% of stake
- `test_full_withdrawal_removes_predictor`: 100% exit
- `test_withdrawal_rejected_after_lock_time`: Post-lock guard
- `test_early_exit_fee_distributed_to_participants`: Multi-predictor scenario
- `test_sequential_withdrawals`: Multiple withdrawals by same user

### State Transitions

```
[Prediction with stake S, market pool P]
    ↓
[Predictor calls withdraw_position(W)]
    ↓
[Calculate fee F = W * bps / 10_000]
    ↓
[Reduce stakes and pool: S' = S - W, P' = P - W]
    ↓
[Distribute fee F pro-rata to remaining participants]
    ↓
[Release refund R = W - F to predictor]
    ↓
[Update UserProfile, remove if S' = 0, emit event]
    ↓
[Return (R, F) to caller]
```

### Examples

#### Example 1: Partial Withdrawal (5% Fee)

**Initial State:**
- Predictor A: stake = 100,000
- Market pool: 100,000
- Fee rate: 5% (500 bps)

**Withdrawal Request:** 40,000

**Calculation:**
- Fee: 40,000 * 500 / 10,000 = 2,000
- Refund: 40,000 - 2,000 = 38,000

**Post-Withdrawal State:**
- Predictor A: stake = 60,000 (reduced by 40,000)
- Market pool: 60,000 (reduced by 40,000; fee enters pool after redistribution)
- Predictor A receives: 38,000 XLM

#### Example 2: Multi-Participant Fee Distribution

**Initial State:**
- Predictor A: stake = 50,000 on "YES"
- Predictor B: stake = 30,000 on "NO"
- Market pool: 80,000

**A Withdraws:** 20,000

**Fee Calculation:**
- Fee: 20,000 * 5% = 1,000
- Refund to A: 19,000
- Remaining pool after exit: 60,000

**Fee Distribution:**
- Remaining pool = (50,000 - 20,000) + 30,000 = 60,000
- A's share: 1,000 * 30,000 / 60,000 = 500
- B's share: 1,000 * 30,000 / 60,000 = 500

**Post-Withdrawal State:**
- A: stake = 30,000 + 500 = 30,500
- B: stake = 30,000 + 500 = 30,500
- Market pool: 60,000 + 1,000 = 61,000

#### Example 3: Full Exit

**Initial State:**
- Predictor C: stake = 75,000
- Market pool: 75,000
- Only predictor in market

**Withdrawal:** 75,000 (full)

**Calculation:**
- Fee: 75,000 * 5% = 3,750
- Refund: 71,250

**Post-Withdrawal:**
- Market pool: 0
- Participant count: 0 (C removed entirely)
- No fee distribution (no remaining participants)
- C receives: 71,250 XLM

### Gas / Performance Considerations

1. **Fee Distribution Loop**: O(n) where n = remaining predictors in market
   - Each participant receives a stake update and storage bump
   - Acceptable for typical market sizes (< 100 participants)

2. **Storage Access Pattern**:
   - 1 read: `Prediction(market_id, predictor)`
   - 1 read: `Market(market_id)`
   - 1 read: `Config` (for fee_bps)
   - N reads: Iterating `PredictorList(market_id)` and fetching predictions
   - 1-2 writes: `Prediction`, `Market`, possibly user removal
   - N writes: Updating participant stakes during fee distribution

3. **Optimization**: Consider batch withdrawals in future if performance becomes a constraint

### Security Considerations

1. **Authorization**: `predictor.require_auth()` ensures only the predictor can withdraw
2. **Fund Safety**: Refund is released via `escrow::release_payout()`, standard escrow pattern
3. **Reentrancy**: No external calls except escrow release (trusted internal module)
4. **Fee Conservation**: Validated by invariant: `sum(refunded) + sum(fees_distributed) = total_withdrawn`
5. **Integer Division**: Fee distribution uses integer division; small amounts may not be fully distributed (dust), but dust accumulates in market pool and benefits all remaining participants

### Testing Strategy

**Unit Tests** (`prediction_withdrawal.spec.rs`):
1. Partial withdrawal reduces position exactly
2. Full withdrawal removes predictor
3. Rejection after lock time
4. Zero/negative amount rejection
5. Excess amount rejection
6. Fee distribution across multiple participants
7. Fee configuration updates
8. Sequential withdrawals
9. Empty market after withdrawal
10. Fee estimate calculation
11. Resolved/cancelled market rejection
12. UserProfile stat updates

**Integration Tests**:
- Withdraw + claim payout flow
- Withdraw + transfer_prediction interactions
- Multiple markets / predictors simultaneously

### Future Enhancements

1. **Sliding Fee Scale**: Fee decreases over time (incentivize staying longer)
2. **Outcome-Based Fees**: Different fees for different outcomes or conviction levels
3. **Batched Withdrawals**: Single transaction for multiple markets
4. **Early Deposit Bonus**: Reverse fee for early depositors (reward conviction)
5. **Dynamic Caps**: Limit withdrawal rate per market to prevent cascades

## Contract Integration

### Public API Additions

**Entry Points** (in `lib.rs`):
```rust
pub fn withdraw_position(
    env: Env,
    predictor: Address,
    market_id: u64,
    withdrawal_amount: i128,
) -> Result<(i128, i128), InsightArenaError>

pub fn get_early_exit_fee_estimate(
    env: Env,
    withdrawal_amount: i128,
) -> Result<(i128, i128), InsightArenaError>

pub fn set_early_exit_fee_bps(
    env: Env,
    admin: Address,
    new_fee_bps: u32,
) -> Result<(), InsightArenaError>
```

### Events Emitted

```rust
emit_partial_withdrawal(
    market_id: u64,
    predictor: Address,
    withdrawal_amount: i128,
    fee_amount: i128,
    refund_amount: i128,
)
```

Event key: `("pred", "exit")`

### Related Entry Points

- `submit_prediction()`: Creates initial stake
- `transfer_prediction()`: Moves stake between users (complementary feature)
- `claim_payout()`: Claims resolved-market winnings (only after lock time)
- `claim_cancel_refund()`: Refund on cancelled market (separate mechanism)

## Documentation

- **User Guide**: How to estimate and execute withdrawals
- **Admin Guide**: Configuring early-exit fees
- **API Reference**: Full function signatures and error codes

## Compliance

✅ **Requirement 1**: Allow withdrawal before market lock time  
✅ **Requirement 2**: Recalculate position and liquidity  
✅ **Requirement 3**: Apply documented early-exit fee (5% default)  
✅ **Requirement 4**: Reject post-lock withdrawals  

All acceptance criteria met and thoroughly tested.
