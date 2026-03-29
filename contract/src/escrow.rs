use soroban_sdk::{token, Address, Env, Vec};

use crate::config::{self, PERSISTENT_BUMP, PERSISTENT_THRESHOLD};
use crate::errors::InsightArenaError;
use crate::security;
use crate::storage_types::{DataKey, Market, Prediction};

fn bump_treasury(env: &Env) {
    env.storage().persistent().extend_ttl(
        &DataKey::Treasury,
        PERSISTENT_THRESHOLD,
        PERSISTENT_BUMP,
    );
}

/// Transfer `amount` stroops from `predictor` into the contract's escrow.
///
/// The contract address becomes the custodian of the staked XLM; funds are held
/// until the market is resolved (payout) or cancelled (refund).
///
/// # Errors
/// - `InvalidInput` when `amount <= 0`.
/// - Propagates any error returned by [`config::get_config`].
///
/// Token transfer panics are handled by the Soroban runtime and surface as
/// contract failures.
pub fn lock_stake(env: &Env, from: &Address, amount: i128) -> Result<(), InsightArenaError> {
    security::acquire_escrow_lock(env)?;

    if amount <= 0 {
        security::release_escrow_lock(env);
        return Err(InsightArenaError::InvalidInput);
    }

    from.require_auth();

    let cfg = config::get_config(env)?;
    token::Client::new(env, &cfg.xlm_token).transfer(
        from,
        &env.current_contract_address(),
        &amount,
    );

    security::release_escrow_lock(env);
    Ok(())
}

/// Transfer `amount` stroops from contract escrow back to `to` as a refund.
///
/// This entry point is intentionally separate from [`release_payout`] even
/// though both operations move escrowed XLM from the contract to a user.
/// Auditors can grep for `refund` and immediately isolate the cancellation
/// workflow used by `cancel_market`, without mixing that logic with winner
/// payout distribution.
///
/// # Errors
/// - `InvalidInput` when `amount <= 0`.
/// - `EscrowEmpty` when the contract balance cannot cover the refund.
/// - Propagates any error returned by [`config::get_config`].
pub fn refund(env: &Env, to: &Address, amount: i128) -> Result<(), InsightArenaError> {
    security::acquire_escrow_lock(env)?;

    if amount <= 0 {
        security::release_escrow_lock(env);
        return Err(InsightArenaError::InvalidInput);
    }

    let cfg = config::get_config(env)?;
    let client = token::Client::new(env, &cfg.xlm_token);
    let contract = env.current_contract_address();

    if client.balance(&contract) < amount {
        security::release_escrow_lock(env);
        return Err(InsightArenaError::EscrowEmpty);
    }

    client.transfer(&contract, to, &amount);

    security::release_escrow_lock(env);
    Ok(())
}

/// Release a winner payout from contract escrow to `predictor`.
///
/// This is semantically distinct from `refund` (used for market cancellation),
/// but uses the same escrow transfer path from contract balance to recipient.
pub fn release_payout(env: &Env, to: &Address, amount: i128) -> Result<(), InsightArenaError> {
    security::acquire_escrow_lock(env)?;

    if amount <= 0 {
        security::release_escrow_lock(env);
        return Err(InsightArenaError::InvalidInput);
    }

    let cfg = config::get_config(env)?;
    let client = token::Client::new(env, &cfg.xlm_token);
    let contract = env.current_contract_address();

    if client.balance(&contract) < amount {
        security::release_escrow_lock(env);
        return Err(InsightArenaError::EscrowEmpty);
    }

    client.transfer(&contract, to, &amount);

    security::release_escrow_lock(env);
    Ok(())
}

/// Return the contract's live escrow balance in stroops.
///
/// This getter intentionally queries the configured XLM token contract rather
/// than relying on mirrored storage counters. The token balance held by the
/// contract address is the authoritative solvency source for both auditing and
/// later invariant checks.
pub fn get_contract_balance(env: &Env) -> i128 {
    let cfg = config::get_config_readonly(env).expect("contract must be initialized");
    token::Client::new(env, &cfg.xlm_token).balance(&env.current_contract_address())
}

