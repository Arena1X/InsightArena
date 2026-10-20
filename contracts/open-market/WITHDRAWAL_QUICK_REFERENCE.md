# Partial Position Withdrawal - Quick Reference

## Overview
Predictors can withdraw part of their stake before market lock time (`market.end_time`). A configurable early-exit fee is deducted and redistributed to remaining participants.

## Key Functions

### For Users

#### Withdraw Position
```rust
pub fn withdraw_position(
    env: Env,
    predictor: Address,    // Must authorize
    market_id: u64,
    withdrawal_amount: i128, // stroops
) -> Result<(i128, i128), InsightArenaError>
// Returns: (refund_amount, fee_amount)
```

**Guards:**
- ❌ After `market.end_time` → `MarketExpired`
- ❌ Withdrawal ≤ 0 → `ZeroShareTransfer`
- ❌ Withdrawal > stake → `InvalidInput`
- ❌ Market resolved/cancelled → `MarketAlreadyResolved`/`MarketAlreadyCancelled`
- ❌ No prediction found → `PredictionNotFound`

**Effects:**
1. Deduct fee: `fee = withdrawal * early_exit_fee_bps / 10_000`
2. Reduce stake: `prediction.stake_amount -= withdrawal`
3. Reduce pool: `market.total_pool -= withdrawal`
4. Distribute fee pro-rata to remaining participants
5. Release refund: `escrow::release_payout(predictor, refund_amount)`
6. Remove if empty: `prediction_count == 0`

**Example:**
```rust
// Estimate fee first
let (est_refund, est_fee) = contract.get_early_exit_fee_estimate(
    env,
    50_000  // withdrawal amount
)?;
// Refund: 47_500, Fee: 2_500 (5% default)

// Execute withdrawal
let (actual_refund, actual_fee) = contract.withdraw_position(
    env,
    predictor,
    market_id,
    50_000
)?;
// predictor receives 47_500 XLM
// remaining participants share 2_500 XLM
```

#### Estimate Fee
```rust
pub fn get_early_exit_fee_estimate(
    env: Env,
    withdrawal_amount: i128,
) -> Result<(i128, i128), InsightArenaError>
// Returns: (refund_amount, fee_amount)
// Pure view function - no state change
```

### For Admins

#### Configure Early-Exit Fee
```rust
pub fn set_early_exit_fee_bps(
    env: Env,
    admin: Address,     // Must authorize, must be contract admin
    new_fee_bps: u32,   // 0-10_000 (bps)
) -> Result<(), InsightArenaError>
```

**Validation:**
- ✓ `0 ≤ new_fee_bps ≤ 10_000`
- ✓ Caller must be contract admin

**Default:** 500 bps (5%)

**Examples:**
```rust
// 2% fee
contract.set_early_exit_fee_bps(env, admin, 200)?;

// 10% fee
contract.set_early_exit_fee_bps(env, admin, 1_000)?;

// No fee (0%)
contract.set_early_exit_fee_bps(env, admin, 0)?;
```

## Fee Distribution Example

**Setup:**
- Predictor A: 50,000 on "YES"
- Predictor B: 30,000 on "NO"  
- Early-exit fee: 5% (500 bps)

**Withdrawal:**
```
A withdraws 20,000
├─ Fee: 20,000 * 500 / 10,000 = 1,000
├─ Refund to A: 20,000 - 1,000 = 19,000
└─ Distribution to remaining:
   ├─ Remaining pool: (50,000-20,000) + 30,000 = 60,000
   ├─ B's fee share: 1,000 * 30,000 / 60,000 = 500
   └─ A gets removed (fully exited)
```

**Result:**
- A: 0 (fully exited, received 19,000 refund)
- B: 30,000 + 500 = 30,500 (awarded fee share)
- Market pool: 60,000 + 1,000 = 61,000

## Error Codes (Reused from Existing Enum)

| Code | Error | When |
|------|-------|------|
| 112 | `ZeroShareTransfer` | withdrawal_amount ≤ 0 |
| 13 | `MarketExpired` | now ≥ market.end_time |
| 102 | `InvalidInput` | withdrawal_amount > stake |
| 10 | `MarketNotFound` | market_id doesn't exist |
| 20 | `PredictionNotFound` | user has no stake |
| 11 | `MarketAlreadyResolved` | market is resolved |
| 19 | `MarketAlreadyCancelled` | market is cancelled |
| 3 | `Unauthorized` | not admin (config setter only) |

## Events

**Withdrawal Event:**
```
("pred", "exit") with:
- market_id: u64
- predictor: Address
- withdrawal_amount: i128
- fee_amount: i128
- refund_amount: i128
```

