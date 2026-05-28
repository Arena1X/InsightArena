use soroban_sdk::{Address, Env, String, Symbol};

use crate::admin;
use crate::storage;
use crate::storage_types::{Match, MAX_TEAM_NAME_LEN};

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum MatchError {
    /// Contract is paused; no matches may be added.
    Paused = 1,
    /// Caller is not the event creator.
    Unauthorized = 2,
    /// No event found for the given event_id.
    EventNotFound = 3,
    /// Event has been cancelled; no new matches can be added.
    EventCancelled = 4,
    /// Team name is empty or exceeds 100 characters.
    InvalidTeamName = 5,
    /// Both teams have the same name.
    DuplicateTeam = 6,
    /// match_time is not in the future.
    InvalidMatchTime = 7,
}

// ---------------------------------------------------------------------------
// add_match (#800)
// ---------------------------------------------------------------------------

/// Add a new prediction match to an existing event.
///
/// # Flow
/// 1. Require creator's authorisation.
/// 2. Reject if the contract is paused.
/// 3. Load the event; reject if it does not exist.
/// 4. Verify the caller is the event creator.
/// 5. Reject if the event is cancelled.
/// 6. Validate `team_a` length (1–100 chars).
/// 7. Validate `team_b` length (1–100 chars).
/// 8. Reject if `team_a == team_b`.
/// 9. Reject if `match_time` is not strictly in the future.
/// 10. Assign a new `match_id` via the global counter.
/// 11. Persist the `Match` and link it to the event's match list.
/// 12. Increment `event.match_count` and update the event in storage.
/// 13. Emit a `MatchAdded` event.
/// 14. Return `match_id`.
pub fn add_match(
    env: &Env,
    creator: Address,
    event_id: u64,
    team_a: String,
    team_b: String,
    match_time: u64,
) -> Result<u64, MatchError> {
    creator.require_auth();

    if admin::is_paused(env) {
        return Err(MatchError::Paused);
    }

    let mut event = storage::get_event(env, event_id).map_err(|_| MatchError::EventNotFound)?;

    if event.creator != creator {
        return Err(MatchError::Unauthorized);
    }

    if event.is_cancelled {
        return Err(MatchError::EventCancelled);
    }

    // Validate team_a: 1–100 chars.
    if team_a.len() == 0 || team_a.len() > MAX_TEAM_NAME_LEN {
        return Err(MatchError::InvalidTeamName);
    }

    // Validate team_b: 1–100 chars.
    if team_b.len() == 0 || team_b.len() > MAX_TEAM_NAME_LEN {
        return Err(MatchError::InvalidTeamName);
    }

    // Teams must be distinct.
    if team_a == team_b {
        return Err(MatchError::DuplicateTeam);
    }

    // match_time must be strictly in the future.
    if match_time <= env.ledger().timestamp() {
        return Err(MatchError::InvalidMatchTime);
    }

    let match_id = storage::next_match_id(env);
    let m = Match::new(match_id, event_id, team_a, team_b, match_time);

    storage::set_match(env, match_id, &m);
    storage::add_event_match(env, event_id, match_id);

    event.add_match();
    storage::set_event(env, event_id, &event);

    env.events().publish(
        (Symbol::new(env, "match"), Symbol::new(env, "added")),
        (match_id, event_id, creator),
    );

    Ok(match_id)
}
