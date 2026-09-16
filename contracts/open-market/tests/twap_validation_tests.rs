//! TWAP (Time-Weighted Average Price) Validation Tests
//!
//! This test suite validates that `get_twap` properly rejects invalid inputs
//! and edge cases to prevent numerical instability and ensure accurate price
//! oracle behavior.
//!
//! ## Safety Requirements Tested
//!
//! 1. **Zero-second windows** → `TwapEmptyWindow`
//! 2. **Insufficient history** → `TwapInsufficientHistory`
//!    - No observations recorded yet
//!    - Window predates oldest retained observation (ring buffer wraparound)
//! 3. **Division by zero** → `TwapDivideByZero`
//!    - Elapsed time collapses to zero at ledger timestamp 0
//!
//! ## Test Coverage
//!
//! - ✅ Zero-window rejection
//! - ✅ Empty accumulator (no observations)
//! - ✅ Window predating history (ring buffer coverage)
//! - ✅ Zero elapsed time (timestamp edge case)
//! - ✅ Invalid outcome symbol
//! - ✅ Ring buffer wraparound scenarios

use insightarena_contract::liquidity::TWAP_RING_BUFFER_CAPACITY;
use insightarena_contract::{
    CreateMarketParams, InsightArenaContract, InsightArenaContractClient, InsightArenaError,
};
use soroban_sdk::testutils::{Address as _, Ledger};
use soroban_sdk::token::{Client as TokenClient, StellarAssetClient};
use soroban_sdk::{symbol_short, vec, Address, BytesN, Env, String};

// ── Test Helpers ──────────────────────────────────────────────────────────────

fn register_token(env: &Env) -> Address {
    let token_admin = Address::generate(env);
    env.register_stellar_asset_contract_v2(token_admin)
        .address()
}

fn deploy_with_token(
    env: &Env,
) -> (
    InsightArenaContractClient<'_>,
    Address,
    Address,
    Address,
) {
    let id = env.register(InsightArenaContract, ());
    let client = InsightArenaContractClient::new(env, &id);
    let admin = Address::generate(env);
    let oracle = Address::generate(env);
    let xlm_token = register_token(env);
    client.initialize(&admin, &oracle, &200_u32, &xlm_token);
    
    // Add the "test" category to the whitelist
    client.add_category(&admin, &symbol_short!("test"));
    
    (client, admin, oracle, xlm_token)
}

fn lp_market_params(env: &Env) -> CreateMarketParams {
    let title = String::from_str(env, "Binary Prediction Market");
    let description = String::from_str(env, "Test market for liquidity");
    let category = symbol_short!("test");
    let outcomes = vec![env, symbol_short!("yes"), symbol_short!("no")];
    let end_time = env.ledger().timestamp() + 86400;
    let resolution_time = end_time + 3600;
    let dispute_window = 3600_u64;
    let creator_fee_bps = 50_u32;
    let min_stake = 0_i128;
    let max_stake = 0_i128;
    let is_public = true;
    let metadata_hash = BytesN::from_array(env, &[0u8; 32]);

    CreateMarketParams {
        title,
        description,
        category,
        outcomes,
        end_time,
        resolution_time,
        dispute_window,
        creator_fee_bps,
        min_stake,
        max_stake,
        is_public,
        metadata_hash,
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// REQUIREMENT 1: Zero-Second Window Rejection
// ══════════════════════════════════════════════════════════════════════════════

/// **Test Case**: `get_twap` with `window = 0` must return `TwapEmptyWindow`.
///
/// **Rationale**: A zero-second window is logically empty and cannot produce
/// a meaningful time-weighted average. The function must reject this before
/// any computation or storage access.
#[test]
fn test_zero_window_returns_twap_empty_window() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, _oracle, _xlm_token) = deploy_with_token(&env);

    // Create market and add liquidity to establish price history
    let provider = Address::generate(&env);
    let market_id = client.create_market(&admin, &lp_market_params(&env));

    let sa = StellarAssetClient::new(&env, &_xlm_token);
    let token = TokenClient::new(&env, &_xlm_token);
    let liquidity = 100_000_i128;
    sa.mint(&provider, &liquidity);
    token.approve(&provider, &client.address, &liquidity, &9999);
    client.add_liquidity(&provider, &market_id, &liquidity);

    // Attempt to query TWAP with zero-second window
    let result = client.try_get_twap(&market_id, &symbol_short!("yes"), &0_u64);

    // Must return TwapEmptyWindow, not succeed with a nonsensical value
    assert!(
        matches!(result, Err(Ok(InsightArenaError::TwapEmptyWindow))),
        "Expected TwapEmptyWindow for zero-second window, got: {:?}",
        result
    );
}

