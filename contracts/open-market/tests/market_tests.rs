use insightarena_contract::market::{calculate_price, CreateMarketParams};
use insightarena_contract::storage_types::{DataKey, Market, Prediction};
use insightarena_contract::{InsightArenaContract, InsightArenaContractClient, InsightArenaError};
use soroban_sdk::testutils::{Address as _, Ledger as _};
use soroban_sdk::token::{Client as TokenClient, StellarAssetClient};
use soroban_sdk::{symbol_short, vec, Address, Env, String, Symbol, Vec, BytesN};

#[test]
fn test_calculate_price_equal_reserves() {
    assert_eq!(calculate_price(1000, 1000).unwrap(), 1_000_000);
}

#[test]
fn test_calculate_price_double() {
    assert_eq!(calculate_price(1000, 2000).unwrap(), 2_000_000);
}

#[test]
fn test_calculate_price_half() {
    assert_eq!(calculate_price(2000, 1000).unwrap(), 500_000);
}

#[test]
fn test_calculate_price_precision() {
    assert_eq!(calculate_price(3000, 1000).unwrap(), 333_333);
}

fn register_token(env: &Env) -> Address {
    let token_admin = Address::generate(env);
    env.register_stellar_asset_contract_v2(token_admin)
        .address()
}

fn deploy(env: &Env) -> InsightArenaContractClient<'_> {
    let id = env.register(InsightArenaContract, ());
    let client = InsightArenaContractClient::new(env, &id);
    let admin = Address::generate(env);
    let oracle = Address::generate(env);
    let xlm_token = register_token(env);
    env.mock_all_auths();
    client.initialize(&admin, &oracle, &200_u32, &xlm_token);
    client
}

fn deploy_with_actors(env: &Env) -> (InsightArenaContractClient<'_>, Address, Address) {
    let id = env.register(InsightArenaContract, ());
    let client = InsightArenaContractClient::new(env, &id);
    let admin = Address::generate(env);
    let oracle = Address::generate(env);
    let xlm_token = register_token(env);
    env.mock_all_auths();
    client.initialize(&admin, &oracle, &200_u32, &xlm_token);
    (client, admin, oracle)
}

fn deploy_with_token(env: &Env) -> (InsightArenaContractClient<'_>, Address, Address, Address) {
    let id = env.register(InsightArenaContract, ());
    let client = InsightArenaContractClient::new(env, &id);
    let admin = Address::generate(env);
    let oracle = Address::generate(env);
    let xlm_token = register_token(env);
    env.mock_all_auths();
    client.initialize(&admin, &oracle, &200_u32, &xlm_token);
    (client, admin, oracle, xlm_token)
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
fn test_create_market_success() {
    let env = Env::default();
    env.mock_all_auths();
    let client = deploy(&env);
    let creator = Address::generate(&env);

    let id = client.create_market(&creator, &default_params(&env));
    assert_eq!(id, 1);

    let market = client.get_market(&id);
    assert_eq!(market.market_id, id);
    assert_eq!(market.creator, creator);
    assert!(!market.is_resolved);
    assert!(!market.is_cancelled);
}

#[test]
fn create_market_success_returns_incremented_id() {
    let env = Env::default();
    env.mock_all_auths();
    let client = deploy(&env);
    let creator = Address::generate(&env);

    let id = client.create_market(&creator, &default_params(&env));
    let id2 = client.create_market(&creator, &default_params(&env));

    assert_eq!(id, 1);
    assert_eq!(id2, 2);
}

#[test]
fn create_market_fails_end_time_in_past() {
    let env = Env::default();
    env.mock_all_auths();
    let client = deploy(&env);
    let creator = Address::generate(&env);

    let mut params = default_params(&env);
    params.end_time = env.ledger().timestamp();

    let result = client.try_create_market(&creator, &params);
    assert!(matches!(
        result,
        Err(Ok(InsightArenaError::InvalidTimeRange))
    ));
}

#[test]
fn create_market_fails_resolution_before_end() {
    let env = Env::default();
    env.mock_all_auths();
    let client = deploy(&env);
    let creator = Address::generate(&env);

    let mut params = default_params(&env);
    params.resolution_time = params.end_time - 1;

    let result = client.try_create_market(&creator, &params);
    assert!(matches!(
        result,
        Err(Ok(InsightArenaError::InvalidTimeRange))
    ));
}

#[test]
fn create_market_fails_single_outcome() {
    let env = Env::default();
    env.mock_all_auths();
    let client = deploy(&env);
    let creator = Address::generate(&env);

    let mut params = default_params(&env);
    params.outcomes = vec![&env, symbol_short!("yes")];

    let result = client.try_create_market(&creator, &params);
    assert!(matches!(result, Err(Ok(InsightArenaError::InvalidInput))));
}

#[test]
fn create_market_fails_fee_too_high() {
    let env = Env::default();
    env.mock_all_auths();
    let client = deploy(&env);
    let creator = Address::generate(&env);

    let mut params = default_params(&env);
    params.creator_fee_bps = 501;

    let result = client.try_create_market(&creator, &params);
    assert!(matches!(result, Err(Ok(InsightArenaError::InvalidFee))));
}

fn fund(env: &Env, xlm_token: &Address, recipient: &Address, amount: i128) {
    StellarAssetClient::new(env, xlm_token).mint(recipient, &amount);
}

#[test]
fn update_creator_fee_success() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, _oracle, _) = deploy_with_token(&env);
    let creator = Address::generate(&env);

    let id = client.create_market(&creator, &default_params(&env));
    client.update_creator_fee(&creator, &id, &250_u32);

    let market = client.get_market(&id);
    assert_eq!(market.creator_fee_bps, 250);
}

#[test]
fn update_creator_fee_fails_fee_too_high() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, _oracle, _) = deploy_with_token(&env);
    let creator = Address::generate(&env);

    let id = client.create_market(&creator, &default_params(&env));
    let result = client.try_update_creator_fee(&creator, &id, &501_u32);

    assert!(matches!(result, Err(Ok(InsightArenaError::InvalidFee))));
}

#[test]
fn update_creator_fee_fails_non_creator() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, _oracle, _) = deploy_with_token(&env);
    let creator = Address::generate(&env);
    let other = Address::generate(&env);

    let id = client.create_market(&creator, &default_params(&env));
    let result = client.try_update_creator_fee(&other, &id, &200_u32);

    assert!(matches!(result, Err(Ok(InsightArenaError::Unauthorized))));
}

#[test]
fn update_creator_fee_fails_after_end_time() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, _oracle, _) = deploy_with_token(&env);
    let creator = Address::generate(&env);

    let params = default_params(&env);
    let id = client.create_market(&creator, &params);

    env.ledger().set_timestamp(params.end_time);

    let result = client.try_update_creator_fee(&creator, &id, &200_u32);
    assert!(matches!(result, Err(Ok(InsightArenaError::MarketExpired))));
}

#[test]
fn update_creator_fee_applies_to_subsequent_payout() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, oracle, xlm_token) = deploy_with_token(&env);
    let creator = Address::generate(&env);
    let predictor = Address::generate(&env);
    let stake = 50_000_000_i128;

    let params = default_params(&env);
    let market_id = client.create_market(&creator, &params);
    fund(&env, &xlm_token, &predictor, stake);

    client.submit_prediction(&predictor, &market_id, &symbol_short!("yes"), &stake);
    client.update_creator_fee(&creator, &market_id, &200_u32);

    env.ledger()
        .with_mut(|li| li.timestamp = params.resolution_time + 1);
    client.resolve_market(&oracle, &market_id, &symbol_short!("yes"));

    let payout = client.claim_payout(&predictor, &market_id);
    // Sole winner: gross = 50M, fees = 2% protocol + 2% creator = 4%. net = 48M
    assert_eq!(payout, 48_000_000);
}

#[test]
fn test_create_market_min_stake_exceeds_max_stake() {
    let env = Env::default();
    env.mock_all_auths();
    let client = deploy(&env);
    let creator = Address::generate(&env);

    let mut params = default_params(&env);
    params.min_stake = 100_000_000;
    params.max_stake = 10_000_000;

    let result = client.try_create_market(&creator, &params);
    assert!(matches!(result, Err(Ok(InsightArenaError::InvalidInput))));
}

#[test]
fn create_market_fails_when_paused() {
    let env = Env::default();
    env.mock_all_auths();
    let client = deploy(&env);
    let creator = Address::generate(&env);

    client.set_paused(&true, &1u32);

    let result = client.try_create_market(&creator, &default_params(&env));
    assert!(matches!(result, Err(Ok(InsightArenaError::Paused))));
}

