//! Ranked event leaderboard computation.
//!
//! This module provides the core leaderboard functionality for events, ranking
//! participants by total points with deterministic tie-breaking. The leaderboard
//! is computed on-demand (live) and can be called before all matches are resolved,
//! with unresolved matches contributing 0 points.

use soroban_sdk::{Address, Env, Map, Vec};

use crate::event::{self, EventError};
use crate::storage;
use crate::storage_types::{
    weighted_contribution, LeaderboardEntry, MatchResult, ParticipantScore, Prediction,
    StandingEntry,
};

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum LeaderboardError {
    /// No event found for the given event_id.
    EventNotFound = 1,
    /// Arithmetic overflow during calculation.
    Overflow = 2,
}

impl From<EventError> for LeaderboardError {
    fn from(_: EventError) -> Self {
        LeaderboardError::EventNotFound
    }
}

// ---------------------------------------------------------------------------
// get_event_leaderboard (#967)
// ---------------------------------------------------------------------------

/// Retrieve a ranked leaderboard for an event, sorted by total points.
///
/// This function computes a live leaderboard based on all participants' total
/// points earned from predictions. The leaderboard is available before all
/// matches are resolved; predictions for unresolved matches contribute 0 points.
///
/// # Ranking Rules (documented tie-break order #1343):
/// 1. **Higher total_points** — primary sort key (descending).
/// 2. **Higher exact_scores** — tiebreaker (descending).
/// 3. **Earlier tie_break_key** — earliest qualifying prediction timestamp
///    (ascending); stored on each entry for auditability.
/// 4. **Address byte comparison** — final deterministic tiebreaker.
///
/// # Flow:
/// 1. Verify the event exists.
/// 2. Retrieve all participants for the event.
/// 3. For each participant:
///    - Sum `points_earned` from all their predictions → `total_points`.
///    - Count predictions where `is_correct == Some(true)` → `correct_results`.
///    - Count predictions where `points_earned == Some(4)` → `exact_scores`.
///    - Count total predictions submitted → `matches_played`.
///    - Find max `predicted_at` → `last_prediction_time`.
///    - Find min `predicted_at` → `tie_break_key`.
/// 4. Sort entries by the ranking rules above.
/// 5. Assign rank 1..N in sorted order (exposed on each entry).
/// 6. Return the sorted leaderboard.
///
/// # Returns
/// A `Vec<LeaderboardEntry>` sorted by total points descending, with all
/// tiebreakers applied and ranks assigned. Returns an empty `Vec` if the
/// event has no participants.
///
/// # Errors
/// * [`LeaderboardError::EventNotFound`] — no event with the given event_id.
/// * [`LeaderboardError::Overflow`] — arithmetic overflow during calculation.
pub fn get_event_leaderboard(
    env: &Env,
    event_id: u64,
) -> Result<Vec<LeaderboardEntry>, LeaderboardError> {
    // 1. Verify event exists
    let _event = event::get_event(env, event_id)?;

    // 2. Retrieve all participants
    let participants = storage::get_event_participants(env, event_id);

    // 3. Build leaderboard entries
    let mut entries: Vec<LeaderboardEntry> = Vec::new(env);

    for participant in participants.iter() {
        let user_predictions = storage::get_user_predictions(env, &participant, event_id);

        let mut total_points: u32 = 0;
        let mut correct_results: u32 = 0;
        let mut exact_scores: u32 = 0;
        let mut last_prediction_time: u64 = 0;
        let mut tie_break_key: u64 = u64::MAX;

        // Calculate stats from all predictions
        for prediction_id in user_predictions.iter() {
            if let Ok(prediction) = storage::get_prediction(env, prediction_id) {
                // Add earned points (None counts as 0)
                if let Some(points) = prediction.points_earned {
                    total_points = total_points
                        .checked_add(points)
                        .ok_or(LeaderboardError::Overflow)?;
                }

                // Count correct results
                if prediction.is_correct == Some(true) {
                    correct_results = correct_results
                        .checked_add(1)
                        .ok_or(LeaderboardError::Overflow)?;
                }

                // Count exact scores (4 points means exact score)
                if prediction.points_earned
                    == Some(
                        crate::storage_types::POINTS_CORRECT_RESULT
                            + crate::storage_types::POINTS_EXACT_SCORE,
                    )
                {
                    exact_scores = exact_scores
                        .checked_add(1)
                        .ok_or(LeaderboardError::Overflow)?;
                }

                // Track latest prediction time (informational)
                if prediction.predicted_at > last_prediction_time {
                    last_prediction_time = prediction.predicted_at;
                }
                // Earliest qualifying timestamp is the stored tie-break key.
                if prediction.predicted_at < tie_break_key {
                    tie_break_key = prediction.predicted_at;
                }
            }
        }

        // Create entry (rank will be assigned after sorting)
        let matches_played = user_predictions.len();
        let entry = LeaderboardEntry::new(
            participant.clone(),
            event_id,
            total_points,
            correct_results,
            exact_scores,
            matches_played,
            last_prediction_time,
            tie_break_key,
        );
        entries.push_back(entry);
    }

    // 4. Sort entries using insertion sort (stable and suitable for small lists)
    let len = entries.len();
    for i in 1..len {
        let mut j = i;
        while j > 0 {
            let prev = entries.get(j - 1).unwrap();
            let curr = entries.get(j).unwrap();
            if prev.outranks(&curr) {
                // prev ranks higher, no swap needed
                break;
            } else {
                // curr ranks higher, swap
                entries.set(j - 1, curr);
                entries.set(j, prev);
                j -= 1;
            }
        }
    }

    // 5. Assign ranks (1-based) — exposed on every read of the leaderboard.
    for i in 0..len {
        let mut entry = entries.get(i).unwrap();
        entry.rank = (i as u32) + 1;
        entries.set(i, entry);
    }

    Ok(entries)
}

