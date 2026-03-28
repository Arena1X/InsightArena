use soroban_sdk::{symbol_short, Address, Env, Vec};

use crate::config::{self, PERSISTENT_BUMP, PERSISTENT_THRESHOLD};
use crate::errors::InsightArenaError;
use crate::escrow;
use crate::storage_types::{
    DataKey, LeaderboardEntry, LeaderboardSnapshot, RewardPayout, Season, UserProfile,
};
use crate::ttl;

fn bump_season(env: &Env, season_id: u32) {
    ttl::extend_season_ttl(env, season_id);
}

fn bump_leaderboard(env: &Env, season_id: u32) {
    ttl::extend_season_ttl(env, season_id);
}

fn bump_season_count(env: &Env) {
    env.storage().persistent().extend_ttl(
        &DataKey::SeasonCount,
        PERSISTENT_THRESHOLD,
        PERSISTENT_BUMP,
    );
}

fn bump_user_list(env: &Env) {
    env.storage().persistent().extend_ttl(
        &DataKey::UserList,
        PERSISTENT_THRESHOLD,
        PERSISTENT_BUMP,
    );
}

fn bump_active_season(env: &Env) {
    env.storage().persistent().extend_ttl(
        &DataKey::ActiveSeason,
        PERSISTENT_THRESHOLD,
        PERSISTENT_BUMP,
    );
}

fn season_count(env: &Env) -> u32 {
    env.storage()
        .persistent()
        .get(&DataKey::SeasonCount)
        .unwrap_or(0)
}

fn store_season_count(env: &Env, count: u32) {
    env.storage()
        .persistent()
        .set(&DataKey::SeasonCount, &count);
    bump_season_count(env);
}

fn get_user_list(env: &Env) -> Vec<Address> {
    env.storage()
        .persistent()
        .get(&DataKey::UserList)
        .unwrap_or_else(|| Vec::new(env))
}

fn store_user_list(env: &Env, users: &Vec<Address>) {
    env.storage().persistent().set(&DataKey::UserList, users);
    bump_user_list(env);
}

pub(crate) fn track_user_profile(env: &Env, address: &Address) {
    let mut users = get_user_list(env);
    if users.iter().any(|user| user == *address) {
        bump_user_list(env);
        return;
    }

    users.push_back(address.clone());
    store_user_list(env, &users);
}

fn load_season(env: &Env, season_id: u32) -> Result<Season, InsightArenaError> {
    let season = env
        .storage()
        .persistent()
        .get(&DataKey::Season(season_id))
        .ok_or(InsightArenaError::SeasonNotFound)?;
    bump_season(env, season_id);
    Ok(season)
}

fn store_season(env: &Env, season: &Season) {
    env.storage()
        .persistent()
        .set(&DataKey::Season(season.season_id), season);
    bump_season(env, season.season_id);
}

fn store_leaderboard_snapshot(env: &Env, snapshot: &LeaderboardSnapshot) {
    env.storage()
        .persistent()
        .set(&DataKey::Leaderboard(snapshot.season_id), snapshot);
    bump_leaderboard(env, snapshot.season_id);
}

fn fixed_share_bps(rank: u32) -> Option<u32> {
    match rank {
        1 => Some(4_000),
        2 => Some(2_000),
        3 => Some(1_000),
        _ => None,
    }
}

fn distribute_proportional_pool(
    env: &Env,
    entries: &Vec<LeaderboardEntry>,
    pool: i128,
) -> Result<Vec<RewardPayout>, InsightArenaError> {
    let mut payouts = Vec::new(env);
    if entries.is_empty() || pool == 0 {
        return Ok(payouts);
    }

    let mut total_points: u32 = 0;
    for entry in entries.iter() {
        total_points = total_points
            .checked_add(entry.points)
            .ok_or(InsightArenaError::Overflow)?;
    }

    if total_points == 0 {
        let first = entries.get(0).ok_or(InsightArenaError::InvalidInput)?;
        payouts.push_back(RewardPayout {
            rank: first.rank,
            user: first.user,
            amount: pool,
        });
        return Ok(payouts);
    }

    let mut distributed = 0_i128;
    let last_index = entries.len().saturating_sub(1);

    let mut index = 0_u32;
    for entry in entries.iter() {
        let amount = if index == last_index {
            pool.checked_sub(distributed)
                .ok_or(InsightArenaError::Overflow)?
        } else {
            pool.checked_mul(entry.points as i128)
                .ok_or(InsightArenaError::Overflow)?
                .checked_div(total_points as i128)
                .ok_or(InsightArenaError::Overflow)?
        };

        distributed = distributed
            .checked_add(amount)
            .ok_or(InsightArenaError::Overflow)?;

        payouts.push_back(RewardPayout {
            rank: entry.rank,
            user: entry.user,
            amount,
        });
        index = index.checked_add(1).ok_or(InsightArenaError::Overflow)?;
    }

    Ok(payouts)
}

