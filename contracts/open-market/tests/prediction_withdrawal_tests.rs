//! Early position withdrawal tests (`prediction::withdraw_position`).
//!
//! Covers: post-lock-time rejection, over-stake rejection, zero/negative
//! rejection, atomic position/market/escrow adjustment on a valid partial
//! withdrawal, full-exit cleanup, resolved/cancelled market rejection, and
//! the emergency pause guard.
//!
//! Supersedes the non-compiling `src/prediction_withdrawal.spec.rs`, which
//! referenced fictitious error variants and a `testutils` module that never
//! existed and was never wired into `lib.rs`.

use soroban_sdk::testutils::{Address as _, Ledger};
use soroban_sdk::token::{Client as TokenClient, StellarAssetClient};
use soroban_sdk::{symbol_short, vec, Address, Env, String, Symbol, BytesN};

use insightarena_contract::market::CreateMarketParams;
use insightarena_contract::{InsightArenaContract, InsightArenaContractClient, InsightArenaError};

fn register_token(env: &Env) -> Address {
    let token_admin = Address::generate(env);
    env.register_stellar_asset_contract_v2(token_admin)
        .address()
}

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
        max_stake: 1_000_000_000,
        is_public: true,
        metadata_hash: BytesN::from_array(env, &[0u8; 32]),
    }
}

fn fund(env: &Env, xlm_token: &Address, recipient: &Address, amount: i128) {
    StellarAssetClient::new(env, xlm_token).mint(recipient, &amount);
}

#[test]
fn test_partial_withdrawal_adjusts_position_pool_and_escrow_atomically() {
    let env = Env::default();
    let (client, xlm_token, _admin, _oracle) = deploy(&env);
    let creator = Address::generate(&env);
    let predictor = Address::generate(&env);
    let stake = 50_000_000_i128;

    let market_id = client.create_market(&creator, &default_params(&env));
    fund(&env, &xlm_token, &predictor, stake);
    client.submit_prediction(&predictor, &market_id, &symbol_short!("yes"), &stake);

    let token = TokenClient::new(&env, &xlm_token);
    let escrow_before = token.balance(&client.address);
    assert_eq!(escrow_before, stake);

    let withdrawal_amount = 20_000_000_i128;
    let (refund_amount, fee_amount) =
        client.withdraw_position(&predictor, &market_id, &withdrawal_amount);

    // Default early-exit fee is 5% (500 bps).
    assert_eq!(fee_amount, withdrawal_amount * 500 / 10_000);
    assert_eq!(refund_amount, withdrawal_amount - fee_amount);
    assert_eq!(refund_amount + fee_amount, withdrawal_amount);

    // The predictor is the sole participant, so the retained fee is
    // redistributed pro-rata across the "remaining participants" — which is
    // just themselves — and lands right back on their own position. Net
    // effect: only `refund_amount` ever actually leaves escrow, and the
    // pool/position/escrow all move by exactly that much.
    let prediction = client.get_prediction(&market_id, &predictor);
    assert_eq!(prediction.stake_amount, stake - refund_amount);

    let market = client.get_market(&market_id);
    assert_eq!(market.total_pool, stake - refund_amount);
    // Position and pool must stay in lockstep for a single-participant market.
    assert_eq!(market.total_pool, prediction.stake_amount);

    // Escrow balance moves by exactly the refunded amount — the fee never
    // left the contract, it was only re-credited as bookkeeping.
    let escrow_after = token.balance(&client.address);
    assert_eq!(escrow_after, escrow_before - refund_amount);

    // Predictor's wallet received exactly the refund.
    assert_eq!(token.balance(&predictor), refund_amount);
}

