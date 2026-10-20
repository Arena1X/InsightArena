/// Admin module — contract initialization and privileged configuration.
///
/// The `initialize` function is the single entry point that must be called
/// exactly once after deployment.  It stores every piece of global config in
/// persistent storage and sets the counters to zero.
use soroban_sdk::{Address, BytesN, Env, Symbol, Vec};

use crate::storage::TTL_LEDGERS;
use crate::storage_types::DataKey;

// ---------------------------------------------------------------------------
// Error codes
// ---------------------------------------------------------------------------

/// Errors that can be returned by admin operations.
///
/// Represented as `u32` so they can be used as Soroban contract error codes.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum AdminError {
    /// `initialize` was called on an already-initialised contract.
    AlreadyInitialized = 1,
    /// One of the required addresses is the zero / default address.
    InvalidAddress = 2,
    /// `creation_fee` must be strictly positive.
    InvalidCreationFee = 3,
    /// Caller is not the contract admin.
    Unauthorized = 4,
    /// `pause` was called but the contract is already paused.
    AlreadyPaused = 5,
    /// `unpause` was called but the contract is not paused.
    NotPaused = 6,
    /// The verifier threshold (M) is `0`, or exceeds the number of configured
    /// signers (N), when calling `set_verifier_config`.
    InvalidThreshold = 7,
    /// The `signers` list passed to `set_verifier_config` contains the same
    /// address more than once.
    DuplicateSigner = 8,
    /// No pending admin nomination exists to accept or cancel (#1356).
    NoPendingNomination = 9,
    /// Caller tried to accept an admin nomination that is not addressed to them (#1356).
    NotNominee = 10,
    /// A nomination already exists; cancel it before nominating another (#1356).
    NominationPending = 11,
    /// `set_verifier_public_key` was called for an address that is not in
    /// the configured verifier signer set (#1705).
    NotAVerifierSigner = 12,
}

// ---------------------------------------------------------------------------
// Prediction lock lead-time (#1355)
// ---------------------------------------------------------------------------

/// Configure the lock lead-time (seconds before `match_time`) before which
/// predictions must be placed on newly created matches. Only the admin may
/// call this. Existing matches keep the `prediction_lock_time` computed at
/// their own creation time — this only affects matches created afterward.
///
/// # Errors
/// * [`AdminError::Unauthorized`] — caller is not the admin.
///
/// # Events
/// Emits `(Symbol("admin"), Symbol("lock_lead_updated"))` with data
/// `lock_lead_seconds`.
pub fn set_prediction_lock_lead_seconds(
    env: &Env,
    caller: Address,
    lock_lead_seconds: u64,
) -> Result<(), AdminError> {
    require_is_admin(env, &caller)?;

    let storage = env.storage().persistent();
    storage.set(&DataKey::PredictionLockLeadSeconds, &lock_lead_seconds);
    storage.extend_ttl(
        &DataKey::PredictionLockLeadSeconds,
        TTL_LEDGERS,
        TTL_LEDGERS,
    );

    env.events().publish(
        (
            Symbol::new(env, "admin"),
            Symbol::new(env, "lock_lead_updated"),
        ),
        lock_lead_seconds,
    );

    Ok(())
}

/// Return the configured prediction lock lead-time (seconds), or `0`
/// (predictions lock exactly at `match_time`) if never configured.
pub fn get_prediction_lock_lead_seconds(env: &Env) -> u64 {
    env.storage()
        .persistent()
        .get::<DataKey, u64>(&DataKey::PredictionLockLeadSeconds)
        .unwrap_or(0)
}

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

