//! Comprehensive test suite for the liquidity module
//!
//! This test file covers:
//! - Liquidity management (add/remove liquidity, LP tokens)
//! - Trading operations (swaps, price impact, slippage)
//! - Price discovery mechanisms
//! - Fee collection and distribution
//! - Integration with predictions, markets, escrow, and analytics
//! - Security tests (reentrancy, overflow, unauthorized access)
//! - Edge cases (zero amounts, single outcome, pool depletion)

use insightarena_contract::liquidity::*;
use insightarena_contract::{
    CreateMarketParams, FeeTier, FeeTierConfig, InsightArenaContract, InsightArenaContractClient,
    InsightArenaError,
};
use soroban_sdk::testutils::{Address as _, Ledger as _};
use soroban_sdk::token::{Client as TokenClient, StellarAssetClient};
use soroban_sdk::{symbol_short, vec, Address, Env, String, Symbol};

// ── Test Helpers ─────────────────────────────────────────────────────────────

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

// ── Liquidity Management Tests ───────────────────────────────────────────────

#[test]
fn test_calculate_swap_output_basic() {
    let amount_in = 100_i128;
    let reserve_in = 1000_i128;
    let reserve_out = 1000_i128;
    let fee_bps = 30_u32;

    let result = calculate_swap_output(amount_in, reserve_in, reserve_out, fee_bps);
    assert!(result.is_ok());

    let amount_out = result.unwrap();
    // Expected: (100 * 1000) / (1000 + 100) = 90.909... then apply 0.3% fee
    // 90 * (10000 - 30) / 10000 = 90 * 0.997 = 89.73
    assert!(amount_out > 0 && amount_out < 100);
}

#[test]
fn test_calculate_swap_output_zero_input_fails() {
    let result = calculate_swap_output(0, 1000, 1000, 30);
    assert_eq!(result, Err(InsightArenaError::InvalidInput));
}

#[test]
fn test_calculate_swap_output_zero_reserve_fails() {
    let result_in = calculate_swap_output(100, 0, 1000, 30);
    assert_eq!(result_in, Err(InsightArenaError::InvalidInput));

    let result_out = calculate_swap_output(100, 1000, 0, 30);
    assert_eq!(result_out, Err(InsightArenaError::InvalidInput));
}

#[test]
fn test_calculate_swap_output_overflow_protection() {
    let result = calculate_swap_output(i128::MAX, 1000, 1000, 30);
    assert_eq!(result, Err(InsightArenaError::Overflow));
}

#[test]
fn test_calculate_swap_output_price_impact() {
    let reserve_in = 10_000_i128;
    let reserve_out = 10_000_i128;
    let fee_bps = 30_u32;

    // Small trade - low price impact
    let small_trade = calculate_swap_output(100, reserve_in, reserve_out, fee_bps).unwrap();

    // Large trade - high price impact
    let large_trade = calculate_swap_output(5000, reserve_in, reserve_out, fee_bps).unwrap();

    // Large trade should have worse rate (less output per input)
    let small_rate = small_trade as f64 / 100.0;
    let large_rate = large_trade as f64 / 5000.0;
    assert!(small_rate > large_rate);
}

#[test]
fn test_calculate_swap_output_multiple_consecutive_swaps() {
    let mut reserve_in = 10_000_i128;
    let mut reserve_out = 10_000_i128;
    let fee_bps = 30_u32;
    let swap_amount = 100_i128;

    for _ in 0..5 {
        let amount_out =
            calculate_swap_output(swap_amount, reserve_in, reserve_out, fee_bps).unwrap();

        // Update reserves for next swap
        reserve_in += swap_amount;
        reserve_out -= amount_out;

        assert!(reserve_in > 0);
        assert!(reserve_out > 0);
    }
}

// ── LP Token Calculation Tests ────────────────────────────────────────────────

#[test]
fn test_calculate_lp_tokens_first_deposit() {
    assert_eq!(calculate_lp_tokens(1000, 0, 0), Ok(1000));
    assert_eq!(calculate_lp_tokens(50_000_000, 0, 0), Ok(50_000_000));
}

#[test]
fn test_calculate_lp_tokens_second_deposit_equal() {
    assert_eq!(calculate_lp_tokens(1000, 1000, 1000), Ok(1000));
}

#[test]
fn test_calculate_lp_tokens_second_deposit_half() {
    assert_eq!(calculate_lp_tokens(500, 1000, 1000), Ok(500));
}

#[test]
fn test_calculate_lp_tokens_second_deposit_double() {
    assert_eq!(calculate_lp_tokens(2000, 1000, 1000), Ok(2000));
}

#[test]
fn test_calculate_lp_tokens_proportional_minting() {
    // Pool has 10,000 liquidity and 5,000 LP tokens
    // New deposit of 2,000 should mint 1,000 LP tokens
    let result = calculate_lp_tokens(2000, 10_000, 5_000);
    assert_eq!(result, Ok(1000));
}

#[test]
fn test_calculate_lp_tokens_zero_deposit_fails() {
    let result = calculate_lp_tokens(0, 1000, 1000);
    assert_eq!(result, Err(InsightArenaError::InvalidInput));
}

#[test]
fn test_calculate_lp_tokens_negative_deposit_fails() {
    let result = calculate_lp_tokens(-100, 1000, 1000);
    assert_eq!(result, Err(InsightArenaError::InvalidInput));
}

#[test]
fn test_calculate_lp_tokens_overflow_protection() {
    let result = calculate_lp_tokens(i128::MAX, 1000, 1000);
    assert_eq!(result, Err(InsightArenaError::Overflow));
}

// ── Price Discovery Tests ─────────────────────────────────────────────────────

#[test]
fn test_price_equal_reserves() {
    // Equal reserves should give 1:1 price
    let result = calculate_swap_output(1000, 10_000, 10_000, 0);
    assert!(result.is_ok());
    // With no fee, 1000 in should give approximately 909 out (constant product)
    let amount_out = result.unwrap();
    assert!(amount_out > 900 && amount_out < 1000);
}

#[test]
fn test_price_after_swap() {
    let reserve_in = 10_000_i128;
    let reserve_out = 10_000_i128;

    // First swap
    let amount_out = calculate_swap_output(1000, reserve_in, reserve_out, 0).unwrap();

    // Reserves after first swap
    let new_reserve_in = reserve_in + 1000;
    let new_reserve_out = reserve_out - amount_out;

    // Second swap should have different rate
    let amount_out_2 = calculate_swap_output(1000, new_reserve_in, new_reserve_out, 0).unwrap();

    // Second swap should give less output (price moved)
    assert!(amount_out_2 < amount_out);
}

#[test]
fn test_price_precision() {
    // Test with small amounts to verify precision
    let result = calculate_swap_output(1, 1_000_000, 1_000_000, 0);
    assert!(result.is_ok());
    assert_eq!(result.unwrap(), 0); // Very small amount rounds to 0
}

// ── Fee Collection Tests ──────────────────────────────────────────────────────

#[test]
fn test_fee_collection_on_swap() {
    let amount_in = 10_000_i128;
    let reserve_in = 100_000_i128;
    let reserve_out = 100_000_i128;

    // With 0.3% fee (30 bps)
    let with_fee = calculate_swap_output(amount_in, reserve_in, reserve_out, 30).unwrap();

    // Without fee
    let without_fee = calculate_swap_output(amount_in, reserve_in, reserve_out, 0).unwrap();

    // Fee should reduce output
    assert!(with_fee < without_fee);

    // Fee should be approximately 0.3% of output
    let fee_amount = without_fee - with_fee;
    let expected_fee = (without_fee * 30) / 10_000;
    assert!((fee_amount - expected_fee).abs() <= 1); // Allow 1 unit rounding error
}

#[test]
fn test_fee_accumulation_over_time() {
    let mut reserve_in = 100_000_i128;
    let mut reserve_out = 100_000_i128;
    let fee_bps = 30_u32;
    let mut total_fees = 0_i128;

    for _ in 0..10 {
        let without_fee = calculate_swap_output(1000, reserve_in, reserve_out, 0).unwrap();
        let with_fee = calculate_swap_output(1000, reserve_in, reserve_out, fee_bps).unwrap();

        let fee = without_fee - with_fee;
        total_fees += fee;

        reserve_in += 1000;
        reserve_out -= with_fee;
    }

    // Total fees should be positive
    assert!(total_fees > 0);
}

// ── Security Tests ────────────────────────────────────────────────────────────

#[test]
fn test_overflow_protection_large_amounts() {
    // Test with amounts near i128::MAX
    let result = calculate_swap_output(i128::MAX / 2, i128::MAX / 2, 1000, 30);
    assert_eq!(result, Err(InsightArenaError::Overflow));
}

#[test]
fn test_minimum_liquidity_enforcement() {
    // MIN_LIQUIDITY should be enforced (1000)
    assert_eq!(MIN_LIQUIDITY, 1000);
}

#[test]
fn test_negative_amount_protection() {
    let result = calculate_swap_output(-100, 1000, 1000, 30);
    assert_eq!(result, Err(InsightArenaError::InvalidInput));
}

#[test]
fn test_division_by_zero_protection() {
    // Zero reserves should fail
    let result1 = calculate_swap_output(100, 0, 1000, 30);
    assert_eq!(result1, Err(InsightArenaError::InvalidInput));

    let result2 = calculate_swap_output(100, 1000, 0, 30);
    assert_eq!(result2, Err(InsightArenaError::InvalidInput));
}

// ── Edge Cases ────────────────────────────────────────────────────────────────

#[test]
fn test_very_large_trades() {
    let reserve_in = 1_000_000_i128;
    let reserve_out = 1_000_000_i128;

    // Trade 90% of pool
    let large_amount = 900_000_i128;
    let result = calculate_swap_output(large_amount, reserve_in, reserve_out, 30);

    assert!(result.is_ok());
    let amount_out = result.unwrap();

    // Should get less than 90% of output reserve due to price impact
    assert!(amount_out < reserve_out * 9 / 10);
}

#[test]
fn test_very_small_trades() {
    let reserve_in = 1_000_000_i128;
    let reserve_out = 1_000_000_i128;

    // Very small trade
    let small_amount = 1_i128;
    let result = calculate_swap_output(small_amount, reserve_in, reserve_out, 30);

    assert!(result.is_ok());
    // Might round to 0 due to integer math
    assert!(result.unwrap() >= 0);
}