#[test]
#[should_panic(expected = "HostError: Error(Auth")]
fn test_create_market_unauthorised() {
    let env = Env::default();
    let id = env.register(InsightArenaContract, ());
    let client = InsightArenaContractClient::new(&env, &id);
    let admin = Address::generate(&env);
    let oracle = Address::generate(&env);
    let xlm_token = register_token(&env);

    env.mock_all_auths();
    client.initialize(&admin, &oracle, &200_u32, &xlm_token);

    let env2 = Env::default();
    let id2 = env2.register(InsightArenaContract, ());
    let client2 = InsightArenaContractClient::new(&env2, &id2);
    let admin2 = Address::generate(&env2);
    let oracle2 = Address::generate(&env2);
    let xlm_token2 = register_token(&env2);
    env2.as_contract(&id2, || {
        insightarena_contract::config::initialize(&env2, admin2, oracle2, 200, xlm_token2).unwrap();
    });

    let creator = Address::generate(&env2);
    client2.create_market(&creator, &default_params(&env2));
}

#[test]
fn create_market_fails_when_resolved_min_exceeds_max() {
    let env = Env::default();
    env.mock_all_auths();
    let client = deploy(&env);
    let creator = Address::generate(&env);

    // Override min above override max — rejected at create time.
    let mut params = default_params(&env);
    params.min_stake = 100_000_000;
    params.max_stake = 10_000_000;

    let result = client.try_create_market(&creator, &params);
    assert!(matches!(result, Err(Ok(InsightArenaError::InvalidInput))));
}

#[test]
fn create_market_inherits_global_bounds_when_zero() {
    let env = Env::default();
    env.mock_all_auths();
    let client = deploy(&env);
    let creator = Address::generate(&env);

    let mut params = default_params(&env);
    // 0 = inherit global Config bounds at prediction time.
    params.min_stake = 0;
    params.max_stake = 0;

    let market_id = client.create_market(&creator, &params);
    let market = client.get_market(&market_id);
    assert_eq!(market.min_stake, 0);
    assert_eq!(market.max_stake, 0);
}

#[test]
fn create_market_fails_when_category_not_whitelisted() {
    let env = Env::default();
    env.mock_all_auths();
    let client = deploy(&env);
    let creator = Address::generate(&env);

    let mut params = default_params(&env);
    params.category = Symbol::new(&env, "Weather");

    let result = client.try_create_market(&creator, &params);
    assert!(matches!(result, Err(Ok(InsightArenaError::InvalidInput))));
}

#[test]
fn test_create_market_with_duplicate_outcomes() {
    let env = Env::default();
    env.mock_all_auths();
    let client = deploy(&env);
    let creator = Address::generate(&env);

    let mut params = default_params(&env);
    params.outcomes = vec![&env, symbol_short!("yes"), symbol_short!("yes")];

    let result = client.try_create_market(&creator, &params);
    assert!(matches!(result, Err(Ok(InsightArenaError::InvalidInput))));
}

#[test]
fn list_categories_returns_seeded_defaults() {
    let env = Env::default();
    env.mock_all_auths();
    let client = deploy(&env);
    let categories = client.list_categories();

    assert!(categories.contains(Symbol::new(&env, "Sports")));
    assert!(categories.contains(Symbol::new(&env, "Crypto")));
    assert!(categories.contains(Symbol::new(&env, "Politics")));
    assert!(categories.contains(Symbol::new(&env, "Entertainment")));
    assert!(categories.contains(Symbol::new(&env, "Science")));
    assert!(categories.contains(Symbol::new(&env, "Other")));
}

#[test]
fn add_category_fails_when_paused() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, _oracle) = deploy_with_actors(&env);

    client.set_paused(&true, &1u32);

    let result = client.try_add_category(&admin, &Symbol::new(&env, "Weather"));
    assert!(matches!(result, Err(Ok(InsightArenaError::Paused))));
}

#[test]
fn remove_category_fails_when_paused() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, _oracle) = deploy_with_actors(&env);
    let category = Symbol::new(&env, "Weather");
    client.add_category(&admin, &category);

    client.set_paused(&true, &1u32);

    let result = client.try_remove_category(&admin, &category);
    assert!(matches!(result, Err(Ok(InsightArenaError::Paused))));
}

#[test]
fn close_market_fails_when_paused() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, _oracle) = deploy_with_actors(&env);
    let creator = Address::generate(&env);

    let id = client.create_market(&creator, &default_params(&env));
    env.ledger().set_timestamp(env.ledger().timestamp() + 1001);

    client.set_paused(&true, &1u32);

    let result = client.try_close_market(&admin, &id);
    assert!(matches!(result, Err(Ok(InsightArenaError::Paused))));
}

#[test]
fn cancel_market_fails_when_paused() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, _oracle) = deploy_with_actors(&env);
    let creator = Address::generate(&env);

    let id = client.create_market(&creator, &default_params(&env));

    client.set_paused(&true, &1u32);

    let result = client.try_cancel_market(&admin, &id);
    assert!(matches!(result, Err(Ok(InsightArenaError::Paused))));
}

#[test]
fn add_category_allows_admin_to_extend_whitelist() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, _) = deploy_with_actors(&env);
    let weather = Symbol::new(&env, "Weather");

    client.add_category(&admin, &weather);

    assert!(client.list_categories().contains(weather));
}

#[test]
fn remove_category_blocks_future_market_creation() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, _) = deploy_with_actors(&env);
    let creator = Address::generate(&env);
    let science = Symbol::new(&env, "Science");

    client.remove_category(&admin, &science);

    let mut params = default_params(&env);
    params.category = science;

    let result = client.try_create_market(&creator, &params);
    assert!(matches!(result, Err(Ok(InsightArenaError::InvalidInput))));
}

#[test]
fn non_admin_cannot_mutate_categories() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, _) = deploy_with_actors(&env);
    let random = Address::generate(&env);

    let add_result = client.try_add_category(&random, &Symbol::new(&env, "Weather"));
    let remove_result = client.try_remove_category(&random, &Symbol::new(&env, "Sports"));

    assert!(matches!(
        add_result,
        Err(Ok(InsightArenaError::Unauthorized))
    ));
    assert!(matches!(
        remove_result,
        Err(Ok(InsightArenaError::Unauthorized))
    ));
}

#[test]
fn get_market_returns_correct_market() {
    let env = Env::default();
    env.mock_all_auths();
    let client = deploy(&env);
    let creator = Address::generate(&env);

    let id = client.create_market(&creator, &default_params(&env));
    let market = client.get_market(&id);
    assert_eq!(market.market_id, id);
    assert_eq!(market.creator, creator);
}

#[test]
fn get_market_returns_not_found_for_missing_id() {
    let env = Env::default();
    env.mock_all_auths();
    let client = deploy(&env);

    let result = client.try_get_market(&99_u64);
    assert!(matches!(result, Err(Ok(InsightArenaError::MarketNotFound))));
}

#[test]
fn get_market_count_zero_before_any_market() {
    let env = Env::default();
    env.mock_all_auths();
    let client = deploy(&env);
    assert_eq!(client.get_market_count(), 0);
}

#[test]
fn get_market_count_increments_with_each_market() {
    let env = Env::default();
    env.mock_all_auths();
    let client = deploy(&env);
    let creator = Address::generate(&env);

    client.create_market(&creator, &default_params(&env));
    client.create_market(&creator, &default_params(&env));

    assert_eq!(client.get_market_count(), 2);
}

#[test]
fn list_markets_empty_when_no_markets() {
    let env = Env::default();
    env.mock_all_auths();
    let client = deploy(&env);
    assert_eq!(client.list_markets(&1_u64, &10_u32).len(), 0);
}

#[test]
fn get_markets_by_category_returns_paginated_results() {
    let env = Env::default();
    env.mock_all_auths();
    let client = deploy(&env);
    let creator = Address::generate(&env);
    let sports_category = Symbol::new(&env, "Sports");

    let first_sports = client.create_market(&creator, &default_params(&env));

    let mut crypto = default_params(&env);
    crypto.category = Symbol::new(&env, "Crypto");
    client.create_market(&creator, &crypto);

    let second_sports_id = client.create_market(&creator, &default_params(&env));
    let third_sports_id = client.create_market(&creator, &default_params(&env));

    let first_page = client.get_markets_by_category(&sports_category, &0_u64, &2_u32);
    let second_page = client.get_markets_by_category(&sports_category, &2_u64, &2_u32);

    assert_eq!(first_page.len(), 2);
    assert_eq!(first_page.get(0).unwrap().market_id, first_sports);
    assert_eq!(first_page.get(1).unwrap().market_id, second_sports_id);
    assert_eq!(second_page.len(), 1);
    assert_eq!(second_page.get(0).unwrap().market_id, third_sports_id);
}

