/// Verification module — admin-controlled address whitelisting.
///
/// Provides functions for the admin to grant or revoke verification status for
/// specific addresses (e.g., creator whitelisting, special permissions) and a
/// public view function for checking verification status.
///
/// Verification status is stored persistently under `DataKey::VerifiedAddresses(address)`
/// and is independent of other contract state. Any address can be verified or
/// unverified by the admin at any time, enabling flexible access control for
/// features that require whitelisted participants.
use soroban_sdk::{Address, Bytes, BytesN, Env, Symbol, Vec};

use crate::storage::TTL_LEDGERS;
use crate::storage_types::DataKey;

// ---------------------------------------------------------------------------
// Error codes
// ---------------------------------------------------------------------------

/// Errors returned by verification operations.
///
/// Represented as `u32` so they can be used as Soroban contract error codes.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum VerificationError {
    /// Caller is not the contract admin.
    Unauthorized = 1,
    /// The address equals the contract's own address (invalid sentinel).
    InvalidAddress = 2,
    /// Address is already verified; cannot verify again.
    AlreadyVerified = 3,
    /// Address is not currently verified; cannot unverify.
    NotVerified = 4,
    /// The list of addresses passed to batch verify is empty.
    EmptyList = 5,
    /// The caller is not in the configured verifier signer set.
    NotAVerifierSigner = 6,
    /// This signer has already submitted verification for this event.
    DuplicateSigner = 7,
    /// No event exists for the given event_id.
    EventNotFound = 8,
    /// No ed25519 public key has been bound to this signer via
    /// `admin::set_verifier_public_key` (#1705).
    NoPublicKeyConfigured = 9,
    /// The supplied signature does not verify against the signer's bound
    /// public key and the event-bound payload (#1705).
    InvalidSignature = 10,
    /// No match exists for the given match_id (#1515).
    MatchNotFound = 11,
    /// No result is currently staged for this match — either
    /// `oracle::submit_match_result` has not been called yet, or no verifier
    /// threshold is configured (in which case results finalize immediately
    /// and are never staged) (#1515).
    NoPendingResult = 12,
}

impl From<crate::oracle::OracleError> for VerificationError {
    fn from(_: crate::oracle::OracleError) -> Self {
        // Only reachable via `finalize_match_result`, which cannot fail once
        // a `PendingMatchResult` has already been validated and staged (the
        // scoreline and match existence were already checked at submission
        // time); kept as a safety net rather than panicking.
        VerificationError::MatchNotFound
    }
}

// ---------------------------------------------------------------------------
// verify_address (#790)
// ---------------------------------------------------------------------------

/// Grant verification status to a single address.
///
/// Verification enables access-control checks elsewhere in the contract (e.g.,
/// creator whitelisting). Only the admin may call this.
///
/// # Errors
/// * [`VerificationError::Unauthorized`] — caller is not the admin.
/// * [`VerificationError::InvalidAddress`] — address equals the contract address.
/// * [`VerificationError::AlreadyVerified`] — address is already verified.
///
/// # Events
/// Emits `(Symbol("verification"), Symbol("address_verified"))` with data `address`.
pub fn verify_address(
    env: &Env,
    caller: Address,
    address: Address,
) -> Result<(), VerificationError> {
    require_is_admin(env, &caller)?;

    if address == env.current_contract_address() {
        return Err(VerificationError::InvalidAddress);
    }

    let storage = env.storage().persistent();
    let key = DataKey::VerifiedAddresses(address.clone());

    if storage.get::<DataKey, bool>(&key).unwrap_or(false) {
        return Err(VerificationError::AlreadyVerified);
    }

    storage.set(&key, &true);
    storage.extend_ttl(&key, TTL_LEDGERS, TTL_LEDGERS);

    env.events().publish(
        (
            Symbol::new(env, "verification"),
            Symbol::new(env, "address_verified"),
        ),
        address,
    );

    Ok(())
}

// ---------------------------------------------------------------------------
// batch_verify_addresses (#791)
// ---------------------------------------------------------------------------

