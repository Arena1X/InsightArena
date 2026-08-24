//! Read-only aggregate views for creator events.
//!
//! This module keeps derived, dashboard-friendly statistics out of mutation
//! paths so callers can inspect an event's participation, prediction volume,
//! and completion state in a single contract view.

use crate::event::{self, EventError};
use crate::storage;
use crate::storage_types::DataKey;
use soroban_sdk::{contracttype, Address, Env, Vec};

/// Aggregate statistics for one creator event.
///
/// Returned by `get_event_statistics(event_id)` as a compact summary of the
/// event's current on-chain state:
/// * `event_id` — event being summarized.
/// * `participant_count` — number of entries in the `EventParticipants`
///   source list (not the cached `Event.participant_count` counter).
/// * `match_count` — number of entries in the `EventMatches` source list
///   (not the cached `Event.match_count` counter).
/// * `total_predictions` — total predictions linked to all event matches.
/// * `all_matches_resolved` — `true` only when the event has at least one
///   match and every stored match has a submitted result.
///
/// # Consistency
/// `participant_count`, `match_count`, and `total_predictions` are derived
/// directly from the underlying storage lists on every call, so they always
/// reflect current on-chain state — they cannot drift even if a cached
/// counter elsewhere (e.g. `Event.participant_count`, used only for O(1)
/// capacity checks on `join_event`) were ever out of sync. `all_matches_resolved`
/// is a point-in-time read: a match resolved in the same ledger after this
/// view is read will not retroactively change an already-returned value.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EventStatistics {
    pub event_id: u64,
    pub participant_count: u32,
    pub match_count: u32,
    pub total_predictions: u32,
    pub all_matches_resolved: bool,
}

/// Public configuration snapshot for the contract.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Config {
    pub admin: Address,
    pub ai_agent: Address,
    pub treasury: Address,
    pub xlm_token: Address,
    pub creation_fee: i128,
    pub paused: bool,
}

/// Return all participant addresses for an existing event.
///
/// This view validates that `event_id` points to a stored event, then returns
/// the `EventParticipants(event_id)` storage index. Newly created events return
/// an empty `Vec` until users join through `join_event`.
pub fn get_event_participants(env: &Env, event_id: u64) -> Result<Vec<Address>, EventError> {
    event::get_event(env, event_id)?;
    Ok(storage::get_event_participants(env, event_id))
}

/// Return the escrowed prize pool (in stroops) for an existing event.
///
/// Validates that `event_id` exists, then returns the stored `prize_pool`.
/// A "fun event" (no payouts) returns `0`.
pub fn get_event_prize_pool(env: &Env, event_id: u64) -> Result<i128, EventError> {
    let event = event::get_event(env, event_id)?;
    Ok(event.prize_pool)
}

/// Return the reward distribution percentages for an existing event.
///
/// Validates that `event_id` exists, then returns the stored
/// `reward_distribution`. The vector is empty for a "fun event".
pub fn get_event_reward_distribution(env: &Env, event_id: u64) -> Result<Vec<u32>, EventError> {
    let event = event::get_event(env, event_id)?;
    Ok(event.reward_distribution)
}

/// Build aggregate statistics for an existing event.
///
/// The function first retrieves the event to validate that `event_id` exists,
/// then derives prediction totals from the event's match index and completion
/// status from each stored match result.
pub fn get_event_statistics(env: &Env, event_id: u64) -> Result<EventStatistics, EventError> {
    // Validate the event exists; statistics themselves are derived entirely
    // from source records below rather than from this record's cached
    // counters, so a churned event never reports stale figures.
    event::get_event(env, event_id)?;
    let match_ids = storage::get_event_matches(env, event_id);
    let participant_count = storage::get_event_participants(env, event_id).len();
    let match_count = match_ids.len();

    let mut total_predictions: u32 = 0;
    let mut resolved_matches: u32 = 0;

    for match_id in match_ids.iter() {
        total_predictions =
            total_predictions.saturating_add(storage::get_match_predictions(env, match_id).len());

        if let Ok(match_record) = storage::get_match(env, match_id) {
            if match_record.result_submitted {
                resolved_matches = resolved_matches.saturating_add(1);
            }
        }
    }

    let all_matches_resolved = match_count > 0 && resolved_matches == match_count;

    Ok(EventStatistics {
        event_id,
        participant_count,
        match_count,
        total_predictions,
        all_matches_resolved,
    })
}

/// Return the current contract configuration as a snapshot. Returns `Err` when
/// the contract has not been initialised.
pub fn get_config(env: &Env) -> Result<Config, &'static str> {
    let storage = env.storage().persistent();

    // Read canonical keys
    let admin_addr = storage
        .get::<DataKey, Address>(&DataKey::CurrentAdmin)
        .ok_or("not_initialized")?;
    let ai_agent = storage
        .get::<DataKey, Address>(&DataKey::CurrentAIAgent)
        .ok_or("not_initialized")?;
    let treasury = storage
        .get::<DataKey, Address>(&DataKey::CurrentTreasury)
        .ok_or("not_initialized")?;
    let xlm_token = storage
        .get::<DataKey, Address>(&DataKey::CurrentXLMToken)
        .ok_or("not_initialized")?;
    let creation_fee = storage
        .get::<DataKey, i128>(&DataKey::CreationFee(0))
        .ok_or("not_initialized")?;
    let paused = storage
        .get::<DataKey, bool>(&DataKey::Paused(false))
        .unwrap_or(false);

    Ok(Config {
        admin: admin_addr,
        ai_agent,
        treasury,
        xlm_token,
        creation_fee,
        paused,
    })
}

