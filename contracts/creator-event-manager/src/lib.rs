#![no_std]

pub mod admin;
mod event;
mod fee;
mod finalize;
mod invite;
mod leaderboard;
pub mod r#match;
mod oracle;
pub mod prediction;
pub mod storage;
pub mod storage_types;
mod token;
pub mod verification;
pub mod views;

use soroban_sdk::{contract, contractimpl, Address, Env, String, Symbol, Vec};

use admin::AdminError;
use event::EventError;
use r#match::MatchError;
use storage_types::{Event, LeaderboardEntry, Match, ParticipantScore, Prediction, StandingEntry};
use verification::VerificationError;
use views::{EventStatistics, PlatformStatistics};

// ---------------------------------------------------------------------------
// Contract entry point
// ---------------------------------------------------------------------------

/// The CreatorEventManager contract.
///
/// Call [`CreatorEventManagerContract::initialize`] exactly once after
/// deployment to configure the contract.  All other functions will panic
/// (or return an error) if called before initialization.
#[contract]
pub struct CreatorEventManagerContract;

#[contractimpl]
impl CreatorEventManagerContract {
    /// Initialise the contract for first use.
    ///
    /// Must be called exactly once after deployment.  Stores the admin,
    /// AI agent, treasury, XLM token address, and creation fee in persistent
    /// storage, resets all counters to zero, and emits an `initialized` event.
    ///
    /// # Panics
    /// * `"already_initialized"` — called more than once.
    /// * `"invalid_address"` — one of the addresses equals the contract itself.
    /// * `"invalid_creation_fee"` — `initial_creation_fee` ≤ 0.
    pub fn initialize(
        env: Env,
        admin: Address,
        ai_agent: Address,
        treasury: Address,
        xlm_token: Address,
        initial_creation_fee: i128,
    ) {
        match admin::initialize(
            &env,
            admin,
            ai_agent,
            treasury,
            xlm_token,
            initial_creation_fee,
        ) {
            Ok(()) => {}
            Err(AdminError::AlreadyInitialized) => {
                panic!("already_initialized")
            }
            Err(AdminError::InvalidAddress) => {
                panic!("invalid_address")
            }
            Err(AdminError::InvalidCreationFee) => {
                panic!("invalid_creation_fee")
            }
            Err(_) => panic!("unexpected_error"),
        }
    }

    /// Update the creation fee.
    ///
    /// Only the admin may call this.
    ///
    /// # Panics
    /// * `"unauthorized"` — caller is not the admin.
    /// * `"invalid_creation_fee"` — `new_fee` <= 0.
    pub fn update_creation_fee(env: Env, caller: Address, new_fee: i128) {
        match admin::update_creation_fee(&env, caller, new_fee) {
            Ok(()) => {}
            Err(AdminError::Unauthorized) => panic!("unauthorized"),
            Err(AdminError::InvalidCreationFee) => panic!("invalid_creation_fee"),
            Err(_) => panic!("unexpected_error"),
        }
    }

    /// Update the treasury address where collected fees are sent.
    ///
    /// Only the admin may call this. `new_treasury` must not be the contract itself.
    ///
    /// # Panics
    /// * `"unauthorized"` — caller is not the admin.
    /// * `"invalid_address"` — `new_treasury` equals the contract address.
    pub fn set_treasury(env: Env, caller: Address, new_treasury: Address) {
        match admin::set_treasury(&env, caller, new_treasury) {
            Ok(()) => {}
            Err(AdminError::Unauthorized) => panic!("unauthorized"),
            Err(AdminError::InvalidAddress) => panic!("invalid_address"),
            Err(_) => panic!("unexpected_error"),
        }
    }

    /// Update the AI oracle agent address authorised to submit match results.
    ///
    /// Only the admin may call this. `new_agent` must not be the contract itself.
    ///
    /// # Panics
    /// * `"unauthorized"` — caller is not the admin.
    /// * `"invalid_address"` — `new_agent` equals the contract address.
    pub fn set_ai_agent(env: Env, caller: Address, new_agent: Address) {
        match admin::set_ai_agent(&env, caller, new_agent) {
            Ok(()) => {}
            Err(AdminError::Unauthorized) => panic!("unauthorized"),
            Err(AdminError::InvalidAddress) => panic!("invalid_address"),
            Err(_) => panic!("unexpected_error"),
        }
    }

    /// Halt contract operations in an emergency.
    ///
    /// Only the admin may call this. Panics if the contract is already paused.
    ///
    /// # Panics
    /// * `"unauthorized"` — caller is not the admin.
    /// * `"already_paused"` — contract is already paused.
    pub fn pause(env: Env, caller: Address) {
        match admin::pause(&env, caller) {
            Ok(()) => {}
            Err(AdminError::Unauthorized) => panic!("unauthorized"),
            Err(AdminError::AlreadyPaused) => panic!("already_paused"),
            Err(_) => panic!("unexpected_error"),
        }
    }

