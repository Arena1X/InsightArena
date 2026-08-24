use soroban_sdk::{Address, Env, Symbol, Vec};

use crate::admin;
use crate::leaderboard;
use crate::storage::{self, StorageError};
use crate::storage_types::{
    DataKey, Event, Match, MatchResult, MatchResultSubmission, OracleSubmission,
};

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum OracleError {
    /// Contract is paused; no operations allowed.
    Paused = 1,
    /// No event found for the given event_id.
    EventNotFound = 2,
    /// Event has been cancelled and cannot be processed.
    #[allow(dead_code)]
    EventCancelled = 3,
    /// Not all matches in the event have been resolved yet.
    #[allow(dead_code)]
    MatchesNotComplete = 4,
    /// No creation fee has been set (should not happen after init).
    #[allow(dead_code)]
    CreationFeeNotSet = 5,
    /// Arithmetic overflow occurred during calculation.
    Overflow = 6,
    /// Caller is not the authorized AI agent. (#810)
    Unauthorized = 7,
    /// No match found for the given match_id. (#810)
    MatchNotFound = 8,
    /// A result has already been submitted for this match. (#810)
    ResultAlreadySubmitted = 9,
    /// The match has not started yet (current time < match_time). (#810)
    MatchNotStarted = 10,
    /// Caller is not a configured oracle source. (#1347)
    NotAnOracleSource = 11,
    /// This source has already submitted a value for this match. (#1347)
    DuplicateOracleSubmission = 12,
    /// Fewer sources have reported than the configured minimum. (#1347)
    InsufficientOracleSources = 13,
    /// The oracle-source configuration is invalid: zero sources, a threshold
    /// of zero or greater than the source count, or a duplicate source
    /// address. (#1347)
    InvalidOracleConfig = 14,
    /// This source has already proposed a scoreline for this match's
    /// consensus round (#1698).
    DuplicateResultProposal = 15,
}

impl From<StorageError> for OracleError {
    fn from(_: StorageError) -> Self {
        OracleError::EventNotFound
    }
}

// ---------------------------------------------------------------------------
// Event emission
// ---------------------------------------------------------------------------

fn emit_match_result_submitted(
    env: &Env,
    match_id: u64,
    winning_team: &Symbol,
    submitted_by: &Address,
) {
    env.events().publish(
        (
            Symbol::new(env, "match"),
            Symbol::new(env, "result_submitted"),
        ),
        (match_id, winning_team.clone(), submitted_by.clone()),
    );
}

fn emit_oracle_sources_configured(env: &Env, source_count: u32, min_sources: u32) {
    env.events().publish(
        (Symbol::new(env, "oracle"), Symbol::new(env, "sources_set")),
        (source_count, min_sources),
    );
}

fn emit_oracle_value_submitted(env: &Env, match_id: u64, source: &Address, value: i128) {
    env.events().publish(
        (
            Symbol::new(env, "oracle"),
            Symbol::new(env, "value_submitted"),
        ),
        (match_id, source.clone(), value),
    );
}

// ---------------------------------------------------------------------------
// submit_match_result (#810, #966)
// ---------------------------------------------------------------------------

