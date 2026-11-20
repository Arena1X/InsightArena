//! Value Conservation Tests for Market Resolution Payouts
//!
//! These tests verify that market resolution payouts conserve value:
//! the sum of all payouts plus fees must equal the market's total pool
//! within documented rounding tolerance.
//!
//! Test Coverage:
//! 1. Payouts + fees == pool within tolerance
//! 2. No winner is paid more than entitled
//! 3. Fully one-sided markets (all predictors on winning side)
//! 4. Edge cases: single winner, many winners, various stake sizes

#![cfg(test)]

use soroban_sdk::{symbol_short, testutils::Address as _, Address, Env};

mod open_market {
    soroban_sdk::contractimport!(
        file = "../target/wasm32-unknown-unknown/release/open_market.wasm"
    );
}

use open_market::InsightArenaContractClient as Client;

/// Helper function to setup test environment
fn setup_test_env() -> (Env, Client, Address, Address) {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract_wasm(None, open_market::WASM);
    let client = Client::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let oracle = Address::generate(&env);

    client.initialize(
        &admin,
        &oracle,
        &100,  // protocol_fee_bps (1%)
        &200,  // max_creator_fee_bps (2%)
        &10,   // min_creator_reputation
        &1_000_000, // min_stake (1 XLM)
        &1_000_000_000_000, // max_stake
    );

    (env, client, admin, oracle)
}

/// Helper to create a simple binary market
fn create_simple_market(client: &Client, creator: &Address, end_offset: u64) -> u64 {
    let env = client.env();
    let now = env.ledger().timestamp();
    
    let params = open_market::CreateMarketParams {
        title: soroban_sdk::String::from_str(&env, "Test Market"),
        description: soroban_sdk::String::from_str(&env, "Value conservation test"),
        category: symbol_short!("test"),
        outcomes: soroban_sdk::vec![&env, symbol_short!("yes"), symbol_short!("no")],
        end_time: now + end_offset,
        resolution_time: now + end_offset + 100,
        dispute_window: 300,
        creator_fee_bps: 100, // 1%
        min_stake: 0,
        max_stake: 0,
        is_public: true,
        metadata_hash: soroban_sdk::BytesN::from_array(&env, &[0u8; 32]),
    };

    client.create_market(creator, &params)
}

#[test]
fn test_payout_uses_checked_arithmetic() {
    // This test verifies that the compute_payout_breakdown uses checked arithmetic
    // by ensuring it doesn't panic on valid inputs
    let (env, client, _admin, oracle) = setup_test_env();
    
    let creator = Address::generate(&env);
    let winner = Address::generate(&env);
    let loser = Address::generate(&env);

    let market_id = create_simple_market(&client, &creator, 1000);

    // Submit predictions with checked values
    client.submit_prediction(&winner, &market_id, &symbol_short!("yes"), &50_000_000);
    client.submit_prediction(&loser, &market_id, &symbol_short!("no"), &50_000_000);

    let market = client.get_market(&market_id);
    env.ledger().with_mut(|li| li.timestamp = market.resolution_time);
    
    // This should not panic - checked arithmetic is used throughout
    client.resolve_market(&oracle, &market_id, &symbol_short!("yes"));
    let payout = client.claim_payout(&winner, &market_id);
    
    // Verify reasonable payout
    assert!(payout > 0, "Payout should be positive");
    assert!(payout < 100_000_000, "Payout should be less than total pool");
}