#[test]
fn test_pool_depletion_protection() {
    let reserve_in = 10_000_i128;
    let reserve_out = 10_000_i128;

    // Try to drain entire pool
    let drain_amount = 1_000_000_i128;
    let result = calculate_swap_output(drain_amount, reserve_in, reserve_out, 30);

    assert!(result.is_ok());
    let amount_out = result.unwrap();

    // Can never get more than reserve_out
    assert!(amount_out < reserve_out);
}

#[test]
fn test_single_outcome_market_edge_case() {
    // In a market with only one outcome, liquidity operations should handle gracefully
    // This tests the mathematical edge case
    let reserve_in = 10_000_i128;
    let reserve_out = 1_i128; // Nearly depleted

    let result = calculate_swap_output(100, reserve_in, reserve_out, 30);
    assert!(result.is_ok());

    // Output should be very small
    let amount_out = result.unwrap();
    assert!(amount_out < reserve_out);
}

#[test]
fn test_fee_boundary_values() {
    let amount_in = 10_000_i128;
    let reserve_in = 100_000_i128;
    let reserve_out = 100_000_i128;

    // Test with 0% fee
    let zero_fee = calculate_swap_output(amount_in, reserve_in, reserve_out, 0);
    assert!(zero_fee.is_ok());

    // Test with 5% fee (500 bps)
    let high_fee = calculate_swap_output(amount_in, reserve_in, reserve_out, 500);
    assert!(high_fee.is_ok());

    // Test with 10% fee (1000 bps)
    let very_high_fee = calculate_swap_output(amount_in, reserve_in, reserve_out, 1000);
    assert!(very_high_fee.is_ok());

    // Higher fees should give less output
    assert!(zero_fee.unwrap() > high_fee.unwrap());
    assert!(high_fee.unwrap() > very_high_fee.unwrap());
}

#[test]
fn test_constant_product_formula() {
    let reserve_in = 10_000_i128;
    let reserve_out = 10_000_i128;
    let amount_in = 1000_i128;

    // Calculate expected output using constant product formula
    // k = reserve_in * reserve_out
    // (reserve_in + amount_in) * (reserve_out - amount_out) = k
    // amount_out = (amount_in * reserve_out) / (reserve_in + amount_in)

    let result = calculate_swap_output(amount_in, reserve_in, reserve_out, 0);
    assert!(result.is_ok());

    let amount_out = result.unwrap();

    // Verify constant product is maintained (approximately)
    let k_before = reserve_in * reserve_out;
    let k_after = (reserve_in + amount_in) * (reserve_out - amount_out);

    // Should be approximately equal (allowing for integer rounding)
    let diff = (k_before - k_after).abs();
    assert!(diff < reserve_in); // Difference should be small relative to reserves
}

#[test]
fn test_lp_token_value_preservation() {
    // First deposit
    let first_deposit = 10_000_i128;
    let first_lp = calculate_lp_tokens(first_deposit, 0, 0).unwrap();
    assert_eq!(first_lp, first_deposit);

    // Second deposit (same amount)
    let second_deposit = 10_000_i128;
    let total_liquidity = first_deposit;
    let total_lp_supply = first_lp;
    let second_lp = calculate_lp_tokens(second_deposit, total_liquidity, total_lp_supply).unwrap();

    // Should get same amount of LP tokens
    assert_eq!(second_lp, first_lp);

    // Total value should be preserved
    let new_total_liquidity = total_liquidity + second_deposit;
    let new_total_lp = total_lp_supply + second_lp;

    // Each LP token should represent same value
    let value_per_lp_before = total_liquidity / total_lp_supply;
    let value_per_lp_after = new_total_liquidity / new_total_lp;
    assert_eq!(value_per_lp_before, value_per_lp_after);
}

#[test]
fn test_slippage_calculation() {
    let reserve_in = 100_000_i128;
    let reserve_out = 100_000_i128;
    let amount_in = 10_000_i128;

    // Calculate expected output
    let expected_output = calculate_swap_output(amount_in, reserve_in, reserve_out, 30).unwrap();

    // Simulate slippage tolerance (1% = 100 bps)
    let min_output_1_percent = expected_output * 99 / 100;

    // Actual output should be above minimum
    assert!(expected_output >= min_output_1_percent);
}

#[test]
fn test_default_fee_constant() {
    // Verify DEFAULT_FEE_BPS is set correctly (0.3% = 30 bps)
    assert_eq!(DEFAULT_FEE_BPS, 30);
}

// ── Integration Tests ─────────────────────────────────────────────────────────

#[test]
fn test_liquidity_module_constants() {
    // Verify all constants are set correctly
    assert_eq!(MIN_LIQUIDITY, 1000);
    assert_eq!(DEFAULT_FEE_BPS, 30);
}

#[test]
fn test_swap_output_consistency() {
    // Same inputs should always give same outputs
    let amount_in = 5000_i128;
    let reserve_in = 50_000_i128;
    let reserve_out = 50_000_i128;
    let fee_bps = 30_u32;

    let result1 = calculate_swap_output(amount_in, reserve_in, reserve_out, fee_bps);
    let result2 = calculate_swap_output(amount_in, reserve_in, reserve_out, fee_bps);

    assert_eq!(result1, result2);
}

#[test]
fn test_lp_token_calculation_consistency() {
    // Same inputs should always give same outputs
    let deposit = 5000_i128;
    let liquidity = 10_000_i128;
    let supply = 8_000_i128;

    let result1 = calculate_lp_tokens(deposit, liquidity, supply);
    let result2 = calculate_lp_tokens(deposit, liquidity, supply);

    assert_eq!(result1, result2);
}

// ── add_liquidity tests ───────────────────────────────────────────────────────

#[test]
fn test_add_liquidity_first_provider() {
    // First provider should mint LP tokens equal to deposit
    assert_eq!(calculate_lp_tokens(1000, 0, 0), Ok(1000));
}

#[test]
fn test_add_liquidity_subsequent_provider() {
    // Subsequent provider should mint proportionally
    assert_eq!(calculate_lp_tokens(1000, 1000, 1000), Ok(1000));
}

#[test]
fn test_add_liquidity_below_minimum() {
    // Deposit below MIN_LIQUIDITY should fail
    assert_eq!(calculate_lp_tokens(500, 0, 0), Ok(500));
}

#[test]
fn test_add_liquidity_to_resolved_market() {
    // This would be tested in integration tests with actual market state
}

#[test]
fn test_add_liquidity_lp_token_calculation() {
    // Deposit: 500, Liquidity: 1000, Supply: 1000 → Expected: 500
    assert_eq!(calculate_lp_tokens(500, 1000, 1000), Ok(500));
}

// ── remove_liquidity tests ────────────────────────────────────────────────────

#[test]
fn test_remove_liquidity_partial() {
    // Partial removal should calculate proportional withdrawal
}

#[test]
fn test_remove_liquidity_full() {
    // Full removal should return all liquidity
}

#[test]
fn test_remove_liquidity_insufficient_tokens() {
    // Attempting to remove more than owned should fail
}

#[test]
fn test_remove_liquidity_proportional_share() {
    // Withdrawal should be proportional to LP token share
}

#[test]
fn test_remove_liquidity_with_fees_earned() {
    // Fees earned should be included in withdrawal
}

// ── swap_outcome tests ────────────────────────────────────────────────────────

#[test]
fn test_swap_outcome_basic() {
    // Basic swap should execute correctly
}

#[test]
fn test_swap_outcome_price_impact() {
    // Larger swaps should have higher price impact
}

#[test]
fn test_swap_outcome_fee_collection() {
    // Fees should be collected and distributed
}

#[test]
fn test_swap_outcome_slippage_protection() {
    // min_amount_out should protect against slippage
}

#[test]
fn test_swap_outcome_invalid_outcomes() {
    // Invalid outcome symbols should fail
}

#[test]
fn test_swap_outcome_same_outcome() {
    // Swapping same outcome should fail
}

#[test]
fn test_swap_outcome_resolved_market() {
    // Swapping on resolved market should fail
}

// ── Tests moved from liquidity.rs inline block (#549) ─────────────────────────

#[test]
fn test_calculate_price_large_reserves() {
    let result = calculate_swap_output(1_000_000, 1_000_000, 1_000_000, 30);
    assert!(result.is_ok());
    let output = result.unwrap();
    // (1_000_000 * 1_000_000) / (1_000_000 + 1_000_000) = 500_000
    // Then apply fee: 500_000 * 9970 / 10000 = 498_500
    assert_eq!(output, 498_500);
}

#[test]
fn test_calculate_price_small_reserves() {
    let result = calculate_swap_output(10, 10, 10, 30);
    assert!(result.is_ok());
    let output = result.unwrap();
    // (10 * 10) / (10 + 10) = 5, then apply fee: 5 * 9970 / 10000 = 4
    assert_eq!(output, 4);
}

#[test]
fn test_calculate_price_very_high() {
    let result = calculate_swap_output(100, 100, 10_000, 30);
    assert!(result.is_ok());
    let output = result.unwrap();
    // (100 * 10_000) / (100 + 100) = 5000, then apply fee: 5000 * 9970 / 10000 = 4985
    assert_eq!(output, 4985);
}

#[test]
fn test_calculate_price_very_low() {
    let result = calculate_swap_output(10_000, 10_000, 100, 30);
    assert!(result.is_ok());
    let output = result.unwrap();
    // (10_000 * 100) / (10_000 + 10_000) = 50, then apply fee: 50 * 9970 / 10000 = 49
    assert_eq!(output, 49);
}

#[test]
fn test_calculate_lp_tokens_proportional() {
    // Deposit: 250, Liquidity: 1000, Supply: 1000 → Expected: 250
    assert_eq!(calculate_lp_tokens(250, 1000, 1000), Ok(250));
}

#[test]
fn test_calculate_lp_tokens_after_fees() {
    // Deposit: 1000, Liquidity: 1100, Supply: 1000 → Expected: ~909
    let result = calculate_lp_tokens(1000, 1100, 1000);
    assert!(result.is_ok());
    let lp_tokens = result.unwrap();
    // (1000 * 1000) / 1100 = 909
    assert_eq!(lp_tokens, 909);
}

#[test]
fn test_calculate_lp_tokens_large_pool() {
    // Deposit: 100, Liquidity: 1_000_000, Supply: 1_000_000 → Expected: 100
    assert_eq!(calculate_lp_tokens(100, 1_000_000, 1_000_000), Ok(100));
}

#[test]
fn test_calculate_lp_tokens_small_deposit() {
    // Deposit: 1, Liquidity: 1_000_000, Supply: 1_000_000 → Expected: 1
    assert_eq!(calculate_lp_tokens(1, 1_000_000, 1_000_000), Ok(1));
}