#[test]
fn test_full_withdrawal_removes_predictor_and_zeroes_pool() {
    let env = Env::default();
    let (client, xlm_token, _admin, _oracle) = deploy(&env);
    let creator = Address::generate(&env);
    let predictor = Address::generate(&env);
    let stake = 30_000_000_i128;

    let market_id = client.create_market(&creator, &default_params(&env));
    fund(&env, &xlm_token, &predictor, stake);
    client.submit_prediction(&predictor, &market_id, &symbol_short!("yes"), &stake);

    let market_before = client.get_market(&market_id);
    assert_eq!(market_before.participant_count, 1);

    client.withdraw_position(&predictor, &market_id, &stake);

    let market_after = client.get_market(&market_id);
    assert_eq!(market_after.participant_count, 0);
    assert_eq!(market_after.total_pool, 0);

    assert!(!client.has_predicted(&market_id, &predictor));
    let result = client.try_get_prediction(&market_id, &predictor);
    assert!(result.is_err(), "prediction should be gone after a full exit");
}

#[test]
fn test_withdrawal_rejected_after_lock_time() {
    let env = Env::default();
    let (client, xlm_token, _admin, _oracle) = deploy(&env);
    let creator = Address::generate(&env);
    let predictor = Address::generate(&env);
    let stake = 20_000_000_i128;

    let params = default_params(&env);
    let end_time = params.end_time;
    let market_id = client.create_market(&creator, &params);
    fund(&env, &xlm_token, &predictor, stake);
    client.submit_prediction(&predictor, &market_id, &symbol_short!("yes"), &stake);

    // Advance past end_time (the withdrawal lock point).
    env.ledger().set_timestamp(end_time + 1);

    let result = client.try_withdraw_position(&predictor, &market_id, &10_000_000_i128);
    assert!(
        matches!(result, Err(Ok(InsightArenaError::MarketExpired))),
        "withdrawal must be rejected once the market has locked"
    );

    // Nothing moved: stake and pool are untouched.
    let prediction = client.get_prediction(&market_id, &predictor);
    assert_eq!(prediction.stake_amount, stake);
}

#[test]
fn test_withdrawal_rejects_zero_and_negative_amounts() {
    let env = Env::default();
    let (client, xlm_token, _admin, _oracle) = deploy(&env);
    let creator = Address::generate(&env);
    let predictor = Address::generate(&env);
    let stake = 20_000_000_i128;

    let market_id = client.create_market(&creator, &default_params(&env));
    fund(&env, &xlm_token, &predictor, stake);
    client.submit_prediction(&predictor, &market_id, &symbol_short!("yes"), &stake);

    let zero_result = client.try_withdraw_position(&predictor, &market_id, &0_i128);
    assert!(matches!(
        zero_result,
        Err(Ok(InsightArenaError::ZeroShareTransfer))
    ));

    let negative_result = client.try_withdraw_position(&predictor, &market_id, &-1_000_i128);
    assert!(matches!(
        negative_result,
        Err(Ok(InsightArenaError::ZeroShareTransfer))
    ));
}

#[test]
fn test_withdrawal_rejects_amount_exceeding_stake() {
    let env = Env::default();
    let (client, xlm_token, _admin, _oracle) = deploy(&env);
    let creator = Address::generate(&env);
    let predictor = Address::generate(&env);
    let stake = 20_000_000_i128;

    let market_id = client.create_market(&creator, &default_params(&env));
    fund(&env, &xlm_token, &predictor, stake);
    client.submit_prediction(&predictor, &market_id, &symbol_short!("yes"), &stake);

    let result = client.try_withdraw_position(&predictor, &market_id, &(stake + 1));
    assert!(matches!(result, Err(Ok(InsightArenaError::InvalidInput))));

    // Stake is untouched by the rejected attempt.
    let prediction = client.get_prediction(&market_id, &predictor);
    assert_eq!(prediction.stake_amount, stake);
}