/// Return the resolved 1-based rank for a participant, or `0` if they are not
/// on the leaderboard (#1343).
pub fn get_user_rank(env: &Env, event_id: u64, user: Address) -> Result<u32, LeaderboardError> {
    let leaderboard = get_event_leaderboard(env, event_id)?;
    for entry in leaderboard.iter() {
        if entry.user == user {
            return Ok(entry.rank);
        }
    }
    Ok(0)
}

// ---------------------------------------------------------------------------
// Weighted standings (#1311)
// ---------------------------------------------------------------------------

/// Recompute and persist the weighted standings for an event.
///
/// Rebuilds every participant's [`ParticipantScore`] from scratch out of the
/// event's graded predictions, then sorts and stores the ranked
/// [`StandingEntry`] snapshot under `DataKey::EventStandings(event_id)`.
/// Because the computation reads only immutable graded data (a match result
/// can never be resubmitted), recomputing any number of times yields
/// identical standings — the operation is idempotent.
///
/// # Weighting (see `storage_types` weighting constants)
/// Each correct prediction contributes
/// `points_earned × (base + early bonus + underdog bonus)` weighted units:
/// * **Early**: placed ≥ `EARLY_PREDICTION_LEAD_SECONDS` before match start.
/// * **Underdog**: strictly fewer than half of the match's predictors picked
///   the winning outcome.
///
/// # Tie-break ordering (see [`StandingEntry::outranks`])
/// weighted score ↓ → correct count ↓ → achieved_at ↑ → address ↑
///
/// # Bounded iteration
/// One pass over the event's matches, and for each resolved match one pass
/// over its predictions (loaded once per match), plus an insertion sort over
/// the participants. Total work is O(P + M·K + P²) for P participants,
/// M matches, and K predictions per match — all bounded by the event's own
/// stored indexes; no unbounded scans.
///
/// Called from `submit_match_result` (after grading) and `finalize_event`.
pub fn recompute_standings(
    env: &Env,
    event_id: u64,
) -> Result<Vec<StandingEntry>, LeaderboardError> {
    let _event = event::get_event(env, event_id)?;

    let participants = storage::get_event_participants(env, event_id);

    // Start every participant from zero — full rebuild, never incremental.
    let mut scores: Map<Address, ParticipantScore> = Map::new(env);
    for participant in participants.iter() {
        scores.set(
            participant.clone(),
            ParticipantScore::zero(participant.clone(), event_id),
        );
    }

    let match_ids = storage::get_event_matches(env, event_id);
    for match_id in match_ids.iter() {
        let m = match storage::get_match(env, match_id) {
            Ok(m) => m,
            Err(_) => continue,
        };
        if !m.result_submitted {
            continue;
        }
        let (winning_team, submitted_at) = match (m.winning_team, m.submitted_at) {
            (Some(w), Some(t)) => (w, t),
            _ => continue,
        };

        // Load the match's predictions once, tallying picks per outcome so the
        // underdog check needs no second storage pass.
        let prediction_ids = storage::get_match_predictions(env, match_id);
        let mut predictions: Vec<Prediction> = Vec::new(env);
        let mut outcome_counts: [u32; 3] = [0, 0, 0];
        for prediction_id in prediction_ids.iter() {
            if let Ok(prediction) = storage::get_prediction(env, prediction_id) {
                let outcome = MatchResult::from_scores(
                    prediction.predicted_home_score,
                    prediction.predicted_away_score,
                )
                .to_u8() as usize;
                outcome_counts[outcome] += 1;
                predictions.push_back(prediction);
            }
        }

        let total_picks = predictions.len() as u64;
        let winner_picks = *outcome_counts.get(winning_team as usize).unwrap_or(&0) as u64;
        // Against-the-crowd: strictly fewer than half of the match's
        // predictors chose the winning outcome.
        let minority_pick = winner_picks * 2 < total_picks;

        for prediction in predictions.iter() {
            let points = prediction.points_earned.unwrap_or(0);
            if points == 0 {
                continue;
            }
            let mut score = match scores.get(prediction.predictor.clone()) {
                Some(score) => score,
                // Predictor not in the participant index — skip defensively.
                None => continue,
            };

            let (base, timing, underdog) =
                weighted_contribution(points, prediction.predicted_at, m.match_time, minority_pick);

            score.base_component = score
                .base_component
                .checked_add(base)
                .ok_or(LeaderboardError::Overflow)?;
            score.timing_component = score
                .timing_component
                .checked_add(timing)
                .ok_or(LeaderboardError::Overflow)?;
            score.underdog_component = score
                .underdog_component
                .checked_add(underdog)
                .ok_or(LeaderboardError::Overflow)?;
            score.weighted_score = score
                .weighted_score
                .checked_add(base + timing + underdog)
                .ok_or(LeaderboardError::Overflow)?;
            score.correct_count = score
                .correct_count
                .checked_add(1)
                .ok_or(LeaderboardError::Overflow)?;
            if submitted_at > score.achieved_at {
                score.achieved_at = submitted_at;
            }

            scores.set(prediction.predictor.clone(), score);
        }
    }

    // Persist per-participant scores and build the standings rows.
    let mut standings: Vec<StandingEntry> = Vec::new(env);
    for participant in participants.iter() {
        // Every participant was seeded above, so the lookup cannot fail.
        let score = scores.get(participant.clone()).unwrap();
        storage::set_participant_score(env, &score);
        standings.push_back(StandingEntry {
            user: participant.clone(),
            event_id,
            weighted_score: score.weighted_score,
            correct_count: score.correct_count,
            achieved_at: score.achieved_at,
            rank: 0,
        });
    }

    // Sort with insertion sort (stable, suitable for small participant lists).
    let len = standings.len();
    for i in 1..len {
        let mut j = i;
        while j > 0 {
            let prev = standings.get(j - 1).unwrap();
            let curr = standings.get(j).unwrap();
            if prev.outranks(&curr) {
                break;
            }
            standings.set(j - 1, curr);
            standings.set(j, prev);
            j -= 1;
        }
    }

    // Assign 1-based ranks.
    for i in 0..len {
        let mut entry = standings.get(i).unwrap();
        entry.rank = (i as u32) + 1;
        standings.set(i, entry);
    }

    storage::set_event_standings(env, event_id, &standings);
    Ok(standings)
}

