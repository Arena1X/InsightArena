use soroban_sdk::testutils::{Address as _, Ledger};
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

/// Deploy and initialise the contract; return client + xlm_token address + admin + oracle.
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

// ── submit_prediction tests ───────────────────────────────────────────────

#[test]
fn test_submit_prediction_success() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, xlm_token, _, _) = deploy(&env);
    let predictor = Address::generate(&env);
    let stake = 20_000_000_i128;

    let market_id = client.create_market(&Address::generate(&env), &default_params(&env));
    fund(&env, &xlm_token, &predictor, stake);

    client.submit_prediction(&predictor, &market_id, &symbol_short!("yes"), &stake);
    assert!(client.has_predicted(&market_id, &predictor));
}

#[test]
fn test_submit_prediction_market_expired() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, xlm_token, _, _) = deploy(&env);
    let predictor = Address::generate(&env);
    let stake = 20_000_000_i128;

    let params = default_params(&env);
    let market_id = client.create_market(&Address::generate(&env), &params);
    fund(&env, &xlm_token, &predictor, stake);

    // Fast forward time
    env.ledger()
        .with_mut(|li| li.timestamp = params.end_time + 1);

    let result =
        client.try_submit_prediction(&predictor, &market_id, &symbol_short!("yes"), &stake);
    assert!(matches!(result, Err(Ok(InsightArenaError::MarketExpired))));
}

#[test]
fn test_submit_prediction_invalid_outcome() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, xlm_token, _, _) = deploy(&env);
    let predictor = Address::generate(&env);
    let stake = 20_000_000_i128;

    let market_id = client.create_market(&Address::generate(&env), &default_params(&env));
    fund(&env, &xlm_token, &predictor, stake);

    let result =
        client.try_submit_prediction(&predictor, &market_id, &symbol_short!("maybe"), &stake);
    assert!(matches!(result, Err(Ok(InsightArenaError::InvalidOutcome))));
}

#[test]
fn test_submit_prediction_stake_too_low() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, xlm_token, _, _) = deploy(&env);
    let predictor = Address::generate(&env);
    let params = default_params(&env);
    let stake = params.min_stake - 1;

    let market_id = client.create_market(&Address::generate(&env), &params);
    fund(&env, &xlm_token, &predictor, params.min_stake);

    let result =
        client.try_submit_prediction(&predictor, &market_id, &symbol_short!("yes"), &stake);
    assert!(matches!(result, Err(Ok(InsightArenaError::StakeTooLow))));
}

#[test]
fn test_submit_prediction_stake_too_high() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, xlm_token, _, _) = deploy(&env);
    let predictor = Address::generate(&env);
    let params = default_params(&env);
    let stake = params.max_stake + 1;

    let market_id = client.create_market(&Address::generate(&env), &params);
    fund(&env, &xlm_token, &predictor, stake);

    let result =
        client.try_submit_prediction(&predictor, &market_id, &symbol_short!("yes"), &stake);
    assert!(matches!(result, Err(Ok(InsightArenaError::StakeTooHigh))));
}

#[test]
fn test_submit_prediction_already_predicted() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, xlm_token, _, _) = deploy(&env);
    let predictor = Address::generate(&env);
    let stake = 20_000_000_i128;

    let market_id = client.create_market(&Address::generate(&env), &default_params(&env));
    fund(&env, &xlm_token, &predictor, stake * 2);

    client.submit_prediction(&predictor, &market_id, &symbol_short!("yes"), &stake);
    let result = client.try_submit_prediction(&predictor, &market_id, &symbol_short!("no"), &stake);
    assert!(matches!(
        result,
        Err(Ok(InsightArenaError::AlreadyPredicted))
    ));
}

// ── claim_payout tests ────────────────────────────────────────────────────

#[test]
fn test_claim_payout_correct_prediction() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, xlm_token, _, oracle) = deploy(&env);
    let predictor = Address::generate(&env);
    let stake = 50_000_000_i128;

    let params = default_params(&env);
    let market_id = client.create_market(&Address::generate(&env), &params);
    fund(&env, &xlm_token, &predictor, stake);

    client.submit_prediction(&predictor, &market_id, &symbol_short!("yes"), &stake);

    // Resolve market
    env.ledger()
        .with_mut(|li| li.timestamp = params.resolution_time + 1);
    client.resolve_market(&oracle, &market_id, &symbol_short!("yes"));

    let payout = client.claim_payout(&predictor, &market_id);
    // Sole winner: gross = 50, fees = 2% protocol + 1% creator = 3%. net = 50 * 0.97 = 48.5
    assert_eq!(payout, 48_500_000);
}

#[test]
fn test_claim_payout_wrong_outcome() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, xlm_token, _, oracle) = deploy(&env);
    let predictor = Address::generate(&env);
    let stake = 50_000_000_i128;

    let params = default_params(&env);
    let market_id = client.create_market(&Address::generate(&env), &params);
    fund(&env, &xlm_token, &predictor, stake);

    client.submit_prediction(&predictor, &market_id, &symbol_short!("no"), &stake);

    env.ledger()
        .with_mut(|li| li.timestamp = params.resolution_time + 1);
    client.resolve_market(&oracle, &market_id, &symbol_short!("yes"));

    let result = client.try_claim_payout(&predictor, &market_id);
    assert!(matches!(result, Err(Ok(InsightArenaError::InvalidOutcome))));
}

