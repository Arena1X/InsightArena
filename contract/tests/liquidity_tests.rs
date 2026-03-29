use insightarena_contract::liquidity::calculate_swap_output;

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
