#![no_std]
#![allow(non_snake_case)]

pub mod config;
pub mod errors;
pub mod fees;
pub mod lock;
pub mod pool;
pub mod storage_types;

pub use crate::errors::StakingError;
pub use crate::storage_types::{
    Config, DataKey, LockTier, PoolState, Position, UnbondingConfig, UnstakeRequest,
};

use soroban_sdk::{
    contract, contractimpl, token::Client as TokenClient, Address, Env, Symbol, Vec,
};

use crate::config::require_not_paused;

use crate::storage_types::{bump_position, LEDGER_BUMP_PERMANENT};

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

/// Load a staker's position and bump its storage TTL so the entry never
/// expires while the lock is active (issue #2039).
fn get_position_raw(env: &Env, staker: &Address) -> Option<Position> {
    let key = DataKey::Position(staker.clone());
    let position = env.storage().persistent().get::<DataKey, Position>(&key);
    if position.is_some() {
        // Use the split threshold/amount helper so every read adds real
        // headroom regardless of how recently the entry was last written.
        bump_position(env, staker);
    }
    position
}

/// Persist a staker's position and bump its TTL immediately (issue #2039).
fn set_position(env: &Env, staker: &Address, position: &Position) {
    let key = DataKey::Position(staker.clone());
    env.storage().persistent().set(&key, position);
    bump_position(env, staker);
}

fn get_unstake_request(env: &Env, staker: &Address) -> Option<UnstakeRequest> {
    env.storage()
        .persistent()
        .get::<DataKey, UnstakeRequest>(&DataKey::UnstakeRequest(staker.clone()))
}

fn set_unstake_request(env: &Env, staker: &Address, request: &UnstakeRequest) {
    let key = DataKey::UnstakeRequest(staker.clone());
    env.storage().persistent().set(&key, request);
    env.storage().persistent().extend_ttl(
        &key,
        storage_types::LEDGER_THRESHOLD_POSITION,
        storage_types::LEDGER_BUMP_POSITION,
    );
}