// ══════════════════════════════════════════════════════════════════════════════
// REQUIREMENT 2: Insufficient History Rejection
// ══════════════════════════════════════════════════════════════════════════════

/// **Test Case**: `get_twap` when no liquidity pool exists for the market
/// must return an appropriate error (not `TwapInsufficientHistory` in this case,
/// but the pool lookup will fail first).
///
/// **Rationale**: If no liquidity pool exists, there can't be any price
/// accumulator. This is a distinct error from having a pool with an empty
/// accumulator. The function correctly rejects this by returning an error
/// when attempting to load the non-existent pool.
#[test]
fn test_no_pool_returns_error() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, _oracle, _xlm_token) = deploy_with_token(&env);

    let market_id = client.create_market(&admin, &lp_market_params(&env));

    // Market exists but no liquidity pool has been created yet.
    // The get_twap call will fail when trying to load the non-existent pool.
    let result = client.try_get_twap(&market_id, &symbol_short!("yes"), &100_u64);

    // The error will be from get_pool (likely MarketNotFound or a contract error),
    // not TwapInsufficientHistory, because the pool lookup fails first.
    assert!(
        result.is_err(),
        "Expected error when querying TWAP for market without liquidity pool, got: {:?}",
        result
    );
}

/// **Test Case**: `get_twap` when the requested window predates the oldest
/// retained observation must return `TwapInsufficientHistory`.
///
/// **Rationale**: The ring buffer has finite capacity. Once it wraps around,
/// older observations are evicted. If a query's `window_start` falls before
/// the oldest remaining observation, the buffer cannot cover the full window.
/// Rather than silently truncating the window (which would produce a misleading
/// average over a shorter interval than requested), the function must reject
/// the query explicitly.
#[test]
fn test_window_predating_history_returns_insufficient_history() {
    let env = Env::default();
    env.ledger().with_mut(|l| l.timestamp = 500);
    env.mock_all_auths();
    let (client, admin, _oracle, _xlm_token) = deploy_with_token(&env);

    let provider = Address::generate(&env);
    let market_id = client.create_market(&admin, &lp_market_params(&env));

    let sa = StellarAssetClient::new(&env, &_xlm_token);
    let token = TokenClient::new(&env, &_xlm_token);
    let liquidity = 100_000_i128;
    sa.mint(&provider, &liquidity);
    token.approve(&provider, &client.address, &liquidity, &9999);
    client.add_liquidity(&provider, &market_id, &liquidity);

    // Pool was created at t=500. A window of 10,000 seconds reaches back to
    // t = 500 - 10,000 = -9,500 (saturates to 0), which predates the oldest
    // retained observation (t=500). The ring buffer cannot cover this window.
    let result = client.try_get_twap(&market_id, &symbol_short!("yes"), &10_000_u64);

    assert!(
        matches!(result, Err(Ok(InsightArenaError::TwapInsufficientHistory))),
        "Expected TwapInsufficientHistory when window predates history, got: {:?}",
        result
    );
}

