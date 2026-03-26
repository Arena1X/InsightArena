use soroban_sdk::{token, Address, Env};

use crate::config;
use crate::errors::InsightArenaError;

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
    if amount <= 0 {
        return Err(InsightArenaError::InvalidInput);
    }

    from.require_auth();

    let cfg = config::get_config(env)?;
    token::Client::new(env, &cfg.xlm_token).transfer(
        from,
        &env.current_contract_address(),
        &amount,
    );
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
    if amount <= 0 {
        return Err(InsightArenaError::InvalidInput);
    }

    let cfg = config::get_config(env)?;
    let client = token::Client::new(env, &cfg.xlm_token);
    let contract = env.current_contract_address();

    // Refund transfers are only emitted by the cancellation path. Keeping the
    // escrow balance check here makes the cancel_market loop fail fast if the
    // contract is missing any participant principal.
    if client.balance(&contract) < amount {
        return Err(InsightArenaError::EscrowEmpty);
    }

    // The transfer path intentionally mirrors release_payout, but remains a
    // distinct function so refund activity is auditable independent of winner
    // payout logic.
    client.transfer(&contract, to, &amount);
    Ok(())
}

/// Release a winner payout from contract escrow to `predictor`.
///
/// This is semantically distinct from `refund` (used for market cancellation),
/// but uses the same escrow transfer path from contract balance to recipient.
pub fn release_payout(env: &Env, to: &Address, amount: i128) -> Result<(), InsightArenaError> {
    if amount <= 0 {
        return Err(InsightArenaError::InvalidInput);
    }

    let cfg = config::get_config(env)?;
    let client = token::Client::new(env, &cfg.xlm_token);
    let contract = env.current_contract_address();

    if client.balance(&contract) < amount {
        return Err(InsightArenaError::EscrowEmpty);
    }

    client.transfer(&contract, to, &amount);
    Ok(())
}

/// Return the contract's live escrow balance in stroops.
///
/// This getter intentionally queries the configured XLM token contract rather
/// than relying on mirrored storage counters. The token balance held by the
/// contract address is the authoritative solvency source for both auditing and
/// later invariant checks.
pub fn get_contract_balance(env: &Env) -> i128 {
    let cfg = config::get_config(env).expect("contract must be initialized");
    token::Client::new(env, &cfg.xlm_token).balance(&env.current_contract_address())
}

/// Transfer accumulated fee to a designated treasury or creator address.
///
/// This moves funds out of the shared prediction pool.
///
/// # Errors
/// - `InvalidInput` when `amount <= 0`.
/// - `EscrowEmpty` if the contract lacks sufficient balance.
pub fn transfer_fee(env: &Env, to: &Address, amount: i128) -> Result<(), InsightArenaError> {
    if amount <= 0 {
        return Err(InsightArenaError::InvalidInput);
    }

    let cfg = config::get_config(env)?;
    let client = token::Client::new(env, &cfg.xlm_token);
    let contract = env.current_contract_address();

    if client.balance(&contract) < amount {
        return Err(InsightArenaError::EscrowEmpty);
    }

    client.transfer(&contract, to, &amount);
    Ok(())
}

pub fn get_treasury_balance(env: &Env) -> i128 {
    let cfg = config::get_config(env).expect("Config missing");
    let client = token::Client::new(env, &cfg.xlm_token);
    let contract = env.current_contract_address();
    client.balance(&contract)
}

#[cfg(test)]
mod escrow_tests {
    use soroban_sdk::testutils::Address as _;
    use soroban_sdk::token::{Client as TokenClient, StellarAssetClient};
    use soroban_sdk::{Address, Env};

    use crate::{InsightArenaContract, InsightArenaContractClient, InsightArenaError};

    use super::{get_contract_balance, lock_stake, refund, release_payout};

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
}