/// Grant verification status to multiple addresses in a single transaction.
///
/// All addresses are validated upfront before any state is written. Already-
/// verified addresses are silently skipped; only newly verified addresses
/// increment the returned success count. Useful for onboarding multiple creators
/// efficiently.
///
/// # Parameters
/// * `addresses` — must be non-empty; each address must not equal the contract address.
///
/// # Returns
/// The number of addresses that were newly verified in this call.
///
/// # Errors
/// * [`VerificationError::Unauthorized`] — caller is not the admin.
/// * [`VerificationError::EmptyList`] — `addresses` is empty.
/// * [`VerificationError::InvalidAddress`] — any address in the list equals the contract address.
///
/// # Events
/// Emits `(Symbol("verification"), Symbol("batch_verified"))` with data
/// `success_count` (the number of newly verified addresses).
pub fn batch_verify_addresses(
    env: &Env,
    caller: Address,
    addresses: Vec<Address>,
) -> Result<u32, VerificationError> {
    require_is_admin(env, &caller)?;

    if addresses.is_empty() {
        return Err(VerificationError::EmptyList);
    }

    let contract_self = env.current_contract_address();

    // Validate all addresses upfront before writing any state.
    for addr in addresses.iter() {
        if addr == contract_self {
            return Err(VerificationError::InvalidAddress);
        }
    }

    let storage = env.storage().persistent();
    let mut success_count: u32 = 0;

    for addr in addresses.iter() {
        let key = DataKey::VerifiedAddresses(addr.clone());
        if !storage.get::<DataKey, bool>(&key).unwrap_or(false) {
            storage.set(&key, &true);
            storage.extend_ttl(&key, TTL_LEDGERS, TTL_LEDGERS);
            success_count += 1;
        }
    }

    env.events().publish(
        (
            Symbol::new(env, "verification"),
            Symbol::new(env, "batch_verified"),
        ),
        success_count,
    );

    Ok(success_count)
}

// ---------------------------------------------------------------------------
// unverify_address (#792)
// ---------------------------------------------------------------------------

/// Remove verification status from an address.
///
/// Important for revoking access when a creator's verification should be
/// withdrawn. Only the admin may call this.
///
/// # Errors
/// * [`VerificationError::Unauthorized`] — caller is not the admin.
/// * [`VerificationError::InvalidAddress`] — address equals the contract address.
/// * [`VerificationError::NotVerified`] — address is not currently verified.
///
/// # Events
/// Emits `(Symbol("verification"), Symbol("address_unverified"))` with data `address`.
pub fn unverify_address(
    env: &Env,
    caller: Address,
    address: Address,
) -> Result<(), VerificationError> {
    require_is_admin(env, &caller)?;

    if address == env.current_contract_address() {
        return Err(VerificationError::InvalidAddress);
    }

    let storage = env.storage().persistent();
    let key = DataKey::VerifiedAddresses(address.clone());

    if !storage.get::<DataKey, bool>(&key).unwrap_or(false) {
        return Err(VerificationError::NotVerified);
    }

    storage.set(&key, &false);
    storage.extend_ttl(&key, TTL_LEDGERS, TTL_LEDGERS);

    env.events().publish(
        (
            Symbol::new(env, "verification"),
            Symbol::new(env, "address_unverified"),
        ),
        address,
    );

    Ok(())
}

// ---------------------------------------------------------------------------
// is_verified (#793)
// ---------------------------------------------------------------------------

/// Check whether an address has been verified.
///
/// Public view function — no authentication required. Returns `false` for any
/// address that has never been verified or whose key does not exist in storage.
///
/// # Usage
/// ```ignore
/// let verified = is_verified(&env, user_address);
/// if !verified {
///     panic!("creator_not_verified");
/// }
/// ```
pub fn is_verified(env: &Env, address: Address) -> bool {
    env.storage()
        .persistent()
        .get::<DataKey, bool>(&DataKey::VerifiedAddresses(address))
        .unwrap_or(false)
}

// ---------------------------------------------------------------------------
// M-of-N event verification (#1358)
// ---------------------------------------------------------------------------

/// Build the payload a verifier signs for [`submit_verification`]: the
/// `event_id` as 8 big-endian bytes followed by the caller-supplied
/// attestation `data`. Binding `event_id` into the signed bytes means a
/// signature produced for one event cannot be replayed to verify a
/// different one.
fn verification_payload(env: &Env, event_id: u64, data: &Bytes) -> Bytes {
    let mut payload = Bytes::from_array(env, &event_id.to_be_bytes());
    payload.append(data);
    payload
}