/// Initialise the contract for first use.
///
/// # Parameters
/// | Name | Description |
/// |---|---|
/// | `admin` | Contract administrator — the only address that can call privileged functions. |
/// | `ai_agent` | Oracle address authorised to submit match results. |
/// | `treasury` | Recipient of all creation fees. |
/// | `xlm_token` | Address of the native XLM token contract. |
/// | `initial_creation_fee` | Fee (in stroops) charged to creators; must be > 0. |
///
/// # Errors
/// * [`AdminError::AlreadyInitialized`] — if the contract has already been initialised.
/// * [`AdminError::InvalidAddress`] — if any address equals the contract's own address
///   (used as a proxy for "zero / unset" since Soroban has no literal zero address).
/// * [`AdminError::InvalidCreationFee`] — if `initial_creation_fee` ≤ 0.
///
/// # Storage written
/// All values are stored in **persistent** storage with a one-year TTL.
///
/// | Key | Value |
/// |---|---|
/// | `DataKey::Initialized` | `true` |
/// | `DataKey::Admin(admin)` | `admin` |
/// | `DataKey::AIAgent(ai_agent)` | `ai_agent` |
/// | `DataKey::CurrentAIAgent` | `ai_agent` |
/// | `DataKey::Treasury(treasury)` | `treasury` |
/// | `DataKey::CurrentTreasury` | `treasury` |
/// | `DataKey::XLMToken(xlm_token)` | `xlm_token` |
/// | `DataKey::CreationFee(0)` | `initial_creation_fee` |
/// | `DataKey::Paused(false)` | `false` |
///
/// Counters (`EventCounter`, `MatchCounter`, `PredictionCounter`) are written
/// to **instance** storage and set to `0`.
///
/// # Events
/// Emits a `(Symbol("admin"), Symbol("initialized"))` event with the topic
/// `[admin, ai_agent, treasury]` and data `initial_creation_fee`.
pub fn initialize(
    env: &Env,
    admin: Address,
    ai_agent: Address,
    treasury: Address,
    xlm_token: Address,
    initial_creation_fee: i128,
) -> Result<(), AdminError> {
    // ── Guard: prevent re-initialisation ────────────────────────────────────
    if is_initialized(env) {
        return Err(AdminError::AlreadyInitialized);
    }

    // ── Validate addresses ───────────────────────────────────────────────────
    // Soroban has no literal "zero address", so we use the contract's own
    // address as a sentinel for "caller passed a nonsensical value".
    // Any address that is equal to the current contract address is rejected
    // because it would create circular authority.
    let contract_self = env.current_contract_address();
    if admin == contract_self
        || ai_agent == contract_self
        || treasury == contract_self
        || xlm_token == contract_self
    {
        return Err(AdminError::InvalidAddress);
    }

    // ── Validate creation fee ────────────────────────────────────────────────
    if initial_creation_fee <= 0 {
        return Err(AdminError::InvalidCreationFee);
    }

    // ── Persist config ───────────────────────────────────────────────────────
    let storage = env.storage().persistent();

    // Initialization sentinel — checked by `is_initialized`
    storage.set(&DataKey::Initialized, &true);
    storage.extend_ttl(&DataKey::Initialized, TTL_LEDGERS, TTL_LEDGERS);

    // Admin address
    storage.set(&DataKey::Admin(admin.clone()), &admin);
    storage.extend_ttl(&DataKey::Admin(admin.clone()), TTL_LEDGERS, TTL_LEDGERS);

    // Canonical admin retrieval key
    storage.set(&DataKey::CurrentAdmin, &admin);
    storage.extend_ttl(&DataKey::CurrentAdmin, TTL_LEDGERS, TTL_LEDGERS);

    // AI agent address — address-keyed entry + canonical retrieval key
    storage.set(&DataKey::AIAgent(ai_agent.clone()), &ai_agent);
    storage.extend_ttl(
        &DataKey::AIAgent(ai_agent.clone()),
        TTL_LEDGERS,
        TTL_LEDGERS,
    );
    storage.set(&DataKey::CurrentAIAgent, &ai_agent);
    storage.extend_ttl(&DataKey::CurrentAIAgent, TTL_LEDGERS, TTL_LEDGERS);

    // Treasury address — address-keyed entry + canonical retrieval key
    storage.set(&DataKey::Treasury(treasury.clone()), &treasury);
    storage.extend_ttl(
        &DataKey::Treasury(treasury.clone()),
        TTL_LEDGERS,
        TTL_LEDGERS,
    );
    storage.set(&DataKey::CurrentTreasury, &treasury);
    storage.extend_ttl(&DataKey::CurrentTreasury, TTL_LEDGERS, TTL_LEDGERS);

    // XLM token address
    storage.set(&DataKey::XLMToken(xlm_token.clone()), &xlm_token);
    storage.extend_ttl(
        &DataKey::XLMToken(xlm_token.clone()),
        TTL_LEDGERS,
        TTL_LEDGERS,
    );
    // Canonical XLM token retrieval key
    storage.set(&DataKey::CurrentXLMToken, &xlm_token);
    storage.extend_ttl(&DataKey::CurrentXLMToken, TTL_LEDGERS, TTL_LEDGERS);

    // Creation fee — stored under a canonical key with value 0 as placeholder
    // (the actual fee is the *value*, not the key discriminant)
    storage.set(&DataKey::CreationFee(0), &initial_creation_fee);
    storage.extend_ttl(&DataKey::CreationFee(0), TTL_LEDGERS, TTL_LEDGERS);

    // Paused flag — starts as false
    storage.set(&DataKey::Paused(false), &false);
    storage.extend_ttl(&DataKey::Paused(false), TTL_LEDGERS, TTL_LEDGERS);

    // ── Initialise counters to 0 (instance storage) ──────────────────────────
    let instance = env.storage().instance();
    instance.set(&DataKey::EventCounter(0), &0u64);
    instance.set(&DataKey::MatchCounter(0), &0u64);
    instance.set(&DataKey::PredictionCounter(0), &0u64);

    // ── Emit initialization event ────────────────────────────────────────────
    env.events().publish(
        (Symbol::new(env, "admin"), Symbol::new(env, "initialized")),
        (admin, ai_agent, treasury, initial_creation_fee),
    );

    Ok(())
}

