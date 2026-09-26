#![no_std]
#![allow(non_snake_case)]

pub mod errors;
pub mod fees;
pub mod lock;
pub mod pool;
pub mod storage_types;

pub use crate::errors::StakingError;
pub use crate::storage_types::{Config, DataKey, LockTier, Position, PoolState, UnbondingConfig};

use soroban_sdk::{contract, contractimpl, token::Client as TokenClient, Address, Env, Vec};

use crate::storage_types::{LEDGER_BUMP_PERMANENT, LEDGER_BUMP_POSITION};

/// Staking & fee-sharing vault for InsightArena.
///
/// Users stake the platform token for a lock period to earn boosted shares, and
/// receive a pro-rata cut of protocol fees pushed in by the `fee_source`
/// contract (e.g. `open-market`). Longer locks earn a higher share boost.
#[contract]
pub struct StakingVault;

fn get_config(env: &Env) -> Result<Config, StakingError> {
    env.storage()
        .instance()
        .get::<DataKey, Config>(&DataKey::Config)
        .ok_or(StakingError::NotInitialized)
}

fn get_pool_state(env: &Env) -> Result<PoolState, StakingError> {
    env.storage()
        .instance()
        .get::<DataKey, PoolState>(&DataKey::Pool)
        .ok_or(StakingError::NotInitialized)
}

fn set_pool_state(env: &Env, pool_state: &PoolState) {
    env.storage().instance().set(&DataKey::Pool, pool_state);
}

fn get_lock_tiers(env: &Env) -> Vec<LockTier> {
    env.storage()
        .instance()
        .get::<DataKey, Vec<LockTier>>(&DataKey::LockTiers)
        .unwrap_or_else(|| Vec::new(env))
}

fn get_position_raw(env: &Env, staker: &Address) -> Option<Position> {
    let key = DataKey::Position(staker.clone());
    let position = env.storage().persistent().get::<DataKey, Position>(&key);
    if position.is_some() {
        env.storage()
            .persistent()
            .extend_ttl(&key, LEDGER_BUMP_POSITION, LEDGER_BUMP_POSITION);
    }
    position
}

fn set_position(env: &Env, staker: &Address, position: &Position) {
    let key = DataKey::Position(staker.clone());
    env.storage().persistent().set(&key, position);
    env.storage()
        .persistent()
        .extend_ttl(&key, LEDGER_BUMP_POSITION, LEDGER_BUMP_POSITION);
}

fn require_not_paused(env: &Env) -> Result<(), StakingError> {
    let paused = env
        .storage()
        .instance()
        .get::<DataKey, bool>(&DataKey::Paused)
        .unwrap_or(false);
    if paused {
        return Err(StakingError::Paused);
    }
    Ok(())
}

/// Validate the lock-tier configuration supplied to `initialize`.
///
/// Rejects an empty tier vector and any tiers that are not strictly ordered by
/// ascending `min_lock_duration`, so `lock::tier_for` can never silently resolve
/// the wrong boundary. Returns `InvalidLockTiers` on any violation.
fn validate_lock_tiers(tiers: &Vec<LockTier>) -> Result<(), StakingError> {
    if tiers.is_empty() {
        return Err(StakingError::InvalidLockTiers);
    }

    let mut prev: Option<u64> = None;
    for tier in tiers.iter() {
        if let Some(prev_duration) = prev {
            if tier.min_lock_duration <= prev_duration {
                return Err(StakingError::InvalidLockTiers);
            }
        }
        prev = Some(tier.min_lock_duration);
    }

    Ok(())
}

#[contractimpl]
impl StakingVault {
    // ── Initialisation ──────────────────────────────────────────────────────────

