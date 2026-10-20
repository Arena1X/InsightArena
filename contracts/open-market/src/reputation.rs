use soroban_sdk::{symbol_short, Address, Env, Vec};

use crate::config::{ReputationDecayMode, PERSISTENT_BUMP, PERSISTENT_THRESHOLD};
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
            last_updated: env.ledger().timestamp(),
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

// ── Time-decay ─────────────────────────────────────────────────────────────

/// Apply time-decay to `score` based on ledgers elapsed since the record's
/// `last_updated` and the governance-configured half-life/mode. Pure
/// function — no storage access. Never returns a value above `score` or
/// below 0.
pub fn apply_reputation_decay(
    score: u32,
    elapsed_seconds: u64,
    half_life_seconds: u32,
    mode: ReputationDecayMode,
) -> u32 {
    if score == 0 || elapsed_seconds == 0 || half_life_seconds == 0 {
        return score;
    }
    let half_life_seconds = half_life_seconds as u64;
    let decayed = match mode {
        ReputationDecayMode::Linear => {
            let full_life = half_life_seconds.saturating_mul(2);
            if full_life == 0 || elapsed_seconds >= full_life {
                0
            } else {
                let remaining = full_life.saturating_sub(elapsed_seconds);
                (score as u64)
                    .checked_mul(remaining)
                    .and_then(|v| v.checked_div(full_life))
                    .unwrap_or(0) as u32
            }
        }
        ReputationDecayMode::Exponential => {
            let halvings = (elapsed_seconds / half_life_seconds).min(31) as u32;
            let remainder = elapsed_seconds % half_life_seconds;
            let mut decayed = score >> halvings;
            if remainder > 0 && decayed > 0 {
                let next = decayed >> 1;
                let diff = decayed.saturating_sub(next);
                let interpolated = (diff as u64)
                    .checked_mul(remainder)
                    .and_then(|v| v.checked_div(half_life_seconds))
                    .unwrap_or(0) as u32;
                decayed = decayed.saturating_sub(interpolated);
            }
            decayed
        }
    };
    decayed.min(score)
}

/// Apply season-inactivity decay to `score`: for each fully-elapsed inactive
/// season beyond `grace_seasons`, multiply the score by
/// `(10_000 - decay_bps) / 10_000`, compounding. Pure function — no storage
/// access. Never returns a value above `score`; floors at 0 (never negative,
/// since `u32`).
///
/// `inactive_seasons` is the number of seasons that have become active since
/// the creator was last active (i.e. `current_active_season_id -
/// last_active_season_id`, saturating at 0 for creators active in the
/// current season).
pub fn apply_season_inactivity_decay(
    score: u32,
    inactive_seasons: u32,
    grace_seasons: u32,
    decay_bps: u32,
) -> u32 {
    if score == 0 || decay_bps == 0 || inactive_seasons <= grace_seasons {
        return score;
    }
    let decaying_seasons = inactive_seasons - grace_seasons;
    let retain_bps = 10_000_u64.saturating_sub(decay_bps as u64);

    let mut decayed = score as u64;
    for _ in 0..decaying_seasons {
        decayed = decayed.saturating_mul(retain_bps) / 10_000;
        if decayed == 0 {
            break;
        }
    }

    (decayed as u32).min(score)
}

/// Recompute the live (undecayed) formula score, then apply time-based decay
/// against `last_updated` followed by season-inactivity decay against
/// `last_active_season_id`, using the current governance config. Falls back
/// to the raw score, undecayed, if the contract hasn't been initialized yet.
fn decayed_score(env: &Env, creator: &Address, stats: &CreatorStats) -> u32 {
    let raw_score = calculate_creator_reputation(stats);
    let cfg = match crate::config::get_config_readonly(env) {
        Ok(c) => c,
        Err(_) => return raw_score,
    };
    let elapsed = env.ledger().timestamp().saturating_sub(stats.last_updated);
    let time_decayed = apply_reputation_decay(
        raw_score,
        elapsed,
        cfg.reputation_half_life_seconds,
        cfg.reputation_decay_mode,
    );

    let inactive_seasons = inactive_season_count(env, creator);
    apply_season_inactivity_decay(
        time_decayed,
        inactive_seasons,
        cfg.reputation_season_decay_grace,
        cfg.reputation_season_decay_bps,
    )
}

// ── Season-activity tracking ─────────────────────────────────────────────────
//
// Keyed by a raw `(Symbol, Address)` tuple rather than a `DataKey` variant —
// see `trusted_creator_key` below for why. Lazily applied at read time only;
// never mutates stored counters, so no unbounded loop over seasons is needed.

fn last_active_season_key(creator: &Address) -> (soroban_sdk::Symbol, Address) {
    (symbol_short!("lastseas"), creator.clone())
}

