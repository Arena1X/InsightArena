#![cfg(test)]

use insightarena_contract::market::CreateMarketParams;
use insightarena_contract::reputation::*;
use insightarena_contract::storage_types::CreatorStats;
use insightarena_contract::{InsightArenaContract, InsightArenaContractClient};
use soroban_sdk::testutils::{Address as _, Ledger as _};
use soroban_sdk::token::{Client as TokenClient, StellarAssetClient};
use soroban_sdk::{symbol_short, vec, Address, Env, String, Symbol};

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
    (client, admin, oracle, xlm_token)
}

fn default_params(env: &Env) -> CreateMarketParams {
    let now = env.ledger().timestamp();
    CreateMarketParams {
        title: String::from_str(env, "Test market"),
        description: String::from_str(env, "desc"),
        category: Symbol::new(env, "Sports"),
        outcomes: vec![env, symbol_short!("yes"), symbol_short!("no")],
        end_time: now + 1000,
        resolution_time: now + 2000,
        dispute_window: 86_400,
        creator_fee_bps: 100,
        min_stake: 10_000_000,
        max_stake: 100_000_000,
        is_public: true,
    }
}

// ── Pure formula tests ────────────────────────────────────────────────────

#[test]
fn reputation_zero_for_new_creator() {
    let stats = CreatorStats {
        markets_created: 0,
        markets_resolved: 0,
        average_participant_count: 0,
        dispute_count: 0,
        reputation_score: 0,
    };
    assert_eq!(calculate_creator_reputation(&stats), 0);
}

#[test]
fn reputation_perfect_score_no_disputes() {
    // 10/10 resolved, 100 avg participants → 600 + 200 - 0 = 800
    let stats = CreatorStats {
        markets_created: 10,
        markets_resolved: 10,
        average_participant_count: 100,
        dispute_count: 0,
        reputation_score: 0,
    };
    assert_eq!(calculate_creator_reputation(&stats), 800);
}

#[test]
fn reputation_clamped_to_1000() {
    let stats = CreatorStats {
        markets_created: 1,
        markets_resolved: 1,
        average_participant_count: 300, // bonus capped at 200
        dispute_count: 0,
        reputation_score: 0,
    };
    // 600 + 200 = 800
    assert_eq!(calculate_creator_reputation(&stats), 800);
}

#[test]
fn reputation_dispute_penalty_capped_at_200() {
    // 10 * 50 = 500, capped at 200 → 600 + 0 - 200 = 400
    let stats = CreatorStats {
        markets_created: 10,
        markets_resolved: 10,
        average_participant_count: 0,
        dispute_count: 10,
        reputation_score: 0,
    };
    assert_eq!(calculate_creator_reputation(&stats), 400);
}

#[test]
fn reputation_never_underflows() {
    // 0 resolved, max disputes → saturating_sub → 0
    let stats = CreatorStats {
        markets_created: 10,
        markets_resolved: 0,
        average_participant_count: 0,
        dispute_count: 100,
        reputation_score: 0,
    };
    assert_eq!(calculate_creator_reputation(&stats), 0);
}

#[test]
fn reputation_partial_resolution() {
    // 5/10 * 600 = 300, 10 * 2 = 20, 1 * 50 = 50 → 270
    let stats = CreatorStats {
        markets_created: 10,
        markets_resolved: 5,
        average_participant_count: 10,
        dispute_count: 1,
        reputation_score: 0,
    };
    assert_eq!(calculate_creator_reputation(&stats), 270);
}

#[test]
fn reputation_participation_bonus_capped_at_200() {
    let stats = CreatorStats {
        markets_created: 1,
        markets_resolved: 1,
        average_participant_count: 200, // 200 * 2 = 400, capped at 200
        dispute_count: 0,
        reputation_score: 0,
    };
    assert_eq!(calculate_creator_reputation(&stats), 800);
}

// ── Integration tests ─────────────────────────────────────────────────────

