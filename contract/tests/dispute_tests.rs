use insightarena_contract::{
    CreateMarketParams, InsightArenaContract, InsightArenaContractClient, InsightArenaError,
};
use soroban_sdk::testutils::{Address as _, Ledger as _};
use soroban_sdk::token::{Client as TokenClient, StellarAssetClient};
use soroban_sdk::{symbol_short, vec, Address, Env, String, Symbol};

fn register_token(env: &Env) -> Address {
    let token_admin = Address::generate(env);
    env.register_stellar_asset_contract_v2(token_admin).address()
}

fn deploy(env: &Env) -> (InsightArenaContractClient<'_>, Address, Address, Address) {
    let id = env.register(InsightArenaContract, ());
    let client = InsightArenaContractClient::new(env, &id);
    let admin = Address::generate(env);
    let oracle = Address::generate(env);
    let xlm_token = register_token(env);
    env.mock_all_auths();
    client.initialize(&admin, &oracle, &200_u32, &xlm_token);
    (client, admin, oracle, xlm_token)
}

fn market_params(env: &Env) -> CreateMarketParams {
    market_params_with_window(env, 86_400)
}

fn market_params_with_window(env: &Env, dispute_window: u64) -> CreateMarketParams {
    let now = env.ledger().timestamp();
    CreateMarketParams {
        title: String::from_str(env, "Dispute test market"),
        description: String::from_str(env, "For get_dispute tests"),
        category: Symbol::new(env, "Sports"),
        outcomes: vec![env, symbol_short!("yes"), symbol_short!("no")],
        end_time: now + 10,
        resolution_time: now + 20,
        dispute_window,
        creator_fee_bps: 100,
        min_stake: 10_000_000,
        max_stake: 100_000_000,
        is_public: true,
    }
}

#[test]
fn raise_dispute_fails_outside_window() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, oracle, xlm_token) = deploy(&env);
    let creator = Address::generate(&env);
    let disputer = Address::generate(&env);

    let id = client.create_market(&creator, &market_params_with_window(&env, 30));
    env.ledger().set_timestamp(env.ledger().timestamp() + 20);
    client.resolve_market(&oracle, &id, &symbol_short!("yes"));

    env.ledger().set_timestamp(env.ledger().timestamp() + 31);

    StellarAssetClient::new(&env, &xlm_token).mint(&disputer, &10_000_000);
    TokenClient::new(&env, &xlm_token).approve(&disputer, &client.address, &10_000_000, &9999);

    let result = client.try_raise_dispute(&disputer, &id, &10_000_000);
    assert!(matches!(
        result,
        Err(Ok(InsightArenaError::DisputeWindowClosed))
    ));
}

#[test]
fn raise_dispute_locks_bond_in_escrow_and_stores_dispute() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, oracle, xlm_token) = deploy(&env);
    let creator = Address::generate(&env);
    let disputer = Address::generate(&env);

    let id = client.create_market(&creator, &market_params(&env));
    env.ledger().set_timestamp(env.ledger().timestamp() + 20);
    client.resolve_market(&oracle, &id, &symbol_short!("yes"));

    let bond = 15_000_000_i128;
    StellarAssetClient::new(&env, &xlm_token).mint(&disputer, &bond);
    TokenClient::new(&env, &xlm_token).approve(&disputer, &client.address, &bond, &9999);

    let token = TokenClient::new(&env, &xlm_token);
    let contract_before = token.balance(&client.address);
    let disputer_before = token.balance(&disputer);

    client.raise_dispute(&disputer, &id, &bond);

    assert_eq!(token.balance(&disputer), disputer_before - bond);
    assert_eq!(token.balance(&client.address), contract_before + bond);

    let dispute = client.get_dispute(&id);
    assert_eq!(dispute.disputer, disputer);
    assert_eq!(dispute.bond, bond);
}

