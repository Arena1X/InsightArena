//! Fee intake: the `fee_source` contract (e.g. open-market) transfers protocol
//! fees into the vault, which are then distributed to stakers via [`crate::pool`].
//!
//! Skeleton — fill in the token transfer-in and pool distribution.

use soroban_sdk::{Address, Env};

use crate::errors::StakingError;

/// Pull `amount` of the staking token from `from` into the vault and fold it
/// into the reward pool. Caller must be the configured `fee_source`.
pub fn deposit_fees(
    _env: &Env,
    _from: Address,
    _amount: i128,
) -> Result<(), StakingError> {
    // TODO:
    //   1. require_auth(from) and assert from == config.fee_source
    //   2. token.transfer(from, contract, amount)
    //   3. pool::distribute(env, &mut pool, amount)
    todo!()
}