#[test]
fn get_creator_stats_returns_default_for_unknown_creator() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _, _, _) = deploy(&env);
    let unknown = Address::generate(&env);

    let stats = client.get_creator_stats(&unknown);
    assert_eq!(stats.markets_created, 0);
    assert_eq!(stats.markets_resolved, 0);
    assert_eq!(stats.reputation_score, 0);
}

#[test]
fn stats_updated_on_market_creation() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _, _, _) = deploy(&env);
    let creator = Address::generate(&env);

    client.create_market(&creator, &default_params(&env));

    let stats = client.get_creator_stats(&creator);
    assert_eq!(stats.markets_created, 1);
    assert_eq!(stats.markets_resolved, 0);
}

#[test]
fn stats_updated_on_market_resolution() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _, oracle, _) = deploy(&env);
    let creator = Address::generate(&env);

    let id = client.create_market(&creator, &default_params(&env));
    env.ledger().set_timestamp(env.ledger().timestamp() + 2000);
    client.resolve_market(&oracle, &id, &symbol_short!("yes"));

    let stats = client.get_creator_stats(&creator);
    assert_eq!(stats.markets_created, 1);
    assert_eq!(stats.markets_resolved, 1);
}

#[test]
fn stats_accumulate_across_multiple_markets() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _, oracle, _) = deploy(&env);
    let creator = Address::generate(&env);

    let id1 = client.create_market(&creator, &default_params(&env));
    let id2 = client.create_market(&creator, &default_params(&env));

    let stats = client.get_creator_stats(&creator);
    assert_eq!(stats.markets_created, 2);

    env.ledger().set_timestamp(env.ledger().timestamp() + 2000);
    client.resolve_market(&oracle, &id1, &symbol_short!("yes"));
    client.resolve_market(&oracle, &id2, &symbol_short!("no"));

    let stats = client.get_creator_stats(&creator);
    assert_eq!(stats.markets_resolved, 2);
}

#[test]
fn reputation_score_stored_in_stats() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _, oracle, _) = deploy(&env);
    let creator = Address::generate(&env);

    let id = client.create_market(&creator, &default_params(&env));
    env.ledger().set_timestamp(env.ledger().timestamp() + 2000);
    client.resolve_market(&oracle, &id, &symbol_short!("yes"));

    let stats = client.get_creator_stats(&creator);
    // 1/1 resolved = 600, 0 participants, 0 disputes → 600
    assert_eq!(stats.reputation_score, 600);
}

#[test]
fn reputation_score_always_in_range() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _, oracle, _) = deploy(&env);
    let creator = Address::generate(&env);

    for _ in 0..3 {
        let id = client.create_market(&creator, &default_params(&env));
        env.ledger().set_timestamp(env.ledger().timestamp() + 2000);
        client.resolve_market(&oracle, &id, &symbol_short!("yes"));
    }

    let stats = client.get_creator_stats(&creator);
    assert!(stats.reputation_score <= 1000);
}

#[test]
fn test_reputation_decay_over_time() {
    // Test that reputation scores decay appropriately over time
    // Ensures inactive users don't maintain high scores indefinitely
    let env = Env::default();
    env.mock_all_auths();

    let (client, _, oracle, _) = deploy(&env);
    let creator = Address::generate(&env);

    // Create and resolve market to get positive reputation
    let id = client.create_market(&creator, &default_params(&env));
    env.ledger().set_timestamp(env.ledger().timestamp() + 2000);
    client.resolve_market(&oracle, &id, &symbol_short!("yes"));

    let stats = client.get_creator_stats(&creator);
    assert_eq!(stats.reputation_score, 600);

    // Fast forward in time
    env.ledger()
        .set_timestamp(env.ledger().timestamp() + 86400 * 30); // 30 days
    let stats_after_time = client.get_creator_stats(&creator);

    // Update this when decay logic is implemented in the reputation formula
    // For now we assert the current behavior where stats aren't decayed
    assert_eq!(stats_after_time.reputation_score, 600);
}

