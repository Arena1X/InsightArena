use soroban_sdk::{Address, Env};

use crate::config::{PERSISTENT_BUMP, PERSISTENT_THRESHOLD};
use crate::errors::InsightArenaError;
use crate::storage_types::{CreatorStats, DataKey};

// ── Storage helpers ───────────────────────────────────────────────────────────

fn load_stats(env: &Env, creator: &Address) -> CreatorStats {
    env.storage()
        .persistent()
        .get(&DataKey::CreatorStats(creator.clone()))
        .unwrap_or(CreatorStats {
            markets_created: 0,
            markets_resolved: 0,
            average_participant_count: 0,
            dispute_count: 0,
            reputation_score: 0,
        })
}

fn save_stats(env: &Env, creator: &Address, stats: &CreatorStats) {
    let key = DataKey::CreatorStats(creator.clone());
    env.storage().persistent().set(&key, stats);
    env.storage()
        .persistent()
        .extend_ttl(&key, PERSISTENT_THRESHOLD, PERSISTENT_BUMP);
}

// ── Pure reputation formula ───────────────────────────────────────────────────

/// Compute reputation score from `CreatorStats`. No storage access.
///
/// Formula (integer arithmetic, overflow-safe):
///   score  = (markets_resolved / max(markets_created, 1)) * 600
///           + min(average_participant_count * 2, 200)
///           - min(dispute_count * 50, 200)
///   score  = clamp(score, 0, 1000)
pub fn calculate_creator_reputation(stats: &CreatorStats) -> u32 {
    let denominator = stats.markets_created.max(1) as u64;
    let resolution_ratio_600 = ((stats.markets_resolved as u64 * 600) / denominator) as u32;

    let participation_bonus = (stats.average_participant_count.saturating_mul(2)).min(200);

    let dispute_penalty = (stats.dispute_count.saturating_mul(50)).min(200);

    let score = resolution_ratio_600
        .saturating_add(participation_bonus)
        .saturating_sub(dispute_penalty);

    score.min(1000)
}

// ── Mutation hooks ────────────────────────────────────────────────────────────

/// Called after a market is successfully created.
pub fn on_market_created(env: &Env, creator: &Address) {
    let mut stats = load_stats(env, creator);
    stats.markets_created = stats.markets_created.saturating_add(1);
    stats.reputation_score = calculate_creator_reputation(&stats);
    save_stats(env, creator, &stats);
}

/// Called after a market is successfully resolved.
/// `participant_count` is the final participant count of the resolved market.
pub fn on_market_resolved(env: &Env, creator: &Address, participant_count: u32) {
    let mut stats = load_stats(env, creator);

    // Rolling average: new_avg = (old_avg * resolved + participant_count) / (resolved + 1)
    let new_resolved = stats.markets_resolved.saturating_add(1);
    let new_avg = ((stats.average_participant_count as u64)
        .saturating_mul(stats.markets_resolved as u64)
        .saturating_add(participant_count as u64))
        / (new_resolved as u64);

    stats.markets_resolved = new_resolved;
    stats.average_participant_count = new_avg as u32;
    stats.reputation_score = calculate_creator_reputation(&stats);
    save_stats(env, creator, &stats);
}

// ── View ──────────────────────────────────────────────────────────────────────

pub fn get_creator_stats(env: Env, creator: Address) -> Result<CreatorStats, InsightArenaError> {
    Ok(load_stats(&env, &creator))
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod reputation_tests {
    use soroban_sdk::testutils::{Address as _, Ledger as _};
    use soroban_sdk::{symbol_short, vec, Address, Env, String, Symbol};

    use crate::market::CreateMarketParams;
    use crate::storage_types::CreatorStats;
    use crate::{InsightArenaContract, InsightArenaContractClient};

    use super::calculate_creator_reputation;

    fn register_token(env: &Env) -> Address {
        let token_admin = Address::generate(env);
        env.register_stellar_asset_contract_v2(token_admin)
            .address()
    }

    fn deploy(env: &Env) -> (InsightArenaContractClient<'_>, Address, Address) {
        let id = env.register(InsightArenaContract, ());
        let client = InsightArenaContractClient::new(env, &id);
        let admin = Address::generate(env);
        let oracle = Address::generate(env);
        let xlm_token = register_token(env);
        env.mock_all_auths();
        client.initialize(&admin, &oracle, &200_u32, &xlm_token);
        (client, admin, oracle)
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
        let (client, _, _) = deploy(&env);
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
        let (client, _, _) = deploy(&env);
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
        let (client, _, oracle) = deploy(&env);
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
        let (client, _, oracle) = deploy(&env);
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
        let (client, _, oracle) = deploy(&env);
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
        let (client, _, oracle) = deploy(&env);
        let creator = Address::generate(&env);

        for _ in 0..3 {
            let id = client.create_market(&creator, &default_params(&env));
            env.ledger().set_timestamp(env.ledger().timestamp() + 2000);
            client.resolve_market(&oracle, &id, &symbol_short!("yes"));
        }

        let stats = client.get_creator_stats(&creator);
        assert!(stats.reputation_score <= 1000);
    }
}