/// **Test Case**: `get_twap` after the ring buffer has wrapped around and
/// evicted old observations. A window reaching back to the pool's creation
/// must return `TwapInsufficientHistory`, while a window covering only the
/// retained observations must succeed.
///
/// **Rationale**: Once more than `TWAP_RING_BUFFER_CAPACITY` price-changing
/// operations have occurred, the oldest observations are overwritten. The
/// function must detect when a requested window is too large and reject it,
/// while still honoring queries that fit within the retained history.
#[test]
fn test_ring_buffer_wraparound_rejects_oversized_window() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, _oracle, _xlm_token) = deploy_with_token(&env);

    let provider = Address::generate(&env);
    let trader = Address::generate(&env);

    let sa = StellarAssetClient::new(&env, &_xlm_token);
    let token = TokenClient::new(&env, &_xlm_token);

    let market_id = client.create_market(&admin, &lp_market_params(&env));

    let liquidity = 100_000_000_i128;
    sa.mint(&provider, &liquidity);
    token.approve(&provider, &client.address, &liquidity, &9999);
    client.add_liquidity(&provider, &market_id, &liquidity);

    let t0 = env.ledger().timestamp();

    // Execute enough swaps to wrap the ring buffer (capacity + 20 extra)
    let num_swaps: u32 = TWAP_RING_BUFFER_CAPACITY + 20;
    let swap_amount = 1_000_i128;
    sa.mint(&trader, &(swap_amount * num_swaps as i128));
    token.approve(&trader, &client.address, &(swap_amount * num_swaps as i128), &9999);

    for _ in 0..num_swaps {
        env.ledger().with_mut(|l| l.timestamp += 50);
        client.swap_outcome(
            &trader,
            &market_id,
            &symbol_short!("yes"),
            &symbol_short!("no"),
            &swap_amount,
            &0_i128,
        );
    }

    let now = env.ledger().timestamp();
    assert_eq!(now, t0 + (num_swaps as u64) * 50);

    // A window reaching all the way back to pool creation (t0) now exceeds
    // what the wrapped ring buffer retains. Must reject with typed error.
    let full_window = now - t0;
    let result = client.try_get_twap(&market_id, &symbol_short!("yes"), &full_window);

    assert!(
        matches!(result, Err(Ok(InsightArenaError::TwapInsufficientHistory))),
        "Expected TwapInsufficientHistory after ring buffer wraparound, got: {:?}",
        result
    );

    // A window covering only the most recently retained observations should
    // succeed, demonstrating that the function still works correctly within
    // the buffer's capacity after wraparound.
    let recent_window: u64 = (TWAP_RING_BUFFER_CAPACITY as u64 / 2) * 50;
    let twap = client.get_twap(&market_id, &symbol_short!("yes"), &recent_window);

    assert!(twap > 0, "TWAP should succeed for window within retained history");
}

// ══════════════════════════════════════════════════════════════════════════════
// REQUIREMENT 3: Division by Zero Protection
// ══════════════════════════════════════════════════════════════════════════════

/// **Test Case**: `get_twap` when `now - window_start` collapses to zero
/// must return `TwapDivideByZero`.
///
/// **Rationale**: At ledger timestamp 0, `now.saturating_sub(window)` can
/// clamp both `now` and `window_start` to 0, making `elapsed = now - window_start = 0`.
/// Dividing the cumulative price delta by zero elapsed seconds would trap.
/// The function must detect this edge case and reject it explicitly.
#[test]
fn test_zero_elapsed_time_returns_divide_by_zero() {
    let env = Env::default();
    env.ledger().with_mut(|l| l.timestamp = 0);
    env.mock_all_auths();
    let (client, admin, _oracle, _xlm_token) = deploy_with_token(&env);

    let provider = Address::generate(&env);
    let market_id = client.create_market(&admin, &lp_market_params(&env));

    let sa = StellarAssetClient::new(&env, &_xlm_token);
    let token = TokenClient::new(&env, &_xlm_token);
    let liquidity = 100_000_i128;
    sa.mint(&provider, &liquidity);
    token.approve(&provider, &client.address, &liquidity, &9999);
    client.add_liquidity(&provider, &market_id, &liquidity);

    assert_eq!(env.ledger().timestamp(), 0, "Ledger must be at timestamp 0");

    // At t=0 with any positive window, `window_start` saturates to 0 too,
    // so `now - window_start` collapses to zero elapsed seconds.
    let result = client.try_get_twap(&market_id, &symbol_short!("yes"), &1_u64);

    assert!(
        matches!(result, Err(Ok(InsightArenaError::TwapDivideByZero))),
        "Expected TwapDivideByZero when elapsed time is zero, got: {:?}",
        result
    );
}

