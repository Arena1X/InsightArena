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

/// Gate a withdrawal on the position's lock period.
///
/// Documented rule: a withdrawal is allowed at the exact unlock timestamp and
/// at any later time (`now >= unlock_at`). A withdrawal before that timestamp
/// is rejected with [`StakingError::LockNotElapsed`].
pub fn enforce_lock_period(now: u64, unlock_at: u64) -> Result<(), StakingError> {
    if now < unlock_at {
        return Err(StakingError::LockNotElapsed);
    }
    Ok(())
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

#[cfg(test)]
mod tests {
    use super::enforce_lock_period;
    use crate::errors::StakingError;

    const UNLOCK_AT: u64 = 1_700_000_000;

    #[test]
    fn withdrawal_before_unlock_time_is_rejected() {
        let result = enforce_lock_period(UNLOCK_AT - 1, UNLOCK_AT);
        assert_eq!(result, Err(StakingError::LockNotElapsed));
    }

    #[test]
    fn withdrawal_after_unlock_time_succeeds() {
        assert_eq!(enforce_lock_period(UNLOCK_AT + 1, UNLOCK_AT), Ok(()));
    }

    #[test]
    fn withdrawal_exactly_at_unlock_time_is_allowed() {
        // Documented rule: the unlock timestamp itself is withdrawable.
        assert_eq!(enforce_lock_period(UNLOCK_AT, UNLOCK_AT), Ok(()));
    }
}