/// Build the payload a verifier signs for [`submit_match_verification`]: a
/// domain-separator byte (`0x01`) followed by the `match_id` as 8
/// big-endian bytes and the caller-supplied `data`. The leading byte
/// distinguishes match-result attestations from event attestations built by
/// [`verification_payload`], so a signature produced for `submit_verification`
/// cannot be replayed as a match verification even when an `event_id` and a
/// `match_id` happen to share the same numeric value.
fn match_verification_payload(env: &Env, match_id: u64, data: &Bytes) -> Bytes {
    let mut payload = Bytes::from_array(env, &[0x01u8]);
    payload.append(&Bytes::from_array(env, &match_id.to_be_bytes()));
    payload.append(data);
    payload
}

/// Submit a signed verifier attestation for an event.
///
/// `signer` must be one of the addresses configured via
/// `admin::set_verifier_config`, with an ed25519 public key bound via
/// `admin::set_verifier_public_key`. `signature` must be a valid ed25519
/// signature, by that bound key, over the payload
/// `event_id (8 bytes, big-endian) || data` — see [`verification_payload`].
/// Binding `event_id` into the signed payload means a signature cannot be
/// replayed against a different event even if `data` happens to match.
///
/// Each signer may submit at most once per event — a second submission from
/// the same signer is rejected. Once `M` (the configured threshold) distinct
/// signers have submitted, the event is considered verified; see
/// [`is_event_verified`].
///
/// # Errors
/// * [`VerificationError::EventNotFound`] — no event exists for `event_id`.
/// * [`VerificationError::NotAVerifierSigner`] — `signer` is not in the
///   configured verifier signer set.
/// * [`VerificationError::NoPublicKeyConfigured`] — `signer` has no ed25519
///   public key bound via `admin::set_verifier_public_key`.
/// * [`VerificationError::DuplicateSigner`] — `signer` already submitted
///   verification for this event.
/// * Panics if `signature` does not verify against the signer's bound public
///   key and the event-bound payload (an invalid ed25519 signature aborts
///   the transaction rather than returning an error, per
///   `env.crypto().ed25519_verify`).
///
/// # Returns
/// The number of distinct signers who have now submitted for this event.
///
/// # Events
/// Emits `(Symbol("verification"), Symbol("event_signed"))` with data
/// `(event_id, signer, distinct_signer_count)`.
pub fn submit_verification(
    env: &Env,
    event_id: u64,
    signer: Address,
    data: Bytes,
    signature: BytesN<64>,
) -> Result<u32, VerificationError> {
    signer.require_auth();

    if crate::storage::get_event(env, event_id).is_err() {
        return Err(VerificationError::EventNotFound);
    }

    let configured_signers = crate::admin::get_verifier_signers(env);
    if !configured_signers.iter().any(|addr| addr == signer) {
        return Err(VerificationError::NotAVerifierSigner);
    }

    let public_key = crate::admin::get_verifier_public_key(env, &signer)
        .ok_or(VerificationError::NoPublicKeyConfigured)?;

    let mut submitted = crate::storage::get_event_verification_signers(env, event_id);
    if submitted.iter().any(|addr| addr == signer) {
        return Err(VerificationError::DuplicateSigner);
    }

    // Reverts (panics) the whole call if the signature does not verify
    // against `signer`'s bound key and the event-bound payload.
    let payload = verification_payload(env, event_id, &data);
    env.crypto().ed25519_verify(&public_key, &payload, &signature);

    crate::storage::add_event_verification_signer(env, event_id, &signer);
    submitted.push_back(signer.clone());
    let distinct_count = submitted.len();

    env.events().publish(
        (
            Symbol::new(env, "verification"),
            Symbol::new(env, "event_signed"),
        ),
        (event_id, signer, distinct_count),
    );

    Ok(distinct_count)
}

/// Return `true` once at least `M` (the configured threshold) distinct
/// verifier signers have submitted verification for this event via
/// [`submit_verification`].
///
/// Returns `false` if no verifier config has ever been set (threshold
/// defaults to `0`, which can never be "reached").
pub fn is_event_verified(env: &Env, event_id: u64) -> bool {
    let threshold = crate::admin::get_verifier_threshold(env);
    if threshold == 0 {
        return false;
    }
    crate::storage::get_event_verification_signers(env, event_id).len() >= threshold
}

