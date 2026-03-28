use soroban_sdk::testutils::Address as _;
use soroban_sdk::{symbol_short, vec, Address, Env, String, Symbol};

use crate::market::CreateMarketParams;
use crate::{InsightArenaContract, InsightArenaContractClient, InsightArenaError};

fn register_token(env: &Env) -> Address {
    let token_admin = Address::generate(env);
    env.register_stellar_asset_contract_v2(token_admin)
        .address()
}

/// Deploy, initialise, and return (client, admin, oracle).
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
        description: String::from_str(env, "Weather market"),
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

// ── Happy path ────────────────────────────────────────────────────────────

/// Successful market creation returns a valid market ID and persists the record.
#[test]
fn test_create_market_success() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, _oracle) = deploy(&env);
    let creator = Address::generate(&env);

    let id = client.create_market(&creator, &default_params(&env));
    assert_eq!(id, 1);

    let market = client.get_market(&id);
    assert_eq!(market.market_id, id);
    assert_eq!(market.creator, creator);
    assert!(!market.is_resolved);
    assert!(!market.is_cancelled);
}

// ── Edge cases ────────────────────────────────────────────────────────────

/// end_time equal to current timestamp is rejected (must be strictly in the future).
#[test]
fn test_create_market_invalid_end_time() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, _oracle) = deploy(&env);
    let creator = Address::generate(&env);

    let mut p = default_params(&env);
    p.end_time = env.ledger().timestamp(); // not strictly after now

    let result = client.try_create_market(&creator, &p);
    assert!(matches!(
        result,
        Err(Ok(InsightArenaError::InvalidTimeRange))
    ));
}

/// Fewer than two outcomes is rejected.
#[test]
fn test_create_market_invalid_outcomes_count() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, _oracle) = deploy(&env);
    let creator = Address::generate(&env);

    let mut p = default_params(&env);
    p.outcomes = vec![&env, symbol_short!("yes")];

    let result = client.try_create_market(&creator, &p);
    assert!(matches!(result, Err(Ok(InsightArenaError::InvalidInput))));
}

/// Creator fee exceeding the 500 bps platform cap is rejected.
#[test]
fn test_create_market_fee_exceeds_max() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, _oracle) = deploy(&env);
    let creator = Address::generate(&env);

    let mut p = default_params(&env);
    p.creator_fee_bps = 501;

    let result = client.try_create_market(&creator, &p);
    assert!(matches!(result, Err(Ok(InsightArenaError::InvalidFee))));
}

/// min_stake greater than max_stake is rejected.
#[test]
fn test_create_market_min_stake_exceeds_max_stake() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, _oracle) = deploy(&env);
    let creator = Address::generate(&env);

    let mut p = default_params(&env);
    p.min_stake = 100_000_000;
    p.max_stake = 10_000_000; // less than min_stake

    let result = client.try_create_market(&creator, &p);
    assert!(matches!(result, Err(Ok(InsightArenaError::InvalidInput))));
}

/// Creating a market while the contract is paused is rejected.
#[test]
fn test_create_market_when_paused() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, _oracle) = deploy(&env);
    let creator = Address::generate(&env);

    client.set_paused(&true);

    let result = client.try_create_market(&creator, &default_params(&env));
    assert!(matches!(result, Err(Ok(InsightArenaError::Paused))));
}

/// Creator require_auth is enforced — calling without valid authorisation panics.
#[test]
#[should_panic(expected = "HostError: Error(Auth")]
fn test_create_market_unauthorised() {
    let env = Env::default();
    // Do NOT call mock_all_auths so require_auth will fail.
    let id = env.register(InsightArenaContract, ());
    let client = InsightArenaContractClient::new(&env, &id);
    let admin = Address::generate(&env);
    let oracle = Address::generate(&env);
    let xlm_token = register_token(&env);

    // Initialize needs admin auth — temporarily mock it.
    env.mock_all_auths();
    client.initialize(&admin, &oracle, &200_u32, &xlm_token);

    // Soroban's mock_all_auths is sticky per Env, so we use a second Env
    // to test the auth-failure path with a clean auth state.
    let env2 = Env::default();
    // NO mock_all_auths on env2.
    let id2 = env2.register(InsightArenaContract, ());
    let client2 = InsightArenaContractClient::new(&env2, &id2);
    let admin2 = Address::generate(&env2);
    let oracle2 = Address::generate(&env2);
    let xlm_token2 = register_token(&env2);
    // We must initialize — use as_contract to bypass auth for setup only.
    env2.as_contract(&id2, || {
        crate::config::initialize(&env2, admin2, oracle2, 200, xlm_token2).unwrap();
    });

    let creator = Address::generate(&env2);
    // This should panic because creator.require_auth() has no mock.
    client2.create_market(&creator, &default_params(&env2));
}
