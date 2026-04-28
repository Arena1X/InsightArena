use insightarena_contract::*;
use soroban_sdk::testutils::Address as _;
use soroban_sdk::testutils::Ledger as _;
use soroban_sdk::token::StellarAssetClient;
use soroban_sdk::{symbol_short, vec, Address, Env, String, Symbol};

fn register_token(env: &Env) -> Address {
    let token_admin = Address::generate(env);
    env.register_stellar_asset_contract_v2(token_admin)
        .address()
}

fn deploy(env: &Env) -> (InsightArenaContractClient<'_>, Address) {
    let id = env.register(InsightArenaContract, ());
    let client = InsightArenaContractClient::new(env, &id);
    let admin = Address::generate(env);
    let oracle = Address::generate(env);
    let xlm_token = register_token(env);
    env.mock_all_auths();
    client.initialize(&admin, &oracle, &200_u32, &xlm_token);
    (client, xlm_token)
}

fn deploy_with_oracle(env: &Env) -> (InsightArenaContractClient<'_>, Address, Address) {
    let id = env.register(InsightArenaContract, ());
    let client = InsightArenaContractClient::new(env, &id);
    let admin = Address::generate(env);
    let oracle = Address::generate(env);
    let xlm_token = register_token(env);
    env.mock_all_auths();
    client.initialize(&admin, &oracle, &200_u32, &xlm_token);
    (client, xlm_token, oracle)
}

fn default_params(env: &Env) -> CreateMarketParams {
    let now = env.ledger().timestamp();
    CreateMarketParams {
        title: String::from_str(env, "Test market"),
        description: String::from_str(env, "desc"),
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

fn fund(env: &Env, token: &Address, user: &Address, amount: i128) {
    StellarAssetClient::new(env, token).mint(user, &amount);
}

// ── get_market_stats ──────────────────────────────────────────────────────

#[test]
fn get_market_stats_not_found() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _) = deploy(&env);
    let result = client.try_get_market_stats(&99);
    assert!(matches!(result, Err(Ok(InsightArenaError::MarketNotFound))));
}

#[test]
fn get_market_stats_empty_market() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _) = deploy(&env);
    let creator = Address::generate(&env);
    let id = client.create_market(&creator, &default_params(&env));

    let stats = client.get_market_stats(&id);
    assert_eq!(stats.total_pool, 0);
    assert_eq!(stats.participant_count, 0);
    assert_eq!(stats.leading_outcome_pool, 0);
}

#[test]
fn get_market_stats_correct_aggregation() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, xlm) = deploy(&env);
    let creator = Address::generate(&env);
    let id = client.create_market(&creator, &default_params(&env));

    let u1 = Address::generate(&env);
    let u2 = Address::generate(&env);
    let u3 = Address::generate(&env);
    fund(&env, &xlm, &u1, 50_000_000);
    fund(&env, &xlm, &u2, 30_000_000);
    fund(&env, &xlm, &u3, 20_000_000);

    client.submit_prediction(&u1, &id, &symbol_short!("yes"), &50_000_000);
    client.submit_prediction(&u2, &id, &symbol_short!("yes"), &30_000_000);
    client.submit_prediction(&u3, &id, &symbol_short!("no"), &20_000_000);

    let stats = client.get_market_stats(&id);
    assert_eq!(stats.total_pool, 100_000_000);
    assert_eq!(stats.participant_count, 3);
    assert_eq!(stats.leading_outcome, symbol_short!("yes"));
    assert_eq!(stats.leading_outcome_pool, 80_000_000);
}

// ── get_outcome_distribution ──────────────────────────────────────────────

#[test]
fn get_outcome_distribution_not_found() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _) = deploy(&env);
    let result = client.try_get_outcome_distribution(&99);
    assert!(matches!(result, Err(Ok(InsightArenaError::MarketNotFound))));
}

#[test]
fn get_outcome_distribution_empty() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _) = deploy(&env);
    let creator = Address::generate(&env);
    let id = client.create_market(&creator, &default_params(&env));

    let dist = client.get_outcome_distribution(&id);
    assert_eq!(dist.len(), 0);
}