#[test]
fn test_value_conservation_basic() {
    let (env, client, admin, oracle) = setup_test_env();
    
    let creator = Address::generate(&env);
    let winner1 = Address::generate(&env);
    let winner2 = Address::generate(&env);
    let loser1 = Address::generate(&env);
    let loser2 = Address::generate(&env);

    // Create market
    let market_id = create_simple_market(&client, &creator, 1000);

    // Submit predictions
    client.submit_prediction(&winner1, &market_id, &symbol_short!("yes"), &10_000_000);
    client.submit_prediction(&winner2, &market_id, &symbol_short!("yes"), &20_000_000);
    client.submit_prediction(&loser1, &market_id, &symbol_short!("no"), &15_000_000);
    client.submit_prediction(&loser2, &market_id, &symbol_short!("no"), &25_000_000);

    let market = client.get_market(&market_id);
    let total_pool = market.total_pool;
    assert_eq!(total_pool, 70_000_000);

    // Advance time and resolve
    env.ledger().with_mut(|li| li.timestamp = market.resolution_time);
    client.resolve_market(&oracle, &market_id, &symbol_short!("yes"));

    // Claim all payouts
    let payout1 = client.claim_payout(&winner1, &market_id);
    let payout2 = client.claim_payout(&winner2, &market_id);

    // Calculate expected values
    let winning_pool = 30_000_000i128; // winner1 + winner2
    let loser_pool = 40_000_000i128;   // loser1 + loser2

    // Each winner gets their stake back plus proportional share of loser pool
    // winner_share = (stake * loser_pool) / winning_pool
    // gross_payout = stake + winner_share
    // Then fees are deducted: protocol_fee (1%) + creator_fee (1%)

    let winner1_share = (10_000_000 * loser_pool) / winning_pool;  // 13_333_333
    let winner1_gross = 10_000_000 + winner1_share;                 // 23_333_333
    let winner1_protocol_fee = (winner1_gross * 100) / 10_000;       // 233_333
    let winner1_creator_fee = (winner1_gross * 100) / 10_000;        // 233_333
    let winner1_expected = winner1_gross - winner1_protocol_fee - winner1_creator_fee; // 22_866_667

    let winner2_share = (20_000_000 * loser_pool) / winning_pool;  // 26_666_666
    let winner2_gross = 20_000_000 + winner2_share;                 // 46_666_666
    let winner2_protocol_fee = (winner2_gross * 100) / 10_000;       // 466_666
    let winner2_creator_fee = (winner2_gross * 100) / 10_000;        // 466_666
    let winner2_expected = winner2_gross - winner2_protocol_fee - winner2_creator_fee; // 45_733_334

    // Verify individual payouts are within expected range
    assert!(payout1 >= winner1_expected - 1 && payout1 <= winner1_expected + 1,
            "Winner 1 payout {} not near expected {}", payout1, winner1_expected);
    assert!(payout2 >= winner2_expected - 1 && payout2 <= winner2_expected + 1,
            "Winner 2 payout {} not near expected {}", payout2, winner2_expected);

    // Calculate total fees
    let total_protocol_fees = winner1_protocol_fee + winner2_protocol_fee;
    let total_creator_fees = winner1_creator_fee + winner2_creator_fee;
    let total_fees = total_protocol_fees + total_creator_fees;

    // VALUE CONSERVATION CHECK:
    // Sum of all payouts + fees should equal the total pool within rounding tolerance
    let total_distributed = payout1 + payout2 + total_fees;
    let tolerance = 2; // ±2 stroops tolerance for 2 winners
    
    assert!(
        (total_distributed - total_pool).abs() <= tolerance,
        "Value not conserved: distributed {} vs pool {} (diff: {})",
        total_distributed,
        total_pool,
        (total_distributed - total_pool).abs()
    );
}

#[test]
fn test_value_conservation_single_winner() {
    let (env, client, admin, oracle) = setup_test_env();
    
    let creator = Address::generate(&env);
    let winner = Address::generate(&env);
    let loser1 = Address::generate(&env);
    let loser2 = Address::generate(&env);

    let market_id = create_simple_market(&client, &creator, 1000);

    // One winner, two losers
    client.submit_prediction(&winner, &market_id, &symbol_short!("yes"), &50_000_000);
    client.submit_prediction(&loser1, &market_id, &symbol_short!("no"), &30_000_000);
    client.submit_prediction(&loser2, &market_id, &symbol_short!("no"), &20_000_000);

    let market = client.get_market(&market_id);
    let total_pool = market.total_pool;
    assert_eq!(total_pool, 100_000_000);

    env.ledger().with_mut(|li| li.timestamp = market.resolution_time);
    client.resolve_market(&oracle, &market_id, &symbol_short!("yes"));

    let payout = client.claim_payout(&winner, &market_id);

    // Calculate expected
    let winning_pool = 50_000_000i128;
    let loser_pool = 50_000_000i128;
    let winner_share = loser_pool; // Full loser pool goes to single winner
    let gross_payout = winning_pool + winner_share; // 100_000_000
    let protocol_fee = (gross_payout * 100) / 10_000; // 1_000_000
    let creator_fee = (gross_payout * 100) / 10_000;   // 1_000_000
    let expected_net = gross_payout - protocol_fee - creator_fee; // 98_000_000

    assert_eq!(payout, expected_net);

    // VALUE CONSERVATION: payout + fees == pool
    let total_fees = protocol_fee + creator_fee;
    let total_distributed = payout + total_fees;
    
    assert_eq!(
        total_distributed, total_pool,
        "Value not conserved for single winner: {} vs {}",
        total_distributed, total_pool
    );
}

