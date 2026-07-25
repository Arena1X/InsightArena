use soroban_sdk::testutils::{Address as _, Ledger as _};
use soroban_sdk::{symbol_short, vec, Address, Env, String, Symbol};

use insightarena_contract::market::CreateMarketParams;
use insightarena_contract::{InsightArenaContract, InsightArenaContractClient, InsightArenaError};

fn register_token(env: &Env) -> Address {
    let token_admin = Address::generate(env);
    env.register_stellar_asset_contract_v2(token_admin)
        .address()
}

fn deploy(env: &Env) -> (InsightArenaContractClient<'_>, Address, Address) {
    let id = env.register(InsightArenaContract, ());
    let client = InsightArenaContractClient::new(env, &id);
    let admin = Address::generate(env);
    let oracle = Address::generate(env);
    let xlm_token = register_token(env);
    env.mock_all_auths();
    client.initialize(&admin, &oracle, &200_u32, &xlm_token);
    (client, admin, oracle)
}

fn default_params(env: &Env) -> CreateMarketParams {
    let now = env.ledger().timestamp();
    CreateMarketParams {
        title: String::from_str(env, "Will it rain?"),
        description: String::from_str(env, "Daily weather market"),
        category: Symbol::new(env, "Sports"),
        outcomes: vec![env, symbol_short!("yes"), symbol_short!("no")],
        end_time: now + 1000,
        resolution_time: now + 2000,
        dispute_window: 86_400,
        creator_fee_bps: 100,
        min_stake: 10_000_000,
        max_stake: 100_000_000,
        is_public: true,
    }
}

#[test]
fn resolve_market_success() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, oracle) = deploy(&env);
    let creator = Address::generate(&env);

    let id = client.create_market(&creator, &default_params(&env));

    // Advance time to resolution_time (now + 2000)
    env.ledger().set_timestamp(env.ledger().timestamp() + 2000);

    client.resolve_market(&oracle, &id, &symbol_short!("yes"));

    let market = client.get_market(&id);
    assert!(market.is_resolved);
    assert_eq!(market.resolved_outcome, Some(symbol_short!("yes")));
    assert_eq!(market.resolved_at, Some(env.ledger().timestamp()));
}

#[test]
fn resolve_market_fails_when_paused() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, oracle) = deploy(&env);
    let creator = Address::generate(&env);

    let id = client.create_market(&creator, &default_params(&env));
    env.ledger().set_timestamp(env.ledger().timestamp() + 2000);

    client.set_paused(&true, &1u32);

    let result = client.try_resolve_market(&oracle, &id, &symbol_short!("yes"));
    assert!(matches!(result, Err(Ok(InsightArenaError::Paused))));
}

#[test]
fn resolve_market_unauthorized() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, _oracle) = deploy(&env);
    let creator = Address::generate(&env);
    let random = Address::generate(&env);

    let id = client.create_market(&creator, &default_params(&env));
    env.ledger().set_timestamp(env.ledger().timestamp() + 2000);

    let result = client.try_resolve_market(&random, &id, &symbol_short!("yes"));
    assert!(matches!(result, Err(Ok(InsightArenaError::Unauthorized))));
}

#[test]
fn resolve_market_too_early() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, oracle) = deploy(&env);
    let creator = Address::generate(&env);

    let id = client.create_market(&creator, &default_params(&env));

    // Only advance half-way to resolution_time
    env.ledger().set_timestamp(env.ledger().timestamp() + 1000);

    let result = client.try_resolve_market(&oracle, &id, &symbol_short!("yes"));
    assert!(matches!(
        result,
        Err(Ok(InsightArenaError::MarketStillOpen))
    ));
}

#[test]
fn resolve_market_already_resolved() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, oracle) = deploy(&env);
    let creator = Address::generate(&env);

    let id = client.create_market(&creator, &default_params(&env));
    env.ledger().set_timestamp(env.ledger().timestamp() + 2000);

    client.resolve_market(&oracle, &id, &symbol_short!("yes"));

    // Second attempt
    let result = client.try_resolve_market(&oracle, &id, &symbol_short!("yes"));
    assert!(matches!(
        result,
        Err(Ok(InsightArenaError::MarketAlreadyResolved))
    ));
}

