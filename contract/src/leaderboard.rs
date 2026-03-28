use soroban_sdk::{Address, Env};

use crate::storage_types::{DataKey, LeaderboardSnapshot, Season, UserProfile};

/// `stake_bonus = floor(stake_xlm / 10)` → `floor(stake_stroops / 10^8 stroops)`.
const STROOPS_PER_STAKE_POINT: i128 = 100_000_000;

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
/// - Active season (matches [`crate::season::get_active_season`] or [`DataKey::ActiveSeason`]):
///   live [`UserProfile::season_points`].
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
        if let Some(snapshot) = env
            .storage()
            .persistent()
            .get::<DataKey, LeaderboardSnapshot>(&DataKey::Leaderboard(season_id))
        {
            let mut i = 0_u32;
            while i < snapshot.entries.len() {
                let e = snapshot.entries.get(i).unwrap();
                if e.user == user {
                    return e.points;
                }
                i = i.saturating_add(1);
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

    if let Some(snapshot) = env
        .storage()
        .persistent()
        .get::<DataKey, LeaderboardSnapshot>(&DataKey::Leaderboard(season_id))
    {
        let mut i = 0_u32;
        while i < snapshot.entries.len() {
            let e = snapshot.entries.get(i).unwrap();
            if e.user == user {
                return e.points;
            }
            i = i.saturating_add(1);
        }
    }

    0
}

#[cfg(test)]
mod leaderboard_tests {
    use super::calculate_points;

    #[test]
    fn first_prediction_perfect_accuracy() {
        // 2 XLM staked → floor(2/10)=0 bonus; (100+0)*1*2/1 = 200
        assert_eq!(calculate_points(20_000_000, 1, 1), 200);
    }

    #[test]
    fn perfect_accuracy_multiple_predictions() {
        // 5 XLM → floor(5/10)=0; (100+0)*3*2/3 = 200
        assert_eq!(calculate_points(50_000_000, 3, 3), 200);
    }

    #[test]
    fn zero_stake_still_gets_base_and_accuracy() {
        assert_eq!(calculate_points(0, 2, 4), 100);
    }

    #[test]
    fn stake_bonus_one_per_ten_xlm() {
        // 100 XLM = 1_000_000_000 stroops → floor(100/10)=10 bonus
        assert_eq!(calculate_points(1_000_000_000, 1, 1), (100 + 10) * 2);
    }

    #[test]
    fn partial_accuracy_rounds_down() {
        // (100+0)*1*2/3 = 66
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
