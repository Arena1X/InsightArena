//! Lock-tier logic: longer lock durations grant a higher share boost.
//!
//! Skeleton — fill in tier lookup and boost application.

use soroban_sdk::{Env, Vec};

use crate::errors::StakingError;
use crate::storage_types::LockTier;

/// Basis-points denominator (10_000 = 1.0x).
pub const BPS_DENOMINATOR: u32 = 10_000;

/// Look up the [`LockTier`] matching `duration`, or error if none is configured.
pub fn tier_for(_tiers: &Vec<LockTier>, _duration: u64) -> Result<LockTier, StakingError> {
    // TODO: find tier by exact duration match
    todo!()
}

/// Apply a tier's boost to a raw staked amount to produce effective shares.
pub fn boosted_shares(_amount: i128, _boost_bps: u32) -> Result<i128, StakingError> {
    // TODO: amount * boost_bps / BPS_DENOMINATOR with checked arithmetic
    todo!()
}

/// Compute the unlock timestamp for a new position given the current ledger.
pub fn unlock_at(_env: &Env, _duration: u64) -> u64 {
    // TODO: env.ledger().timestamp() + duration
    todo!()
}
