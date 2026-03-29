use soroban_sdk::testutils::{Address as _, Ledger};
use soroban_sdk::token::{Client as TokenClient, StellarAssetClient};
use soroban_sdk::{symbol_short, vec, Address, Env, String, Symbol};

use crate::escrow::{lock_stake, release_payout};
use crate::market::CreateMarketParams;
use crate::{InsightArenaContract, InsightArenaContractClient, InsightArenaError};

fn register_token(env: &Env) -> Address {
    let token_admin = Address::generate(env);
    env.register_stellar_asset_contract_v2(token_admin)
        .address()
}

fn deploy(env: &Env) -> (InsightArenaContractClient<'_>, Address, Address, Address) {
    let id = env.register(InsightArenaContract, ());
    let client = InsightArenaContractClient::new(env, &id);
    let admin = Address::generate(env);
    let oracle = Address::generate(env);
    let xlm_token = register_token(env);
    env.mock_all_auths();
    client.initialize(&admin, &oracle, &200_u32, &xlm_token);
    (client, xlm_token, admin, oracle)
}

fn default_params(env: &Env) -> CreateMarketParams {
    let now = env.ledger().timestamp();
    CreateMarketParams {
        title: String::from_str(env, "Will BTC close above 100k?"),
        description: String::from_str(env, "Treasury escrow test market"),
        category: Symbol::new(env, "Crypto"),
        outcomes: vec![env, symbol_short!("yes"), symbol_short!("no")],
        end_time: now + 1000,
        resolution_time: now + 2000,
        creator_fee_bps: 100,
        min_stake: 10_000_000,
        max_stake: 200_000_000,
        is_public: true,
    }
}

fn fund(env: &Env, xlm_token: &Address, recipient: &Address, amount: i128) {
    StellarAssetClient::new(env, xlm_token).mint(recipient, &amount);
}

#[test]
fn test_stake_lock_reduces_user_balance() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, xlm_token, _, _) = deploy(&env);
    let predictor = Address::generate(&env);
    let stake_amount = 37_000_000_i128;

    fund(&env, &xlm_token, &predictor, 50_000_000);

    let token = TokenClient::new(&env, &xlm_token);
    let user_before = token.balance(&predictor);
    let escrow_before = token.balance(&client.address);

    let lock_result = env.as_contract(&client.address, || lock_stake(&env, &predictor, stake_amount));
    assert_eq!(lock_result, Ok(()));

    let user_after = token.balance(&predictor);
    let escrow_after = token.balance(&client.address);

    assert_eq!(user_before - user_after, stake_amount);
    assert_eq!(escrow_after - escrow_before, stake_amount);
    assert_eq!(user_after, 13_000_000);
    assert_eq!(escrow_after, stake_amount);
}

#[test]
fn test_payout_release_increases_user_balance() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, xlm_token, _, _) = deploy(&env);
    let recipient = Address::generate(&env);
    let payout_amount = 15_000_000_i128;

    fund(&env, &xlm_token, &client.address, 40_000_000);

    let token = TokenClient::new(&env, &xlm_token);
    let recipient_before = token.balance(&recipient);
    let escrow_before = token.balance(&client.address);

    let release_result =
        env.as_contract(&client.address, || release_payout(&env, &recipient, payout_amount));
    assert_eq!(release_result, Ok(()));

    let recipient_after = token.balance(&recipient);
    let escrow_after = token.balance(&client.address);

    assert_eq!(recipient_after - recipient_before, payout_amount);
    assert_eq!(escrow_before - escrow_after, payout_amount);
    assert_eq!(recipient_after, payout_amount);
    assert_eq!(escrow_after, 25_000_000);
}

#[test]
fn test_escrow_solvent_after_multiple_predictions() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, xlm_token, _, _) = deploy(&env);

    let predictor_a = Address::generate(&env);
    let predictor_b = Address::generate(&env);
    let market_id = client.create_market(&Address::generate(&env), &default_params(&env));

    fund(&env, &xlm_token, &predictor_a, 30_000_000);
    fund(&env, &xlm_token, &predictor_b, 40_000_000);

    client.submit_prediction(&predictor_a, &market_id, &symbol_short!("yes"), &20_000_000);
    client.assert_escrow_solvent();

    client.submit_prediction(&predictor_b, &market_id, &symbol_short!("no"), &30_000_000);
    client.assert_escrow_solvent();

    // Inject imbalance by draining 1 stroop from escrow while unresolved stakes remain.
    let sink = Address::generate(&env);
    let drain_result = env.as_contract(&client.address, || release_payout(&env, &sink, 1));
    assert_eq!(drain_result, Ok(()));

    let insolvent = client.try_assert_escrow_solvent();
    assert!(matches!(insolvent, Err(Ok(InsightArenaError::EscrowEmpty))));
}