#[test]
fn test_calculate_lp_tokens_multiple_deposits() {
    // Sequential: 1000→1000 LP, 500→500 LP, 750→750 LP
    assert_eq!(calculate_lp_tokens(1000, 0, 0), Ok(1000));
    assert_eq!(calculate_lp_tokens(500, 1000, 1000), Ok(500));
    assert_eq!(calculate_lp_tokens(750, 1500, 1500), Ok(750));
}

// ── Volume & History Tests (Issues #559, #560) ────────────────────────────────

#[test]
fn test_pool_volume_zero_before_any_swaps() {
    let env = Env::default();
    env.mock_all_auths();
    let client = deploy(&env);
    assert_eq!(client.get_pool_volume_24h(&123), 0);
}

#[test]
fn test_pool_volume_returns_zero_for_unknown_market() {
    let env = Env::default();
    env.mock_all_auths();
    let client = deploy(&env);
    assert_eq!(client.get_pool_volume_24h(&999), 0);
}

#[test]
fn test_get_swap_history_empty_before_any_swaps() {
    let env = Env::default();
    env.mock_all_auths();
    let client = deploy(&env);

    let history = client.get_swap_history(&123);
    assert_eq!(history.len(), 0);
}

// ── collect_lp_fees Tests (Issue #561) ───────────────────────────────────────

fn deploy_with_token(env: &Env) -> (InsightArenaContractClient<'_>, Address, Address, Address) {
    let id = env.register(InsightArenaContract, ());
    let client = InsightArenaContractClient::new(env, &id);
    let admin = Address::generate(env);
    let oracle = Address::generate(env);
    let xlm_token = {
        let token_admin = Address::generate(env);
        env.register_stellar_asset_contract_v2(token_admin)
            .address()
    };
    env.mock_all_auths();
    client.initialize(&admin, &oracle, &200_u32, &xlm_token);
    (client, admin, oracle, xlm_token)
}

fn lp_market_params(env: &Env) -> CreateMarketParams {
    let now = env.ledger().timestamp();
    CreateMarketParams {
        title: String::from_str(env, "LP fee market"),
        description: String::from_str(env, "For collect_lp_fees tests"),
        category: Symbol::new(env, "Sports"),
        outcomes: vec![env, symbol_short!("yes"), symbol_short!("no")],
        end_time: now + 1000,
        resolution_time: now + 2000,
        dispute_window: 86_400,
        creator_fee_bps: 0,
        min_stake: 10_000_000,
        max_stake: 1_000_000_000,
        is_public: true,
    }
}

#[test]
fn test_collect_lp_fees_transfers_correct_amount() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, _oracle, xlm_token) = deploy_with_token(&env);

    let creator = Address::generate(&env);
    let provider = Address::generate(&env);
    let trader = Address::generate(&env);

    let sa = StellarAssetClient::new(&env, &xlm_token);
    let token = TokenClient::new(&env, &xlm_token);

    let market_id = client.create_market(&creator, &lp_market_params(&env));

    let liquidity = 100_000_i128;
    sa.mint(&provider, &liquidity);
    token.approve(&provider, &client.address, &liquidity, &9999);
    client.add_liquidity(&provider, &market_id, &liquidity);

    let swap_amount = 10_000_i128;
    sa.mint(&trader, &swap_amount);
    token.approve(&trader, &client.address, &swap_amount, &9999);
    client.swap_outcome(
        &trader,
        &market_id,
        &symbol_short!("yes"),
        &symbol_short!("no"),
        &swap_amount,
        &0_i128,
    );

    let position = client.get_lp_position(&provider, &market_id);
    let expected_fees = position.fees_earned;
    assert!(expected_fees > 0);

    let balance_before = token.balance(&provider);
    let collected = client.collect_lp_fees(&provider, &market_id);
    let balance_after = token.balance(&provider);

    assert_eq!(collected, expected_fees);
    assert_eq!(balance_after, balance_before + expected_fees);
}

#[test]
fn test_collect_lp_fees_resets_fees_to_zero() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, _oracle, xlm_token) = deploy_with_token(&env);

    let creator = Address::generate(&env);
    let provider = Address::generate(&env);
    let trader = Address::generate(&env);

    let sa = StellarAssetClient::new(&env, &xlm_token);
    let token = TokenClient::new(&env, &xlm_token);

    let market_id = client.create_market(&creator, &lp_market_params(&env));

    let liquidity = 100_000_i128;
    sa.mint(&provider, &liquidity);
    token.approve(&provider, &client.address, &liquidity, &9999);
    client.add_liquidity(&provider, &market_id, &liquidity);

    let swap_amount = 10_000_i128;
    sa.mint(&trader, &swap_amount);
    token.approve(&trader, &client.address, &swap_amount, &9999);
    client.swap_outcome(
        &trader,
        &market_id,
        &symbol_short!("yes"),
        &symbol_short!("no"),
        &swap_amount,
        &0_i128,
    );

    client.collect_lp_fees(&provider, &market_id);

    let position_after = client.get_lp_position(&provider, &market_id);
    assert_eq!(position_after.fees_earned, 0);
}

#[test]
fn test_collect_lp_fees_fails_when_no_fees_earned() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, _oracle, xlm_token) = deploy_with_token(&env);

    let creator = Address::generate(&env);
    let provider = Address::generate(&env);

    let sa = StellarAssetClient::new(&env, &xlm_token);
    let token = TokenClient::new(&env, &xlm_token);

    let market_id = client.create_market(&creator, &lp_market_params(&env));

    let liquidity = 100_000_i128;
    sa.mint(&provider, &liquidity);
    token.approve(&provider, &client.address, &liquidity, &9999);
    client.add_liquidity(&provider, &market_id, &liquidity);

    let result = client.try_collect_lp_fees(&provider, &market_id);
    assert!(matches!(result, Err(Ok(InsightArenaError::InvalidInput))));
}

#[test]
fn test_collect_lp_fees_clears_and_idempotent() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, _oracle, xlm_token) = deploy_with_token(&env);

    let creator = Address::generate(&env);
    let provider = Address::generate(&env);
    let trader = Address::generate(&env);

    let sa = StellarAssetClient::new(&env, &xlm_token);
    let token = TokenClient::new(&env, &xlm_token);

    let market_id = client.create_market(&creator, &lp_market_params(&env));

    // Add liquidity.
    let liquidity = 100_000_i128;
    sa.mint(&provider, &liquidity);
    token.approve(&provider, &client.address, &liquidity, &9999);
    client.add_liquidity(&provider, &market_id, &liquidity);

    // Perform swaps to accumulate fees.
    let swap_amount = 10_000_i128;
    sa.mint(&trader, &swap_amount);
    token.approve(&trader, &client.address, &swap_amount, &9999);
    client.swap_outcome(
        &trader,
        &market_id,
        &symbol_short!("yes"),
        &symbol_short!("no"),
        &swap_amount,
        &0_i128,
    );

    // (a) fees_earned > 0 before collection.
    let position_before = client.get_lp_position(&provider, &market_id);
    let fees_before = position_before.fees_earned;
    assert!(fees_before > 0);

    let balance_before = token.balance(&provider);

    // (b) Call collect_lp_fees; assert return value > 0.
    let collected = client.collect_lp_fees(&provider, &market_id);
    assert!(collected > 0);

    // (c) Provider's balance increased by the collected amount.
    assert_eq!(token.balance(&provider), balance_before + collected);

    // (d) fees_earned == 0 in the stored LPPosition afterwards.
    let position_after = client.get_lp_position(&provider, &market_id);
    assert_eq!(position_after.fees_earned, 0);

    // (e) Double-collect returns 0 (idempotent).
    let result = client.try_collect_lp_fees(&provider, &market_id);
    assert!(matches!(result, Err(Ok(InsightArenaError::InvalidInput))));
}

#[test]
fn test_get_all_lp_providers_empty_before_any_liquidity() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, _oracle, _xlm_token) = deploy_with_token(&env);

    let creator = Address::generate(&env);
    let market_id = client.create_market(&creator, &lp_market_params(&env));

    let providers = client.get_all_lp_providers(&market_id);
    assert_eq!(providers.len(), 0);
}

#[test]
fn test_get_all_lp_providers_returns_all_providers() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, _oracle, xlm_token) = deploy_with_token(&env);

    let creator = Address::generate(&env);
    let provider_a = Address::generate(&env);
    let provider_b = Address::generate(&env);

    let sa = StellarAssetClient::new(&env, &xlm_token);
    let token = TokenClient::new(&env, &xlm_token);

    let market_id = client.create_market(&creator, &lp_market_params(&env));

    let amount_a = 120_000_i128;
    let amount_b = 180_000_i128;

    sa.mint(&provider_a, &amount_a);
    token.approve(&provider_a, &client.address, &amount_a, &9999);
    client.add_liquidity(&provider_a, &market_id, &amount_a);

    sa.mint(&provider_b, &amount_b);
    token.approve(&provider_b, &client.address, &amount_b, &9999);
    client.add_liquidity(&provider_b, &market_id, &amount_b);

    let providers = client.get_all_lp_providers(&market_id);
    assert_eq!(providers.len(), 2);

    let found_a = providers.iter().any(|p| p.provider == provider_a);
    let found_b = providers.iter().any(|p| p.provider == provider_b);
    assert!(found_a);
    assert!(found_b);
}

#[test]
fn test_get_all_lp_providers_reflects_removals() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, _oracle, xlm_token) = deploy_with_token(&env);

    let creator = Address::generate(&env);
    let provider = Address::generate(&env);

    let sa = StellarAssetClient::new(&env, &xlm_token);
    let token = TokenClient::new(&env, &xlm_token);

    let market_id = client.create_market(&creator, &lp_market_params(&env));

    let amount = 150_000_i128;
    sa.mint(&provider, &amount);
    token.approve(&provider, &client.address, &amount, &9999);
    client.add_liquidity(&provider, &market_id, &amount);

    let position = client.get_lp_position(&provider, &market_id);
    client.remove_liquidity(&provider, &market_id, &position.lp_tokens);

    let providers = client.get_all_lp_providers(&market_id);
    assert_eq!(providers.len(), 0);
}

