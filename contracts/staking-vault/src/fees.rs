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