#[test]
fn test_escrow_solvent_after_payouts() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, xlm_token, _, oracle) = deploy(&env);

    let winner = Address::generate(&env);
    let loser = Address::generate(&env);

    let params = default_params(&env);
    let market_id = client.create_market(&Address::generate(&env), &params);

    fund(&env, &xlm_token, &winner, 100_000_000);
    fund(&env, &xlm_token, &loser, 100_000_000);

    client.submit_prediction(&winner, &market_id, &symbol_short!("yes"), &100_000_000);
    client.submit_prediction(&loser, &market_id, &symbol_short!("no"), &100_000_000);
    client.assert_escrow_solvent();

    env.ledger()
        .with_mut(|ledger| ledger.timestamp = params.resolution_time + 1);
    client.resolve_market(&oracle, &market_id, &symbol_short!("yes"));

    let payout = client.claim_payout(&winner, &market_id);
    assert_eq!(payout, 194_000_000);

    client.assert_escrow_solvent();
}

#[test]
fn test_treasury_accumulates_fees() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, xlm_token, admin, oracle) = deploy(&env);

    let winner = Address::generate(&env);
    let loser = Address::generate(&env);

    let params = default_params(&env);
    let market_id = client.create_market(&Address::generate(&env), &params);

    fund(&env, &xlm_token, &winner, 100_000_000);
    fund(&env, &xlm_token, &loser, 100_000_000);

    client.submit_prediction(&winner, &market_id, &symbol_short!("yes"), &100_000_000);
    client.submit_prediction(&loser, &market_id, &symbol_short!("no"), &100_000_000);

    env.ledger()
        .with_mut(|ledger| ledger.timestamp = params.resolution_time + 1);
    client.resolve_market(&oracle, &market_id, &symbol_short!("yes"));
    let payout = client.claim_payout(&winner, &market_id);

    assert_eq!(payout, 194_000_000);
    assert_eq!(client.get_treasury_balance(), 4_000_000);

    let token = TokenClient::new(&env, &xlm_token);
    assert_eq!(token.balance(&admin), 0);
    assert_eq!(token.balance(&client.address), 4_000_000);
}

#[test]
fn test_treasury_withdrawal_by_admin() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, xlm_token, admin, oracle) = deploy(&env);

    let winner = Address::generate(&env);
    let loser = Address::generate(&env);

    let params = default_params(&env);
    let market_id = client.create_market(&Address::generate(&env), &params);

    fund(&env, &xlm_token, &winner, 100_000_000);
    fund(&env, &xlm_token, &loser, 100_000_000);

    client.submit_prediction(&winner, &market_id, &symbol_short!("yes"), &100_000_000);
    client.submit_prediction(&loser, &market_id, &symbol_short!("no"), &100_000_000);

    env.ledger()
        .with_mut(|ledger| ledger.timestamp = params.resolution_time + 1);
    client.resolve_market(&oracle, &market_id, &symbol_short!("yes"));
    client.claim_payout(&winner, &market_id);

    assert_eq!(client.get_treasury_balance(), 4_000_000);

    let token = TokenClient::new(&env, &xlm_token);
    let admin_before = token.balance(&admin);
    let contract_before = token.balance(&client.address);

    let withdrawal_amount = 3_000_000_i128;
    client.withdraw_treasury(&admin, &admin, &withdrawal_amount);

    let admin_after = token.balance(&admin);
    let contract_after = token.balance(&client.address);

    assert_eq!(admin_after - admin_before, withdrawal_amount);
    assert_eq!(contract_before - contract_after, withdrawal_amount);
    assert_eq!(client.get_treasury_balance(), 1_000_000);
    assert_eq!(contract_after, 1_000_000);
}

#[test]
fn test_treasury_over_withdrawal_fails() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, xlm_token, admin, oracle) = deploy(&env);

    let winner = Address::generate(&env);
    let loser = Address::generate(&env);

    let params = default_params(&env);
    let market_id = client.create_market(&Address::generate(&env), &params);

    fund(&env, &xlm_token, &winner, 100_000_000);
    fund(&env, &xlm_token, &loser, 100_000_000);

    client.submit_prediction(&winner, &market_id, &symbol_short!("yes"), &100_000_000);
    client.submit_prediction(&loser, &market_id, &symbol_short!("no"), &100_000_000);

    env.ledger()
        .with_mut(|ledger| ledger.timestamp = params.resolution_time + 1);
    client.resolve_market(&oracle, &market_id, &symbol_short!("yes"));
    client.claim_payout(&winner, &market_id);

    assert_eq!(client.get_treasury_balance(), 4_000_000);

    let result = client.try_withdraw_treasury(&admin, &admin, &5_000_000_i128);
    assert!(matches!(result, Err(Ok(InsightArenaError::EscrowEmpty))));
    assert_eq!(client.get_treasury_balance(), 4_000_000);
}
