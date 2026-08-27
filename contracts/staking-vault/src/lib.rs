#![no_std]
#![allow(non_snake_case)]

pub mod errors;
pub mod fees;
pub mod lock;
pub mod pool;
pub mod storage_types;

pub use crate::errors::StakingError;
pub use crate::storage_types::{Config, DataKey, LockTier, Position, PoolState};

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

#[contractimpl]
impl StakingVault {
    // ── Initialisation ──────────────────────────────────────────────────────────

    /// Configure the vault for first use. Reverts with `AlreadyInitialized`
    /// on any subsequent call.
    pub fn initialize(
        env: Env,
        admin: Address,
        token: Address,
        fee_source: Address,
        lock_tiers: Vec<LockTier>,
    ) -> Result<(), StakingError> {
        if env
            .storage()
            .instance()
            .has(&DataKey::Config)
        {
            return Err(StakingError::AlreadyInitialized);
        }

        admin.require_auth();

        let config = Config {
            admin,
            token,
            fee_source,
        };
        env.storage().instance().set(&DataKey::Config, &config);
        env.storage()
            .instance()
            .set(&DataKey::LockTiers, &lock_tiers);
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

        position.amount = position
            .amount
            .checked_add(amount)
            .ok_or(StakingError::Overflow)?;
        position.shares = position
            .shares
            .checked_add(new_shares)
            .ok_or(StakingError::Overflow)?;
        position.unlock_at = lock::unlock_at(&env, lock_duration);

        pool_state.total_shares = pool_state
            .total_shares
            .checked_add(new_shares)
            .ok_or(StakingError::Overflow)?;

        pool::settle_debt(&pool_state, &mut position);

        set_position(&env, &staker, &position);
        set_pool_state(&env, &pool_state);

        Ok(())
    }

    /// Withdraw `amount` of staked tokens once the lock has elapsed.
    /// Pending rewards are auto-claimed as part of unstaking.
    pub fn unstake(env: Env, staker: Address, amount: i128) -> Result<(), StakingError> {
        staker.require_auth();
        require_not_paused(&env)?;

        if amount <= 0 {
            return Err(StakingError::InvalidAmount);
        }

        let config = get_config(&env)?;
        let mut pool_state = get_pool_state(&env)?;
        let mut position =
            get_position_raw(&env, &staker).ok_or(StakingError::PositionNotFound)?;

        if amount > position.amount {
            return Err(StakingError::InsufficientStake);
        }

        if env.ledger().timestamp() < position.unlock_at {
            return Err(StakingError::LockNotElapsed);
        }

        let owed = pool::pending(&pool_state, &position)?;

        // Shares are proportional to the raw amount being withdrawn.
        let shares_to_burn = if amount == position.amount {
            position.shares
        } else {
            position
                .shares
                .checked_mul(amount)
                .ok_or(StakingError::Overflow)?
                .checked_div(position.amount)
                .ok_or(StakingError::Overflow)?
        };

        position.amount = position
            .amount
            .checked_sub(amount)
            .ok_or(StakingError::Overflow)?;
        position.shares = position
            .shares
            .checked_sub(shares_to_burn)
            .ok_or(StakingError::Overflow)?;

        pool_state.total_shares = pool_state
            .total_shares
            .checked_sub(shares_to_burn)
            .ok_or(StakingError::Overflow)?;

        pool::settle_debt(&pool_state, &mut position);

        set_position(&env, &staker, &position);
        set_pool_state(&env, &pool_state);

        let token_client = TokenClient::new(&env, &config.token);
        let total_out = amount
            .checked_add(owed)
            .ok_or(StakingError::Overflow)?;
        if total_out > 0 {
            token_client.transfer(&env.current_contract_address(), &staker, &total_out);
        }

        Ok(())
    }

    // ── Rewards ─────────────────────────────────────────────────────────────────

    /// Claim accrued reward-share of protocol fees without unstaking.
    pub fn claim_rewards(env: Env, staker: Address) -> Result<i128, StakingError> {
        staker.require_auth();
        require_not_paused(&env)?;

        let config = get_config(&env)?;
        let pool_state = get_pool_state(&env)?;
        let mut position =
            get_position_raw(&env, &staker).ok_or(StakingError::PositionNotFound)?;

        let owed = pool::pending(&pool_state, &position)?;
        if owed <= 0 {
            return Err(StakingError::NothingToClaim);
        }

        pool::settle_debt(&pool_state, &mut position);
        set_position(&env, &staker, &position);

        let token_client = TokenClient::new(&env, &config.token);
        token_client.transfer(&env.current_contract_address(), &staker, &owed);

        Ok(owed)
    }

    /// Push protocol fees into the reward pool. Callable only by `fee_source`.
    pub fn deposit_fees(env: Env, from: Address, amount: i128) -> Result<(), StakingError> {
        require_not_paused(&env)?;
        fees::deposit_fees(&env, from, amount)
    }

    // ── Views ───────────────────────────────────────────────────────────────────

    /// Return a staker's current position, if any.
    pub fn get_position(env: Env, staker: Address) -> Option<Position> {
        get_position_raw(&env, &staker)
    }

    /// Return the rewards currently claimable by a staker.
    pub fn pending_rewards(env: Env, staker: Address) -> Result<i128, StakingError> {
        let pool_state = get_pool_state(&env)?;
        let position = get_position_raw(&env, &staker).ok_or(StakingError::PositionNotFound)?;
        pool::pending(&pool_state, &position)
    }

    /// Return global pool accounting.
    pub fn get_pool(env: Env) -> Result<PoolState, StakingError> {
        get_pool_state(&env)
    }

    // ── Admin ───────────────────────────────────────────────────────────────────

    /// Pause / unpause sensitive operations. Admin-only.
    pub fn set_paused(env: Env, paused: bool) -> Result<(), StakingError> {
        let config = get_config(&env)?;
        config.admin.require_auth();
        env.storage().instance().set(&DataKey::Paused, &paused);
        Ok(())
    }
}
