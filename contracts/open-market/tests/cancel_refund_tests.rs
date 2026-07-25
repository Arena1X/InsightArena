//! Tests for issue #1341: Automated Refund on Market Cancellation (pull pattern).
//!
//! Acceptance criteria covered:
//! 1. `cancel_market` transitions to Cancelled state and blocks new predictions.
//! 2. A single participant can successfully claim their full stake back.
//! 3. A participant claiming twice is rejected with `RefundAlreadyClaimed`.
//! 4. Multiple participants can each independently claim their correct amounts.
//! 5. Sum of all refunds equals total staked (escrow-invariant test).

use insightarena_contract::market::CreateMarketParams;
use insightarena_contract::storage_types::{DataKey, Prediction};
use insightarena_contract::{InsightArenaContract, InsightArenaContractClient, InsightArenaError};
use soroban_sdk::testutils::{Address as _, Ledger as _};
use soroban_sdk::token::{Client as TokenClient, StellarAssetClient};
use soroban_sdk::{symbol_short, vec, Address, Env, String, Symbol};

// ── Helpers ───────────────────────────────────────────────────────────────────

fn register_token(env: &Env) -> Address {
    let token_admin = Address::generate(env);
    env.register_stellar_asset_contract_v2(token_admin)
        .address()
}

/// Deploy the contract and return (client, admin, oracle, xlm_token).
fn deploy(env: &Env) -> (InsightArenaContractClient<'_>, Address, Address, Address) {
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
        title: String::from_str(env, "Test market"),
        description: String::from_str(env, "Refund test"),
        category: Symbol::new(env, "Sports"),
        outcomes: vec![env, symbol_short!("yes"), symbol_short!("no")],
        end_time: now + 1_000,
        resolution_time: now + 2_000,
        dispute_window: 86_400,
        creator_fee_bps: 100,
        min_stake: 10_000_000,
        max_stake: 500_000_000,
        is_public: true,
    }
}

fn fund(env: &Env, token: &Address, recipient: &Address, amount: i128) {
    StellarAssetClient::new(env, token).mint(recipient, &amount);
}

// ── AC-1: Cancel transitions state and blocks predictions ─────────────────────

/// Cancellation flips `is_cancelled` to true and `submit_prediction` on a
/// cancelled market returns `MarketAlreadyCancelled`.
#[test]
fn ac1_cancel_transitions_state_and_blocks_predictions() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, _oracle, xlm_token) = deploy(&env);

    let creator = Address::generate(&env);
    let predictor = Address::generate(&env);
    let stake = 20_000_000_i128;

    let market_id = client.create_market(&creator, &default_params(&env));

    // Confirm open before cancel.
    let before = client.get_market(&market_id);
    assert!(!before.is_cancelled);
    assert!(!before.is_resolved);

    client.cancel_market(&admin, &market_id);

    // State is now cancelled.
    let after = client.get_market(&market_id);
    assert!(after.is_cancelled);
    assert!(!after.is_resolved);

    // Predictions are blocked.
    fund(&env, &xlm_token, &predictor, stake);
    let result =
        client.try_submit_prediction(&predictor, &market_id, &symbol_short!("yes"), &stake);
    assert!(matches!(
        result,
        Err(Ok(InsightArenaError::MarketAlreadyCancelled))
    ));
}

/// `cancel_market` itself is idempotent-blocked: a second call returns
/// `MarketAlreadyCancelled`.
#[test]
fn ac1_double_cancel_is_rejected() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, _oracle, _xlm_token) = deploy(&env);

    let creator = Address::generate(&env);
    let market_id = client.create_market(&creator, &default_params(&env));

    client.cancel_market(&admin, &market_id);

    let result = client.try_cancel_market(&admin, &market_id);
    assert!(matches!(
        result,
        Err(Ok(InsightArenaError::MarketAlreadyCancelled))
    ));
}

/// A resolved market cannot be cancelled.
#[test]
fn ac1_resolved_market_cannot_be_cancelled() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, oracle, _xlm_token) = deploy(&env);

    let creator = Address::generate(&env);
    let params = default_params(&env);
    let market_id = client.create_market(&creator, &params);

    env.ledger()
        .with_mut(|li| li.timestamp = params.resolution_time + 1);
    client.resolve_market(&oracle, &market_id, &symbol_short!("yes"));

    let result = client.try_cancel_market(&admin, &market_id);
    assert!(matches!(
        result,
        Err(Ok(InsightArenaError::MarketAlreadyResolved))
    ));
}

