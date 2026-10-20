//! Reward accounting for the staking pool (accumulator-per-share model).
//!
//! A staker's claimable rewards equal `shares * acc_reward_per_share /
//! ACC_PRECISION - reward_debt`. `reward_debt` is reset to that same checkpoint
//! on every stake, unstake, or claim, so a second claim pays nothing.
//!
//! Division dust is kept in `pending_rewards` instead of being dropped, so the
//! sum of claimable rewards never exceeds the tokens distributed into the pool
//! and the undistributed remainder is not lost.

use soroban_sdk::Env;

use crate::errors::StakingError;
use crate::storage_types::{Position, PoolState};

/// Fixed-point precision for `acc_reward_per_share`.
pub const ACC_PRECISION: i128 = 1_000_000_000_000; // 1e12

/// Fold a newly received reward amount into the pool accumulator.
/// When `total_shares == 0`, park it in `pending_rewards` instead.
///
/// When `total_shares > 0`, any token units that do not divide evenly across
/// shares stay in `pending_rewards`. They are folded into the next distribution
/// and cannot be claimed on top of the accumulator, so total claims cannot
/// exceed the distributable pool.
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

    // Fold in rewards parked while total_shares was 0, plus any prior dust.
    let total_amount = amount
        .checked_add(pool.pending_rewards)
        .ok_or(StakingError::Overflow)?;

    let scaled = total_amount
        .checked_mul(ACC_PRECISION)
        .ok_or(StakingError::Overflow)?;
    let increment = scaled
        .checked_div(pool.total_shares)
        .ok_or(StakingError::Overflow)?;

    // Tokens actually represented by the accumulator. The remainder stays
    // pending so it is neither claimable twice nor discarded.
    let accounted = increment
        .checked_mul(pool.total_shares)
        .ok_or(StakingError::Overflow)?
        .checked_div(ACC_PRECISION)
        .ok_or(StakingError::Overflow)?;
    pool.pending_rewards = total_amount
        .checked_sub(accounted)
        .ok_or(StakingError::Overflow)?;

    pool.acc_reward_per_share = pool
        .acc_reward_per_share
        .checked_add(increment)
        .ok_or(StakingError::Overflow)?;

    Ok(())
}

/// Route a penalty amount into the reward pool for distribution across
/// `total_shares`.
///
/// This is a thin, explicitly-named wrapper around [`distribute`] so that
/// penalty routing shares the exact same zero-shares semantics: when
/// `total_shares == 0` the amount is parked in `pending_rewards` (never
/// divided by zero) and is folded back into the accumulator once a new
/// staker joins the pool. With a nonzero `total_shares` the amount is
/// distributed proportionally to existing positions via the accumulator.
pub fn route_penalty_to_pool(
    env: &Env,
    pool: &mut PoolState,
    amount: i128,
) -> Result<(), StakingError> {
    distribute(env, pool, amount)
}

/// Accumulator checkpoint for a position: `shares * acc / ACC_PRECISION`.
///
/// This is the single rounding formula used both to measure claimable rewards
/// and to write `reward_debt`, so the two cannot drift apart.
pub fn checkpoint(pool: &PoolState, position: &Position) -> Result<i128, StakingError> {
    position
        .shares
        .checked_mul(pool.acc_reward_per_share)
        .ok_or(StakingError::Overflow)?
        .checked_div(ACC_PRECISION)
        .ok_or(StakingError::Overflow)
}

/// Compute the rewards currently claimable by a position.
///
/// A checkpoint at or below `reward_debt` is worth zero. It is not an error
/// and it does not pay again.
pub fn pending(pool: &PoolState, position: &Position) -> Result<i128, StakingError> {
    let accrued = checkpoint(pool, position)?;
    if accrued <= position.reward_debt {
        return Ok(0);
    }
    accrued
        .checked_sub(position.reward_debt)
        .ok_or(StakingError::Overflow)
}

/// Compute the rewards currently claimable by a staker, erroring with a
/// defined `StakingError` when the staker has no open position.
///
/// This is the single source of truth for the "no position" path so that
/// `claim_rewards` and `get_position` agree: a missing position is reported
/// as `StakingError::PositionNotFound` here and as `None` by `get_position`.
pub fn pending_for_staker(
    pool: &PoolState,
    position: Option<&Position>,
) -> Result<i128, StakingError> {
    match position {
        Some(position) => pending(pool, position),
        None => Err(StakingError::PositionNotFound),
    }
}

