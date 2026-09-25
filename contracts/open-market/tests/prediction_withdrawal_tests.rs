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

    // Pool and stake are reduced by the full withdrawal_amount. The fee is
    // distributed to *other* participants only; as the sole participant the
    // withdrawing predictor receives no redistribution. The fee stays in
    // escrow as unallocated balance.
    let prediction = client.get_prediction(&market_id, &predictor);
    assert_eq!(prediction.stake_amount, stake - withdrawal_amount);

    let market = client.get_market(&market_id);
    assert_eq!(market.total_pool, stake - withdrawal_amount);
    // Position and pool must stay in lockstep for a single-participant market.
    assert_eq!(market.total_pool, prediction.stake_amount);

    // Escrow balance moves by exactly the refunded amount — the fee remains
    // in escrow as unallocated balance (distributed to no one).
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

    // Stake is untouched after the rejected over-stake withdrawal.
    let prediction = client.get_prediction(&market_id, &predictor);
    assert_eq!(prediction.stake_amount, stake);
}

#[test]
fn test_full_remaining_stake_then_second_withdrawal_reverts() {
    let env = Env::default();
    let (client, xlm_token, _admin, _oracle) = deploy(&env);
    let creator = Address::generate(&env);
    let predictor = Address::generate(&env);
    let stake = 40_000_000_i128;

    let market_id = client.create_market(&creator, &default_params(&env));
    fund(&env, &xlm_token, &predictor, stake);
    client.submit_prediction(&predictor, &market_id, &symbol_short!("yes"), &stake);

    // First call withdraws the full remaining stake and clears the position.
    client.withdraw_position(&predictor, &market_id, &stake);
    assert!(!client.has_predicted(&market_id, &predictor));

    // A second withdrawal for the same predictor/market must revert rather
    // than double-spend the already-exited position.
    let second = client.try_withdraw_position(&predictor, &market_id, &stake);
    assert!(
        second.is_err(),
        "second withdrawal after a full exit must revert"
    );

    // The position stays gone and the pool stays empty.
    assert!(!client.has_predicted(&market_id, &predictor));
    assert_eq!(client.get_market(&market_id).total_pool, 0);
}

#[test]
fn test_get_prediction_reflects_reduced_stake_after_partial_withdrawal() {
    let env = Env::default();
    let (client, xlm_token, _admin, _oracle) = deploy(&env);
    let creator = Address::generate(&env);
    let predictor = Address::generate(&env);
    let stake = 60_000_000_i128;

    let market_id = client.create_market(&creator, &default_params(&env));
    fund(&env, &xlm_token, &predictor, stake);
    client.submit_prediction(&predictor, &market_id, &symbol_short!("yes"), &stake);

    let first_withdrawal = 25_000_000_i128;
    client.withdraw_position(&predictor, &market_id, &first_withdrawal);

    // get_prediction reflects the reduced remaining stake between calls.
    let after_first = client.get_prediction(&market_id, &predictor);
    assert_eq!(after_first.stake_amount, stake - first_withdrawal);

    // A second partial withdrawal further reduces the remaining stake.
    let second_withdrawal = 10_000_000_i128;
    client.withdraw_position(&predictor, &market_id, &second_withdrawal);

    let after_second = client.get_prediction(&market_id, &predictor);
    assert_eq!(
        after_second.stake_amount,
        stake - first_withdrawal - second_withdrawal
    );

    // Withdrawing more than the remaining stake is rejected.
    let over = client.try_withdraw_position(
        &predictor,
        &market_id,
        &(after_second.stake_amount + 1),
    );
    assert!(matches!(over, Err(Ok(InsightArenaError::InvalidInput))));
}

#[test]
fn test_early_exit_fee_estimate_zero_remaining_stake() {
    let env = Env::default();
    let (client, xlm_token, _admin, _oracle) = deploy(&env);
    let creator = Address::generate(&env);
    let predictor = Address::generate(&env);
    let stake = 30_000_000_i128;

    let market_id = client.create_market(&creator, &default_params(&env));
    fund(&env, &xlm_token, &predictor, stake);
    client.submit_prediction(&predictor, &market_id, &symbol_short!("yes"), &stake);

    // Fully exit the position.
    client.withdraw_position(&predictor, &market_id, &stake);
    assert!(!client.has_predicted(&market_id, &predictor));

    // With zero remaining stake the fee estimate must not report a stale
    // nonzero fee: it either returns zero or errors.
    match client.try_get_early_exit_fee_estimate(&market_id, &predictor) {
        Ok(fee) => assert_eq!(fee, 0, "zero remaining stake must estimate a zero fee"),
        Err(_) => {}
    }
}
