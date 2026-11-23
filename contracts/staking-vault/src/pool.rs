//! Reward accounting for the staking pool (accumulator-per-share model).
//!
//! A staker's claimable rewards equal `floor((shares * acc_reward_per_share -
//! reward_debt) / ACC_PRECISION)`. `reward_debt` is kept in **scaled** units
//! (token units × `ACC_PRECISION`) and is advanced by exactly what was paid on
//! every stake, unstake, withdraw, or claim, so a second claim pays nothing and
//! the sub-unit fraction a position has earned is carried forward instead of
//! being rounded away.
//!
//! Distribution remainders are carried in scaled units too (`pending_rewards`
//! for whole units, `reward_remainder` for the sub-unit part), so the sum of
//! claimable rewards never exceeds the tokens distributed into the pool and
//! nothing drifts over many updates. See [`crate::config`] for the precision
//! guarantees.

use soroban_sdk::Env;

use crate::config::REWARD_PRECISION;
use crate::errors::StakingError;
use crate::storage_types::{Position, PoolState};

/// Fixed-point precision for `acc_reward_per_share`.
pub const ACC_PRECISION: i128 = REWARD_PRECISION;

/// Fold a newly received reward amount into the pool accumulator.
/// When `total_shares == 0`, park it in `pending_rewards` instead.
///
/// When `total_shares > 0`, the whole amount (plus anything parked earlier and
/// the carried scaled remainder) is converted to scaled units and divided
/// across shares. The division remainder — always smaller than
/// `total_shares` scaled units — is split back into whole units
/// (`pending_rewards`) and a sub-unit carry (`reward_remainder`), both folded
/// into the next distribution. Nothing is dropped and nothing is represented
/// twice, so `ACC_PRECISION * funded == Σ increment * total_shares +
/// ACC_PRECISION * pending_rewards + reward_remainder` holds exactly.
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
        .ok_or(StakingError::Overflow)?
        .checked_add(pool.reward_remainder)
        .ok_or(StakingError::Overflow)?;
    let increment = scaled
        .checked_div(pool.total_shares)
        .ok_or(StakingError::Overflow)?;

    // Scaled value actually represented by the accumulator; the leftover stays
    // with the pool so it is neither claimable twice nor discarded.
    let represented = increment
        .checked_mul(pool.total_shares)
        .ok_or(StakingError::Overflow)?;
    let leftover = scaled
        .checked_sub(represented)
        .ok_or(StakingError::Overflow)?;
    pool.pending_rewards = leftover / ACC_PRECISION;
    pool.reward_remainder = leftover % ACC_PRECISION;

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

/// Scaled accumulator checkpoint for a position: `shares * acc` (token units ×
/// `ACC_PRECISION`, not divided).
///
/// This is the single formula used both to measure claimable rewards and to
/// write `reward_debt`, so the two cannot drift apart.
pub fn checkpoint(pool: &PoolState, position: &Position) -> Result<i128, StakingError> {
    position
        .shares
        .checked_mul(pool.acc_reward_per_share)
        .ok_or(StakingError::Overflow)
}

/// Scaled rewards earned but not yet paid: `checkpoint - reward_debt`,
/// floored at zero.
fn unpaid_scaled(pool: &PoolState, position: &Position) -> Result<i128, StakingError> {
    let accrued = checkpoint(pool, position)?;
    if accrued <= position.reward_debt {
        return Ok(0);
    }
    accrued
        .checked_sub(position.reward_debt)
        .ok_or(StakingError::Overflow)
}

/// Compute the rewards currently claimable by a position (whole token units).
///
/// A checkpoint at or below `reward_debt` is worth zero. It is not an error
/// and it does not pay again.
pub fn pending(pool: &PoolState, position: &Position) -> Result<i128, StakingError> {
    Ok(unpaid_scaled(pool, position)? / ACC_PRECISION)
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

/// Pay out a position's claimable rewards and rebase it onto `new_shares`.
///
/// Returns the whole-unit amount owed (computed with the position's current
/// shares). The sub-unit fraction left over after paying is carried into the
/// new `reward_debt`, so repeated settlements never round a position's
/// rewards away. The caller is responsible for transferring the returned
/// amount and for updating `total_shares`.
pub fn settle(
    pool: &PoolState,
    position: &mut Position,
    new_shares: i128,
) -> Result<i128, StakingError> {
    let unpaid = unpaid_scaled(pool, position)?;
    let owed = unpaid / ACC_PRECISION;
    let carry = unpaid % ACC_PRECISION;

    position.shares = new_shares;
    position.reward_debt = checkpoint(pool, position)?
        .checked_sub(carry)
        .ok_or(StakingError::Overflow)?;
    Ok(owed)
}

/// Checkpoint a position's `reward_debt` at the current accumulator, keeping
/// any sub-unit fraction it has earned but not yet been paid.
pub fn settle_debt(pool: &PoolState, position: &mut Position) -> Result<(), StakingError> {
    let shares = position.shares;
    settle(pool, position, shares)?;
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
            reward_remainder: 0,
        };

        // 10 does not divide evenly across 3 shares. Dust must stay pending.
        distribute(&env, &mut pool, 10).unwrap();

        let mut claimed = 0;
        for _ in 0..3 {
            let staker = position(&env, 1, 1, 0);
            claimed += pending(&pool, &staker).unwrap();
        }

        assert!(claimed <= 10);
        assert_eq!(claimed, 9);
        // The 10 units are fully accounted for in scaled units: the
        // accumulator represents 3 * acc, and the leftover is carried — the
        // dust is no longer double-counted as a whole pending unit.
        assert_eq!(pool.pending_rewards, 0);
        assert_eq!(
            pool.acc_reward_per_share * 3 + pool.reward_remainder,
            10 * ACC_PRECISION
        );
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
            reward_remainder: 0,
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
            reward_remainder: 0,
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
            reward_remainder: 0,
        };
        let result = pending_for_staker(&pool, None);
        assert_eq!(result, Err(StakingError::PositionNotFound));
    }
}