// ---------------------------------------------------------------------------
// Update creation fee
// ---------------------------------------------------------------------------

/// Update the creation fee.
///
/// # Errors
/// * [`AdminError::Unauthorized`] — caller is not the admin.
/// * [`AdminError::InvalidCreationFee`] — if `new_fee` <= 0.
///
/// # Events
/// Emits `(Symbol("admin"), Symbol("creation_fee_updated"))` with data `new_fee`.
pub fn update_creation_fee(env: &Env, caller: Address, new_fee: i128) -> Result<(), AdminError> {
    require_is_admin(env, &caller)?;

    if new_fee <= 0 {
        return Err(AdminError::InvalidCreationFee);
    }

    let storage = env.storage().persistent();
    storage.set(&DataKey::CreationFee(0), &new_fee);
    storage.extend_ttl(&DataKey::CreationFee(0), TTL_LEDGERS, TTL_LEDGERS);

    env.events().publish(
        (
            Symbol::new(env, "admin"),
            Symbol::new(env, "creation_fee_updated"),
        ),
        new_fee,
    );

    Ok(())
}

// ---------------------------------------------------------------------------
// Set treasury (#787)
// ---------------------------------------------------------------------------

/// Update the treasury address where collected fees are sent.
///
/// # Roles
/// **Treasury** is the destination for all creation fees. Only the admin may
/// change it, and the new address must not be the contract itself.
///
/// # Errors
/// * [`AdminError::Unauthorized`] — caller is not the admin.
/// * [`AdminError::InvalidAddress`] — `new_treasury` equals the contract address.
///
/// # Events
/// Emits `(Symbol("admin"), Symbol("treasury_updated"))` with data
/// `(old_treasury, new_treasury)`.
pub fn set_treasury(env: &Env, caller: Address, new_treasury: Address) -> Result<(), AdminError> {
    require_is_admin(env, &caller)?;

    if new_treasury == env.current_contract_address() {
        return Err(AdminError::InvalidAddress);
    }

    let storage = env.storage().persistent();

    let old_treasury: Address = storage
        .get::<DataKey, Address>(&DataKey::CurrentTreasury)
        .unwrap_or_else(|| panic!("not_initialized"));

    // Remove old address-keyed entry and write new one
    storage.remove(&DataKey::Treasury(old_treasury.clone()));
    storage.set(&DataKey::Treasury(new_treasury.clone()), &new_treasury);
    storage.extend_ttl(
        &DataKey::Treasury(new_treasury.clone()),
        TTL_LEDGERS,
        TTL_LEDGERS,
    );

    // Update canonical retrieval key
    storage.set(&DataKey::CurrentTreasury, &new_treasury);
    storage.extend_ttl(&DataKey::CurrentTreasury, TTL_LEDGERS, TTL_LEDGERS);

    env.events().publish(
        (
            Symbol::new(env, "admin"),
            Symbol::new(env, "treasury_updated"),
        ),
        (old_treasury, new_treasury),
    );

    Ok(())
}