/// Submit a match result as the authorized AI oracle agent (#810, #966).
///
/// This is the core oracle function that resolves a match and grades every
/// prediction made for it. Accepts a final scoreline and derives the 1X2 result.
///
/// # Flow
/// 1. Require caller authorization.
/// 2. Reject if the contract is paused.
/// 3. Reject if the caller is not the stored AI agent address.
/// 4. Retrieve the match and verify it exists.
/// 5. Verify a result has not already been submitted.
/// 6. Verify the match has started (`now >= match_time`).
/// 7. Store home_score, away_score, and derive winning_team from the scores.
/// 8. Update the match.
/// 9. Grade every prediction for the match (is_correct, points_earned).
/// 10. Emit a `MatchResultSubmitted` event.
///
/// # Errors
/// * [`OracleError::Paused`] — the contract is paused.
/// * [`OracleError::Unauthorized`] — caller is not the AI agent.
/// * [`OracleError::MatchNotFound`] — no match with the given id.
/// * [`OracleError::ResultAlreadySubmitted`] — result already recorded.
/// * [`OracleError::MatchNotStarted`] — match has not started yet.
pub fn submit_match_result(
    env: &Env,
    caller: Address,
    match_id: u64,
    home_score: u32,
    away_score: u32,
) -> Result<(), OracleError> {
    caller.require_auth();

    // 1. Contract must not be paused.
    if admin::is_paused(env) {
        return Err(OracleError::Paused);
    }

    // 2. Caller must be the authorized AI agent.
    let ai_agent = admin::get_ai_agent(env).ok_or(OracleError::Unauthorized)?;
    if caller != ai_agent {
        return Err(OracleError::Unauthorized);
    }

    // 3. Match must exist.
    let match_record: Match =
        storage::get_match(env, match_id).map_err(|_| OracleError::MatchNotFound)?;

    // 4. Result must not already be submitted.
    if match_record.result_submitted {
        return Err(OracleError::ResultAlreadySubmitted);
    }

    // 5. Match must have started.
    let now = env.ledger().timestamp();
    if now < match_record.match_time {
        return Err(OracleError::MatchNotStarted);
    }

    // 6-9. Record the result, grade predictions, recompute standings, emit.
    finalize_match_result(
        env,
        match_record,
        match_id,
        caller,
        home_score,
        away_score,
        now,
    )
}

/// Shared finalization path for a match's winning result: records the
/// scoreline, grades every prediction for the match, recomputes the event's
/// weighted standings, and emits the result event.
///
/// Used by both [`submit_match_result`] (single AI-agent oracle) and
/// [`propose_match_result`]'s consensus path (#1698) once a result is ready
/// to be locked in — the two paths differ only in *how* the result was
/// authorized, not in what happens once it is.
fn finalize_match_result(
    env: &Env,
    mut match_record: Match,
    match_id: u64,
    submitted_by: Address,
    home_score: u32,
    away_score: u32,
    now: u64,
) -> Result<(), OracleError> {
    let result = MatchResult::from_scores(home_score, away_score);
    match_record
        .submit_result(result.clone(), submitted_by.clone(), now)
        .map_err(|_| OracleError::ResultAlreadySubmitted)?;

    match_record.home_score = Some(home_score);
    match_record.away_score = Some(away_score);
    storage::set_match(env, match_id, &match_record);

    // Grade every prediction submitted for this match.
    let prediction_ids = storage::get_match_predictions(env, match_id);
    for prediction_id in prediction_ids.iter() {
        if let Ok(mut prediction) = storage::get_prediction(env, prediction_id) {
            prediction.grade(home_score, away_score, match_record.points_multiplier);
            storage::set_prediction(env, prediction_id, &prediction);
        }
    }

    // Recompute and persist the event's weighted standings (#1311).
    leaderboard::recompute_standings(env, match_record.event_id).map_err(|e| match e {
        leaderboard::LeaderboardError::Overflow => OracleError::Overflow,
        _ => OracleError::EventNotFound,
    })?;

    let outcome_symbol = match result {
        MatchResult::TeamA => Symbol::new(env, crate::storage_types::OUTCOME_TEAM_A),
        MatchResult::TeamB => Symbol::new(env, crate::storage_types::OUTCOME_TEAM_B),
        MatchResult::Draw => Symbol::new(env, crate::storage_types::OUTCOME_DRAW),
    };
    emit_match_result_submitted(env, match_id, &outcome_symbol, &submitted_by);

    Ok(())
}

// ---------------------------------------------------------------------------
// get_user_score (#800)
// ---------------------------------------------------------------------------

