use soroban_sdk::{token::Client as TokenClient, Address, Env, String, Symbol, Vec};

/// Maximum number of events returned per page.
const MAX_LIST_LIMIT: u32 = 50;

use crate::admin;
use crate::invite::{self, InviteError};
use crate::storage::{self, TTL_LEDGERS};
use crate::storage_types::{DataKey, Event, MAX_DESCRIPTION_LEN, MAX_TITLE_LEN};

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum EventError {
    /// Contract is paused; no new events may be created.
    Paused = 1,
    /// Title is empty or exceeds 200 characters.
    InvalidTitle = 2,
    /// Description is empty or exceeds 1000 characters.
    InvalidDescription = 3,
    /// max_participants must be greater than zero.
    InvalidMaxParticipants = 4,
    /// Creator's XLM balance is below the creation fee.
    InsufficientFee = 5,
    /// Token transfer from creator to treasury failed.
    TransferFailed = 6,
    /// No event found for the given event_id.
    EventNotFound = 7,
    /// No event found for the given invite code.
    InvalidInviteCode = 8,
    /// Could not generate a unique invite code after 10 attempts.
    CodeGenerationFailed = 9,
}

impl From<InviteError> for EventError {
    fn from(e: InviteError) -> Self {
        match e {
            InviteError::CodeGenerationFailed => EventError::CodeGenerationFailed,
        }
    }
}

// ---------------------------------------------------------------------------
// create_event (#794)
// ---------------------------------------------------------------------------

/// Create a new prediction event by paying the XLM creation fee.
///
/// # Flow
/// 1. Require creator's authorization.
/// 2. Reject if the contract is paused.
/// 3. Validate title (1–200 chars) and description (1–1000 chars).
/// 4. Validate `max_participants > 0`.
/// 5. Check creator has sufficient XLM balance for the creation fee.
/// 6. Transfer the fee from creator to treasury.
/// 7. Assign a new `event_id` via the global counter.
/// 8. Generate a unique 8-character invite code.
/// 9. Persist the `Event`, empty participant list, empty match list, and the
///    invite-code → event_id reverse index.
/// 10. Emit an `EventCreated` event.
/// 11. Return `(event_id, invite_code)`.
pub fn create_event(
    env: &Env,
    creator: Address,
    title: String,
    description: String,
    max_participants: u32,
) -> Result<(u64, Symbol), EventError> {
    creator.require_auth();

    if admin::is_paused(env) {
        return Err(EventError::Paused);
    }

    // Validate title: 1–200 chars.
    if title.len() == 0 || title.len() > MAX_TITLE_LEN {
        return Err(EventError::InvalidTitle);
    }

    // Validate description: 1–1000 chars.
    if description.len() == 0 || description.len() > MAX_DESCRIPTION_LEN {
        return Err(EventError::InvalidDescription);
    }

    if max_participants == 0 {
        return Err(EventError::InvalidMaxParticipants);
    }

    let fee = admin::get_creation_fee(env).unwrap_or_else(|| panic!("not_initialized"));
    let treasury = admin::get_treasury(env).unwrap_or_else(|| panic!("not_initialized"));
    let xlm_token = admin::get_xlm_token(env).unwrap_or_else(|| panic!("not_initialized"));

    let token_client = TokenClient::new(env, &xlm_token);

    if token_client.balance(&creator) < fee {
        return Err(EventError::InsufficientFee);
    }

    // Transfer creation fee from creator to treasury.
    token_client.transfer(&creator, &treasury, &fee);

    let event_id = storage::next_event_id(env);
    let invite_code = invite::generate_invite_code(env).map_err(EventError::from)?;

    let event = Event::new(
        event_id,
        creator.clone(),
        title,
        description,
        fee,
        env.ledger().timestamp(),
        invite_code.clone(),
        max_participants,
    );

    storage::set_event(env, event_id, &event);

    // Initialise empty participant and match lists.
    let participants_key = DataKey::EventParticipants(event_id);
    env.storage()
        .persistent()
        .set(&participants_key, &Vec::<Address>::new(env));
    env.storage()
        .persistent()
        .extend_ttl(&participants_key, TTL_LEDGERS, TTL_LEDGERS);

    let matches_key = DataKey::EventMatches(event_id);
    env.storage()
        .persistent()
        .set(&matches_key, &Vec::<u64>::new(env));
    env.storage()
        .persistent()
        .extend_ttl(&matches_key, TTL_LEDGERS, TTL_LEDGERS);

    // Store the invite-code → event_id reverse index.
    let invite_key = DataKey::InviteCode(invite_code.clone());
    env.storage().persistent().set(&invite_key, &event_id);
    env.storage()
        .persistent()
        .extend_ttl(&invite_key, TTL_LEDGERS, TTL_LEDGERS);

    env.events().publish(
        (Symbol::new(env, "event"), Symbol::new(env, "created")),
        (event_id, creator, invite_code.clone()),
    );

    Ok((event_id, invite_code))
}