    /// Resume contract operations after a pause.
    ///
    /// Only the admin may call this. Panics if the contract is not currently paused.
    ///
    /// # Panics
    /// * `"unauthorized"` — caller is not the admin.
    /// * `"not_paused"` — contract is not currently paused.
    pub fn unpause(env: Env, caller: Address) {
        match admin::unpause(&env, caller) {
            Ok(()) => {}
            Err(AdminError::Unauthorized) => panic!("unauthorized"),
            Err(AdminError::NotPaused) => panic!("not_paused"),
            Err(_) => panic!("unexpected_error"),
        }
    }

    /// Returns `true` if the contract has been initialised.
    pub fn is_initialized(env: Env) -> bool {
        admin::is_initialized(&env)
    }

    /// Returns the current creation fee in stroops, or 0 if not initialised.
    pub fn get_creation_fee(env: Env) -> i128 {
        admin::get_creation_fee(&env).unwrap_or(0)
    }

    /// Returns `true` if the contract is currently paused.
    pub fn is_paused(env: Env) -> bool {
        admin::is_paused(&env)
    }

    /// Returns the current treasury address, or panics if not initialised.
    pub fn get_treasury(env: Env) -> Address {
        admin::get_treasury(&env).unwrap_or_else(|| panic!("not_initialized"))
    }

    /// Returns the current AI agent address, or panics if not initialised.
    pub fn get_ai_agent(env: Env) -> Address {
        admin::get_ai_agent(&env).unwrap_or_else(|| panic!("not_initialized"))
    }

    /// Configure the M-of-N verifier signer set used for event verification.
    ///
    /// Only the admin may call this. Replaces any previously configured
    /// signer set and threshold atomically.
    ///
    /// # Panics
    /// * `"unauthorized"` — caller is not the admin.
    /// * `"invalid_threshold"` — `threshold == 0` or `threshold > signers.len()`.
    /// * `"duplicate_signer"` — `signers` contains the same address twice.
    pub fn set_verifier_config(env: Env, caller: Address, signers: Vec<Address>, threshold: u32) {
        match admin::set_verifier_config(&env, caller, signers, threshold) {
            Ok(()) => {}
            Err(AdminError::Unauthorized) => panic!("unauthorized"),
            Err(AdminError::InvalidThreshold) => panic!("invalid_threshold"),
            Err(AdminError::DuplicateSigner) => panic!("duplicate_signer"),
            Err(_) => panic!("unexpected_error"),
        }
    }

    /// Return the configured verifier signer set (empty if never configured).
    pub fn get_verifier_signers(env: Env) -> Vec<Address> {
        admin::get_verifier_signers(&env)
    }

    /// Return the configured verifier threshold (M), or 0 if never configured.
    pub fn get_verifier_threshold(env: Env) -> u32 {
        admin::get_verifier_threshold(&env)
    }

    // =========================================================================
    // Verification (#790–#793)
    // =========================================================================

    /// Grant verification status to a single address.
    ///
    /// Only the admin may call this. The address must not equal the contract
    /// address and must not already be verified.
    ///
    /// # Panics
    /// * `"unauthorized"` — caller is not the admin.
    /// * `"invalid_address"` — address equals the contract address.
    /// * `"already_verified"` — address is already verified.
    pub fn verify_address(env: Env, caller: Address, address: Address) {
        match verification::verify_address(&env, caller, address) {
            Ok(()) => {}
            Err(VerificationError::Unauthorized) => panic!("unauthorized"),
            Err(VerificationError::InvalidAddress) => panic!("invalid_address"),
            Err(VerificationError::AlreadyVerified) => panic!("already_verified"),
            Err(_) => panic!("unexpected_error"),
        }
    }

    /// Grant verification status to multiple addresses in a single transaction.
    ///
    /// Only the admin may call this. The list must be non-empty and no address
    /// may equal the contract address. Already-verified addresses are skipped.
    /// Returns the number of newly verified addresses.
    ///
    /// # Panics
    /// * `"unauthorized"` — caller is not the admin.
    /// * `"empty_list"` — the address list is empty.
    /// * `"invalid_address"` — any address in the list equals the contract address.
    pub fn batch_verify_addresses(env: Env, caller: Address, addresses: Vec<Address>) -> u32 {
        match verification::batch_verify_addresses(&env, caller, addresses) {
            Ok(count) => count,
            Err(VerificationError::Unauthorized) => panic!("unauthorized"),
            Err(VerificationError::EmptyList) => panic!("empty_list"),
            Err(VerificationError::InvalidAddress) => panic!("invalid_address"),
            Err(_) => panic!("unexpected_error"),
        }
    }

    /// Remove verification status from an address.
    ///
    /// Only the admin may call this. The address must not equal the contract
    /// address and must currently be verified.
    ///
    /// # Panics
    /// * `"unauthorized"` — caller is not the admin.
    /// * `"invalid_address"` — address equals the contract address.
    /// * `"not_verified"` — address is not currently verified.
    pub fn unverify_address(env: Env, caller: Address, address: Address) {
        match verification::unverify_address(&env, caller, address) {
            Ok(()) => {}
            Err(VerificationError::Unauthorized) => panic!("unauthorized"),
            Err(VerificationError::InvalidAddress) => panic!("invalid_address"),
            Err(VerificationError::NotVerified) => panic!("not_verified"),
            Err(_) => panic!("unexpected_error"),
        }
    }

