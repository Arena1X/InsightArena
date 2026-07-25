/// Storage helper functions for the CreatorEventManager contract.
///
/// All reads extend the TTL of the accessed entry by one year (~6_307_200 ledgers
/// at ~5 s/ledger).  All writes apply the same TTL so freshly written entries
/// do not expire before they can be read.
///
/// Counter helpers return the *new* value after incrementing so callers can use
/// the returned ID immediately.
use soroban_sdk::{Address, Env, Vec};

use crate::storage_types::{
    DataKey, Event, Match, ParticipantScore, Prediction, PrizeAllocation, StandingEntry,
};

// ---------------------------------------------------------------------------
// TTL constant
// ---------------------------------------------------------------------------

/// Extend storage entries by approximately one year (in ledgers).
/// Soroban ledgers close roughly every 5 seconds:
///   365 days × 24 h × 3600 s / 5 s ≈ 6_307_200 ledgers.
pub const TTL_LEDGERS: u32 = 6_307_200;

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

/// Errors returned by storage helpers.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum StorageError {
    /// The requested key does not exist in storage.
    NotFound,
}

// ---------------------------------------------------------------------------
// Event helpers
// ---------------------------------------------------------------------------

/// Read an `Event` from persistent storage. Extends the TTL on success.
pub fn get_event(env: &Env, event_id: u64) -> Result<Event, StorageError> {
    let key = DataKey::Event(event_id);
    match env.storage().persistent().get::<DataKey, Event>(&key) {
        Some(event) => {
            env.storage()
                .persistent()
                .extend_ttl(&key, TTL_LEDGERS, TTL_LEDGERS);
            Ok(event)
        }
        None => Err(StorageError::NotFound),
    }
}

/// Write an `Event` to persistent storage and set its TTL.
pub fn set_event(env: &Env, event_id: u64, event: &Event) {
    let key = DataKey::Event(event_id);
    env.storage().persistent().set(&key, event);
    env.storage()
        .persistent()
        .extend_ttl(&key, TTL_LEDGERS, TTL_LEDGERS);
}

// ---------------------------------------------------------------------------
// Match helpers
// ---------------------------------------------------------------------------

/// Read a `Match` from persistent storage. Extends the TTL on success.
pub fn get_match(env: &Env, match_id: u64) -> Result<Match, StorageError> {
    let key = DataKey::Match(match_id);
    match env.storage().persistent().get::<DataKey, Match>(&key) {
        Some(m) => {
            env.storage()
                .persistent()
                .extend_ttl(&key, TTL_LEDGERS, TTL_LEDGERS);
            Ok(m)
        }
        None => Err(StorageError::NotFound),
    }
}

/// Write a `Match` to persistent storage and set its TTL.
pub fn set_match(env: &Env, match_id: u64, m: &Match) {
    let key = DataKey::Match(match_id);
    env.storage().persistent().set(&key, m);
    env.storage()
        .persistent()
        .extend_ttl(&key, TTL_LEDGERS, TTL_LEDGERS);
}

// ---------------------------------------------------------------------------
// Prediction helpers
// ---------------------------------------------------------------------------

/// Read a `Prediction` from persistent storage. Extends the TTL on success.
pub fn get_prediction(env: &Env, prediction_id: u64) -> Result<Prediction, StorageError> {
    let key = DataKey::Prediction(prediction_id);
    match env.storage().persistent().get::<DataKey, Prediction>(&key) {
        Some(pred) => {
            env.storage()
                .persistent()
                .extend_ttl(&key, TTL_LEDGERS, TTL_LEDGERS);
            Ok(pred)
        }
        None => Err(StorageError::NotFound),
    }
}

/// Write a `Prediction` to persistent storage and set its TTL.
pub fn set_prediction(env: &Env, prediction_id: u64, prediction: &Prediction) {
    let key = DataKey::Prediction(prediction_id);
    env.storage().persistent().set(&key, prediction);
    env.storage()
        .persistent()
        .extend_ttl(&key, TTL_LEDGERS, TTL_LEDGERS);
}

// ---------------------------------------------------------------------------
// Counter helpers
// ---------------------------------------------------------------------------

/// Increment the global event counter and return the new value (starts at 1).
pub fn next_event_id(env: &Env) -> u64 {
    let key = DataKey::EventCounter(0);
    let current: u64 = env
        .storage()
        .instance()
        .get::<DataKey, u64>(&key)
        .unwrap_or(0);
    let next = current + 1;
    env.storage().instance().set(&key, &next);
    next
}

/// Increment the global match counter and return the new value (starts at 1).
pub fn next_match_id(env: &Env) -> u64 {
    let key = DataKey::MatchCounter(0);
    let current: u64 = env
        .storage()
        .instance()
        .get::<DataKey, u64>(&key)
        .unwrap_or(0);
    let next = current + 1;
    env.storage().instance().set(&key, &next);
    next
}