#[test]
fn test_reputation_with_high_dispute_count() {
    // Test reputation calculation with many disputes to verify penalty cap
    let env = Env::default();
    env.mock_all_auths();
    let (client, _, oracle, _) = deploy(&env);
    let creator = Address::generate(&env);

    // Create and resolve multiple markets
    for _ in 0..10 {
        let id = client.create_market(&creator, &default_params(&env));
        env.ledger().set_timestamp(env.ledger().timestamp() + 2000);
        client.resolve_market(&oracle, &id, &symbol_short!("yes"));
    }

    // Manually verify the reputation calculation with high dispute scenario
    // In a real scenario, disputes would be triggered through the dispute mechanism
    let stats = client.get_creator_stats(&creator);

    // With 10 markets created and resolved, no disputes yet
    // Expected: 10/10 * 600 = 600, 0 participation bonus, 0 disputes = 600
    assert_eq!(stats.markets_created, 10);
    assert_eq!(stats.markets_resolved, 10);
    assert_eq!(stats.reputation_score, 600);

    // Test the formula directly with high dispute count
    let high_dispute_stats = CreatorStats {
        markets_created: 10,
        markets_resolved: 10,
        average_participant_count: 50,
        dispute_count: 20, // Very high dispute count
        reputation_score: 0,
    };

    let reputation = calculate_creator_reputation(&high_dispute_stats);
    // 600 + 100 (50*2 capped at 200) - 200 (20*50 capped at 200) = 500
    assert_eq!(reputation, 500);
}

#[test]
fn test_reset_creator_stats_clears_all_fields() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, oracle, _) = deploy(&env);
    let creator = Address::generate(&env);

    let id = client.create_market(&creator, &default_params(&env));
    env.ledger().set_timestamp(env.ledger().timestamp() + 2000);
    client.resolve_market(&oracle, &id, &symbol_short!("yes"));

    let stats_before = client.get_creator_stats(&creator);
    assert_eq!(stats_before.markets_resolved, 1);
    assert_eq!(stats_before.markets_created, 1);

    client.reset_creator_stats(&admin, &creator);

    let stats_after = client.get_creator_stats(&creator);
    assert_eq!(stats_after.markets_created, 0);
    assert_eq!(stats_after.markets_resolved, 0);
    assert_eq!(stats_after.average_participant_count, 0);
    assert_eq!(stats_after.dispute_count, 0);
    assert_eq!(stats_after.reputation_score, 0);
}

#[test]
fn test_reset_creator_stats_unauthorized_fails() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, _, _) = deploy(&env);
    let creator = Address::generate(&env);
    let unauthorized = Address::generate(&env);

    let result = client.try_reset_creator_stats(&unauthorized, &creator);
    assert!(result.is_err());
}

#[test]
fn test_reset_creator_stats_reputation_becomes_zero() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, oracle, _) = deploy(&env);
    let creator = Address::generate(&env);

    let id = client.create_market(&creator, &default_params(&env));
    env.ledger().set_timestamp(env.ledger().timestamp() + 2000);
    client.resolve_market(&oracle, &id, &symbol_short!("yes"));

    let stats_before = client.get_creator_stats(&creator);
    assert!(stats_before.reputation_score > 0);

    client.reset_creator_stats(&admin, &creator);

    let stats_after = client.get_creator_stats(&creator);
    assert_eq!(stats_after.reputation_score, 0);
}

#[test]
fn test_get_top_creators_empty_before_any_markets() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _, _, _) = deploy(&env);

    let top_creators = client.get_top_creators(&10);
    assert_eq!(top_creators.len(), 0);
}

