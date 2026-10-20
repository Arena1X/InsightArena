# Partial Position Withdrawal - Flow Diagram

## High-Level Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    PARTIAL WITHDRAWAL FLOW                       │
└─────────────────────────────────────────────────────────────────┘

                         ┌──────────────┐
                         │  Predictor   │
                         │  (has stake) │
                         └──────┬───────┘
                                │
                                ▼
                    ┌───────────────────────┐
                    │ Estimate Fee (optional)│
                    │ get_early_exit_fee_    │
                    │      estimate()        │
                    └───────────┬───────────┘
                                │
                                ▼
                    ┌───────────────────────┐
                    │   withdraw_position() │
                    │   - market_id         │
                    │   - withdrawal_amount │
                    └───────────┬───────────┘
                                │
        ┌───────────────────────┴───────────────────────┐
        │              VALIDATION GUARDS                 │
        ├───────────────────────────────────────────────┤
        │ ✓ Platform not paused                         │
        │ ✓ Market exists                               │
        │ ✓ Market not resolved/cancelled               │
        │ ✓ Current time < market.end_time (LOCK TIME)  │
        │ ✓ Withdrawal > 0                              │
        │ ✓ Withdrawal ≤ current stake                  │
        │ ✓ Predictor has prediction                    │
        └───────────────────────┬───────────────────────┘
                                │
                                ▼
                    ┌───────────────────────┐
                    │   CALCULATE FEE       │
                    │ fee = withdrawal *    │
                    │   early_exit_fee_bps  │
                    │      / 10,000         │
                    │ refund = withdrawal   │
                    │        - fee          │
                    └───────────┬───────────┘
                                │
                                ▼
                    ┌───────────────────────┐
                    │  UPDATE MARKET STATE  │
                    │ market.total_pool -=  │
                    │   withdrawal_amount   │
                    │ prediction.stake -=   │
                    │   withdrawal_amount   │
                    └───────────┬───────────┘
                                │
                ┌───────────────┴──────────────┐
                │                              │
                ▼                              ▼
    ┌──────────────────┐          ┌──────────────────┐
    │ Stake > 0?       │          │ Stake = 0?       │
    │ Keep predictor   │          │ Remove predictor │
    │ in market        │          │ - participant--  │
    └────────┬─────────┘          │ - delete record  │
             │                    └────────┬─────────┘
             │                             │
             └──────────┬──────────────────┘
                        │
                        ▼
            ┌───────────────────────┐
            │ DISTRIBUTE FEE        │
            │ (pro-rata to all      │
            │  remaining            │
            │  participants)        │
            └───────────┬───────────┘
                        │
                        ▼
            ┌───────────────────────┐
            │ RELEASE REFUND        │
            │ escrow::release_      │
            │   payout(refund)      │
            └───────────┬───────────┘
                        │
                        ▼
            ┌───────────────────────┐
            │ UPDATE USER PROFILE   │
            │ profile.total_staked  │
            │   -= withdrawal       │
            └───────────┬───────────┘
                        │
                        ▼
            ┌───────────────────────┐
            │    EMIT EVENT         │
            │ ("pred", "exit")      │
            │ - market_id           │
            │ - predictor           │
            │ - withdrawal_amount   │
            │ - fee_amount          │
            │ - refund_amount       │
            └───────────┬───────────┘
                        │
                        ▼
            ┌───────────────────────┐
            │  Return (refund, fee) │
            │  Predictor receives   │
            │      refund XLM       │
            └───────────────────────┘
```

## Fee Distribution Detail

```
┌─────────────────────────────────────────────────────────────────┐
│              FEE DISTRIBUTION (Pro-Rata)                         │
└─────────────────────────────────────────────────────────────────┘

                    Input: total_fee, remaining_pool
                                │
                                ▼
                    ┌───────────────────────┐
                    │ Get PredictorList     │
                    │ (all remaining        │
                    │  participants)        │
                    └───────────┬───────────┘
                                │
                                ▼
                ┌───────────────────────────────┐
                │ For each predictor:           │
                │                               │
                │ fee_share = total_fee *       │
                │   predictor.stake /           │
                │   remaining_pool              │
                │                               │
                │ predictor.stake += fee_share  │
                │                               │
                │ accumulated_fees += fee_share │
                └───────────┬───────────────────┘
                            │
                            ▼
                ┌───────────────────────┐
                │ Update market pool    │
                │ market.total_pool +=  │
                │   accumulated_fees    │
                └───────────────────────┘