/// Calculate a user's score (points and statistics) for an event.
///
/// # Flow
/// 1. Retrieve user's predictions for the event.
/// 2. Sum total_points earned from all predictions.
/// 3. Count predictions where the result (1X2) was correct.
/// 4. Count predictions where the exact score was correct.
/// 5. Get total match count for the event.
/// 6. Return tuple: (total_points, correct_results, exact_scores, total_matches).
///
/// # Returns
/// A tuple `(total_points, correct_results, exact_scores, total_matches)` where:
/// - `total_points`: Sum of points_earned from all predictions.
/// - `correct_results`: Number of matches with correct 1X2 result.
/// - `exact_scores`: Number of matches with exact scoreline prediction.
/// - `total_matches`: Total number of matches in the event.
pub fn get_user_score(
    env: &Env,
    user: Address,
    event_id: u64,
) -> Result<(u32, u32, u32, u32), OracleError> {
    // Retrieve event to get total match count
    let event: Event = storage::get_event(env, event_id)?;
    let total_matches = event.match_count;

    // Retrieve user's predictions for the event
    let user_predictions = storage::get_user_predictions(env, &user, event_id);

    // Calculate scores and stats
    let mut total_points: u32 = 0;
    let mut correct_results: u32 = 0;
    let mut exact_scores: u32 = 0;

    for prediction_id in user_predictions.iter() {
        if let Ok(prediction) = storage::get_prediction(env, prediction_id) {
            // Add earned points
            if let Some(points) = prediction.points_earned {
                total_points = total_points
                    .checked_add(points)
                    .ok_or(OracleError::Overflow)?;
            }
            // Count correct results
            if prediction.is_correct == Some(true) {
                correct_results = correct_results
                    .checked_add(1)
                    .ok_or(OracleError::Overflow)?;
            }
            // Count exact scores: load the match to compare actual vs predicted scores.
            // This is multiplier-agnostic — an exact score is one where both predicted
            // scores match the actual scores, regardless of the points multiplier.
            if let Ok(match_record) = storage::get_match(env, prediction.match_id) {
                if let (Some(actual_home), Some(actual_away)) =
                    (match_record.home_score, match_record.away_score)
                {
                    if prediction.predicted_home_score == actual_home
                        && prediction.predicted_away_score == actual_away
                    {
                        exact_scores = exact_scores.checked_add(1).ok_or(OracleError::Overflow)?;
                    }
                }
            }
        }
    }

    Ok((total_points, correct_results, exact_scores, total_matches))
}

// ---------------------------------------------------------------------------
// get_creation_fee (#801)
// ---------------------------------------------------------------------------

/// Retrieve the current XLM fee required to create an event.
///
/// # Flow
/// 1. Retrieve CreationFee from storage.
/// 2. Return i128 value.
/// 3. Return default if not set (should not happen after init).
///
/// # Returns
/// The creation fee in stroops (i128).
#[allow(dead_code)]
pub fn get_creation_fee(env: &Env) -> Result<i128, OracleError> {
    admin::get_creation_fee(env).ok_or(OracleError::CreationFeeNotSet)
}

// ---------------------------------------------------------------------------
// Multi-source oracle median aggregation (#1347)
// ---------------------------------------------------------------------------

/// Configure the set of authorized oracle sources and the minimum number of
/// distinct sources required before their submissions can be aggregated.
///
/// Only the admin may call this. Replaces any previously configured source
/// set and threshold atomically.
///
/// # Errors
/// * [`OracleError::Unauthorized`] — caller is not the admin.
/// * [`OracleError::InvalidOracleConfig`] — `min_sources` is `0` or exceeds
///   `sources.len()`, or `sources` contains a duplicate address.
pub fn configure_oracle_sources(
    env: &Env,
    caller: Address,
    sources: Vec<Address>,
    min_sources: u32,
) -> Result<(), OracleError> {
    caller.require_auth();

    let is_admin = env
        .storage()
        .persistent()
        .get::<DataKey, Address>(&DataKey::Admin(caller.clone()))
        .is_some();
    if !is_admin {
        return Err(OracleError::Unauthorized);
    }

    let source_count = sources.len();
    if min_sources == 0 || min_sources > source_count {
        return Err(OracleError::InvalidOracleConfig);
    }

    for i in 0..sources.len() {
        for j in (i + 1)..sources.len() {
            if sources.get(i) == sources.get(j) {
                return Err(OracleError::InvalidOracleConfig);
            }
        }
    }

    storage::set_oracle_sources(env, &sources);
    storage::set_oracle_min_sources(env, min_sources);

    emit_oracle_sources_configured(env, source_count, min_sources);

    Ok(())
}