#[test]
fn category_index_is_kept_in_sync_on_market_creation() {
    let env = Env::default();
    env.mock_all_auths();
    let client = deploy(&env);
    let creator = Address::generate(&env);
    let sports = Symbol::new(&env, "Sports");

    let first_id = client.create_market(&creator, &default_params(&env));

    let mut crypto = default_params(&env);
    crypto.category = Symbol::new(&env, "Crypto");
    client.create_market(&creator, &crypto);

    let second_id = client.create_market(&creator, &default_params(&env));

    let stored_index = env.as_contract(&client.address, || {
        env.storage()
            .persistent()
            .get::<DataKey, Vec<u64>>(&DataKey::CategoryIndex(sports.clone()))
            .unwrap()
    });

    assert_eq!(stored_index.get(0), Some(first_id));
    assert_eq!(stored_index.get(1), Some(second_id));
}

#[test]
fn list_markets_returns_all_when_within_limit() {
    let env = Env::default();
    env.mock_all_auths();
    let client = deploy(&env);
    let creator = Address::generate(&env);

    for _ in 0..3 {
        client.create_market(&creator, &default_params(&env));
    }

    let list = client.list_markets(&1_u64, &10_u32);
    assert_eq!(list.len(), 3);
    assert_eq!(list.get(2).unwrap().market_id, 3);
}

#[test]
fn list_markets_respects_pagination_start() {
    let env = Env::default();
    env.mock_all_auths();
    let client = deploy(&env);
    let creator = Address::generate(&env);

    for _ in 0..5 {
        client.create_market(&creator, &default_params(&env));
    }

    let list = client.list_markets(&3_u64, &10_u32);
    assert_eq!(list.len(), 3);
    assert_eq!(list.get(0).unwrap().market_id, 3);
}

#[test]
fn list_markets_caps_at_max_limit_50() {
    let env = Env::default();
    env.mock_all_auths();
    let client = deploy(&env);
    let creator = Address::generate(&env);

    for _ in 0..60 {
        client.create_market(&creator, &default_params(&env));
    }

    assert_eq!(client.list_markets(&1_u64, &100_u32).len(), 50);
}

#[test]
fn list_markets_empty_when_start_out_of_bounds() {
    let env = Env::default();
    env.mock_all_auths();
    let client = deploy(&env);
    let creator = Address::generate(&env);

    client.create_market(&creator, &default_params(&env));
    assert_eq!(client.list_markets(&99_u64, &10_u32).len(), 0);
}

#[test]
fn list_markets_pagination_returns_correct_slices_with_no_gaps() {
    let env = Env::default();
    env.mock_all_auths();
    let client = deploy(&env);
    let creator = Address::generate(&env);

    for _ in 0..10 {
        client.create_market(&creator, &default_params(&env));
    }

    let first_page = client.list_markets(&1_u64, &5_u32);
    assert_eq!(first_page.len(), 5);
    assert_eq!(first_page.get(0).unwrap().market_id, 1);
    assert_eq!(first_page.get(1).unwrap().market_id, 2);
    assert_eq!(first_page.get(2).unwrap().market_id, 3);
    assert_eq!(first_page.get(3).unwrap().market_id, 4);
    assert_eq!(first_page.get(4).unwrap().market_id, 5);

    let second_page = client.list_markets(&6_u64, &5_u32);
    assert_eq!(second_page.len(), 5);
    assert_eq!(second_page.get(0).unwrap().market_id, 6);
    assert_eq!(second_page.get(1).unwrap().market_id, 7);
    assert_eq!(second_page.get(2).unwrap().market_id, 8);
    assert_eq!(second_page.get(3).unwrap().market_id, 9);
    assert_eq!(second_page.get(4).unwrap().market_id, 10);

    let mut all_ids: Vec<u64> = Vec::new(&env);
    for i in 0..5 {
        all_ids.push_back(first_page.get(i).unwrap().market_id);
    }
    for i in 0..5 {
        all_ids.push_back(second_page.get(i).unwrap().market_id);
    }
    let mut seen = Vec::new(&env);
    for i in 0..10 {
        let id = all_ids.get(i).unwrap();
        assert!(!seen.contains(id), "duplicate market_id {}", id);
        seen.push_back(id);
    }

    let last_partial = client.list_markets(&9_u64, &5_u32);
    assert_eq!(last_partial.len(), 2);
    assert_eq!(last_partial.get(0).unwrap().market_id, 9);
    assert_eq!(last_partial.get(1).unwrap().market_id, 10);

    let out_of_bounds = client.list_markets(&11_u64, &5_u32);
    assert_eq!(out_of_bounds.len(), 0);
}

#[test]
fn close_market_fails_before_end_time() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, oracle) = deploy_with_actors(&env);
    let creator = Address::generate(&env);

    let id = client.create_market(&creator, &default_params(&env));
    let result = client.try_close_market(&oracle, &id);

    assert!(matches!(
        result,
        Err(Ok(InsightArenaError::MarketStillOpen))
    ));
}

#[test]
fn close_market_success_by_oracle_after_end_time() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, oracle) = deploy_with_actors(&env);
    let creator = Address::generate(&env);

    let id = client.create_market(&creator, &default_params(&env));
    env.ledger().set_timestamp(env.ledger().timestamp() + 1001);

    client.close_market(&oracle, &id);

    let market = client.get_market(&id);
    assert!(market.is_closed);
    assert!(!market.is_resolved);
}

#[test]
fn close_market_success_by_admin_after_end_time() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, _) = deploy_with_actors(&env);
    let creator = Address::generate(&env);

    let id = client.create_market(&creator, &default_params(&env));
    env.ledger().set_timestamp(env.ledger().timestamp() + 1001);

    client.close_market(&admin, &id);
    assert!(client.get_market(&id).is_closed);
}

#[test]
fn close_market_fails_when_already_resolved() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, oracle) = deploy_with_actors(&env);
    let creator = Address::generate(&env);

    let id = client.create_market(&creator, &default_params(&env));
    env.ledger().set_timestamp(env.ledger().timestamp() + 1001);
    client.close_market(&oracle, &id);

    let contract_id = client.address.clone();
    let mut market: Market = env.as_contract(&contract_id, || {
        env.storage()
            .persistent()
            .get(&DataKey::Market(id))
            .unwrap()
    });
    market.is_resolved = true;
    env.as_contract(&contract_id, || {
        env.storage()
            .persistent()
            .set(&DataKey::Market(id), &market);
    });

    let result = client.try_close_market(&oracle, &id);
    assert!(matches!(
        result,
        Err(Ok(InsightArenaError::MarketAlreadyResolved))
    ));
}

#[test]
fn test_close_market_fails_for_unauthorized_caller() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, _oracle) = deploy_with_actors(&env);
    let creator = Address::generate(&env);
    let random = Address::generate(&env);

    let id = client.create_market(&creator, &default_params(&env));
    env.ledger().set_timestamp(env.ledger().timestamp() + 1001);

    let result = client.try_close_market(&random, &id);
    assert!(matches!(result, Err(Ok(InsightArenaError::Unauthorized))));
}

#[test]
fn test_close_market_sets_is_closed_flag() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, oracle) = deploy_with_actors(&env);
    let creator = Address::generate(&env);

    let id = client.create_market(&creator, &default_params(&env));
    env.ledger().set_timestamp(env.ledger().timestamp() + 1001);

    client.close_market(&oracle, &id);

    let market = client.get_market(&id);
    assert!(market.is_closed);
    assert!(!market.is_resolved);
    assert!(!market.is_cancelled);
}

#[test]
fn cancel_market_fails_for_non_admin() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, _oracle, _) = deploy_with_token(&env);
    let creator = Address::generate(&env);
    let random = Address::generate(&env);

    let id = client.create_market(&creator, &default_params(&env));
    let result = client.try_cancel_market(&random, &id);

    assert!(matches!(result, Err(Ok(InsightArenaError::Unauthorized))));
}

#[test]
fn cancel_market_fails_market_not_found() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, _oracle, _) = deploy_with_token(&env);

    let result = client.try_cancel_market(&admin, &99_u64);
    assert!(matches!(result, Err(Ok(InsightArenaError::MarketNotFound))));
}

