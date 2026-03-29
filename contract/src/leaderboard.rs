use soroban_sdk::{Address, Env, Vec};
use crate::storage_types::{DataKey, LeaderboardSnapshot, Season, UserProfile};
use crate::errors::InsightArenaError;

/// `stake_bonus = floor(stake_xlm / 10)` → `floor(stake_stroops / 10^8 stroops)`.
const STROOPS_PER_STAKE_POINT: i128 = 100_000_000;

// --- Storage & Data Access ---

/// Fetch a leaderboard snapshot for a specific season.
pub fn get_leaderboard(env: &Env, season_id: u32) -> Result<LeaderboardSnapshot, InsightArenaError> {
    let key = DataKey::Leaderboard(season_id);
    env.storage()
        .persistent()
        .get(&key)
        .ok_or(InsightArenaError::SeasonNotFound)
}

/// Store a leaderboard snapshot.
pub fn store_snapshot(env: &Env, snapshot: &LeaderboardSnapshot) {
    let key = DataKey::Leaderboard(snapshot.season_id);
    env.storage().persistent().set(&key, snapshot);
}

// --- Points & Logic ---

/// Pure function: no storage reads.
///
/// `season_points_earned = (base_points + stake_bonus) * (correct / total) * 2`
/// with integer math: `(base_points + stake_bonus) * correct * 2 / total`.
pub fn calculate_points(stake_amount: i128, correct: u32, total: u32) -> u32 {
    if total == 0 {
        return 0;
    }
    let correct = correct.min(total) as i128;
    let total = total as i128;
    let stake = stake_amount.max(0_i128);
    let stake_bonus = stake / STROOPS_PER_STAKE_POINT;
    let sum = 100_i128.saturating_add(stake_bonus);
    let numer = sum.saturating_mul(correct).saturating_mul(2_i128);
    let res = numer / total;
    
    if res < 0 {
        return 0;
    }
    if res > u32::MAX as i128 {
        u32::MAX
    } else {
        res as u32
    }
}

/// Returns season points for `user` in `season_id`.
/// - Finalized seasons: points from the leaderboard snapshot.
/// - Active season: live [`UserProfile::season_points`].
/// - Unknown users: `0`. Never panics.
pub fn get_user_season_points(env: &Env, user: Address, season_id: u32) -> u32 {
    let Some(season) = env
        .storage()
        .persistent()
        .get::<DataKey, Season>(&DataKey::Season(season_id))
    else {
        return 0;
    };

    if season.is_finalized {
        if let Ok(snapshot) = get_leaderboard(env, season_id) {
            for e in snapshot.entries.iter() {
                if e.user == user {
                    return e.points;
                }
            }
        }
        return 0;
    }

    let is_live_season = env
        .storage()
        .persistent()
        .get::<DataKey, u32>(&DataKey::ActiveSeason)
        .map(|id| id == season_id)
        .unwrap_or_else(|| {
            crate::season::get_active_season(env)
                .map(|s| s.season_id == season_id)
                .unwrap_or(false)
        });

    if is_live_season {
        return env
            .storage()
            .persistent()
            .get::<DataKey, UserProfile>(&DataKey::User(user))
            .map(|p| p.season_points)
            .unwrap_or(0);
    }

    // Fallback check for snapshot if not currently live
    if let Ok(snapshot) = get_leaderboard(env, season_id) {
        for e in snapshot.entries.iter() {
            if e.user == user {
                return e.points;
            }
        }
    }

    0
}

#[cfg(test)]
mod leaderboard_tests {
    use super::calculate_points;

    #[test]
    fn first_prediction_perfect_accuracy() {
        assert_eq!(calculate_points(20_000_000, 1, 1), 200);
    }

    #[test]
    fn perfect_accuracy_multiple_predictions() {
        assert_eq!(calculate_points(50_000_000, 3, 3), 200);
    }

    #[test]
    fn zero_stake_still_gets_base_and_accuracy() {
        assert_eq!(calculate_points(0, 2, 4), 100);
    }

    #[test]
    fn stake_bonus_one_per_ten_xlm() {
        assert_eq!(calculate_points(1_000_000_000, 1, 1), (100 + 10) * 2);
    }

    #[test]
    fn partial_accuracy_rounds_down() {
        assert_eq!(calculate_points(10_000_000, 1, 3), 66);
    }

    #[test]
    fn total_zero_returns_zero() {
        assert_eq!(calculate_points(10_000_000, 1, 0), 0);
    }

    #[test]
    fn clamps_correct_above_total() {
        assert_eq!(calculate_points(0, 5, 3), calculate_points(0, 3, 3));
    }

    #[test]
    fn get_user_season_points_unknown_season_and_user_returns_zero() {
        use soroban_sdk::testutils::Address as _;
        use soroban_sdk::{Address, Env};
        use crate::InsightArenaContract;

        let env = Env::default();
        let contract_id = env.register(InsightArenaContract, ());
        let user = Address::generate(&env);
        let points = env.as_contract(&contract_id, || {
            super::get_user_season_points(&env, user, 999)
        });
        assert_eq!(points, 0);
    }
}