/// Return the number of distinct verifier signers who have submitted
/// verification for an event so far.
pub fn get_event_verification_count(env: &Env, event_id: u64) -> u32 {
    crate::storage::get_event_verification_signers(env, event_id).len()
}

// ---------------------------------------------------------------------------
// Per-match M-of-N result verification (#1515)
// ---------------------------------------------------------------------------

/// Submit a signed verifier attestation for a match's staged pending result.
///
/// `signer` must be one of the addresses configured via
/// `admin::set_verifier_config`, with an ed25519 public key bound via
/// `admin::set_verifier_public_key`. `signature` must be a valid ed25519
/// signature, by that bound key, over the payload
/// `match_id (8 bytes, big-endian) || data` (see [`verification_payload`]) —
/// binding `match_id` into the signed payload means a signature cannot be
/// replayed against a different match even if `data` happens to match.
///
/// Each signer may submit at most once per match's pending result — a second
/// submission from the same signer is rejected. Once `M` (the configured
/// `admin::get_verifier_threshold`) distinct signers have submitted, the
/// staged result is finalized exactly as [`crate::oracle::submit_match_result`]
/// would finalize it directly when no threshold is configured: the winning
/// outcome is recorded, every prediction for the match is graded, and the
/// event's weighted standings are recomputed.
///
/// # Errors
/// * [`VerificationError::MatchNotFound`] — no match exists for `match_id`.
/// * [`VerificationError::NoPendingResult`] — no result is currently staged
///   for this match (either it was never submitted, or no verifier threshold
///   is configured so results finalize immediately without staging).
/// * [`VerificationError::NotAVerifierSigner`] — `signer` is not in the
///   configured verifier signer set.
/// * [`VerificationError::NoPublicKeyConfigured`] — `signer` has no ed25519
///   public key bound via `admin::set_verifier_public_key`.
/// * [`VerificationError::DuplicateSigner`] — `signer` already submitted
///   verification for this match's pending result.
/// * Panics if `signature` does not verify against the signer's bound public
///   key and the match-bound payload.
///
/// # Returns
/// The number of distinct signers who have now submitted for this match's
/// pending result.
///
/// # Events
/// Emits `(Symbol("verification"), Symbol("match_signed"))` with data
/// `(match_id, signer, distinct_signer_count)`. If this submission reaches
/// the threshold, also emits `(Symbol("match"), Symbol("result_submitted"))`
/// via the shared finalization path.
pub fn submit_match_verification(
    env: &Env,
    match_id: u64,
    signer: Address,
    data: Bytes,
    signature: BytesN<64>,
) -> Result<u32, VerificationError> {
    signer.require_auth();

    crate::storage::get_match(env, match_id).map_err(|_| VerificationError::MatchNotFound)?;

    let pending = crate::storage::get_pending_match_result(env, match_id)
        .ok_or(VerificationError::NoPendingResult)?;

    let configured_signers = crate::admin::get_verifier_signers(env);
    if !configured_signers.iter().any(|addr| addr == signer) {
        return Err(VerificationError::NotAVerifierSigner);
    }

    let public_key = crate::admin::get_verifier_public_key(env, &signer)
        .ok_or(VerificationError::NoPublicKeyConfigured)?;

    let mut submitted = crate::storage::get_match_verification_signers(env, match_id);
    if submitted.iter().any(|addr| addr == signer) {
        return Err(VerificationError::DuplicateSigner);
    }

    // Reverts (panics) the whole call if the signature does not verify
    // against `signer`'s bound key and the match-bound payload.
    let payload = match_verification_payload(env, match_id, &data);
    env.crypto().ed25519_verify(&public_key, &payload, &signature);

    crate::storage::add_match_verification_signer(env, match_id, &signer);
    submitted.push_back(signer.clone());
    let distinct_count = submitted.len();

    env.events().publish(
        (
            Symbol::new(env, "verification"),
            Symbol::new(env, "match_signed"),
        ),
        (match_id, signer.clone(), distinct_count),
    );

    let threshold = crate::admin::get_verifier_threshold(env);
    if distinct_count >= threshold {
        let match_record = crate::storage::get_match(env, match_id)
            .map_err(|_| VerificationError::MatchNotFound)?;

        crate::oracle::finalize_match_result(
            env,
            match_record,
            match_id,
            pending.submitted_by,
            pending.home_score,
            pending.away_score,
            env.ledger().timestamp(),
        )?;

        crate::storage::remove_pending_match_result(env, match_id);
    }

    Ok(distinct_count)
}