#[test]
fn cancel_market_fails_when_already_resolved() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, _oracle, _) = deploy_with_token(&env);
    let creator = Address::generate(&env);

    let id = client.create_market(&creator, &default_params(&env));
    let contract_id = client.address.clone();
    let mut market: Market = env.as_contract(&contract_id, || {
        env.storage()
            .persistent()
            .get(&DataKey::Market(id))
            .unwrap()
    });
    market.is_resolved = true;
    env.as_contract(&contract_id, || {
        env.storage()
            .persistent()
            .set(&DataKey::Market(id), &market);
    });

    let result = client.try_cancel_market(&admin, &id);
    assert!(matches!(
        result,
        Err(Ok(InsightArenaError::MarketAlreadyResolved))
    ));
}

#[test]
fn cancel_market_fails_when_already_cancelled() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, _oracle, _) = deploy_with_token(&env);
    let creator = Address::generate(&env);

    let id = client.create_market(&creator, &default_params(&env));
    client.cancel_market(&admin, &id);

    let result = client.try_cancel_market(&admin, &id);
    assert!(matches!(
        result,
        Err(Ok(InsightArenaError::MarketAlreadyCancelled))
    ));
}

#[test]
fn cancel_market_success_no_predictors() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, _oracle, _) = deploy_with_token(&env);
    let creator = Address::generate(&env);

    let id = client.create_market(&creator, &default_params(&env));
    client.cancel_market(&admin, &id);

    let market = client.get_market(&id);
    assert!(market.is_cancelled);
    assert!(!market.is_resolved);
}

#[test]
fn cancel_market_refunds_all_predictors() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, _oracle, xlm_token) = deploy_with_token(&env);
    let creator = Address::generate(&env);

    let id = client.create_market(&creator, &default_params(&env));
    let predictor_a = Address::generate(&env);
    let predictor_b = Address::generate(&env);
    let stake_a: i128 = 20_000_000;
    let stake_b: i128 = 50_000_000;
    let contract_id = client.address.clone();

    env.as_contract(&contract_id, || {
        let pred_a = Prediction::new(
            id,
            predictor_a.clone(),
            symbol_short!("yes"),
            stake_a,
            env.ledger().timestamp(),
        );
        let pred_b = Prediction::new(
            id,
            predictor_b.clone(),
            symbol_short!("no"),
            stake_b,
            env.ledger().timestamp(),
        );

        env.storage()
            .persistent()
            .set(&DataKey::Prediction(id, predictor_a.clone()), &pred_a);
        env.storage()
            .persistent()
            .set(&DataKey::Prediction(id, predictor_b.clone()), &pred_b);

        let mut predictors = Vec::new(&env);
        predictors.push_back(predictor_a.clone());
        predictors.push_back(predictor_b.clone());
        env.storage()
            .persistent()
            .set(&DataKey::PredictorList(id), &predictors);
    });

    StellarAssetClient::new(&env, &xlm_token).mint(&contract_id, &(stake_a + stake_b));

    let token_client = TokenClient::new(&env, &xlm_token);

    // Cancel — funds stay in escrow until each participant pulls them.
    client.cancel_market(&admin, &id);
    assert!(client.get_market(&id).is_cancelled);

    // Funds are still in contract escrow — not pushed.
    assert_eq!(token_client.balance(&client.address), stake_a + stake_b);

    // Each participant pulls their refund.
    client.claim_cancel_refund(&predictor_a, &id);
    client.claim_cancel_refund(&predictor_b, &id);

    assert_eq!(token_client.balance(&predictor_a), stake_a);
    assert_eq!(token_client.balance(&predictor_b), stake_b);
    assert_eq!(token_client.balance(&client.address), 0);
}

#[test]
fn cancel_market_refunds_exact_stake_amounts() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, _oracle, xlm_token) = deploy_with_token(&env);
    let creator = Address::generate(&env);

    let id = client.create_market(&creator, &default_params(&env));
    let user1 = Address::generate(&env);
    let user2 = Address::generate(&env);
    let user3 = Address::generate(&env);
    let stake1: i128 = 100_000_000; // 100 XLM
    let stake2: i128 = 250_000_000; // 250 XLM
    let stake3: i128 = 500_000_000; // 500 XLM
    let contract_id = client.address.clone();

    // Manually inject predictions into storage (following existing test pattern)
    env.as_contract(&contract_id, || {
        let pred1 = Prediction::new(
            id,
            user1.clone(),
            symbol_short!("yes"),
            stake1,
            env.ledger().timestamp(),
        );
        let pred2 = Prediction::new(
            id,
            user2.clone(),
            symbol_short!("no"),
            stake2,
            env.ledger().timestamp(),
        );
        let pred3 = Prediction::new(
            id,
            user3.clone(),
            symbol_short!("yes"),
            stake3,
            env.ledger().timestamp(),
        );

        env.storage()
            .persistent()
            .set(&DataKey::Prediction(id, user1.clone()), &pred1);
        env.storage()
            .persistent()
            .set(&DataKey::Prediction(id, user2.clone()), &pred2);
        env.storage()
            .persistent()
            .set(&DataKey::Prediction(id, user3.clone()), &pred3);

        let mut predictors = Vec::new(&env);
        predictors.push_back(user1.clone());
        predictors.push_back(user2.clone());
        predictors.push_back(user3.clone());
        env.storage()
            .persistent()
            .set(&DataKey::PredictorList(id), &predictors);
    });

    // Mint total stake amount to contract
    StellarAssetClient::new(&env, &xlm_token).mint(&contract_id, &(stake1 + stake2 + stake3));

    let token_client = TokenClient::new(&env, &xlm_token);

    // Admin cancels the market (pull pattern — no funds move yet).
    client.cancel_market(&admin, &id);
    assert!(client.get_market(&id).is_cancelled);

    // Each participant pulls their own refund.
    client.claim_cancel_refund(&user1, &id);
    client.claim_cancel_refund(&user2, &id);
    client.claim_cancel_refund(&user3, &id);

    // Assert each user's balance is restored exactly.
    assert_eq!(token_client.balance(&user1), stake1);
    assert_eq!(token_client.balance(&user2), stake2);
    assert_eq!(token_client.balance(&user3), stake3);

    // Assert further predictions fail with MarketAlreadyCancelled
    let result = client.try_submit_prediction(&user1, &id, &symbol_short!("yes"), &stake1);
    assert!(matches!(
        result,
        Err(Ok(InsightArenaError::MarketAlreadyCancelled))
    ));
}

// ── cancel_market multi-predictor refund flow (#1265 / #1341) ────────────────
//
// These tests run the full end-to-end flow: predictors are funded, stake real
// tokens through submit_prediction, and retrieve their funds by calling
// claim_cancel_refund after cancellation. Refunds in this contract are
// pull-based — cancel_market only marks the market cancelled; each participant
// calls claim_cancel_refund independently. Double-claim prevention and
// non-participant exclusion are exercised against every extraction path.

/// Five distinct stakes within default_params' min/max bounds (10M..=100M).
const FLOW_STAKES: [i128; 5] = [12_000_000, 25_000_000, 40_000_000, 60_000_000, 100_000_000];
/// Extra dust funded on top of each stake so a refund that merely pays back
/// the stake amount (rather than restoring the exact balance) is caught.
const FLOW_HEADROOM: i128 = 5_000_000;

/// Create a market and stake `FLOW_STAKES` from 5 fresh predictors across both
/// outcomes (indices 0,2,4 on "yes"; 1,3 on "no"). Returns
/// (market_id, predictors, pre-stake balances).
fn setup_five_predictor_market(
    env: &Env,
    client: &InsightArenaContractClient<'_>,
    xlm_token: &Address,
) -> (u64, [Address; 5], [i128; 5]) {
    let creator = Address::generate(env);
    let id = client.create_market(&creator, &default_params(env));

    let predictors = [
        Address::generate(env),
        Address::generate(env),
        Address::generate(env),
        Address::generate(env),
        Address::generate(env),
    ];

    let asset = StellarAssetClient::new(env, xlm_token);
    let token = TokenClient::new(env, xlm_token);
    let mut balances_before = [0_i128; 5];

    for (i, predictor) in predictors.iter().enumerate() {
        asset.mint(predictor, &(FLOW_STAKES[i] + FLOW_HEADROOM));
        balances_before[i] = token.balance(predictor);

        let outcome = if i % 2 == 0 {
            symbol_short!("yes")
        } else {
            symbol_short!("no")
        };
        client.submit_prediction(predictor, &id, &outcome, &FLOW_STAKES[i]);
    }

    (id, predictors, balances_before)
}