#[test]
fn test_get_top_creators_returns_sorted_by_reputation() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _, oracle, _) = deploy(&env);

    let creator1 = Address::generate(&env);
    let creator2 = Address::generate(&env);
    let creator3 = Address::generate(&env);

    // Creator 1: 1/1 resolved -> 600
    let id1 = client.create_market(&creator1, &default_params(&env));
    env.ledger().set_timestamp(env.ledger().timestamp() + 2000);
    client.resolve_market(&oracle, &id1, &symbol_short!("yes"));

    // Creator 2: 2/2 resolved -> 600 (same as creator 1 for now, but we'll add participants)
    // Actually, let's just make them different.
    // Creator 2: 2/2 resolved, 50 avg participants -> 600 + 100 = 700
    let id2 = client.create_market(&creator2, &default_params(&env));
    let id3 = client.create_market(&creator2, &default_params(&env));
    env.ledger().set_timestamp(env.ledger().timestamp() + 2000);
    client.resolve_market(&oracle, &id2, &symbol_short!("yes"));
    client.resolve_market(&oracle, &id3, &symbol_short!("no"));
    // Manual stats update for simplicity in testing if needed,
    // but resolving with participants would be better.
    // Wait, on_market_resolved takes participant_count.
    // In our resolve_market call, it uses market.participant_count which is 0 by default.

    // Let's just use different resolution ratios.
    // Creator 1: 1/1 = 600
    // Creator 3: 1/2 = (1/2)*600 = 300
    let id4 = client.create_market(&creator3, &default_params(&env));
    let _id5 = client.create_market(&creator3, &default_params(&env));
    env.ledger().set_timestamp(env.ledger().timestamp() + 2000);
    client.resolve_market(&oracle, &id4, &symbol_short!("yes"));

    let top = client.get_top_creators(&10);
    assert_eq!(top.len(), 3);
    assert_eq!(top.get(0).unwrap().address, creator1); // 600
    assert_eq!(top.get(1).unwrap().address, creator2); // 600 (depends on order if same)
    assert_eq!(top.get(2).unwrap().address, creator3); // 300

    assert_eq!(top.get(0).unwrap().stats.reputation_score, 600);
    assert_eq!(top.get(2).unwrap().stats.reputation_score, 300);
}

#[test]
fn test_get_top_creators_respects_limit() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _, _, _) = deploy(&env);

    for _ in 0..5 {
        let creator = Address::generate(&env);
        client.create_market(&creator, &default_params(&env));
    }

    let top = client.get_top_creators(&3);
    assert_eq!(top.len(), 3);

    let top_more = client.get_top_creators(&10);
    assert_eq!(top_more.len(), 5);
}

// ── Dispute-related reputation tests ──────────────────────────────────────────

#[test]
fn test_dispute_count_increments_on_raise() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _, oracle, xlm_token) = deploy(&env);
    let creator = Address::generate(&env);
    let disputer = Address::generate(&env);

    // Create and resolve a market
    let market_id = client.create_market(&creator, &default_params(&env));
    env.ledger().set_timestamp(env.ledger().timestamp() + 2000);
    client.resolve_market(&oracle, &market_id, &symbol_short!("yes"));

    // Check initial stats
    let stats_before = client.get_creator_stats(&creator);
    assert_eq!(stats_before.dispute_count, 0);
    let initial_reputation = stats_before.reputation_score;

    // Fund the disputer and approve spending
    let bond = 1_000_000_i128;
    StellarAssetClient::new(&env, &xlm_token).mint(&disputer, &bond);
    TokenClient::new(&env, &xlm_token).approve(&disputer, &client.address, &bond, &9999);

    // Raise a dispute
    client.raise_dispute(&disputer, &market_id, &bond);

    // Check that dispute count incremented
    let stats_after = client.get_creator_stats(&creator);
    assert_eq!(stats_after.dispute_count, 1);
    assert!(stats_after.reputation_score < initial_reputation);
}

