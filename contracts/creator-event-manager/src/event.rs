use soroban_sdk::{token::Client as TokenClient, Address, Env, String, Symbol, Vec};

use crate::admin;
use crate::invite::{self, InviteError};
use crate::storage::{self, TTL_LEDGERS};
use crate::storage_types::{
    DataKey, Event, InviteCodeData, MAX_DESCRIPTION_LEN, MAX_EVENT_DURATION_SECONDS,
    MAX_REWARD_RANKS, MAX_TITLE_LEN, REWARD_PERCENT_TOTAL,
};

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
    /// end_time <= start_time
    InvalidTimeRange = 10,
    /// start_time < env.ledger().timestamp()
    EventStartInPast = 11,
    /// (end_time - start_time) exceeds MAX_EVENT_DURATION_SECONDS
    EventDurationTooLong = 12,
    /// prize_pool < 0
    InvalidPrizePool = 13,
    /// reward_distribution is malformed (see `validate_reward_distribution`).
    InvalidRewardDistribution = 14,
    /// Creator's XLM balance is below the requested prize_pool.
    InsufficientPrizePoolFunds = 15,
    /// finalize_event called before the event's end_time has passed.
    EventNotEnded = 16,
    /// finalize_event called while at least one match is still unresolved.
    MatchesNotComplete = 17,
    /// finalize_event called on an event that has already been finalized.
    AlreadyFinalized = 18,
    /// Operation rejected because the event has been cancelled.
    EventCancelled = 19,
    /// entry_fee < 0
    InvalidEntryFee = 20,
    /// Caller is not the event creator.
    Unauthorized = 21,
    /// claim_prize / clawback_unclaimed called before the event is finalized.
    EventNotFinalized = 22,
    /// claim_prize called for an address with no recorded prize allocation.
    NoAllocation = 23,
    /// Second settlement of the same allocation — either a repeat claim, or a
    /// claim attempted after clawback_unclaimed already swept it.
    AlreadyClaimed = 24,
    /// clawback_unclaimed called before the event's claim deadline has passed.
    ClaimPeriodNotExpired = 25,
    /// finalize_event called without locking the required finalization bond,
    /// or the caller's balance/allowance cannot cover it (#1344).
    BondRequired = 26,
    /// challenge_finalization / settle_finalization_bond found no bond record
    /// for the event (#1344).
    BondNotFound = 27,
    /// challenge_finalization called after the challenge window closed (#1344).
    ChallengeWindowClosed = 28,
    /// settle_finalization_bond called before the challenge window ends (#1344).
    ChallengeWindowOpen = 29,
    /// Bond was already returned or slashed (#1344).
    BondAlreadySettled = 30,
    /// challenge_finalization called by an address that is neither admin nor
    /// a configured verifier signer (#1344).
    UnauthorizedChallenge = 31,
    /// The invite code's `expires_at` has passed (#1699).
    InviteCodeExpired = 32,
    /// The invite code has already been redeemed `max_uses` times (#1699).
    InviteCodeUsesExceeded = 33,
    /// A fee/share computation overflowed `i128` (#1703).
    Overflow = 34,
}

impl From<InviteError> for EventError {
    fn from(e: InviteError) -> Self {
        match e {
            InviteError::CodeGenerationFailed => EventError::CodeGenerationFailed,
            InviteError::InvalidCode => EventError::InvalidInviteCode,
            InviteError::CodeExpired => EventError::InviteCodeExpired,
            InviteError::CodeUsesExceeded => EventError::InviteCodeUsesExceeded,
        }
    }
}

// ---------------------------------------------------------------------------
// Prize pool validation
// ---------------------------------------------------------------------------

