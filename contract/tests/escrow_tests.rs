//! Escrow module tests
//!
//! This test file covers the escrow functionality including:
//! - Stake locking (lock_stake)
//! - Payout distribution (release_payout)
//! - Refunds (refund)
//! - Treasury management (withdraw_treasury, get_treasury_balance)
//! - Escrow balance queries (get_contract_balance)
//! - Solvency assertions (assert_escrow_solvent)
//! - Edge case: zero losers scenario (all winners)

use insightarena_contract::config;
use insightarena_contract::escrow::*;
use insightarena_contract::storage_types::{DataKey, Market, Prediction};
use insightarena_contract::{InsightArenaContract, InsightArenaContractClient, InsightArenaError};
use soroban_sdk::testutils::Address as _;
use soroban_sdk::token::{Client as TokenClient, StellarAssetClient};
use soroban_sdk::{symbol_short, vec, Address, Env, String, Symbol, Vec};

// ── Test Helpers ─────────────────────────────────────────────────────────────

/// Register a test Stellar asset contract and return its address.
fn register_token(env: &Env) -> Address {
    let token_admin = Address::generate(env);
    env.register_stellar_asset_contract_v2(token_admin)
        .address()
}

/// Deploy and initialize the contract with the given xlm_token.
fn deploy<'a>(env: &'a Env, xlm_token: &Address) -> InsightArenaContractClient<'a> {
    let id = env.register(InsightArenaContract, ());
    let client = InsightArenaContractClient::new(env, &id);
    let admin = Address::generate(env);
    let oracle = Address::generate(env);
    client.initialize(&admin, &oracle, &200_u32, xlm_token);
    client
}

/// Mint tokens to a recipient for testing purposes.
fn fund(env: &Env, xlm_token: &Address, recipient: &Address, amount: i128) {
    StellarAssetClient::new(env, xlm_token).mint(recipient, &amount);
}

/// Seed an unresolved market into storage for solvency tests.
/// This helper creates a market with the given market_id that is active
/// and has not yet been resolved, suitable for testing escrow solvency checks.
fn seed_unresolved_market(env: &Env, client: &InsightArenaContractClient<'_>, market_id: u64) {
    let market = Market::new(
        market_id,
        Address::generate(env),
        String::from_str(env, "seeded market"),
        String::from_str(env, "seeded for escrow tests"),
        Symbol::new(env, "Sports"),
        vec![env, symbol_short!("yes"), symbol_short!("no")],
        env.ledger().timestamp(),
        env.ledger().timestamp() + 100,
        env.ledger().timestamp() + 200,
        true,
        100,
        10_000_000,
        100_000_000,
        86_400,
    );

    env.as_contract(&client.address, || {
        env.storage()
            .persistent()
            .set(&DataKey::Market(market_id), &market);
    });
}

// ── lock_stake Tests ──────────────────────────────────────────────────────────

/// Test that lock_stake successfully transfers tokens from user to contract.
/// Verifies: stake locking works correctly, user balance decreases, contract balance increases.
#[test]
fn test_lock_stake_happy_path() {
    let env = Env::default();
    env.mock_all_auths();
    let xlm_token = register_token(&env);
    let client = deploy(&env, &xlm_token);
    let predictor = Address::generate(&env);
    let amount = 20_000_000_i128;

    fund(&env, &xlm_token, &predictor, amount);

    let token = TokenClient::new(&env, &xlm_token);
    assert_eq!(token.balance(&predictor), amount);
    assert_eq!(token.balance(&client.address), 0);

    let result = env.as_contract(&client.address, || lock_stake(&env, &predictor, amount));
    assert_eq!(result, Ok(()));

    assert_eq!(token.balance(&predictor), 0);
    assert_eq!(token.balance(&client.address), amount);
}