Example:
  Total fee: 1,000 XLM
  Remaining pool: 60,000 XLM
  
  Predictor A (30,000 stake): 1,000 * 30,000 / 60,000 = 500 XLM
  Predictor B (30,000 stake): 1,000 * 30,000 / 60,000 = 500 XLM
  
  A's new stake: 30,000 + 500 = 30,500 XLM
  B's new stake: 30,000 + 500 = 30,500 XLM
  New pool: 60,000 + 1,000 = 61,000 XLM
```

## State Transitions

```
┌─────────────────────────────────────────────────────────────────┐
│                     STATE TRANSITIONS                            │
└─────────────────────────────────────────────────────────────────┘

INITIAL STATE:
┌──────────────────────────────────────┐
│ Market:                              │
│   - total_pool: 100,000              │
│   - participant_count: 1             │
│                                      │
│ Predictor:                           │
│   - stake_amount: 100,000            │
│   - in PredictorList                 │
│   - in UserMarkets                   │
│                                      │
│ UserProfile:                         │
│   - total_staked: 100,000            │
└──────────────────────────────────────┘
                 │
                 │ withdraw_position(40,000)
                 ▼
┌──────────────────────────────────────┐
│ INTERMEDIATE STATE (Processing):    │
│   - Calculate fee: 2,000             │
│   - Calculate refund: 38,000         │
└──────────────────────────────────────┘
                 │
                 ▼
FINAL STATE:
┌──────────────────────────────────────┐
│ Market:                              │
│   - total_pool: 60,000 ✓             │
│   - participant_count: 1 ✓          │
│                                      │
│ Predictor:                           │
│   - stake_amount: 60,000 ✓           │
│   - still in PredictorList ✓        │
│   - still in UserMarkets ✓          │
│                                      │
│ UserProfile:                         │
│   - total_staked: 60,000 ✓           │
│                                      │
│ Escrow:                              │
│   - Released: 38,000 to predictor ✓ │
│                                      │
│ Event:                               │
│   - ("pred", "exit") emitted ✓      │
└──────────────────────────────────────┘
```

## Error Handling Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                      ERROR PATHS                                 │
└─────────────────────────────────────────────────────────────────┘

withdraw_position()
        │
        ├─► Platform paused? ──────────► Return Paused (101)
        │
        ├─► Market not found? ─────────► Return MarketNotFound (10)
        │
        ├─► Market resolved? ──────────► Return MarketAlreadyResolved (11)
        │
        ├─► Market cancelled? ─────────► Return MarketAlreadyCancelled (19)
        │
        ├─► Now >= end_time? ──────────► Return MarketExpired (13)
        │                                 (LOCK TIME PASSED)
        │
        ├─► Withdrawal <= 0? ──────────► Return ZeroShareTransfer (112)
        │
        ├─► No prediction? ────────────► Return PredictionNotFound (20)
        │
        ├─► Withdrawal > stake? ───────► Return InvalidInput (102)
        │
        └─► All checks pass ───────────► ✓ Execute withdrawal
```

## Timeline Example

```
┌─────────────────────────────────────────────────────────────────┐
│                    MARKET TIMELINE                               │
└─────────────────────────────────────────────────────────────────┘

        Market Created          Market Ends (Lock Time)    Resolution
             │                          │                        │
             ▼                          ▼                        ▼
  ───────────●──────────────────────────●────────────────────────●────►
             │                          │                        │
             │◄──────────────────────►  │                       │
             │   WITHDRAWAL ALLOWED     │  WITHDRAWAL BLOCKED   │
             │   (Early-exit fee)       │  (Too late)           │
             │                          │                        │
             │                          │                        │
   Stake: submit_prediction()      Withdrawals     Claim: claim_payout()
                                   REJECTED
                                   (MarketExpired)

Time Zones:
  ✓ Before end_time: withdraw_position() allowed (with fee)
  ✗ After end_time:  withdraw_position() rejected (MarketExpired)
  ✓ After resolution: claim_payout() allowed (no fee, full payout)
```

