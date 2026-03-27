use soroban_sdk::{Address, Env};

use crate::storage_types::DataKey;

const STROOPS_PER_XLM: i128 = 10_000_000;

/// Calculate season points earned for a correct prediction.
///
/// Pure function: no storage reads/writes.
///
/// Spec:
/// - base_points = 100
/// - stake_bonus = floor(stake_amount_xlm / 10)
/// - accuracy_multiplier = (correct_predictions / total_predictions) * 2
/// - season_points_earned = (base_points + stake_bonus) * accuracy_multiplier
pub fn calculate_points(stake_amount: i128, correct: u32, total: u32) -> u32 {
    if stake_amount <= 0 || total == 0 || correct == 0 {
        return 0;
    }

    // stake_bonus = floor((stake_amount / 10_000_000) / 10) = floor(stake_amount / 100_000_000)
    let stake_bonus: u128 = (stake_amount / (STROOPS_PER_XLM * 10)) as u128;
    let base_plus_bonus: u128 = 100_u128 + stake_bonus;

    // accuracy_multiplier = (correct / total) * 2
    // Use integer math: (base_plus_bonus * correct * 2) / total.
    let points_u128 = base_plus_bonus
        .saturating_mul(correct as u128)
        .saturating_mul(2_u128)
        / (total as u128);

    if points_u128 > u32::MAX as u128 {
        u32::MAX
    } else {
        points_u128 as u32
    }
}

/// Return the user's season points for a season.
///
/// Current contract only tracks points for the active season in `UserProfile.season_points`.
/// For non-active seasons or unknown users, returns 0. Never panics.
pub fn get_user_season_points(env: Env, user: Address, season_id: u32) -> u32 {
    let active: Option<u32> = env.storage().persistent().get(&DataKey::ActiveSeason);
    if active != Some(season_id) {
        return 0;
    }

    env.storage()
        .persistent()
        .get::<DataKey, crate::storage_types::UserProfile>(&DataKey::User(user))
        .map(|p| p.season_points)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::calculate_points;

    #[test]
    fn points_zero_when_total_zero() {
        assert_eq!(calculate_points(10_000_000, 0, 0), 0);
        assert_eq!(calculate_points(10_000_000, 1, 0), 0);
    }

    #[test]
    fn points_first_prediction_perfect_accuracy_zero_stake_bonus() {
        assert_eq!(calculate_points(10_000_000, 1, 1), 200);
    }

    #[test]
    fn points_perfect_accuracy_with_stake_bonus() {
        // 100 XLM staked => stake_bonus = 10
        assert_eq!(calculate_points(100 * 10_000_000, 1, 1), 220);
    }

    #[test]
    fn points_half_accuracy_multiplier_floor() {
        // correct/total = 1/2 => multiplier = 1
        assert_eq!(calculate_points(10_000_000, 1, 2), 100);
    }

    #[test]
    fn points_zero_when_correct_zero() {
        assert_eq!(calculate_points(10_000_000, 0, 5), 0);
    }

    #[test]
    fn points_zero_for_non_positive_stake() {
        assert_eq!(calculate_points(0, 1, 1), 0);
        assert_eq!(calculate_points(-1, 1, 1), 0);
    }
}

