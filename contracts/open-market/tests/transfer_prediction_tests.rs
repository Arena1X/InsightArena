//! Tests for `transfer_prediction`: the secondary-transfer primitive that lets
//! a predictor move part or all of an open position to another address before
//! a market enters its resolution window.
//!
//! Acceptance criteria covered:
//! 1. Full transfer leaves `from` with zero position and `to` with exact
//!    shares; totals (market.total_pool, sum of stakes) are conserved.
//! 2. Partial transfer produces two consistent positions summing to the
//!    original stake.
//! 3. Post-resolution, self-transfers, and zero-share transfers return the
//!    correct typed errors.
//! 4. `PredictorList`/`UserMarkets` indexes (via `list_market_predictions`,
//!    `has_predicted`, `list_user_markets`) reflect the new ownership.

use insightarena_contract::market::CreateMarketParams;
use insightarena_contract::{InsightArenaContract, InsightArenaContractClient, InsightArenaError};
use soroban_sdk::testutils::{Address as _, Ledger as _};
use soroban_sdk::token::StellarAssetClient;
use soroban_sdk::{symbol_short, vec, Address, Env, String, Symbol, BytesN};

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
        metadata_hash: BytesN::from_array(env, &[0u8; 32]),
    }
}

fn fund(env: &Env, xlm_token: &Address, recipient: &Address, amount: i128) {
    StellarAssetClient::new(env, xlm_token).mint(recipient, &amount);
}

// ── Full transfer ────────────────────────────────────────────────────────

#[test]
fn full_transfer_zeroes_sender_and_credits_recipient_exactly() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, xlm_token, _, _) = deploy(&env);
    let from = Address::generate(&env);
    let to = Address::generate(&env);
    let stake = 20_000_000_i128;

    let market_id = client.create_market(&Address::generate(&env), &default_params(&env));
    fund(&env, &xlm_token, &from, stake);
    client.submit_prediction(&from, &market_id, &symbol_short!("yes"), &stake);

    let market_before = client.get_market(&market_id);

    client.transfer_prediction(&market_id, &from, &to, &stake);

    // `from` has no position left.
    assert!(!client.has_predicted(&market_id, &from));
    // `to` holds exactly the transferred amount.
    assert!(client.has_predicted(&market_id, &to));
    let to_prediction = client.get_prediction(&market_id, &to);
    assert_eq!(to_prediction.stake_amount, stake);
    assert_eq!(to_prediction.chosen_outcome, symbol_short!("yes"));

    // Total pool is conserved — a transfer never mints or burns stake.
    let market_after = client.get_market(&market_id);
    assert_eq!(market_after.total_pool, market_before.total_pool);
    assert_eq!(market_after.participant_count, market_before.participant_count);
}

#[test]
fn full_transfer_removes_from_predictor_indexes() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, xlm_token, _, _) = deploy(&env);
    let from = Address::generate(&env);
    let to = Address::generate(&env);
    let stake = 20_000_000_i128;

    let market_id = client.create_market(&Address::generate(&env), &default_params(&env));
    fund(&env, &xlm_token, &from, stake);
    client.submit_prediction(&from, &market_id, &symbol_short!("yes"), &stake);

    client.transfer_prediction(&market_id, &from, &to, &stake);

    // PredictorList reflects the new owner only.
    let predictions = client.list_market_predictions(&market_id);
    assert_eq!(predictions.len(), 1);
    assert_eq!(predictions.get(0).unwrap().predictor, to);

    // UserMarkets reverse index moves with the position.
    let from_markets = client.list_user_markets(&from);
    assert!(!from_markets.contains(market_id));
    let to_markets = client.list_user_markets(&to);
    assert!(to_markets.contains(market_id));
}

// ── Partial transfer ─────────────────────────────────────────────────────

#[test]
fn partial_transfer_produces_two_positions_summing_to_original() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, xlm_token, _, _) = deploy(&env);
    let from = Address::generate(&env);
    let to = Address::generate(&env);
    let stake = 20_000_000_i128;
    let shares = 8_000_000_i128;

    let market_id = client.create_market(&Address::generate(&env), &default_params(&env));
    fund(&env, &xlm_token, &from, stake);
    client.submit_prediction(&from, &market_id, &symbol_short!("yes"), &stake);

    client.transfer_prediction(&market_id, &from, &to, &shares);

    let from_prediction = client.get_prediction(&market_id, &from);
    let to_prediction = client.get_prediction(&market_id, &to);

    assert_eq!(from_prediction.stake_amount, stake - shares);
    assert_eq!(to_prediction.stake_amount, shares);
    assert_eq!(
        from_prediction.stake_amount + to_prediction.stake_amount,
        stake
    );

    // Both remain distinct predictor-list entries.
    let predictions = client.list_market_predictions(&market_id);
    assert_eq!(predictions.len(), 2);

    let market = client.get_market(&market_id);
    assert_eq!(market.total_pool, stake);
    assert_eq!(market.participant_count, 2);
}