// ---------------------------------------------------------------------------
// get_event (#796)
// ---------------------------------------------------------------------------

/// Retrieve an event by its ID.
///
/// Extends the TTL of the stored entry on every read.
/// Returns [`EventError::EventNotFound`] when the ID does not exist.
pub fn get_event(env: &Env, event_id: u64) -> Result<Event, EventError> {
    storage::get_event(env, event_id).map_err(|_| EventError::EventNotFound)
}

// ---------------------------------------------------------------------------
// get_event_by_code (#797)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// list_events (#799)
// ---------------------------------------------------------------------------

/// Return a paginated slice of all events.
///
/// `start` is a **0-based offset** into the ordered sequence of events (sorted
/// by creation order, i.e. ascending event_id).  `limit` is capped at 50 to
/// bound gas usage per call.
///
/// # Pagination behaviour
/// * Events are stored with IDs `1 … total_count`.
/// * Offset `start = 0` returns events 1 … limit.
/// * Offset `start = N` returns events N+1 … N+limit (clamped to total_count).
/// * When `start >= total_count` **or** when no events have been created yet,
///   an empty `Vec` is returned (not an error) so callers can detect the end of
///   the list without special-casing the first page.
pub fn list_events(env: &Env, start: u64, limit: u32) -> Vec<Event> {
    let total_count = storage::get_event_count(env);

    // Cap limit to prevent gas exhaustion.
    let limit = if limit > MAX_LIST_LIMIT {
        MAX_LIST_LIMIT
    } else {
        limit
    } as u64;

    let mut events = Vec::new(env);

    // Out-of-bounds or empty store — return empty list.
    if total_count == 0 || start >= total_count || limit == 0 {
        return events;
    }

    let end = (start + limit).min(total_count);

    // Event IDs are 1-indexed; offset i maps to event_id i+1.
    for i in start..end {
        let event_id = i + 1;
        if let Ok(event) = storage::get_event(env, event_id) {
            events.push_back(event);
        }
    }

    events
}

// ---------------------------------------------------------------------------
// get_event_by_code (#797)
// ---------------------------------------------------------------------------

/// Look up an event by its invite code.
///
/// Resolves the code through the `InviteCode` index to retrieve the event.
/// Returns [`EventError::InvalidInviteCode`] when the code is unknown, or
/// [`EventError::EventNotFound`] when the associated event is missing.
pub fn get_event_by_code(env: &Env, invite_code: Symbol) -> Result<Event, EventError> {
    let invite_key = DataKey::InviteCode(invite_code);
    let event_id: u64 = env
        .storage()
        .persistent()
        .get(&invite_key)
        .ok_or(EventError::InvalidInviteCode)?;

    storage::get_event(env, event_id).map_err(|_| EventError::EventNotFound)
}