fn merge_reward_payouts(
    env: &Env,
    payouts: Vec<RewardPayout>,
) -> Result<Vec<RewardPayout>, InsightArenaError> {
    let mut merged = Vec::new(env);

    for payout in payouts.iter() {
        let mut found = false;

        let mut idx = 0_u32;
        while idx < merged.len() {
            let mut existing: RewardPayout =
                merged.get(idx).ok_or(InsightArenaError::InvalidInput)?;
            if existing.user == payout.user {
                existing.amount = existing
                    .amount
                    .checked_add(payout.amount)
                    .ok_or(InsightArenaError::Overflow)?;
                merged.set(idx, existing);
                found = true;
                break;
            }
            idx = idx.checked_add(1).ok_or(InsightArenaError::Overflow)?;
        }

        if !found {
            merged.push_back(payout);
        }
    }

    Ok(merged)
}

fn compute_reward_payouts(
    env: &Env,
    snapshot: &LeaderboardSnapshot,
    reward_pool: i128,
) -> Result<Vec<RewardPayout>, InsightArenaError> {
    if snapshot.entries.is_empty() {
        return Err(InsightArenaError::InvalidInput);
    }

    let mut raw_payouts = Vec::new(env);
    let mut fixed_allocated = 0_i128;
    let mut variable_entries = Vec::new(env);
    let mut podium_entries = Vec::new(env);

    for entry in snapshot.entries.iter() {
        if entry.rank > 10 {
            break;
        }

        if let Some(share_bps) = fixed_share_bps(entry.rank) {
            let amount = reward_pool
                .checked_mul(share_bps as i128)
                .ok_or(InsightArenaError::Overflow)?
                .checked_div(10_000)
                .ok_or(InsightArenaError::Overflow)?;

            fixed_allocated = fixed_allocated
                .checked_add(amount)
                .ok_or(InsightArenaError::Overflow)?;

            raw_payouts.push_back(RewardPayout {
                rank: entry.rank,
                user: entry.user.clone(),
                amount,
            });
            podium_entries.push_back(entry.clone());
        } else {
            variable_entries.push_back(entry.clone());
        }
    }

    let remaining_pool = reward_pool
        .checked_sub(fixed_allocated)
        .ok_or(InsightArenaError::Overflow)?;

    let proportional_entries = if variable_entries.is_empty() {
        podium_entries
    } else {
        variable_entries
    };

    let proportional = distribute_proportional_pool(env, &proportional_entries, remaining_pool)?;
    for payout in proportional.iter() {
        raw_payouts.push_back(payout);
    }

    merge_reward_payouts(env, raw_payouts)
}

fn emit_season_created(
    env: &Env,
    season_id: u32,
    start_time: u64,
    end_time: u64,
    reward_pool: i128,
) {
    env.events().publish(
        (symbol_short!("season"), symbol_short!("created")),
        (season_id, start_time, end_time, reward_pool),
    );
}

fn emit_leaderboard_updated(env: &Env, season_id: u32, updated_at: u64) {
    env.events().publish(
        (symbol_short!("lead"), symbol_short!("updtd")),
        (season_id, updated_at),
    );
}

fn emit_season_finalized(
    env: &Env,
    season_id: u32,
    top_winner: &Address,
    payouts: &Vec<RewardPayout>,
) {
    env.events().publish(
        (symbol_short!("season"), symbol_short!("finalzd")),
        (season_id, top_winner.clone(), payouts.clone()),
    );
}

pub fn create_season(
    env: &Env,
    admin: Address,
    start_time: u64,
    end_time: u64,
    reward_pool: i128,
) -> Result<u32, InsightArenaError> {
    let cfg = config::get_config(env)?;
    cfg.admin.require_auth();
    if admin != cfg.admin {
        return Err(InsightArenaError::Unauthorized);
    }

    if end_time <= start_time {
        return Err(InsightArenaError::InvalidTimeRange);
    }

    let season_id = season_count(env)
        .checked_add(1)
        .ok_or(InsightArenaError::Overflow)?;

    escrow::lock_stake(env, &admin, reward_pool)?;

    let now = env.ledger().timestamp();
    let mut season = Season::new(season_id, start_time, end_time, reward_pool);
    season.is_active = start_time <= now && now < end_time;
    store_season(env, &season);
    store_season_count(env, season_id);

    store_leaderboard_snapshot(
        env,
        &LeaderboardSnapshot {
            season_id,
            updated_at: now,
            entries: Vec::new(env),
        },
    );

    emit_season_created(env, season_id, start_time, end_time, reward_pool);
    Ok(season_id)
}

pub fn get_season(env: &Env, season_id: u32) -> Result<Season, InsightArenaError> {
    load_season(env, season_id)
}

pub fn get_active_season(env: &Env) -> Option<Season> {
    let now = env.ledger().timestamp();
    let mut season_id = 1_u32;
    let total = season_count(env);

    while season_id <= total {
        if let Some(mut season) = env
            .storage()
            .persistent()
            .get::<DataKey, Season>(&DataKey::Season(season_id))
        {
            let is_active =
                !season.is_finalized && season.start_time <= now && now < season.end_time;
            if season.is_active != is_active {
                season.is_active = is_active;
                store_season(env, &season);
            } else {
                bump_season(env, season_id);
            }

            if is_active {
                return Some(season);
            }
        }
        season_id = season_id.saturating_add(1);
    }

    None
}