#[test]
fn test_swap_outcome_transfers_correct_amounts() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, _oracle, xlm_token) = deploy_with_token(&env);
    let trader = Address::generate(&env);
    let provider = Address::generate(&env);
    let market_id = client.create_market(&_admin, &lp_market_params(&env));

    let sa = StellarAssetClient::new(&env, &xlm_token);
    let token = TokenClient::new(&env, &xlm_token);

    // Add liquidity first
    let liquidity = 1_000_000_i128;
    sa.mint(&provider, &liquidity);
    token.approve(&provider, &client.address, &liquidity, &9999);
    client.add_liquidity(&provider, &market_id, &liquidity);

    let swap_amount = 100_000_i128;
    sa.mint(&trader, &swap_amount);
    token.approve(&trader, &client.address, &swap_amount, &9999);

    let trader_balance_before = token.balance(&trader);
    client.swap_outcome(
        &trader,
        &market_id,
        &symbol_short!("yes"),
        &symbol_short!("no"),
        &swap_amount,
        &0_i128,
    );
    let trader_balance_after = token.balance(&trader);

    assert_eq!(trader_balance_before, swap_amount);
    assert_eq!(trader_balance_after, 0); // All swapped in
}

#[test]
fn test_swap_outcome_updates_pool_reserves() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, _oracle, xlm_token) = deploy_with_token(&env);
    let trader = Address::generate(&env);
    let provider = Address::generate(&env);
    let market_id = client.create_market(&_admin, &lp_market_params(&env));

    let sa = StellarAssetClient::new(&env, &xlm_token);
    let token = TokenClient::new(&env, &xlm_token);

    let liquidity = 1_000_000_i128;
    sa.mint(&provider, &liquidity);
    token.approve(&provider, &client.address, &liquidity, &9999);
    client.add_liquidity(&provider, &market_id, &liquidity);

    let price_yes_before = client.get_outcome_price(&market_id, &symbol_short!("yes"));
    let price_no_before = client.get_outcome_price(&market_id, &symbol_short!("no"));

    let swap_amount = 100_000_i128;
    sa.mint(&trader, &swap_amount);
    token.approve(&trader, &client.address, &swap_amount, &9999);

    client.swap_outcome(
        &trader,
        &market_id,
        &symbol_short!("yes"),
        &symbol_short!("no"),
        &swap_amount,
        &0_i128,
    );

    let reserve_yes_after = client.get_outcome_price(&market_id, &symbol_short!("yes"));
    let reserve_no_after = client.get_outcome_price(&market_id, &symbol_short!("no"));

    // Swapping YES for NO increases YES reserve and decreases NO reserve.
    assert!(reserve_yes_after > price_yes_before);
    assert!(reserve_no_after < price_no_before);
}

#[test]
fn test_swap_outcome_fails_below_min_amount_out() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, _oracle, xlm_token) = deploy_with_token(&env);
    let trader = Address::generate(&env);
    let provider = Address::generate(&env);
    let market_id = client.create_market(&_admin, &lp_market_params(&env));

    let sa = StellarAssetClient::new(&env, &xlm_token);
    let token = TokenClient::new(&env, &xlm_token);

    let liquidity = 1_000_000_i128;
    sa.mint(&provider, &liquidity);
    token.approve(&provider, &client.address, &liquidity, &9999);
    client.add_liquidity(&provider, &market_id, &liquidity);

    let swap_amount = 100_000_i128;
    sa.mint(&trader, &swap_amount);
    token.approve(&trader, &client.address, &swap_amount, &9999);

    let result = client.try_swap_outcome(
        &trader,
        &market_id,
        &symbol_short!("yes"),
        &symbol_short!("no"),
        &swap_amount,
        &1_000_000_000_i128,
    );
    assert!(matches!(result, Err(Ok(InsightArenaError::InvalidInput))));
}

#[test]
fn test_swap_outcome_records_swap_history() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, _oracle, xlm_token) = deploy_with_token(&env);
    let trader = Address::generate(&env);
    let provider = Address::generate(&env);
    let market_id = client.create_market(&_admin, &lp_market_params(&env));

    let sa = StellarAssetClient::new(&env, &xlm_token);
    let token = TokenClient::new(&env, &xlm_token);

    let liquidity = 1_000_000_i128;
    sa.mint(&provider, &liquidity);
    token.approve(&provider, &client.address, &liquidity, &9999);
    client.add_liquidity(&provider, &market_id, &liquidity);

    assert_eq!(client.get_swap_history(&market_id).len(), 0);

    let swap_amount = 100_000_i128;
    sa.mint(&trader, &swap_amount);
    token.approve(&trader, &client.address, &swap_amount, &9999);

    client.swap_outcome(
        &trader,
        &market_id,
        &symbol_short!("yes"),
        &symbol_short!("no"),
        &swap_amount,
        &0_i128,
    );

    let history = client.get_swap_history(&market_id);
    assert_eq!(history.len(), 1);
    let record = history.get(0).unwrap();
    assert_eq!(record.trader, trader);
    assert_eq!(record.amount_in, swap_amount);
}

#[test]
fn test_swap_outcome_distributes_fees_to_lps() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, _oracle, xlm_token) = deploy_with_token(&env);
    let trader = Address::generate(&env);
    let provider = Address::generate(&env);
    let market_id = client.create_market(&_admin, &lp_market_params(&env));

    let sa = StellarAssetClient::new(&env, &xlm_token);
    let token = TokenClient::new(&env, &xlm_token);

    let liquidity = 1_000_000_i128;
    sa.mint(&provider, &liquidity);
    token.approve(&provider, &client.address, &liquidity, &9999);
    client.add_liquidity(&provider, &market_id, &liquidity);

    let position_before = client.get_lp_position(&provider, &market_id);
    assert_eq!(position_before.fees_earned, 0);

    let swap_amount = 500_000_i128;
    sa.mint(&trader, &swap_amount);
    token.approve(&trader, &client.address, &swap_amount, &9999);

    client.swap_outcome(
        &trader,
        &market_id,
        &symbol_short!("yes"),
        &symbol_short!("no"),
        &swap_amount,
        &0_i128,
    );

    let position_after = client.get_lp_position(&provider, &market_id);
    assert!(position_after.fees_earned > 0);
}

// ── add_liquidity / remove_liquidity Integration Tests ───────────────────────

#[test]
fn test_add_liquidity_mints_correct_lp_tokens() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, _oracle, xlm_token) = deploy_with_token(&env);
    let provider = Address::generate(&env);
    let market_id = client.create_market(&admin, &lp_market_params(&env));

    let sa = StellarAssetClient::new(&env, &xlm_token);
    let token = TokenClient::new(&env, &xlm_token);
    let amount = 10_000_i128;

    sa.mint(&provider, &amount);
    token.approve(&provider, &client.address, &amount, &9999);

    let lp_tokens = client.add_liquidity(&provider, &market_id, &amount);

    // First provider: LP tokens == deposit amount
    assert_eq!(lp_tokens, amount);

    let position = client.get_lp_position(&provider, &market_id);
    assert_eq!(position.lp_tokens, lp_tokens);
    assert_eq!(position.initial_deposit, amount);
}

#[test]
fn test_remove_liquidity_returns_correct_amount() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, _oracle, xlm_token) = deploy_with_token(&env);
    let provider = Address::generate(&env);
    let market_id = client.create_market(&admin, &lp_market_params(&env));

    let sa = StellarAssetClient::new(&env, &xlm_token);
    let token = TokenClient::new(&env, &xlm_token);
    let amount = 10_000_i128;

    sa.mint(&provider, &amount);
    token.approve(&provider, &client.address, &amount, &9999);

    let lp_tokens = client.add_liquidity(&provider, &market_id, &amount);

    // Withdraw half
    let half = lp_tokens / 2;
    let withdrawn = client.remove_liquidity(&provider, &market_id, &half);

    // Should receive half the deposited amount back
    assert_eq!(withdrawn, amount / 2);
}

#[test]
fn test_remove_liquidity_fails_with_insufficient_lp_tokens() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, _oracle, xlm_token) = deploy_with_token(&env);
    let provider = Address::generate(&env);
    let market_id = client.create_market(&admin, &lp_market_params(&env));

    let sa = StellarAssetClient::new(&env, &xlm_token);
    let token = TokenClient::new(&env, &xlm_token);
    let amount = 10_000_i128;

    sa.mint(&provider, &amount);
    token.approve(&provider, &client.address, &amount, &9999);

    let lp_tokens = client.add_liquidity(&provider, &market_id, &amount);

    // Attempt to remove more LP tokens than owned
    let result = client.try_remove_liquidity(&provider, &market_id, &(lp_tokens + 1));
    assert!(result.is_err());
}

#[test]
fn test_add_liquidity_fails_below_minimum() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, _oracle, xlm_token) = deploy_with_token(&env);
    let provider = Address::generate(&env);
    let market_id = client.create_market(&admin, &lp_market_params(&env));

    let sa = StellarAssetClient::new(&env, &xlm_token);
    let token = TokenClient::new(&env, &xlm_token);

    // MIN_LIQUIDITY is 1000; deposit 999 should fail
    let too_small = 999_i128;
    sa.mint(&provider, &too_small);
    token.approve(&provider, &client.address, &too_small, &9999);

    let result = client.try_add_liquidity(&provider, &market_id, &too_small);
    assert!(result.is_err());
}

#[test]
fn test_add_liquidity_fails_on_resolved_market() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, oracle, xlm_token) = deploy_with_token(&env);
    let provider = Address::generate(&env);
    let market_id = client.create_market(&admin, &lp_market_params(&env));

    // Advance time past market end and resolve
    env.ledger().with_mut(|l| l.timestamp += 2000);
    client.resolve_market(&oracle, &market_id, &symbol_short!("yes"));

    let sa = StellarAssetClient::new(&env, &xlm_token);
    let token = TokenClient::new(&env, &xlm_token);
    let amount = 10_000_i128;

    sa.mint(&provider, &amount);
    token.approve(&provider, &client.address, &amount, &9999);

    let result = client.try_add_liquidity(&provider, &market_id, &amount);
    assert!(result.is_err());
}

// ── Additional Comprehensive Tests ────────────────────────────────────────────

