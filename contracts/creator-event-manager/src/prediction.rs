use soroban_sdk::{token::Client as TokenClient, Address, Env, Symbol, Vec};

use crate::admin;
use crate::invite::{self, InviteError};
use crate::storage::{self};
use crate::storage_types::{Event, Match, Prediction};
use crate::token::TokenHelper;

/// Errors returned by event joining and prediction operations.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum PredictionError {
    Paused = 1,
    InvalidInviteCode = 2,
    EventNotFound = 3,
    EventCancelled = 4,
    AlreadyJoined = 5,
    EventFull = 6,
    MatchNotFound = 7,
    NotJoined = 8,
    MatchStarted = 9,
    InvalidOutcome = 10,
    AlreadyPredicted = 11,
    PredictionNotFound = 12,
    Overflow = 13,
    InsufficientEntryFeeBalance = 14,
    /// The invite code's `expires_at` has passed (#1699).
    InviteCodeExpired = 15,
    /// The invite code has already been redeemed `max_uses` times (#1699).
    InviteCodeUsesExceeded = 16,
}

impl From<InviteError> for PredictionError {
    fn from(e: InviteError) -> Self {
        match e {
            InviteError::InvalidCode => PredictionError::InvalidInviteCode,
            InviteError::CodeExpired => PredictionError::InviteCodeExpired,
            InviteError::CodeUsesExceeded => PredictionError::InviteCodeUsesExceeded,
            InviteError::CodeGenerationFailed => PredictionError::InvalidInviteCode,
        }
    }
}

fn emit_user_joined(env: &Env, event_id: u64, user: &Address) {
    env.events().publish(
        (Symbol::new(env, "participant"), Symbol::new(env, "joined")),
        (event_id, user.clone()),
    );
}

fn emit_prediction_submitted(
    env: &Env,
    prediction_id: u64,
    match_id: u64,
    event_id: u64,
    predictor: &Address,
    predicted_outcome: &Symbol,
) {
    env.events().publish(
        (
            Symbol::new(env, "prediction"),
            Symbol::new(env, "submitted"),
        ),
        (
            prediction_id,
            match_id,
            event_id,
            predictor.clone(),
            predicted_outcome.clone(),
        ),
    );
}

fn user_already_predicted_match(
    env: &Env,
    predictor: &Address,
    event_id: u64,
    match_id: u64,
) -> bool {
    let prediction_ids = storage::get_user_predictions(env, predictor, event_id);
    for prediction_id in prediction_ids.iter() {
        if let Ok(prediction) = storage::get_prediction(env, prediction_id) {
            if prediction.match_id == match_id {
                return true;
            }
        }
    }

    false
}

/// Join an event with an invite code.
pub fn join_event(env: &Env, user: Address, invite_code: Symbol) -> Result<(), PredictionError> {
    user.require_auth();

    if admin::is_paused(env) {
        return Err(PredictionError::Paused);
    }

    // Atomically validates expiry/use-cap and increments `use_count` — see
    // `invite::redeem` (#1699).
    let now = env.ledger().timestamp();
    let event_id = invite::redeem(env, &invite_code, now)?;

    let mut event: Event =
        storage::get_event(env, event_id).map_err(|_| PredictionError::EventNotFound)?;

    if !event.is_active || event.is_cancelled {
        return Err(PredictionError::EventCancelled);
    }

    let participants = storage::get_event_participants(env, event_id);
    if participants.iter().any(|participant| participant == user) {
        return Err(PredictionError::AlreadyJoined);
    }

    if event.max_participants > 0 && event.participant_count >= event.max_participants {
        return Err(PredictionError::EventFull);
    }

    // Collect the entry fee (if any) before mutating any state, so a user who
    // cannot cover the fee is rejected without a partial join.
    let entry_fee = event.entry_fee;
    if entry_fee > 0 {
        let xlm_token = admin::get_xlm_token(env).unwrap_or_else(|| panic!("not_initialized"));

        if !TokenHelper::has_sufficient_balance(env, &xlm_token, &user, entry_fee) {
            return Err(PredictionError::InsufficientEntryFeeBalance);
        }

        // Compute the grown pool before moving funds so an (effectively
        // unreachable) overflow aborts before any transfer occurs.
        let new_prize_pool = event
            .prize_pool
            .checked_add(entry_fee)
            .ok_or(PredictionError::Overflow)?;

        // Escrow the fee from the user into the contract address.
        TokenClient::new(env, &xlm_token).transfer(
            &user,
            &env.current_contract_address(),
            &entry_fee,
        );

        event.prize_pool = new_prize_pool;
    }

    storage::add_event_participant(env, event_id, &user);
    event.participant_count = event
        .participant_count
        .checked_add(1)
        .ok_or(PredictionError::Overflow)?;
    storage::set_event(env, event_id, &event);

    emit_user_joined(env, event_id, &user);

    Ok(())
}