pub fn update_leaderboard(
    env: &Env,
    admin: Address,
    season_id: u32,
    entries: Vec<LeaderboardEntry>,
) -> Result<(), InsightArenaError> {
    let cfg = config::get_config(env)?;
    cfg.admin.require_auth();
    if admin != cfg.admin {
        return Err(InsightArenaError::Unauthorized);
    }

    let season = load_season(env, season_id)?;
    if season.is_finalized {
        return Err(InsightArenaError::SeasonAlreadyFinalized);
    }

    if entries.len() > 100 {
        return Err(InsightArenaError::InvalidInput);
    }

    let mut expected_rank = 1_u32;
    for entry in entries.iter() {
        if entry.rank != expected_rank {
            return Err(InsightArenaError::InvalidInput);
        }
        expected_rank = expected_rank
            .checked_add(1)
            .ok_or(InsightArenaError::Overflow)?;
    }

    let updated_at = env.ledger().timestamp();
    store_leaderboard_snapshot(
        env,
        &LeaderboardSnapshot {
            season_id,
            updated_at,
            entries,
        },
    );

    emit_leaderboard_updated(env, season_id, updated_at);
    Ok(())
}

pub fn get_leaderboard(
    env: &Env,
    season_id: u32,
) -> Result<LeaderboardSnapshot, InsightArenaError> {
    load_season(env, season_id)?;

    let snapshot = env
        .storage()
        .persistent()
        .get(&DataKey::Leaderboard(season_id))
        .ok_or(InsightArenaError::SeasonNotFound)?;
    bump_leaderboard(env, season_id);
    Ok(snapshot)
}

pub fn finalize_season(env: &Env, admin: Address, season_id: u32) -> Result<(), InsightArenaError> {
    let cfg = config::get_config(env)?;
    cfg.admin.require_auth();
    if admin != cfg.admin {
        return Err(InsightArenaError::Unauthorized);
    }

    let mut season = load_season(env, season_id)?;
    if season.is_finalized {
        return Err(InsightArenaError::SeasonAlreadyFinalized);
    }
    if env.ledger().timestamp() < season.end_time {
        return Err(InsightArenaError::SeasonNotActive);
    }

    let snapshot = get_leaderboard(env, season_id)?;
    let payouts = compute_reward_payouts(env, &snapshot, season.reward_pool)?;

    let mut total_distributed = 0_i128;
    for payout in payouts.iter() {
        if payout.amount > 0 {
            escrow::release_payout(env, &payout.user, payout.amount)?;
        }
        total_distributed = total_distributed
            .checked_add(payout.amount)
            .ok_or(InsightArenaError::Overflow)?;
    }

    if total_distributed != season.reward_pool {
        return Err(InsightArenaError::Overflow);
    }

    let winner = snapshot
        .entries
        .get(0)
        .ok_or(InsightArenaError::InvalidInput)?
        .user;

    season.is_finalized = true;
    season.is_active = false;
    season.top_winner = Some(winner.clone());
    store_season(env, &season);

    emit_season_finalized(env, season_id, &winner, &payouts);
    Ok(())
}

pub fn reset_season_points(
    env: &Env,
    admin: Address,
    new_season_id: u32,
) -> Result<u32, InsightArenaError> {
    let cfg = config::get_config(env)?;
    cfg.admin.require_auth();
    if admin != cfg.admin {
        return Err(InsightArenaError::Unauthorized);
    }

    let mut new_season = load_season(env, new_season_id)?;
    if new_season.is_finalized {
        return Err(InsightArenaError::SeasonAlreadyFinalized);
    }

    let total = season_count(env);
    let mut season_id = 1_u32;
    while season_id <= total {
        if let Some(mut season) = env
            .storage()
            .persistent()
            .get::<DataKey, Season>(&DataKey::Season(season_id))
        {
            let should_be_active = season_id == new_season_id;
            if season.is_active != should_be_active {
                season.is_active = should_be_active;
                store_season(env, &season);
            } else {
                bump_season(env, season_id);
            }
        }
        season_id = season_id.saturating_add(1);
    }

    new_season.is_active = true;
    store_season(env, &new_season);

    env.storage()
        .persistent()
        .set(&DataKey::ActiveSeason, &new_season_id);
    bump_active_season(env);

    let users = get_user_list(env);
    let mut reset_count = 0_u32;
    for address in users.iter() {
        let user_key = DataKey::User(address.clone());
        if let Some(mut profile) = env
            .storage()
            .persistent()
            .get::<DataKey, UserProfile>(&user_key)
        {
            profile.season_points = 0;
            env.storage().persistent().set(&user_key, &profile);
            reset_count = reset_count
                .checked_add(1)
                .ok_or(InsightArenaError::Overflow)?;
        }
    }

    Ok(reset_count)
}
