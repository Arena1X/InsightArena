use soroban_sdk::testutils::{Address as _, Ledger as _};
use soroban_sdk::{symbol_short, vec, Address, Env, String, Symbol, BytesN};

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
        metadata_hash: BytesN::from_array(env, &[0u8; 32]),
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

#[test]
fn test_oracle_can_resolve_multiple_markets() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, oracle) = deploy(&env);
    let creator = Address::generate(&env);

    // Create three different markets
    let id1 = client.create_market(&creator, &default_params(&env));
    let id2 = client.create_market(&creator, &default_params(&env));
    let id3 = client.create_market(&creator, &default_params(&env));

    // Advance time to resolution_time
    env.ledger().set_timestamp(env.ledger().timestamp() + 2000);

    // Oracle resolves all three markets with different outcomes
    client.resolve_market(&oracle, &id1, &symbol_short!("yes"));
    client.resolve_market(&oracle, &id2, &symbol_short!("no"));
    client.resolve_market(&oracle, &id3, &symbol_short!("yes"));

    // Verify all markets are resolved correctly
    let market1 = client.get_market(&id1);
    let market2 = client.get_market(&id2);
    let market3 = client.get_market(&id3);

    assert!(market1.is_resolved);
    assert_eq!(market1.resolved_outcome, Some(symbol_short!("yes")));
    
    assert!(market2.is_resolved);
    assert_eq!(market2.resolved_outcome, Some(symbol_short!("no")));
    
    assert!(market3.is_resolved);
    assert_eq!(market3.resolved_outcome, Some(symbol_short!("yes")));
}

#[test]
fn test_resolve_market_with_different_valid_outcomes() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, oracle) = deploy(&env);
    let creator = Address::generate(&env);

    // Create two markets
    let id1 = client.create_market(&creator, &default_params(&env));
    let id2 = client.create_market(&creator, &default_params(&env));

    env.ledger().set_timestamp(env.ledger().timestamp() + 2000);

    // Resolve one with "yes" and one with "no"
    client.resolve_market(&oracle, &id1, &symbol_short!("yes"));
    client.resolve_market(&oracle, &id2, &symbol_short!("no"));

    let market1 = client.get_market(&id1);
    let market2 = client.get_market(&id2);

    assert_eq!(market1.resolved_outcome, Some(symbol_short!("yes")));
    assert_eq!(market2.resolved_outcome, Some(symbol_short!("no")));
}

#[test]
fn test_oracle_update_multiple_times() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, oracle1) = deploy(&env);
    let oracle2 = Address::generate(&env);
    let oracle3 = Address::generate(&env);
    let creator = Address::generate(&env);

    let id = client.create_market(&creator, &default_params(&env));

    // Update oracle multiple times
    client.update_oracle(&admin, &oracle2);
    client.update_oracle(&admin, &oracle3);

    env.ledger().set_timestamp(env.ledger().timestamp() + 2000);

    // Only oracle3 (latest) should be able to resolve
    let result1 = client.try_resolve_market(&oracle1, &id, &symbol_short!("yes"));
    assert!(matches!(result1, Err(Ok(InsightArenaError::Unauthorized))));

    let result2 = client.try_resolve_market(&oracle2, &id, &symbol_short!("yes"));
    assert!(matches!(result2, Err(Ok(InsightArenaError::Unauthorized))));

    // oracle3 succeeds
    client.resolve_market(&oracle3, &id, &symbol_short!("yes"));
    assert!(client.get_market(&id).is_resolved);
}

#[test]
fn test_resolve_market_exactly_at_resolution_time() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, oracle) = deploy(&env);
    let creator = Address::generate(&env);
    let now = env.ledger().timestamp();
    
    let mut params = default_params(&env);
    params.resolution_time = now + 5000;

    let id = client.create_market(&creator, &params);

    // Set time exactly to resolution_time (not before, not after)
    env.ledger().set_timestamp(now + 5000);

    client.resolve_market(&oracle, &id, &symbol_short!("yes"));

    let market = client.get_market(&id);
    assert!(market.is_resolved);
    assert_eq!(market.resolved_outcome, Some(symbol_short!("yes")));
    assert_eq!(market.resolved_at, Some(now + 5000));
}

#[test]
fn test_resolve_market_long_after_resolution_time() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, oracle) = deploy(&env);
    let creator = Address::generate(&env);
    let now = env.ledger().timestamp();

    let id = client.create_market(&creator, &default_params(&env));

    // Advance time way past resolution_time (resolution_time is now + 2000)
    env.ledger().set_timestamp(now + 10000);

    // Should still be able to resolve
    client.resolve_market(&oracle, &id, &symbol_short!("yes"));

    let market = client.get_market(&id);
    assert!(market.is_resolved);
    assert_eq!(market.resolved_outcome, Some(symbol_short!("yes")));
    assert_eq!(market.resolved_at, Some(now + 10000));
}

#[test]
fn test_non_oracle_cannot_resolve_after_oracle_update() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, old_oracle) = deploy(&env);
    let new_oracle = Address::generate(&env);
    let random_user = Address::generate(&env);
    let creator = Address::generate(&env);

    let id = client.create_market(&creator, &default_params(&env));

    // Update to new oracle
    client.update_oracle(&admin, &new_oracle);

    env.ledger().set_timestamp(env.ledger().timestamp() + 2000);

    // Old oracle cannot resolve
    let result1 = client.try_resolve_market(&old_oracle, &id, &symbol_short!("yes"));
    assert!(matches!(result1, Err(Ok(InsightArenaError::Unauthorized))));

    // Random user cannot resolve
    let result2 = client.try_resolve_market(&random_user, &id, &symbol_short!("yes"));
    assert!(matches!(result2, Err(Ok(InsightArenaError::Unauthorized))));

    // Admin cannot resolve (admin is not oracle)
    let result3 = client.try_resolve_market(&admin, &id, &symbol_short!("yes"));
    assert!(matches!(result3, Err(Ok(InsightArenaError::Unauthorized))));

    // Only new oracle can resolve
    client.resolve_market(&new_oracle, &id, &symbol_short!("yes"));
    assert!(client.get_market(&id).is_resolved);
}