/// Increment the global prediction counter and return the new value (starts at 1).
pub fn next_prediction_id(env: &Env) -> u64 {
    let key = DataKey::PredictionCounter(0);
    let current: u64 = env
        .storage()
        .instance()
        .get::<DataKey, u64>(&key)
        .unwrap_or(0);
    let next = current + 1;
    env.storage().instance().set(&key, &next);
    next
}

// ---------------------------------------------------------------------------
// Batch / list helpers
// ---------------------------------------------------------------------------

/// Return the list of match IDs for an event, or an empty Vec if none exist.
pub fn get_event_matches(env: &Env, event_id: u64) -> Vec<u64> {
    let key = DataKey::EventMatches(event_id);
    match env.storage().persistent().get::<DataKey, Vec<u64>>(&key) {
        Some(list) => {
            env.storage()
                .persistent()
                .extend_ttl(&key, TTL_LEDGERS, TTL_LEDGERS);
            list
        }
        None => Vec::new(env),
    }
}

/// Append a match ID to the event's match list.
pub fn add_event_match(env: &Env, event_id: u64, match_id: u64) {
    let key = DataKey::EventMatches(event_id);
    let mut list = get_event_matches(env, event_id);
    list.push_back(match_id);
    env.storage().persistent().set(&key, &list);
    env.storage()
        .persistent()
        .extend_ttl(&key, TTL_LEDGERS, TTL_LEDGERS);
}

/// Return the list of prediction IDs for a match, or an empty Vec if none exist.
pub fn get_match_predictions(env: &Env, match_id: u64) -> Vec<u64> {
    let key = DataKey::MatchPredictions(match_id);
    match env.storage().persistent().get::<DataKey, Vec<u64>>(&key) {
        Some(list) => {
            env.storage()
                .persistent()
                .extend_ttl(&key, TTL_LEDGERS, TTL_LEDGERS);
            list
        }
        None => Vec::new(env),
    }
}

/// Append a prediction ID to the match's prediction list.
pub fn add_match_prediction(env: &Env, match_id: u64, prediction_id: u64) {
    let key = DataKey::MatchPredictions(match_id);
    let mut list = get_match_predictions(env, match_id);
    list.push_back(prediction_id);
    env.storage().persistent().set(&key, &list);
    env.storage()
        .persistent()
        .extend_ttl(&key, TTL_LEDGERS, TTL_LEDGERS);
}

/// Return the list of prediction IDs a user has placed in an event.
pub fn get_user_predictions(env: &Env, user: &Address, event_id: u64) -> Vec<u64> {
    let key = DataKey::UserPredictions(user.clone(), event_id);
    match env.storage().persistent().get::<DataKey, Vec<u64>>(&key) {
        Some(list) => {
            env.storage()
                .persistent()
                .extend_ttl(&key, TTL_LEDGERS, TTL_LEDGERS);
            list
        }
        None => Vec::new(env),
    }
}

/// Append a prediction ID to the user's prediction list for an event.
pub fn add_user_prediction(env: &Env, user: &Address, event_id: u64, prediction_id: u64) {
    let key = DataKey::UserPredictions(user.clone(), event_id);
    let mut list = get_user_predictions(env, user, event_id);
    list.push_back(prediction_id);
    env.storage().persistent().set(&key, &list);
    env.storage()
        .persistent()
        .extend_ttl(&key, TTL_LEDGERS, TTL_LEDGERS);
}

/// Return the list of participant addresses for an event.
pub fn get_event_participants(env: &Env, event_id: u64) -> Vec<Address> {
    let key = DataKey::EventParticipants(event_id);
    match env
        .storage()
        .persistent()
        .get::<DataKey, Vec<Address>>(&key)
    {
        Some(list) => {
            env.storage()
                .persistent()
                .extend_ttl(&key, TTL_LEDGERS, TTL_LEDGERS);
            list
        }
        None => Vec::new(env),
    }
}

/// Append a participant address to the event's participant list.
pub fn add_event_participant(env: &Env, event_id: u64, participant: &Address) {
    let key = DataKey::EventParticipants(event_id);
    let mut list = get_event_participants(env, event_id);
    list.push_back(participant.clone());
    env.storage().persistent().set(&key, &list);
    env.storage()
        .persistent()
        .extend_ttl(&key, TTL_LEDGERS, TTL_LEDGERS);
}

// ---------------------------------------------------------------------------
// Weighted standings helpers (#1311)
// ---------------------------------------------------------------------------

/// Read a participant's stored weighted score components, or `None` if the
/// participant has never been scored for this event.
pub fn get_participant_score(env: &Env, event_id: u64, user: &Address) -> Option<ParticipantScore> {
    let key = DataKey::ParticipantScore(user.clone(), event_id);
    match env
        .storage()
        .persistent()
        .get::<DataKey, ParticipantScore>(&key)
    {
        Some(score) => {
            env.storage()
                .persistent()
                .extend_ttl(&key, TTL_LEDGERS, TTL_LEDGERS);
            Some(score)
        }
        None => None,
    }
}