fn get_unbonding_config(env: &Env) -> Result<UnbondingConfig, StakingError> {
    env.storage()
        .instance()
        .get::<DataKey, UnbondingConfig>(&DataKey::UnbondingConfig)
        .ok_or(StakingError::NotInitialized)
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
        if env.storage().instance().has(&DataKey::Config) {
            return Err(StakingError::AlreadyInitialized);
        }

        admin.require_auth();

        // Validate unbonding config
        if unbonding_config.penalty_bps > lock::MAX_PENALTY_BPS {
            return Err(StakingError::InvalidPenaltyConfig);
        }

        // Reject empty or out-of-order tier configurations up front so `stake`
        // can never silently apply the wrong boost.
        lock::validate_tiers(&lock_tiers)?;

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
    /// `NotInitialized` when the vault has not been configured yet.
    pub fn get_unbonding_config(env: Env) -> Result<UnbondingConfig, StakingError> {
        get_unbonding_config(&env)
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

        position.amount = position
            .amount
            .checked_add(amount)
            .ok_or(StakingError::Overflow)?;
        position.shares = position
            .shares
            .checked_add(new_shares)
            .ok_or(StakingError::Overflow)?;
        position.unlock_at = env.ledger().timestamp() + lock_duration;
        position.reward_debt = pool::reward_debt(&pool_state, &position);

        pool_state.total_shares = pool_state
            .total_shares
            .checked_add(new_shares)
            .ok_or(StakingError::Overflow)?;

        set_position(&env, &staker, &position);
        set_pool_state(&env, &pool_state);

        Ok(())
    }

    /// Request to unlock `amount` once the lock period has elapsed.
    /// This starts the unbonding cooldown. It does not transfer tokens.
    pub fn request_unlock(env: Env, staker: Address, amount: i128) -> Result<(), StakingError> {
        staker.require_auth();
        require_not_paused(&env)?;

        if amount <= 0 {
            return Err(StakingError::InvalidAmount);
        }

        let mut position = get_position_raw(&env, &staker).ok_or(StakingError::PositionNotFound)?;

        if amount > position.amount {
            return Err(StakingError::InsufficientStake);
        }

        // Exact unlock time is allowed; anything earlier is rejected.
        lock::enforce_lock_period(env.ledger().timestamp(), position.unlock_at)?;

        position.unlock_requested_at = env.ledger().timestamp();
        position.pending_unlock_amount = amount;

        set_position(&env, &staker, &position);

        Ok(())
    }

    /// Withdraw a previously requested unlock.
    ///
    /// Checks run first, then all position and pool state is written, and only
    /// then does the token transfer. A callback from that transfer cannot
    /// withdraw again: `pending_unlock_amount` is already zero.
    pub fn withdraw(env: Env, staker: Address) -> Result<(), StakingError> {
        staker.require_auth();
        require_not_paused(&env)?;

        let config = get_config(&env)?;
        let unbonding_config = env
            .storage()
            .instance()
            .get::<DataKey, UnbondingConfig>(&DataKey::UnbondingConfig)
            .ok_or(StakingError::NotInitialized)?;

        let mut pool_state = get_pool_state(&env)?;
        let mut position = get_position_raw(&env, &staker).ok_or(StakingError::PositionNotFound)?;

        if position.pending_unlock_amount <= 0 {
            return Err(StakingError::NoPendingUnlock);
        }

        lock::enforce_lock_period(env.ledger().timestamp(), position.unlock_at)?;

        let amount = position.pending_unlock_amount;
        let current_time = env.ledger().timestamp();
        let cooldown_end = position
            .unlock_requested_at
            .checked_add(unbonding_config.cooldown_period)
            .ok_or(StakingError::Overflow)?;

        let penalty = if current_time < cooldown_end {
            lock::calculate_penalty(amount, unbonding_config.penalty_bps)?
        } else {
            0
        };

        let amount_after_penalty = amount.checked_sub(penalty).ok_or(StakingError::Overflow)?;

        let owed = pool::pending(&pool_state, &position)?;

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

        // Effects before the external token transfer.
        position.amount = position
            .amount
            .checked_sub(amount)
            .ok_or(StakingError::Overflow)?;
        position.shares = position
            .shares
            .checked_sub(shares_to_burn)
            .ok_or(StakingError::Overflow)?;
        position.pending_unlock_amount = 0;
        position.unlock_requested_at = 0;

        pool_state.total_shares = pool_state
            .total_shares
            .checked_sub(shares_to_burn)
            .ok_or(StakingError::Overflow)?;

        pool::settle_debt(&pool_state, &mut position)?;

        set_position(&env, &staker, &position);
        set_pool_state(&env, &pool_state);

        if penalty > 0 {
            fees::route_penalty_to_pool(&env, penalty)?;
        }

        let total_out = amount_after_penalty
            .checked_add(owed)
            .ok_or(StakingError::Overflow)?;
        if total_out > 0 {
            let token_client = TokenClient::new(&env, &config.token);
            token_client.transfer(&env.current_contract_address(), &staker, &total_out);
        }

        Ok(())
    }

    /// Withdraw `amount` once the lock has elapsed, without the unbonding cooldown.
    /// State is updated before the token transfer.
    ///
    /// Reverts with `CooldownRequired` while an unstake cooldown is configured
    /// (issue #2198); stakers must then go through `request_unstake` and
    /// `complete_unstake`.
    pub fn unstake(env: Env, staker: Address, amount: i128) -> Result<(), StakingError> {
        staker.require_auth();
        require_not_paused(&env)?;

        if config::unstake_cooldown(&env) > 0 {
            return Err(StakingError::CooldownRequired);
        }

        if amount <= 0 {
            return Err(StakingError::InvalidAmount);
        }

        let config = get_config(&env)?;
        let mut pool_state = get_pool_state(&env)?;
        let mut position = get_position_raw(&env, &staker).ok_or(StakingError::PositionNotFound)?;

        if amount > position.amount {
            return Err(StakingError::InsufficientStake);
        }

        lock::enforce_lock_period(env.ledger().timestamp(), position.unlock_at)?;

        let owed = pool::pending(&pool_state, &position)?;

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

        pool::settle_debt(&pool_state, &mut position)?;

        set_position(&env, &staker, &position);
        set_pool_state(&env, &pool_state);

        let total_out = amount.checked_add(owed).ok_or(StakingError::Overflow)?;
        if total_out > 0 {
            let token_client = TokenClient::new(&env, &config.token);
            token_client.transfer(&env.current_contract_address(), &staker, &total_out);
        }

        Ok(())
    }

    // ── Cooldown unstaking (issue #2198) ────────────────────────────────────────

    /// Request to unstake `amount` once the lock has elapsed, starting the
    /// configured unstake cooldown.
    ///
    /// The amount leaves the position immediately: its shares are burned (so
    /// it stops earning rewards) and rewards accrued so far are paid out. The
    /// principal is held until `complete_unstake` after the cooldown.
    /// Emits `("unstake", "requested")` with `(staker, amount, available_at)`.
    pub fn request_unstake(
        env: Env,
        staker: Address,
        amount: i128,
    ) -> Result<u64, StakingError> {
        staker.require_auth();
        require_not_paused(&env)?;

        if amount <= 0 {
            return Err(StakingError::InvalidAmount);
        }

        if get_unstake_request(&env, &staker).is_some() {
            return Err(StakingError::UnstakeRequestPending);
        }

        let config = get_config(&env)?;
        let mut pool_state = get_pool_state(&env)?;
        let mut position = get_position_raw(&env, &staker).ok_or(StakingError::PositionNotFound)?;

        if amount > position.amount {
            return Err(StakingError::InsufficientStake);
        }

        let now = env.ledger().timestamp();
        lock::enforce_lock_period(now, position.unlock_at)?;

        let available_at = now
            .checked_add(config::unstake_cooldown(&env))
            .ok_or(StakingError::Overflow)?;

        let owed = pool::pending(&pool_state, &position)?;

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

        // Effects before the external token transfer.
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

        pool::settle_debt(&pool_state, &mut position)?;

        set_position(&env, &staker, &position);
        set_pool_state(&env, &pool_state);
        set_unstake_request(
            &env,
            &staker,
            &UnstakeRequest {
                amount,
                requested_at: now,
                available_at,
            },
        );

        if owed > 0 {
            let token_client = TokenClient::new(&env, &config.token);
            token_client.transfer(&env.current_contract_address(), &staker, &owed);
        }

        env.events().publish(
            (Symbol::new(&env, "unstake"), Symbol::new(&env, "requested")),
            (staker, amount, available_at),
        );

        Ok(available_at)
    }

    /// Pay out a pending unstake request once its cooldown has elapsed.
    ///
    /// Reverts with `NoPendingUnlock` when there is no request and with
    /// `WithdrawalLocked` before `available_at`. The request is removed before
    /// the token transfer, so it cannot be completed twice.
    /// Emits `("unstake", "completed")` with `(staker, amount)`.
    pub fn complete_unstake(env: Env, staker: Address) -> Result<i128, StakingError> {
        staker.require_auth();
        require_not_paused(&env)?;

        let config = get_config(&env)?;
        let request = get_unstake_request(&env, &staker).ok_or(StakingError::NoPendingUnlock)?;

        config::enforce_cooldown(env.ledger().timestamp(), request.available_at)?;

        env.storage()
            .persistent()
            .remove(&DataKey::UnstakeRequest(staker.clone()));

        let token_client = TokenClient::new(&env, &config.token);
        token_client.transfer(&env.current_contract_address(), &staker, &request.amount);

        env.events().publish(
            (Symbol::new(&env, "unstake"), Symbol::new(&env, "completed")),
            (staker, request.amount),
        );

        Ok(request.amount)
    }

    /// Return the staker's pending unstake request, if any.
    pub fn get_unstake_request(env: Env, staker: Address) -> Option<UnstakeRequest> {
        get_unstake_request(&env, &staker)
    }

    /// Return the configured unstake cooldown in seconds (0 when unset).
    pub fn get_unstake_cooldown(env: Env) -> u64 {
        config::unstake_cooldown(&env)
    }

    /// Claim accrued rewards without unstaking.
    /// Debt is checkpointed before the token transfer so a second claim pays nothing.
    pub fn claim_rewards(env: Env, staker: Address) -> Result<i128, StakingError> {
        staker.require_auth();
        require_not_paused(&env)?;

        let config = get_config(&env)?;
        let pool_state = get_pool_state(&env)?;
        let mut position = get_position_raw(&env, &staker).ok_or(StakingError::PositionNotFound)?;

        let owed = pool::pending(&pool_state, &position)?;
        if owed <= 0 {
            return Err(StakingError::NothingToClaim);
        }

        pool::settle_debt(&pool_state, &mut position)?;
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

    /// Return the rewards currently claimable by a staker.
    pub fn pending_rewards(env: Env, staker: Address) -> Result<i128, StakingError> {
        let pool_state = get_pool_state(&env)?;
        let position = get_position_raw(&env, &staker).ok_or(StakingError::PositionNotFound)?;
        pool::pending(&pool_state, &position)
    }

    // ── Admin ───────────────────────────────────────────────────────────────────

    /// Pause or unpause staking. Only the configured admin may call this.
    ///
    /// The stored admin address must authorize the call before the paused flag
    /// is mutated, so a non-admin caller is rejected via auth failure and the
    /// flag is left unchanged.
    pub fn set_paused(env: Env, paused: bool) -> Result<(), StakingError> {
        config::set_paused(&env, paused)
    }

    /// Emergency pause (issue #2200). Admin only.
    ///
    /// Blocks every user-facing state change (stake, unstake, unlock requests,
    /// withdrawals, reward claims and fee deposits) until `unpause`. Funds stay
    /// in the vault and are withdrawable again once unpaused.
    /// Emits `("vault", "paused")`.
    pub fn pause(env: Env) -> Result<(), StakingError> {
        config::set_paused(&env, true)
    }

    /// Lift the emergency pause and restore normal operation. Admin only.
    /// Emits `("vault", "unpaused")`.
    pub fn unpause(env: Env) -> Result<(), StakingError> {
        config::set_paused(&env, false)
    }

    /// Return whether the vault is currently paused.
    pub fn is_paused(env: Env) -> bool {
        config::is_paused(&env)
    }

    /// Set the unstake cooldown in seconds (issue #2198). Admin only.
    ///
    /// Rejects values above `config::MAX_UNSTAKE_COOLDOWN` with
    /// `InvalidCooldown`. A non-zero cooldown disables the immediate `unstake`
    /// path. Emits `("config", "cooldown_set")`.
    pub fn set_unstake_cooldown(env: Env, cooldown: u64) -> Result<(), StakingError> {
        config::set_unstake_cooldown(&env, cooldown)
    }
}

// ── Tests (issues #2035 and #2039) ───────────────────────────────────────────

#[cfg(test)]
mod integration_tests {
    extern crate std;

    use soroban_sdk::{
        testutils::{Address as _, Ledger},
        Address, Env, Vec,
    };

    use crate::{
        storage_types::{
            bump_position, Config, DataKey, LockTier, PoolState, Position, UnbondingConfig,
            LEDGER_BUMP_POSITION, LEDGER_THRESHOLD_POSITION,
        },
        StakingError,
        lock,
    };

    // ── Helpers ───────────────────────────────────────────────────────────────

    fn make_position(owner: Address, amount: i128, unlock_at: u64) -> Position {
        Position {
            owner,
            amount,
            shares: amount,
            unlock_at,
            reward_debt: 0,
            unlock_requested_at: 0,
            pending_unlock_amount: 0,
        }
    }

    // ── #2035 penalty tests ───────────────────────────────────────────────────

    /// Test 1 (issue #2035): early unlock applies the correct penalty.
    ///
    /// Stakes are simulated by directly writing a Position; `request_unlock`
    /// logic is exercised through `lock::calculate_penalty` to keep the test
    /// self-contained without a token contract.
    #[test]
    fn early_unlock_applies_correct_penalty() {
        let amount: i128 = 1_000_000_000;
        let penalty_bps: u32 = 500; // 5 %
        let expected_penalty = amount * 500 / 10_000; // 50_000_000

        let penalty = lock::calculate_penalty(amount, penalty_bps).unwrap();
        assert_eq!(penalty, expected_penalty);

        let net = lock::net_after_penalty(amount, penalty).unwrap();
        assert_eq!(net, amount - expected_penalty);
    }

    /// Test 2 (issue #2035): normal unlock (penalty_bps = 0) applies no deduction.
    #[test]
    fn normal_unlock_after_lock_applies_no_penalty() {
        let amount: i128 = 1_000_000_000;
        let penalty = lock::calculate_penalty(amount, 0).unwrap();
        assert_eq!(penalty, 0);

        let net = lock::net_after_penalty(amount, penalty).unwrap();
        assert_eq!(net, amount);
    }

    /// Test 3 (issue #2035): penalty cannot be bypassed via out-of-range bps.
    #[test]
    fn penalty_cannot_be_bypassed() {
        let amount: i128 = 1_000_000_000;

        // Anything above MAX_PENALTY_BPS is rejected before arithmetic.
        assert!(matches!(
            lock::calculate_penalty(amount, 10_001),
            Err(StakingError::InvalidPenaltyConfig)
        ));

        // 100% is allowed; net must be zero.
        let penalty = lock::calculate_penalty(amount, 10_000).unwrap();
        assert_eq!(penalty, amount);
        let net = lock::net_after_penalty(amount, penalty).unwrap();
        assert_eq!(net, 0);
    }

    // ── #2039 TTL tests ───────────────────────────────────────────────────────

    /// Test 4 (issue #2039): an active lock's storage TTL is extended on access.
    #[test]
    fn active_lock_storage_ttl_is_extended_on_access() {
        let env = Env::default();
        let staker = Address::generate(&env);
        let key = DataKey::Position(staker.clone());
        let pos = make_position(staker.clone(), 1_000_000, 9_999_999);

        env.storage().persistent().set(&key, &pos);
        bump_position(&env, &staker);

        assert!(env.storage().persistent().has(&key));
    }

    /// Test 5 (issue #2039): threshold < bump guarantees net TTL extension.
    #[test]
    fn ledger_threshold_is_strictly_less_than_bump() {
        assert!(LEDGER_THRESHOLD_POSITION < LEDGER_BUMP_POSITION);
    }

    /// Test 6 (issue #2039): a fully-withdrawn entry is allowed to expire.
    ///
    /// After `withdraw` removes the key, `bump_position` must not panic and
    /// must not re-create the entry.
    #[test]
    fn fully_withdrawn_entry_is_allowed_to_expire() {
        let env = Env::default();
        let staker = Address::generate(&env);
        let key = DataKey::Position(staker.clone());

        // Key absent — simulates post-withdrawal state.
        assert!(!env.storage().persistent().has(&key));

        // Must be a no-op.
        bump_position(&env, &staker);
        assert!(!env.storage().persistent().has(&key));
    }
}
