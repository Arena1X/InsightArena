use soroban_sdk::{Env, Symbol};

use crate::storage::TTL_LEDGERS;
use crate::storage_types::{DataKey, InviteCodeData};

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum InviteError {
    /// Could not generate a unique code within the maximum retry count.
    CodeGenerationFailed = 1,
    /// No event is associated with this invite code.
    InvalidCode = 2,
    /// The code's `expires_at` has passed.
    CodeExpired = 3,
    /// The code has already been redeemed `max_uses` times.
    CodeUsesExceeded = 4,
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/// Characters used in invite codes: A-Z then 0-9 (36 total).
const ALPHABET: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

/// Maximum attempts before giving up on unique code generation.
const MAX_RETRIES: u32 = 10;

// ---------------------------------------------------------------------------
// Public helper
// ---------------------------------------------------------------------------

/// Generate a unique 8-character alphanumeric invite code.
///
/// Uses `env.prng()` to produce random values and base-36 encodes them into
/// the character set [A-Z0-9].  Checks the `InviteCode` storage index for
/// collisions and retries up to [`MAX_RETRIES`] times.
///
/// Returns the generated `Symbol` on success, or
/// [`InviteError::CodeGenerationFailed`] if every attempt collided.
pub fn generate_invite_code(env: &Env) -> Result<Symbol, InviteError> {
    for _ in 0..MAX_RETRIES {
        // Draw a random u64 from the environment PRNG.
        let rand: u64 = env.prng().gen();

        // Base-36 encode 8 digits into the ALPHABET.
        let mut code_bytes = [0u8; 8];
        let mut val = rand;
        for byte in code_bytes.iter_mut() {
            *byte = ALPHABET[(val % 36) as usize];
            val /= 36;
        }

        // SAFETY: every byte is drawn from ALPHABET which is pure ASCII.
        let code_str = unsafe { core::str::from_utf8_unchecked(&code_bytes) };
        let code = Symbol::new(env, code_str);

        // Accept only if this code has not been assigned to an event yet.
        if !env
            .storage()
            .persistent()
            .has(&DataKey::InviteCode(code.clone()))
        {
            return Ok(code);
        }
    }

    Err(InviteError::CodeGenerationFailed)
}

// ---------------------------------------------------------------------------
// InviteCodeData storage (#1699)
// ---------------------------------------------------------------------------

/// Persist a code's [`InviteCodeData`] and set its TTL.
pub fn set_invite_data(env: &Env, code: &Symbol, data: &InviteCodeData) {
    let key = DataKey::InviteCode(code.clone());
    env.storage().persistent().set(&key, data);
    env.storage()
        .persistent()
        .extend_ttl(&key, TTL_LEDGERS, TTL_LEDGERS);
}

/// Read a code's [`InviteCodeData`], extending its TTL on success.
pub fn get_invite_data(env: &Env, code: &Symbol) -> Result<InviteCodeData, InviteError> {
    let key = DataKey::InviteCode(code.clone());
    match env
        .storage()
        .persistent()
        .get::<DataKey, InviteCodeData>(&key)
    {
        Some(data) => {
            env.storage()
                .persistent()
                .extend_ttl(&key, TTL_LEDGERS, TTL_LEDGERS);
            Ok(data)
        }
        None => Err(InviteError::InvalidCode),
    }
}

// ---------------------------------------------------------------------------
// redeem (#1699)
// ---------------------------------------------------------------------------

/// Validate and atomically redeem an invite code, returning the event_id it
/// grants entry to.
///
/// Checks (in order):
/// 1. The code exists ([`InviteError::InvalidCode`]).
/// 2. The code has not expired ([`InviteError::CodeExpired`]).
/// 3. The code has not reached its use cap ([`InviteError::CodeUsesExceeded`]).
///
/// On success, `use_count` is incremented and persisted before returning, so
/// the increment and the validity checks happen atomically within a single
/// redemption — there is no window where two concurrent redemptions could
/// both read the same `use_count` and each believe they are under the cap.
pub fn redeem(env: &Env, code: &Symbol, current_time: u64) -> Result<u64, InviteError> {
    let mut data = get_invite_data(env, code)?;

    if data.is_expired(current_time) {
        return Err(InviteError::CodeExpired);
    }
    if data.is_at_cap() {
        return Err(InviteError::CodeUsesExceeded);
    }

    data.use_count += 1;
    set_invite_data(env, code, &data);

    Ok(data.event_id)
}