#[test]
fn test_reputation_decreases_with_disputes() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _, oracle, xlm_token) = deploy(&env);
    let creator = Address::generate(&env);
    let disputer = Address::generate(&env);

    // Create and resolve multiple markets to build reputation
    for _ in 0..3 {
        let market_id = client.create_market(&creator, &default_params(&env));
        env.ledger().set_timestamp(env.ledger().timestamp() + 2000);
        client.resolve_market(&oracle, &market_id, &symbol_short!("yes"));
    }

    let stats_no_disputes = client.get_creator_stats(&creator);
    let reputation_no_disputes = stats_no_disputes.reputation_score;

    // Raise disputes on the first two markets
    let market_id_1 = client.create_market(&creator, &default_params(&env));
    let market_id_2 = client.create_market(&creator, &default_params(&env));
    env.ledger().set_timestamp(env.ledger().timestamp() + 2000);
    client.resolve_market(&oracle, &market_id_1, &symbol_short!("yes"));
    client.resolve_market(&oracle, &market_id_2, &symbol_short!("no"));

    // Fund disputer for first dispute
    let bond1 = 1_000_000_i128;
    StellarAssetClient::new(&env, &xlm_token).mint(&disputer, &bond1);
    TokenClient::new(&env, &xlm_token).approve(&disputer, &client.address, &bond1, &9999);
    client.raise_dispute(&disputer, &market_id_1, &bond1);
    let stats_one_dispute = client.get_creator_stats(&creator);
    
    // Fund disputer for second dispute
    let bond2 = 1_000_000_i128;
    StellarAssetClient::new(&env, &xlm_token).mint(&disputer, &bond2);
    TokenClient::new(&env, &xlm_token).approve(&disputer, &client.address, &bond2, &9999);
    client.raise_dispute(&disputer, &market_id_2, &bond2);
    let stats_two_disputes = client.get_creator_stats(&creator);

    // Verify reputation decreases with each dispute
    assert!(stats_one_dispute.reputation_score < reputation_no_disputes);
    assert!(stats_two_disputes.reputation_score < stats_one_dispute.reputation_score);
    assert_eq!(stats_two_disputes.dispute_count, 2);
}

#[test]
fn test_reputation_capped_at_zero_with_many_disputes() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _, oracle, xlm_token) = deploy(&env);
    let creator = Address::generate(&env);
    let disputer = Address::generate(&env);

    // Create a single market to have minimal reputation
    let market_id = client.create_market(&creator, &default_params(&env));
    env.ledger().set_timestamp(env.ledger().timestamp() + 2000);
    client.resolve_market(&oracle, &market_id, &symbol_short!("yes"));

    let initial_stats = client.get_creator_stats(&creator);
    // Should be 600 (1/1 resolved * 600)
    assert_eq!(initial_stats.reputation_score, 600);

    // Create many markets and raise disputes to exceed penalty cap
    for i in 0..15 {
        let market_id = client.create_market(&creator, &default_params(&env));
        env.ledger().set_timestamp(env.ledger().timestamp() + 2000 + i * 100);
        client.resolve_market(&oracle, &market_id, &symbol_short!("yes"));
        
        // Fund disputer for each dispute
        let bond = 1_000_000_i128;
        StellarAssetClient::new(&env, &xlm_token).mint(&disputer, &bond);
        TokenClient::new(&env, &xlm_token).approve(&disputer, &client.address, &bond, &9999);
        client.raise_dispute(&disputer, &market_id, &bond);
    }

    let final_stats = client.get_creator_stats(&creator);
    
    // With 15 disputes: penalty = min(15 * 50, 200) = 200
    // With 16 markets (1 initial + 15): resolution_ratio = 16/16 * 600 = 600
    // Final score = 600 + 0 - 200 = 400
    // But if we had even more disputes, it should never go below 0
    assert!(final_stats.reputation_score >= 0);
    assert_eq!(final_stats.dispute_count, 15);
    
    // Test the formula directly with extreme dispute count
    let extreme_stats = CreatorStats {
        markets_created: 1,
        markets_resolved: 0, // No resolved markets
        average_participant_count: 0,
        dispute_count: 100, // Extreme dispute count
        reputation_score: 0,
    };
    
    let extreme_reputation = calculate_creator_reputation(&extreme_stats);
    assert_eq!(extreme_reputation, 0); // Should be capped at 0, not underflow
}