## Fee Calculation Example

```
┌─────────────────────────────────────────────────────────────────┐
│                   FEE CALCULATION                                │
└─────────────────────────────────────────────────────────────────┘

Inputs:
  withdrawal_amount = 50,000 XLM
  early_exit_fee_bps = 500 (5%)

Calculation:
  fee_amount = withdrawal_amount * early_exit_fee_bps / 10,000
             = 50,000 * 500 / 10,000
             = 25,000,000 / 10,000
             = 2,500 XLM

  refund_amount = withdrawal_amount - fee_amount
                = 50,000 - 2,500
                = 47,500 XLM

Conservation Check:
  refund_amount + fee_amount = 47,500 + 2,500 = 50,000 ✓

Result:
  User receives: 47,500 XLM (to wallet)
  Fee distributed: 2,500 XLM (to remaining participants)
  Total accounted: 50,000 XLM ✓
```

## Multi-User Scenario

```
┌─────────────────────────────────────────────────────────────────┐
│              MULTI-USER WITHDRAWAL SCENARIO                      │
└─────────────────────────────────────────────────────────────────┘

INITIAL STATE:
┌───────────────────────────────────────┐
│ Market Pool: 150,000 XLM              │
├───────────────────────────────────────┤
│ User A: 50,000 XLM (33.3%)            │
│ User B: 60,000 XLM (40.0%)            │
│ User C: 40,000 XLM (26.7%)            │
└───────────────────────────────────────┘

USER A WITHDRAWS 20,000 XLM:
├─ Fee: 20,000 * 5% = 1,000 XLM
├─ Refund to A: 19,000 XLM
└─ Fee distribution:
   ├─ A's remaining: 30,000 XLM
   ├─ B's stake: 60,000 XLM
   ├─ C's stake: 40,000 XLM
   ├─ Total remaining: 130,000 XLM
   │
   ├─ A gets: 1,000 * 30,000 / 130,000 = 231 XLM
   ├─ B gets: 1,000 * 60,000 / 130,000 = 462 XLM
   └─ C gets: 1,000 * 40,000 / 130,000 = 308 XLM
      (Total: 1,001 XLM due to rounding, +1 stays in pool)

AFTER USER A'S WITHDRAWAL:
┌───────────────────────────────────────┐
│ Market Pool: 130,000 + 1,001 = 131,001│
├───────────────────────────────────────┤
│ User A: 30,000 + 231 = 30,231 XLM     │
│ User B: 60,000 + 462 = 60,462 XLM     │
│ User C: 40,000 + 308 = 40,308 XLM     │
└───────────────────────────────────────┘

USER C FULLY EXITS (40,308 XLM):
├─ Fee: 40,308 * 5% = 2,015 XLM
├─ Refund to C: 38,293 XLM
├─ C REMOVED from market
└─ Fee distribution:
   ├─ A's stake: 30,231 XLM
   ├─ B's stake: 60,462 XLM
   ├─ Total remaining: 90,693 XLM
   │
   ├─ A gets: 2,015 * 30,231 / 90,693 = 671 XLM
   └─ B gets: 2,015 * 60,462 / 90,693 = 1,344 XLM

FINAL STATE:
┌───────────────────────────────────────┐
│ Market Pool: 90,693 + 2,015 = 92,708  │
│ Participants: 2 (C removed)           │
├───────────────────────────────────────┤
│ User A: 30,231 + 671 = 30,902 XLM     │
│ User B: 60,462 + 1,344 = 61,806 XLM   │
│ User C: 0 (fully exited, received     │
│             38,293 XLM refund)         │
└───────────────────────────────────────┘

Key Insights:
• Users who stay are rewarded with fee shares
• Full exits remove user completely
• Pool and stakes remain consistent
• Fee conservation maintained throughout
```

---

**Diagram Version:** 1.0  
**Date:** July 30, 2026  
**Status:** Complete ✅
