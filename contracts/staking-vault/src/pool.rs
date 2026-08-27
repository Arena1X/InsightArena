//! Reward accounting for the staking pool (accumulator-per-share model).
//!
//! The invariant is that a staker's claimable rewards equal `shares *
//! acc_reward_per_share / ACC_PRECISION - reward_debt`, and `reward_debt` is
//! reset to the first term on every stake, unstake, or claim.

use soroban_sdk::Env;

use crate::errors::StakingError;
use crate::storage_types::{Position, PoolState};

/// Fixed-point precision for `acc_reward_per_share`.
pub const ACC_PRECISION: i128 = 1_000_000_000_000; // 1e12

/// Fold a newly received reward amount into the pool accumulator.
/// When `total_shares == 0`, park it in `pending_rewards` instead.
pub fn distribute(_env: &Env, pool: &mut PoolState, amount: i128) -> Result<(), StakingError> {
    if amount <= 0 {
        return Err(StakingError::InvalidAmount);
    }

    if pool.total_shares == 0 {
        pool.pending_rewards = pool
            .pending_rewards
            .checked_add(amount)
            .ok_or(StakingError::Overflow)?;
        return Ok(());
    }

    // Fold in any rewards that were parked while total_shares was 0.
    let total_amount = amount
        .checked_add(pool.pending_rewards)
        .ok_or(StakingError::Overflow)?;
    pool.pending_rewards = 0;

    let scaled = total_amount
        .checked_mul(ACC_PRECISION)
        .ok_or(StakingError::Overflow)?;
    let increment = scaled
        .checked_div(pool.total_shares)
        .ok_or(StakingError::Overflow)?;

    pool.acc_reward_per_share = pool
        .acc_reward_per_share
        .checked_add(increment)
        .ok_or(StakingError::Overflow)?;

    Ok(())
}

/// Compute the rewards currently claimable by a position.
pub fn pending(pool: &PoolState, position: &Position) -> Result<i128, StakingError> {
    let accrued = position
        .shares
        .checked_mul(pool.acc_reward_per_share)
        .ok_or(StakingError::Overflow)?
        .checked_div(ACC_PRECISION)
        .ok_or(StakingError::Overflow)?;

    accrued
        .checked_sub(position.reward_debt)
        .ok_or(StakingError::Overflow)
}

/// Reset a position's `reward_debt` to the current accumulator checkpoint.
pub fn settle_debt(pool: &PoolState, position: &mut Position) {
    // shares * acc_reward_per_share cannot realistically overflow i128 for
    // token-scale amounts; guard with saturating arithmetic as a last resort.
    position.reward_debt = position
        .shares
        .saturating_mul(pool.acc_reward_per_share)
        / ACC_PRECISION;
}