#[test]
fn get_outcome_distribution_sorted_descending() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, xlm) = deploy(&env);
    let creator = Address::generate(&env);
    let id = client.create_market(&creator, &default_params(&env));

    let u1 = Address::generate(&env);
    let u2 = Address::generate(&env);
    let u3 = Address::generate(&env);
    fund(&env, &xlm, &u1, 20_000_000);
    fund(&env, &xlm, &u2, 50_000_000);
    fund(&env, &xlm, &u3, 30_000_000);

    client.submit_prediction(&u1, &id, &symbol_short!("no"), &20_000_000);
    client.submit_prediction(&u2, &id, &symbol_short!("yes"), &50_000_000);
    client.submit_prediction(&u3, &id, &symbol_short!("no"), &30_000_000);

    let dist = client.get_outcome_distribution(&id);
    assert_eq!(dist.len(), 2);
    let (_, first_pool) = dist.get(0).unwrap();
    let (_, second_pool) = dist.get(1).unwrap();
    assert!(first_pool >= second_pool);
}

#[test]
fn get_outcome_distribution_correct_sums() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, xlm) = deploy(&env);
    let creator = Address::generate(&env);
    let id = client.create_market(&creator, &default_params(&env));

    let u1 = Address::generate(&env);
    let u2 = Address::generate(&env);
    let u3 = Address::generate(&env);
    fund(&env, &xlm, &u1, 10_000_000);
    fund(&env, &xlm, &u2, 60_000_000);
    fund(&env, &xlm, &u3, 30_000_000);

    client.submit_prediction(&u1, &id, &symbol_short!("no"), &10_000_000);
    client.submit_prediction(&u2, &id, &symbol_short!("yes"), &60_000_000);
    client.submit_prediction(&u3, &id, &symbol_short!("yes"), &30_000_000);

    let dist = client.get_outcome_distribution(&id);
    assert_eq!(dist.len(), 2);
    let (sym0, pool0) = dist.get(0).unwrap();
    let (sym1, pool1) = dist.get(1).unwrap();
    assert_eq!(sym0, symbol_short!("yes"));
    assert_eq!(pool0, 90_000_000);
    assert_eq!(sym1, symbol_short!("no"));
    assert_eq!(pool1, 10_000_000);
}

// ── get_user_stats ────────────────────────────────────────────────────────

#[test]
fn get_user_stats_not_found() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _) = deploy(&env);
    let unknown = Address::generate(&env);
    let result = client.try_get_user_stats(&unknown);
    assert!(matches!(result, Err(Ok(InsightArenaError::UserNotFound))));
}

#[test]
fn get_user_stats_after_prediction() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, xlm) = deploy(&env);
    let creator = Address::generate(&env);
    let id = client.create_market(&creator, &default_params(&env));

    let user = Address::generate(&env);
    fund(&env, &xlm, &user, 20_000_000);
    client.submit_prediction(&user, &id, &symbol_short!("yes"), &20_000_000);

    let profile = client.get_user_stats(&user);
    assert_eq!(profile.total_predictions, 1);
    assert_eq!(profile.total_staked, 20_000_000);
}

// ── get_platform_stats ────────────────────────────────────────────────────

#[test]
fn get_platform_stats_initial_state() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _) = deploy(&env);

    let stats = client.get_platform_stats();
    assert_eq!(stats.total_markets, 0);
    assert_eq!(stats.total_volume_xlm, 0);
    assert_eq!(stats.active_users, 0);
    assert_eq!(stats.treasury_balance, 0);
}

#[test]
fn get_platform_stats_after_activity() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, xlm) = deploy(&env);
    let creator = Address::generate(&env);
    let id = client.create_market(&creator, &default_params(&env));

    let u1 = Address::generate(&env);
    let u2 = Address::generate(&env);
    fund(&env, &xlm, &u1, 20_000_000);
    fund(&env, &xlm, &u2, 30_000_000);
    client.submit_prediction(&u1, &id, &symbol_short!("yes"), &20_000_000);
    client.submit_prediction(&u2, &id, &symbol_short!("no"), &30_000_000);

    let stats = client.get_platform_stats();
    assert_eq!(stats.total_markets, 1);
    assert_eq!(stats.total_volume_xlm, 50_000_000);
    assert_eq!(stats.active_users, 3);
}