// ---------------------------------------------------------------------------
// Multi-submitter match result consensus (#1698)
// ---------------------------------------------------------------------------

/// Propose a match's final scoreline as an authorized oracle source, toward
/// the multi-submitter consensus that finalizes match results.
///
/// Each configured source (`oracle::configure_oracle_sources`) may submit one
/// proposal per match. Once distinct sources have proposed the **same**
/// scoreline `min_sources` times (the configured agreement threshold), the
/// match is finalized exactly as `submit_match_result` would: the winning
/// outcome is recorded, every prediction for the match is graded, and the
/// event's weighted standings are recomputed.
///
/// Submissions made after the match is already finalized — whether they
/// agree with the recorded result or conflict with it — are rejected, since
/// a finalized result is immutable outside `match::overturn_match_result`
/// (#1701).
///
/// # Errors
/// * [`OracleError::Paused`] — the contract is paused.
/// * [`OracleError::MatchNotFound`] — no match with the given id.
/// * [`OracleError::NotAnOracleSource`] — `source` is not in the configured
///   oracle source set.
/// * [`OracleError::ResultAlreadySubmitted`] — the match already has a
///   finalized result; no further proposals are accepted.
/// * [`OracleError::DuplicateResultProposal`] — `source` has already
///   proposed a scoreline for this match's consensus round.
///
/// # Returns
/// `true` if this submission reached the agreement threshold and finalized
/// the match; `false` if the match is still awaiting consensus.
pub fn propose_match_result(
    env: &Env,
    source: Address,
    match_id: u64,
    home_score: u32,
    away_score: u32,
) -> Result<bool, OracleError> {
    source.require_auth();

    if admin::is_paused(env) {
        return Err(OracleError::Paused);
    }

    let sources = storage::get_oracle_sources(env);
    if !sources.contains(source.clone()) {
        return Err(OracleError::NotAnOracleSource);
    }

    let match_record: Match =
        storage::get_match(env, match_id).map_err(|_| OracleError::MatchNotFound)?;

    // A finalized result is immutable outside the overturn path (#1701) —
    // reject any further proposal, matching or conflicting.
    if match_record.result_submitted {
        return Err(OracleError::ResultAlreadySubmitted);
    }

    let existing = storage::get_match_result_proposals(env, match_id);
    for submission in existing.iter() {
        if submission.source == source {
            return Err(OracleError::DuplicateResultProposal);
        }
    }

    let now = env.ledger().timestamp();
    let submission = MatchResultSubmission {
        source: source.clone(),
        match_id,
        home_score,
        away_score,
        submitted_at: now,
    };
    storage::add_match_result_proposal(env, match_id, &submission);

    emit_match_result_proposed(env, match_id, &source, home_score, away_score);

    // Count distinct sources that agree with this submission's scoreline.
    let mut agreement_count: u32 = 0;
    let proposals = storage::get_match_result_proposals(env, match_id);
    for proposal in proposals.iter() {
        if proposal.home_score == home_score && proposal.away_score == away_score {
            agreement_count += 1;
        }
    }

    let min_sources = storage::get_oracle_min_sources(env);
    if min_sources == 0 || agreement_count < min_sources {
        return Ok(false);
    }

    // Threshold reached: finalize using the agreed-upon scoreline.
    finalize_match_result(
        env,
        match_record,
        match_id,
        source,
        home_score,
        away_score,
        now,
    )?;

    Ok(true)
}