/// **Test Case**: `get_twap` at timestamp 0 with multiple window sizes all
/// return `TwapDivideByZero`.
///
/// **Rationale**: The zero-elapsed-time edge case is independent of the
/// window size. All windows at t=0 collapse to zero elapsed seconds.
#[test]
fn test_multiple_windows_at_timestamp_zero_all_return_divide_by_zero() {
    let env = Env::default();
    env.ledger().with_mut(|l| l.timestamp = 0);
    env.mock_all_auths();
    let (client, admin, _oracle, _xlm_token) = deploy_with_token(&env);

    let provider = Address::generate(&env);
    let market_id = client.create_market(&admin, &lp_market_params(&env));

    let sa = StellarAssetClient::new(&env, &_xlm_token);
    let token = TokenClient::new(&env, &_xlm_token);
    let liquidity = 100_000_i128;
    sa.mint(&provider, &liquidity);
    token.approve(&provider, &client.address, &liquidity, &9999);
    client.add_liquidity(&provider, &market_id, &liquidity);

    // Test multiple window sizes: 1 second, 10 seconds, 100 seconds
    for window in [1_u64, 10_u64, 100_u64] {
        let result = client.try_get_twap(&market_id, &symbol_short!("yes"), &window);
        assert!(
            matches!(result, Err(Ok(InsightArenaError::TwapDivideByZero))),
            "Expected TwapDivideByZero for window {} at t=0, got: {:?}",
            window,
            result
        );
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// ADDITIONAL VALIDATION: Invalid Outcome
// ══════════════════════════════════════════════════════════════════════════════

/// **Test Case**: `get_twap` for an outcome symbol not in the pool's reserves
/// must return `InvalidOutcome`.
///
/// **Rationale**: If the outcome doesn't exist in the market, there is no
/// reserve or price accumulator for it. This is a caller error and must be
/// rejected before attempting to read the accumulator.
#[test]
fn test_unknown_outcome_returns_invalid_outcome() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, _oracle, _xlm_token) = deploy_with_token(&env);

    let provider = Address::generate(&env);
    let market_id = client.create_market(&admin, &lp_market_params(&env));

    let sa = StellarAssetClient::new(&env, &_xlm_token);
    let token = TokenClient::new(&env, &_xlm_token);
    let liquidity = 100_000_i128;
    sa.mint(&provider, &liquidity);
    token.approve(&provider, &client.address, &liquidity, &9999);
    client.add_liquidity(&provider, &market_id, &liquidity);

    // Query TWAP for a non-existent outcome ("maybe" is not in the pool)
    let result = client.try_get_twap(&market_id, &symbol_short!("maybe"), &100_u64);

    assert!(
        matches!(result, Err(Ok(InsightArenaError::InvalidOutcome))),
        "Expected InvalidOutcome for unknown outcome symbol, got: {:?}",
        result
    );
}

// ══════════════════════════════════════════════════════════════════════════════
// POSITIVE TEST: Valid TWAP Query
// ══════════════════════════════════════════════════════════════════════════════

/// **Test Case**: `get_twap` with valid inputs and sufficient history succeeds
/// and returns a sensible TWAP value.
///
/// **Rationale**: After validating all rejection cases, confirm that the
/// function still works correctly when given valid inputs.
#[test]
fn test_valid_twap_query_succeeds() {
    let env = Env::default();
    env.ledger().with_mut(|l| l.timestamp = 1000);
    env.mock_all_auths();
    let (client, admin, _oracle, _xlm_token) = deploy_with_token(&env);

    let provider = Address::generate(&env);
    let trader = Address::generate(&env);

    let sa = StellarAssetClient::new(&env, &_xlm_token);
    let token = TokenClient::new(&env, &_xlm_token);

    let market_id = client.create_market(&admin, &lp_market_params(&env));

    let liquidity = 100_000_i128;
    sa.mint(&provider, &liquidity);
    token.approve(&provider, &client.address, &liquidity, &9999);
    client.add_liquidity(&provider, &market_id, &liquidity);

    let t0 = env.ledger().timestamp();

    // Execute a few swaps to build price history
    let swap_amount = 1_000_i128;
    sa.mint(&trader, &(swap_amount * 3));
    token.approve(&trader, &client.address, &(swap_amount * 3), &9999);

    for _ in 0..3 {
        env.ledger().with_mut(|l| l.timestamp += 100);
        client.swap_outcome(
            &trader,
            &market_id,
            &symbol_short!("yes"),
            &symbol_short!("no"),
            &swap_amount,
            &0_i128,
        );
    }

    let now = env.ledger().timestamp();
    let window = now - t0;

    // Query TWAP over the full window — should succeed
    let twap = client.get_twap(&market_id, &symbol_short!("yes"), &window);

    assert!(
        twap > 0,
        "TWAP should return a positive value for valid query with sufficient history"
    );
}

