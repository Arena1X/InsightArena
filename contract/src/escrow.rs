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

pub fn get_treasury_balance(env: &Env) -> i128 {
    env.storage()
        .persistent()
        .get(&DataKey::Treasury)
        .unwrap_or(0)
}

#[cfg(test)]
mod escrow_tests {
    use soroban_sdk::testutils::Address as _;
    use soroban_sdk::token::{Client as TokenClient, StellarAssetClient};
    use soroban_sdk::{Address, Env, Vec};

    use crate::storage_types::{DataKey, Prediction};
    use crate::{InsightArenaContract, InsightArenaContractClient, InsightArenaError};

    use super::{
        assert_escrow_solvent, get_contract_balance, get_treasury_balance, lock_stake, refund,
        release_payout,
    };

    fn register_token(env: &Env) -> Address {
        let token_admin = Address::generate(env);
        env.register_stellar_asset_contract_v2(token_admin)
            .address()
    }

    fn deploy<'a>(env: &'a Env, xlm_token: &Address) -> InsightArenaContractClient<'a> {
        let id = env.register(InsightArenaContract, ());
        let client = InsightArenaContractClient::new(env, &id);
        let admin = Address::generate(env);
        let oracle = Address::generate(env);
        client.initialize(&admin, &oracle, &200_u32, xlm_token);
        client
    }

    fn fund(env: &Env, xlm_token: &Address, recipient: &Address, amount: i128) {
        StellarAssetClient::new(env, xlm_token).mint(recipient, &amount);
    }

    fn seed_unresolved_market(env: &Env, client: &InsightArenaContractClient<'_>, market_id: u64) {
        use crate::storage_types::Market;
        use soroban_sdk::{symbol_short, vec, String, Symbol};

        let market = Market::new(
            market_id,
            Address::generate(env),
            String::from_str(env, "seeded market"),
            String::from_str(env, "seeded for escrow tests"),
            Symbol::new(env, "Sports"),
            vec![env, symbol_short!("yes"), symbol_short!("no")],
            env.ledger().timestamp(),
            env.ledger().timestamp() + 100,
            env.ledger().timestamp() + 200,
            true,
            100,
            10_000_000,
            100_000_000,
            86_400,
        );

        env.as_contract(&client.address, || {
            env.storage()
                .persistent()
                .set(&DataKey::Market(market_id), &market);
        });
    }

    #[test]
    fn test_lock_stake_happy_path() {
        let env = Env::default();
        env.mock_all_auths();
        let xlm_token = register_token(&env);
        let client = deploy(&env, &xlm_token);
        let predictor = Address::generate(&env);
        let amount = 20_000_000_i128;

        fund(&env, &xlm_token, &predictor, amount);

        let token = TokenClient::new(&env, &xlm_token);
        assert_eq!(token.balance(&predictor), amount);
        assert_eq!(token.balance(&client.address), 0);

        let result = env.as_contract(&client.address, || lock_stake(&env, &predictor, amount));
        assert_eq!(result, Ok(()));

        assert_eq!(token.balance(&predictor), 0);
        assert_eq!(token.balance(&client.address), amount);
    }

    #[test]
    fn test_lock_stake_zero_amount() {
        let env = Env::default();
        env.mock_all_auths();
        let xlm_token = register_token(&env);
        let client = deploy(&env, &xlm_token);
        let predictor = Address::generate(&env);

        let result = env.as_contract(&client.address, || lock_stake(&env, &predictor, 0));
        assert_eq!(result, Err(InsightArenaError::InvalidInput));
    }

    #[test]
    #[should_panic]
    fn test_lock_stake_unauthorized() {
        let env = Env::default();
        let xlm_token = register_token(&env);
        let client = deploy(&env, &xlm_token);
        let predictor = Address::generate(&env);
        let amount = 10_000_000_i128;

        fund(&env, &xlm_token, &predictor, amount);

        env.as_contract(&client.address, || {
            let _ = lock_stake(&env, &predictor, amount);
        });
    }

    #[test]
    #[should_panic]
    fn test_lock_stake_insufficient_user_funds() {
        let env = Env::default();
        env.mock_all_auths();
        let xlm_token = register_token(&env);
        let client = deploy(&env, &xlm_token);
        let predictor = Address::generate(&env);

        env.as_contract(&client.address, || {
            let _ = lock_stake(&env, &predictor, 10_000_000_i128);
        });
    }

    #[test]
    fn test_release_payout_success() {
        let env = Env::default();
        env.mock_all_auths();
        let xlm_token = register_token(&env);
        let client = deploy(&env, &xlm_token);
        let recipient = Address::generate(&env);
        let payout = 20_000_000_i128;

        fund(&env, &xlm_token, &client.address, payout);

        let token = TokenClient::new(&env, &xlm_token);
        assert_eq!(token.balance(&client.address), payout);
        assert_eq!(token.balance(&recipient), 0);

        let result = env.as_contract(&client.address, || release_payout(&env, &recipient, payout));
        assert_eq!(result, Ok(()));

        assert_eq!(token.balance(&client.address), 0);
        assert_eq!(token.balance(&recipient), payout);
    }

    #[test]
    fn test_release_payout_contract_insolvent() {
        let env = Env::default();
        env.mock_all_auths();
        let xlm_token = register_token(&env);
        let client = deploy(&env, &xlm_token);
        let recipient = Address::generate(&env);

        let result = env.as_contract(&client.address, || {
            release_payout(&env, &recipient, 10_000_000_i128)
        });
        assert_eq!(result, Err(InsightArenaError::EscrowEmpty));
    }

    #[test]
    fn test_release_payout_zero_value() {
        let env = Env::default();
        env.mock_all_auths();
        let xlm_token = register_token(&env);
        let client = deploy(&env, &xlm_token);
        let recipient = Address::generate(&env);

        let result = env.as_contract(&client.address, || release_payout(&env, &recipient, 0));
        assert_eq!(result, Err(InsightArenaError::InvalidInput));
    }

    #[test]
    fn test_refund_returns_exact_stake_amount() {
        let env = Env::default();
        env.mock_all_auths();
        let xlm_token = register_token(&env);
        let client = deploy(&env, &xlm_token);
        let recipient = Address::generate(&env);
        let amount = 20_000_000_i128;

        fund(&env, &xlm_token, &client.address, amount);

        let token = TokenClient::new(&env, &xlm_token);
        assert_eq!(token.balance(&client.address), amount);
        assert_eq!(token.balance(&recipient), 0);

        let result = env.as_contract(&client.address, || refund(&env, &recipient, amount));
        assert_eq!(result, Ok(()));

        assert_eq!(token.balance(&client.address), 0);
        assert_eq!(token.balance(&recipient), amount);
    }

    #[test]
    fn test_refund_contract_insolvent() {
        let env = Env::default();
        env.mock_all_auths();
        let xlm_token = register_token(&env);
        let client = deploy(&env, &xlm_token);
        let recipient = Address::generate(&env);

        let result = env.as_contract(&client.address, || refund(&env, &recipient, 10_000_000));
        assert_eq!(result, Err(InsightArenaError::EscrowEmpty));
    }

    #[test]
    fn test_refund_zero_value() {
        let env = Env::default();
        env.mock_all_auths();
        let xlm_token = register_token(&env);
        let client = deploy(&env, &xlm_token);
        let recipient = Address::generate(&env);

        let result = env.as_contract(&client.address, || refund(&env, &recipient, 0));
        assert_eq!(result, Err(InsightArenaError::InvalidInput));
    }

    #[test]
    fn test_get_balance_empty_contract() {
        let env = Env::default();
        env.mock_all_auths();
        let xlm_token = register_token(&env);
        let client = deploy(&env, &xlm_token);

        let balance = env.as_contract(&client.address, || get_contract_balance(&env));
        assert_eq!(balance, 0);
    }

    #[test]
    fn test_get_balance_after_locks() {
        let env = Env::default();
        env.mock_all_auths();
        let xlm_token = register_token(&env);
        let client = deploy(&env, &xlm_token);
        let predictor_a = Address::generate(&env);
        let predictor_b = Address::generate(&env);
        let stake_a = 20_000_000_i128;
        let stake_b = 35_000_000_i128;

        fund(&env, &xlm_token, &predictor_a, stake_a);
        fund(&env, &xlm_token, &predictor_b, stake_b);

        env.as_contract(&client.address, || {
            lock_stake(&env, &predictor_a, stake_a).unwrap();
            lock_stake(&env, &predictor_b, stake_b).unwrap();
        });

        let balance = env.as_contract(&client.address, || get_contract_balance(&env));
        assert_eq!(balance, stake_a + stake_b);
    }

    #[test]
    fn test_get_balance_does_not_touch_treasury_storage() {
        let env = Env::default();
        env.mock_all_auths();
        let xlm_token = register_token(&env);
        let client = deploy(&env, &xlm_token);
        let seeded_treasury = 77_000_000_i128;

        env.as_contract(&client.address, || {
            env.storage()
                .persistent()
                .set(&DataKey::Treasury, &seeded_treasury);
        });

        let _ = env.as_contract(&client.address, || get_contract_balance(&env));

        let treasury_after: i128 = env.as_contract(&client.address, || {
            env.storage()
                .persistent()
                .get(&DataKey::Treasury)
                .unwrap_or(0)
        });
        assert_eq!(treasury_after, seeded_treasury);
    }

    #[test]
    fn test_get_treasury_balance_defaults_to_zero() {
        let env = Env::default();
        env.mock_all_auths();
        let xlm_token = register_token(&env);
        let client = deploy(&env, &xlm_token);

        let treasury = env.as_contract(&client.address, || get_treasury_balance(&env));
        assert_eq!(treasury, 0);
    }

    #[test]
    fn test_get_treasury_balance_reads_storage_not_contract_token_balance() {
        let env = Env::default();
        env.mock_all_auths();
        let xlm_token = register_token(&env);
        let client = deploy(&env, &xlm_token);
        let stored_treasury = 12_345_678_i128;

        env.as_contract(&client.address, || {
            env.storage()
                .persistent()
                .set(&DataKey::Treasury, &stored_treasury);
        });

        // Seed contract token balance with a different value to verify this
        // getter is sourced from Treasury storage only.
        fund(&env, &xlm_token, &client.address, 99_999_999);

        let treasury = env.as_contract(&client.address, || get_treasury_balance(&env));
        assert_eq!(treasury, stored_treasury);
    }

    #[test]
    fn test_assert_escrow_solvent_when_balance_covers_unclaimed_stakes() {
        let env = Env::default();
        env.mock_all_auths();
        let xlm_token = register_token(&env);
        let client = deploy(&env, &xlm_token);
        let predictor_a = Address::generate(&env);
        let predictor_b = Address::generate(&env);

        seed_unresolved_market(&env, &client, 1);
        seed_unresolved_market(&env, &client, 2);

        env.as_contract(&client.address, || {
            let mut predictors_one = Vec::new(&env);
            predictors_one.push_back(predictor_a.clone());
            env.storage()
                .persistent()
                .set(&DataKey::PredictorList(1), &predictors_one);

            let mut predictors_two = Vec::new(&env);
            predictors_two.push_back(predictor_b.clone());
            env.storage()
                .persistent()
                .set(&DataKey::PredictorList(2), &predictors_two);

            env.storage()
                .persistent()
                .set(&DataKey::MarketCount, &2_u64);
            env.storage().persistent().set(
                &DataKey::Prediction(1, predictor_a.clone()),
                &Prediction::new(
                    1,
                    predictor_a.clone(),
                    soroban_sdk::symbol_short!("yes"),
                    20_000_000,
                    env.ledger().timestamp(),
                ),
            );
            env.storage().persistent().set(
                &DataKey::Prediction(2, predictor_b.clone()),
                &Prediction::new(
                    2,
                    predictor_b.clone(),
                    soroban_sdk::symbol_short!("no"),
                    30_000_000,
                    env.ledger().timestamp(),
                ),
            );
        });

        fund(&env, &xlm_token, &client.address, 50_000_000);

        let result = env.as_contract(&client.address, || assert_escrow_solvent(&env));
        assert_eq!(result, Ok(()));
    }

    #[test]
    fn test_assert_escrow_solvent_when_balance_is_short() {
        let env = Env::default();
        env.mock_all_auths();
        let xlm_token = register_token(&env);
        let client = deploy(&env, &xlm_token);
        let predictor = Address::generate(&env);

        seed_unresolved_market(&env, &client, 1);

        env.as_contract(&client.address, || {
            let mut predictors = Vec::new(&env);
            predictors.push_back(predictor.clone());
            env.storage()
                .persistent()
                .set(&DataKey::PredictorList(1), &predictors);
            env.storage()
                .persistent()
                .set(&DataKey::MarketCount, &1_u64);
            env.storage().persistent().set(
                &DataKey::Prediction(1, predictor.clone()),
                &Prediction::new(
                    1,
                    predictor.clone(),
                    soroban_sdk::symbol_short!("yes"),
                    20_000_000,
                    env.ledger().timestamp(),
                ),
            );
        });

        fund(&env, &xlm_token, &client.address, 19_999_999);

        let result = env.as_contract(&client.address, || assert_escrow_solvent(&env));
        assert_eq!(result, Err(InsightArenaError::EscrowEmpty));
    }
}
