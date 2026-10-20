use soroban_sdk::{Address, Env, String, Symbol, Vec};

use crate::admin;
use crate::event::{self, EventError};
use crate::leaderboard;
use crate::storage::{self};
use crate::storage_types::{Match, MatchResult};

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum MatchError {
    /// Contract is paused; no new matches may be created.
    Paused = 1,
    /// No event found for the given event_id.
    EventNotFound = 2,
    /// Event has been cancelled.
    EventCancelled = 3,
    /// Caller is not the event creator.
    Unauthorized = 4,
    /// Team names are invalid (empty, too long, or identical).
    InvalidTeamNames = 5,
    /// Match time is invalid (in the past or outside event window).
    InvalidMatchTime = 6,
    /// points_multiplier is 0 or exceeds MAX_POINTS_MULTIPLIER (cap: 3).
    InvalidPointsMultiplier = 7,
    /// No match found for the given match_id.
    MatchNotFound = 8,
    /// The configured lock lead-time would push `prediction_lock_time` to or
    /// before the current time, leaving no window to predict at all.
    InvalidLockLeadTime = 9,
    /// overturn_match_result called on a match with no submitted result yet
    /// (#1701).
    ResultNotSubmitted = 10,
    /// overturn_match_result called after the parent event has already been
    /// finalized — prize payouts are already staged, so the result is
    /// immutable at that point (#1701).
    EventAlreadyFinalized = 11,
}

// ---------------------------------------------------------------------------
// create_match (#964)
// ---------------------------------------------------------------------------

/// Create a new match within an event.
///
/// # Flow
/// 1. Require caller's authorization.
/// 2. Reject if the contract is paused.
/// 3. Load the event; verify it exists and is not cancelled.
/// 4. Verify caller is the event creator.
/// 5. Validate team names via Match::validate() plus team_a != team_b check.
/// 6. Validate match_time is in the future.
/// 7. Assign a new match_id via storage::next_match_id.
/// 8. Build the Match via Match::new().
/// 9. Persist via storage::set_match().
/// 10. Update event.match_count and re-persist.
/// 11. Index the match in EventMatches via storage::add_event_match().
/// 12. Emit ("match", "created") with (match_id, event_id, team_a, team_b, match_time).
/// 13. Return match_id.
pub fn create_match(
    env: &Env,
    caller: Address,
    event_id: u64,
    team_a: String,
    team_b: String,
    match_time: u64,
    points_multiplier: u32,
) -> Result<u64, MatchError> {
    // Step 1: Require authorization
    caller.require_auth();

    // Step 2: Check if contract is paused
    if admin::is_paused(env) {
        return Err(MatchError::Paused);
    }

    // Step 3: Load the event
    let event = event::get_event(env, event_id).map_err(|_| MatchError::EventNotFound)?;

    // Verify event is not cancelled
    if event.is_cancelled {
        return Err(MatchError::EventCancelled);
    }

    // Step 4: Verify caller is the event creator
    if caller != event.creator {
        return Err(MatchError::Unauthorized);
    }

    // Step 5: Validate team names
    // Check for empty or too long names
    if team_a.len() == 0 || team_a.len() > crate::storage_types::MAX_TEAM_NAME_LEN {
        return Err(MatchError::InvalidTeamNames);
    }
    if team_b.len() == 0 || team_b.len() > crate::storage_types::MAX_TEAM_NAME_LEN {
        return Err(MatchError::InvalidTeamNames);
    }
    // Check that teams are different
    if team_a == team_b {
        return Err(MatchError::InvalidTeamNames);
    }

    // Step 6: Validate match_time is in the future and within the event window
    let current_time = env.ledger().timestamp();
    if match_time <= current_time {
        return Err(MatchError::InvalidMatchTime);
    }
    if match_time >= event.end_time {
        return Err(MatchError::InvalidMatchTime);
    }

    // Step 7: Validate points_multiplier (must be 1..=MAX_POINTS_MULTIPLIER)
    if points_multiplier == 0 || points_multiplier > crate::storage_types::MAX_POINTS_MULTIPLIER {
        return Err(MatchError::InvalidPointsMultiplier);
    }

    // Step 7b: Compute and validate the prediction lock timestamp from the
    // configured lock lead-time. The lock time must leave a strictly
    // positive window after "now" for predictions to be placed at all.
    let lock_lead_seconds = admin::get_prediction_lock_lead_seconds(env);
    let prediction_lock_time = match_time.saturating_sub(lock_lead_seconds);
    if prediction_lock_time <= current_time {
        return Err(MatchError::InvalidLockLeadTime);
    }

    // Step 8: Assign a new match_id
    let match_id = storage::next_match_id(env);

    // Step 9: Build the Match
    let m = Match::new(
        match_id,
        event_id,
        team_a.clone(),
        team_b.clone(),
        match_time,
        points_multiplier,
        lock_lead_seconds,
    );

    // Step 10: Persist the match
    storage::set_match(env, match_id, &m);

    // Step 11: Update event and re-persist
    let mut updated_event = event;
    updated_event.add_match();
    storage::set_event(env, event_id, &updated_event);

    // Step 12: Index the match
    storage::add_event_match(env, event_id, match_id);

    // Step 13: Emit event
    env.events().publish(
        (Symbol::new(env, "match"), Symbol::new(env, "created")),
        (match_id, event_id, team_a, team_b, match_time),
    );

    // Step 14: Return match_id
    Ok(match_id)
}

/// Return the number of matches currently stored for an event.
///
/// This reads only the event record, so it avoids loading the full match list.
/// Returns [`EventError::EventNotFound`] if the event ID does not exist.
pub fn get_match_count(env: &Env, event_id: u64) -> Result<u32, EventError> {
    let event = event::get_event(env, event_id)?;
    Ok(event.match_count)
}