#[test]
fn test_withdrawal_rejected_on_resolved_market() {
    let env = Env::default();
    let (client, xlm_token, _admin, oracle) = deploy(&env);
    let creator = Address::generate(&env);
    let predictor = Address::generate(&env);
    let stake = 20_000_000_i128;

    let params = default_params(&env);
    let resolution_time = params.resolution_time;
    let market_id = client.create_market(&creator, &params);
    fund(&env, &xlm_token, &predictor, stake);
    client.submit_prediction(&predictor, &market_id, &symbol_short!("yes"), &stake);

    env.ledger().set_timestamp(resolution_time);
    client.resolve_market(&oracle, &market_id, &symbol_short!("yes"));

    let result = client.try_withdraw_position(&predictor, &market_id, &10_000_000_i128);
    assert!(matches!(
        result,
        Err(Ok(InsightArenaError::MarketAlreadyResolved))
    ));
}

#[test]
fn test_withdrawal_rejected_on_cancelled_market() {
    let env = Env::default();
    let (client, xlm_token, admin, _oracle) = deploy(&env);
    let creator = Address::generate(&env);
    let predictor = Address::generate(&env);
    let stake = 20_000_000_i128;

    let market_id = client.create_market(&creator, &default_params(&env));
    fund(&env, &xlm_token, &predictor, stake);
    client.submit_prediction(&predictor, &market_id, &symbol_short!("yes"), &stake);

    client.cancel_market(&admin, &market_id);

    let result = client.try_withdraw_position(&predictor, &market_id, &10_000_000_i128);
    assert!(matches!(
        result,
        Err(Ok(InsightArenaError::MarketAlreadyCancelled))
    ));
}

#[test]
fn test_withdrawal_fails_when_paused() {
    let env = Env::default();
    let (client, xlm_token, _admin, _oracle) = deploy(&env);
    let creator = Address::generate(&env);
    let predictor = Address::generate(&env);
    let stake = 20_000_000_i128;

    let market_id = client.create_market(&creator, &default_params(&env));
    fund(&env, &xlm_token, &predictor, stake);
    client.submit_prediction(&predictor, &market_id, &symbol_short!("yes"), &stake);

    client.set_paused(&true, &1u32);

    let result = client.try_withdraw_position(&predictor, &market_id, &10_000_000_i128);
    assert!(matches!(result, Err(Ok(InsightArenaError::Paused))));
}

#[test]
fn test_sequential_partial_withdrawals_conserve_amounts() {
    // Sole participant: each withdrawal's retained fee is redistributed
    // pro-rata across "remaining participants" — just the withdrawer
    // themselves — and lands right back on their own position. So across
    // repeated withdrawals, only the sum of the *refunded* amounts ever
    // actually leaves the pool/escrow; the fee never does.
    let env = Env::default();
    let (client, xlm_token, _admin, _oracle) = deploy(&env);
    let creator = Address::generate(&env);
    let predictor = Address::generate(&env);
    let stake = 100_000_000_i128;

    let market_id = client.create_market(&creator, &default_params(&env));
    fund(&env, &xlm_token, &predictor, stake);
    client.submit_prediction(&predictor, &market_id, &symbol_short!("yes"), &stake);

    let (refund1, fee1) = client.withdraw_position(&predictor, &market_id, &30_000_000_i128);
    assert_eq!(fee1, 1_500_000);
    assert_eq!(refund1, 28_500_000);

    let after_first = client.get_prediction(&market_id, &predictor);
    assert_eq!(after_first.stake_amount, stake - refund1);

    let (refund2, fee2) =
        client.withdraw_position(&predictor, &market_id, &20_000_000_i128);
    assert_eq!(fee2, 1_000_000);
    assert_eq!(refund2, 19_000_000);

    let after_second = client.get_prediction(&market_id, &predictor);
    assert_eq!(after_second.stake_amount, stake - refund1 - refund2);

    let market = client.get_market(&market_id);
    assert_eq!(market.total_pool, stake - refund1 - refund2);

    let token = TokenClient::new(&env, &xlm_token);
    assert_eq!(token.balance(&predictor), refund1 + refund2);
    assert_eq!(token.balance(&client.address), stake - refund1 - refund2);
}