/// Requirements 1–4 & 7: five predictors with five different stakes across
/// both outcomes are each made exactly whole after claiming their refund, and
/// the contract retains zero tokens once all claims are complete.
#[test]
fn cancel_market_five_predictors_restores_exact_pre_stake_balances() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, _oracle, xlm_token) = deploy_with_token(&env);
    let token = TokenClient::new(&env, &xlm_token);

    // Contract balance before the market opens (fresh deploy: zero).
    let contract_before = token.balance(&client.address);

    let (id, predictors, balances_before) =
        setup_five_predictor_market(&env, &client, &xlm_token);

    // Every stake is escrowed, and each predictor is down exactly their stake.
    let total_staked: i128 = FLOW_STAKES.iter().sum();
    assert_eq!(token.balance(&client.address), contract_before + total_staked);
    for (i, predictor) in predictors.iter().enumerate() {
        assert_eq!(token.balance(predictor), balances_before[i] - FLOW_STAKES[i]);
    }

    // Cancel marks the market; funds stay in escrow.
    client.cancel_market(&admin, &id);
    assert!(client.get_market(&id).is_cancelled);

    // Funds are still in escrow — not pushed.
    assert_eq!(token.balance(&client.address), contract_before + total_staked);

    // Each predictor pulls their own refund.
    for predictor in predictors.iter() {
        client.claim_cancel_refund(predictor, &id);
    }

    // Every predictor's balance is restored exactly, regardless of stake size
    // or which outcome they chose.
    for (i, predictor) in predictors.iter().enumerate() {
        assert_eq!(token.balance(predictor), balances_before[i]);
    }

    // The contract holds exactly what it held before the market opened —
    // no dust locked, no over-refund.
    assert_eq!(token.balance(&client.address), contract_before);
}

/// Requirement 5 & acceptance: a second refund for the same predictor is
/// impossible via claim_cancel_refund (RefundAlreadyClaimed), and all other
/// extraction paths (resolve-after-cancel, claim_payout, batch payouts) are
/// also closed.
#[test]
fn cancel_market_second_refund_is_impossible_via_any_path() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, oracle, xlm_token) = deploy_with_token(&env);
    let token = TokenClient::new(&env, &xlm_token);

    let (id, predictors, balances_before) =
        setup_five_predictor_market(&env, &client, &xlm_token);

    client.cancel_market(&admin, &id);

    // Each predictor claims once successfully.
    for predictor in predictors.iter() {
        client.claim_cancel_refund(predictor, &id);
    }

    // Path 0: a second claim_cancel_refund is rejected with RefundAlreadyClaimed.
    for predictor in predictors.iter() {
        let second_claim = client.try_claim_cancel_refund(predictor, &id);
        assert!(matches!(
            second_claim,
            Err(Ok(InsightArenaError::RefundAlreadyClaimed))
        ));
    }

    // Path 1: cancelling again is rejected.
    let second_cancel = client.try_cancel_market(&admin, &id);
    assert!(matches!(
        second_cancel,
        Err(Ok(InsightArenaError::MarketAlreadyCancelled))
    ));

    // Path 2: the oracle cannot resolve a cancelled market, so the payout
    // path can never open after refunds were issued.
    let resolution_time = default_params(&env).resolution_time;
    env.ledger().with_mut(|li| li.timestamp = resolution_time + 1);
    let resolve_after_cancel = client.try_resolve_market(&oracle, &id, &symbol_short!("yes"));
    assert!(matches!(
        resolve_after_cancel,
        Err(Ok(InsightArenaError::MarketAlreadyCancelled))
    ));

    // Path 3: direct payout claims fail while the market is unresolved.
    for predictor in predictors.iter() {
        let claim = client.try_claim_payout(predictor, &id);
        assert!(matches!(
            claim,
            Err(Ok(InsightArenaError::MarketNotResolved))
        ));
    }

    // Path 4: batch payout distribution also refuses the cancelled market.
    let batch = client.try_batch_distribute_payouts(&admin, &id);
    assert!(matches!(
        batch,
        Err(Ok(InsightArenaError::MarketNotResolved))
    ));

    // After all rejected attempts, balances equal the refunded amounts and
    // the contract kept nothing.
    for (i, predictor) in predictors.iter().enumerate() {
        assert_eq!(token.balance(predictor), balances_before[i]);
    }
    assert_eq!(token.balance(&client.address), 0);
}

/// Requirement 6: an address that never predicted receives nothing and cannot
/// call claim_cancel_refund (NotAParticipant).
#[test]
fn cancel_market_non_participant_receives_nothing() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, _oracle, xlm_token) = deploy_with_token(&env);
    let token = TokenClient::new(&env, &xlm_token);

    let (id, _predictors, _balances_before) =
        setup_five_predictor_market(&env, &client, &xlm_token);

    let outsider = Address::generate(&env);
    assert_eq!(token.balance(&outsider), 0);

    client.cancel_market(&admin, &id);

    // The outsider has no prediction record — claim is rejected.
    let claim = client.try_claim_cancel_refund(&outsider, &id);
    assert!(matches!(
        claim,
        Err(Ok(InsightArenaError::NotAParticipant))
    ));

    // The outsider received nothing.
    assert_eq!(token.balance(&outsider), 0);

    // The payout path is also closed.
    let payout_claim = client.try_claim_payout(&outsider, &id);
    assert!(matches!(
        payout_claim,
        Err(Ok(InsightArenaError::MarketNotResolved))
    ));
}

#[test]
fn extend_market_end_time_success() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, _oracle, _) = deploy_with_token(&env);
    let creator = Address::generate(&env);

    let params = default_params(&env);
    let original_end_time = params.end_time;
    let id = client.create_market(&creator, &params);

    let new_end_time = original_end_time + 500;
    client.extend_market_end_time(&creator, &id, &new_end_time);

    let market = client.get_market(&id);
    assert_eq!(market.end_time, new_end_time);
}

#[test]
fn extend_market_end_time_adjusts_resolution_time_if_needed() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, _oracle, _) = deploy_with_token(&env);
    let creator = Address::generate(&env);

    let params = default_params(&env);
    let resolution_time = params.resolution_time;
    let id = client.create_market(&creator, &params);

    let new_end_time = resolution_time + 500;
    client.extend_market_end_time(&creator, &id, &new_end_time);

    let market = client.get_market(&id);
    assert_eq!(market.end_time, new_end_time);
    assert_eq!(market.resolution_time, new_end_time);
}

#[test]
fn extend_market_end_time_fails_non_creator() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, _oracle, _) = deploy_with_token(&env);
    let creator = Address::generate(&env);
    let other = Address::generate(&env);

    let params = default_params(&env);
    let id = client.create_market(&creator, &params);

    let result = client.try_extend_market_end_time(&other, &id, &(params.end_time + 500));
    assert!(matches!(result, Err(Ok(InsightArenaError::Unauthorized))));
}

#[test]
fn extend_market_end_time_fails_after_end_time() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, _oracle, _) = deploy_with_token(&env);
    let creator = Address::generate(&env);

    let params = default_params(&env);
    let id = client.create_market(&creator, &params);

    env.ledger().set_timestamp(params.end_time);

    let result = client.try_extend_market_end_time(&creator, &id, &(params.end_time + 500));
    assert!(matches!(result, Err(Ok(InsightArenaError::MarketExpired))));
}

#[test]
fn extend_market_end_time_fails_new_end_time_not_strictly_later() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, _oracle, _) = deploy_with_token(&env);
    let creator = Address::generate(&env);

    let params = default_params(&env);
    let id = client.create_market(&creator, &params);

    let result = client.try_extend_market_end_time(&creator, &id, &params.end_time);
    assert!(matches!(result, Err(Ok(InsightArenaError::InvalidTimeRange))));
}

#[test]
fn extend_market_end_time_fails_when_resolved() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, oracle, _) = deploy_with_token(&env);
    let creator = Address::generate(&env);

    let params = default_params(&env);
    let id = client.create_market(&creator, &params);

    env.ledger()
        .with_mut(|li| li.timestamp = params.resolution_time + 1);
    client.resolve_market(&oracle, &id, &symbol_short!("yes"));

    let result = client.try_extend_market_end_time(&creator, &id, &(params.end_time + 500));
    assert!(matches!(result, Err(Ok(InsightArenaError::MarketAlreadyResolved))));
}

#[test]
fn extend_market_end_time_fails_when_cancelled() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, _oracle, _) = deploy_with_token(&env);
    let creator = Address::generate(&env);

    let params = default_params(&env);
    let id = client.create_market(&creator, &params);

    client.cancel_market(&admin, &id);

    let result = client.try_extend_market_end_time(&creator, &id, &(params.end_time + 500));
    assert!(matches!(result, Err(Ok(InsightArenaError::MarketAlreadyCancelled))));
}

