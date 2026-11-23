//! Reward-accrual precision configuration and the funded/distributed ledger.
//!
//! # Fixed-point model
//!
//! Rewards accrue through a per-share accumulator scaled by
//! [`REWARD_PRECISION`] (see [`crate::pool`]). Every distribution is carried
//! out in *scaled* units (token units × `REWARD_PRECISION`) so that nothing
//! is rounded away between distributions:
//!
//! ```text
//! scaled    = (amount + pending_rewards) * REWARD_PRECISION + reward_remainder
//! increment = scaled / total_shares                       (floor)
//! leftover  = scaled - increment * total_shares           (0 <= leftover < total_shares)
//! pending_rewards  = leftover / REWARD_PRECISION          (whole token units)
//! reward_remainder = leftover % REWARD_PRECISION          (sub-unit carry)
//! ```
//!
//! # Precision guarantees
//!
//! 1. **Exact conservation in the pool.** After every distribution
//!    `REWARD_PRECISION * funded == Σ increment_k * total_shares_k
//!    + REWARD_PRECISION * pending_rewards + reward_remainder`. Division
//!    remainders are carried forward — never dropped and never counted twice —
//!    so accrual does **not** drift no matter how many distributions occur.
//! 2. **Per-position rounding is bounded, not cumulative.** `reward_debt` is
//!    kept in scaled units. A position is paid
//!    `floor((shares * acc - reward_debt) / P)` and its debt advances by
//!    exactly the paid amount × `P`, so the earned sub-unit fraction is carried
//!    across every stake / claim / unstake / withdraw — including share
//!    changes. Over its lifetime a position receives the floor of its exact
//!    cumulative share: it is short by less than one token unit in total, no
//!    matter how many distributions or settlements occur.
//! 3. **Distributed never exceeds funded.** By (1) and (2) the sum of all
//!    claims is at most the funded total. As defence in depth, every payout is
//!    also checked against the [`RewardLedger`]: `distributed` can never exceed
//!    `funded`, and a payout that would cross it is capped at the remaining
//!    headroom.
//! 4. **Small and large stakes.** With `REWARD_PRECISION = 1e12`, a
//!    distribution of `a` units over `S` shares credits `a * 1e12 / S` per
//!    share. Rewards too small to move the accumulator (`a * 1e12 < S`) stay
//!    in `pending_rewards`/`reward_remainder` until enough accrues, so small
//!    stakers are not starved by truncation. Intermediate products use checked
//!    `i128` arithmetic and fail with `StakingError::Overflow` rather than
//!    wrapping.

use soroban_sdk::{contracttype, Env};

use crate::errors::StakingError;

/// Fixed-point scale of the reward accumulator (`acc_reward_per_share`).
pub const REWARD_PRECISION: i128 = 1_000_000_000_000; // 1e12

/// Running reward books: total tokens funded into the reward pool (fees and
/// routed penalties) and total rewards paid out to stakers.
///
/// Invariant: `distributed <= funded`.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RewardLedger {
    pub funded: i128,
    pub distributed: i128,
}

impl RewardLedger {
    pub fn new() -> Self {
        Self {
            funded: 0,
            distributed: 0,
        }
    }

    /// Rewards funded but not yet paid out: `funded - distributed`.
    pub fn undistributed(&self) -> Result<i128, StakingError> {
        self.funded
            .checked_sub(self.distributed)
            .ok_or(StakingError::Overflow)
    }

    /// Record `amount` newly funded into the reward pool.
    pub fn fund(&mut self, amount: i128) -> Result<(), StakingError> {
        if amount <= 0 {
            return Err(StakingError::InvalidAmount);
        }
        self.funded = self
            .funded
            .checked_add(amount)
            .ok_or(StakingError::Overflow)?;
        Ok(())
    }

    /// Record a payout of up to `owed`, capped so `distributed` never exceeds
    /// `funded`. Returns the amount actually payable.
    pub fn pay(&mut self, owed: i128) -> Result<i128, StakingError> {
        if owed <= 0 {
            return Ok(0);
        }
        let headroom = self.undistributed()?.max(0);
        let payable = owed.min(headroom);
        self.distributed = self
            .distributed
            .checked_add(payable)
            .ok_or(StakingError::Overflow)?;
        Ok(payable)
    }
}