#[test]
fn test_early_exit_fee_distributed_pro_rata_to_remaining_participants() {
    let env = Env::default();
    let (client, xlm_token, _admin, _oracle) = deploy(&env);
    let creator = Address::generate(&env);
    let predictor_a = Address::generate(&env);
    let predictor_b = Address::generate(&env);
    let stake_a = 50_000_000_i128;
    let stake_b = 30_000_000_i128;

    let market_id = client.create_market(&creator, &default_params(&env));
    fund(&env, &xlm_token, &predictor_a, stake_a);
    fund(&env, &xlm_token, &predictor_b, stake_b);
    client.submit_prediction(&predictor_a, &market_id, &symbol_short!("yes"), &stake_a);
    client.submit_prediction(&predictor_b, &market_id, &symbol_short!("no"), &stake_b);

    let withdrawal = 10_000_000_i128;
    let (refund_a, fee) = client.withdraw_position(&predictor_a, &market_id, &withdrawal);

    // 5% of 10_000_000 = 500_000.
    assert_eq!(fee, 500_000);
    assert_eq!(refund_a, 9_500_000);

    // The fee is redistributed pro-rata across every current predictor,
    // including A's own reduced position (A remains a "remaining
    // participant" — they only exited part of their stake). The pool at
    // redistribution time is A's reduced stake plus B's untouched stake.
    let a_reduced_stake = stake_a - withdrawal; // 40_000_000
    let remaining_pool = a_reduced_stake + stake_b; // 70_000_000

    let expected_share_a = fee * a_reduced_stake / remaining_pool;
    let expected_share_b = fee * stake_b / remaining_pool;

    let pred_a = client.get_prediction(&market_id, &predictor_a);
    assert_eq!(pred_a.stake_amount, a_reduced_stake + expected_share_a);

    let pred_b = client.get_prediction(&market_id, &predictor_b);
    assert_eq!(pred_b.stake_amount, stake_b + expected_share_b);

    // Only `refund_a` ever actually leaves the pool/escrow; the fee is
    // reabsorbed (modulo integer-division dust, which stays in escrow but
    // is not tracked against any individual position).
    let market = client.get_market(&market_id);
    assert_eq!(
        market.total_pool,
        remaining_pool + expected_share_a + expected_share_b
    );

    let token = TokenClient::new(&env, &xlm_token);
    assert_eq!(token.balance(&predictor_a), refund_a);
    assert_eq!(
        token.balance(&client.address),
        stake_a + stake_b - refund_a
    );
}

#[test]
fn test_get_early_exit_fee_estimate_matches_default_rate() {
    let env = Env::default();
    let (client, _xlm_token, _admin, _oracle) = deploy(&env);

    let withdrawal = 100_000_000_i128;
    let (refund, fee) = client.get_early_exit_fee_estimate(&withdrawal);

    // Default 5% (500 bps) early-exit fee.
    assert_eq!(fee, 5_000_000);
    assert_eq!(refund, 95_000_000);
    assert_eq!(refund + fee, withdrawal);
}

#[test]
fn test_early_exit_fee_configuration_affects_withdrawal() {
    let env = Env::default();
    let (client, xlm_token, admin, _oracle) = deploy(&env);
    let creator = Address::generate(&env);
    let predictor = Address::generate(&env);
    let stake = 50_000_000_i128;

    client.set_early_exit_fee_bps(&admin, &1_000_u32); // 10%

    let market_id = client.create_market(&creator, &default_params(&env));
    fund(&env, &xlm_token, &predictor, stake);
    client.submit_prediction(&predictor, &market_id, &symbol_short!("yes"), &stake);

    let withdrawal = 20_000_000_i128;
    let (refund, fee) = client.withdraw_position(&predictor, &market_id, &withdrawal);

    assert_eq!(fee, 2_000_000);
    assert_eq!(refund, 18_000_000);
}