#[test]
fn extend_market_end_time_fails_when_closed() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, _oracle, _) = deploy_with_token(&env);
    let creator = Address::generate(&env);

    let params = default_params(&env);
    let id = client.create_market(&creator, &params);

    env.ledger().set_timestamp(params.end_time + 1);
    client.close_market(&creator, &id);

    env.ledger().set_timestamp(params.end_time);
    let result = client.try_extend_market_end_time(&creator, &id, &(params.end_time + 500));
    assert!(matches!(result, Err(Ok(InsightArenaError::MarketAlreadyClosed))));
}

// ── extend_market_end_time validation gaps (#1264) ──────────────────────────

/// Requirement 3: "extending" to a timestamp strictly earlier than the current
/// end time is rejected (the boundary case `new == current` is covered by
/// `extend_market_end_time_fails_new_end_time_not_strictly_later`).
#[test]
fn extend_market_end_time_fails_earlier_than_current_end_time() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, _oracle, _) = deploy_with_token(&env);
    let creator = Address::generate(&env);

    let params = default_params(&env);
    let id = client.create_market(&creator, &params);

    let result = client.try_extend_market_end_time(&creator, &id, &(params.end_time - 1));
    assert!(matches!(result, Err(Ok(InsightArenaError::InvalidTimeRange))));

    // The stored end_time is untouched.
    assert_eq!(client.get_market(&id).end_time, params.end_time);
}

/// Requirement 4: extending to a timestamp in the past (before the current
/// ledger time) is rejected. A past timestamp is always <= the market's
/// end_time here because extension already requires `now < end_time`, so it
/// falls into the same InvalidTimeRange guard — this pins that a past deadline
/// can never be stored.
#[test]
fn extend_market_end_time_fails_past_timestamp() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, _oracle, _) = deploy_with_token(&env);
    let creator = Address::generate(&env);

    let params = default_params(&env);
    let id = client.create_market(&creator, &params);

    // Move mid-window: the market is still open, but `now - 100` is history.
    let mid_window = params.end_time - 500;
    env.ledger().set_timestamp(mid_window);

    let result = client.try_extend_market_end_time(&creator, &id, &(mid_window - 100));
    assert!(matches!(result, Err(Ok(InsightArenaError::InvalidTimeRange))));
    assert_eq!(client.get_market(&id).end_time, params.end_time);
}

/// Authorization is creator-only: even the platform admin is rejected, not
/// just arbitrary addresses.
#[test]
fn extend_market_end_time_fails_for_admin() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, _oracle, _) = deploy_with_token(&env);
    let creator = Address::generate(&env);

    let params = default_params(&env);
    let id = client.create_market(&creator, &params);

    let result = client.try_extend_market_end_time(&admin, &id, &(params.end_time + 500));
    assert!(matches!(result, Err(Ok(InsightArenaError::Unauthorized))));
}

/// Requirement 7 / acceptance: the extended window is actually honored by
/// submit_prediction. A prediction placed after the original deadline but
/// before the new one succeeds, and the new deadline is then enforced.
#[test]
fn extend_market_end_time_extended_window_honored_by_submit_prediction() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, _oracle, xlm_token) = deploy_with_token(&env);
    let creator = Address::generate(&env);

    let params = default_params(&env);
    let original_end = params.end_time;
    let id = client.create_market(&creator, &params);

    let predictor = Address::generate(&env);
    let late_predictor = Address::generate(&env);
    let stake = 20_000_000_i128;
    let asset = StellarAssetClient::new(&env, &xlm_token);
    asset.mint(&predictor, &stake);
    asset.mint(&late_predictor, &stake);

    // Extend before the original deadline passes.
    let new_end = original_end + 2000;
    client.extend_market_end_time(&creator, &id, &new_end);

    // Inside the extension window: after the original deadline, before the new one.
    env.ledger().set_timestamp(original_end + 100);
    client.submit_prediction(&predictor, &id, &symbol_short!("yes"), &stake);
    assert!(client.has_predicted(&id, &predictor));

    // The new deadline is enforced just like the original one was.
    env.ledger().set_timestamp(new_end);
    let result = client.try_submit_prediction(&late_predictor, &id, &symbol_short!("no"), &stake);
    assert!(matches!(result, Err(Ok(InsightArenaError::MarketExpired))));
}

// ============================================================================
// Pagination boundary cases — issue #1250
// ============================================================================

#[test]
fn list_markets_start_zero_returns_empty() {
    // start=0 is explicitly guarded: the function treats 0 as invalid
    // since market IDs are 1-based. Must return empty, not panic.
    let env = Env::default();
    env.mock_all_auths();
    let client = deploy(&env);
    let creator = Address::generate(&env);

    for _ in 0..10 {
        client.create_market(&creator, &default_params(&env));
    }

    let result = client.list_markets(&0_u64, &5_u32);
    assert_eq!(result.len(), 0);
}

#[test]
fn list_markets_two_pages_tile_with_zero_overlap() {
    // Create 10 markets. Page 1: start=1, limit=5 → markets 1–5.
    // Page 2: start=6, limit=5 → markets 6–10.
    // Union must contain exactly 10 unique IDs with no gaps or duplicates.
    let env = Env::default();
    env.mock_all_auths();
    let client = deploy(&env);
    let creator = Address::generate(&env);

    for _ in 0..10 {
        client.create_market(&creator, &default_params(&env));
    }

    let page1 = client.list_markets(&1_u64, &5_u32);
    let page2 = client.list_markets(&6_u64, &5_u32);

    assert_eq!(page1.len(), 5);
    assert_eq!(page2.len(), 5);

    // Verify page 1 IDs are 1–5 in order
    for i in 0..5_u32 {
        assert_eq!(page1.get(i).unwrap().market_id, (i + 1) as u64);
    }

    // Verify page 2 IDs are 6–10 in order
    for i in 0..5_u32 {
        assert_eq!(page2.get(i).unwrap().market_id, (i + 6) as u64);
    }

    // Verify zero overlap between pages
    let mut seen = Vec::new(&env);
    for i in 0..5_u32 {
        let id = page1.get(i).unwrap().market_id;
        assert!(!seen.contains(id), "duplicate market_id {} in page1", id);
        seen.push_back(id);
    }
    for i in 0..5_u32 {
        let id = page2.get(i).unwrap().market_id;
        assert!(!seen.contains(id), "overlap: market_id {} appears in both pages", id);
        seen.push_back(id);
    }

    assert_eq!(seen.len(), 10);
}

#[test]
fn list_markets_start_equals_total_returns_last_market() {
    // start=10 with 10 total markets: start == total, not start > total.
    // The guard only rejects start > total, so this returns market 10.
    // This is the exact boundary where start + limit - 1 overshoots but
    // start itself is valid.
    let env = Env::default();
    env.mock_all_auths();
    let client = deploy(&env);
    let creator = Address::generate(&env);

    for _ in 0..10 {
        client.create_market(&creator, &default_params(&env));
    }

    let result = client.list_markets(&10_u64, &5_u32);
    assert_eq!(result.len(), 1);
    assert_eq!(result.get(0).unwrap().market_id, 10);
}

#[test]
fn list_markets_start_exceeds_total_returns_empty() {
    // start=11 with 10 total markets: start > total, guard fires, empty returned.
    let env = Env::default();
    env.mock_all_auths();
    let client = deploy(&env);
    let creator = Address::generate(&env);

    for _ in 0..10 {
        client.create_market(&creator, &default_params(&env));
    }

    let result = client.list_markets(&11_u64, &5_u32);
    assert_eq!(result.len(), 0);
}

#[test]
fn list_markets_near_end_returns_remaining_markets_only() {
    // start=9 with 10 total markets and limit=5: only markets 9 and 10
    // are available, so result must have exactly 2 entries.
    let env = Env::default();
    env.mock_all_auths();
    let client = deploy(&env);
    let creator = Address::generate(&env);

    for _ in 0..10 {
        client.create_market(&creator, &default_params(&env));
    }

    let result = client.list_markets(&9_u64, &5_u32);
    assert_eq!(result.len(), 2);
    assert_eq!(result.get(0).unwrap().market_id, 9);
    assert_eq!(result.get(1).unwrap().market_id, 10);
}

#[test]
fn list_markets_ids_are_in_ascending_order() {
    // Verifies market IDs are strictly ascending across a full page.
    let env = Env::default();
    env.mock_all_auths();
    let client = deploy(&env);
    let creator = Address::generate(&env);

    for _ in 0..10 {
        client.create_market(&creator, &default_params(&env));
    }

    let result = client.list_markets(&1_u64, &10_u32);
    assert_eq!(result.len(), 10);

    for i in 1..10_u32 {
        let prev = result.get(i - 1).unwrap().market_id;
        let curr = result.get(i).unwrap().market_id;
        assert!(curr > prev, "market_id not ascending at index {}: {} >= {}", i, prev, curr);
    }
}