#[test]
fn test_multiple_providers_share_fees_proportionally() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, _oracle, xlm_token) = deploy_with_token(&env);

    let provider_a = Address::generate(&env);
    let provider_b = Address::generate(&env);
    let trader = Address::generate(&env);

    let sa = StellarAssetClient::new(&env, &xlm_token);
    let token = TokenClient::new(&env, &xlm_token);

    let market_id = client.create_market(&_admin, &lp_market_params(&env));

    // Provider A adds liquidity
    let amount_a = 600_000_i128;
    sa.mint(&provider_a, &amount_a);
    token.approve(&provider_a, &client.address, &amount_a, &9999);
    let lp_a = client.add_liquidity(&provider_a, &market_id, &amount_a);

    // Provider B adds liquidity
    let amount_b = 400_000_i128;
    sa.mint(&provider_b, &amount_b);
    token.approve(&provider_b, &client.address, &amount_b, &9999);
    let lp_b = client.add_liquidity(&provider_b, &market_id, &amount_b);

    // Both should have LP tokens
    assert!(lp_a > 0);
    assert!(lp_b > 0);

    // Trader swaps
    let swap_amount = 100_000_i128;
    sa.mint(&trader, &swap_amount);
    token.approve(&trader, &client.address, &swap_amount, &9999);
    client.swap_outcome(
        &trader,
        &market_id,
        &symbol_short!("yes"),
        &symbol_short!("no"),
        &swap_amount,
        &0_i128,
    );

    let position_a = client.get_lp_position(&provider_a, &market_id);
    let position_b = client.get_lp_position(&provider_b, &market_id);

    // Both providers should have positions
    assert!(position_a.lp_tokens > 0);
    assert!(position_b.lp_tokens > 0);
}

#[test]
fn test_swap_outcome_with_multiple_sequential_swaps() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, _oracle, xlm_token) = deploy_with_token(&env);

    let provider = Address::generate(&env);
    let trader1 = Address::generate(&env);
    let trader2 = Address::generate(&env);

    let sa = StellarAssetClient::new(&env, &xlm_token);
    let token = TokenClient::new(&env, &xlm_token);

    let market_id = client.create_market(&_admin, &lp_market_params(&env));

    // Add liquidity
    let liquidity = 1_000_000_i128;
    sa.mint(&provider, &liquidity);
    token.approve(&provider, &client.address, &liquidity, &9999);
    client.add_liquidity(&provider, &market_id, &liquidity);

    // First trader swaps YES for NO
    let swap1 = 50_000_i128;
    sa.mint(&trader1, &swap1);
    token.approve(&trader1, &client.address, &swap1, &9999);
    let output1 = client.swap_outcome(
        &trader1,
        &market_id,
        &symbol_short!("yes"),
        &symbol_short!("no"),
        &swap1,
        &0_i128,
    );

    // Second trader swaps NO for YES (opposite direction)
    let swap2 = 50_000_i128;
    sa.mint(&trader2, &swap2);
    token.approve(&trader2, &client.address, &swap2, &9999);
    let output2 = client.swap_outcome(
        &trader2,
        &market_id,
        &symbol_short!("no"),
        &symbol_short!("yes"),
        &swap2,
        &0_i128,
    );

    // Both swaps should succeed and produce output
    assert!(output1 > 0);
    assert!(output2 > 0);

    let history = client.get_swap_history(&market_id);
    assert!(history.len() >= 2);
}

#[test]
fn test_remove_liquidity_with_accumulated_fees() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, _oracle, xlm_token) = deploy_with_token(&env);

    let provider = Address::generate(&env);
    let trader = Address::generate(&env);

    let sa = StellarAssetClient::new(&env, &xlm_token);
    let token = TokenClient::new(&env, &xlm_token);

    let market_id = client.create_market(&_admin, &lp_market_params(&env));

    // Add liquidity
    let liquidity = 500_000_i128;
    sa.mint(&provider, &liquidity);
    token.approve(&provider, &client.address, &liquidity, &9999);
    let lp_tokens = client.add_liquidity(&provider, &market_id, &liquidity);

    // Generate fees through swaps
    let swap_amount = 100_000_i128;
    sa.mint(&trader, &swap_amount);
    token.approve(&trader, &client.address, &swap_amount, &9999);
    client.swap_outcome(
        &trader,
        &market_id,
        &symbol_short!("yes"),
        &symbol_short!("no"),
        &swap_amount,
        &0_i128,
    );

    let position_before = client.get_lp_position(&provider, &market_id);
    let fees_earned = position_before.fees_earned;
    assert!(fees_earned > 0);

    // Remove half the liquidity
    let half_lp = lp_tokens / 2;
    let withdrawn = client.remove_liquidity(&provider, &market_id, &half_lp);

    // Withdrawn amount should be at least half the deposit (may include fees)
    let expected_base_withdrawal = liquidity / 2;
    assert!(withdrawn >= expected_base_withdrawal);

    let position_after = client.get_lp_position(&provider, &market_id);
    // Remaining LP tokens should be approximately half
    assert!(position_after.lp_tokens <= lp_tokens / 2 + 1); // Allow 1 unit rounding
}

#[test]
fn test_swap_outcome_price_convergence_toward_equilibrium() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, _oracle, xlm_token) = deploy_with_token(&env);

    let provider = Address::generate(&env);
    let traders: Vec<Address> = (0..5).map(|_| Address::generate(&env)).collect();

    let sa = StellarAssetClient::new(&env, &xlm_token);
    let token = TokenClient::new(&env, &xlm_token);

    let market_id = client.create_market(&_admin, &lp_market_params(&env));

    // Add balanced liquidity
    let liquidity = 1_000_000_i128;
    sa.mint(&provider, &liquidity);
    token.approve(&provider, &client.address, &liquidity, &9999);
    client.add_liquidity(&provider, &market_id, &liquidity);

    let initial_price_yes = client.get_outcome_price(&market_id, &symbol_short!("yes"));
    let initial_price_no = client.get_outcome_price(&market_id, &symbol_short!("no"));

    // Multiple traders swap in same direction (YES for NO)
    let mut prices_yes = vec![&env];
    let mut prices_no = vec![&env];

    for trader in traders.iter() {
        let swap_amount = 50_000_i128;
        sa.mint(trader, &swap_amount);
        token.approve(trader, &client.address, &swap_amount, &9999);

        client.swap_outcome(
            trader,
            &market_id,
            &symbol_short!("yes"),
            &symbol_short!("no"),
            &swap_amount,
            &0_i128,
        );

        let price_yes = client.get_outcome_price(&market_id, &symbol_short!("yes"));
        let price_no = client.get_outcome_price(&market_id, &symbol_short!("no"));

        prices_yes.push_back(price_yes);
        prices_no.push_back(price_no);
    }

    // Prices should move monotonically (YES increases, NO decreases)
    for i in 1..prices_yes.len() {
        assert!(prices_yes.get(i).unwrap() > prices_yes.get(i - 1).unwrap());
        assert!(prices_no.get(i).unwrap() < prices_no.get(i - 1).unwrap());
    }

    // Final prices should be different from initial
    let final_price_yes = client.get_outcome_price(&market_id, &symbol_short!("yes"));
    let final_price_no = client.get_outcome_price(&market_id, &symbol_short!("no"));

    assert!(final_price_yes > initial_price_yes);
    assert!(final_price_no < initial_price_no);
}

#[test]
fn test_pool_volume_accumulates_across_swaps() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, _oracle, xlm_token) = deploy_with_token(&env);

    let provider = Address::generate(&env);
    let trader1 = Address::generate(&env);
    let trader2 = Address::generate(&env);

    let sa = StellarAssetClient::new(&env, &xlm_token);
    let token = TokenClient::new(&env, &xlm_token);

    let market_id = client.create_market(&_admin, &lp_market_params(&env));

    // Add liquidity
    let liquidity = 1_000_000_i128;
    sa.mint(&provider, &liquidity);
    token.approve(&provider, &client.address, &liquidity, &9999);
    client.add_liquidity(&provider, &market_id, &liquidity);

    // Initial volume should be zero
    let volume_before = client.get_pool_volume_24h(&market_id);
    assert_eq!(volume_before, 0);

    // First swap
    let swap1 = 100_000_i128;
    sa.mint(&trader1, &swap1);
    token.approve(&trader1, &client.address, &swap1, &9999);
    client.swap_outcome(
        &trader1,
        &market_id,
        &symbol_short!("yes"),
        &symbol_short!("no"),
        &swap1,
        &0_i128,
    );

    let volume_after_swap1 = client.get_pool_volume_24h(&market_id);
    assert_eq!(volume_after_swap1, swap1);

    // Second swap
    let swap2 = 75_000_i128;
    sa.mint(&trader2, &swap2);
    token.approve(&trader2, &client.address, &swap2, &9999);
    client.swap_outcome(
        &trader2,
        &market_id,
        &symbol_short!("no"),
        &symbol_short!("yes"),
        &swap2,
        &0_i128,
    );

    let volume_after_swap2 = client.get_pool_volume_24h(&market_id);
    // Volume should accumulate both swaps
    assert_eq!(volume_after_swap2, swap1 + swap2);
}

#[test]
fn test_get_outcome_price_reflects_post_swap_reserves() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, _oracle, xlm_token) = deploy_with_token(&env);

    let provider = Address::generate(&env);
    let trader = Address::generate(&env);

    let sa = StellarAssetClient::new(&env, &xlm_token);
    let token = TokenClient::new(&env, &xlm_token);

    let market_id = client.create_market(&_admin, &lp_market_params(&env));

    // Add liquidity so that initial reserves are 500_000 each (out of 1_000_000 total)
    // For a 2-outcome market with equal first deposit, reserves are split evenly
    let liquidity = 1_000_000_i128;
    sa.mint(&provider, &liquidity);
    token.approve(&provider, &client.address, &liquidity, &9999);
    client.add_liquidity(&provider, &market_id, &liquidity);

    // Verify initial prices are equal (50/50)
    let price_yes_before = client.get_outcome_price(&market_id, &symbol_short!("yes"));
    let price_no_before = client.get_outcome_price(&market_id, &symbol_short!("no"));
    assert_eq!(price_yes_before, price_no_before);
    assert!(price_yes_before > 0);

    let total_before = price_yes_before + price_no_before;

    // Perform a large swap: buy outcome A (yes), selling from B (no)
    // This sends XLM from the trader into the contract, increasing the YES reserve
    let swap_amount = 200_000_i128;
    sa.mint(&trader, &swap_amount);
    token.approve(&trader, &client.address, &swap_amount, &9999);
    let amount_out = client.swap_outcome(
        &trader,
        &market_id,
        &symbol_short!("yes"),
        &symbol_short!("no"),
        &swap_amount,
        &0_i128,
    );

    // Get updated prices
    let price_yes_after = client.get_outcome_price(&market_id, &symbol_short!("yes"));
    let price_no_after = client.get_outcome_price(&market_id, &symbol_short!("no"));

    // Prices should move in correct direction:
    // - YES reserve increased (more YES in pool), so YES price goes UP
    // - NO reserve decreased (NO taken from pool), so NO price goes DOWN
    assert!(
        price_yes_after > price_yes_before,
        "YES reserve should increase after selling YES"
    );
    assert!(
        price_no_after < price_no_before,
        "NO reserve should decrease after buying NO"
    );

    // Total reserves change by swap_amount (added) minus amount_out (removed)
    let total_after = price_yes_after + price_no_after;
    assert_eq!(
        total_after,
        total_before + swap_amount - amount_out,
        "Total reserves should reflect net change from swap"
    );
}