/// Return all event IDs that `user` has joined.
pub fn get_user_events(env: &Env, user: Address) -> Vec<u64> {
    // Read the current event counter (instance storage)
    let instance = env.storage().instance();
    let max_id: u64 = instance
        .get::<DataKey, u64>(&DataKey::EventCounter(0))
        .unwrap_or(0);

    let mut out = Vec::new(env);
    for id in 1..=max_id {
        let participants = storage::get_event_participants(env, id);
        // scan participants for the user
        for i in 0..participants.len() {
            if participants.get(i).unwrap() == user {
                out.push_back(id);
                break;
            }
        }
    }

    out
}

/// Return the count of events that `user` has joined.
///
/// Lightweight alternative to `get_user_events` for dashboards that display
/// only a "X events joined" badge. Returns 0 for unknown users.
pub fn get_user_joined_events_count(env: &Env, user: Address) -> u32 {
    get_user_events(env, user).len()
}

/// Return the resolved 1-based leaderboard rank for `user` in `event_id`.
///
/// Delegates to [`crate::leaderboard::get_user_rank`] so the rank exposed by
/// this view is identical to the rank embedded on each [`LeaderboardEntry`]
/// (#1343). Returns `0` when the user is not a participant.
pub fn get_user_rank(env: &Env, event_id: u64, user: Address) -> Result<u32, EventError> {
    crate::leaderboard::get_user_rank(env, event_id, user).map_err(|_| EventError::EventNotFound)
}

/// Platform-wide statistics aggregated across all events.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PlatformStatistics {
    pub total_events: u64,
    pub total_matches: u64,
    pub total_predictions: u64,
    pub unique_participants: u32,
    pub total_fees_collected: i128,
}

/// Get platform-wide statistics.
///
/// Aggregates data across all events to provide a comprehensive view of
/// platform activity including total events, matches, predictions, unique
/// participants, and fees collected.
///
/// # Consistency
/// `total_events`, `total_matches`, and `total_predictions` read the
/// monotonically-incrementing `EventCounter` / `MatchCounter` /
/// `PredictionCounter` instance values. These counters are themselves the
/// source of truth for ID assignment (every `next_*_id` call both allocates
/// an ID and advances the counter in the same write), so unlike a
/// denormalized cache they cannot drift from the records they describe —
/// reconciling them against a full per-event scan would be strictly more
/// expensive with no consistency benefit. `unique_participants` and
/// `total_fees_collected` are computed by scanning every event's source
/// `EventParticipants` list and `creation_fee_paid` field on each call, so
/// they always reflect current state at read time.
///
/// # Returns
/// `PlatformStatistics` struct with aggregated platform data.
pub fn get_platform_statistics(env: &Env) -> PlatformStatistics {
    let instance = env.storage().instance();

    // Get counters
    let total_events = instance
        .get::<DataKey, u64>(&DataKey::EventCounter(0))
        .unwrap_or(0);

    let total_matches = instance
        .get::<DataKey, u64>(&DataKey::MatchCounter(0))
        .unwrap_or(0);

    let total_predictions = instance
        .get::<DataKey, u64>(&DataKey::PredictionCounter(0))
        .unwrap_or(0);

    // Calculate unique participants across all events
    let mut unique_participants_set: Vec<Address> = Vec::new(env);
    let mut total_fees_collected: i128 = 0;

    for event_id in 1..=total_events {
        if let Ok(event) = storage::get_event(env, event_id) {
            // Accumulate fees
            total_fees_collected = total_fees_collected.saturating_add(event.creation_fee_paid);

            // Track unique participants
            let participants = storage::get_event_participants(env, event_id);
            for participant in participants.iter() {
                let mut found = false;
                for i in 0..unique_participants_set.len() {
                    if unique_participants_set.get(i).unwrap() == participant {
                        found = true;
                        break;
                    }
                }
                if !found {
                    unique_participants_set.push_back(participant);
                }
            }
        }
    }

    PlatformStatistics {
        total_events,
        total_matches,
        total_predictions,
        unique_participants: unique_participants_set.len(),
        total_fees_collected,
    }
}

/// Return the total number of events created on the platform.
///
/// Reads `DataKey::EventCounter` from instance storage. Returns `0` before
/// any events are created or before initialization.
pub fn get_event_count(env: &Env) -> u64 {
    env.storage()
        .instance()
        .get::<DataKey, u64>(&DataKey::EventCounter(0))
        .unwrap_or(0)
}

/// Check whether a single event has been finalized.
///
/// Returns `Ok(bool)` representing the event's `is_finalized` flag.
/// Returns `Err(EventError::EventNotFound)` if the event ID does not exist.
pub fn is_event_finalized(env: &Env, event_id: u64) -> Result<bool, EventError> {
    let event = event::get_event(env, event_id)?;
    Ok(event.is_finalized)
}