#[test]
fn test_value_conservation_all_winners() {
    // Fully one-sided market: all predictors on winning side
    let (env, client, admin, oracle) = setup_test_env();
    
    let creator = Address::generate(&env);
    let winner1 = Address::generate(&env);
    let winner2 = Address::generate(&env);
    let winner3 = Address::generate(&env);

    let market_id = create_simple_market(&client, &creator, 1000);

    // All predictions on the same side
    client.submit_prediction(&winner1, &market_id, &symbol_short!("yes"), &10_000_000);
    client.submit_prediction(&winner2, &market_id, &symbol_short!("yes"), &20_000_000);
    client.submit_prediction(&winner3, &market_id, &symbol_short!("yes"), &30_000_000);

    let market = client.get_market(&market_id);
    let total_pool = market.total_pool;
    assert_eq!(total_pool, 60_000_000);

    env.ledger().with_mut(|li| li.timestamp = market.resolution_time);
    client.resolve_market(&oracle, &market_id, &symbol_short!("yes"));

    // Claim all payouts
    let payout1 = client.claim_payout(&winner1, &market_id);
    let payout2 = client.claim_payout(&winner2, &market_id);
    let payout3 = client.claim_payout(&winner3, &market_id);

    // In a fully one-sided market:
    // - winning_pool = total_pool
    // - loser_pool = 0
    // - Each winner gets back exactly their stake (no profit)
    // - Fees are NOT deducted (gross_payout = stake, fees = 0)

    assert_eq!(payout1, 10_000_000, "Winner 1 should get stake back");
    assert_eq!(payout2, 20_000_000, "Winner 2 should get stake back");
    assert_eq!(payout3, 30_000_000, "Winner 3 should get stake back");

    // VALUE CONSERVATION: all payouts == pool (no fees in one-sided market)
    let total_distributed = payout1 + payout2 + payout3;
    
    assert_eq!(
        total_distributed, total_pool,
        "Value not conserved in one-sided market: {} vs {}",
        total_distributed, total_pool
    );
}

#[test]
fn test_no_winner_overpaid() {
    // Verify that no winner receives more than their entitled share
    let (env, client, admin, oracle) = setup_test_env();
    
    let creator = Address::generate(&env);
    let winner1 = Address::generate(&env);
    let winner2 = Address::generate(&env);
    let winner3 = Address::generate(&env);
    let loser = Address::generate(&env);

    let market_id = create_simple_market(&client, &creator, 1000);

    // Three winners with different stakes
    let stake1 = 5_000_000i128;
    let stake2 = 10_000_000i128;
    let stake3 = 15_000_000i128;
    let loser_stake = 60_000_000i128;

    client.submit_prediction(&winner1, &market_id, &symbol_short!("yes"), &stake1);
    client.submit_prediction(&winner2, &market_id, &symbol_short!("yes"), &stake2);
    client.submit_prediction(&winner3, &market_id, &symbol_short!("yes"), &stake3);
    client.submit_prediction(&loser, &market_id, &symbol_short!("no"), &loser_stake);

    let market = client.get_market(&market_id);
    env.ledger().with_mut(|li| li.timestamp = market.resolution_time);
    client.resolve_market(&oracle, &market_id, &symbol_short!("yes"));

    let payout1 = client.claim_payout(&winner1, &market_id);
    let payout2 = client.claim_payout(&winner2, &market_id);
    let payout3 = client.claim_payout(&winner3, &market_id);

    let winning_pool = stake1 + stake2 + stake3;
    let loser_pool = loser_stake;

    // Each winner's maximum entitled share (before fees):
    // max_entitled = stake + (stake * loser_pool / winning_pool)
    let max_entitled1 = stake1 + (stake1 * loser_pool) / winning_pool;
    let max_entitled2 = stake2 + (stake2 * loser_pool) / winning_pool;
    let max_entitled3 = stake3 + (stake3 * loser_pool) / winning_pool;

    // Verify no winner is paid more than entitled (even before fee deduction)
    assert!(
        payout1 <= max_entitled1,
        "Winner 1 overpaid: {} > {}",
        payout1, max_entitled1
    );
    assert!(
        payout2 <= max_entitled2,
        "Winner 2 overpaid: {} > {}",
        payout2, max_entitled2
    );
    assert!(
        payout3 <= max_entitled3,
        "Winner 3 overpaid: {} > {}",
        payout3, max_entitled3
    );
}

