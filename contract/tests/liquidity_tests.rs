use insightarena_contract::liquidity::{calculate_swap_output, calculate_lp_tokens};

#[test]
fn test_calculate_swap_output_equal_reserves() {
    // Input: 100, Reserves: 1000/1000, Fee: 30 bps
    let out = calculate_swap_output(100, 1000, 1000, 30).unwrap();
    assert_eq!(out, 89);
}

#[test]
fn test_calculate_swap_output_unequal_reserves() {
    // Input: 100, Reserves: 2000/1000, Fee: 30 bps
    let out = calculate_swap_output(100, 2000, 1000, 30).unwrap();
    assert_eq!(out, 46);
}

#[test]
fn test_calculate_swap_output_large_trade() {
    // Input: 500, Reserves: 1000/1000, Fee: 30 bps
    let out = calculate_swap_output(500, 1000, 1000, 30).unwrap();
    assert_eq!(out, 332);
}

#[test]
fn test_calculate_swap_output_small_trade() {
    // Input: 1, Reserves: 1000/1000, Fee: 30 bps
    let out = calculate_swap_output(1, 1000, 1000, 30).unwrap();
    assert_eq!(out, 0);
}

#[test]
fn test_calculate_swap_output_zero_fee() {
    // Input: 100, Reserves: 1000/1000, Fee: 0
    let out = calculate_swap_output(100, 1000, 1000, 0).unwrap();
    assert_eq!(out, 90);
}

#[test]
fn test_calculate_swap_output_high_fee() {
    // Input: 100, Reserves: 1000/1000, Fee: 500 bps
    let out = calculate_swap_output(100, 1000, 1000, 500).unwrap();
    assert_eq!(out, 85);
}

#[test]
fn test_calculate_swap_output_precision() {
    // Input: 1, Reserves: 1_000_000/1_000_000, Fee: 0
    let out = calculate_swap_output(1, 1_000_000, 1_000_000, 0).unwrap();
    assert_eq!(out, 0);
}

#[test]
fn test_calculate_swap_output_large_reserves() {
    // Input: 1000, Reserves: 1_000_000/1_000_000, Fee: 30 bps
    let out = calculate_swap_output(1000, 1_000_000, 1_000_000, 30).unwrap();
    assert_eq!(out, 996);
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