#[test]
fn test_claim_payout_already_claimed() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, xlm_token, _, oracle) = deploy(&env);
    let predictor = Address::generate(&env);
    let stake = 50_000_000_i128;

    let params = default_params(&env);
    let market_id = client.create_market(&Address::generate(&env), &params);
    fund(&env, &xlm_token, &predictor, stake);

    client.submit_prediction(&predictor, &market_id, &symbol_short!("yes"), &stake);

    env.ledger()
        .with_mut(|li| li.timestamp = params.resolution_time + 1);
    client.resolve_market(&oracle, &market_id, &symbol_short!("yes"));

    client.claim_payout(&predictor, &market_id);
    let result = client.try_claim_payout(&predictor, &market_id);
    assert!(matches!(
        result,
        Err(Ok(InsightArenaError::PayoutAlreadyClaimed))
    ));
}

#[test]
fn test_claim_payout_before_resolution() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, xlm_token, _, _) = deploy(&env);
    let predictor = Address::generate(&env);
    let stake = 50_000_000_i128;

    let params = default_params(&env);
    let market_id = client.create_market(&Address::generate(&env), &params);
    fund(&env, &xlm_token, &predictor, stake);

    client.submit_prediction(&predictor, &market_id, &symbol_short!("yes"), &stake);

    let result = client.try_claim_payout(&predictor, &market_id);
    assert!(matches!(
        result,
        Err(Ok(InsightArenaError::MarketNotResolved))
    ));
}

// ── batch_distribute_payouts tests ───────────────────────────────────────────

#[test]
fn test_batch_distribute_payouts_distributes_to_all_winners() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, xlm_token, _, oracle) = deploy(&env);

    let winner1 = Address::generate(&env);
    let winner2 = Address::generate(&env);
    let loser = Address::generate(&env);
    let stake = 50_000_000_i128;

    let params = default_params(&env);
    let market_id = client.create_market(&Address::generate(&env), &params);

    fund(&env, &xlm_token, &winner1, stake);
    fund(&env, &xlm_token, &winner2, stake);
    fund(&env, &xlm_token, &loser, stake);

    client.submit_prediction(&winner1, &market_id, &symbol_short!("yes"), &stake);
    client.submit_prediction(&winner2, &market_id, &symbol_short!("yes"), &stake);
    client.submit_prediction(&loser, &market_id, &symbol_short!("no"), &stake);

    env.ledger()
        .with_mut(|li| li.timestamp = params.resolution_time + 1);
    client.resolve_market(&oracle, &market_id, &symbol_short!("yes"));

    let processed = client.batch_distribute_payouts(&oracle, &market_id);
    assert_eq!(processed, 2);

    // Winners should have received payouts; verify by checking claimed state
    assert!(matches!(
        client.try_claim_payout(&winner1, &market_id),
        Err(Ok(InsightArenaError::PayoutAlreadyClaimed))
    ));
    assert!(matches!(
        client.try_claim_payout(&winner2, &market_id),
        Err(Ok(InsightArenaError::PayoutAlreadyClaimed))
    ));
}

#[test]
fn test_batch_distribute_payouts_fails_for_non_admin() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, xlm_token, _, oracle) = deploy(&env);

    let winner = Address::generate(&env);
    let random = Address::generate(&env);
    let stake = 50_000_000_i128;

    let params = default_params(&env);
    let market_id = client.create_market(&Address::generate(&env), &params);

    fund(&env, &xlm_token, &winner, stake);
    client.submit_prediction(&winner, &market_id, &symbol_short!("yes"), &stake);

    env.ledger()
        .with_mut(|li| li.timestamp = params.resolution_time + 1);
    client.resolve_market(&oracle, &market_id, &symbol_short!("yes"));

    let result = client.try_batch_distribute_payouts(&random, &market_id);
    assert!(matches!(result, Err(Ok(InsightArenaError::Unauthorized))));
}

#[test]
fn test_batch_distribute_payouts_fails_on_unresolved_market() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, xlm_token, _, oracle) = deploy(&env);

    let predictor = Address::generate(&env);
    let stake = 50_000_000_i128;

    let params = default_params(&env);
    let market_id = client.create_market(&Address::generate(&env), &params);

    fund(&env, &xlm_token, &predictor, stake);
    client.submit_prediction(&predictor, &market_id, &symbol_short!("yes"), &stake);

    // Market is not yet resolved
    let result = client.try_batch_distribute_payouts(&oracle, &market_id);
    assert!(matches!(
        result,
        Err(Ok(InsightArenaError::MarketNotResolved))
    ));
}