    /// Check whether an address is verified.
    ///
    /// Public view function — no authentication required. Returns `false` for
    /// any address that has never been verified or does not exist in storage.
    pub fn is_verified(env: Env, address: Address) -> bool {
        verification::is_verified(&env, address)
    }

    /// Submit a verifier signature for an event (M-of-N event verification).
    ///
    /// `signer` must be one of the addresses configured via
    /// `set_verifier_config`. Each signer may submit at most once per event.
    /// Returns the number of distinct signers who have now submitted.
    ///
    /// # Panics
    /// * `"event_not_found"` — no event exists for `event_id`.
    /// * `"not_a_verifier_signer"` — `signer` is not a configured verifier.
    /// * `"duplicate_signer"` — `signer` already submitted for this event.
    pub fn submit_verification(env: Env, event_id: u64, signer: Address) -> u32 {
        match verification::submit_verification(&env, event_id, signer) {
            Ok(count) => count,
            Err(VerificationError::EventNotFound) => panic!("event_not_found"),
            Err(VerificationError::NotAVerifierSigner) => panic!("not_a_verifier_signer"),
            Err(VerificationError::DuplicateSigner) => panic!("duplicate_signer"),
            Err(_) => panic!("unexpected_error"),
        }
    }

    /// Returns `true` once at least M distinct configured signers have
    /// submitted verification for this event.
    pub fn is_event_verified(env: Env, event_id: u64) -> bool {
        verification::is_event_verified(&env, event_id)
    }

    /// Returns the number of distinct signers who have submitted verification
    /// for this event so far.
    pub fn get_event_verification_count(env: Env, event_id: u64) -> u32 {
        verification::get_event_verification_count(&env, event_id)
    }

    // =========================================================================
    // Event management (#794–#797)
    // =========================================================================

    /// Create a new prediction event.
    ///
    /// Charges the creation fee in XLM, generates a unique 8-character invite
    /// code, persists the event, and emits an `EventCreated` event.
    ///
    /// Returns `(event_id, invite_code)`.
    ///
    /// # Panics
    /// * `"contract_paused"` — contract is paused.
    /// * `"invalid_title"` — title is empty or > 200 chars.
    /// * `"invalid_description"` — description is empty or > 1000 chars.
    /// * `"invalid_max_participants"` — max_participants is 0.
    /// * `"invalid_time_range"` — end_time <= start_time.
    /// * `"event_start_in_past"` — start_time < current timestamp.
    /// * `"event_duration_too_long"` — duration exceeds MAX_EVENT_DURATION_SECONDS.
    /// * `"insufficient_fee"` — creator's XLM balance is below the creation fee.
    /// * `"code_generation_failed"` — could not generate a unique invite code.
    /// * `"invalid_prize_pool"` — `prize_pool` is negative.
    /// * `"invalid_reward_distribution"` — distribution is malformed (empty when
    ///   funded, too many ranks, a zero/over-100 entry, a non-100 sum, or a
    ///   non-empty distribution on an unfunded event).
    /// * `"insufficient_prize_pool_funds"` — creator cannot cover
    ///   `creation_fee + prize_pool`.
    /// * `"invalid_entry_fee"` — `entry_fee` is negative.
    pub fn create_event(
        env: Env,
        creator: Address,
        title: String,
        description: String,
        max_participants: u32,
        start_time: u64,
        end_time: u64,
        prize_pool: i128,
        reward_distribution: Vec<u32>,
        entry_fee: i128,
    ) -> (u64, Symbol) {
        match event::create_event(
            &env,
            creator,
            title,
            description,
            max_participants,
            start_time,
            end_time,
            prize_pool,
            reward_distribution,
            entry_fee,
        ) {
            Ok(result) => result,
            Err(EventError::Paused) => panic!("contract_paused"),
            Err(EventError::InvalidTitle) => panic!("invalid_title"),
            Err(EventError::InvalidDescription) => panic!("invalid_description"),
            Err(EventError::InvalidMaxParticipants) => panic!("invalid_max_participants"),
            Err(EventError::InvalidTimeRange) => panic!("invalid_time_range"),
            Err(EventError::EventStartInPast) => panic!("event_start_in_past"),
            Err(EventError::EventDurationTooLong) => panic!("event_duration_too_long"),
            Err(EventError::InsufficientFee) => panic!("insufficient_fee"),
            Err(EventError::TransferFailed) => panic!("transfer_failed"),
            Err(EventError::CodeGenerationFailed) => panic!("code_generation_failed"),
            Err(EventError::InvalidPrizePool) => panic!("invalid_prize_pool"),
            Err(EventError::InvalidRewardDistribution) => panic!("invalid_reward_distribution"),
            Err(EventError::InsufficientPrizePoolFunds) => panic!("insufficient_prize_pool_funds"),
            Err(EventError::InvalidEntryFee) => panic!("invalid_entry_fee"),
            Err(_) => panic!("unexpected_error"),
        }
    }