#[test]
fn partial_transfer_merges_into_existing_same_outcome_position() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, xlm_token, _, _) = deploy(&env);
    let from = Address::generate(&env);
    let to = Address::generate(&env);
    let from_stake = 20_000_000_i128;
    let to_stake = 15_000_000_i128;
    let shares = 5_000_000_i128;

    let market_id = client.create_market(&Address::generate(&env), &default_params(&env));
    fund(&env, &xlm_token, &from, from_stake);
    fund(&env, &xlm_token, &to, to_stake);
    client.submit_prediction(&from, &market_id, &symbol_short!("yes"), &from_stake);
    client.submit_prediction(&to, &market_id, &symbol_short!("yes"), &to_stake);

    let market_before = client.get_market(&market_id);

    client.transfer_prediction(&market_id, &from, &to, &shares);

    let from_prediction = client.get_prediction(&market_id, &from);
    let to_prediction = client.get_prediction(&market_id, &to);
    assert_eq!(from_prediction.stake_amount, from_stake - shares);
    assert_eq!(to_prediction.stake_amount, to_stake + shares);

    // No new participant was created — count and pool stay put.
    let market_after = client.get_market(&market_id);
    assert_eq!(market_after.participant_count, market_before.participant_count);
    assert_eq!(market_after.total_pool, market_before.total_pool);
}

#[test]
fn transfer_to_recipient_with_conflicting_outcome_rejected() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, xlm_token, _, _) = deploy(&env);
    let from = Address::generate(&env);
    let to = Address::generate(&env);
    let stake = 20_000_000_i128;

    let market_id = client.create_market(&Address::generate(&env), &default_params(&env));
    fund(&env, &xlm_token, &from, stake);
    fund(&env, &xlm_token, &to, stake);
    client.submit_prediction(&from, &market_id, &symbol_short!("yes"), &stake);
    client.submit_prediction(&to, &market_id, &symbol_short!("no"), &stake);

    let result = client.try_transfer_prediction(&market_id, &from, &to, &5_000_000_i128);
    assert!(matches!(
        result,
        Err(Ok(InsightArenaError::AlreadyPredicted))
    ));
}

// ── Typed error cases ────────────────────────────────────────────────────

#[test]
fn transfer_after_resolution_rejected() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, xlm_token, _, oracle) = deploy(&env);
    let from = Address::generate(&env);
    let to = Address::generate(&env);
    let stake = 20_000_000_i128;

    let params = default_params(&env);
    let market_id = client.create_market(&Address::generate(&env), &params);
    fund(&env, &xlm_token, &from, stake);
    client.submit_prediction(&from, &market_id, &symbol_short!("yes"), &stake);

    env.ledger()
        .with_mut(|li| li.timestamp = params.resolution_time);
    client.resolve_market(&oracle, &market_id, &symbol_short!("yes"));

    let result = client.try_transfer_prediction(&market_id, &from, &to, &stake);
    assert!(matches!(
        result,
        Err(Ok(InsightArenaError::MarketAlreadyResolved))
    ));
}

#[test]
fn transfer_after_end_time_rejected_even_if_unresolved() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, xlm_token, _, _) = deploy(&env);
    let from = Address::generate(&env);
    let to = Address::generate(&env);
    let stake = 20_000_000_i128;

    let params = default_params(&env);
    let market_id = client.create_market(&Address::generate(&env), &params);
    fund(&env, &xlm_token, &from, stake);
    client.submit_prediction(&from, &market_id, &symbol_short!("yes"), &stake);

    // Market has closed for new predictions but the oracle has not resolved
    // it yet — it has still entered its resolution window.
    env.ledger()
        .with_mut(|li| li.timestamp = params.end_time);

    let result = client.try_transfer_prediction(&market_id, &from, &to, &stake);
    assert!(matches!(result, Err(Ok(InsightArenaError::MarketExpired))));
}

#[test]
fn transfer_on_cancelled_market_rejected() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, xlm_token, admin, _) = deploy(&env);
    let from = Address::generate(&env);
    let to = Address::generate(&env);
    let stake = 20_000_000_i128;

    let market_id = client.create_market(&Address::generate(&env), &default_params(&env));
    fund(&env, &xlm_token, &from, stake);
    client.submit_prediction(&from, &market_id, &symbol_short!("yes"), &stake);

    client.cancel_market(&admin, &market_id);

    let result = client.try_transfer_prediction(&market_id, &from, &to, &stake);
    assert!(matches!(
        result,
        Err(Ok(InsightArenaError::MarketAlreadyCancelled))
    ));
}