/// Write a participant's weighted score components and set the TTL.
pub fn set_participant_score(env: &Env, score: &ParticipantScore) {
    let key = DataKey::ParticipantScore(score.user.clone(), score.event_id);
    env.storage().persistent().set(&key, score);
    env.storage()
        .persistent()
        .extend_ttl(&key, TTL_LEDGERS, TTL_LEDGERS);
}

/// Read the stored weighted standings snapshot for an event, or an empty Vec
/// if standings have never been computed.
pub fn get_event_standings(env: &Env, event_id: u64) -> Vec<StandingEntry> {
    let key = DataKey::EventStandings(event_id);
    match env
        .storage()
        .persistent()
        .get::<DataKey, Vec<StandingEntry>>(&key)
    {
        Some(list) => {
            env.storage()
                .persistent()
                .extend_ttl(&key, TTL_LEDGERS, TTL_LEDGERS);
            list
        }
        None => Vec::new(env),
    }
}

/// Write the weighted standings snapshot for an event and set the TTL.
pub fn set_event_standings(env: &Env, event_id: u64, standings: &Vec<StandingEntry>) {
    let key = DataKey::EventStandings(event_id);
    env.storage().persistent().set(&key, standings);
    env.storage()
        .persistent()
        .extend_ttl(&key, TTL_LEDGERS, TTL_LEDGERS);
}

// ---------------------------------------------------------------------------
// Staged prize claims & clawback helpers (#1312)
// ---------------------------------------------------------------------------

/// Read a winner's staged prize allocation for an event, or `None` if this
/// winner was never allocated a prize for the event.
pub fn get_prize_allocation(env: &Env, event_id: u64, winner: &Address) -> Option<PrizeAllocation> {
    let key = DataKey::PrizeAllocation(winner.clone(), event_id);
    match env
        .storage()
        .persistent()
        .get::<DataKey, PrizeAllocation>(&key)
    {
        Some(allocation) => {
            env.storage()
                .persistent()
                .extend_ttl(&key, TTL_LEDGERS, TTL_LEDGERS);
            Some(allocation)
        }
        None => None,
    }
}

/// Write a winner's prize allocation and set its TTL.
pub fn set_prize_allocation(env: &Env, allocation: &PrizeAllocation) {
    let key = DataKey::PrizeAllocation(allocation.winner.clone(), allocation.event_id);
    env.storage().persistent().set(&key, allocation);
    env.storage()
        .persistent()
        .extend_ttl(&key, TTL_LEDGERS, TTL_LEDGERS);
}

/// Read an event's claim deadline, or `None` if the event has not been
/// finalized yet (no deadline has been recorded).
pub fn get_claim_deadline(env: &Env, event_id: u64) -> Option<u64> {
    let key = DataKey::ClaimDeadline(event_id);
    match env.storage().persistent().get::<DataKey, u64>(&key) {
        Some(deadline) => {
            env.storage()
                .persistent()
                .extend_ttl(&key, TTL_LEDGERS, TTL_LEDGERS);
            Some(deadline)
        }
        None => None,
    }
}

/// Write an event's claim deadline and set its TTL.
pub fn set_claim_deadline(env: &Env, event_id: u64, deadline: u64) {
    let key = DataKey::ClaimDeadline(event_id);
    env.storage().persistent().set(&key, &deadline);
    env.storage()
        .persistent()
        .extend_ttl(&key, TTL_LEDGERS, TTL_LEDGERS);
}

// ---------------------------------------------------------------------------
// M-of-N event verification helpers (#1358)
// ---------------------------------------------------------------------------

/// Return the list of distinct verifier signers who have submitted
/// verification for an event, or an empty Vec if none have yet.
pub fn get_event_verification_signers(env: &Env, event_id: u64) -> Vec<Address> {
    let key = DataKey::EventVerificationSigners(event_id);
    match env.storage().persistent().get::<DataKey, Vec<Address>>(&key) {
        Some(list) => {
            env.storage()
                .persistent()
                .extend_ttl(&key, TTL_LEDGERS, TTL_LEDGERS);
            list
        }
        None => Vec::new(env),
    }
}

/// Append a verifier signer to an event's verification list and set the TTL.
pub fn add_event_verification_signer(env: &Env, event_id: u64, signer: &Address) {
    let key = DataKey::EventVerificationSigners(event_id);
    let mut list = get_event_verification_signers(env, event_id);
    list.push_back(signer.clone());
    env.storage().persistent().set(&key, &list);
    env.storage()
        .persistent()
        .extend_ttl(&key, TTL_LEDGERS, TTL_LEDGERS);
}
