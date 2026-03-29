use insightarena_contract::market::{calculate_price, CreateMarketParams};
use insightarena_contract::storage_types::{DataKey, Market, Prediction};
use insightarena_contract::{InsightArenaContract, InsightArenaContractClient, InsightArenaError};
use soroban_sdk::testutils::{Address as _, Ledger as _};
use soroban_sdk::token::{Client as TokenClient, StellarAssetClient};
use soroban_sdk::{symbol_short, vec, Address, Env, String, Symbol, Vec};

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

    client.set_paused(&true);

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
fn create_market_fails_stake_too_low() {
    let env = Env::default();
    env.mock_all_auths();
    let client = deploy(&env);
    let creator = Address::generate(&env);

    let mut params = default_params(&env);
    params.min_stake = 1;

    let result = client.try_create_market(&creator, &params);
    assert!(matches!(result, Err(Ok(InsightArenaError::StakeTooLow))));
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
    client.cancel_market(&admin, &id);

    assert_eq!(token_client.balance(&predictor_a), stake_a);
    assert_eq!(token_client.balance(&predictor_b), stake_b);
    assert!(client.get_market(&id).is_cancelled);
}