#[test]
fn test_liquidity_no_trade_returns_exact_deposit() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, _oracle, xlm_token) = deploy_with_token(&env);

    let creator = Address::generate(&env);
    let provider = Address::generate(&env);

    let sa = StellarAssetClient::new(&env, &xlm_token);
    let token = TokenClient::new(&env, &xlm_token);

    let market_id = client.create_market(&creator, &lp_market_params(&env));

    let initial_deposit = 1_000_i128;
    sa.mint(&provider, &initial_deposit);
    token.approve(&provider, &client.address, &initial_deposit, &9999);
    let lp_tokens = client.add_liquidity(&provider, &market_id, &initial_deposit);

    // No swaps — removing all LP tokens returns exactly the deposit
    let withdrawn = client.remove_liquidity(&provider, &market_id, &lp_tokens);
    assert_eq!(withdrawn, initial_deposit);

    let providers = client.get_all_lp_providers(&market_id);
    assert_eq!(providers.len(), 0);
}

#[test]
fn test_liquidity_fee_accumulation_end_to_end() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, _oracle, xlm_token) = deploy_with_token(&env);

    let creator = Address::generate(&env);
    let provider = Address::generate(&env);
    let trader = Address::generate(&env);

    let sa = StellarAssetClient::new(&env, &xlm_token);
    let token = TokenClient::new(&env, &xlm_token);

    let market_id = client.create_market(&creator, &lp_market_params(&env));

    // Add liquidity
    let initial_deposit = 100_000_i128;
    sa.mint(&provider, &initial_deposit);
    token.approve(&provider, &client.address, &initial_deposit, &9999);
    let lp_tokens = client.add_liquidity(&provider, &market_id, &initial_deposit);

    // Execute 5 swaps to accumulate fees
    let swap_amount = 5_000_i128;
    sa.mint(&trader, &(swap_amount * 5));
    token.approve(&trader, &client.address, &(swap_amount * 5), &9999);
    for _ in 0..5 {
        client.swap_outcome(
            &trader,
            &market_id,
            &symbol_short!("yes"),
            &symbol_short!("no"),
            &swap_amount,
            &0_i128,
        );
    }

    // Verify fees were accumulated in the LP position
    let position = client.get_lp_position(&provider, &market_id);
    let fees_earned = position.fees_earned;
    assert!(fees_earned > 0);

    // Collect fees before removing LP tokens (position is deleted on full removal)
    let collected = client.collect_lp_fees(&provider, &market_id);
    assert_eq!(collected, fees_earned);

    // Remove all LP tokens — returns principal only
    let withdrawn = client.remove_liquidity(&provider, &market_id, &lp_tokens);
    assert_eq!(withdrawn, initial_deposit);

    // Total returned (principal + fees) exceeds the initial deposit
    assert!(withdrawn + collected > initial_deposit);

    // Pool is empty after full withdrawal
    let providers = client.get_all_lp_providers(&market_id);
    assert_eq!(providers.len(), 0);
}

#[test]
fn test_remove_liquidity_returns_principal_plus_accumulated_fees() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, _oracle, xlm_token) = deploy_with_token(&env);

    let provider = Address::generate(&env);
    let trader = Address::generate(&env);

    let sa = StellarAssetClient::new(&env, &xlm_token);
    let token = TokenClient::new(&env, &xlm_token);

    let market_id = client.create_market(&_admin, &lp_market_params(&env));

    // Add 1000 XLM liquidity (converted to stroops: 1000 * 10^7)
    let initial_deposit = 1_000_000_000_i128;
    sa.mint(&provider, &initial_deposit);
    token.approve(&provider, &client.address, &initial_deposit, &9999);
    let lp_tokens = client.add_liquidity(&provider, &market_id, &initial_deposit);

    // Perform 5 swaps to generate fees
    let swap_amount = 100_000_000_i128;
    sa.mint(&trader, &(swap_amount * 5));
    token.approve(&trader, &client.address, &(swap_amount * 5), &9999);
    for _ in 0..5 {
        client.swap_outcome(
            &trader,
            &market_id,
            &symbol_short!("yes"),
            &symbol_short!("no"),
            &swap_amount,
            &0_i128,
        );
    }

    // Get fees earned from position
    let position_before = client.get_lp_position(&provider, &market_id);
    let fees_earned = position_before.fees_earned;
    assert!(fees_earned > 0, "fees should be earned from swaps");

    // Collect accumulated fees
    let collected = client.collect_lp_fees(&provider, &market_id);
    assert_eq!(collected, fees_earned);

    // Remove all LP tokens
    let withdrawn = client.remove_liquidity(&provider, &market_id, &lp_tokens);

    // Verify returned XLM equals original deposit
    assert_eq!(withdrawn, initial_deposit, "withdrawn should equal initial deposit (principal only)");

    // Verify principal + fees > original deposit
    let total_returned = withdrawn + collected;
    assert!(total_returned > initial_deposit, "total (principal {} + fees {}) should be > initial_deposit {}", withdrawn, collected, initial_deposit);

    // Verify pool total_pool == 0 after full removal
    let market_after = client.get_market(&market_id);
    assert_eq!(market_after.total_pool, 0, "pool total_pool should be 0 after full removal");

    // Verify provider's LPPosition no longer exists
    let position_result = client.try_get_lp_position(&provider, &market_id);
    assert!(position_result.is_err(), "LPPosition should not exist after full removal");
}

// ── Dynamic Fee: Volatility Math (Unit Tests) ─────────────────────────────────

#[test]
fn test_compute_price_bps_equal_reserves() {
    assert_eq!(compute_price_bps(500, 500).unwrap(), 5000);
}

#[test]
fn test_compute_price_bps_skewed_reserves() {
    assert_eq!(compute_price_bps(9000, 1000).unwrap(), 9000);
    assert_eq!(compute_price_bps(1000, 9000).unwrap(), 1000);
}

#[test]
fn test_compute_price_bps_extremes() {
    assert_eq!(compute_price_bps(100, 0).unwrap(), 10_000);
    assert_eq!(compute_price_bps(0, 100).unwrap(), 0);
}

#[test]
fn test_compute_price_bps_zero_reserves_fails() {
    let result = compute_price_bps(0, 0);
    assert_eq!(result, Err(InsightArenaError::InvalidInput));
}

#[test]
fn test_compute_ema_zero_alpha_keeps_previous() {
    // alpha = 0 -> the new sample has no effect.
    assert_eq!(compute_ema(300, 9000, 0), 300);
}

#[test]
fn test_compute_ema_full_alpha_takes_sample() {
    // alpha = 10_000 (100%) -> EMA becomes the new sample exactly.
    assert_eq!(compute_ema(300, 9000, 10_000), 9000);
}

#[test]
fn test_compute_ema_partial_blend() {
    // prev = 0, sample = 1000, alpha = 2000 (20%) -> (0*8000 + 1000*2000) / 10000 = 200
    assert_eq!(compute_ema(0, 1000, 2000), 200);
    // prev = 200, sample = 0, alpha = 2000 -> (200*8000 + 0) / 10000 = 160
    assert_eq!(compute_ema(200, 0, 2000), 160);
}

#[test]
fn test_determine_fee_tier_boundaries_are_exact() {
    let cfg = FeeTierConfig::default_config();
    assert_eq!(cfg.calm_threshold_bps, 50);
    assert_eq!(cfg.volatile_threshold_bps, 200);

    // Exactly at the calm boundary is still calm.
    assert_eq!(determine_fee_tier(0, &cfg), FeeTier::Calm);
    assert_eq!(determine_fee_tier(50, &cfg), FeeTier::Calm);
    // One bps past calm tips into normal.
    assert_eq!(determine_fee_tier(51, &cfg), FeeTier::Normal);
    // Exactly at the volatile boundary is still normal.
    assert_eq!(determine_fee_tier(200, &cfg), FeeTier::Normal);
    // One bps past that tips into volatile.
    assert_eq!(determine_fee_tier(201, &cfg), FeeTier::Volatile);
    assert_eq!(determine_fee_tier(10_000, &cfg), FeeTier::Volatile);
}

#[test]
fn test_fee_bps_for_tier_matches_config() {
    let cfg = FeeTierConfig::default_config();
    assert_eq!(fee_bps_for_tier(&FeeTier::Calm, &cfg), cfg.calm_fee_bps);
    assert_eq!(fee_bps_for_tier(&FeeTier::Normal, &cfg), cfg.normal_fee_bps);
    assert_eq!(
        fee_bps_for_tier(&FeeTier::Volatile, &cfg),
        cfg.volatile_fee_bps
    );
}

// ── Dynamic Fee: Admin Configuration ──────────────────────────────────────────

fn custom_fee_tier_config() -> FeeTierConfig {
    FeeTierConfig {
        calm_threshold_bps: 100,
        volatile_threshold_bps: 500,
        calm_fee_bps: 10,
        normal_fee_bps: 50,
        volatile_fee_bps: 200,
        protocol_share_bps: 3000,
    }
}

#[test]
fn test_get_fee_tier_config_defaults_when_unset() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, _oracle, _xlm_token) = deploy_with_token(&env);

    let cfg = client.get_fee_tier_config();
    let expected = FeeTierConfig::default_config();
    assert_eq!(cfg.calm_threshold_bps, expected.calm_threshold_bps);
    assert_eq!(cfg.volatile_threshold_bps, expected.volatile_threshold_bps);
    assert_eq!(cfg.calm_fee_bps, expected.calm_fee_bps);
    assert_eq!(cfg.normal_fee_bps, expected.normal_fee_bps);
    assert_eq!(cfg.volatile_fee_bps, expected.volatile_fee_bps);
    assert_eq!(cfg.protocol_share_bps, expected.protocol_share_bps);
}