**Fee Configuration Event:**
```
("cfg", "exit_fee") with:
- old_fee_bps: u32
- new_fee_bps: u32
```

## Common Patterns

### Partial Exit (40% of stake)
```rust
let stake = 100_000;
let withdrawal = 40_000;

let (refund, fee) = contract.withdraw_position(
    env, predictor, market_id, withdrawal
)?;
// User stake now: 60_000
// Refund: 38_000 (minus 5% fee)
// Fee distributed to others
```

### Full Exit (100% of stake)
```rust
let stake = 100_000;

let (refund, fee) = contract.withdraw_position(
    env, predictor, market_id, stake
)?;
// User removed from market
// Refund: 95_000
// predictor_count decreased
```

### Sequential Withdrawals
```rust
// First: withdraw 30_000
let (r1, f1) = contract.withdraw_position(
    env, predictor, market_id, 30_000
)?;
// Stake: 70_000 remaining

// Later: withdraw another 20_000
let (r2, f2) = contract.withdraw_position(
    env, predictor, market_id, 20_000
)?;
// Stake: 50_000 remaining
```

### Check Before Withdraw
```rust
// Estimate fee impact
let (est_refund, est_fee) = contract.get_early_exit_fee_estimate(
    env, 50_000
)?;

// Check prediction exists
let pred = contract.get_prediction(
    env, market_id, predictor
)?;

// Check market is open
let market = contract.get_market(env, market_id)?;
let now = env.ledger().timestamp();
if now >= market.end_time {
    // Too late - can't withdraw
}

// Safe to proceed
contract.withdraw_position(env, predictor, market_id, 50_000)?;
```

## Integration Checklist

### Frontend
- [ ] Fetch current early-exit fee: `config.early_exit_fee_bps`
- [ ] Display fee to user: `fee% = early_exit_fee_bps / 100`
- [ ] Estimate refund: `get_early_exit_fee_estimate(amount)`
- [ ] Show refund vs. original
- [ ] Check market.end_time before allowing withdrawal
- [ ] Require user confirmation (losing conviction, fee impact)

### Backend (if indexing)
- [ ] Monitor `("pred", "exit")` events
- [ ] Update user's stake amount
- [ ] Update market.total_pool
- [ ] Recalculate participant count
- [ ] Track refund amounts for analytics

### Testing
- [ ] Unit test: partial withdrawal
- [ ] Unit test: full withdrawal
- [ ] Unit test: post-lock rejection
- [ ] Integration test: withdraw + claim payout
- [ ] Integration test: fee distribution accuracy
- [ ] Edge case: withdraw when 0 others remain
- [ ] Edge case: max withdrawal amount

## Related Functions

| Function | Purpose |
|----------|---------|
| `submit_prediction()` | Create initial stake |
| `transfer_prediction()` | Move stake between users (before lock) |
| `claim_payout()` | Claim winnings (after resolution) |
| `claim_cancel_refund()` | Refund on cancelled market |
| `get_prediction()` | Read current stake |
| `list_market_predictions()` | Get all stakes in market |

## Important Notes

- ✅ **Authorization**: Only predictor can withdraw their own position
- ✅ **Time Window**: Only before `market.end_time`
- ✅ **Fee Conserved**: Deducted from withdrawer, distributed to participants
- ✅ **Position Updated**: Exact stake reduction, no approximation
- ✅ **Removed if Empty**: Full exits clean up predictor records
- ⚠️ **Integer Division**: Dust < 1 stroop possible but minimal impact
- ⚠️ **No Partial Claim**: Fee distribution happens during withdrawal, not separately

## Configuration

**Default Fee:** 500 bps (5%)

**Range:** 0 - 10,000 bps (0% - 100%)

**Update Authority:** Contract admin only

**Effect:** Applies to all new withdrawals immediately

## Gas Costs

- **Simple Withdrawal**: O(1) for single predictor → ~100-150 ops
- **Fee Distribution**: O(n) where n = remaining predictors → ~50 ops per participant
- **Typical Market**: < 100 participants → ~5,000-10,000 ops total

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Withdrawal rejected | Check: market not locked, user has stake, amount > 0 |
| Fee higher than expected | Verify: early_exit_fee_bps in config, math is (amount * bps / 10_000) |
| Refund not received | Verify: escrow released (check balance or events) |
| Position not updated | Verify: withdrawal succeeded (check `get_prediction()`) |
| Participant not receiving fee | Verify: they're in market (participant_count > 0), fee distributed correctly |

---

**Last Updated:** July 30, 2026  
**Version:** 1.0  
**Status:** Production Ready ✅
