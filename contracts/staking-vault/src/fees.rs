//! Fee intake: the `fee_source` contract (e.g. open-market) transfers protocol
//! fees into the vault, which are then distributed to stakers via [`crate::pool`].

use soroban_sdk::{token::Client as TokenClient, Address, Env};

use crate::errors::StakingError;
use crate::pool;
use crate::storage_types::{Config, DataKey, PoolState};

/// Pull `amount` of the staking token from `from` into the vault and fold it
/// into the reward pool. Caller must be the configured `fee_source`.
pub fn deposit_fees(env: &Env, from: Address, amount: i128) -> Result<(), StakingError> {
    from.require_auth();

    if amount <= 0 {
        return Err(StakingError::InvalidAmount);
    }

    let config = env
        .storage()
        .instance()
        .get::<DataKey, Config>(&DataKey::Config)
        .ok_or(StakingError::NotInitialized)?;

    if from != config.fee_source {
        return Err(StakingError::Unauthorized);
    }

    let mut pool_state = env
        .storage()
        .instance()
        .get::<DataKey, PoolState>(&DataKey::Pool)
        .ok_or(StakingError::NotInitialized)?;

    let token_client = TokenClient::new(env, &config.token);
    token_client.transfer(&from, &env.current_contract_address(), &amount);

    pool::distribute(env, &mut pool_state, amount)?;

    env.storage().instance().set(&DataKey::Pool, &pool_state);

    Ok(())
}

/// Route early-exit penalty into the reward pool using checked arithmetic.
///
/// The accounting is delegated to [`pool::distribute`], so a penalty follows
/// exactly the same rule as any other reward inflow:
///
/// - `total_shares > 0` — folded into `acc_reward_per_share` and shared by the
///   remaining positions in proportion to their shares.
/// - `total_shares == 0` — parked in `pending_rewards`, no divide-by-zero.
///   This is the state `withdraw` leaves behind when the last staker exits
///   early, because it burns the shares before routing the penalty. The parked
///   amount becomes claimable once a new staker joins the pool and a later
///   distribution folds it in.
pub fn route_penalty_to_pool(env: &Env, penalty_amount: i128) -> Result<(), StakingError> {
    if penalty_amount <= 0 {
        return Ok(());
    }

    let mut pool_state = env
        .storage()
        .instance()
        .get::<DataKey, PoolState>(&DataKey::Pool)
        .ok_or(StakingError::NotInitialized)?;

    pool::distribute(env, &mut pool_state, penalty_amount)?;

    env.storage().instance().set(&DataKey::Pool, &pool_state);

    Ok(())
}
