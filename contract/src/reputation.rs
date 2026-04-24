use soroban_sdk::{Address, Env, Vec};

use crate::config::{PERSISTENT_BUMP, PERSISTENT_THRESHOLD};
use crate::errors::InsightArenaError;
use crate::storage_types::{CreatorLeaderboardEntry, CreatorStats, DataKey};

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

/// Called when a dispute is raised against a market created by this creator.
/// Increments dispute_count and recalculates reputation score.
pub fn on_dispute_raised(env: &Env, creator: &Address) {
    let mut stats = load_stats(env, creator);
    stats.dispute_count = stats.dispute_count.saturating_add(1);
    stats.reputation_score = calculate_creator_reputation(&stats);
    save_stats(env, creator, &stats);
}

// ── View ──────────────────────────────────────────────────────────────────────

pub fn get_creator_stats(env: Env, creator: Address) -> Result<CreatorStats, InsightArenaError> {
    Ok(load_stats(&env, &creator))
}

pub fn get_top_creators(env: &Env, limit: u32) -> Vec<CreatorLeaderboardEntry> {
    let mut limit = limit;
    if limit > 50 {
        limit = 50;
    }

    let users: Vec<Address> = env
        .storage()
        .persistent()
        .get(&DataKey::UserList)
        .unwrap_or_else(|| Vec::new(env));

    let mut creators = Vec::new(env);

    for user in users.iter() {
        if let Some(stats) = env
            .storage()
            .persistent()
            .get::<DataKey, CreatorStats>(&DataKey::CreatorStats(user.clone()))
        {
            if stats.markets_created > 0 {
                creators.push_back(CreatorLeaderboardEntry {
                    address: user,
                    stats,
                });
            }
        }
    }

    // Sort by reputation_score descending
    let n = creators.len();
    for i in 1..n {
        let mut j = i;
        while j > 0 {
            let a = creators.get(j).unwrap().stats.reputation_score;
            let b = creators.get(j - 1).unwrap().stats.reputation_score;
            if a > b {
                let temp_a = creators.get(j).unwrap();
                let temp_b = creators.get(j - 1).unwrap();
                creators.set(j, temp_b);
                creators.set(j - 1, temp_a);
                j -= 1;
            } else {
                break;
            }
        }
    }

    // Truncate to limit
    if creators.len() > limit {
        let mut truncated = Vec::new(env);
        for i in 0..limit {
            truncated.push_back(creators.get(i).unwrap());
        }
        creators = truncated;
    }

    creators
}

pub fn reset_creator_stats(
    env: &Env,
    admin: Address,
    creator: Address,
) -> Result<(), InsightArenaError> {
    admin.require_auth();
    let cfg = crate::config::get_config(env)?;
    if admin != cfg.admin {
        return Err(InsightArenaError::Unauthorized);
    }

    let mut stats = load_stats(env, &creator);
    stats.markets_created = 0;
    stats.markets_resolved = 0;
    stats.average_participant_count = 0;
    stats.dispute_count = 0;
    stats.reputation_score = 0;

    save_stats(env, &creator, &stats);
    Ok(())
}

// ── Tests ─────────────────────────────────────────────────────────────────────

// Tests have been moved to tests/reputation_tests.rs
