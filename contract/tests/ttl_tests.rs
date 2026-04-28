use insightarena_contract::config::{LEDGER_BUMP_MARKET, LEDGER_BUMP_PREDICTION_CLAIMED};
use insightarena_contract::storage_types::DataKey;
use insightarena_contract::{InsightArenaContract, InsightArenaContractClient};
use soroban_sdk::testutils::{
    storage::{Persistent as _, Temporary as _},
    Address as _, Ledger as _,
};
use soroban_sdk::token::StellarAssetClient;
use soroban_sdk::{symbol_short, vec, Address, Env, String, Symbol};

use insightarena_contract::market::CreateMarketParams;

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
    env.mock_all_auths();
    client.initialize(&admin, &oracle, &200_u32, &register_token(env));
    client
}

fn fund(env: &Env, token: &Address, recipient: &Address, amount: i128) {
    StellarAssetClient::new(env, token).mint(recipient, &amount);
}

#[test]
fn market_ttl_is_extended_after_market_read() {
    let env = Env::default();
    env.mock_all_auths();
    let client = deploy(&env);
    let creator = Address::generate(&env);

    let params = CreateMarketParams {
        title: String::from_str(&env, "TTL Test"),
        description: String::from_str(&env, "TTL Test Description"),
        category: Symbol::new(&env, "Sports"),
        outcomes: vec![&env, symbol_short!("yes"), symbol_short!("no")],
        end_time: env.ledger().timestamp() + 1_000,
        resolution_time: env.ledger().timestamp() + 2_000,
        dispute_window: 86_400,
        creator_fee_bps: 100,
        min_stake: 10_000_000,
        max_stake: 100_000_000,
        is_public: true,
    };

    let market_id = client.create_market(&creator, &params);
    client.get_market(&market_id);

    let ttl = env.as_contract(&client.address, || {
        env.storage()
            .persistent()
            .get_ttl(&DataKey::Market(market_id))
    });

    assert!(ttl >= LEDGER_BUMP_MARKET - 14_400);
}

#[test]
fn prediction_ttl_extends_before_claim_and_shortens_after_claim() {
    let env = Env::default();
    env.mock_all_auths();
    let client = deploy(&env);
    let creator = Address::generate(&env);
    let winner = Address::generate(&env);
    let loser = Address::generate(&env);
    let token = client.get_config().xlm_token;

    let params = CreateMarketParams {
        title: String::from_str(&env, "TTL Pred Test"),
        description: String::from_str(&env, "Prediction TTL lifecycle"),
        category: Symbol::new(&env, "Sports"),
        outcomes: vec![&env, symbol_short!("yes"), symbol_short!("no")],
        end_time: env.ledger().timestamp() + 1000,
        resolution_time: env.ledger().timestamp() + 2000,
        dispute_window: 86_400,
        creator_fee_bps: 100,
        min_stake: 10_000_000,
        max_stake: 100_000_000,
        is_public: true,
    };

    let market_id = client.create_market(&creator, &params);
    fund(&env, &token, &winner, 30_000_000);
    fund(&env, &token, &loser, 30_000_000);
    client.submit_prediction(&winner, &market_id, &symbol_short!("yes"), &20_000_000);
    client.submit_prediction(&loser, &market_id, &symbol_short!("no"), &20_000_000);

    client.get_prediction(&market_id, &winner);
    let full_ttl = env.as_contract(&client.address, || {
        env.storage()
            .persistent()
            .get_ttl(&DataKey::Prediction(market_id, winner.clone()))
    });
    assert!(full_ttl >= LEDGER_BUMP_MARKET - 14_400);

    env.ledger().set_timestamp(env.ledger().timestamp() + 2_000);
    let oracle = client.get_config().oracle_address;
    client.resolve_market(&oracle, &market_id, &symbol_short!("yes"));
    client.claim_payout(&winner, &market_id);

    let claimed_ttl = env.as_contract(&client.address, || {
        env.storage()
            .temporary()
            .get_ttl(&DataKey::Prediction(market_id, winner.clone()))
    });
    assert!(claimed_ttl >= LEDGER_BUMP_PREDICTION_CLAIMED - 14_400);
    assert!(claimed_ttl < LEDGER_BUMP_MARKET - 14_400);
}

#[test]
fn test_ttl_multiple_extensions() {
    // Test that multiple TTL extensions work correctly across different storage keys
    let env = Env::default();
    env.mock_all_auths();
    let client = deploy(&env);
    let creator = Address::generate(&env);

    let params = CreateMarketParams {
        title: String::from_str(&env, "Multi TTL Test"),
        description: String::from_str(&env, "Multiple TTL extension test"),
        category: Symbol::new(&env, "Sports"),
        outcomes: vec![&env, symbol_short!("yes"), symbol_short!("no")],
        end_time: env.ledger().timestamp() + 1_000,
        resolution_time: env.ledger().timestamp() + 2_000,
        dispute_window: 86_400,
        creator_fee_bps: 100,
        min_stake: 10_000_000,
        max_stake: 100_000_000,
        is_public: true,
    };

    let market_id = client.create_market(&creator, &params);

    // Extend TTL multiple times by reading the market repeatedly
    for _ in 0..3 {
        client.get_market(&market_id);
    }

    // TTL should still be at the bumped value after multiple extensions
    let ttl = env.as_contract(&client.address, || {
        env.storage()
            .persistent()
            .get_ttl(&DataKey::Market(market_id))
    });

    assert!(ttl >= LEDGER_BUMP_MARKET - 14_400);
}

#[test]
fn test_ttl_after_prediction_submission() {
    // Test that TTL is properly set when a prediction is first submitted
    let env = Env::default();
    env.mock_all_auths();
    let client = deploy(&env);
    let creator = Address::generate(&env);
    let predictor = Address::generate(&env);
    let token = client.get_config().xlm_token;

    let params = CreateMarketParams {
        title: String::from_str(&env, "Prediction TTL Test"),
        description: String::from_str(&env, "Test TTL on prediction submission"),
        category: Symbol::new(&env, "Sports"),
        outcomes: vec![&env, symbol_short!("yes"), symbol_short!("no")],
        end_time: env.ledger().timestamp() + 1_000,
        resolution_time: env.ledger().timestamp() + 2_000,
        dispute_window: 86_400,
        creator_fee_bps: 100,
        min_stake: 10_000_000,
        max_stake: 100_000_000,
        is_public: true,
    };

    let market_id = client.create_market(&creator, &params);
    fund(&env, &token, &predictor, 30_000_000);
    client.submit_prediction(&predictor, &market_id, &symbol_short!("yes"), &20_000_000);

    // Verify TTL is set for the prediction
    let ttl = env.as_contract(&client.address, || {
        env.storage()
            .persistent()
            .get_ttl(&DataKey::Prediction(market_id, predictor.clone()))
    });

    assert!(ttl >= LEDGER_BUMP_MARKET - 14_400);
}