// ---------------------------------------------------------------------------
// Set AI agent (#788)
// ---------------------------------------------------------------------------

/// Update the AI oracle agent address authorised to submit match results.
///
/// # Roles
/// **AI Agent** is the oracle that posts match outcomes on-chain. Only the
/// admin may change it, and the new address must not be the contract itself.
///
/// # Errors
/// * [`AdminError::Unauthorized`] — caller is not the admin.
/// * [`AdminError::InvalidAddress`] — `new_agent` equals the contract address.
///
/// # Events
/// Emits `(Symbol("admin"), Symbol("ai_agent_updated"))` with data
/// `(old_agent, new_agent)`.
pub fn set_ai_agent(env: &Env, caller: Address, new_agent: Address) -> Result<(), AdminError> {
    require_is_admin(env, &caller)?;

    if new_agent == env.current_contract_address() {
        return Err(AdminError::InvalidAddress);
    }

    let storage = env.storage().persistent();

    let old_agent: Address = storage
        .get::<DataKey, Address>(&DataKey::CurrentAIAgent)
        .unwrap_or_else(|| panic!("not_initialized"));

    // Remove old address-keyed entry and write new one
    storage.remove(&DataKey::AIAgent(old_agent.clone()));
    storage.set(&DataKey::AIAgent(new_agent.clone()), &new_agent);
    storage.extend_ttl(
        &DataKey::AIAgent(new_agent.clone()),
        TTL_LEDGERS,
        TTL_LEDGERS,
    );

    // Update canonical retrieval key
    storage.set(&DataKey::CurrentAIAgent, &new_agent);
    storage.extend_ttl(&DataKey::CurrentAIAgent, TTL_LEDGERS, TTL_LEDGERS);

    env.events().publish(
        (
            Symbol::new(env, "admin"),
            Symbol::new(env, "ai_agent_updated"),
        ),
        (old_agent, new_agent),
    );

    Ok(())
}

// ---------------------------------------------------------------------------
// Pause / Unpause (#789)
// ---------------------------------------------------------------------------

/// Halt contract operations in an emergency.
///
/// When the contract is paused, `ensure_not_paused` will panic, blocking any
/// function that calls it. Only the admin may pause.
///
/// # Errors
/// * [`AdminError::Unauthorized`] — caller is not the admin.
/// * [`AdminError::AlreadyPaused`] — contract is already paused.
///
/// # Events
/// Emits `(Symbol("admin"), Symbol("paused"))` with data `caller`.
pub fn pause(env: &Env, caller: Address) -> Result<(), AdminError> {
    require_is_admin(env, &caller)?;

    if is_paused(env) {
        return Err(AdminError::AlreadyPaused);
    }

    let storage = env.storage().persistent();
    storage.set(&DataKey::Paused(false), &true);
    storage.extend_ttl(&DataKey::Paused(false), TTL_LEDGERS, TTL_LEDGERS);

    env.events().publish(
        (Symbol::new(env, "admin"), Symbol::new(env, "paused")),
        caller,
    );

    Ok(())
}

/// Resume contract operations after a pause.
///
/// Only the admin may unpause.
///
/// # Errors
/// * [`AdminError::Unauthorized`] — caller is not the admin.
/// * [`AdminError::NotPaused`] — contract is not currently paused.
///
/// # Events
/// Emits `(Symbol("admin"), Symbol("unpaused"))` with data `caller`.
pub fn unpause(env: &Env, caller: Address) -> Result<(), AdminError> {
    require_is_admin(env, &caller)?;

    if !is_paused(env) {
        return Err(AdminError::NotPaused);
    }

    let storage = env.storage().persistent();
    storage.set(&DataKey::Paused(false), &false);
    storage.extend_ttl(&DataKey::Paused(false), TTL_LEDGERS, TTL_LEDGERS);

    env.events().publish(
        (Symbol::new(env, "admin"), Symbol::new(env, "unpaused")),
        caller,
    );

    Ok(())
}

