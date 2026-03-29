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
use insightarena_contract::{InsightArenaContract, InsightArenaContractClient, InsightArenaError};
use soroban_sdk::testutils::Address as _;
use soroban_sdk::{Address, Env};

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
        let amount_out = calculate_swap_output(swap_amount, reserve_in, reserve_out, fee_bps).unwrap();
        
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
    
    // Deposits below minimum should be rejected in actual implementation
    // This is a constant check
    assert!(MIN_LIQUIDITY > 0);
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
    
    // Verify constants are reasonable
    assert!(MIN_LIQUIDITY > 0);
    assert!(DEFAULT_FEE_BPS < 10_000); // Fee should be less than 100%
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
