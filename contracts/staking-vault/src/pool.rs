//! Reward accounting for the staking pool (accumulator-per-share model).
//!
//! Skeleton — fill in the checked arithmetic. The invariant is that a staker's
//! claimable rewards equal `shares * acc_reward_per_share / ACC_PRECISION -
//! reward_debt`, and `reward_debt` is reset to the first term on every stake,
//! unstake, or claim.

use soroban_sdk::Env;

use crate::errors::StakingError;
use crate::storage_types::{Position, PoolState};

/// Fixed-point precision for `acc_reward_per_share`.
pub const ACC_PRECISION: i128 = 1_000_000_000_000; // 1e12

/// Fold a newly received reward amount into the pool accumulator.
/// When `total_shares == 0`, park it in `pending_rewards` instead.
pub fn distribute(_env: &Env, _pool: &mut PoolState, _amount: i128) -> Result<(), StakingError> {
    // TODO: acc_reward_per_share += amount * ACC_PRECISION / total_shares
    todo!()
}

/// Compute the rewards currently claimable by a position.
pub fn pending(_pool: &PoolState, _position: &Position) -> Result<i128, StakingError> {
    // TODO: shares * acc_reward_per_share / ACC_PRECISION - reward_debt
    todo!()
}

/// Reset a position's `reward_debt` to the current accumulator checkpoint.
pub fn settle_debt(_pool: &PoolState, _position: &mut Position) {
    // TODO: position.reward_debt = shares * acc_reward_per_share / ACC_PRECISION
    todo!()
}