/// Guard: panic with `"contract_paused"` if the contract is currently paused.
///
/// Call this at the start of any function that must be blocked during an
/// emergency pause (e.g. create_event, place_prediction).
pub fn ensure_not_paused(env: &Env) {
    if is_paused(env) {
        panic!("contract_paused");
    }
}

// ---------------------------------------------------------------------------
// M-of-N verifier configuration (#1358)
// ---------------------------------------------------------------------------

/// Configure the M-of-N verifier signer set used for event verification.
///
/// Replaces any previously configured signer set and threshold atomically,
/// so the two values are never observed out of sync (e.g. a stale M greater
/// than a newly-shrunk N).
///
/// # Parameters
/// * `signers` — the full set of N authorised verifier addresses.
/// * `threshold` — M, the number of distinct signers required before an
///   event is considered verified via `verification::submit_verification`.
///
/// # Errors
/// * [`AdminError::Unauthorized`] — caller is not the admin.
/// * [`AdminError::InvalidThreshold`] — `threshold == 0` or `threshold > signers.len()`.
/// * [`AdminError::DuplicateSigner`] — `signers` contains the same address twice.
///
/// # Events
/// Emits `(Symbol("admin"), Symbol("verifier_config_updated"))` with data
/// `(signer_count, threshold)`.
pub fn set_verifier_config(
    env: &Env,
    caller: Address,
    signers: Vec<Address>,
    threshold: u32,
) -> Result<(), AdminError> {
    require_is_admin(env, &caller)?;

    let signer_count = signers.len();
    if threshold == 0 || threshold > signer_count {
        return Err(AdminError::InvalidThreshold);
    }

    for i in 0..signers.len() {
        for j in (i + 1)..signers.len() {
            if signers.get(i) == signers.get(j) {
                return Err(AdminError::DuplicateSigner);
            }
        }
    }

    let storage = env.storage().persistent();
    storage.set(&DataKey::VerifierSigners, &signers);
    storage.extend_ttl(&DataKey::VerifierSigners, TTL_LEDGERS, TTL_LEDGERS);
    storage.set(&DataKey::VerifierThreshold, &threshold);
    storage.extend_ttl(&DataKey::VerifierThreshold, TTL_LEDGERS, TTL_LEDGERS);

    env.events().publish(
        (
            Symbol::new(env, "admin"),
            Symbol::new(env, "verifier_config_updated"),
        ),
        (signer_count, threshold),
    );

    Ok(())
}

/// Return the configured verifier signer set, or an empty `Vec` if
/// `set_verifier_config` has never been called.
pub fn get_verifier_signers(env: &Env) -> Vec<Address> {
    env.storage()
        .persistent()
        .get::<DataKey, Vec<Address>>(&DataKey::VerifierSigners)
        .unwrap_or_else(|| Vec::new(env))
}

/// Return the configured verifier threshold (M), or `0` if
/// `set_verifier_config` has never been called.
pub fn get_verifier_threshold(env: &Env) -> u32 {
    env.storage()
        .persistent()
        .get::<DataKey, u32>(&DataKey::VerifierThreshold)
        .unwrap_or(0)
}

// ---------------------------------------------------------------------------
// Verifier signature keys (#1705)
// ---------------------------------------------------------------------------