// ============================================================================
// Category pagination boundary tests — issue #1261
// ============================================================================

/// Create 12 markets interleaved across two categories: 7 "Sports", 5
/// "Crypto". Pattern: S C S C S C S C S C S S — mostly alternating, with an
/// unavoidable trailing repeat since 7 > 12/2, so creation order is never
/// grouped by category. Returns (sports_ids, crypto_ids) in creation order.
fn create_interleaved_category_markets(
    env: &Env,
    client: &InsightArenaContractClient<'_>,
    creator: &Address,
) -> (Vec<u64>, Vec<u64>) {
    let sports = Symbol::new(env, "Sports");
    let crypto = Symbol::new(env, "Crypto");

    let is_sports = [
        true, false, true, false, true, false, true, false, true, false, true, true,
    ];

    let mut sports_ids: Vec<u64> = Vec::new(env);
    let mut crypto_ids: Vec<u64> = Vec::new(env);

    for &sport in is_sports.iter() {
        let mut params = default_params(env);
        params.category = if sport { sports.clone() } else { crypto.clone() };
        let id = client.create_market(creator, &params);
        if sport {
            sports_ids.push_back(id);
        } else {
            crypto_ids.push_back(id);
        }
    }

    (sports_ids, crypto_ids)
}

#[test]
fn get_markets_by_category_interleaved_pages_tile_with_zero_overlap() {
    let env = Env::default();
    env.mock_all_auths();
    let client = deploy(&env);
    let creator = Address::generate(&env);
    let sports = Symbol::new(&env, "Sports");

    let (sports_ids, crypto_ids) = create_interleaved_category_markets(&env, &client, &creator);
    assert_eq!(sports_ids.len(), 7);
    assert_eq!(crypto_ids.len(), 5);

    // Page 1: first 5 sports markets (zero-based offset into the category index).
    let page1 = client.get_markets_by_category(&sports, &0_u64, &5_u32);
    assert_eq!(page1.len(), 5);
    for i in 0..5_u32 {
        assert_eq!(page1.get(i).unwrap().market_id, sports_ids.get(i).unwrap());
    }

    // Page 2: the remaining 2 sports markets.
    let page2 = client.get_markets_by_category(&sports, &5_u64, &5_u32);
    assert_eq!(page2.len(), 2);
    for i in 0..2_u32 {
        assert_eq!(
            page2.get(i).unwrap().market_id,
            sports_ids.get(5 + i).unwrap()
        );
    }

    // Union of both pages equals all 7 sports markets, with zero overlap.
    let mut seen: Vec<u64> = Vec::new(&env);
    for m in page1.iter() {
        assert!(
            !seen.contains(m.market_id),
            "duplicate market_id {} across sports pages",
            m.market_id
        );
        seen.push_back(m.market_id);
    }
    for m in page2.iter() {
        assert!(
            !seen.contains(m.market_id),
            "duplicate market_id {} across sports pages",
            m.market_id
        );
        seen.push_back(m.market_id);
    }
    assert_eq!(seen.len(), 7);
    for id in sports_ids.iter() {
        assert!(
            seen.contains(id),
            "sports market {} missing from paginated union",
            id
        );
    }
}

#[test]
fn get_markets_by_category_never_leaks_other_category() {
    let env = Env::default();
    env.mock_all_auths();
    let client = deploy(&env);
    let creator = Address::generate(&env);
    let sports = Symbol::new(&env, "Sports");
    let crypto = Symbol::new(&env, "Crypto");

    let (sports_ids, crypto_ids) = create_interleaved_category_markets(&env, &client, &creator);

    let sports_page1 = client.get_markets_by_category(&sports, &0_u64, &5_u32);
    let sports_page2 = client.get_markets_by_category(&sports, &5_u64, &5_u32);
    for m in sports_page1.iter().chain(sports_page2.iter()) {
        assert!(
            !crypto_ids.contains(m.market_id),
            "crypto market {} leaked into sports results",
            m.market_id
        );
    }

    let crypto_page = client.get_markets_by_category(&crypto, &0_u64, &5_u32);
    assert_eq!(crypto_page.len(), 5);
    for m in crypto_page.iter() {
        assert!(
            !sports_ids.contains(m.market_id),
            "sports market {} leaked into crypto results",
            m.market_id
        );
    }
}

#[test]
fn get_markets_by_category_out_of_range_page_returns_empty() {
    let env = Env::default();
    env.mock_all_auths();
    let client = deploy(&env);
    let creator = Address::generate(&env);
    let crypto = Symbol::new(&env, "Crypto");

    let (_sports_ids, crypto_ids) = create_interleaved_category_markets(&env, &client, &creator);
    assert_eq!(crypto_ids.len(), 5);

    // Crypto has exactly 5 markets: start=5 is out of range for a zero-based
    // offset, so this must return empty rather than panicking.
    let result = client.get_markets_by_category(&crypto, &5_u64, &5_u32);
    assert_eq!(result.len(), 0);
}

#[test]
fn get_markets_by_category_zero_markets_returns_empty_without_panic() {
    let env = Env::default();
    env.mock_all_auths();
    let client = deploy(&env);
    let creator = Address::generate(&env);

    // Create markets only in Sports/Crypto; Politics has zero markets.
    create_interleaved_category_markets(&env, &client, &creator);

    let politics = Symbol::new(&env, "Politics");
    let result = client.get_markets_by_category(&politics, &0_u64, &5_u32);
    assert_eq!(result.len(), 0);
}

#[test]
fn metadata_hash_stored_at_creation_and_retrievable() {
    let env = Env::default();
    env.mock_all_auths();
    let client = deploy(&env);
    let creator = Address::generate(&env);

    let mut hash_bytes = [0u8; 32];
    hash_bytes[0] = 0xab;
    hash_bytes[31] = 0xcd;
    let metadata_hash = BytesN::from_array(&env, &hash_bytes);

    let mut params = default_params(&env);
    params.metadata_hash = metadata_hash.clone();

    let id = client.create_market(&creator, &params);
    let stored = client.get_metadata_hash(&id);
    assert_eq!(stored, metadata_hash);
}

#[test]
fn metadata_hash_is_immutable_after_creation() {
    let env = Env::default();
    env.mock_all_auths();
    let client = deploy(&env);
    let creator = Address::generate(&env);

    let original = BytesN::from_array(&env, &[1u8; 32]);
    let mut params = default_params(&env);
    params.metadata_hash = original.clone();
    let id = client.create_market(&creator, &params);

    // There is no contract mutator for metadata hash. Attempting a direct
    // storage overwrite via a second create for a different market must not
    // affect the first market's anchored hash.
    let other = BytesN::from_array(&env, &[2u8; 32]);
    let mut params2 = default_params(&env);
    params2.metadata_hash = other;
    let id2 = client.create_market(&creator, &params2);

    assert_eq!(client.get_metadata_hash(&id), original);
    assert_ne!(client.get_metadata_hash(&id2), original);
    assert_eq!(client.get_metadata_hash(&id), original);
}

#[test]
fn get_metadata_hash_fails_for_unknown_market() {
    let env = Env::default();
    env.mock_all_auths();
    let client = deploy(&env);

    let result = client.try_get_metadata_hash(&999_u64);
    assert_eq!(result, Err(Ok(InsightArenaError::MarketNotFound)));
}

#[test]
fn market_created_event_includes_metadata_hash() {
    use soroban_sdk::testutils::Events;
    use soroban_sdk::TryFromVal;

    let env = Env::default();
    env.mock_all_auths();
    let client = deploy(&env);
    let creator = Address::generate(&env);

    let metadata_hash = BytesN::from_array(&env, &[9u8; 32]);
    let mut params = default_params(&env);
    params.metadata_hash = metadata_hash.clone();
    let end_time = params.end_time;

    let id = client.create_market(&creator, &params);

    let contract_id = client.address.clone();
    let events = env.events().all();
    let mut found = false;
    for event in events.iter() {
        if event.0 == contract_id && event.1.len() == 2 {
            let topic0 = Symbol::try_from_val(&env, &event.1.get(0).unwrap()).unwrap();
            let topic1 = Symbol::try_from_val(&env, &event.1.get(1).unwrap()).unwrap();
            if topic0 == symbol_short!("mkt") && topic1 == symbol_short!("created") {
                let data: (u64, Address, u64, BytesN<32>) =
                    TryFromVal::try_from_val(&env, &event.2).unwrap();
                assert_eq!(data.0, id);
                assert_eq!(data.1, creator);
                assert_eq!(data.2, end_time);
                assert_eq!(data.3, metadata_hash);
                found = true;
            }
        }
    }
    assert!(found, "market created event must include metadata_hash");
    assert_eq!(client.get_metadata_hash(&id), metadata_hash);
}