#[contracttype]
#[derive(Clone)]
enum RewardDataKey {
    Ledger,
}

/// Load the reward ledger (empty if nothing has been funded yet).
pub fn load_reward_ledger(env: &Env) -> RewardLedger {
    env.storage()
        .instance()
        .get(&RewardDataKey::Ledger)
        .unwrap_or_else(RewardLedger::new)
}

fn save_reward_ledger(env: &Env, ledger: &RewardLedger) {
    env.storage().instance().set(&RewardDataKey::Ledger, ledger);
}

/// Record `amount` funded into the reward pool.
pub fn record_funded(env: &Env, amount: i128) -> Result<(), StakingError> {
    let mut ledger = load_reward_ledger(env);
    ledger.fund(amount)?;
    save_reward_ledger(env, &ledger);
    Ok(())
}

/// Record a reward payout of `owed`, returning the amount actually payable
/// (capped so total distributed never exceeds total funded).
pub fn record_distributed(env: &Env, owed: i128) -> Result<i128, StakingError> {
    if owed <= 0 {
        return Ok(0);
    }
    let mut ledger = load_reward_ledger(env);
    let payable = ledger.pay(owed)?;
    save_reward_ledger(env, &ledger);
    Ok(payable)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::pool;
    use crate::storage_types::{PoolState, Position};
    use soroban_sdk::{testutils::Address as _, Address, Env};

    fn empty_pool(total_shares: i128) -> PoolState {
        PoolState {
            total_shares,
            acc_reward_per_share: 0,
            pending_rewards: 0,
            reward_remainder: 0,
        }
    }

    fn position(env: &Env, shares: i128) -> Position {
        Position {
            owner: Address::generate(env),
            amount: shares,
            shares,
            unlock_at: 0,
            reward_debt: 0,
            unlock_requested_at: 0,
            pending_unlock_amount: 0,
        }
    }

    /// Exact pool-level conservation: P * funded ==
    /// Σ inc * S + P * pending_rewards + reward_remainder.
    fn assert_conserved(pool: &PoolState, funded: i128, accounted_scaled: i128) {
        assert_eq!(
            accounted_scaled + pool.pending_rewards * REWARD_PRECISION + pool.reward_remainder,
            funded * REWARD_PRECISION
        );
        assert!(pool.reward_remainder >= 0 && pool.reward_remainder < REWARD_PRECISION);
    }

    #[test]
    fn accrual_over_many_steps_matches_reference_within_tolerance() {
        let env = Env::default();
        // Three stakers with share counts that do not divide amounts evenly.
        let shares = [7_i128, 13, 31];
        let total_shares: i128 = shares.iter().sum();
        let mut pool = empty_pool(total_shares);

        let mut funded = 0_i128;
        let mut accounted_scaled = 0_i128;
        for step in 0..5_000_i128 {
            let amount = 1 + (step * 7_919) % 97; // awkward, non-divisible amounts
            let before = pool.acc_reward_per_share;
            pool::distribute(&env, &mut pool, amount).unwrap();
            accounted_scaled += (pool.acc_reward_per_share - before) * total_shares;
            funded += amount;
        }
        assert_conserved(&pool, funded, accounted_scaled);

        // Reference: exact pro-rata share of everything funded. Each staker's
        // accrual is within one token unit of it (no cumulative drift across
        // 5_000 distributions), and the sum never exceeds funded.
        let mut claimed = 0_i128;
        for s in shares {
            let p = position(&env, s);
            let accrued = pool::pending(&pool, &p).unwrap();
            let reference_floor = funded * s / total_shares;
            assert!(accrued <= reference_floor);
            assert!(reference_floor - accrued <= 1, "drift beyond tolerance");
            claimed += accrued;
        }
        assert!(claimed <= funded);
        assert!(funded - claimed <= shares.len() as i128);
    }

    #[test]
    fn dust_is_not_double_counted_across_distributions() {
        // Regression: carrying whole-unit dust while the accumulator also
        // represented its fractional part let claims exceed funding.
        let env = Env::default();
        let mut pool = empty_pool(3);
        let mut staker = position(&env, 3);
        let mut funded = 0;
        let mut distributed = 0;

        for amount in [10_i128, 1, 1, 1, 1, 1, 1, 1, 1, 1] {
            pool::distribute(&env, &mut pool, amount).unwrap();
            funded += amount;
            distributed += pool::pending(&pool, &staker).unwrap();
            pool::settle_debt(&pool, &mut staker).unwrap();
            assert!(distributed <= funded, "distributed exceeded funded");
        }
        assert!(funded - distributed <= 1);
    }

    #[test]
    fn distributed_never_exceeds_funded_with_changing_shares() {
        let env = Env::default();
        let mut pool = empty_pool(0);
        let mut a = position(&env, 0);
        let mut b = position(&env, 0);
        let mut ledger = RewardLedger::new();
        let mut paid = 0_i128;

        for step in 0..500_i128 {
            // Stakers alternately enter / grow their positions.
            let target = if step % 2 == 0 { &mut a } else { &mut b };
            let add = 1 + (step * 31) % 17;
            let new_shares = target.shares + add;
            let owed = pool::settle(&pool, target, new_shares).unwrap();
            paid += ledger.pay(owed).unwrap();
            pool.total_shares += add;

            let amount = 1 + (step * 13) % 11;
            pool::distribute(&env, &mut pool, amount).unwrap();
            ledger.fund(amount).unwrap();

            assert!(ledger.distributed <= ledger.funded);
        }
        let owed_a = pool::pending(&pool, &a).unwrap();
        let owed_b = pool::pending(&pool, &b).unwrap();
        // Exact accounting: everything owed fits inside what was funded, so
        // the ledger cap never has to clip a payout.
        assert_eq!(ledger.pay(owed_a).unwrap(), owed_a);
        assert_eq!(ledger.pay(owed_b).unwrap(), owed_b);
        paid += owed_a + owed_b;

        assert_eq!(paid, ledger.distributed);
        assert!(ledger.distributed <= ledger.funded);
        // Only sub-unit carries (< 1 unit per position) plus the pool's own
        // leftover remain undistributed.
        assert!(ledger.funded - ledger.distributed <= 3);
    }

    #[test]
    fn precision_holds_for_small_stakes() {
        let env = Env::default();
        // A 1-unit stake alongside a whale.
        let small = 1_i128;
        let whale = 999_999_i128;
        let mut pool = empty_pool(small + whale);

        let mut funded = 0;
        for _ in 0..1_000 {
            pool::distribute(&env, &mut pool, 3).unwrap();
            funded += 3;
        }

        let small_accrued = pool::pending(&pool, &position(&env, small)).unwrap();
        let whale_accrued = pool::pending(&pool, &position(&env, whale)).unwrap();
        // Exact share for the small staker is 3_000 / 1_000_000 = 0.003 → 0.
        assert_eq!(small_accrued, funded * small / (small + whale));
        assert!((funded * whale / (small + whale)) - whale_accrued <= 1);
        assert!(small_accrued + whale_accrued <= funded);
    }

    #[test]
    fn precision_holds_for_large_stakes() {
        let env = Env::default();
        // ~10 billion units staked (e.g. 1_000 XLM in stroops is 1e10).
        let large = 10_000_000_000_i128;
        let other = 3_i128;
        let mut pool = empty_pool(large + other);

        let mut funded = 0;
        for step in 0..1_000_i128 {
            let amount = 1_000_000 + step; // 0.1 XLM-scale deposits
            pool::distribute(&env, &mut pool, amount).unwrap();
            funded += amount;
        }

        let large_accrued = pool::pending(&pool, &position(&env, large)).unwrap();
        let other_accrued = pool::pending(&pool, &position(&env, other)).unwrap();
        let large_ref = funded * large / (large + other);
        let other_ref = funded * other / (large + other);
        assert!(large_accrued <= large_ref && large_ref - large_accrued <= 1);
        assert!(other_accrued <= other_ref && other_ref - other_accrued <= 1);
        assert!(large_accrued + other_accrued <= funded);
    }

    #[test]
    fn ledger_caps_payout_at_funded() {
        let mut ledger = RewardLedger::new();
        ledger.fund(100).unwrap();
        assert_eq!(ledger.pay(60).unwrap(), 60);
        // Only 40 left: a request for more is capped.
        assert_eq!(ledger.pay(50).unwrap(), 40);
        assert_eq!(ledger.pay(1).unwrap(), 0);
        assert_eq!(ledger.distributed, ledger.funded);
    }
}