/// Bind a raw ed25519 public key to a configured verifier signer.
///
/// `verification::submit_verification` uses this key to check a detached
/// signature over the submitted payload, rather than trusting
/// `Address::require_auth` alone (which proves the caller controls the
/// signer's account, not that a specific piece of off-chain data — e.g. an
/// oracle attestation — was actually produced by that signer's key).
///
/// # Errors
/// * [`AdminError::Unauthorized`] — caller is not the admin.
/// * [`AdminError::NotAVerifierSigner`] — `signer` is not in the currently
///   configured verifier signer set (see `set_verifier_config`).
///
/// # Events
/// Emits `(Symbol("admin"), Symbol("verifier_key_set"))` with data `signer`.
pub fn set_verifier_public_key(
    env: &Env,
    caller: Address,
    signer: Address,
    public_key: BytesN<32>,
) -> Result<(), AdminError> {
    require_is_admin(env, &caller)?;

    if !get_verifier_signers(env).iter().any(|addr| addr == signer) {
        return Err(AdminError::NotAVerifierSigner);
    }

    let key = DataKey::VerifierPublicKey(signer.clone());
    env.storage().persistent().set(&key, &public_key);
    env.storage()
        .persistent()
        .extend_ttl(&key, TTL_LEDGERS, TTL_LEDGERS);

    env.events().publish(
        (Symbol::new(env, "admin"), Symbol::new(env, "verifier_key_set")),
        signer,
    );

    Ok(())
}

/// Return the ed25519 public key bound to a verifier signer, if any.
pub fn get_verifier_public_key(env: &Env, signer: &Address) -> Option<BytesN<32>> {
    let key = DataKey::VerifierPublicKey(signer.clone());
    let public_key = env.storage().persistent().get::<DataKey, BytesN<32>>(&key);
    if public_key.is_some() {
        env.storage()
            .persistent()
            .extend_ttl(&key, TTL_LEDGERS, TTL_LEDGERS);
    }
    public_key
}

// ---------------------------------------------------------------------------
// Two-step admin handover (#1356)
// ---------------------------------------------------------------------------

/// Nominate a new admin. The current admin remains in force until the nominee
/// explicitly accepts via [`accept_admin`].
///
/// # Errors
/// * [`AdminError::Unauthorized`] — caller is not the admin.
/// * [`AdminError::InvalidAddress`] — nominee equals the contract address.
/// * [`AdminError::NominationPending`] — a nomination is already outstanding.
///
/// # Events
/// Emits `(Symbol("admin"), Symbol("nominated"))` with data
/// `(current_admin, nominee)`.
pub fn nominate_admin(env: &Env, caller: Address, nominee: Address) -> Result<(), AdminError> {
    require_is_admin(env, &caller)?;

    if nominee == env.current_contract_address() {
        return Err(AdminError::InvalidAddress);
    }

    let storage = env.storage().persistent();
    if storage.has(&DataKey::PendingAdmin) {
        return Err(AdminError::NominationPending);
    }

    storage.set(&DataKey::PendingAdmin, &nominee);
    storage.extend_ttl(&DataKey::PendingAdmin, TTL_LEDGERS, TTL_LEDGERS);

    env.events().publish(
        (Symbol::new(env, "admin"), Symbol::new(env, "nominated")),
        (caller, nominee),
    );

    Ok(())
}

/// Accept a pending admin nomination. Only the nominated address may accept.
/// On success the previous admin loses privileges and the nominee becomes the
/// sole admin.
///
/// # Errors
/// * [`AdminError::NoPendingNomination`] — no nomination is outstanding.
/// * [`AdminError::NotNominee`] — caller is not the pending nominee.
///
/// # Events
/// Emits `(Symbol("admin"), Symbol("accepted"))` with data
/// `(old_admin, new_admin)`.
pub fn accept_admin(env: &Env, caller: Address) -> Result<(), AdminError> {
    caller.require_auth();

    let storage = env.storage().persistent();
    let nominee: Address = storage
        .get(&DataKey::PendingAdmin)
        .ok_or(AdminError::NoPendingNomination)?;

    if caller != nominee {
        return Err(AdminError::NotNominee);
    }

    let old_admin: Address = storage
        .get::<DataKey, Address>(&DataKey::CurrentAdmin)
        .unwrap_or_else(|| panic!("not_initialized"));

    // Revoke old admin key and install the new one.
    storage.remove(&DataKey::Admin(old_admin.clone()));
    storage.set(&DataKey::Admin(caller.clone()), &caller);
    storage.extend_ttl(&DataKey::Admin(caller.clone()), TTL_LEDGERS, TTL_LEDGERS);

    storage.set(&DataKey::CurrentAdmin, &caller);
    storage.extend_ttl(&DataKey::CurrentAdmin, TTL_LEDGERS, TTL_LEDGERS);

    storage.remove(&DataKey::PendingAdmin);

    env.events().publish(
        (Symbol::new(env, "admin"), Symbol::new(env, "accepted")),
        (old_admin, caller),
    );

    Ok(())
}

