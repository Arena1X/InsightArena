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
use soroban_sdk::{Address, Env, Symbol, Vec};

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

/// Submit a verifier signature for an event.
///
/// `signer` must be one of the addresses configured via
/// `admin::set_verifier_config`. Each signer may submit at most once per
/// event — a second submission from the same signer is rejected. Once `M`
/// (the configured threshold) distinct signers have submitted, the event is
/// considered verified; see [`is_event_verified`].
///
/// # Errors
/// * [`VerificationError::EventNotFound`] — no event exists for `event_id`.
/// * [`VerificationError::NotAVerifierSigner`] — `signer` is not in the
///   configured verifier signer set.
/// * [`VerificationError::DuplicateSigner`] — `signer` already submitted
///   verification for this event.
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
) -> Result<u32, VerificationError> {
    signer.require_auth();

    if crate::storage::get_event(env, event_id).is_err() {
        return Err(VerificationError::EventNotFound);
    }

    let configured_signers = crate::admin::get_verifier_signers(env);
    if !configured_signers.iter().any(|addr| addr == signer) {
        return Err(VerificationError::NotAVerifierSigner);
    }

    let mut submitted = crate::storage::get_event_verification_signers(env, event_id);
    if submitted.iter().any(|addr| addr == signer) {
        return Err(VerificationError::DuplicateSigner);
    }

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
// Private helpers
// ---------------------------------------------------------------------------

fn require_is_admin(env: &Env, caller: &Address) -> Result<(), VerificationError> {
    caller.require_auth();
    let is_admin = env
        .storage()
        .persistent()
        .get::<DataKey, Address>(&DataKey::Admin(caller.clone()))
        .is_some();
    if !is_admin {
        return Err(VerificationError::Unauthorized);
    }
    Ok(())
}
