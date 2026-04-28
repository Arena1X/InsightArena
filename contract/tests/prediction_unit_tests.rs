use soroban_sdk::testutils::Address as _;
use soroban_sdk::token::StellarAssetClient;
use soroban_sdk::{symbol_short, vec, Address, Env, String, Symbol};

use insightarena_contract::market::CreateMarketParams;
use insightarena_contract::{InsightArenaContract, InsightArenaContractClient, InsightArenaError};

// ── Test helpers ──────────────────────────────────────────────────────────

fn register_token(env: &Env) -> Address {
    let token_admin = Address::generate(env);
    env.register_stellar_asset_contract_v2(token_admin)
        .address()
}

/// Deploy and initialise the contract; return client + xlm_token address.
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

/// Mint `amount` XLM stroops to `recipient` using the stellar asset client.
fn fund(env: &Env, xlm_token: &Address, recipient: &Address, amount: i128) {
    StellarAssetClient::new(env, xlm_token).mint(recipient, &amount);
}

// ── submit_prediction unit tests ──────────────────────────────────────────
// ── Happy path ────────────────────────────────────────────────────────────

#[test]
fn submit_prediction_stores_correct_data() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, xlm_token) = deploy(&env);
    let creator = Address::generate(&env);
    let predictor = Address::generate(&env);

    let market_id = client.create_market(&creator, &default_params(&env));
    fund(&env, &xlm_token, &predictor, 20_000_000);

    client.submit_prediction(
        &predictor,
        &market_id,
        &symbol_short!("yes"),
        &20_000_000_i128,
    );

    // Verify prediction stored correctly
    let pred = env.as_contract(&client.address, || {
        use insightarena_contract::storage_types::{DataKey, Prediction};
        env.storage()
            .persistent()
            .get::<DataKey, Prediction>(&DataKey::Prediction(market_id, predictor.clone()))
            .unwrap()
    });
    assert_eq!(pred.market_id, market_id);
    assert_eq!(pred.predictor, predictor);
    assert_eq!(pred.chosen_outcome, symbol_short!("yes"));
    assert_eq!(pred.stake_amount, 20_000_000);
    assert!(!pred.payout_claimed);
    assert_eq!(pred.payout_amount, 0);
}

// ── Task #237 Allowlist Tests ─────────────────────────────────────────────

/// (a) Public market: no allowlist check — anyone can predict
#[test]
fn submit_prediction_public_market_allows_any_predictor() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, xlm_token) = deploy(&env);
    let creator = Address::generate(&env);
    let predictor = Address::generate(&env);
    let stake = 20_000_000_i128;

    let mut params = default_params(&env);
    params.is_public = true;
    let market_id = client.create_market(&creator, &params);
    fund(&env, &xlm_token, &predictor, stake);

    client.submit_prediction(&predictor, &market_id, &symbol_short!("yes"), &stake);
    assert!(client.has_predicted(&market_id, &predictor));
}

/// (b) Private market: unlisted predictor rejected with Unauthorized
#[test]
fn submit_prediction_private_market_rejects_unlisted() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, xlm_token) = deploy(&env);
    let creator = Address::generate(&env);
    let predictor = Address::generate(&env);
    let stake = 20_000_000_i128;

    let mut params = default_params(&env);
    params.is_public = false;
    let market_id = client.create_market(&creator, &params);
    fund(&env, &xlm_token, &predictor, stake);

    let result =
        client.try_submit_prediction(&predictor, &market_id, &symbol_short!("yes"), &stake);
    assert!(matches!(result, Err(Ok(InsightArenaError::Unauthorized))));
    assert!(!client.has_predicted(&market_id, &predictor));
}

/// (c) Private market: allowlisted predictor (redeemed invite) accepted
#[test]
fn submit_prediction_private_market_accepts_allowlisted() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, xlm_token) = deploy(&env);
    let creator = Address::generate(&env);
    let predictor = Address::generate(&env);
    let stake = 20_000_000_i128;

    let mut params = default_params(&env);
    params.is_public = false;
    let market_id = client.create_market(&creator, &params);

    let code = client.generate_invite_code(&creator, &market_id, &10, &3600_u64);
    client.redeem_invite_code(&predictor, &code);
    fund(&env, &xlm_token, &predictor, stake);

    client.submit_prediction(&predictor, &market_id, &symbol_short!("yes"), &stake);
    assert!(client.has_predicted(&market_id, &predictor));
}