/// Return `true` once at least `M` (the configured threshold) distinct
/// verifier signers have submitted verification for a match's pending
/// result. Returns `false` if no result is currently staged for this match
/// (including once it has already finalized — the pending record is removed
/// at that point).
pub fn is_match_verified(env: &Env, match_id: u64) -> bool {
    let threshold = crate::admin::get_verifier_threshold(env);
    if threshold == 0 || crate::storage::get_pending_match_result(env, match_id).is_none() {
        return false;
    }
    crate::storage::get_match_verification_signers(env, match_id).len() >= threshold
}

/// Return the number of distinct verifier signers who have submitted
/// verification for a match's pending result so far.
pub fn get_match_verification_count(env: &Env, match_id: u64) -> u32 {
    crate::storage::get_match_verification_signers(env, match_id).len()
}

// ---------------------------------------------------------------------------
// Finalization challenge (#1344)
// ---------------------------------------------------------------------------

/// Challenge a recently finalized event result and slash the finalizer's bond.
///
/// **Documented slash rule:** on success, **100%** of the locked finalization
/// bond is transferred to the contract treasury. The bond record is marked
/// `challenged` and `settled` so it cannot be returned later.
///
/// Only the contract admin or a configured verifier signer may challenge,
/// and only while the challenge window is still open.
///
/// # Errors
/// Mapped onto [`crate::event::EventError`] by the contract entry point:
/// * `UnauthorizedChallenge` — caller is neither admin nor a verifier signer.
/// * `BondNotFound` — event was never finalized with a bond.
/// * `BondAlreadySettled` — bond already challenged or returned.
/// * `ChallengeWindowClosed` — the challenge window has elapsed.
/// * `TransferFailed` — treasury transfer failed.
pub fn challenge_finalization(
    env: &Env,
    challenger: Address,
    event_id: u64,
) -> Result<i128, crate::event::EventError> {
    use crate::event::EventError;
    use crate::storage_types::FINALIZATION_CHALLENGE_WINDOW_SECONDS;
    use crate::token::TokenHelper;

    challenger.require_auth();

    let is_admin = env
        .storage()
        .persistent()
        .get::<DataKey, Address>(&DataKey::Admin(challenger.clone()))
        .is_some();
    let is_verifier = crate::admin::get_verifier_signers(env)
        .iter()
        .any(|addr| addr == challenger);
    if !is_admin && !is_verifier {
        return Err(EventError::UnauthorizedChallenge);
    }

    let mut bond =
        crate::storage::get_finalization_bond(env, event_id).ok_or(EventError::BondNotFound)?;

    if bond.settled || bond.challenged {
        return Err(EventError::BondAlreadySettled);
    }

    let now = env.ledger().timestamp();
    let window_end = bond
        .finalized_at
        .saturating_add(FINALIZATION_CHALLENGE_WINDOW_SECONDS);
    if now >= window_end {
        return Err(EventError::ChallengeWindowClosed);
    }

    let treasury = crate::admin::get_treasury(env).unwrap_or_else(|| panic!("not_initialized"));
    let xlm_token = crate::admin::get_xlm_token(env).unwrap_or_else(|| panic!("not_initialized"));

    // Slash rule: 100% of the bond → treasury.
    TokenHelper::distribute_winnings(env, &xlm_token, &treasury, bond.bond)
        .map_err(|_| EventError::TransferFailed)?;

    bond.challenged = true;
    bond.settled = true;
    crate::storage::set_finalization_bond(env, &bond);

    env.events().publish(
        (
            Symbol::new(env, "verification"),
            Symbol::new(env, "bond_slashed"),
        ),
        (event_id, challenger, bond.finalizer.clone(), bond.bond),
    );

    Ok(bond.bond)
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

fn require_is_admin(env: &Env, caller: &Address) -> Result<(), VerificationError> {
    crate::admin::require_is_admin(env, caller).map_err(|_| VerificationError::Unauthorized)
}