    /// Configure the vault for first use. Reverts with `AlreadyInitialized`
    /// on any subsequent call.
    ///
    /// `lock_tiers` must be non-empty and strictly ordered by ascending
    /// `min_lock_duration`; otherwise the call reverts with `InvalidLockTiers`.
    pub fn initialize(
        env: Env,
        admin: Address,
        token: Address,
        fee_source: Address,
        lock_tiers: Vec<LockTier>,
        unbonding_config: UnbondingConfig,
    ) -> Result<(), StakingError> {
        if env
            .storage()
            .instance()
            .has(&DataKey::Config)
        {
            return Err(StakingError::AlreadyInitialized);
        }

        admin.require_auth();

        // Validate unbonding config
        if unbonding_config.penalty_bps > lock::MAX_PENALTY_BPS {
            return Err(StakingError::InvalidPenaltyConfig);
        }

        // Reject empty or out-of-order tier configurations up front so `stake`
        // can never silently apply the wrong boost.
        validate_lock_tiers(&lock_tiers)?;

        let config = Config {
            admin,
            token,
            fee_source,
        };
        env.storage().instance().set(&DataKey::Config, &config);
        env.storage()
            .instance()
            .set(&DataKey::LockTiers, &lock_tiers);
        env.storage()
            .instance()
            .set(&DataKey::UnbondingConfig, &unbonding_config);
        env.storage().instance().set(&DataKey::Paused, &false);

        let pool_state = PoolState {
            total_shares: 0,
            acc_reward_per_share: 0,
            pending_rewards: 0,
        };
        env.storage().instance().set(&DataKey::Pool, &pool_state);

        env.storage()
            .instance()
            .extend_ttl(LEDGER_BUMP_PERMANENT, LEDGER_BUMP_PERMANENT);

        Ok(())
    }

    // ── Queries ─────────────────────────────────────────────────────────────────

    /// Return the current pool state. Reverts with `NotInitialized` when the
    /// vault has not been configured yet, rather than panicking on missing
    /// storage.
    pub fn get_pool(env: Env) -> Result<PoolState, StakingError> {
        get_pool_state(&env)
    }

    /// Return the configured unbonding parameters. Reverts with
    /// `NotInitialized` when the vault has not been configured yet, rather
    /// than panicking on missing storage.
    pub fn get_unbonding_config(env: Env) -> Result<UnbondingConfig, StakingError> {
        env.storage()
            .instance()
            .get::<DataKey, UnbondingConfig>(&DataKey::UnbondingConfig)
            .ok_or(StakingError::NotInitialized)
    }

    /// Return the staker's position, or `None` when the vault has not been
    /// configured or the staker has never staked. Never panics on missing
    /// storage.
    pub fn get_position(env: Env, staker: Address) -> Option<Position> {
        get_position_raw(&env, &staker)
    }

    // ── Staking ─────────────────────────────────────────────────────────────────

    /// Stake `amount` of the token, locking it for `lock_duration` seconds in
    /// exchange for boosted reward shares. Transfers tokens into the vault.
    pub fn stake(
        env: Env,
        staker: Address,
        amount: i128,
        lock_duration: u64,
    ) -> Result<(), StakingError> {
        staker.require_auth();
        require_not_paused(&env)?;

        if amount <= 0 {
            return Err(StakingError::InvalidAmount);
        }

        let config = get_config(&env)?;
        let tiers = get_lock_tiers(&env);
        let tier = lock::tier_for(&tiers, lock_duration)?;
        let new_shares = lock::boosted_shares(amount, tier.boost_bps)?;

        let mut pool_state = get_pool_state(&env)?;

        let mut position = get_position_raw(&env, &staker).unwrap_or(Position {
            owner: staker.clone(),
            amount: 0,
            shares: 0,
            unlock_at: 0,
            reward_debt: 0,
            unlock_requested_at: 0,
            pending_unlock_amount: 0,
        });

        // Settle any pending rewards on the existing position before changing
        // its share balance, so the boost from this deposit does not
        // retroactively apply to already-accrued rewards.
        if position.shares > 0 {
            let owed = pool::pending(&pool_state, &position)?;
            if owed > 0 {
                let token_client = TokenClient::new(&env, &config.token);
                token_client.transfer(&env.current_contract_address(), &staker, &owed);
            }
        }

        let token_client = TokenClient::new(&env, &config.token);
        token_client.transfer(&staker, &env.current_contract_address(), &amount);

        position.amount += amount;
        position.shares += new_shares;
        position.unlock_at = env.ledger().timestamp() + lock_duration;
        position.reward_debt = pool::reward_debt(&pool_state, &position);

        pool_state.total_shares += new_shares;

        set_position(&env, &staker, &position);
        set_pool_state(&env, &pool_state);

        Ok(())
    }

    // ── Admin ───────────────────────────────────────────────────────────────────

    /// Pause or unpause staking. Only the configured admin may call this.
    ///
    /// The stored admin address must authorize the call before the paused flag
    /// is mutated, so a non-admin caller is rejected via auth failure and the
    /// flag is left unchanged.
    pub fn set_paused(env: Env, paused: bool) -> Result<(), StakingError> {
        let config = get_config(&env)?;
        config.admin.require_auth();

        env.storage().instance().set(&DataKey::Paused, &paused);

        Ok(())
    }
}