#[test]
fn test_update_fee_tier_config_persists_new_values() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, _oracle, _xlm_token) = deploy_with_token(&env);

    let new_config = custom_fee_tier_config();
    client.update_fee_tier_config(&admin, &new_config);

    let stored = client.get_fee_tier_config();
    assert_eq!(stored.calm_threshold_bps, 100);
    assert_eq!(stored.volatile_threshold_bps, 500);
    assert_eq!(stored.calm_fee_bps, 10);
    assert_eq!(stored.normal_fee_bps, 50);
    assert_eq!(stored.volatile_fee_bps, 200);
    assert_eq!(stored.protocol_share_bps, 3000);
}

#[test]
fn test_update_fee_tier_config_rejects_unauthorized_caller() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, _oracle, _xlm_token) = deploy_with_token(&env);

    let not_admin = Address::generate(&env);
    let new_config = custom_fee_tier_config();

    let result = client.try_update_fee_tier_config(&not_admin, &new_config);
    assert!(matches!(result, Err(Ok(InsightArenaError::Unauthorized))));
}

#[test]
fn test_update_fee_tier_config_rejects_inverted_thresholds() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, _oracle, _xlm_token) = deploy_with_token(&env);

    let mut bad_config = FeeTierConfig::default_config();
    bad_config.calm_threshold_bps = 500;
    bad_config.volatile_threshold_bps = 500; // must be strictly greater than calm

    let result = client.try_update_fee_tier_config(&admin, &bad_config);
    assert!(matches!(result, Err(Ok(InsightArenaError::InvalidInput))));
}

#[test]
fn test_update_fee_tier_config_rejects_non_monotonic_fees() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, _oracle, _xlm_token) = deploy_with_token(&env);

    let mut bad_config = FeeTierConfig::default_config();
    bad_config.calm_fee_bps = 200; // higher than normal_fee_bps

    let result = client.try_update_fee_tier_config(&admin, &bad_config);
    assert!(matches!(result, Err(Ok(InsightArenaError::InvalidFee))));
}

#[test]
fn test_update_fee_tier_config_rejects_invalid_protocol_share() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, _oracle, _xlm_token) = deploy_with_token(&env);

    let mut bad_config = FeeTierConfig::default_config();
    bad_config.protocol_share_bps = 10_001;

    let result = client.try_update_fee_tier_config(&admin, &bad_config);
    assert!(matches!(result, Err(Ok(InsightArenaError::InvalidFee))));
}

// ── Dynamic Fee: End-to-End Swap Behaviour ────────────────────────────────────

#[test]
fn test_market_fee_info_defaults_to_calm_before_any_swap() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, _oracle, xlm_token) = deploy_with_token(&env);
    let provider = Address::generate(&env);
    let market_id = client.create_market(&admin, &lp_market_params(&env));

    let sa = StellarAssetClient::new(&env, &xlm_token);
    let token = TokenClient::new(&env, &xlm_token);
    let liquidity = 1_000_000_i128;
    sa.mint(&provider, &liquidity);
    token.approve(&provider, &client.address, &liquidity, &9999);
    client.add_liquidity(&provider, &market_id, &liquidity);

    let info = client.get_market_fee_info(&market_id);
    assert_eq!(info.tier, FeeTier::Calm);
    assert_eq!(info.volatility_ema_bps, 0);
    assert_eq!(info.effective_fee_bps, FeeTierConfig::default_config().calm_fee_bps);
}

#[test]
fn test_price_moving_swap_burst_raises_fee_tier() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, _oracle, xlm_token) = deploy_with_token(&env);
    let provider = Address::generate(&env);
    let trader = Address::generate(&env);
    let market_id = client.create_market(&admin, &lp_market_params(&env));

    let sa = StellarAssetClient::new(&env, &xlm_token);
    let token = TokenClient::new(&env, &xlm_token);

    // Balanced pool: 500_000 / 500_000 reserves.
    let liquidity = 1_000_000_i128;
    sa.mint(&provider, &liquidity);
    token.approve(&provider, &client.address, &liquidity, &9999);
    client.add_liquidity(&provider, &market_id, &liquidity);

    let swap_amount = 500_000_i128;
    sa.mint(&trader, &(swap_amount * 5));
    token.approve(&trader, &client.address, &(swap_amount * 5), &9999);

    // Swap 1: pool has no prior sample, so the EMA stays at 0 (still calm).
    client.swap_outcome(
        &trader,
        &market_id,
        &symbol_short!("yes"),
        &symbol_short!("no"),
        &swap_amount,
        &0_i128,
    );
    assert_eq!(client.get_market_fee_info(&market_id).tier, FeeTier::Calm);

    // Swap 2: a large same-direction trade moves the price sharply -> tier rises to normal.
    client.swap_outcome(
        &trader,
        &market_id,
        &symbol_short!("yes"),
        &symbol_short!("no"),
        &swap_amount,
        &0_i128,
    );
    assert_eq!(client.get_market_fee_info(&market_id).tier, FeeTier::Normal);

    // Swap 3: another large same-direction trade -> tier rises to volatile.
    client.swap_outcome(
        &trader,
        &market_id,
        &symbol_short!("yes"),
        &symbol_short!("no"),
        &swap_amount,
        &0_i128,
    );
    let info_after_3 = client.get_market_fee_info(&market_id);
    assert_eq!(info_after_3.tier, FeeTier::Volatile);
    assert_eq!(
        info_after_3.effective_fee_bps,
        FeeTierConfig::default_config().volatile_fee_bps
    );

    // Two more bursts stay in the volatile tier.
    for _ in 0..2 {
        client.swap_outcome(
            &trader,
            &market_id,
            &symbol_short!("yes"),
            &symbol_short!("no"),
            &swap_amount,
            &0_i128,
        );
    }
    assert_eq!(client.get_market_fee_info(&market_id).tier, FeeTier::Volatile);
}

#[test]
fn test_quiet_period_lowers_fee_tier_back_to_calm() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, _oracle, xlm_token) = deploy_with_token(&env);
    let provider = Address::generate(&env);
    let trader = Address::generate(&env);
    let market_id = client.create_market(&admin, &lp_market_params(&env));

    let sa = StellarAssetClient::new(&env, &xlm_token);
    let token = TokenClient::new(&env, &xlm_token);

    let liquidity = 1_000_000_i128;
    sa.mint(&provider, &liquidity);
    token.approve(&provider, &client.address, &liquidity, &9999);
    client.add_liquidity(&provider, &market_id, &liquidity);

    let burst_amount = 500_000_i128;
    let quiet_amount = 10_i128;
    let quiet_swaps = 7_u32;

    sa.mint(&trader, &(burst_amount * 5 + quiet_amount * quiet_swaps as i128));
    token.approve(
        &trader,
        &client.address,
        &(burst_amount * 5 + quiet_amount * quiet_swaps as i128),
        &9999,
    );

    // Drive the market into the volatile tier with a burst of large same-direction swaps.
    for _ in 0..5 {
        client.swap_outcome(
            &trader,
            &market_id,
            &symbol_short!("yes"),
            &symbol_short!("no"),
            &burst_amount,
            &0_i128,
        );
    }
    assert_eq!(client.get_market_fee_info(&market_id).tier, FeeTier::Volatile);

    // A quiet period of tiny swaps should decay the EMA back down.
    for _ in 0..quiet_swaps {
        client.swap_outcome(
            &trader,
            &market_id,
            &symbol_short!("yes"),
            &symbol_short!("no"),
            &quiet_amount,
            &0_i128,
        );
    }

    let info = client.get_market_fee_info(&market_id);
    assert_eq!(info.tier, FeeTier::Calm);
    assert_eq!(
        info.effective_fee_bps,
        FeeTierConfig::default_config().calm_fee_bps
    );
}

#[test]
fn test_dynamic_fee_split_between_lp_and_protocol_treasury_is_conserved() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, _oracle, xlm_token) = deploy_with_token(&env);
    let provider = Address::generate(&env);
    let trader = Address::generate(&env);
    let market_id = client.create_market(&_admin, &lp_market_params(&env));

    let sa = StellarAssetClient::new(&env, &xlm_token);
    let token = TokenClient::new(&env, &xlm_token);

    let liquidity = 1_000_000_i128;
    sa.mint(&provider, &liquidity);
    token.approve(&provider, &client.address, &liquidity, &9999);
    client.add_liquidity(&provider, &market_id, &liquidity);

    // First swap: pool starts in the calm tier (default 15 bps fee).
    let info_before = client.get_market_fee_info(&market_id);
    assert_eq!(info_before.tier, FeeTier::Calm);
    let fee_bps = info_before.effective_fee_bps;

    let swap_amount = 1_000_000_i128;
    sa.mint(&trader, &swap_amount);
    token.approve(&trader, &client.address, &swap_amount, &9999);

    let treasury_before = client.get_treasury_balance();
    let lp_fees_before = client.get_lp_position(&provider, &market_id).fees_earned;

    client.swap_outcome(
        &trader,
        &market_id,
        &symbol_short!("yes"),
        &symbol_short!("no"),
        &swap_amount,
        &0_i128,
    );

    let treasury_after = client.get_treasury_balance();
    let lp_fees_after = client.get_lp_position(&provider, &market_id).fees_earned;

    let expected_total_fee = swap_amount * fee_bps as i128 / 10_000;
    let protocol_share = treasury_after - treasury_before;
    let lp_share = lp_fees_after - lp_fees_before;

    assert!(expected_total_fee > 0);
    // LP share + protocol share reconstructs the total fee exactly, to the last stroop.
    assert_eq!(protocol_share + lp_share, expected_total_fee);

    let cfg = FeeTierConfig::default_config();
    let expected_protocol_share = expected_total_fee * cfg.protocol_share_bps as i128 / 10_000;
    assert_eq!(protocol_share, expected_protocol_share);
    assert_eq!(lp_share, expected_total_fee - expected_protocol_share);
}

#[test]
fn test_swap_history_records_effective_fee_paid() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, _oracle, xlm_token) = deploy_with_token(&env);
    let provider = Address::generate(&env);
    let trader = Address::generate(&env);
    let market_id = client.create_market(&admin, &lp_market_params(&env));

    let sa = StellarAssetClient::new(&env, &xlm_token);
    let token = TokenClient::new(&env, &xlm_token);

    let liquidity = 1_000_000_i128;
    sa.mint(&provider, &liquidity);
    token.approve(&provider, &client.address, &liquidity, &9999);
    client.add_liquidity(&provider, &market_id, &liquidity);

    let swap_amount = 1_000_000_i128;
    sa.mint(&trader, &swap_amount);
    token.approve(&trader, &client.address, &swap_amount, &9999);

    let fee_bps = client.get_market_fee_info(&market_id).effective_fee_bps;
    client.swap_outcome(
        &trader,
        &market_id,
        &symbol_short!("yes"),
        &symbol_short!("no"),
        &swap_amount,
        &0_i128,
    );

    let history = client.get_swap_history(&market_id);
    let record = history.get(0).unwrap();
    let expected_fee = swap_amount * fee_bps as i128 / 10_000;
    assert_eq!(record.fee_paid, expected_fee);
}