/// Validate a prize pool and its reward distribution.
///
/// Rules:
/// * `prize_pool` must be `>= 0` ([`EventError::InvalidPrizePool`]).
/// * When `prize_pool > 0`:
///   * `reward_distribution` must be non-empty,
///   * have at most [`MAX_REWARD_RANKS`] entries,
///   * every entry must be in `1..=REWARD_PERCENT_TOTAL`,
///   * and the entries must sum to exactly [`REWARD_PERCENT_TOTAL`].
/// * When `prize_pool == 0` (a "fun event"), `reward_distribution` must be empty.
fn validate_prize_pool(prize_pool: i128, reward_distribution: &Vec<u32>) -> Result<(), EventError> {
    if prize_pool < 0 {
        return Err(EventError::InvalidPrizePool);
    }

    if prize_pool == 0 {
        // Fun event: no payouts, so no distribution may be specified.
        if !reward_distribution.is_empty() {
            return Err(EventError::InvalidRewardDistribution);
        }
        return Ok(());
    }

    // prize_pool > 0 from here on.
    if reward_distribution.is_empty() || reward_distribution.len() > MAX_REWARD_RANKS {
        return Err(EventError::InvalidRewardDistribution);
    }

    let mut sum: u32 = 0;
    for percent in reward_distribution.iter() {
        if percent == 0 || percent > REWARD_PERCENT_TOTAL {
            return Err(EventError::InvalidRewardDistribution);
        }
        sum += percent;
    }

    if sum != REWARD_PERCENT_TOTAL {
        return Err(EventError::InvalidRewardDistribution);
    }

    Ok(())
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
/// 5. Validate time range: `start_time < end_time`, `start_time >= current_time`,
///    and duration `<= MAX_EVENT_DURATION_SECONDS`.
/// 6. Validate the prize pool and reward distribution.
/// 7. Check creator has sufficient XLM balance for the creation fee.
/// 8. Transfer the fee from creator to treasury.
/// 9. If `prize_pool > 0`, escrow the prize pool from creator into the contract
///    address (a separate transfer from the creation fee → treasury transfer).
/// 10. Assign a new `event_id` via the global counter.
/// 11. Generate a unique 8-character invite code.
/// 12. Persist the `Event`, empty participant list, empty match list, and the
///     invite-code → event_id reverse index.
/// 13. Emit an `EventCreated` event, plus a `prize_pool_funded` event when the
///     event is funded.
/// 14. Return `(event_id, invite_code)`.
pub fn create_event(
    env: &Env,
    creator: Address,
    title: String,
    description: String,
    max_participants: u32,
    start_time: u64,
    end_time: u64,
    prize_pool: i128,
    reward_distribution: Vec<u32>,
    entry_fee: i128,
) -> Result<(u64, Symbol), EventError> {
    creator.require_auth();

    if admin::is_paused(env) {
        return Err(EventError::Paused);
    }

    // Validate title: 1–200 chars.
    if title.is_empty() || title.len() > MAX_TITLE_LEN {
        return Err(EventError::InvalidTitle);
    }

    // Validate description: 1–1000 chars.
    if description.is_empty() || description.len() > MAX_DESCRIPTION_LEN {
        return Err(EventError::InvalidDescription);
    }

    if max_participants == 0 {
        return Err(EventError::InvalidMaxParticipants);
    }

    let current_time = env.ledger().timestamp();

    // Validate time range
    if end_time <= start_time {
        return Err(EventError::InvalidTimeRange);
    }

    if start_time < current_time {
        return Err(EventError::EventStartInPast);
    }

    let duration = end_time - start_time;
    if duration > MAX_EVENT_DURATION_SECONDS {
        return Err(EventError::EventDurationTooLong);
    }

    // Validate the prize pool and its reward distribution.
    validate_prize_pool(prize_pool, &reward_distribution)?;

    // A negative entry fee is nonsensical; `0` means free to join.
    if entry_fee < 0 {
        return Err(EventError::InvalidEntryFee);
    }

    let fee = admin::get_creation_fee(env).unwrap_or_else(|| panic!("not_initialized"));
    let treasury = admin::get_treasury(env).unwrap_or_else(|| panic!("not_initialized"));
    let xlm_token = admin::get_xlm_token(env).unwrap_or_else(|| panic!("not_initialized"));

    let token_client = TokenClient::new(env, &xlm_token);

    if token_client.balance(&creator) < fee {
        return Err(EventError::InsufficientFee);
    }

    // The creator must be able to cover the prize pool on top of the creation
    // fee. Check this before either transfer so we never move only the fee.
    if prize_pool > 0 && token_client.balance(&creator) < fee + prize_pool {
        return Err(EventError::InsufficientPrizePoolFunds);
    }

    // Transfer creation fee from creator to treasury (platform anti-spam fee).
    token_client.transfer(&creator, &treasury, &fee);

    // Escrow the prize pool from creator into the contract address. This is a
    // distinct transfer from the creation-fee → treasury transfer above.
    if prize_pool > 0 {
        token_client.transfer(&creator, &env.current_contract_address(), &prize_pool);
    }

    let event_id = storage::next_event_id(env);
    let invite_code = invite::generate_invite_code(env).map_err(EventError::from)?;

    let event = Event::new(
        event_id,
        creator.clone(),
        title,
        description,
        fee,
        current_time,
        start_time,
        end_time,
        invite_code.clone(),
        max_participants,
        prize_pool,
        reward_distribution.clone(),
        entry_fee,
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

    // Store the invite-code → InviteCodeData reverse index. Freshly created
    // codes are unrestricted (no expiry, no use cap); see
    // `invite::set_invite_limits` to configure them.
    invite::set_invite_data(env, &invite_code, &InviteCodeData::new(event_id));

    env.events().publish(
        (Symbol::new(env, "event"), Symbol::new(env, "created")),
        (event_id, creator, invite_code.clone()),
    );

    // Announce the escrowed prize pool so off-chain indexers can track funding.
    if prize_pool > 0 {
        env.events().publish(
            (
                Symbol::new(env, "event"),
                Symbol::new(env, "prize_pool_funded"),
            ),
            (event_id, prize_pool, reward_distribution),
        );
    }

    Ok((event_id, invite_code))
}

// ---------------------------------------------------------------------------
// cancel_event (#1019)
// ---------------------------------------------------------------------------

/// Cancel an event. Only the event creator may call this, and only before
/// the event has been finalized.
///
/// Sets `is_cancelled = true` and `is_active = false` on the stored event and
/// emits a `("event", "cancelled")` contract event.
///
/// Returns [`EventError::EventNotFound`] when the ID is unknown,
/// [`EventError::Unauthorized`] when `caller` is not the creator,
/// and [`EventError::AlreadyFinalized`] when the event is already finalized.
/// Returns [`EventError::EventCancelled`] if the event was already cancelled.
pub fn cancel_event(env: &Env, caller: Address, event_id: u64) -> Result<(), EventError> {
    caller.require_auth();

    let mut event = storage::get_event(env, event_id).map_err(|_| EventError::EventNotFound)?;

    if event.creator != caller {
        return Err(EventError::Unauthorized);
    }

    if event.is_finalized {
        return Err(EventError::AlreadyFinalized);
    }

    if event.is_cancelled {
        return Err(EventError::EventCancelled);
    }

    event.cancel();
    storage::set_event(env, event_id, &event);

    env.events().publish(
        (Symbol::new(env, "event"), Symbol::new(env, "cancelled")),
        event_id,
    );

    Ok(())
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

/// Look up an event by its invite code.
///
/// Resolves the code through the `InviteCode` index to retrieve the event.
/// This is a lookup only — it does not check expiry or the use cap, and does
/// not redeem the code. Returns [`EventError::InvalidInviteCode`] when the
/// code is unknown, or [`EventError::EventNotFound`] when the associated
/// event is missing.
pub fn get_event_by_code(env: &Env, invite_code: Symbol) -> Result<Event, EventError> {
    let data = invite::get_invite_data(env, &invite_code).map_err(EventError::from)?;
    storage::get_event(env, data.event_id).map_err(|_| EventError::EventNotFound)
}

// ---------------------------------------------------------------------------
// set_invite_limits (#1699)
// ---------------------------------------------------------------------------

/// Configure the expiry and/or use cap on an event's invite code. Only the
/// event's creator may call this.
///
/// `expires_at == 0` means the code never expires; `max_uses == 0` means the
/// code has no redemption cap. Does not reset `use_count` — tightening the
/// cap below the current `use_count` simply means the code is already at (or
/// past) its cap on the next redemption attempt.
///
/// # Errors
/// * [`EventError::EventNotFound`] — no event exists with the given ID.
/// * [`EventError::Unauthorized`] — caller is not the event creator.
pub fn set_invite_limits(
    env: &Env,
    caller: Address,
    event_id: u64,
    expires_at: u64,
    max_uses: u32,
) -> Result<(), EventError> {
    caller.require_auth();

    let event = storage::get_event(env, event_id).map_err(|_| EventError::EventNotFound)?;
    if event.creator != caller {
        return Err(EventError::Unauthorized);
    }

    let mut data = invite::get_invite_data(env, &event.invite_code).map_err(EventError::from)?;
    data.expires_at = expires_at;
    data.max_uses = max_uses;
    invite::set_invite_data(env, &event.invite_code, &data);

    env.events().publish(
        (
            Symbol::new(env, "event"),
            Symbol::new(env, "invite_limits_updated"),
        ),
        (event_id, expires_at, max_uses),
    );

    Ok(())
}
