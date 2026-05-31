#![no_std]

pub mod admin;
mod event;
mod invite;
mod oracle;
pub mod r#match;
pub mod prediction;
pub mod storage;
pub mod storage_types;
mod token;
pub mod verification;
pub mod views;
mod fee;

use soroban_sdk::{contract, contractimpl, Address, Env, String, Symbol, Vec};

use admin::AdminError;
use event::EventError;
use storage_types::{Event, Match, Prediction, Winner};
use verification::VerificationError;
use views::EventStatistics;

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
    /// * `"insufficient_fee"` — creator's XLM balance is below the creation fee.
    /// * `"code_generation_failed"` — could not generate a unique invite code.
    pub fn create_event(
        env: Env,
        creator: Address,
        title: String,
        description: String,
        max_participants: u32,
    ) -> (u64, Symbol) {
        match event::create_event(&env, creator, title, description, max_participants) {
            Ok(result) => result,
            Err(EventError::Paused) => panic!("contract_paused"),
            Err(EventError::InvalidTitle) => panic!("invalid_title"),
            Err(EventError::InvalidDescription) => panic!("invalid_description"),
            Err(EventError::InvalidMaxParticipants) => panic!("invalid_max_participants"),
            Err(EventError::InsufficientFee) => panic!("insufficient_fee"),
            Err(EventError::TransferFailed) => panic!("transfer_failed"),
            Err(EventError::CodeGenerationFailed) => panic!("code_generation_failed"),
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
            Err(_) => panic!("unexpected_error"),
        }
    }

    /// Submit a prediction for a match in an event.
    pub fn submit_prediction(
        env: Env,
        predictor: Address,
        match_id: u64,
        predicted_outcome: Symbol,
    ) -> u64 {
        match prediction::submit_prediction(&env, predictor, match_id, predicted_outcome) {
            Ok(prediction_id) => prediction_id,
            Err(prediction::PredictionError::Paused) => panic!("paused"),
            Err(prediction::PredictionError::MatchNotFound) => panic!("match_not_found"),
            Err(prediction::PredictionError::EventNotFound) => panic!("event_not_found"),
            Err(prediction::PredictionError::EventCancelled) => panic!("event_cancelled"),
            Err(prediction::PredictionError::NotJoined) => panic!("not_joined"),
            Err(prediction::PredictionError::MatchStarted) => panic!("match_started"),
            Err(prediction::PredictionError::InvalidOutcome) => panic!("invalid_outcome"),
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

    /// Calculate how many users predicted each outcome for a match.
    ///
    /// Returns `(team_a_count, team_b_count, draw_count)`.  All three counts
    /// are always present; outcomes with no predictions return `0`.
    pub fn get_prediction_distribution(env: Env, match_id: u64) -> (u32, u32, u32) {
        prediction::get_prediction_distribution(&env, match_id)
    }

    // =========================================================================
    // Oracle / Winner Verification (#798–#801)
    // =========================================================================

    /// Verify and record all perfect scorers for an event.
    ///
    /// After all matches in an event are resolved, calculate which users
    /// predicted all matches correctly and store them as winners.
    ///
    /// # Panics
    /// * `"contract_paused"` — contract is paused.
    /// * `"event_not_found"` — no event exists with the given ID.
    /// * `"event_cancelled"` — event has been cancelled.
    /// * `"matches_not_complete"` — not all matches have been resolved.
    pub fn verify_event_winners(env: Env, caller: Address, event_id: u64) -> u32 {
        match oracle::verify_event_winners(&env, caller, event_id) {
            Ok(count) => count,
            Err(oracle::OracleError::Paused) => panic!("contract_paused"),
            Err(oracle::OracleError::EventNotFound) => panic!("event_not_found"),
            Err(oracle::OracleError::EventCancelled) => panic!("event_cancelled"),
            Err(oracle::OracleError::MatchesNotComplete) => panic!("matches_not_complete"),
            Err(oracle::OracleError::Overflow) => panic!("overflow"),
            Err(_) => panic!("unexpected_error"),
        }
    }

    /// Retrieve the list of winners for an event.
    ///
    /// Public view function to retrieve the list of winners for an event.
    /// Used for leaderboards and rewards.
    ///
    /// # Panics
    /// * `"event_not_found"` — no event exists with the given ID.
    pub fn get_event_winners(env: Env, event_id: u64) -> Vec<Winner> {
        match oracle::get_event_winners(&env, event_id) {
            Ok(winners) => winners,
            Err(oracle::OracleError::EventNotFound) => panic!("event_not_found"),
            Err(_) => panic!("unexpected_error"),
        }
    }

    /// Calculate a user's score (correct predictions) for an event.
    ///
    /// Useful for partial scoring and leaderboards.
    ///
    /// Returns a tuple `(correct_count, total_matches)`.
    ///
    /// # Panics
    /// * `"event_not_found"` — no event exists with the given ID.
    pub fn get_user_score(env: Env, user: Address, event_id: u64) -> (u32, u32) {
        match oracle::get_user_score(&env, user, event_id) {
            Ok(score) => score,
            Err(oracle::OracleError::EventNotFound) => panic!("event_not_found"),
            Err(oracle::OracleError::Overflow) => panic!("overflow"),
            Err(_) => panic!("unexpected_error"),
        }
    }
}