/// Cancel a pending admin nomination. Only the current admin may cancel.
///
/// # Errors
/// * [`AdminError::Unauthorized`] — caller is not the admin.
/// * [`AdminError::NoPendingNomination`] — no nomination is outstanding.
///
/// # Events
/// Emits `(Symbol("admin"), Symbol("cancelled"))` with data
/// `(admin, cancelled_nominee)`.
pub fn cancel_admin_nomination(env: &Env, caller: Address) -> Result<(), AdminError> {
    require_is_admin(env, &caller)?;

    let storage = env.storage().persistent();
    let nominee: Address = storage
        .get(&DataKey::PendingAdmin)
        .ok_or(AdminError::NoPendingNomination)?;

    storage.remove(&DataKey::PendingAdmin);

    env.events().publish(
        (Symbol::new(env, "admin"), Symbol::new(env, "cancelled")),
        (caller, nominee),
    );

    Ok(())
}

/// Return the pending admin nominee, if any.
pub fn get_pending_admin(env: &Env) -> Option<Address> {
    env.storage()
        .persistent()
        .get::<DataKey, Address>(&DataKey::PendingAdmin)
}

/// Return the current admin address, or `None` if not initialised.
pub fn get_admin(env: &Env) -> Option<Address> {
    env.storage()
        .persistent()
        .get::<DataKey, Address>(&DataKey::CurrentAdmin)
}

// ---------------------------------------------------------------------------
// Read helpers (used by other modules)
// ---------------------------------------------------------------------------

/// Returns `true` if the contract has already been initialised.
pub fn is_initialized(env: &Env) -> bool {
    env.storage()
        .persistent()
        .get::<DataKey, bool>(&DataKey::Initialized)
        .unwrap_or(false)
}

/// Read the current creation fee (in stroops).
///
/// Returns `None` if the contract has not been initialised.
pub fn get_creation_fee(env: &Env) -> Option<i128> {
    env.storage()
        .persistent()
        .get::<DataKey, i128>(&DataKey::CreationFee(0))
}

/// Returns `true` if the contract is currently paused.
pub fn is_paused(env: &Env) -> bool {
    env.storage()
        .persistent()
        .get::<DataKey, bool>(&DataKey::Paused(false))
        .unwrap_or(false)
}

/// Returns the current treasury address, or `None` if not yet initialised.
pub fn get_treasury(env: &Env) -> Option<Address> {
    env.storage()
        .persistent()
        .get::<DataKey, Address>(&DataKey::CurrentTreasury)
}

/// Returns the current AI agent address, or `None` if not yet initialised.
pub fn get_ai_agent(env: &Env) -> Option<Address> {
    env.storage()
        .persistent()
        .get::<DataKey, Address>(&DataKey::CurrentAIAgent)
}

/// Returns the current XLM token contract address, or `None` if not yet initialised.
pub fn get_xlm_token(env: &Env) -> Option<Address> {
    env.storage()
        .persistent()
        .get::<DataKey, Address>(&DataKey::CurrentXLMToken)
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/// Verify that `caller` is the stored admin and has authorised the call.
///
/// Calls `caller.require_auth()` (Soroban signature check) then looks up
/// `DataKey::Admin(caller)` in persistent storage. Returns
/// [`AdminError::Unauthorized`] if the address is not found.
///
/// This is the single centralized admin-role check (#1704) — other modules
/// that gate a privileged action on the admin role (e.g.
/// `oracle::configure_oracle_sources`) should call this rather than
/// re-implementing the same storage lookup inline.
pub(crate) fn require_is_admin(env: &Env, caller: &Address) -> Result<(), AdminError> {
    caller.require_auth();
    let is_admin = env
        .storage()
        .persistent()
        .get::<DataKey, Address>(&DataKey::Admin(caller.clone()))
        .is_some();
    if !is_admin {
        return Err(AdminError::Unauthorized);
    }
    Ok(())
}