/// Only the platform admin may cancel — a random caller is rejected.
#[test]
fn ac1_non_admin_cannot_cancel() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, _oracle, _xlm_token) = deploy(&env);

    let creator = Address::generate(&env);
    let random = Address::generate(&env);
    let market_id = client.create_market(&creator, &default_params(&env));

    let result = client.try_cancel_market(&random, &market_id);
    assert!(matches!(result, Err(Ok(InsightArenaError::Unauthorized))));
}

// ── AC-2: Single participant claims full stake ────────────────────────────────

/// One predictor stakes, market is cancelled, predictor claims and receives
/// exactly `stake_amount` back.
#[test]
fn ac2_single_participant_claims_full_stake() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, _oracle, xlm_token) = deploy(&env);

    let creator = Address::generate(&env);
    let predictor = Address::generate(&env);
    let stake = 30_000_000_i128;

    let market_id = client.create_market(&creator, &default_params(&env));
    fund(&env, &xlm_token, &predictor, stake);
    client.submit_prediction(&predictor, &market_id, &symbol_short!("yes"), &stake);

    let token = TokenClient::new(&env, &xlm_token);
    // Stake is in escrow.
    assert_eq!(token.balance(&predictor), 0);

    client.cancel_market(&admin, &market_id);

    // Funds still in escrow after cancel.
    assert_eq!(token.balance(&predictor), 0);
    assert_eq!(token.balance(&client.address), stake);

    let refunded = client.claim_cancel_refund(&predictor, &market_id);

    // Returned value equals stake.
    assert_eq!(refunded, stake);
    // Predictor is whole.
    assert_eq!(token.balance(&predictor), stake);
    // Escrow is empty.
    assert_eq!(token.balance(&client.address), 0);
}

/// `claim_cancel_refund` on a market that is not cancelled returns
/// `MarketNotCancelled`.
#[test]
fn ac2_claim_on_live_market_is_rejected() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, _oracle, xlm_token) = deploy(&env);

    let creator = Address::generate(&env);
    let predictor = Address::generate(&env);
    let stake = 10_000_000_i128;

    let market_id = client.create_market(&creator, &default_params(&env));
    fund(&env, &xlm_token, &predictor, stake);
    client.submit_prediction(&predictor, &market_id, &symbol_short!("yes"), &stake);

    // Market is still live — refund must fail.
    let result = client.try_claim_cancel_refund(&predictor, &market_id);
    assert!(matches!(
        result,
        Err(Ok(InsightArenaError::MarketNotCancelled))
    ));
}

// ── AC-3: Double-claim prevention ────────────────────────────────────────────

/// A predictor who calls `claim_cancel_refund` twice gets `RefundAlreadyClaimed`
/// on the second call and receives no extra tokens.
#[test]
fn ac3_double_claim_is_rejected() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, _oracle, xlm_token) = deploy(&env);

    let creator = Address::generate(&env);
    let predictor = Address::generate(&env);
    let stake = 20_000_000_i128;

    let market_id = client.create_market(&creator, &default_params(&env));
    fund(&env, &xlm_token, &predictor, stake);
    client.submit_prediction(&predictor, &market_id, &symbol_short!("yes"), &stake);

    client.cancel_market(&admin, &market_id);

    // First claim succeeds.
    client.claim_cancel_refund(&predictor, &market_id);

    let token = TokenClient::new(&env, &xlm_token);
    let balance_after_first = token.balance(&predictor);
    assert_eq!(balance_after_first, stake);

    // Second claim is rejected.
    let result = client.try_claim_cancel_refund(&predictor, &market_id);
    assert!(matches!(
        result,
        Err(Ok(InsightArenaError::RefundAlreadyClaimed))
    ));

    // Balance unchanged — no double-payment.
    assert_eq!(token.balance(&predictor), stake);
}

// ── AC-4: Multiple independent participants ───────────────────────────────────

