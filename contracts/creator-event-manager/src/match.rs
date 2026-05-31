use soroban_sdk::{Env, Vec};

use crate::event::{self, EventError};
use crate::storage::{self};
use crate::storage_types::Match;

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
/// Results are sorted by `match_time` ascending using an insertion sort.
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
            if prev.match_time > curr.match_time {
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