#[test]
fn test_value_conservation_many_winners() {
    // Test with many winners to verify rounding tolerance scales appropriately
    let (env, client, _admin, oracle) = setup_test_env();
    
    let creator = Address::generate(&env);
    let market_id = create_simple_market(&client, &creator, 1000);

    // Create 10 winners and 5 losers
    let mut winners = Vec::new(&env);
    let mut winner_stakes: soroban_sdk::Vec<i128> = soroban_sdk::vec![&env];
    
    for i in 0..10 {
        let winner = Address::generate(&env);
        let stake = ((i + 1) * 1_000_000) as i128;
        client.submit_prediction(&winner, &market_id, &symbol_short!("yes"), &stake);
        winners.push_back(winner);
        winner_stakes.push_back(stake);
    }

    // Add losers
    for i in 0..5 {
        let loser = Address::generate(&env);
        let stake = ((i + 1) * 5_000_000) as i128;
        client.submit_prediction(&loser, &market_id, &symbol_short!("no"), &stake);
    }

    let market = client.get_market(&market_id);
    let total_pool = market.total_pool;

    env.ledger().with_mut(|li| li.timestamp = market.resolution_time);
    client.resolve_market(&oracle, &market_id, &symbol_short!("yes"));

    // Claim all winner payouts and calculate total
    let mut total_payouts = 0i128;
    for winner in winners.iter() {
        let payout = client.claim_payout(&winner, &market_id);
        total_payouts = total_payouts.checked_add(payout).unwrap();
    }

    // Calculate expected fees (approximate based on pool distribution)
    let winning_pool: i128 = winner_stakes.iter().sum();
    let loser_pool = total_pool - winning_pool;
    
    // Each winner's gross payout calculation for fee estimation
    let mut total_fees_estimate = 0i128;
    for stake in winner_stakes.iter() {
        let winner_share = (stake * loser_pool) / winning_pool;
        let gross = stake + winner_share;
        let protocol_fee = (gross * 100) / 10_000;
        let creator_fee = (gross * 100) / 10_000;
        total_fees_estimate += protocol_fee + creator_fee;
    }

    // VALUE CONSERVATION: payouts + fees ≈ pool
    let total_distributed = total_payouts + total_fees_estimate;
    let tolerance = 10; // ±10 stroops for 10 winners
    
    assert!(
        (total_distributed - total_pool).abs() <= tolerance,
        "Value not conserved with many winners: distributed {} vs pool {} (diff: {})",
        total_distributed,
        total_pool,
        (total_distributed - total_pool).abs()
    );
}

#[test]
fn test_value_conservation_large_stakes() {
    // Test with very large stake amounts to ensure no overflow
    let (env, client, _admin, oracle) = setup_test_env();
    
    let creator = Address::generate(&env);
    let winner = Address::generate(&env);
    let loser = Address::generate(&env);

    let market_id = create_simple_market(&client, &creator, 1000);

    // Use large but valid stake amounts (within max_stake limit)
    let large_stake = 100_000_000_000_000i128; // 100 trillion stroops
    
    client.submit_prediction(&winner, &market_id, &symbol_short!("yes"), &large_stake);
    client.submit_prediction(&loser, &market_id, &symbol_short!("no"), &large_stake);

    let market = client.get_market(&market_id);
    let total_pool = market.total_pool;

    env.ledger().with_mut(|li| li.timestamp = market.resolution_time);
    client.resolve_market(&oracle, &market_id, &symbol_short!("yes"));

    let payout = client.claim_payout(&winner, &market_id);

    // Calculate expected values
    let gross = large_stake * 2; // Winner gets both stakes
    let protocol_fee = (gross * 100) / 10_000;
    let creator_fee = (gross * 100) / 10_000;
    let expected_net = gross - protocol_fee - creator_fee;

    assert_eq!(payout, expected_net);

    // VALUE CONSERVATION
    let total_fees = protocol_fee + creator_fee;
    let total_distributed = payout + total_fees;
    
    assert_eq!(
        total_distributed, total_pool,
        "Value not conserved with large stakes: {} vs {}",
        total_distributed, total_pool
    );
}