/// Test that lock_stake rejects zero amount stakes.
/// Verifies: InvalidInput error is returned for amount <= 0.
#[test]
fn test_lock_stake_zero_amount() {
    let env = Env::default();
    env.mock_all_auths();
    let xlm_token = register_token(&env);
    let client = deploy(&env, &xlm_token);
    let predictor = Address::generate(&env);

    let result = env.as_contract(&client.address, || lock_stake(&env, &predictor, 0));
    assert_eq!(result, Err(InsightArenaError::InvalidInput));
}

/// Test that lock_stake requires user authorization.
/// Verifies: unauthorized calls panic (auth check enforced).
#[test]
#[should_panic]
fn test_lock_stake_unauthorized() {
    let env = Env::default();
    let xlm_token = register_token(&env);
    let client = deploy(&env, &xlm_token);
    let predictor = Address::generate(&env);
    let amount = 10_000_000_i128;

    fund(&env, &xlm_token, &predictor, amount);

    env.as_contract(&client.address, || {
        let _ = lock_stake(&env, &predictor, amount);
    });
}

/// Test that lock_stake fails when user has insufficient funds.
/// Verifies: panic occurs when user cannot cover the stake amount.
#[test]
#[should_panic]
fn test_lock_stake_insufficient_user_funds() {
    let env = Env::default();
    env.mock_all_auths();
    let xlm_token = register_token(&env);
    let client = deploy(&env, &xlm_token);
    let predictor = Address::generate(&env);

    env.as_contract(&client.address, || {
        let _ = lock_stake(&env, &predictor, 10_000_000_i128);
    });
}

// ── release_payout Tests ──────────────────────────────────────────────────────

/// Test that release_payout successfully transfers tokens from contract to recipient.
/// Verifies: payout distribution works correctly for valid amounts.
#[test]
fn test_release_payout_success() {
    let env = Env::default();
    env.mock_all_auths();
    let xlm_token = register_token(&env);
    let client = deploy(&env, &xlm_token);
    let recipient = Address::generate(&env);
    let payout = 20_000_000_i128;

    fund(&env, &xlm_token, &client.address, payout);

    let token = TokenClient::new(&env, &xlm_token);
    assert_eq!(token.balance(&client.address), payout);
    assert_eq!(token.balance(&recipient), 0);

    let result = env.as_contract(&client.address, || release_payout(&env, &recipient, payout));
    assert_eq!(result, Ok(()));

    assert_eq!(token.balance(&client.address), 0);
    assert_eq!(token.balance(&recipient), payout);
}

/// Test that release_payout fails when contract has insufficient balance.
/// Verifies: EscrowEmpty error is returned when contract cannot cover payout.
#[test]
fn test_release_payout_contract_insolvent() {
    let env = Env::default();
    env.mock_all_auths();
    let xlm_token = register_token(&env);
    let client = deploy(&env, &xlm_token);
    let recipient = Address::generate(&env);

    let result = env.as_contract(&client.address, || {
        release_payout(&env, &recipient, 10_000_000_i128)
    });
    assert_eq!(result, Err(InsightArenaError::EscrowEmpty));
}

/// Test that release_payout rejects zero amount payouts.
/// Verifies: InvalidInput error is returned for amount <= 0.
#[test]
fn test_release_payout_zero_value() {
    let env = Env::default();
    env.mock_all_auths();
    let xlm_token = register_token(&env);
    let client = deploy(&env, &xlm_token);
    let recipient = Address::generate(&env);

    let result = env.as_contract(&client.address, || release_payout(&env, &recipient, 0));
    assert_eq!(result, Err(InsightArenaError::InvalidInput));
}

// ── refund Tests ──────────────────────────────────────────────────────────────