    /// Retrieve an event by ID.
    ///
    /// Extends the entry TTL on each read.
    ///
    /// # Panics
    /// * `"event_not_found"` — no event exists with the given ID.
    pub fn get_event(env: Env, event_id: u64) -> Event {
        match event::get_event(&env, event_id) {
            Ok(e) => e,
            Err(EventError::EventNotFound) => panic!("event_not_found"),
            Err(_) => panic!("unexpected_error"),
        }
    }

    /// Look up an event by its invite code.
    ///
    /// # Panics
    /// * `"invalid_invite_code"` — no event is associated with this code.
    /// * `"event_not_found"` — the code resolves to an event that no longer exists.
    pub fn get_event_by_code(env: Env, invite_code: Symbol) -> Event {
        match event::get_event_by_code(&env, invite_code) {
            Ok(e) => e,
            Err(EventError::InvalidInviteCode) => panic!("invalid_invite_code"),
            Err(EventError::EventNotFound) => panic!("event_not_found"),
            Err(_) => panic!("unexpected_error"),
        }
    }

    /// Cancel an event. Only the event creator may call this before finalization.
    ///
    /// Marks the event as cancelled and inactive, and emits a
    /// `("event", "cancelled")` contract event. Cancellation is irreversible.
    ///
    /// # Panics
    /// * `"event_not_found"` — no event exists with the given ID.
    /// * `"unauthorized"` — caller is not the event creator.
    /// * `"already_finalized"` — the event has already been finalized.
    /// * `"event_cancelled"` — the event is already cancelled.
    pub fn cancel_event(env: Env, caller: Address, event_id: u64) {
        match event::cancel_event(&env, caller, event_id) {
            Ok(()) => {}
            Err(EventError::EventNotFound) => panic!("event_not_found"),
            Err(EventError::Unauthorized) => panic!("unauthorized"),
            Err(EventError::AlreadyFinalized) => panic!("already_finalized"),
            Err(EventError::EventCancelled) => panic!("event_cancelled"),
            Err(_) => panic!("unexpected_error"),
        }
    }

    /// Return the escrowed prize pool (in stroops) for an event.
    ///
    /// Returns `0` for a "fun event" with no payouts.
    ///
    /// # Panics
    /// * `"event_not_found"` — no event exists with the given ID.
    pub fn get_event_prize_pool(env: Env, event_id: u64) -> i128 {
        match views::get_event_prize_pool(&env, event_id) {
            Ok(prize_pool) => prize_pool,
            Err(EventError::EventNotFound) => panic!("event_not_found"),
            Err(_) => panic!("unexpected_error"),
        }
    }

    /// Return the reward distribution percentages for an event.
    ///
    /// The vector is empty for a "fun event" with no payouts.
    ///
    /// # Panics
    /// * `"event_not_found"` — no event exists with the given ID.
    pub fn get_event_reward_distribution(env: Env, event_id: u64) -> Vec<u32> {
        match views::get_event_reward_distribution(&env, event_id) {
            Ok(distribution) => distribution,
            Err(EventError::EventNotFound) => panic!("event_not_found"),
            Err(_) => panic!("unexpected_error"),
        }
    }

    /// Return all participant addresses for an event.
    ///
    /// Reads the `EventParticipants(event_id)` storage index after validating
    /// that the event exists. A newly created event returns an empty vector.
    ///
    /// # Panics
    /// * `"event_not_found"` — no event exists with the given ID.
    pub fn get_event_participants(env: Env, event_id: u64) -> Vec<Address> {
        match views::get_event_participants(&env, event_id) {
            Ok(participants) => participants,
            Err(EventError::EventNotFound) => panic!("event_not_found"),
            Err(_) => panic!("unexpected_error"),
        }
    }

    /// Return aggregate statistics for an event.
    ///
    /// The returned [`EventStatistics`] summarizes participant count, match
    /// count, prediction volume, match result completion, and verified winner
    /// count for the requested event.
    ///
    /// # Panics
    /// * `"event_not_found"` — no event exists with the given ID.
    pub fn get_event_statistics(env: Env, event_id: u64) -> EventStatistics {
        match views::get_event_statistics(&env, event_id) {
            Ok(statistics) => statistics,
            Err(EventError::EventNotFound) => panic!("event_not_found"),
            Err(_) => panic!("unexpected_error"),
        }
    }

