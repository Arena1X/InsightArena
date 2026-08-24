#![no_std]
#![allow(non_snake_case)]

pub mod errors;
pub mod fees;
pub mod lock;
pub mod pool;
pub mod storage_types;

pub use crate::errors::StakingError;
pub use crate::storage_types::{Config, DataKey, LockTier, Position, PoolState};

use soroban_sdk::{contract, contractimpl, Address, Env, Vec};

/// Staking & fee-sharing vault for InsightArena.
///
/// Users stake the platform token for a lock period to earn boosted shares, and
/// receive a pro-rata cut of protocol fees pushed in by the `fee_source`
/// contract (e.g. `open-market`). Longer locks earn a higher share boost.
#[contract]
pub struct StakingVault;

#[contractimpl]
impl StakingVault {
    // ── Initialisation ──────────────────────────────────────────────────────────

    /// Configure the vault for first use. Reverts with `AlreadyInitialized`
    /// on any subsequent call.
    pub fn initialize(
        _env: Env,
        _admin: Address,
        _token: Address,
        _fee_source: Address,
        _lock_tiers: Vec<LockTier>,
    ) -> Result<(), StakingError> {
        // TODO: persist Config + LockTiers, init empty PoolState, guard re-init.
        todo!()
    }

    // ── Staking ─────────────────────────────────────────────────────────────────

    /// Stake `amount` of the token, locking it for `lock_duration` seconds in
    /// exchange for boosted reward shares. Transfers tokens into the vault.
    pub fn stake(
        _env: Env,
        _staker: Address,
        _amount: i128,
        _lock_duration: u64,
    ) -> Result<(), StakingError> {
        // TODO: require_auth, settle pending rewards, transfer in, mint shares.
        todo!()
    }

    /// Withdraw `amount` of staked tokens once the lock has elapsed.
    /// Pending rewards are auto-claimed as part of unstaking.
    pub fn unstake(
        _env: Env,
        _staker: Address,
        _amount: i128,
    ) -> Result<(), StakingError> {
        // TODO: require_auth, check unlock_at, claim, burn shares, transfer out.
        todo!()
    }

    // ── Rewards ─────────────────────────────────────────────────────────────────

    /// Claim accrued reward-share of protocol fees without unstaking.
    pub fn claim_rewards(_env: Env, _staker: Address) -> Result<i128, StakingError> {
        // TODO: require_auth, compute pending, reset debt, transfer out.
        todo!()
    }

    /// Push protocol fees into the reward pool. Callable only by `fee_source`.
    pub fn deposit_fees(
        _env: Env,
        _from: Address,
        _amount: i128,
    ) -> Result<(), StakingError> {
        // TODO: delegate to fees::deposit_fees.
        todo!()
    }

    // ── Views ───────────────────────────────────────────────────────────────────

    /// Return a staker's current position, if any.
    pub fn get_position(_env: Env, _staker: Address) -> Option<Position> {
        // TODO: read DataKey::Position(staker).
        todo!()
    }

    /// Return the rewards currently claimable by a staker.
    pub fn pending_rewards(_env: Env, _staker: Address) -> Result<i128, StakingError> {
        // TODO: pool::pending against stored position.
        todo!()
    }

    /// Return global pool accounting.
    pub fn get_pool(_env: Env) -> Result<PoolState, StakingError> {
        // TODO: read DataKey::Pool.
        todo!()
    }

    // ── Admin ───────────────────────────────────────────────────────────────────

    /// Pause / unpause sensitive operations. Admin-only.
    pub fn set_paused(_env: Env, _paused: bool) -> Result<(), StakingError> {
        // TODO: require admin auth, write DataKey::Paused.
        todo!()
    }
}