#[test]
fn resolve_dispute_uphold_returns_bond_and_reopens_market() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, oracle, xlm_token) = deploy(&env);
    let creator = Address::generate(&env);
    let disputer = Address::generate(&env);

    let id = client.create_market(&creator, &market_params(&env));
    env.ledger().set_timestamp(env.ledger().timestamp() + 20);
    client.resolve_market(&oracle, &id, &symbol_short!("yes"));

    let bond = 12_000_000_i128;
    StellarAssetClient::new(&env, &xlm_token).mint(&disputer, &bond);
    TokenClient::new(&env, &xlm_token).approve(&disputer, &client.address, &bond, &9999);
    client.raise_dispute(&disputer, &id, &bond);

    let token = TokenClient::new(&env, &xlm_token);
    let disputer_before = token.balance(&disputer);

    client.resolve_dispute(&admin, &id, &true);

    assert_eq!(token.balance(&disputer), disputer_before + bond);

    let market = client.get_market(&id);
    assert!(!market.is_resolved);
    assert_eq!(market.resolved_outcome, None);
    assert_eq!(market.resolved_at, None);
}

#[test]
fn resolve_dispute_reject_forfeits_bond_to_treasury_balance() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, oracle, xlm_token) = deploy(&env);
    let creator = Address::generate(&env);
    let disputer = Address::generate(&env);

    let id = client.create_market(&creator, &market_params(&env));
    env.ledger().set_timestamp(env.ledger().timestamp() + 20);
    client.resolve_market(&oracle, &id, &symbol_short!("yes"));

    let bond = 9_000_000_i128;
    StellarAssetClient::new(&env, &xlm_token).mint(&disputer, &bond);
    TokenClient::new(&env, &xlm_token).approve(&disputer, &client.address, &bond, &9999);
    client.raise_dispute(&disputer, &id, &bond);

    let treasury_before = client.get_treasury_balance();
    client.resolve_dispute(&admin, &id, &false);
    let treasury_after = client.get_treasury_balance();
    assert_eq!(treasury_after, treasury_before + bond);
}

#[test]
fn test_get_dispute_returns_correct_fields() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, oracle, xlm_token) = deploy(&env);
    let creator = Address::generate(&env);
    let disputer = Address::generate(&env);

    let id = client.create_market(&creator, &market_params(&env));
    env.ledger().set_timestamp(env.ledger().timestamp() + 20);
    client.resolve_market(&oracle, &id, &symbol_short!("yes"));

    let bond = 15_000_000_i128;
    StellarAssetClient::new(&env, &xlm_token).mint(&disputer, &bond);
    TokenClient::new(&env, &xlm_token).approve(&disputer, &client.address, &bond, &9999);

    let filed_at = env.ledger().timestamp();
    client.raise_dispute(&disputer, &id, &bond);

    let dispute = client.get_dispute(&id);
    assert_eq!(dispute.disputer, disputer);
    assert_eq!(dispute.bond, bond);
    assert_eq!(dispute.filed_at, filed_at);
}

#[test]
fn test_get_dispute_fails_when_no_dispute() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, oracle, _xlm_token) = deploy(&env);
    let creator = Address::generate(&env);

    let id = client.create_market(&creator, &market_params(&env));
    env.ledger().set_timestamp(env.ledger().timestamp() + 20);
    client.resolve_market(&oracle, &id, &symbol_short!("yes"));

    let result = client.try_get_dispute(&id);
    assert!(matches!(result, Err(Ok(InsightArenaError::DisputeNotFound))));
}

#[test]
fn test_get_dispute_fails_after_resolution() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, oracle, xlm_token) = deploy(&env);
    let creator = Address::generate(&env);
    let disputer = Address::generate(&env);

    let id = client.create_market(&creator, &market_params(&env));
    env.ledger().set_timestamp(env.ledger().timestamp() + 20);
    client.resolve_market(&oracle, &id, &symbol_short!("yes"));

    let bond = 12_000_000_i128;
    StellarAssetClient::new(&env, &xlm_token).mint(&disputer, &bond);
    TokenClient::new(&env, &xlm_token).approve(&disputer, &client.address, &bond, &9999);
    client.raise_dispute(&disputer, &id, &bond);

    // Reject the dispute — this removes it from storage
    client.resolve_dispute(&admin, &id, &false);

    let result = client.try_get_dispute(&id);
    assert!(matches!(result, Err(Ok(InsightArenaError::DisputeNotFound))));
}