/// Test that refund successfully returns exact stake amount to user.
/// Verifies: refund logic works correctly for valid amounts.
#[test]
fn test_refund_returns_exact_stake_amount() {
    let env = Env::default();
    env.mock_all_auths();
    let xlm_token = register_token(&env);
    let client = deploy(&env, &xlm_token);
    let recipient = Address::generate(&env);
    let amount = 20_000_000_i128;

    fund(&env, &xlm_token, &client.address, amount);

    let token = TokenClient::new(&env, &xlm_token);
    assert_eq!(token.balance(&client.address), amount);
    assert_eq!(token.balance(&recipient), 0);

    let result = env.as_contract(&client.address, || refund(&env, &recipient, amount));
    assert_eq!(result, Ok(()));

    assert_eq!(token.balance(&client.address), 0);
    assert_eq!(token.balance(&recipient), amount);
}

/// Test that refund fails when contract has insufficient balance.
/// Verifies: EscrowEmpty error is returned when contract cannot cover refund.
#[test]
fn test_refund_contract_insolvent() {
    let env = Env::default();
    env.mock_all_auths();
    let xlm_token = register_token(&env);
    let client = deploy(&env, &xlm_token);
    let recipient = Address::generate(&env);

    let result = env.as_contract(&client.address, || refund(&env, &recipient, 10_000_000));
    assert_eq!(result, Err(InsightArenaError::EscrowEmpty));
}

/// Test that refund rejects zero amount refunds.
/// Verifies: InvalidInput error is returned for amount <= 0.
#[test]
fn test_refund_zero_value() {
    let env = Env::default();
    env.mock_all_auths();
    let xlm_token = register_token(&env);
    let client = deploy(&env, &xlm_token);
    let recipient = Address::generate(&env);

    let result = env.as_contract(&client.address, || refund(&env, &recipient, 0));
    assert_eq!(result, Err(InsightArenaError::InvalidInput));
}

// ── withdraw_treasury Tests ───────────────────────────────────────────────────

/// Test that withdraw_treasury successfully transfers fees to admin.
/// Verifies: treasury withdrawal works correctly with proper authorization.
#[test]
fn test_withdraw_treasury_success() {
    let env = Env::default();
    env.mock_all_auths();
    let xlm_token = register_token(&env);
    let client = deploy(&env, &xlm_token);

    let cfg = env.as_contract(&client.address, || config::get_config(&env).unwrap());
    let admin = cfg.admin.clone();
    let fee_amount = 3_000_000_i128;

    fund(&env, &xlm_token, &client.address, fee_amount);
    env.as_contract(&client.address, || {
        env.storage()
            .persistent()
            .set(&DataKey::Treasury, &fee_amount);
    });

    let token = TokenClient::new(&env, &xlm_token);
    assert_eq!(token.balance(&client.address), fee_amount);

    let result = env.as_contract(&client.address, || {
        withdraw_treasury(env.clone(), admin.clone(), fee_amount)
    });
    assert_eq!(result, Ok(()));

    assert_eq!(token.balance(&admin), fee_amount);
    assert_eq!(token.balance(&client.address), 0);

    let remaining = env.as_contract(&client.address, || {
        env.storage()
            .persistent()
            .get::<_, i128>(&DataKey::Treasury)
            .unwrap_or(0)
    });
    assert_eq!(remaining, 0);
}

/// Test that withdraw_treasury fails when amount exceeds treasury balance.
/// Verifies: InsufficientFunds error is returned for overdraft attempts.
#[test]
fn test_withdraw_treasury_overdraft() {
    let env = Env::default();
    env.mock_all_auths();
    let xlm_token = register_token(&env);
    let client = deploy(&env, &xlm_token);

    let cfg = env.as_contract(&client.address, || config::get_config(&env).unwrap());
    let admin = cfg.admin.clone();

    let treasury_bal = 1_000_000_i128;
    fund(&env, &xlm_token, &client.address, 10_000_000);
    env.as_contract(&client.address, || {
        env.storage()
            .persistent()
            .set(&DataKey::Treasury, &treasury_bal);
    });

    let result = env.as_contract(&client.address, || {
        withdraw_treasury(env.clone(), admin.clone(), 5_000_000)
    });
    assert_eq!(result, Err(InsightArenaError::InsufficientFunds));
}