/// `reward_debt` value that checkpoints a position at the current accumulator.
///
/// On overflow this returns `i128::MAX` so the debt fails closed: `pending`
/// pays nothing instead of treating a failed checkpoint as zero debt and
/// releasing the whole accumulator.
pub fn reward_debt(pool: &PoolState, position: &Position) -> i128 {
    checkpoint(pool, position).unwrap_or(i128::MAX)
}

/// Reset a position's `reward_debt` to the current accumulator checkpoint.
pub fn settle_debt(pool: &PoolState, position: &mut Position) -> Result<(), StakingError> {
    position.reward_debt = checkpoint(pool, position)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::lock;
    use soroban_sdk::{testutils::Address as _, Address, Env};

    fn position(env: &Env, amount: i128, shares: i128, reward_debt: i128) -> Position {
        Position {
            owner: Address::generate(env),
            amount,
            shares,
            unlock_at: 0,
            reward_debt,
            unlock_requested_at: 0,
            pending_unlock_amount: 0,
        }
    }

    #[test]
    fn total_claims_never_exceed_the_pool() {
        let env = Env::default();
        let mut pool = PoolState {
            total_shares: 3,
            acc_reward_per_share: 0,
            pending_rewards: 0,
        };

        // 10 does not divide evenly across 3 shares. Dust must stay pending.
        distribute(&env, &mut pool, 10).unwrap();

        let mut claimed = 0;
        for _ in 0..3 {
            let staker = position(&env, 1, 1, 0);
            claimed += pending(&pool, &staker).unwrap();
        }

        assert!(claimed <= 10);
        assert_eq!(claimed + pool.pending_rewards, 10);
        assert_eq!(claimed, 9);
        assert_eq!(pool.pending_rewards, 1);
    }

    #[test]
    fn reward_matches_stake_weighted_share_including_duration_boost() {
        let env = Env::default();
        // Same raw stake, different lock boosts: 1.0x vs 2.0x.
        let short_shares = lock::boosted_shares(1_000, 10_000).unwrap();
        let long_shares = lock::boosted_shares(1_000, 20_000).unwrap();
        assert_eq!(short_shares, 1_000);
        assert_eq!(long_shares, 2_000);

        let mut pool = PoolState {
            total_shares: short_shares + long_shares,
            acc_reward_per_share: 0,
            pending_rewards: 0,
        };
        distribute(&env, &mut pool, 3_000).unwrap();

        let short = position(&env, 1_000, short_shares, 0);
        let long = position(&env, 1_000, long_shares, 0);
        let short_reward = pending(&pool, &short).unwrap();
        let long_reward = pending(&pool, &long).unwrap();

        assert_eq!(short_reward, 1_000);
        assert_eq!(long_reward, 2_000);
        assert_eq!(short_reward + long_reward, 3_000);
        assert_eq!(pool.pending_rewards, 0);
    }

    #[test]
    fn claiming_twice_does_not_double_pay() {
        let env = Env::default();
        // One position holds a quarter of the shares, so its share of 1_000 is 250.
        let mut pool = PoolState {
            total_shares: 4_000,
            acc_reward_per_share: 0,
            pending_rewards: 0,
        };
        distribute(&env, &mut pool, 1_000).unwrap();

        let mut staker = position(&env, 1_000, 1_000, 0);
        let first = pending(&pool, &staker).unwrap();
        assert_eq!(first, 250);

        settle_debt(&pool, &mut staker).unwrap();
        let second = pending(&pool, &staker).unwrap();
        assert_eq!(second, 0);
        assert_eq!(first + second, first);

        // Settling again does not reopen the claim.
        settle_debt(&pool, &mut staker).unwrap();
        assert_eq!(pending(&pool, &staker).unwrap(), 0);
    }

    #[test]
    fn missing_position_is_position_not_found() {
        let pool = PoolState {
            total_shares: 0,
            acc_reward_per_share: 0,
            pending_rewards: 0,
        };
        let result = pending_for_staker(&pool, None);
        assert_eq!(result, Err(StakingError::PositionNotFound));
    }
}
