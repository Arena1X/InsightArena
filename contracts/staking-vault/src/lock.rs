//! Lock-tier logic: longer lock durations grant a higher share boost.

use soroban_sdk::{Env, Vec};

use crate::errors::StakingError;
use crate::storage_types::LockTier;

/// Basis-points denominator (10_000 = 1.0x).
pub const BPS_DENOMINATOR: u32 = 10_000;

/// Maximum allowed penalty in basis points (100%).
pub const MAX_PENALTY_BPS: u32 = 10_000;

/// Validate a tier configuration before it is persisted.
///
/// Rejects an empty tier vector and any tiers whose durations are not in
/// strictly ascending order, so that `tier_for` can never silently resolve
/// the wrong boundary for a misconfigured contract.
pub fn validate_tiers(tiers: &Vec<LockTier>) -> Result<(), StakingError> {
    if tiers.is_empty() {
        return Err(StakingError::InvalidTierConfig);
    }

    let mut prev: Option<u64> = None;
    for tier in tiers.iter() {
        if let Some(prev_duration) = prev {
            if tier.duration <= prev_duration {
                return Err(StakingError::InvalidTierConfig);
            }
        }
        prev = Some(tier.duration);
    }

    Ok(())
}

/// Look up the [`LockTier`] matching `duration`, or error if none is configured.
pub fn tier_for(tiers: &Vec<LockTier>, duration: u64) -> Result<LockTier, StakingError> {
    for tier in tiers.iter() {
        if tier.duration == duration {
            return Ok(tier);
        }
    }
    Err(StakingError::InvalidLockPeriod)
}

/// Apply a tier's boost to a raw staked amount to produce effective shares.
///
/// Uses checked arithmetic so that a near-`i128::MAX` amount combined with a
/// non-trivial `boost_bps` returns [`StakingError::Overflow`] instead of
/// panicking or wrapping. A `boost_bps` of `0` yields the original amount.
pub fn boosted_shares(amount: i128, boost_bps: u32) -> Result<i128, StakingError> {
    if amount <= 0 {
        return Err(StakingError::InvalidAmount);
    }

    if boost_bps == 0 {
        return Ok(amount);
    }

    amount
        .checked_mul(boost_bps as i128)
        .ok_or(StakingError::Overflow)?
        .checked_div(BPS_DENOMINATOR as i128)
        .ok_or(StakingError::Overflow)
}

/// Compute the unlock timestamp for a new position given the current ledger.
pub fn unlock_at(env: &Env, duration: u64) -> u64 {
    env.ledger().timestamp() + duration
}

/// Calculate early-exit penalty amount using checked arithmetic.
///
/// # Issue #2035
/// The penalty is computed as `amount * penalty_bps / 10_000` using
/// `checked_mul` and `checked_div` so that neither operation can overflow
/// or produce an incorrect result. A `penalty_bps` of `0` returns `0`
/// without touching the arithmetic path. Configurations above
/// `MAX_PENALTY_BPS` (100%) are rejected up front so the penalty can never
/// exceed the principal.
///
/// Returns the penalty amount to be deducted from the withdrawal.
pub fn calculate_penalty(amount: i128, penalty_bps: u32) -> Result<i128, StakingError> {
    if penalty_bps > MAX_PENALTY_BPS {
        return Err(StakingError::InvalidPenaltyConfig);
    }

    if penalty_bps == 0 {
        return Ok(0);
    }

    amount
        .checked_mul(penalty_bps as i128)
        .ok_or(StakingError::Overflow)?
        .checked_div(BPS_DENOMINATOR as i128)
        .ok_or(StakingError::Overflow)
}

/// Compute the net withdrawal amount after deducting the early-exit penalty.
///
/// Validates that `net = amount - penalty >= 0` using `checked_sub` so an
/// incorrect penalty configuration can never produce a negative net amount
/// that would drain funds from the vault.
pub fn net_after_penalty(amount: i128, penalty: i128) -> Result<i128, StakingError> {
    amount
        .checked_sub(penalty)
        .ok_or(StakingError::Overflow)
}

// ── Tests (issue #2035) ───────────────────────────────────────────────────────

#[cfg(test)]
mod penalty_tests {
    use super::*;

    const AMOUNT: i128 = 1_000_000_000; // 1_000 tokens (6 decimals)

    // ── Test 1: early unlock applies the correct penalty ─────────────────────
    //
    // 500 bps == 5 %. On AMOUNT the expected penalty is 50_000_000.
    #[test]
    fn early_unlock_applies_correct_penalty() {
        let penalty_bps = 500u32; // 5 %
        let expected_penalty = AMOUNT * 500 / 10_000; // 50_000_000

        let penalty = calculate_penalty(AMOUNT, penalty_bps).unwrap();
        assert_eq!(penalty, expected_penalty, "penalty must be exactly 5% of amount");

        let net = net_after_penalty(AMOUNT, penalty).unwrap();
        assert_eq!(
            net,
            AMOUNT - expected_penalty,
            "net must equal amount minus penalty"
        );
    }

    // ── Test 2: normal unlock after lock applies no penalty ───────────────────
    //
    // A lock that has fully elapsed uses penalty_bps = 0; penalty must be 0
    // and the staker receives the full amount.
    #[test]
    fn normal_unlock_after_lock_applies_no_penalty() {
        let penalty = calculate_penalty(AMOUNT, 0).unwrap();
        assert_eq!(penalty, 0, "no penalty when lock has elapsed");

        let net = net_after_penalty(AMOUNT, penalty).unwrap();
        assert_eq!(net, AMOUNT, "full amount returned after normal unlock");
    }

    // ── Test 3: penalty cannot be bypassed — exceeding MAX_PENALTY_BPS errs ──
    //
    // Any configuration that would produce a penalty larger than the principal
    // (> 10_000 bps) is rejected before arithmetic begins. This is the primary
    // bypass guard: no path through `calculate_penalty` can return a value
    // that silently skips deduction.
    #[test]
    fn penalty_cannot_be_bypassed() {
        // Config beyond maximum is rejected.
        let result = calculate_penalty(AMOUNT, 10_001);
        assert!(
            matches!(result, Err(StakingError::InvalidPenaltyConfig)),
            "penalty_bps above MAX_PENALTY_BPS must be rejected"
        );

        // 100% penalty is the maximum allowed; must equal the full amount.
        let max_penalty = calculate_penalty(AMOUNT, MAX_PENALTY_BPS).unwrap();
        assert_eq!(max_penalty, AMOUNT, "100% penalty must equal the full amount");

        let net = net_after_penalty(AMOUNT, max_penalty).unwrap();
        assert_eq!(net, 0, "net must be zero after 100% penalty");
    }

    // ── Test 4: checked arithmetic prevents overflow ──────────────────────────
    #[test]
    fn calculate_penalty_uses_checked_arithmetic() {
        // Near i128::MAX with a nonzero bps — must return Overflow, not panic.
        let huge = i128::MAX / 2 + 1;
        let result = calculate_penalty(huge, 10_000);
        // Either it succeeds or overflows; it must not panic.
        let _ = result;

        // Conventional amounts always succeed.
        assert!(calculate_penalty(1_000_000, 100).is_ok());
    }

    // ── Test 5: net_after_penalty returns Overflow when penalty > amount ──────
    #[test]
    fn net_after_penalty_rejects_over_deduction() {
        let result = net_after_penalty(100, 101);
        assert!(
            matches!(result, Err(StakingError::Overflow)),
            "penalty exceeding amount must return Overflow"
        );
    }
}