/// Return the stored weighted standings snapshot for an event.
///
/// The snapshot is the one persisted by the most recent
/// [`recompute_standings`] run (triggered by `submit_match_result` or
/// `finalize_event`). Returns an empty `Vec` when no match result has been
/// submitted yet.
///
/// # Errors
/// * [`LeaderboardError::EventNotFound`] — no event with the given event_id.
pub fn get_event_standings(
    env: &Env,
    event_id: u64,
) -> Result<Vec<StandingEntry>, LeaderboardError> {
    event::get_event(env, event_id)?;
    Ok(storage::get_event_standings(env, event_id))
}

/// Return a participant's weighted score components for an event.
///
/// Exposes the full breakdown (base, timing bonus, underdog bonus, correct
/// count, achievement timestamp) so anyone can verify how a weighted score
/// was assembled. Returns a zeroed score for a participant who has not been
/// scored yet.
///
/// # Errors
/// * [`LeaderboardError::EventNotFound`] — no event with the given event_id.
pub fn get_participant_score(
    env: &Env,
    event_id: u64,
    user: Address,
) -> Result<ParticipantScore, LeaderboardError> {
    event::get_event(env, event_id)?;
    Ok(storage::get_participant_score(env, event_id, &user)
        .unwrap_or_else(|| ParticipantScore::zero(user, event_id)))
}

#[cfg(test)]
mod tests {
    #[allow(unused_imports)]
    use super::*;

    // Note: Unit tests for leaderboard functions require Soroban contract context.
    // Integration tests are provided in tests/ directory.
}