#[test]
fn platform_volume_accumulates_across_markets() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, xlm) = deploy(&env);
    let creator = Address::generate(&env);

    let id1 = client.create_market(&creator, &default_params(&env));
    let id2 = client.create_market(&creator, &default_params(&env));

    let u1 = Address::generate(&env);
    let u2 = Address::generate(&env);
    fund(&env, &xlm, &u1, 100_000_000);
    fund(&env, &xlm, &u2, 100_000_000);

    client.submit_prediction(&u1, &id1, &symbol_short!("yes"), &40_000_000);
    client.submit_prediction(&u2, &id2, &symbol_short!("no"), &60_000_000);

    let stats = client.get_platform_stats();
    assert_eq!(stats.total_volume_xlm, 100_000_000);
    assert_eq!(stats.total_markets, 2);
}

#[test]
fn test_analytics_aggregation() {
    // Test that analytics correctly aggregate data across multiple markets
    let env = Env::default();
    env.mock_all_auths();
    let (client, xlm) = deploy(&env);
    let creator = Address::generate(&env);

    let id1 = client.create_market(&creator, &default_params(&env));
    let id2 = client.create_market(&creator, &default_params(&env));

    let u1 = Address::generate(&env);
    let u2 = Address::generate(&env);
    fund(&env, &xlm, &u1, 100_000_000);
    fund(&env, &xlm, &u2, 100_000_000);

    client.submit_prediction(&u1, &id1, &symbol_short!("yes"), &40_000_000);
    client.submit_prediction(&u1, &id2, &symbol_short!("yes"), &30_000_000);
    client.submit_prediction(&u2, &id1, &symbol_short!("no"), &20_000_000);
    client.submit_prediction(&u2, &id2, &symbol_short!("no"), &50_000_000);

    let stats = client.get_platform_stats();
    assert_eq!(stats.total_markets, 2);
    assert_eq!(stats.total_volume_xlm, 140_000_000);
    assert_eq!(stats.active_users, 3);

    let u1_stats = client.get_user_stats(&u1);
    assert_eq!(u1_stats.total_predictions, 2);
    assert_eq!(u1_stats.total_staked, 70_000_000);

    let u2_stats = client.get_user_stats(&u2);
    assert_eq!(u2_stats.total_predictions, 2);
    assert_eq!(u2_stats.total_staked, 70_000_000);
}

#[test]
fn test_get_market_stats_success() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, xlm) = deploy(&env);
    let creator = Address::generate(&env);
    let market_id = client.create_market(&creator, &default_params(&env));

    let u1 = Address::generate(&env);
    let u2 = Address::generate(&env);
    fund(&env, &xlm, &u1, 40_000_000);
    fund(&env, &xlm, &u2, 60_000_000);

    client.submit_prediction(&u1, &market_id, &symbol_short!("yes"), &40_000_000);
    client.submit_prediction(&u2, &market_id, &symbol_short!("no"), &60_000_000);

    let stats = client.get_market_stats(&market_id);
    assert_eq!(stats.total_pool, 100_000_000);
    assert_eq!(stats.participant_count, 2);
    assert_eq!(stats.leading_outcome, symbol_short!("no"));
    assert_eq!(stats.leading_outcome_pool, 60_000_000);
}

#[test]
fn test_track_multiple_markets_analytics() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, xlm) = deploy(&env);
    let creator = Address::generate(&env);

    let market_a = client.create_market(&creator, &default_params(&env));
    let market_b = client.create_market(&creator, &default_params(&env));

    let u1 = Address::generate(&env);
    let u2 = Address::generate(&env);
    let u3 = Address::generate(&env);
    fund(&env, &xlm, &u1, 50_000_000);
    fund(&env, &xlm, &u2, 70_000_000);
    fund(&env, &xlm, &u3, 30_000_000);

    client.submit_prediction(&u1, &market_a, &symbol_short!("yes"), &50_000_000);
    client.submit_prediction(&u2, &market_a, &symbol_short!("yes"), &20_000_000);
    client.submit_prediction(&u3, &market_b, &symbol_short!("no"), &30_000_000);

    let stats_a = client.get_market_stats(&market_a);
    assert_eq!(stats_a.total_pool, 70_000_000);
    assert_eq!(stats_a.participant_count, 2);
    assert_eq!(stats_a.leading_outcome, symbol_short!("yes"));
    assert_eq!(stats_a.leading_outcome_pool, 70_000_000);

    let stats_b = client.get_market_stats(&market_b);
    assert_eq!(stats_b.total_pool, 30_000_000);
    assert_eq!(stats_b.participant_count, 1);
    assert_eq!(stats_b.leading_outcome, symbol_short!("no"));
    assert_eq!(stats_b.leading_outcome_pool, 30_000_000);
}