/// Assert that live escrow holdings remain above the total of all unclaimed
/// prediction stakes across the contract.
///
/// This audit helper deliberately scans contract storage and compares that
/// aggregate against the token contract's live balance rather than trusting a
/// mirrored counter. It is used both as an externally callable admin audit aid
/// and as an automatic post-condition after batch payout distribution.
pub fn assert_escrow_solvent(env: &Env) -> Result<(), InsightArenaError> {
    let market_count: u64 = env
        .storage()
        .persistent()
        .get(&DataKey::MarketCount)
        .unwrap_or(0);

    let mut total_unclaimed_stakes: i128 = 0;
    let mut market_id = 1_u64;

    while market_id <= market_count {
        let Some(market) = env
            .storage()
            .persistent()
            .get::<DataKey, Market>(&DataKey::Market(market_id))
        else {
            market_id += 1;
            continue;
        };

        if market.is_resolved || market.is_cancelled {
            market_id += 1;
            continue;
        }

        let predictors: Vec<Address> = env
            .storage()
            .persistent()
            .get(&DataKey::PredictorList(market_id))
            .unwrap_or_else(|| Vec::new(env));

        for predictor in predictors.iter() {
            let prediction_key = DataKey::Prediction(market_id, predictor.clone());
            if let Some(prediction) = env
                .storage()
                .persistent()
                .get::<DataKey, Prediction>(&prediction_key)
            {
                if prediction.payout_claimed {
                    continue;
                }

                total_unclaimed_stakes = total_unclaimed_stakes
                    .checked_add(prediction.stake_amount)
                    .ok_or(InsightArenaError::Overflow)?;
            }
        }

        market_id += 1;
    }

    if get_contract_balance(env) < total_unclaimed_stakes {
        return Err(InsightArenaError::EscrowEmpty);
    }

    Ok(())
}

pub(crate) fn add_to_treasury_balance(env: &Env, amount: i128) {
    if amount <= 0 {
        return;
    }

    let current_balance: i128 = env
        .storage()
        .persistent()
        .get(&DataKey::Treasury)
        .unwrap_or(0);

    let next_balance = current_balance
        .checked_add(amount)
        .expect("treasury balance overflow");

    env.storage()
        .persistent()
        .set(&DataKey::Treasury, &next_balance);
    bump_treasury(env);
}

/// Transfer accumulated fee to a designated treasury or creator address.
///
/// This moves funds out of the shared prediction pool.
///
/// # Errors
/// - `InvalidInput` when `amount <= 0`.
/// - `Unauthorized` when caller is not the configured admin.
/// - `EscrowEmpty` if the contract lacks sufficient balance.
pub fn transfer_fee(
    env: &Env,
    admin: &Address,
    to: &Address,
    amount: i128,
) -> Result<(), InsightArenaError> {
    if amount <= 0 {
        return Err(InsightArenaError::InvalidInput);
    }

    let cfg = config::get_config(env)?;
    admin.require_auth();
    if admin != &cfg.admin {
        return Err(InsightArenaError::Unauthorized);
    }

    let treasury_balance = get_treasury_balance(env);
    if treasury_balance < amount {
        return Err(InsightArenaError::EscrowEmpty);
    }

    let client = token::Client::new(env, &cfg.xlm_token);
    let contract = env.current_contract_address();

    if client.balance(&contract) < amount {
        return Err(InsightArenaError::EscrowEmpty);
    }

    client.transfer(&contract, to, &amount);

    let next_treasury_balance = treasury_balance
        .checked_sub(amount)
        .ok_or(InsightArenaError::Overflow)?;
    env.storage()
        .persistent()
        .set(&DataKey::Treasury, &next_treasury_balance);
    bump_treasury(env);

    Ok(())
}

/// Withdraw accumulated treasury fees to the admin address.
///
/// Only the contract admin may call this. The amount must not exceed the
/// tracked treasury balance.
///
/// # Errors
/// - `InvalidInput` when `amount <= 0`.
/// - `Unauthorized` when caller is not the admin.
/// - `InsufficientFunds` when `amount` exceeds the tracked treasury balance.
/// - `EscrowEmpty` if the contract token balance cannot cover the withdrawal.
pub fn withdraw_treasury(env: Env, caller: Address, amount: i128) -> Result<(), InsightArenaError> {
    if amount <= 0 {
        return Err(InsightArenaError::InvalidInput);
    }

    caller.require_auth();

    let cfg = config::get_config(&env)?;
    if caller != cfg.admin {
        return Err(InsightArenaError::Unauthorized);
    }

    let treasury_balance: i128 = env
        .storage()
        .persistent()
        .get(&DataKey::Treasury)
        .unwrap_or(0);

    if amount > treasury_balance {
        return Err(InsightArenaError::InsufficientFunds);
    }

    let client = token::Client::new(&env, &cfg.xlm_token);
    let contract = env.current_contract_address();

    if client.balance(&contract) < amount {
        return Err(InsightArenaError::EscrowEmpty);
    }

    client.transfer(&contract, &caller, &amount);

    let new_balance = treasury_balance - amount;
    env.storage()
        .persistent()
        .set(&DataKey::Treasury, &new_balance);
    bump_treasury(&env);

    Ok(())
}

pub fn get_treasury_balance(env: &Env) -> i128 {
    env.storage()
        .persistent()
        .get(&DataKey::Treasury)
        .unwrap_or(0)
}