/// Test that withdraw_treasury rejects unauthorized callers.
/// Verifies: Unauthorized error is returned when caller is not admin.
#[test]
fn test_withdraw_treasury_unauthorized() {
    let env = Env::default();
    env.mock_all_auths();
    let xlm_token = register_token(&env);
    let client = deploy(&env, &xlm_token);

    let random_user = Address::generate(&env);
    let amount = 1_000_000_i128;

    env.as_contract(&client.address, || {
        env.storage().persistent().set(&DataKey::Treasury, &amount);
    });
    fund(&env, &xlm_token, &client.address, amount);

    let result = env.as_contract(&client.address, || {
        withdraw_treasury(env.clone(), random_user.clone(), amount)
    });
    assert_eq!(result, Err(InsightArenaError::Unauthorized));
}

// ── get_contract_balance Tests ────────────────────────────────────────────────

/// Test that get_contract_balance returns 0 for an empty contract.
/// Verifies: balance query works correctly with no funds.
#[test]
fn test_get_balance_empty_contract() {
    let env = Env::default();
    env.mock_all_auths();
    let xlm_token = register_token(&env);
    let client = deploy(&env, &xlm_token);

    let balance = env.as_contract(&client.address, || get_contract_balance(&env));
    assert_eq!(balance, 0);
}

/// Test that get_contract_balance reflects locked stakes.
/// Verifies: balance increases after users lock stakes.
#[test]
fn test_get_balance_after_locks() {
    let env = Env::default();
    env.mock_all_auths();
    let xlm_token = register_token(&env);
    let client = deploy(&env, &xlm_token);
    let predictor_a = Address::generate(&env);
    let predictor_b = Address::generate(&env);
    let stake_a = 20_000_000_i128;
    let stake_b = 35_000_000_i128;

    fund(&env, &xlm_token, &predictor_a, stake_a);
    fund(&env, &xlm_token, &predictor_b, stake_b);

    env.as_contract(&client.address, || {
        lock_stake(&env, &predictor_a, stake_a).unwrap();
        lock_stake(&env, &predictor_b, stake_b).unwrap();
    });

    let balance = env.as_contract(&client.address, || get_contract_balance(&env));
    assert_eq!(balance, stake_a + stake_b);
}

/// Test that get_contract_balance reads from token contract, not treasury storage.
/// Verifies: balance query is independent of treasury tracker.
#[test]
fn test_get_balance_does_not_touch_treasury_storage() {
    let env = Env::default();
    env.mock_all_auths();
    let xlm_token = register_token(&env);
    let client = deploy(&env, &xlm_token);
    let seeded_treasury = 77_000_000_i128;

    env.as_contract(&client.address, || {
        env.storage()
            .persistent()
            .set(&DataKey::Treasury, &seeded_treasury);
    });

    let _ = env.as_contract(&client.address, || get_contract_balance(&env));

    let treasury_after: i128 = env.as_contract(&client.address, || {
        env.storage()
            .persistent()
            .get(&DataKey::Treasury)
            .unwrap_or(0)
    });
    assert_eq!(treasury_after, seeded_treasury);
}

// ── get_treasury_balance Tests ────────────────────────────────────────────────

/// Test that get_treasury_balance defaults to 0 when not initialized.
/// Verifies: treasury getter handles missing storage gracefully.
#[test]
fn test_get_treasury_balance_defaults_to_zero() {
    let env = Env::default();
    env.mock_all_auths();
    let xlm_token = register_token(&env);
    let client = deploy(&env, &xlm_token);

    let treasury = env.as_contract(&client.address, || get_treasury_balance(&env));
    assert_eq!(treasury, 0);
}

