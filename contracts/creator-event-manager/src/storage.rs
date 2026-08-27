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
    CreatorVestingSchedule, DataKey, Event, FinalizationBond, Match, MatchResultSubmission,
    OracleSubmission, ParticipantScore, PendingMatchResult, Prediction, PrizeAllocation,
    StandingEntry,
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

// ---------------------------------------------------------------------------
// Multi-source oracle aggregation helpers (#1347)
// ---------------------------------------------------------------------------

/// Return the configured set of authorized oracle sources, or an empty Vec
/// if `oracle::configure_oracle_sources` has never been called.
pub fn get_oracle_sources(env: &Env) -> Vec<Address> {
    let key = DataKey::OracleSources;
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

/// Write the configured set of authorized oracle sources and set its TTL.
pub fn set_oracle_sources(env: &Env, sources: &Vec<Address>) {
    let key = DataKey::OracleSources;
    env.storage().persistent().set(&key, sources);
    env.storage()
        .persistent()
        .extend_ttl(&key, TTL_LEDGERS, TTL_LEDGERS);
}

/// Return the configured minimum oracle source count, or `0` if
/// `oracle::configure_oracle_sources` has never been called.
pub fn get_oracle_min_sources(env: &Env) -> u32 {
    let key = DataKey::OracleMinSources;
    match env.storage().persistent().get::<DataKey, u32>(&key) {
        Some(min_sources) => {
            env.storage()
                .persistent()
                .extend_ttl(&key, TTL_LEDGERS, TTL_LEDGERS);
            min_sources
        }
        None => 0,
    }
}

/// Write the configured minimum oracle source count and set its TTL.
pub fn set_oracle_min_sources(env: &Env, min_sources: u32) {
    let key = DataKey::OracleMinSources;
    env.storage().persistent().set(&key, &min_sources);
    env.storage()
        .persistent()
        .extend_ttl(&key, TTL_LEDGERS, TTL_LEDGERS);
}

/// Return every oracle submission recorded for a match, or an empty Vec if
/// none have been submitted yet. Extends the TTL on success.
pub fn get_oracle_submissions(env: &Env, match_id: u64) -> Vec<OracleSubmission> {
    let key = DataKey::OracleSubmissions(match_id);
    match env
        .storage()
        .persistent()
        .get::<DataKey, Vec<OracleSubmission>>(&key)
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

/// Append an oracle submission to a match's submission list and set the TTL.
pub fn add_oracle_submission(env: &Env, match_id: u64, submission: &OracleSubmission) {
    let key = DataKey::OracleSubmissions(match_id);
    let mut list = get_oracle_submissions(env, match_id);
    list.push_back(submission.clone());
    env.storage().persistent().set(&key, &list);
    env.storage()
        .persistent()
        .extend_ttl(&key, TTL_LEDGERS, TTL_LEDGERS);
}

// ---------------------------------------------------------------------------
// Oracle consensus result proposals (#1698)
// ---------------------------------------------------------------------------

/// Return every scoreline proposal recorded for a match's consensus round, or
/// an empty Vec if none have been submitted yet. Extends the TTL on success.
pub fn get_match_result_proposals(env: &Env, match_id: u64) -> Vec<MatchResultSubmission> {
    let key = DataKey::MatchResultProposals(match_id);
    match env
        .storage()
        .persistent()
        .get::<DataKey, Vec<MatchResultSubmission>>(&key)
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

/// Append a scoreline proposal to a match's consensus round and set the TTL.
pub fn add_match_result_proposal(env: &Env, match_id: u64, submission: &MatchResultSubmission) {
    let key = DataKey::MatchResultProposals(match_id);
    let mut list = get_match_result_proposals(env, match_id);
    list.push_back(submission.clone());
    env.storage().persistent().set(&key, &list);
    env.storage()
        .persistent()
        .extend_ttl(&key, TTL_LEDGERS, TTL_LEDGERS);
}

// ---------------------------------------------------------------------------
// Per-match M-of-N verifier threshold helpers (#1515)
// ---------------------------------------------------------------------------

/// Read a match's staged pending result, or `None` if no result is currently
/// awaiting verifier sign-off for it.
pub fn get_pending_match_result(env: &Env, match_id: u64) -> Option<PendingMatchResult> {
    let key = DataKey::PendingMatchResult(match_id);
    match env
        .storage()
        .persistent()
        .get::<DataKey, PendingMatchResult>(&key)
    {
        Some(pending) => {
            env.storage()
                .persistent()
                .extend_ttl(&key, TTL_LEDGERS, TTL_LEDGERS);
            Some(pending)
        }
        None => None,
    }
}

/// Write a match's staged pending result and set its TTL.
pub fn set_pending_match_result(env: &Env, pending: &PendingMatchResult) {
    let key = DataKey::PendingMatchResult(pending.match_id);
    env.storage().persistent().set(&key, pending);
    env.storage()
        .persistent()
        .extend_ttl(&key, TTL_LEDGERS, TTL_LEDGERS);
}

/// Remove a match's staged pending result once it has been finalized.
pub fn remove_pending_match_result(env: &Env, match_id: u64) {
    env.storage()
        .persistent()
        .remove(&DataKey::PendingMatchResult(match_id));
}

/// Return the list of distinct verifier signers who have submitted
/// verification for a match's pending result, or an empty Vec if none have
/// yet.
pub fn get_match_verification_signers(env: &Env, match_id: u64) -> Vec<Address> {
    let key = DataKey::MatchVerificationSigners(match_id);
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

/// Append a verifier signer to a match's verification list and set the TTL.
pub fn add_match_verification_signer(env: &Env, match_id: u64, signer: &Address) {
    let key = DataKey::MatchVerificationSigners(match_id);
    let mut list = get_match_verification_signers(env, match_id);
    list.push_back(signer.clone());
    env.storage().persistent().set(&key, &list);
    env.storage()
        .persistent()
        .extend_ttl(&key, TTL_LEDGERS, TTL_LEDGERS);
}

// ---------------------------------------------------------------------------
// Finalization bond helpers (#1344)
// ---------------------------------------------------------------------------

/// Read the finalization bond record for an event, if any.
pub fn get_finalization_bond(env: &Env, event_id: u64) -> Option<FinalizationBond> {
    let key = DataKey::FinalizationBond(event_id);
    match env
        .storage()
        .persistent()
        .get::<DataKey, FinalizationBond>(&key)
    {
        Some(bond) => {
            env.storage()
                .persistent()
                .extend_ttl(&key, TTL_LEDGERS, TTL_LEDGERS);
            Some(bond)
        }
        None => None,
    }
}

/// Persist a finalization bond record and set its TTL.
pub fn set_finalization_bond(env: &Env, bond: &FinalizationBond) {
    let key = DataKey::FinalizationBond(bond.event_id);
    env.storage().persistent().set(&key, bond);
    env.storage()
        .persistent()
        .extend_ttl(&key, TTL_LEDGERS, TTL_LEDGERS);
}

// ---------------------------------------------------------------------------
// Creator revenue share vesting helpers
// ---------------------------------------------------------------------------

/// Read a creator's staged vesting schedule for an event, or `None` if none
/// was ever staged (e.g. the event had no leftover revenue, or vesting was
/// not configured at finalization time).
pub fn get_creator_vesting(
    env: &Env,
    creator: &Address,
    event_id: u64,
) -> Option<CreatorVestingSchedule> {
    let key = DataKey::CreatorVesting(creator.clone(), event_id);
    match env
        .storage()
        .persistent()
        .get::<DataKey, CreatorVestingSchedule>(&key)
    {
        Some(schedule) => {
            env.storage()
                .persistent()
                .extend_ttl(&key, TTL_LEDGERS, TTL_LEDGERS);
            Some(schedule)
        }
        None => None,
    }
}

/// Write a creator's vesting schedule and set its TTL.
pub fn set_creator_vesting(env: &Env, schedule: &CreatorVestingSchedule) {
    let key = DataKey::CreatorVesting(schedule.creator.clone(), schedule.event_id);
    env.storage().persistent().set(&key, schedule);
    env.storage()
        .persistent()
        .extend_ttl(&key, TTL_LEDGERS, TTL_LEDGERS);
}