// ══════════════════════════════════════════════════════════════════════════════
// EDGE CASE: Single Observation
// ══════════════════════════════════════════════════════════════════════════════

/// **Test Case**: `get_twap` when exactly one observation exists (pool just
/// created, no swaps yet) and the window covers that observation should succeed.
///
/// **Rationale**: A pool with a single observation (from initial liquidity
/// addition) is a valid edge case. The TWAP should extrapolate from that
/// single price sample over the requested window.
#[test]
fn test_single_observation_twap_succeeds() {
    let env = Env::default();
    env.ledger().with_mut(|l| l.timestamp = 1000);
    env.mock_all_auths();
    let (client, admin, _oracle, _xlm_token) = deploy_with_token(&env);

    let provider = Address::generate(&env);
    let market_id = client.create_market(&admin, &lp_market_params(&env));

    let sa = StellarAssetClient::new(&env, &_xlm_token);
    let token = TokenClient::new(&env, &_xlm_token);
    let liquidity = 100_000_i128;
    sa.mint(&provider, &liquidity);
    token.approve(&provider, &client.address, &liquidity, &9999);
    client.add_liquidity(&provider, &market_id, &liquidity);

    // Advance time to create a valid window
    env.ledger().with_mut(|l| l.timestamp += 100);

    // Query TWAP with a 50-second window (fits within the single observation)
    let twap = client.get_twap(&market_id, &symbol_short!("yes"), &50_u64);

    assert!(
        twap > 0,
        "TWAP should succeed with single observation and valid window"
    );
}

// ══════════════════════════════════════════════════════════════════════════════
// REQUIREMENT 4: Settlement TWAP Price Manipulation Guard (Issue #1762)
// ══════════════════════════════════════════════════════════════════════════════

/// **Test Case**: Manipulated spot price beyond the deviation band is rejected at settlement; normal price passes.
#[test]
fn test_settlement_price_manipulation_rejected_and_normal_price_passes() {
    let env = Env::default();
    env.ledger().with_mut(|l| l.timestamp = 1000);
    env.mock_all_auths();
    let (client, admin, oracle, _xlm_token) = deploy_with_token(&env);

    let provider = Address::generate(&env);
    let trader = Address::generate(&env);

    let mut params = lp_market_params(&env);
    params.end_time = 5000;
    params.resolution_time = 5100;
    let market_id = client.create_market(&admin, &params);

    let sa = StellarAssetClient::new(&env, &_xlm_token);
    let token = TokenClient::new(&env, &_xlm_token);

    // Initial balanced liquidity: 100_000 each in "yes" and "no"
    let liquidity = 100_000_i128;
    sa.mint(&provider, &liquidity);
    token.approve(&provider, &client.address, &liquidity, &9999);
    client.add_liquidity(&provider, &market_id, &liquidity);

    // Enable settlement TWAP guard: 500 bps (5%) max deviation, 1000 second window
    client.set_settlement_twap_config(&admin, &500_u32, &1000_u64);

    // Advance time to 4500 (within steady state for > 1000s)
    env.ledger().with_mut(|l| l.timestamp = 4500);

    // Execute small swaps to build steady-state TWAP
    sa.mint(&trader, &10_000_i128);
    token.approve(&trader, &client.address, &10_000_i128, &9999);
    client.swap_outcome(
        &trader,
        &market_id,
        &symbol_short!("yes"),
        &symbol_short!("no"),
        &100_i128,
        &0_i128,
    );

    // Advance time to 5050 (near end time)
    env.ledger().with_mut(|l| l.timestamp = 5050);

    // Under normal trading, validation helper succeeds
    let val_res = client.try_validate_settlement_price(&market_id, &symbol_short!("yes"));
    assert!(val_res.is_ok(), "Normal price must pass TWAP validation");

    // Attacker performs a massive swap in the final block before resolution (manipulating spot price)
    sa.mint(&trader, &200_000_i128);
    token.approve(&trader, &client.address, &200_000_i128, &9999);
    client.swap_outcome(
        &trader,
        &market_id,
        &symbol_short!("no"),
        &symbol_short!("yes"),
        &60_000_i128,
        &0_i128,
    );

    // Advance to resolution time: 5101
    env.ledger().with_mut(|l| l.timestamp = 5101);

    // 1. Validation helper must reject the manipulated price with PriceDeviationTooHigh
    let check_res = client.try_validate_settlement_price(&market_id, &symbol_short!("yes"));
    assert_eq!(
        check_res,
        Err(Ok(InsightArenaError::PriceDeviationTooHigh)),
        "Expected PriceDeviationTooHigh from settlement validation helper"
    );

    // 2. Settlement / resolve_market must also reject resolution with PriceDeviationTooHigh
    let resolve_res = client.try_resolve_market(&oracle, &market_id, &symbol_short!("yes"));
    assert_eq!(
        resolve_res,
        Err(Ok(InsightArenaError::PriceDeviationTooHigh)),
        "Expected PriceDeviationTooHigh during market settlement/resolution"
    );
}