/// Retrieve all matches for a specific event, sorted by `match_time` ascending.
///
/// Looks up the `EventMatches(event_id)` index, fetches each [`Match`] struct,
/// and returns them in chronological order (earliest match first).
///
/// # Sorting behaviour
/// Results are sorted by `match_time` ascending, then `match_id` ascending, using an insertion sort.
/// Matches are appended in creation order, which may differ from schedule
/// order; the explicit sort guarantees correct ordering regardless.
///
/// # Errors
/// Returns [`EventError::EventNotFound`] when `event_id` does not exist.
pub fn list_event_matches(env: &Env, event_id: u64) -> Result<Vec<Match>, EventError> {
    // Verify the event exists before reading its match list.
    event::get_event(env, event_id)?;

    let match_ids = storage::get_event_matches(env, event_id);

    let mut matches: Vec<Match> = Vec::new(env);
    for match_id in match_ids.iter() {
        if let Ok(m) = storage::get_match(env, match_id) {
            matches.push_back(m);
        }
    }

    // Sort by match_time ascending (insertion sort — list is typically small).
    let len = matches.len();
    for i in 1..len {
        let mut j = i;
        while j > 0 {
            let prev = matches.get(j - 1).unwrap();
            let curr = matches.get(j).unwrap();
            if prev.match_time > curr.match_time
                || (prev.match_time == curr.match_time && prev.match_id > curr.match_id)
            {
                matches.set(j - 1, curr);
                matches.set(j, prev);
                j -= 1;
            } else {
                break;
            }
        }
    }

    Ok(matches)
}

/// Retrieve a single match by its unique match_id.
///
/// Extends the storage TTL on read.
/// Returns [`MatchError::MatchNotFound`] if the match does not exist.
pub fn get_match(env: &Env, match_id: u64) -> Result<Match, MatchError> {
    storage::get_match(env, match_id).map_err(|_| MatchError::MatchNotFound)
}

// ---------------------------------------------------------------------------
// overturn_match_result (#1701)
// ---------------------------------------------------------------------------

/// Correct a previously submitted match result. This is the **only** path
/// through which a match's result may change after `submit_match_result` —
/// direct resubmission is rejected by [`Match::submit_result`] and
/// `oracle::submit_match_result`.
///
/// Only the contract admin may call this, and only before the parent event
/// has been finalized (once `finalize_event` runs, prize allocations are
/// staged from the standings computed at that time, so the result becomes
/// immutable).
///
/// Re-derives the winning outcome from the corrected scoreline, re-grades
/// every prediction for the match, and recomputes the event's weighted
/// standings so downstream leaderboard/payout reads reflect the correction.
///
/// # Errors
/// * [`MatchError::Unauthorized`] — caller is not the admin.
/// * [`MatchError::MatchNotFound`] — no match with the given id.
/// * [`MatchError::ResultNotSubmitted`] — the match has no result to correct
///   yet; use `submit_match_result` for the first submission.
/// * [`MatchError::EventNotFound`] — the match's parent event is missing.
/// * [`MatchError::EventAlreadyFinalized`] — the parent event has already
///   been finalized.
///
/// # Events
/// Emits `(Symbol("match"), Symbol("result_overturned"))` with data
/// `(match_id, old_home_score, old_away_score, new_home_score, new_away_score)`.
pub fn overturn_match_result(
    env: &Env,
    caller: Address,
    match_id: u64,
    new_home_score: u32,
    new_away_score: u32,
) -> Result<(), MatchError> {
    caller.require_auth();
    let is_admin = env
        .storage()
        .persistent()
        .get::<crate::storage_types::DataKey, Address>(&crate::storage_types::DataKey::Admin(
            caller.clone(),
        ))
        .is_some();
    if !is_admin {
        return Err(MatchError::Unauthorized);
    }

    let mut match_record: Match =
        storage::get_match(env, match_id).map_err(|_| MatchError::MatchNotFound)?;

    if !match_record.result_submitted {
        return Err(MatchError::ResultNotSubmitted);
    }

    let parent_event =
        event::get_event(env, match_record.event_id).map_err(|_| MatchError::EventNotFound)?;
    if parent_event.is_finalized {
        return Err(MatchError::EventAlreadyFinalized);
    }

    let old_home_score = match_record.home_score.unwrap_or(0);
    let old_away_score = match_record.away_score.unwrap_or(0);

    let result = MatchResult::from_scores(new_home_score, new_away_score);
    match_record.winning_team = Some(result.to_u32());
    match_record.home_score = Some(new_home_score);
    match_record.away_score = Some(new_away_score);
    match_record.submitted_at = Some(env.ledger().timestamp());
    storage::set_match(env, match_id, &match_record);

    // Re-grade every prediction against the corrected scoreline.
    let prediction_ids = storage::get_match_predictions(env, match_id);
    for prediction_id in prediction_ids.iter() {
        if let Ok(mut prediction) = storage::get_prediction(env, prediction_id) {
            prediction.grade(
                new_home_score,
                new_away_score,
                match_record.points_multiplier,
            );
            storage::set_prediction(env, prediction_id, &prediction);
        }
    }

    // Recompute standings so the leaderboard reflects the correction.
    leaderboard::recompute_standings(env, match_record.event_id)
        .map_err(|_| MatchError::EventNotFound)?;

    env.events().publish(
        (
            Symbol::new(env, "match"),
            Symbol::new(env, "result_overturned"),
        ),
        (
            match_id,
            old_home_score,
            old_away_score,
            new_home_score,
            new_away_score,
        ),
    );

    Ok(())
}