/// Record `creator` as active in the currently active season (if any). Called
/// from every mutation hook below.
fn touch_active_season(env: &Env, creator: &Address) {
    if let Some(season) = crate::season::get_active_season(env) {
        let key = last_active_season_key(creator);
        env.storage().persistent().set(&key, &season.season_id);
        env.storage()
            .persistent()
            .extend_ttl(&key, PERSISTENT_THRESHOLD, PERSISTENT_BUMP);
    }
}

/// Number of seasons that have become active since `creator` was last active,
/// i.e. `current_active_season_id - last_active_season_id`. `0` if there is
/// no active season, or the creator has never been recorded as active (a
/// creator who has never created/resolved/disputed a market has no decay
/// baseline to decay from).
fn inactive_season_count(env: &Env, creator: &Address) -> u32 {
    let current = match crate::season::get_active_season(env) {
        Some(s) => s.season_id,
        None => return 0,
    };
    let last_active: Option<u32> = env.storage().persistent().get(&last_active_season_key(creator));
    match last_active {
        Some(last) => current.saturating_sub(last),
        None => 0,
    }
}

// ── Mutation hooks ────────────────────────────────────────────────────────────

/// Called after a market is successfully created.
pub fn on_market_created(env: &Env, creator: &Address) {
    let mut stats = load_stats(env, creator);
    stats.markets_created = stats.markets_created.saturating_add(1);
    stats.reputation_score = calculate_creator_reputation(&stats);
    stats.last_updated = env.ledger().timestamp();
    save_stats(env, creator, &stats);
    touch_active_season(env, creator);
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
    stats.last_updated = env.ledger().timestamp();
    save_stats(env, creator, &stats);
    touch_active_season(env, creator);
}

/// Called when a dispute is raised against a market created by this creator.
/// Increments dispute_count and recalculates reputation score.
pub fn on_dispute_raised(env: &Env, creator: &Address) {
    let mut stats = load_stats(env, creator);
    stats.dispute_count = stats.dispute_count.saturating_add(1);
    stats.reputation_score = calculate_creator_reputation(&stats);
    stats.last_updated = env.ledger().timestamp();
    save_stats(env, creator, &stats);
    touch_active_season(env, creator);
}

/// Called when a dispute is resolved in favor of the disputer (upheld).
/// The market creator suffers an additional reputation penalty for having
/// their market resolution overturned.
pub fn on_dispute_upheld(env: &Env, creator: &Address) {
    let mut stats = load_stats(env, creator);
    // Additional penalty: increment dispute count again (double penalty)
    stats.dispute_count = stats.dispute_count.saturating_add(1);
    stats.reputation_score = calculate_creator_reputation(&stats);
    stats.last_updated = env.ledger().timestamp();
    save_stats(env, creator, &stats);
    touch_active_season(env, creator);
}

/// Called when a dispute is resolved in favor of the market creator (rejected).
/// The disputer who filed a frivolous dispute gets a reputation penalty.
pub fn on_dispute_rejected(env: &Env, disputer: &Address) {
    let mut stats = load_stats(env, disputer);
    // Penalty for filing a rejected dispute
    stats.dispute_count = stats.dispute_count.saturating_add(1);
    stats.reputation_score = calculate_creator_reputation(&stats);
    stats.last_updated = env.ledger().timestamp();
    save_stats(env, disputer, &stats);
    touch_active_season(env, disputer);
}

// ── View ──────────────────────────────────────────────────────────────────────

pub fn get_creator_stats(env: Env, creator: Address) -> Result<CreatorStats, InsightArenaError> {
    let mut stats = load_stats(&env, &creator);
    stats.reputation_score = decayed_score(&env, &creator, &stats);
    Ok(stats)
}

/// Return `creator`'s current reputation score without mutating any storage.
/// Reuses `load_stats` + `calculate_creator_reputation`; safe to call from
/// gating logic (e.g. `market::create_market`) ahead of any writes.
pub fn get_reputation_score(env: &Env, creator: &Address) -> u32 {
    decayed_score(env, creator, &load_stats(env, creator))
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
    crate::config::ensure_not_paused(env)?;
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
    crate::config::ensure_not_paused(env)?;
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
        if let Some(mut stats) = env
            .storage()
            .persistent()
            .get::<DataKey, CreatorStats>(&DataKey::CreatorStats(user.clone()))
        {
            if stats.markets_created > 0 {
                stats.reputation_score = decayed_score(env, &user, &stats);
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
    crate::config::ensure_not_paused(env)?;
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
    stats.last_updated = env.ledger().timestamp();

    save_stats(env, &creator, &stats);
    Ok(())
}

// ── Tests ─────────────────────────────────────────────────────────────────────

// Tests have been moved to tests/reputation_tests.rs