#[test]
fn test_value_conservation_small_stakes() {
    // Test with very small stakes to verify rounding behavior
    let (env, client, _admin, oracle) = setup_test_env();
    
    let creator = Address::generate(&env);
    let winner1 = Address::generate(&env);
    let winner2 = Address::generate(&env);
    let loser = Address::generate(&env);

    let market_id = create_simple_market(&client, &creator, 1000);

    // Use minimum valid stakes
    let small_stake = 1_000_000i128; // 1 XLM = minimum stake
    
    client.submit_prediction(&winner1, &market_id, &symbol_short!("yes"), &small_stake);
    client.submit_prediction(&winner2, &market_id, &symbol_short!("yes"), &small_stake);
    client.submit_prediction(&loser, &market_id, &symbol_short!("no"), &small_stake);

    let market = client.get_market(&market_id);
    let total_pool = market.total_pool;

    env.ledger().with_mut(|li| li.timestamp = market.resolution_time);
    client.resolve_market(&oracle, &market_id, &symbol_short!("yes"));

    let payout1 = client.claim_payout(&winner1, &market_id);
    let payout2 = client.claim_payout(&winner2, &market_id);

    // With small stakes, rounding effects are more visible
    let winning_pool = 2 * small_stake;
    let loser_pool = small_stake;
    
    let winner_share = (small_stake * loser_pool) / winning_pool; // 500_000
    let gross = small_stake + winner_share; // 1_500_000
    let protocol_fee = (gross * 100) / 10_000; // 15_000
    let creator_fee = (gross * 100) / 10_000;   // 15_000
    
    let total_fees = 2 * (protocol_fee + creator_fee);
    let total_payouts = payout1 + payout2;
    let total_distributed = total_payouts + total_fees;
    
    let tolerance = 2; // ±2 stroops for 2 winners
    
    assert!(
        (total_distributed - total_pool).abs() <= tolerance,
        "Value not conserved with small stakes: distributed {} vs pool {} (diff: {})",
        total_distributed,
        total_pool,
        (total_distributed - total_pool).abs()
    );
}

#[test]
fn test_batch_distribute_value_conservation() {
    // Test batch distribution maintains value conservation
    let (env, client, admin, oracle) = setup_test_env();
    
    let creator = Address::generate(&env);
    let market_id = create_simple_market(&client, &creator, 1000);

    // Create several winners
    let winner1 = Address::generate(&env);
    let winner2 = Address::generate(&env);
    let winner3 = Address::generate(&env);
    let loser = Address::generate(&env);

    client.submit_prediction(&winner1, &market_id, &symbol_short!("yes"), &10_000_000);
    client.submit_prediction(&winner2, &market_id, &symbol_short!("yes"), &15_000_000);
    client.submit_prediction(&winner3, &market_id, &symbol_short!("yes"), &20_000_000);
    client.submit_prediction(&loser, &market_id, &symbol_short!("no"), &30_000_000);

    let market = client.get_market(&market_id);
    let total_pool = market.total_pool;

    env.ledger().with_mut(|li| li.timestamp = market.resolution_time);
    client.resolve_market(&oracle, &market_id, &symbol_short!("yes"));

    // Use batch distribution instead of individual claims
    let processed = client.batch_distribute_payouts(&oracle, &market_id);
    assert_eq!(processed, 3, "Should process all 3 winners");

    // Get the final payouts from prediction records
    let pred1 = client.get_prediction(&market_id, &winner1);
    let pred2 = client.get_prediction(&market_id, &winner2);
    let pred3 = client.get_prediction(&market_id, &winner3);

    let total_payouts = pred1.payout_amount + pred2.payout_amount + pred3.payout_amount;

    // Calculate fees
    let winning_pool = 45_000_000i128;
    let loser_pool = 30_000_000i128;
    
    let mut total_fees = 0i128;
    for stake in [10_000_000i128, 15_000_000i128, 20_000_000i128].iter() {
        let share = (stake * loser_pool) / winning_pool;
        let gross = stake + share;
        let protocol_fee = (gross * 100) / 10_000;
        let creator_fee = (gross * 100) / 10_000;
        total_fees += protocol_fee + creator_fee;
    }

    let total_distributed = total_payouts + total_fees;
    let tolerance = 3; // ±3 stroops for 3 winners
    
    assert!(
        (total_distributed - total_pool).abs() <= tolerance,
        "Batch distribution doesn't conserve value: {} vs {}",
        total_distributed, total_pool
    );
}