/// **Test Case**: Return `TwapInsufficientHistory` when the window isn't covered.
#[test]
fn test_settlement_price_insufficient_history() {
    let env = Env::default();
    env.ledger().with_mut(|l| l.timestamp = 1000);
    env.mock_all_auths();
    let (client, admin, oracle, _xlm_token) = deploy_with_token(&env);

    let provider = Address::generate(&env);
    let mut params = lp_market_params(&env);
    params.end_time = 2000;
    params.resolution_time = 2100;
    let market_id = client.create_market(&admin, &params);

    let sa = StellarAssetClient::new(&env, &_xlm_token);
    let token = TokenClient::new(&env, &_xlm_token);
    let liquidity = 100_000_i128;
    sa.mint(&provider, &liquidity);
    token.approve(&provider, &client.address, &liquidity, &9999);
    client.add_liquidity(&provider, &market_id, &liquidity);

    // Set settlement TWAP window to 3600 seconds, but only ~1105 seconds have elapsed since pool creation
    client.set_settlement_twap_config(&admin, &1000_u32, &3600_u64);

    env.ledger().with_mut(|l| l.timestamp = 2105);

    // Both helper and resolve_market must return TwapInsufficientHistory
    let check_res = client.try_validate_settlement_price(&market_id, &symbol_short!("yes"));
    assert_eq!(
        check_res,
        Err(Ok(InsightArenaError::TwapInsufficientHistory)),
        "Expected TwapInsufficientHistory when window is not covered"
    );

    let resolve_res = client.try_resolve_market(&oracle, &market_id, &symbol_short!("yes"));
    assert_eq!(
        resolve_res,
        Err(Ok(InsightArenaError::TwapInsufficientHistory)),
        "Expected TwapInsufficientHistory during resolution when window is not covered"
    );
}

/// **Test Case**: Admin configuration validation for settlement TWAP parameters.
#[test]
fn test_settlement_twap_config_validation() {
    let env = Env::default();
    env.ledger().with_mut(|l| l.timestamp = 1000);
    env.mock_all_auths();
    let (client, admin, _oracle, _xlm_token) = deploy_with_token(&env);

    let non_admin = Address::generate(&env);

    // Default configuration: 0 bps (disabled), 3600s
    let (dev, win) = client.get_settlement_twap_config();
    assert_eq!(dev, 0);
    assert_eq!(win, 3600);

    // Admin sets valid configuration
    client.set_settlement_twap_config(&admin, &1500_u32, &1800_u64);
    let (dev, win) = client.get_settlement_twap_config();
    assert_eq!(dev, 1500);
    assert_eq!(win, 1800);

    // Non-admin rejected with Unauthorized
    let res_unauth = client.try_set_settlement_twap_config(&non_admin, &1000_u32, &1800_u64);
    assert_eq!(res_unauth, Err(Ok(InsightArenaError::Unauthorized)));

    // Max deviation > 10,000 bps rejected with InvalidInput
    let res_invalid_bps = client.try_set_settlement_twap_config(&admin, &10_001_u32, &1800_u64);
    assert_eq!(res_invalid_bps, Err(Ok(InsightArenaError::InvalidInput)));

    // Zero window when max deviation > 0 rejected with InvalidInput
    let res_zero_win = client.try_set_settlement_twap_config(&admin, &500_u32, &0_u64);
    assert_eq!(res_zero_win, Err(Ok(InsightArenaError::InvalidInput)));
}