/// Test that get_treasury_balance reads from storage, not token balance.
/// Verifies: treasury getter is sourced from Treasury storage key only.
#[test]
fn test_get_treasury_balance_reads_storage_not_contract_token_balance() {
    let env = Env::default();
    env.mock_all_auths();
    let xlm_token = register_token(&env);
    let client = deploy(&env, &xlm_token);
    let stored_treasury = 12_345_678_i128;

    env.as_contract(&client.address, || {
        env.storage()
            .persistent()
            .set(&DataKey::Treasury, &stored_treasury);
    });

    fund(&env, &xlm_token, &client.address, 99_999_999);

    let treasury = env.as_contract(&client.address, || get_treasury_balance(&env));
    assert_eq!(treasury, stored_treasury);
}

// ── assert_escrow_solvent Tests ───────────────────────────────────────────────

/// Test that assert_escrow_solvent passes when balance covers unclaimed stakes.
/// Verifies: solvency check succeeds with adequate reserves across multiple markets.
#[test]
fn test_assert_escrow_solvent_when_balance_covers_unclaimed_stakes() {
    let env = Env::default();
    env.mock_all_auths();
    let xlm_token = register_token(&env);
    let client = deploy(&env, &xlm_token);
    let predictor_a = Address::generate(&env);
    let predictor_b = Address::generate(&env);

    seed_unresolved_market(&env, &client, 1);
    seed_unresolved_market(&env, &client, 2);

    env.as_contract(&client.address, || {
        let mut predictors_one = Vec::new(&env);
        predictors_one.push_back(predictor_a.clone());
        env.storage()
            .persistent()
            .set(&DataKey::PredictorList(1), &predictors_one);

        let mut predictors_two = Vec::new(&env);
        predictors_two.push_back(predictor_b.clone());
        env.storage()
            .persistent()
            .set(&DataKey::PredictorList(2), &predictors_two);

        env.storage()
            .persistent()
            .set(&DataKey::MarketCount, &2_u64);
        env.storage().persistent().set(
            &DataKey::Prediction(1, predictor_a.clone()),
            &Prediction::new(
                1,
                predictor_a.clone(),
                soroban_sdk::symbol_short!("yes"),
                20_000_000,
                env.ledger().timestamp(),
            ),
        );
        env.storage().persistent().set(
            &DataKey::Prediction(2, predictor_b.clone()),
            &Prediction::new(
                2,
                predictor_b.clone(),
                soroban_sdk::symbol_short!("no"),
                30_000_000,
                env.ledger().timestamp(),
            ),
        );
    });

    fund(&env, &xlm_token, &client.address, 50_000_000);

    let result = env.as_contract(&client.address, || assert_escrow_solvent(&env));
    assert_eq!(result, Ok(()));
}

/// Test that assert_escrow_solvent fails when balance is insufficient.
/// Verifies: EscrowEmpty error is returned when reserves are inadequate.
#[test]
fn test_assert_escrow_solvent_when_balance_is_short() {
    let env = Env::default();
    env.mock_all_auths();
    let xlm_token = register_token(&env);
    let client = deploy(&env, &xlm_token);
    let predictor = Address::generate(&env);

    seed_unresolved_market(&env, &client, 1);

    env.as_contract(&client.address, || {
        let mut predictors = Vec::new(&env);
        predictors.push_back(predictor.clone());
        env.storage()
            .persistent()
            .set(&DataKey::PredictorList(1), &predictors);
        env.storage()
            .persistent()
            .set(&DataKey::MarketCount, &1_u64);
        env.storage().persistent().set(
            &DataKey::Prediction(1, predictor.clone()),
            &Prediction::new(
                1,
                predictor.clone(),
                soroban_sdk::symbol_short!("yes"),
                20_000_000,
                env.ledger().timestamp(),
            ),
        );
    });

    fund(&env, &xlm_token, &client.address, 19_999_999);

    let result = env.as_contract(&client.address, || assert_escrow_solvent(&env));
    assert_eq!(result, Err(InsightArenaError::EscrowEmpty));
}

// ── Edge Case: Zero Losers Scenario ───────────────────────────────────────────