/// Submit a prediction for a match inside a joined event.
///
/// Takes a predicted scoreline (home_score, away_score) and derives the
/// predicted outcome (1X2 result) from it.
pub fn submit_prediction(
    env: &Env,
    predictor: Address,
    match_id: u64,
    predicted_home_score: u32,
    predicted_away_score: u32,
) -> Result<u64, PredictionError> {
    predictor.require_auth();

    if admin::is_paused(env) {
        return Err(PredictionError::Paused);
    }

    let match_record: Match =
        storage::get_match(env, match_id).map_err(|_| PredictionError::MatchNotFound)?;
    let event: Event = storage::get_event(env, match_record.event_id)
        .map_err(|_| PredictionError::EventNotFound)?;

    if !event.is_active || event.is_cancelled {
        return Err(PredictionError::EventCancelled);
    }

    let participants = storage::get_event_participants(env, event.event_id);
    if !participants
        .iter()
        .any(|participant| participant == predictor)
    {
        return Err(PredictionError::NotJoined);
    }

    // Predictions close at the match's stored `prediction_lock_time`
    // (`match_time` minus the configured lock lead-time at match creation),
    // not at `match_time` itself — this blocks late in-play betting on
    // near-certain outcomes right up to kickoff.
    let now = env.ledger().timestamp();
    if now >= match_record.prediction_lock_time {
        return Err(PredictionError::MatchStarted);
    }

    if user_already_predicted_match(env, &predictor, event.event_id, match_id) {
        return Err(PredictionError::AlreadyPredicted);
    }

    let prediction_id = storage::next_prediction_id(env);
    let prediction = Prediction::new(
        prediction_id,
        match_id,
        event.event_id,
        predictor.clone(),
        predicted_home_score,
        predicted_away_score,
        now,
        env,
    );

    storage::set_prediction(env, prediction_id, &prediction);
    storage::add_match_prediction(env, match_id, prediction_id);
    storage::add_user_prediction(env, &predictor, event.event_id, prediction_id);

    emit_prediction_submitted(
        env,
        prediction_id,
        match_id,
        event.event_id,
        &predictor,
        &prediction.predicted_outcome,
    );

    Ok(prediction_id)
}

/// Fetch a prediction by ID and extend its TTL on read.
pub fn get_prediction(env: &Env, prediction_id: u64) -> Result<Prediction, PredictionError> {
    storage::get_prediction(env, prediction_id).map_err(|_| PredictionError::PredictionNotFound)
}

/// Retrieve all predictions a user has made for a specific event, sorted by
/// `predicted_at` timestamp in ascending order (earliest first).
///
/// Returns an empty `Vec` when the user has made no predictions for the event.
/// Predictions from other events are never included.
///
/// # Sorting behaviour
/// The returned `Vec` is sorted by `predicted_at` ascending.  Because
/// predictions are appended in submission order and each ledger timestamp is
/// monotonically non-decreasing, the list is almost always already sorted;
/// the explicit sort guarantees correctness even if two predictions share the
/// same timestamp.
pub fn get_user_predictions(env: &Env, user: Address, event_id: u64) -> Vec<Prediction> {
    let prediction_ids = storage::get_user_predictions(env, &user, event_id);

    let mut predictions: Vec<Prediction> = Vec::new(env);
    for prediction_id in prediction_ids.iter() {
        if let Ok(prediction) = storage::get_prediction(env, prediction_id) {
            predictions.push_back(prediction);
        }
    }

    // Sort by predicted_at ascending (insertion-sort — list is typically small
    // and already nearly sorted, so O(n²) worst-case is acceptable here).
    let len = predictions.len();
    for i in 1..len {
        let mut j = i;
        while j > 0 {
            let prev = predictions.get(j - 1).unwrap();
            let curr = predictions.get(j).unwrap();
            if prev.predicted_at > curr.predicted_at {
                predictions.set(j - 1, curr);
                predictions.set(j, prev);
                j -= 1;
            } else {
                break;
            }
        }
    }

    predictions
}

/// Retrieve every prediction submitted for a specific match.
///
/// Reads the `MatchPredictions(match_id)` index of prediction IDs, loads each
/// `Prediction` struct, and returns them as a `Vec<Prediction>` in submission
/// order (the order in which predictions were placed).
///
/// Returns an empty `Vec` when the match has no predictions — including for a
/// `match_id` that does not exist, since no prediction index is stored for it.
/// Useful for analytics and displaying a match's full prediction distribution.
pub fn get_match_predictions(env: &Env, match_id: u64) -> Vec<Prediction> {
    let prediction_ids = storage::get_match_predictions(env, match_id);

    let mut predictions: Vec<Prediction> = Vec::new(env);
    for prediction_id in prediction_ids.iter() {
        if let Ok(prediction) = storage::get_prediction(env, prediction_id) {
            predictions.push_back(prediction);
        }
    }

    predictions
}

/// Calculate how many users predicted each outcome for a match.
///
/// Returns a tuple `(team_a_count, team_b_count, draw_count)` where each
/// element is the number of predictions for that outcome.  All three counts
/// are always present; outcomes with no predictions return `0`.
///
/// # Return format
/// `(team_a_count: u32, team_b_count: u32, draw_count: u32)`
pub fn get_prediction_distribution(env: &Env, match_id: u64) -> (u32, u32, u32) {
    let prediction_ids = storage::get_match_predictions(env, match_id);

    let team_a_sym = Symbol::new(env, crate::storage_types::OUTCOME_TEAM_A);
    let team_b_sym = Symbol::new(env, crate::storage_types::OUTCOME_TEAM_B);
    let draw_sym = Symbol::new(env, crate::storage_types::OUTCOME_DRAW);

    let mut team_a_count: u32 = 0;
    let mut team_b_count: u32 = 0;
    let mut draw_count: u32 = 0;

    for prediction_id in prediction_ids.iter() {
        if let Ok(prediction) = storage::get_prediction(env, prediction_id) {
            if prediction.predicted_outcome == team_a_sym {
                team_a_count += 1;
            } else if prediction.predicted_outcome == team_b_sym {
                team_b_count += 1;
            } else if prediction.predicted_outcome == draw_sym {
                draw_count += 1;
            }
        }
    }

    (team_a_count, team_b_count, draw_count)
}