fn emit_match_result_proposed(
    env: &Env,
    match_id: u64,
    source: &Address,
    home_score: u32,
    away_score: u32,
) {
    env.events().publish(
        (
            Symbol::new(env, "oracle"),
            Symbol::new(env, "result_proposed"),
        ),
        (match_id, source.clone(), home_score, away_score),
    );
}

/// Submit a numeric resolution value for a match as an authorized oracle
/// source.
///
/// # Errors
/// * [`OracleError::Paused`] — the contract is paused.
/// * [`OracleError::MatchNotFound`] — no match with the given id.
/// * [`OracleError::NotAnOracleSource`] — `source` is not in the configured
///   oracle source set.
/// * [`OracleError::DuplicateOracleSubmission`] — `source` has already
///   submitted a value for this match.
pub fn submit_oracle_value(
    env: &Env,
    source: Address,
    match_id: u64,
    value: i128,
) -> Result<(), OracleError> {
    source.require_auth();

    if admin::is_paused(env) {
        return Err(OracleError::Paused);
    }

    let sources = storage::get_oracle_sources(env);
    if !sources.contains(source.clone()) {
        return Err(OracleError::NotAnOracleSource);
    }

    // Match must exist.
    storage::get_match(env, match_id).map_err(|_| OracleError::MatchNotFound)?;

    let existing = storage::get_oracle_submissions(env, match_id);
    for submission in existing.iter() {
        if submission.source == source {
            return Err(OracleError::DuplicateOracleSubmission);
        }
    }

    let submission = OracleSubmission {
        source: source.clone(),
        match_id,
        value,
        submitted_at: env.ledger().timestamp(),
    };
    storage::add_oracle_submission(env, match_id, &submission);

    emit_oracle_value_submitted(env, match_id, &source, value);

    Ok(())
}

/// Return every oracle submission recorded for a match, for auditability.
///
/// Returns an empty `Vec` when no source has submitted a value yet.
pub fn get_oracle_submissions(env: &Env, match_id: u64) -> Vec<OracleSubmission> {
    storage::get_oracle_submissions(env, match_id)
}

/// Compute the median of the numeric values submitted for a match by
/// authorized oracle sources.
///
/// # Errors
/// * [`OracleError::InsufficientOracleSources`] — fewer sources have
///   reported than the configured minimum.
/// * [`OracleError::Overflow`] — averaging the two middle values (even
///   submission count) overflowed i128.
pub fn compute_oracle_median(env: &Env, match_id: u64) -> Result<i128, OracleError> {
    let submissions = storage::get_oracle_submissions(env, match_id);
    let min_sources = storage::get_oracle_min_sources(env);

    if submissions.len() < min_sources {
        return Err(OracleError::InsufficientOracleSources);
    }

    let mut values: Vec<i128> = Vec::new(env);
    for submission in submissions.iter() {
        values.push_back(submission.value);
    }

    // Simple insertion sort — submission counts are small, bounded by the
    // configured oracle source set.
    let n = values.len();
    for i in 1..n {
        let mut j = i;
        while j > 0 {
            let a = values.get(j).unwrap();
            let b = values.get(j - 1).unwrap();
            if a < b {
                values.set(j, b);
                values.set(j - 1, a);
                j -= 1;
            } else {
                break;
            }
        }
    }

    let mid = n / 2;
    let median = if n % 2 == 1 {
        values.get(mid).unwrap()
    } else {
        let a = values.get(mid - 1).unwrap();
        let b = values.get(mid).unwrap();
        a.checked_add(b).ok_or(OracleError::Overflow)? / 2
    };

    Ok(median)
}

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    #[allow(unused_imports)]
    use super::*;

    // Note: Unit tests for oracle functions require Soroban contract context.
    // Integration tests are provided in tests/ directory.
    // To run integration tests: cargo test --test oracle_integration_tests
    //
    // Unit tests would require wrapping all storage access with env.as_contract(),
    // which is better handled in integration tests with proper contract setup.
}