#[test]
fn test_analytics_after_market_resolution() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, xlm, oracle) = deploy_with_oracle(&env);
    let creator = Address::generate(&env);
    let params = default_params(&env);
    let market_id = client.create_market(&creator, &params);

    let u1 = Address::generate(&env);
    let u2 = Address::generate(&env);
    fund(&env, &xlm, &u1, 60_000_000);
    fund(&env, &xlm, &u2, 40_000_000);

    client.submit_prediction(&u1, &market_id, &symbol_short!("yes"), &60_000_000);
    client.submit_prediction(&u2, &market_id, &symbol_short!("no"), &40_000_000);

    env.ledger()
        .with_mut(|li| li.timestamp = params.resolution_time + 1);
    client.resolve_market(&oracle, &market_id, &symbol_short!("yes"));

    let market = client.get_market(&market_id);
    assert!(market.is_resolved);
    assert_eq!(market.resolved_outcome.unwrap(), symbol_short!("yes"));

    let stats = client.get_market_stats(&market_id);
    assert_eq!(stats.total_pool, 100_000_000);
    assert_eq!(stats.participant_count, 2);
    assert_eq!(stats.leading_outcome, symbol_short!("yes"));
    assert_eq!(stats.leading_outcome_pool, 60_000_000);
}

#[test]
fn test_get_platform_stats_reflects_market_count() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _) = deploy(&env);
    let creator = Address::generate(&env);

    assert_eq!(client.get_platform_stats().total_markets, 0);

    client.create_market(&creator, &default_params(&env));
    assert_eq!(client.get_platform_stats().total_markets, 1);

    client.create_market(&creator, &default_params(&env));
    assert_eq!(client.get_platform_stats().total_markets, 2);
}

#[test]
fn test_get_platform_stats_reflects_total_volume() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, xlm) = deploy(&env);
    let creator = Address::generate(&env);
    let id = client.create_market(&creator, &default_params(&env));

    let u1 = Address::generate(&env);
    let amount = 50_000_000;
    fund(&env, &xlm, &u1, amount);

    client.submit_prediction(&u1, &id, &symbol_short!("yes"), &amount);

    let stats = client.get_platform_stats();
    assert_eq!(stats.total_volume_xlm, amount);
}

#[test]
fn test_get_market_stats_returns_correct_pool_and_participants() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, xlm) = deploy(&env);
    let creator = Address::generate(&env);
    let id = client.create_market(&creator, &default_params(&env));

    let u1 = Address::generate(&env);
    let u2 = Address::generate(&env);
    fund(&env, &xlm, &u1, 25_000_000);
    fund(&env, &xlm, &u2, 35_000_000);

    client.submit_prediction(&u1, &id, &symbol_short!("yes"), &25_000_000);
    client.submit_prediction(&u2, &id, &symbol_short!("no"), &35_000_000);

    let stats = client.get_market_stats(&id);
    assert_eq!(stats.total_pool, 60_000_000);
    assert_eq!(stats.participant_count, 2);
}

#[test]
fn test_get_user_stats_returns_correct_profile() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, xlm) = deploy(&env);
    let creator = Address::generate(&env);
    let id = client.create_market(&creator, &default_params(&env));

    let user = Address::generate(&env);
    fund(&env, &xlm, &user, 40_000_000);

    client.submit_prediction(&user, &id, &symbol_short!("yes"), &40_000_000);

    let profile = client.get_user_stats(&user);
    assert_eq!(profile.total_predictions, 1);
    assert_eq!(profile.total_staked, 40_000_000);
}