#[test]
fn test_batch_distribute_payouts_respects_25_limit() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, xlm_token, _, oracle) = deploy(&env);

    let params = default_params(&env);
    let market_id = client.create_market(&Address::generate(&env), &params);

    // Submit 30 winning predictions
    for _ in 0..30 {
        let predictor = Address::generate(&env);
        let stake = 10_000_000_i128;
        fund(&env, &xlm_token, &predictor, stake);
        client.submit_prediction(&predictor, &market_id, &symbol_short!("yes"), &stake);
    }

    env.ledger()
        .with_mut(|li| li.timestamp = params.resolution_time + 1);
    client.resolve_market(&oracle, &market_id, &symbol_short!("yes"));

    let processed = client.batch_distribute_payouts(&oracle, &market_id);
    assert_eq!(processed, 25);
}

#[test]
fn test_batch_distribute_payouts_skips_already_claimed() {
    // Two winners on the same market. Run batch twice; the second run should
    // process 0 predictions because all winning predictions were already claimed
    // in the first run.
    let env = Env::default();
    env.mock_all_auths();
    let (client, xlm_token, _, oracle) = deploy(&env);

    // Only winners (no losers) so winning_pool stays non-zero on both runs.
    let winner1 = Address::generate(&env);
    let winner2 = Address::generate(&env);
    let stake = 50_000_000_i128;

    let params = default_params(&env);
    let market_id = client.create_market(&Address::generate(&env), &params);

    fund(&env, &xlm_token, &winner1, stake);
    fund(&env, &xlm_token, &winner2, stake);

    client.submit_prediction(&winner1, &market_id, &symbol_short!("yes"), &stake);
    client.submit_prediction(&winner2, &market_id, &symbol_short!("yes"), &stake);

    env.ledger()
        .with_mut(|li| li.timestamp = params.resolution_time + 1);
    client.resolve_market(&oracle, &market_id, &symbol_short!("yes"));

    // First batch distributes to both winners
    let first_run = client.batch_distribute_payouts(&oracle, &market_id);
    assert_eq!(first_run, 2);

    // Second batch: all winning predictions already claimed — skips them, returns 0
    let second_run = client.batch_distribute_payouts(&oracle, &market_id);
    assert_eq!(second_run, 0);
}

// ── payout_math tests ─────────────────────────────────────────────────────

#[test]
fn test_payout_math_two_winners() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, xlm_token, _, oracle) = deploy(&env);

    let p1 = Address::generate(&env);
    let p2 = Address::generate(&env);
    let p3 = Address::generate(&env); // loser
    let stake = 50_000_000_i128;

    let params = default_params(&env);
    let market_id = client.create_market(&Address::generate(&env), &params);

    fund(&env, &xlm_token, &p1, stake);
    fund(&env, &xlm_token, &p2, stake);
    fund(&env, &xlm_token, &p3, stake);

    client.submit_prediction(&p1, &market_id, &symbol_short!("yes"), &stake);
    client.submit_prediction(&p2, &market_id, &symbol_short!("yes"), &stake);
    client.submit_prediction(&p3, &market_id, &symbol_short!("no"), &stake);

    env.ledger()
        .with_mut(|li| li.timestamp = params.resolution_time + 1);
    client.resolve_market(&oracle, &market_id, &symbol_short!("yes"));

    // Calculation:
    // Total Pool = 150
    // Winning Pool = 100
    // Loser Pool = 50
    // Payout Ratio for p1 = 50 / 100 = 0.5
    // Winner Share = 0.5 * 50 = 25
    // Gross Payout = 50 + 25 = 75
    // Fees = 2% protocol + 1% creator = 3% of 75 = 2.25
    // Net Payout = 75 - 2.25 = 72.75 -> 72,750,000 stroops

    let payout1 = client.claim_payout(&p1, &market_id);
    let payout2 = client.claim_payout(&p2, &market_id);

    assert_eq!(payout1, 72_750_000);
    assert_eq!(payout2, 72_750_000);
}

#[test]
fn test_payout_math_single_winner_takes_all() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, xlm_token, _, oracle) = deploy(&env);

    let p1 = Address::generate(&env);
    let p2 = Address::generate(&env); // loser
    let stake = 100_000_000_i128;

    let params = default_params(&env);
    let market_id = client.create_market(&Address::generate(&env), &params);

    fund(&env, &xlm_token, &p1, stake);
    fund(&env, &xlm_token, &p2, stake);

    client.submit_prediction(&p1, &market_id, &symbol_short!("yes"), &stake);
    client.submit_prediction(&p2, &market_id, &symbol_short!("no"), &stake);

    env.ledger()
        .with_mut(|li| li.timestamp = params.resolution_time + 1);
    client.resolve_market(&oracle, &market_id, &symbol_short!("yes"));

    // Calculation:
    // Total Pool = 200
    // Winning Pool = 100
    // Loser Pool = 100
    // Payout Ratio = 100 / 100 = 1
    // Winner Share = 1 * 100 = 100
    // Gross Payout = 100 + 100 = 200
    // Fees = 3% of 200 = 6
    // Net Payout = 200 - 6 = 194 -> 194,000,000 stroops

    let payout = client.claim_payout(&p1, &market_id);
    assert_eq!(payout, 194_000_000);
}