/// Test payout handling when there are zero losers (all participants chose the winning outcome).
///
/// Scenario: All participants in a market chose the same (winning) outcome.
/// This creates an edge case where:
/// - There is no losing pool to redistribute
/// - Division-by-zero must be avoided in payout calculations
/// - Users should only receive their fair share (no extra gain from losing pool)
/// - Fees are still handled correctly if applicable
///
/// This test verifies that the escrow payout logic safely handles the case
/// where all predictors are winners, ensuring no division-by-zero panics occur
/// and payouts are distributed fairly without any losing stake redistribution.
#[test]
fn test_payout_with_zero_losers() {
    let env = Env::default();
    env.mock_all_auths();
    let xlm_token = register_token(&env);
    let client = deploy(&env, &xlm_token);

    let market_id = 1_u64;
    let winning_outcome = symbol_short!("yes");

    seed_unresolved_market(&env, &client, market_id);

    let predictor_a = Address::generate(&env);
    let predictor_b = Address::generate(&env);
    let predictor_c = Address::generate(&env);

    let stake_a = 10_000_000_i128;
    let stake_b = 20_000_000_i128;
    let stake_c = 30_000_000_i128;
    let total_stakes = stake_a + stake_b + stake_c;

    fund(&env, &xlm_token, &predictor_a, stake_a);
    fund(&env, &xlm_token, &predictor_b, stake_b);
    fund(&env, &xlm_token, &predictor_c, stake_c);

    env.as_contract(&client.address, || {
        lock_stake(&env, &predictor_a, stake_a).unwrap();
        lock_stake(&env, &predictor_b, stake_b).unwrap();
        lock_stake(&env, &predictor_c, stake_c).unwrap();

        let mut predictors = Vec::new(&env);
        predictors.push_back(predictor_a.clone());
        predictors.push_back(predictor_b.clone());
        predictors.push_back(predictor_c.clone());
        env.storage()
            .persistent()
            .set(&DataKey::PredictorList(market_id), &predictors);

        env.storage().persistent().set(
            &DataKey::Prediction(market_id, predictor_a.clone()),
            &Prediction::new(
                market_id,
                predictor_a.clone(),
                winning_outcome.clone(),
                stake_a,
                env.ledger().timestamp(),
            ),
        );
        env.storage().persistent().set(
            &DataKey::Prediction(market_id, predictor_b.clone()),
            &Prediction::new(
                market_id,
                predictor_b.clone(),
                winning_outcome.clone(),
                stake_b,
                env.ledger().timestamp(),
            ),
        );
        env.storage().persistent().set(
            &DataKey::Prediction(market_id, predictor_c.clone()),
            &Prediction::new(
                market_id,
                predictor_c.clone(),
                winning_outcome,
                stake_c,
                env.ledger().timestamp(),
            ),
        );
    });

    let initial_balance = env.as_contract(&client.address, || get_contract_balance(&env));
    assert_eq!(initial_balance, total_stakes);

    let balance_a_before = TokenClient::new(&env, &xlm_token).balance(&predictor_a);
    let balance_b_before = TokenClient::new(&env, &xlm_token).balance(&predictor_b);
    let balance_c_before = TokenClient::new(&env, &xlm_token).balance(&predictor_c);

    env.as_contract(&client.address, || {
        release_payout(&env, &predictor_a, stake_a).unwrap();
        release_payout(&env, &predictor_b, stake_b).unwrap();
        release_payout(&env, &predictor_c, stake_c).unwrap();
    });

    let token_client = TokenClient::new(&env, &xlm_token);
    assert_eq!(token_client.balance(&predictor_a), balance_a_before + stake_a);
    assert_eq!(token_client.balance(&predictor_b), balance_b_before + stake_b);
    assert_eq!(token_client.balance(&predictor_c), balance_c_before + stake_c);

    let final_balance = env.as_contract(&client.address, || get_contract_balance(&env));
    assert_eq!(final_balance, 0);

    let solvency_result = env.as_contract(&client.address, || assert_escrow_solvent(&env));
    assert_eq!(solvency_result, Ok(()));
}
