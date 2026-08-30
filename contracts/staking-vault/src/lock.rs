//! Lock-tier logic: longer lock durations grant a higher share boost.

use soroban_sdk::{Env, Vec};

use crate::errors::StakingError;
use crate::storage_types::LockTier;

/// Basis-points denominator (10_000 = 1.0x).
pub const BPS_DENOMINATOR: u32 = 10_000;

/// Maximum allowed penalty in basis points (100%).
pub const MAX_PENALTY_BPS: u32 = 10_000;

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
pub fn boosted_shares(amount: i128, boost_bps: u32) -> Result<i128, StakingError> {
    if amount <= 0 {
        return Err(StakingError::InvalidAmount);
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
