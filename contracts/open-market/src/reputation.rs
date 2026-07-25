use soroban_sdk::{symbol_short, Address, Env, Vec};

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

/// Return `creator`'s current reputation score without mutating any storage.
/// Reuses `load_stats` + `calculate_creator_reputation`; safe to call from
/// gating logic (e.g. `market::create_market`) ahead of any writes.
pub fn get_reputation_score(env: &Env, creator: &Address) -> u32 {
    calculate_creator_reputation(&load_stats(env, creator))
}

// ── Trusted-creator allowlist (reputation-gate exemption) ────────────────────
//
// Keyed by a raw `(Symbol, Address)` tuple rather than a `DataKey` variant:
// `DataKey` is a `#[contracttype]` union already carrying ~40 variants, and
// the generated contract spec has a size limit the SDK enforces at compile
// time (`LengthExceedsMax`) — one more variant there was enough to trip it.

fn trusted_creator_key(creator: &Address) -> (soroban_sdk::Symbol, Address) {
    (symbol_short!("trustd"), creator.clone())
}

/// `true` if `creator` is exempt from the minimum-reputation gate on market
/// creation, regardless of their current `reputation_score`.
pub fn is_trusted_creator(env: &Env, creator: &Address) -> bool {
    env.storage()
        .persistent()
        .get(&trusted_creator_key(creator))
        .unwrap_or(false)
}

fn set_trusted(env: &Env, creator: &Address, trusted: bool) {
    let key = trusted_creator_key(creator);
    if trusted {
        env.storage().persistent().set(&key, &true);
        env.storage()
            .persistent()
            .extend_ttl(&key, PERSISTENT_THRESHOLD, PERSISTENT_BUMP);
    } else {
        env.storage().persistent().remove(&key);
    }
}

fn emit_trusted_creator_updated(env: &Env, creator: &Address, trusted: bool) {
    env.events().publish(
        (symbol_short!("rep"), symbol_short!("trusted")),
        (creator.clone(), trusted),
    );
}

/// Add `creator` to the trusted-creator allowlist. Caller must be the stored
/// admin. For the timelocked governance path see
/// [`add_trusted_creator_from_governance`], invoked via
/// `ProposalType::AddTrustedCreator`.
pub fn add_trusted_creator(
    env: &Env,
    admin: Address,
    creator: Address,
) -> Result<(), InsightArenaError> {
    admin.require_auth();
    let cfg = crate::config::get_config(env)?;
    if admin != cfg.admin {
        return Err(InsightArenaError::Unauthorized);
    }

    set_trusted(env, &creator, true);
    emit_trusted_creator_updated(env, &creator, true);
    Ok(())
}

/// Remove `creator` from the trusted-creator allowlist. Caller must be the
/// stored admin. For the timelocked governance path see
/// [`remove_trusted_creator_from_governance`], invoked via
/// `ProposalType::RemoveTrustedCreator`.
pub fn remove_trusted_creator(
    env: &Env,
    admin: Address,
    creator: Address,
) -> Result<(), InsightArenaError> {
    admin.require_auth();
    let cfg = crate::config::get_config(env)?;
    if admin != cfg.admin {
        return Err(InsightArenaError::Unauthorized);
    }

    set_trusted(env, &creator, false);
    emit_trusted_creator_updated(env, &creator, false);
    Ok(())
}

/// Governance path for adding a trusted creator. Called only from
/// `governance::execute_proposal` after a `ProposalType::AddTrustedCreator`
/// proposal has cleared quorum, majority, and the timelock window.
pub fn add_trusted_creator_from_governance(
    env: &Env,
    creator: Address,
) -> Result<(), InsightArenaError> {
    set_trusted(env, &creator, true);
    emit_trusted_creator_updated(env, &creator, true);
    Ok(())
}

/// Governance path for removing a trusted creator. Called only from
/// `governance::execute_proposal` after a `ProposalType::RemoveTrustedCreator`
/// proposal has cleared quorum, majority, and the timelock window.
pub fn remove_trusted_creator_from_governance(
    env: &Env,
    creator: Address,
) -> Result<(), InsightArenaError> {
    set_trusted(env, &creator, false);
    emit_trusted_creator_updated(env, &creator, false);
    Ok(())
}

// ── Reputation gate ───────────────────────────────────────────────────────────

/// `true` if `creator` may create a market: either their current reputation
/// score meets or exceeds `min_reputation`, or they are on the trusted-creator
/// allowlist. Does not mutate any storage.
pub fn meets_creation_threshold(env: &Env, creator: &Address, min_reputation: u32) -> bool {
    is_trusted_creator(env, creator) || get_reputation_score(env, creator) >= min_reputation
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