#[test]
fn resolve_market_invalid_outcome() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, oracle) = deploy(&env);
    let creator = Address::generate(&env);

    let id = client.create_market(&creator, &default_params(&env));
    env.ledger().set_timestamp(env.ledger().timestamp() + 2000);

    let result = client.try_resolve_market(&oracle, &id, &symbol_short!("maybe"));
    assert!(matches!(result, Err(Ok(InsightArenaError::InvalidOutcome))));
}

#[test]
fn update_oracle_and_resolve() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, old_oracle) = deploy(&env);
    let creator = Address::generate(&env);
    let new_oracle = Address::generate(&env);

    let id = client.create_market(&creator, &default_params(&env));

    // Update oracle
    client.update_oracle(&admin, &new_oracle);

    // Advance time
    env.ledger().set_timestamp(env.ledger().timestamp() + 2000);

    // Old oracle cannot resolve
    let result = client.try_resolve_market(&old_oracle, &id, &symbol_short!("yes"));
    assert!(matches!(result, Err(Ok(InsightArenaError::Unauthorized))));

    // New oracle can resolve
    client.resolve_market(&new_oracle, &id, &symbol_short!("yes"));

    let market = client.get_market(&id);
    assert!(market.is_resolved);
}

#[test]
fn update_oracle_unauthorized() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, _old_oracle) = deploy(&env);
    let random = Address::generate(&env);
    let new_oracle = Address::generate(&env);

    let result = client.try_update_oracle(&random, &new_oracle);
    assert!(matches!(result, Err(Ok(InsightArenaError::Unauthorized))));
}

// ── Issue #534: three additional named tests ──────────────────────────────────

#[test]
fn test_resolve_market_invalid_outcome() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, oracle) = deploy(&env);
    let creator = Address::generate(&env);

    // default_params has outcomes ["yes", "no"]
    let id = client.create_market(&creator, &default_params(&env));
    env.ledger().set_timestamp(env.ledger().timestamp() + 2000);

    let result = client.try_resolve_market(&oracle, &id, &symbol_short!("maybe"));
    assert!(matches!(result, Err(Ok(InsightArenaError::InvalidOutcome))));
}

#[test]
fn test_resolve_already_resolved_market() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, oracle) = deploy(&env);
    let creator = Address::generate(&env);

    let id = client.create_market(&creator, &default_params(&env));
    env.ledger().set_timestamp(env.ledger().timestamp() + 2000);

    // First resolution succeeds.
    client.resolve_market(&oracle, &id, &symbol_short!("yes"));

    // Second attempt on the same market must fail.
    let result = client.try_resolve_market(&oracle, &id, &symbol_short!("yes"));
    assert!(matches!(
        result,
        Err(Ok(InsightArenaError::MarketAlreadyResolved))
    ));
}

#[test]
fn test_resolve_market_too_early() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, oracle) = deploy(&env);
    let creator = Address::generate(&env);

    // resolution_time = now + 2000; do not advance time at all.
    let id = client.create_market(&creator, &default_params(&env));

    let result = client.try_resolve_market(&oracle, &id, &symbol_short!("yes"));
    assert!(matches!(
        result,
        Err(Ok(InsightArenaError::MarketStillOpen))
    ));
}

// New test: ensure oracle cannot resolve before resolution_time
#[test]
fn test_resolve_market_before_resolution_time() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, oracle) = deploy(&env);
    let creator = Address::generate(&env);

    let id = client.create_market(&creator, &default_params(&env));

    // Do NOT advance time; attempt to resolve immediately
    let result = client.try_resolve_market(&oracle, &id, &symbol_short!("yes"));
    assert!(matches!(
        result,
        Err(Ok(InsightArenaError::MarketStillOpen))
    ));
}

#[test]
fn resolve_market_rejects_one_second_before_and_succeeds_at_resolution_time() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, oracle) = deploy(&env);
    let creator = Address::generate(&env);
    let now = env.ledger().timestamp();
    let mut params = default_params(&env);
    params.resolution_time = now + 3600;

    let id = client.create_market(&creator, &params);

    env.ledger().set_timestamp(now + 3599);
    let early = client.try_resolve_market(&oracle, &id, &symbol_short!("yes"));
    assert!(matches!(early, Err(Ok(InsightArenaError::MarketStillOpen))));

    env.ledger().set_timestamp(now + 3600);
    client.resolve_market(&oracle, &id, &symbol_short!("yes"));
    assert!(client.get_market(&id).is_resolved);
}