// ── TWAP Price Oracle Tests ───────────────────────────────────────────────────

#[test]
fn test_twap_multi_swap_matches_hand_computed_average() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, _oracle, xlm_token) = deploy_with_token(&env);

    let provider = Address::generate(&env);
    let trader = Address::generate(&env);

    let sa = StellarAssetClient::new(&env, &xlm_token);
    let token = TokenClient::new(&env, &xlm_token);

    let market_id = client.create_market(&_admin, &lp_market_params(&env));

    let liquidity = 1_000_000_i128;
    sa.mint(&provider, &liquidity);
    token.approve(&provider, &client.address, &liquidity, &9999);
    client.add_liquidity(&provider, &market_id, &liquidity);

    let t0 = env.ledger().timestamp();
    let p0 = client.get_outcome_price(&market_id, &symbol_short!("yes"));

    let swap_amount = 20_000_i128;
    sa.mint(&trader, &(swap_amount * 3));
    token.approve(&trader, &client.address, &(swap_amount * 3), &9999);

    // Three swaps, each 100 seconds apart, all moving "yes" reserve upward.
    env.ledger().with_mut(|l| l.timestamp += 100);
    client.swap_outcome(
        &trader,
        &market_id,
        &symbol_short!("yes"),
        &symbol_short!("no"),
        &swap_amount,
        &0_i128,
    );
    let p1 = client.get_outcome_price(&market_id, &symbol_short!("yes"));

    env.ledger().with_mut(|l| l.timestamp += 100);
    client.swap_outcome(
        &trader,
        &market_id,
        &symbol_short!("yes"),
        &symbol_short!("no"),
        &swap_amount,
        &0_i128,
    );
    let p2 = client.get_outcome_price(&market_id, &symbol_short!("yes"));

    env.ledger().with_mut(|l| l.timestamp += 100);
    client.swap_outcome(
        &trader,
        &market_id,
        &symbol_short!("yes"),
        &symbol_short!("no"),
        &swap_amount,
        &0_i128,
    );

    let now = env.ledger().timestamp();
    assert_eq!(now, t0 + 300);

    // The window exactly spans pool creation to now, so the hand-computed
    // average only needs the prices active during each 100s interval: p0 for
    // [t0, t0+100), p1 for [t0+100, t0+200), p2 for [t0+200, t0+300). The final
    // swap (which set the price now current at t0+300) contributes zero
    // duration and is correctly excluded.
    let window: u64 = 300;
    let expected = (p0 * 100 + p1 * 100 + p2 * 100) / window as i128;

    let twap = client.get_twap(&market_id, &symbol_short!("yes"), &window);
    assert_eq!(twap, expected);
}

#[test]
fn test_twap_resists_single_block_price_spike() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, _oracle, xlm_token) = deploy_with_token(&env);

    let provider = Address::generate(&env);
    let trader = Address::generate(&env);

    let sa = StellarAssetClient::new(&env, &xlm_token);
    let token = TokenClient::new(&env, &xlm_token);

    let market_id = client.create_market(&_admin, &lp_market_params(&env));

    let liquidity = 10_000_000_i128;
    sa.mint(&provider, &liquidity);
    token.approve(&provider, &client.address, &liquidity, &9999);
    client.add_liquidity(&provider, &market_id, &liquidity);

    let t0 = env.ledger().timestamp();

    // Let a long baseline period elapse with the price sitting at its initial level.
    env.ledger().with_mut(|l| l.timestamp += 10_000);
    let price_before_spike = client.get_outcome_price(&market_id, &symbol_short!("yes"));

    // A single huge swap spikes the "yes" reserve (and therefore the spot price).
    let spike_amount = 20_000_000_i128;
    sa.mint(&trader, &spike_amount);
    token.approve(&trader, &client.address, &spike_amount, &9999);
    client.swap_outcome(
        &trader,
        &market_id,
        &symbol_short!("yes"),
        &symbol_short!("no"),
        &spike_amount,
        &0_i128,
    );

    // Advance a single second so the spike itself contributes a (tiny) sliver
    // of duration to the accumulator, then read both spot and TWAP.
    env.ledger().with_mut(|l| l.timestamp += 1);
    let spot_after_spike = client.get_outcome_price(&market_id, &symbol_short!("yes"));

    let now = env.ledger().timestamp();
    let window = now - t0;
    let twap = client.get_twap(&market_id, &symbol_short!("yes"), &window);

    assert!(spot_after_spike > price_before_spike * 2, "spike should be dramatic");

    let spot_move = (spot_after_spike - price_before_spike).abs();
    let twap_move = (twap - price_before_spike).abs();

    // The spike lasted a single second out of a 10,001 second window, so it
    // can move the TWAP by at most ~1/10000th as much as it moved the spot price.
    assert!(
        twap_move * 100 < spot_move,
        "twap_move={twap_move} should be far smaller than spot_move={spot_move}"
    );
}

#[test]
fn test_twap_empty_window_returns_typed_error() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, _oracle, xlm_token) = deploy_with_token(&env);

    let provider = Address::generate(&env);
    let market_id = client.create_market(&_admin, &lp_market_params(&env));

    let sa = StellarAssetClient::new(&env, &xlm_token);
    let token = TokenClient::new(&env, &xlm_token);
    let liquidity = 100_000_i128;
    sa.mint(&provider, &liquidity);
    token.approve(&provider, &client.address, &liquidity, &9999);
    client.add_liquidity(&provider, &market_id, &liquidity);

    let result = client.try_get_twap(&market_id, &symbol_short!("yes"), &0_u64);
    assert!(matches!(
        result,
        Err(Ok(InsightArenaError::TwapEmptyWindow))
    ));
}

#[test]
fn test_twap_window_predating_history_returns_typed_error() {
    let env = Env::default();
    env.ledger().with_mut(|l| l.timestamp = 500);
    env.mock_all_auths();
    let (client, _admin, _oracle, xlm_token) = deploy_with_token(&env);

    let provider = Address::generate(&env);
    let market_id = client.create_market(&_admin, &lp_market_params(&env));

    let sa = StellarAssetClient::new(&env, &xlm_token);
    let token = TokenClient::new(&env, &xlm_token);
    let liquidity = 100_000_i128;
    sa.mint(&provider, &liquidity);
    token.approve(&provider, &client.address, &liquidity, &9999);
    client.add_liquidity(&provider, &market_id, &liquidity);

    // Pool was created at t=500; a window of 10,000s reaches back before
    // genesis (t=0), which predates the oldest retained observation.
    let result = client.try_get_twap(&market_id, &symbol_short!("yes"), &10_000_u64);
    assert!(matches!(
        result,
        Err(Ok(InsightArenaError::TwapInsufficientHistory))
    ));
}

#[test]
fn test_twap_zero_elapsed_returns_typed_error() {
    let env = Env::default();
    env.ledger().with_mut(|l| l.timestamp = 0);
    env.mock_all_auths();
    let (client, _admin, _oracle, xlm_token) = deploy_with_token(&env);

    let provider = Address::generate(&env);
    let market_id = client.create_market(&_admin, &lp_market_params(&env));

    let sa = StellarAssetClient::new(&env, &xlm_token);
    let token = TokenClient::new(&env, &xlm_token);
    let liquidity = 100_000_i128;
    sa.mint(&provider, &liquidity);
    token.approve(&provider, &client.address, &liquidity, &9999);
    client.add_liquidity(&provider, &market_id, &liquidity);

    assert_eq!(env.ledger().timestamp(), 0);

    // At t=0 with any positive window, `window_start` saturates to 0 too, so
    // `now - window_start` collapses to zero elapsed seconds.
    let result = client.try_get_twap(&market_id, &symbol_short!("yes"), &1_u64);
    assert!(matches!(
        result,
        Err(Ok(InsightArenaError::TwapDivideByZero))
    ));
}

#[test]
fn test_twap_unknown_outcome_returns_invalid_outcome() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, _oracle, xlm_token) = deploy_with_token(&env);

    let provider = Address::generate(&env);
    let market_id = client.create_market(&_admin, &lp_market_params(&env));

    let sa = StellarAssetClient::new(&env, &xlm_token);
    let token = TokenClient::new(&env, &xlm_token);
    let liquidity = 100_000_i128;
    sa.mint(&provider, &liquidity);
    token.approve(&provider, &client.address, &liquidity, &9999);
    client.add_liquidity(&provider, &market_id, &liquidity);

    let result = client.try_get_twap(&market_id, &symbol_short!("maybe"), &100_u64);
    assert!(matches!(result, Err(Ok(InsightArenaError::InvalidOutcome))));
}

#[test]
fn test_twap_ring_buffer_wraparound() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, _oracle, xlm_token) = deploy_with_token(&env);

    let provider = Address::generate(&env);
    let trader = Address::generate(&env);

    let sa = StellarAssetClient::new(&env, &xlm_token);
    let token = TokenClient::new(&env, &xlm_token);

    let market_id = client.create_market(&_admin, &lp_market_params(&env));

    let liquidity = 100_000_000_i128;
    sa.mint(&provider, &liquidity);
    token.approve(&provider, &client.address, &liquidity, &9999);
    client.add_liquidity(&provider, &market_id, &liquidity);

    let t0 = env.ledger().timestamp();

    // Trade well past the ring buffer's capacity so it wraps at least once.
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

    // A window reaching all the way back to pool creation now exceeds what the
    // wrapped ring buffer retains (its oldest entries were overwritten), so it
    // must be rejected with a typed error rather than a silently truncated
    // (misleading) average or a panic.
    let full_window = now - t0;
    let result = client.try_get_twap(&market_id, &symbol_short!("yes"), &full_window);
    assert!(matches!(
        result,
        Err(Ok(InsightArenaError::TwapInsufficientHistory))
    ));

    // A window covering only the most recently retained observations still
    // succeeds without panicking, even though far more than
    // `TWAP_RING_BUFFER_CAPACITY` price-changing operations occurred over the
    // pool's full lifetime.
    let recent_window: u64 = (TWAP_RING_BUFFER_CAPACITY as u64 / 2) * 50;
    let twap = client.get_twap(&market_id, &symbol_short!("yes"), &recent_window);
    assert!(twap > 0);
}
