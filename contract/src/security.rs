use soroban_sdk::Env;

use crate::errors::InsightArenaError;
use crate::storage_types::DataKey;

/// Acquire temporary escrow lock. Panics with `Paused` if already locked.
///
/// Temporary storage auto-expires per ledger, preventing persistent state leaks.
pub fn acquire_escrow_lock(env: &Env) -> Result<(), InsightArenaError> {
    if env.storage().temporary().has(&DataKey::EscrowLock) {
        return Err(InsightArenaError::Paused);
    }

    env.storage().temporary().set(&DataKey::EscrowLock, &true);
    Ok(())
}

/// Release temporary escrow lock.
pub fn release_escrow_lock(env: &Env) {
    env.storage().temporary().remove(&DataKey::EscrowLock);
}

/// Test helper: Simulate reentrant escrow call (demonstrates guard)
#[cfg(test)]
pub fn test_simulate_reentrant_call(env: &Env) -> Result<(), InsightArenaError> {
    acquire_escrow_lock(env)?;
    // Simulate token contract callback here
    let result = acquire_escrow_lock(env);
    release_escrow_lock(env);
    result
}