/// Five predictors with different stakes on both outcomes each claim in
/// arbitrary order and each receive exactly their deposited amount.
#[test]
fn ac4_multiple_participants_claim_independently_in_any_order() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, _oracle, xlm_token) = deploy(&env);

    let creator = Address::generate(&env);
    let market_id = client.create_market(&creator, &default_params(&env));

    let stakes = [12_000_000_i128, 25_000_000, 40_000_000, 60_000_000, 100_000_000];
    let outcomes = [
        symbol_short!("yes"),
        symbol_short!("no"),
        symbol_short!("yes"),
        symbol_short!("no"),
        symbol_short!("yes"),
    ];
    let predictors: Vec<Address> = (0..5).map(|_| Address::generate(&env)).collect();

    let token = TokenClient::new(&env, &xlm_token);

    for (i, predictor) in predictors.iter().enumerate() {
        fund(&env, &xlm_token, predictor, stakes[i]);
        client.submit_prediction(predictor, &market_id, &outcomes[i], &stakes[i]);
    }

    client.cancel_market(&admin, &market_id);

    // Claim in reverse order to show independence.
    for (i, predictor) in predictors.iter().enumerate().rev() {
        let result = client.claim_cancel_refund(predictor, &market_id);
        assert_eq!(result, stakes[i], "predictor {i} got wrong refund amount");
        assert_eq!(
            token.balance(predictor),
            stakes[i],
            "predictor {i} final balance wrong"
        );
    }
}

/// A non-participant calling `claim_cancel_refund` receives `NotAParticipant`.
#[test]
fn ac4_non_participant_cannot_claim() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, _oracle, xlm_token) = deploy(&env);

    let creator = Address::generate(&env);
    let predictor = Address::generate(&env);
    let outsider = Address::generate(&env);
    let stake = 15_000_000_i128;

    let market_id = client.create_market(&creator, &default_params(&env));
    fund(&env, &xlm_token, &predictor, stake);
    client.submit_prediction(&predictor, &market_id, &symbol_short!("yes"), &stake);

    client.cancel_market(&admin, &market_id);

    let result = client.try_claim_cancel_refund(&outsider, &market_id);
    assert!(matches!(
        result,
        Err(Ok(InsightArenaError::NotAParticipant))
    ));

    let token = TokenClient::new(&env, &xlm_token);
    assert_eq!(token.balance(&outsider), 0);
}

// ── AC-5: Escrow invariant — sum of all refunds == total staked ───────────────

/// Invariant: after all participants claim, the escrow balance is exactly zero
/// and each participant received exactly their deposited stake. No rounding
/// errors, no dust, no over-payment.
#[test]
fn ac5_sum_of_all_refunds_equals_total_staked() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, _oracle, xlm_token) = deploy(&env);

    let creator = Address::generate(&env);
    let market_id = client.create_market(&creator, &default_params(&env));

    // Deliberately unequal stakes across both outcomes to stress the accounting.
    let stakes = [
        10_000_000_i128,
        17_500_000,
        33_333_333,
        99_999_999,
        200_000_001,
    ];
    let outcomes = [
        symbol_short!("yes"),
        symbol_short!("yes"),
        symbol_short!("no"),
        symbol_short!("yes"),
        symbol_short!("no"),
    ];
    let predictors: Vec<Address> = (0..5).map(|_| Address::generate(&env)).collect();

    let token = TokenClient::new(&env, &xlm_token);
    let total_staked: i128 = stakes.iter().sum();

    for (i, predictor) in predictors.iter().enumerate() {
        fund(&env, &xlm_token, predictor, stakes[i]);
        client.submit_prediction(predictor, &market_id, &outcomes[i], &stakes[i]);
    }

    // All stakes are now in escrow.
    assert_eq!(token.balance(&client.address), total_staked);

    client.cancel_market(&admin, &market_id);

    // Escrow unchanged after cancel — pull pattern.
    assert_eq!(token.balance(&client.address), total_staked);

    // Each participant claims; track cumulative refunds.
    let mut total_refunded: i128 = 0;
    for (i, predictor) in predictors.iter().enumerate() {
        let got = client.claim_cancel_refund(predictor, &market_id);
        assert_eq!(got, stakes[i], "predictor {i}: refund amount mismatch");
        total_refunded += got;
    }

    // Invariant: sum of individual refunds == total staked.
    assert_eq!(
        total_refunded, total_staked,
        "sum of refunds must equal total staked"
    );

    // Escrow must be exactly zero — no dust remaining.
    assert_eq!(
        token.balance(&client.address),
        0,
        "escrow must be empty after all claims"
    );
}