    /// Return the number of matches currently stored for an event.
    ///
    /// This is a lightweight read that loads only the event record, not the
    /// full match list.
    pub fn get_match_count(env: Env, event_id: u64) -> u32 {
        match r#match::get_match_count(&env, event_id) {
            Ok(count) => count,
            Err(EventError::EventNotFound) => panic!("event_not_found"),
            Err(_) => panic!("unexpected_error"),
        }
    }

    /// Create a new match within an event.
    ///
    /// Only the event's creator can call this. Validates team names, match time,
    /// and the points multiplier, then persists the match and emits a
    /// ("match", "created") event.
    ///
    /// Returns the newly assigned `match_id`.
    ///
    /// # Panics
    /// * `"paused"` — contract is paused.
    /// * `"event_not_found"` — no event exists with the given ID.
    /// * `"event_cancelled"` — the event has been cancelled.
    /// * `"unauthorized"` — caller is not the event creator.
    /// * `"invalid_team_names"` — team names are empty, too long, or identical.
    /// * `"invalid_match_time"` — match_time is not in the future.
    /// * `"invalid_points_multiplier"` — multiplier is 0 or > MAX_POINTS_MULTIPLIER (3).
    pub fn create_match(
        env: Env,
        caller: Address,
        event_id: u64,
        team_a: String,
        team_b: String,
        match_time: u64,
        points_multiplier: u32,
    ) -> u64 {
        match r#match::create_match(
            &env,
            caller,
            event_id,
            team_a,
            team_b,
            match_time,
            points_multiplier,
        ) {
            Ok(match_id) => match_id,
            Err(MatchError::Paused) => panic!("paused"),
            Err(MatchError::EventNotFound) => panic!("event_not_found"),
            Err(MatchError::EventCancelled) => panic!("event_cancelled"),
            Err(MatchError::Unauthorized) => panic!("unauthorized"),
            Err(MatchError::InvalidTeamNames) => panic!("invalid_team_names"),
            Err(MatchError::InvalidMatchTime) => panic!("invalid_match_time"),
            Err(MatchError::InvalidPointsMultiplier) => panic!("invalid_points_multiplier"),
            Err(MatchError::MatchNotFound) => panic!("match_not_found"),
        }
    }

    /// Retrieve all matches for an event, sorted by `match_time` ascending.
    ///
    /// Returns a `Vec<Match>` containing every match that belongs to the given
    /// event, ordered from earliest to latest scheduled start time.  Returns an
    /// empty `Vec` when the event exists but has no matches.
    ///
    /// # Panics
    /// * `"event_not_found"` — no event exists with the given ID.
    pub fn list_event_matches(env: Env, event_id: u64) -> Vec<Match> {
        match r#match::list_event_matches(&env, event_id) {
            Ok(matches) => matches,
            Err(EventError::EventNotFound) => panic!("event_not_found"),
            Err(_) => panic!("unexpected_error"),
        }
    }

    /// Retrieve a single match by its ID.
    ///
    /// Extends the entry TTL on each read.
    ///
    /// # Panics
    /// * `"match_not_found"` — no match exists with the given ID.
    pub fn get_match(env: Env, match_id: u64) -> Match {
        match r#match::get_match(&env, match_id) {
            Ok(m) => m,
            Err(MatchError::MatchNotFound) => panic!("match_not_found"),
            Err(_) => panic!("unexpected_error"),
        }
    }

    /// Return a snapshot of the contract configuration.
    pub fn get_config(env: Env) -> views::Config {
        match views::get_config(&env) {
            Ok(cfg) => cfg,
            Err(_) => panic!("not_initialized"),
        }
    }

    /// Return the current treasury XLM balance.
    pub fn get_treasury_balance(env: Env) -> i128 {
        fee::get_treasury_balance(&env)
    }

    /// Withdraw collected fees from treasury to `to` address. Only admin may call.
    pub fn withdraw_fees(env: Env, caller: Address, to: Address, amount: i128) {
        match fee::withdraw_fees(&env, caller, to, amount) {
            Ok(()) => {}
            Err(fee::FeeError::Paused) => panic!("contract_paused"),
            Err(fee::FeeError::Unauthorized) => panic!("unauthorized"),
            Err(fee::FeeError::InvalidAddress) => panic!("invalid_address"),
            Err(fee::FeeError::InvalidAmount) => panic!("invalid_amount"),
            Err(fee::FeeError::InsufficientBalance) => panic!("insufficient_balance"),
            Err(fee::FeeError::TransferFailed) => panic!("transfer_failed"),
        }
    }

    /// Join an event using its invite code.
    pub fn join_event(env: Env, user: Address, invite_code: Symbol) {
        match prediction::join_event(&env, user, invite_code) {
            Ok(()) => {}
            Err(prediction::PredictionError::Paused) => panic!("paused"),
            Err(prediction::PredictionError::InvalidInviteCode) => panic!("invalid_invite_code"),
            Err(prediction::PredictionError::EventNotFound) => panic!("event_not_found"),
            Err(prediction::PredictionError::EventCancelled) => panic!("event_cancelled"),
            Err(prediction::PredictionError::AlreadyJoined) => panic!("already_joined"),
            Err(prediction::PredictionError::EventFull) => panic!("event_full"),
            Err(prediction::PredictionError::InsufficientEntryFeeBalance) => {
                panic!("insufficient_entry_fee_balance")
            }
            Err(_) => panic!("unexpected_error"),
        }
    }

    /// Submit a prediction for a match in an event.
    ///
    /// Takes a predicted scoreline (predicted_home_score, predicted_away_score).
    /// Returns the prediction ID.
    pub fn submit_prediction(
        env: Env,
        predictor: Address,
        match_id: u64,
        predicted_home_score: u32,
        predicted_away_score: u32,
    ) -> u64 {
        match prediction::submit_prediction(
            &env,
            predictor,
            match_id,
            predicted_home_score,
            predicted_away_score,
        ) {
            Ok(prediction_id) => prediction_id,
            Err(prediction::PredictionError::Paused) => panic!("paused"),
            Err(prediction::PredictionError::MatchNotFound) => panic!("match_not_found"),
            Err(prediction::PredictionError::EventNotFound) => panic!("event_not_found"),
            Err(prediction::PredictionError::EventCancelled) => panic!("event_cancelled"),
            Err(prediction::PredictionError::NotJoined) => panic!("not_joined"),
            Err(prediction::PredictionError::MatchStarted) => panic!("match_started"),
            Err(prediction::PredictionError::AlreadyPredicted) => panic!("already_predicted"),
            Err(_) => panic!("unexpected_error"),
        }
    }

    /// Return a stored prediction by ID.
    pub fn get_prediction(env: Env, prediction_id: u64) -> Prediction {
        match prediction::get_prediction(&env, prediction_id) {
            Ok(prediction) => prediction,
            Err(prediction::PredictionError::PredictionNotFound) => panic!("prediction_not_found"),
            Err(_) => panic!("unexpected_error"),
        }
    }

    /// Retrieve all predictions a user has made for a specific event.
    ///
    /// Returns a `Vec<Prediction>` sorted by `predicted_at` ascending
    /// (earliest prediction first).  Returns an empty `Vec` when the user has
    /// made no predictions for the event.
    pub fn get_user_predictions(env: Env, user: Address, event_id: u64) -> Vec<Prediction> {
        prediction::get_user_predictions(&env, user, event_id)
    }

    /// Return all events a user has joined.
    pub fn get_user_events(env: Env, user: Address) -> Vec<u64> {
        views::get_user_events(&env, user)
    }

    /// Return the count of events that a user has joined.
    ///
    /// Lightweight alternative to `get_user_events` for dashboards that display
    /// only a "X events joined" badge. Returns 0 for unknown users.
    pub fn get_user_joined_events_count(env: Env, user: Address) -> u32 {
        views::get_user_joined_events_count(&env, user)
    }

    /// Calculate how many users predicted each outcome for a match.
    ///
    /// Returns `(team_a_count, team_b_count, draw_count)`.  All three counts
    /// are always present; outcomes with no predictions return `0`.
    pub fn get_prediction_distribution(env: Env, match_id: u64) -> (u32, u32, u32) {
        prediction::get_prediction_distribution(&env, match_id)
    }

    /// Retrieve every prediction submitted for a specific match (#808).
    ///
    /// Returns a `Vec<Prediction>` in submission order. Returns an empty `Vec`
    /// when the match has no predictions (or the match id does not exist).
    /// Useful for analytics and displaying a match's full prediction
    /// distribution.
    pub fn get_match_predictions(env: Env, match_id: u64) -> Vec<Prediction> {
        prediction::get_match_predictions(&env, match_id)
    }

    // =========================================================================
    // Oracle / Winner Verification (#798–#801, #810)
    // =========================================================================

    /// Submit a match result as the authorized AI oracle agent (#810, #966).
    ///
    /// Resolves the match with a final scoreline (home_score, away_score),
    /// records the winning outcome (derived from the scores), and grades every
    /// prediction for the match (sets each `is_correct` and `points_earned`).
    /// The match must have started (current time >= match_time).
    ///
    /// # Panics
    /// * `"contract_paused"` — the contract is paused.
    /// * `"unauthorized"` — caller is not the configured AI agent.
    /// * `"match_not_found"` — no match exists with the given ID.
    /// * `"result_already_submitted"` — a result was already submitted.
    /// * `"match_not_started"` — current time is before the match start time.
    pub fn submit_match_result(
        env: Env,
        caller: Address,
        match_id: u64,
        home_score: u32,
        away_score: u32,
    ) {
        match oracle::submit_match_result(&env, caller, match_id, home_score, away_score) {
            Ok(()) => {}
            Err(oracle::OracleError::Paused) => panic!("contract_paused"),
            Err(oracle::OracleError::Unauthorized) => panic!("unauthorized"),
            Err(oracle::OracleError::MatchNotFound) => panic!("match_not_found"),
            Err(oracle::OracleError::ResultAlreadySubmitted) => panic!("result_already_submitted"),
            Err(oracle::OracleError::MatchNotStarted) => panic!("match_not_started"),
            Err(_) => panic!("unexpected_error"),
        }
    }

    /// Calculate a user's score and statistics for an event.
    ///
    /// Returns a tuple `(total_points, correct_results, exact_scores, total_matches)` where:
    /// - `total_points`: Sum of points earned from all predictions (0, 1, or 4 per match).
    /// - `correct_results`: Number of matches with correct 1X2 result.
    /// - `exact_scores`: Number of matches with exact scoreline prediction.
    /// - `total_matches`: Total number of matches in the event.
    ///
    /// Useful for scoring and leaderboards.
    ///
    /// # Panics
    /// * `"event_not_found"` — no event exists with the given ID.
    pub fn get_user_score(env: Env, user: Address, event_id: u64) -> (u32, u32, u32, u32) {
        match oracle::get_user_score(&env, user, event_id) {
            Ok(score) => score,
            Err(oracle::OracleError::EventNotFound) => panic!("event_not_found"),
            Err(oracle::OracleError::Overflow) => panic!("overflow"),
            Err(_) => panic!("unexpected_error"),
        }
    }

    /// Get a ranked leaderboard for an event (#967).
    ///
    /// Returns all event participants ranked by total points earned from their
    /// predictions. The leaderboard is computed live and can be called before
    /// all matches are resolved; unresolved matches contribute 0 points.
    ///
    /// Ranking tiebreakers (in order):
    /// 1. Higher total_points
    /// 2. Higher exact_scores
    /// 3. Earlier last_prediction_time (commits reward)
    /// 4. Address byte comparison (deterministic final tiebreaker)
    ///
    /// Returns a `Vec<LeaderboardEntry>` sorted by rank ascending (rank 1 first).
    /// Each entry includes the participant's address, total points, correct results
    /// count, exact scores count, and their assigned rank.
    ///
    /// # Panics
    /// * `"event_not_found"` — no event exists with the given ID.
    /// * `"overflow"` — arithmetic overflow during calculation.
    pub fn get_event_leaderboard(env: Env, event_id: u64) -> Vec<LeaderboardEntry> {
        match leaderboard::get_event_leaderboard(&env, event_id) {
            Ok(entries) => entries,
            Err(leaderboard::LeaderboardError::EventNotFound) => panic!("event_not_found"),
            Err(leaderboard::LeaderboardError::Overflow) => panic!("overflow"),
        }
    }

    /// Return the stored weighted standings for an event (#1311).
    ///
    /// Standings weight each correct prediction by documented multipliers:
    /// a 1.00× base on `points_earned`, +0.25× when the prediction was placed
    /// at least one hour before the match start, and +0.50× when the winning
    /// outcome was picked by strictly fewer than half of the match's
    /// predictors. The snapshot is recomputed from scratch on every
    /// `submit_match_result` and on `finalize_event`, so repeated computation
    /// always yields identical standings.
    ///
    /// Tie-break ordering (deterministic, applied in order):
    /// 1. Higher weighted score
    /// 2. Higher correct-prediction count
    /// 3. Earlier achievement (reached the score first)
    /// 4. Smaller address
    ///
    /// Returns an empty `Vec` when no match result has been submitted yet.
    ///
    /// # Panics
    /// * `"event_not_found"` — no event exists with the given ID.
    pub fn get_event_standings(env: Env, event_id: u64) -> Vec<StandingEntry> {
        match leaderboard::get_event_standings(&env, event_id) {
            Ok(standings) => standings,
            Err(leaderboard::LeaderboardError::EventNotFound) => panic!("event_not_found"),
            Err(_) => panic!("unexpected_error"),
        }
    }

    /// Return a participant's weighted score components for an event (#1311).
    ///
    /// Exposes the transparency breakdown behind `get_event_standings`: the
    /// base component (`points × 1.00×`), accumulated early-prediction and
    /// against-the-crowd bonuses, correct-prediction count, and the timestamp
    /// the participant last increased their score. `weighted_score` always
    /// equals the sum of the three components. Returns a zeroed score for a
    /// user who has not scored (or not participated) yet.
    ///
    /// # Panics
    /// * `"event_not_found"` — no event exists with the given ID.
    pub fn get_participant_score(env: Env, event_id: u64, user: Address) -> ParticipantScore {
        match leaderboard::get_participant_score(&env, event_id, user) {
            Ok(score) => score,
            Err(leaderboard::LeaderboardError::EventNotFound) => panic!("event_not_found"),
            Err(_) => panic!("unexpected_error"),
        }
    }

    // =========================================================================
    // Finalization / Payout
    // =========================================================================

    /// Finalize an event: rank participants, split the prize pool, and pay out.
    ///
    /// Permissionless — anyone may call this once the event has ended and every
    /// match is resolved. Ranks participants via the deterministic leaderboard,
    /// pays the top-N addresses per `reward_distribution`, refunds any
    /// unallocated percentage and integer-division dust to the creator, marks
    /// the event finalized, stores a payout snapshot, and emits a
    /// `(event, finalized)` event. Returns the `(address, amount)` payout vector.
    ///
    /// # Panics
    /// * `"contract_paused"` — the contract is paused.
    /// * `"event_not_found"` — no event exists with the given ID.
    /// * `"event_cancelled"` — the event has been cancelled.
    /// * `"already_finalized"` — the event was already finalized.
    /// * `"event_not_ended"` — current time is before the event's end_time.
    /// * `"matches_not_complete"` — at least one match is unresolved.
    /// * `"transfer_failed"` — a payout transfer failed.
    pub fn finalize_event(env: Env, caller: Address, event_id: u64) -> Vec<(Address, i128)> {
        match finalize::finalize_event(&env, caller, event_id) {
            Ok(payouts) => payouts,
            Err(EventError::Paused) => panic!("contract_paused"),
            Err(EventError::EventNotFound) => panic!("event_not_found"),
            Err(EventError::EventCancelled) => panic!("event_cancelled"),
            Err(EventError::AlreadyFinalized) => panic!("already_finalized"),
            Err(EventError::EventNotEnded) => panic!("event_not_ended"),
            Err(EventError::MatchesNotComplete) => panic!("matches_not_complete"),
            Err(EventError::TransferFailed) => panic!("transfer_failed"),
            Err(_) => panic!("unexpected_error"),
        }
    }

    /// Return the stored prize-pool payout snapshot for a finalized event.
    ///
    /// Returns the `(address, amount)` vector recorded by `finalize_event`, or
    /// an empty vector if the event has not been finalized (or does not exist).
    /// Note this reflects staged *allocations*, not necessarily transferred
    /// funds — see `claim_prize` / `clawback_unclaimed` (#1312).
    pub fn get_event_payouts(env: Env, event_id: u64) -> Vec<(Address, i128)> {
        finalize::get_event_payouts(&env, event_id)
    }

    /// Claim a winner's staged prize allocation from a finalized event (#1312).
    ///
    /// `finalize_event` stages per-winner allocations instead of transferring
    /// them immediately; this transfers `winner`'s allocation to them exactly
    /// once. Only `winner` may claim their own allocation.
    ///
    /// Returns the claimed amount (in stroops).
    ///
    /// # Panics
    /// * `"contract_paused"` — the contract is paused.
    /// * `"event_not_found"` — no event exists with the given ID.
    /// * `"event_not_finalized"` — the event has not been finalized yet.
    /// * `"no_allocation"` — `winner` has no recorded allocation for this event.
    /// * `"already_claimed"` — the allocation was already claimed, or already
    ///   swept to treasury by `clawback_unclaimed`.
    /// * `"transfer_failed"` — the payout transfer failed.
    pub fn claim_prize(env: Env, winner: Address, event_id: u64) -> i128 {
        match finalize::claim_prize(&env, winner, event_id) {
            Ok(amount) => amount,
            Err(EventError::Paused) => panic!("contract_paused"),
            Err(EventError::EventNotFound) => panic!("event_not_found"),
            Err(EventError::EventNotFinalized) => panic!("event_not_finalized"),
            Err(EventError::NoAllocation) => panic!("no_allocation"),
            Err(EventError::AlreadyClaimed) => panic!("already_claimed"),
            Err(EventError::TransferFailed) => panic!("transfer_failed"),
            Err(_) => panic!("unexpected_error"),
        }
    }

    /// Sweep unclaimed prize allocations for a finalized event to treasury,
    /// once the claim deadline has passed (#1312).
    ///
    /// Permissionless — anyone may trigger the sweep once the deadline has
    /// passed, but they must authorize the call. Allocations already claimed
    /// by their winner are left untouched. Safe to call repeatedly: once every
    /// allocation is settled, further calls are a no-op that return `0`.
    ///
    /// Returns the total amount swept to treasury.
    ///
    /// # Panics
    /// * `"contract_paused"` — the contract is paused.
    /// * `"event_not_found"` — no event exists with the given ID.
    /// * `"event_not_finalized"` — the event has not been finalized yet.
    /// * `"claim_period_not_expired"` — the claim deadline has not passed yet.
    /// * `"transfer_failed"` — the sweep transfer failed.
    pub fn clawback_unclaimed(env: Env, caller: Address, event_id: u64) -> i128 {
        match finalize::clawback_unclaimed(&env, caller, event_id) {
            Ok(amount) => amount,
            Err(EventError::Paused) => panic!("contract_paused"),
            Err(EventError::EventNotFound) => panic!("event_not_found"),
            Err(EventError::EventNotFinalized) => panic!("event_not_finalized"),
            Err(EventError::ClaimPeriodNotExpired) => panic!("claim_period_not_expired"),
            Err(EventError::TransferFailed) => panic!("transfer_failed"),
            Err(_) => panic!("unexpected_error"),
        }
    }

    /// Check whether an event is finalized.
    ///
    /// # Panics
    /// * `"event_not_found"` — if no event exists with the given ID.
    pub fn is_event_finalized(env: Env, event_id: u64) -> bool {
        match views::is_event_finalized(&env, event_id) {
            Ok(finalized) => finalized,
            Err(EventError::EventNotFound) => panic!("event_not_found"),
            Err(_) => panic!("unexpected_error"),
        }
    }

    /// Get platform-wide statistics.
    ///
    /// Returns aggregated statistics including total events, matches,
    /// predictions, unique participants, and total fees collected.
    pub fn get_platform_statistics(env: Env) -> PlatformStatistics {
        views::get_platform_statistics(&env)
    }

    /// Return the total number of events created on the platform.
    ///
    /// Lightweight alternative to `get_platform_statistics` for callers that
    /// only need the event count. Returns `0` before any events are created.
    pub fn get_event_count(env: Env) -> u64 {
        views::get_event_count(&env)
    }
}