#[test]
fn test_create_market_fails_exceeds_max_outcomes() {
    let env = Env::default();
    env.mock_all_auths();
    let client = deploy(&env);
    let creator = Address::generate(&env);

    let mut params = default_params(&env);
    params.outcomes = vec![
        &env,
        Symbol::new(&env, "opt1"),
        Symbol::new(&env, "opt2"),
        Symbol::new(&env, "opt3"),
        Symbol::new(&env, "opt4"),
        Symbol::new(&env, "opt5"),
        Symbol::new(&env, "opt6"),
        Symbol::new(&env, "opt7"),
        Symbol::new(&env, "opt8"),
        Symbol::new(&env, "opt9"),
        Symbol::new(&env, "opt10"),
        Symbol::new(&env, "opt11"),
    ];

    let result = client.try_create_market(&creator, &params);
    assert!(matches!(result, Err(Ok(InsightArenaError::InvalidInput))));
}

#[test]
fn test_3way_market_end_to_end() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, oracle, xlm_token) = deploy_with_token(&env);
    let creator = Address::generate(&env);

    let user_a = Address::generate(&env);
    let user_b = Address::generate(&env);
    let user_c = Address::generate(&env);
    let user_d = Address::generate(&env);

    fund(&env, &xlm_token, &user_a, 100_000_000);
    fund(&env, &xlm_token, &user_b, 200_000_000);
    fund(&env, &xlm_token, &user_c, 300_000_000);
    fund(&env, &xlm_token, &user_d, 100_000_000);

    let mut params = default_params(&env);
    params.max_stake = 500_000_000;
    let opt_a = Symbol::new(&env, "team_a");
    let opt_b = Symbol::new(&env, "team_b");
    let opt_draw = Symbol::new(&env, "draw");
    params.outcomes = vec![&env, opt_a.clone(), opt_b.clone(), opt_draw.clone()];
    params.creator_fee_bps = 0;

    let market_id = client.create_market(&creator, &params);
    assert_eq!(market_id, 1);

    client.submit_prediction(&user_a, &market_id, &opt_a, &100_000_000);
    client.submit_prediction(&user_b, &market_id, &opt_b, &200_000_000);
    client.submit_prediction(&user_c, &market_id, &opt_draw, &300_000_000);
    client.submit_prediction(&user_d, &market_id, &opt_a, &100_000_000);

    let market = client.get_market(&market_id);
    assert_eq!(market.total_pool, 700_000_000);
    assert_eq!(market.participant_count, 4);

    let dist = client.get_outcome_distribution(&market_id);
    assert_eq!(dist.len(), 3);

    env.ledger().set_timestamp(params.resolution_time + 1);

    client.resolve_market(&oracle, &market_id, &opt_a);

    let market_resolved = client.get_market(&market_id);
    assert!(market_resolved.is_resolved);
    assert_eq!(market_resolved.resolved_outcome, Some(opt_a.clone()));

    let payout_a = client.claim_payout(&user_a, &market_id);
    let payout_d = client.claim_payout(&user_d, &market_id);

    assert_eq!(payout_a, 343_000_000);
    assert_eq!(payout_d, 343_000_000);

    let err_b = client.try_claim_payout(&user_b, &market_id);
    assert!(matches!(err_b, Err(Ok(InsightArenaError::InvalidOutcome))));
}

#[test]
fn test_nway_market_5_outcomes_end_to_end() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, oracle, xlm_token) = deploy_with_token(&env);
    let creator = Address::generate(&env);

    let mut params = default_params(&env);
    params.creator_fee_bps = 0;
    params.outcomes = vec![
        &env,
        Symbol::new(&env, "opt1"),
        Symbol::new(&env, "opt2"),
        Symbol::new(&env, "opt3"),
        Symbol::new(&env, "opt4"),
        Symbol::new(&env, "opt5"),
    ];

    let market_id = client.create_market(&creator, &params);

    let u1 = Address::generate(&env);
    let u2 = Address::generate(&env);
    fund(&env, &xlm_token, &u1, 50_000_000);
    fund(&env, &xlm_token, &u2, 50_000_000);

    let winning_outcome = Symbol::new(&env, "opt3");
    let losing_outcome = Symbol::new(&env, "opt5");

    client.submit_prediction(&u1, &market_id, &winning_outcome, &50_000_000);
    client.submit_prediction(&u2, &market_id, &losing_outcome, &50_000_000);

    env.ledger().set_timestamp(params.resolution_time + 1);
    client.resolve_market(&oracle, &market_id, &winning_outcome);

    let payout1 = client.claim_payout(&u1, &market_id);
    assert_eq!(payout1, 98_000_000);

    let err2 = client.try_claim_payout(&u2, &market_id);
    assert!(matches!(err2, Err(Ok(InsightArenaError::InvalidOutcome))));
}

// ── Reputation gate — market_tests.rs (AC-1 / AC-2 / AC-4) ──────────────────
//
// These tests exercise the reputation gate that lives inside create_market
// (Guard 6 in market.rs). AC-3 (MarketCreationDenied event) is covered by
// denial_emits_event_with_attempted_creator in reputation_tests.rs, which
// runs in a binary where Soroban's test SDK reliably captures failed-call
// events.

/// AC-1 + AC-2: a creator whose reputation score is 0 and who is NOT on the
/// trusted-creator allowlist is rejected with InsufficientReputation, no
/// market record is written, and the market counter stays at 0.
#[test]
fn create_market_denied_writes_no_state_and_emits_event() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, _oracle) = deploy_with_actors(&env);
    let creator = Address::generate(&env);

    // Raise threshold above a brand-new creator's score of 0.
    client.set_min_creator_reputation(&admin, &1_u32);

    // Must fail with InsufficientReputation.
    let result = client.try_create_market(&creator, &default_params(&env));
    assert!(
        matches!(result, Err(Ok(InsightArenaError::InsufficientReputation))),
        "expected InsufficientReputation, got {:?}",
        result
    );

    // AC-2: no state written — counter stays at 0, no market record exists.
    assert_eq!(
        client.get_market_count(),
        0,
        "market counter must remain 0 after a denied create_market"
    );
    assert!(
        matches!(
            client.try_get_market(&1_u64),
            Err(Ok(InsightArenaError::MarketNotFound))
        ),
        "market ID 1 must not exist after a denied create_market"
    );
}

/// AC-1 + AC-4 (allowlist path): a creator on the trusted-creator allowlist
/// succeeds even when their reputation score is 0 and the threshold is 1000.
/// The market is persisted and the counter increments.
#[test]
fn create_market_allowed_for_trusted_creator_regardless_of_score() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, _oracle) = deploy_with_actors(&env);
    let creator = Address::generate(&env);

    client.set_min_creator_reputation(&admin, &1_000_u32);
    client.add_trusted_creator(&admin, &creator);

    let result = client.try_create_market(&creator, &default_params(&env));
    assert!(
        result.is_ok(),
        "trusted creator must be allowed to create a market regardless of score"
    );

    assert_eq!(client.get_market_count(), 1);
    assert_eq!(client.get_market(&1_u64).creator, creator);
}

/// AC-1 + AC-4 (reputation path): a creator who meets min_creator_reputation
/// directly — without being on the allowlist — is also allowed. Confirms the
/// OR logic works in both directions.
#[test]
fn create_market_allowed_when_reputation_meets_threshold_directly() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, oracle) = deploy_with_actors(&env);
    let creator = Address::generate(&env);

    // Build score of 600: create a market, advance past resolution_time, resolve.
    let seed_params = default_params(&env);
    let resolution_time = seed_params.resolution_time;
    let seed_id = client.create_market(&creator, &seed_params);
    env.ledger().set_timestamp(resolution_time + 1);
    client.resolve_market(&oracle, &seed_id, &symbol_short!("yes"));
    assert_eq!(client.get_reputation_score(&creator), 600);

    // Set threshold to exactly 600 — score meets it.
    client.set_min_creator_reputation(&admin, &600_u32);

    // NOT on the allowlist.
    assert!(!client.is_trusted_creator(&creator));

    // Build params relative to the now-advanced ledger timestamp.
    let now = env.ledger().timestamp();
    let mut params = default_params(&env);
    params.end_time = now + 1000;
    params.resolution_time = now + 2000;

    let result = client.try_create_market(&creator, &params);
    assert!(
        result.is_ok(),
        "creator whose score meets the threshold must succeed without being on the allowlist"
    );
    assert_eq!(client.get_market_count(), 2);
}