#[test]
fn self_transfer_rejected() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, xlm_token, _, _) = deploy(&env);
    let predictor = Address::generate(&env);
    let stake = 20_000_000_i128;

    let market_id = client.create_market(&Address::generate(&env), &default_params(&env));
    fund(&env, &xlm_token, &predictor, stake);
    client.submit_prediction(&predictor, &market_id, &symbol_short!("yes"), &stake);

    let result =
        client.try_transfer_prediction(&market_id, &predictor, &predictor, &stake);
    assert!(matches!(result, Err(Ok(InsightArenaError::SelfTransfer))));
}

#[test]
fn zero_share_transfer_rejected() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, xlm_token, _, _) = deploy(&env);
    let from = Address::generate(&env);
    let to = Address::generate(&env);
    let stake = 20_000_000_i128;

    let market_id = client.create_market(&Address::generate(&env), &default_params(&env));
    fund(&env, &xlm_token, &from, stake);
    client.submit_prediction(&from, &market_id, &symbol_short!("yes"), &stake);

    let result = client.try_transfer_prediction(&market_id, &from, &to, &0_i128);
    assert!(matches!(
        result,
        Err(Ok(InsightArenaError::ZeroShareTransfer))
    ));
}

#[test]
fn negative_share_transfer_rejected() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, xlm_token, _, _) = deploy(&env);
    let from = Address::generate(&env);
    let to = Address::generate(&env);
    let stake = 20_000_000_i128;

    let market_id = client.create_market(&Address::generate(&env), &default_params(&env));
    fund(&env, &xlm_token, &from, stake);
    client.submit_prediction(&from, &market_id, &symbol_short!("yes"), &stake);

    let result = client.try_transfer_prediction(&market_id, &from, &to, &(-1_i128));
    assert!(matches!(
        result,
        Err(Ok(InsightArenaError::ZeroShareTransfer))
    ));
}

#[test]
fn transfer_exceeding_position_rejected() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, xlm_token, _, _) = deploy(&env);
    let from = Address::generate(&env);
    let to = Address::generate(&env);
    let stake = 20_000_000_i128;

    let market_id = client.create_market(&Address::generate(&env), &default_params(&env));
    fund(&env, &xlm_token, &from, stake);
    client.submit_prediction(&from, &market_id, &symbol_short!("yes"), &stake);

    let result = client.try_transfer_prediction(&market_id, &from, &to, &(stake + 1));
    assert!(matches!(result, Err(Ok(InsightArenaError::InvalidInput))));
}

#[test]
fn transfer_with_no_existing_position_rejected() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _xlm_token, _, _) = deploy(&env);
    let from = Address::generate(&env);
    let to = Address::generate(&env);

    let market_id = client.create_market(&Address::generate(&env), &default_params(&env));

    let result = client.try_transfer_prediction(&market_id, &from, &to, &1_000_000_i128);
    assert!(matches!(
        result,
        Err(Ok(InsightArenaError::PredictionNotFound))
    ));
}

#[test]
fn transfer_on_nonexistent_market_rejected() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _xlm_token, _, _) = deploy(&env);
    let from = Address::generate(&env);
    let to = Address::generate(&env);

    let result = client.try_transfer_prediction(&999_u64, &from, &to, &1_000_000_i128);
    assert!(matches!(result, Err(Ok(InsightArenaError::MarketNotFound))));
}

// ── has_predicted / list_market_predictions consistency ─────────────────

#[test]
fn indexes_stay_accurate_across_a_chain_of_transfers() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, xlm_token, _, _) = deploy(&env);
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);
    let carol = Address::generate(&env);
    let stake = 30_000_000_i128;

    let market_id = client.create_market(&Address::generate(&env), &default_params(&env));
    fund(&env, &xlm_token, &alice, stake);
    client.submit_prediction(&alice, &market_id, &symbol_short!("yes"), &stake);

    // Alice -> Bob (partial), then Bob -> Carol (full, everything Bob holds).
    client.transfer_prediction(&market_id, &alice, &bob, &10_000_000_i128);
    let bob_stake = client.get_prediction(&market_id, &bob).stake_amount;
    client.transfer_prediction(&market_id, &bob, &carol, &bob_stake);

    assert!(client.has_predicted(&market_id, &alice));
    assert!(!client.has_predicted(&market_id, &bob));
    assert!(client.has_predicted(&market_id, &carol));

    let predictions = client.list_market_predictions(&market_id);
    assert_eq!(predictions.len(), 2);

    let total: i128 = predictions.iter().map(|p| p.stake_amount).sum();
    assert_eq!(total, stake);

    let market = client.get_market(&market_id);
    assert_eq!(market.total_pool, stake);
    assert_eq!(market.participant_count, 2);
}