/// Partial-claim invariant: after N of M participants claim, escrow holds
/// exactly the stakes of the M-N unclaimed participants.
#[test]
fn ac5_escrow_decreases_by_exact_claimed_amount_on_each_pull() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, _oracle, xlm_token) = deploy(&env);

    let creator = Address::generate(&env);
    let market_id = client.create_market(&creator, &default_params(&env));

    let stake_a = 40_000_000_i128;
    let stake_b = 60_000_000_i128;
    let predictor_a = Address::generate(&env);
    let predictor_b = Address::generate(&env);
    let token = TokenClient::new(&env, &xlm_token);

    fund(&env, &xlm_token, &predictor_a, stake_a);
    fund(&env, &xlm_token, &predictor_b, stake_b);
    client.submit_prediction(&predictor_a, &market_id, &symbol_short!("yes"), &stake_a);
    client.submit_prediction(&predictor_b, &market_id, &symbol_short!("no"), &stake_b);

    client.cancel_market(&admin, &market_id);

    // A claims; escrow drops by stake_a.
    client.claim_cancel_refund(&predictor_a, &market_id);
    assert_eq!(token.balance(&client.address), stake_b);

    // B claims; escrow reaches zero.
    client.claim_cancel_refund(&predictor_b, &market_id);
    assert_eq!(token.balance(&client.address), 0);

    assert_eq!(token.balance(&predictor_a), stake_a);
    assert_eq!(token.balance(&predictor_b), stake_b);
}

// ── AC-5 (extended): no-predictor market ─────────────────────────────────────

/// A market with no participants can be cancelled without error.
/// No claims are possible since nobody staked.
#[test]
fn ac5_cancel_empty_market_is_a_no_op() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, _oracle, xlm_token) = deploy(&env);

    let creator = Address::generate(&env);
    let market_id = client.create_market(&creator, &default_params(&env));

    client.cancel_market(&admin, &market_id);

    let market = client.get_market(&market_id);
    assert!(market.is_cancelled);

    // Escrow is still zero.
    let token = TokenClient::new(&env, &xlm_token);
    assert_eq!(token.balance(&client.address), 0);
}

// ── Bonus: resolve-after-cancel and payout paths remain closed ────────────────

/// The oracle cannot resolve a cancelled market, ensuring the payout path
/// can never be re-opened after a cancellation.
#[test]
fn bonus_resolve_after_cancel_is_rejected() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, oracle, _xlm_token) = deploy(&env);

    let creator = Address::generate(&env);
    let params = default_params(&env);
    let market_id = client.create_market(&creator, &params);

    client.cancel_market(&admin, &market_id);

    env.ledger()
        .with_mut(|li| li.timestamp = params.resolution_time + 1);
    let result = client.try_resolve_market(&oracle, &market_id, &symbol_short!("yes"));
    assert!(matches!(
        result,
        Err(Ok(InsightArenaError::MarketAlreadyCancelled))
    ));
}

/// `claim_payout` on a cancelled market fails with `MarketNotResolved`, not a
/// panic — the resolved-payout path is correctly gated.
#[test]
fn bonus_claim_payout_on_cancelled_market_is_rejected() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, _oracle, xlm_token) = deploy(&env);

    let creator = Address::generate(&env);
    let predictor = Address::generate(&env);
    let stake = 10_000_000_i128;

    let market_id = client.create_market(&creator, &default_params(&env));
    fund(&env, &xlm_token, &predictor, stake);
    client.submit_prediction(&predictor, &market_id, &symbol_short!("yes"), &stake);

    client.cancel_market(&admin, &market_id);

    let result = client.try_claim_payout(&predictor, &market_id);
    assert!(matches!(
        result,
        Err(Ok(InsightArenaError::MarketNotResolved))
    ));
}
