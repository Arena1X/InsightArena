//! Admin-controlled vault configuration: the unstake cooldown (issue #2198)
//! and the emergency pause (issue #2200).
//!
//! # Unstake cooldown
//! The cooldown is the number of seconds that must pass between
//! `request_unstake` and `complete_unstake`. While it is non-zero the
//! immediate `unstake` path is disabled, so a staker can no longer jump in and
//! out of the pool around a reward deposit. A cooldown of `0` (the default)
//! keeps the original immediate-unstake behaviour.
//!
//! # Emergency pause
//! While the vault is paused every user-facing state change is blocked:
//! `stake`, `unstake`, `request_unlock`, `withdraw`, `request_unstake`,
//! `complete_unstake`, `claim_rewards` and `deposit_fees` all revert with
//! [`StakingError::Paused`]. Funds stay in the vault and become withdrawable
//! again as soon as the admin unpauses. Only the configured admin may pause or
//! unpause.

use soroban_sdk::{Env, Symbol};

use crate::errors::StakingError;
use crate::storage_types::{Config, DataKey};

/// Upper bound for the unstake cooldown (~90 days) so a misconfiguration can
/// never lock stakers out indefinitely.
pub const MAX_UNSTAKE_COOLDOWN: u64 = 90 * 86_400;

/// Cooldown applied when the admin has never configured one.
pub const DEFAULT_UNSTAKE_COOLDOWN: u64 = 0;

fn admin_config(env: &Env) -> Result<Config, StakingError> {
    env.storage()
        .instance()
        .get::<DataKey, Config>(&DataKey::Config)
        .ok_or(StakingError::NotInitialized)
}

/// Require the stored admin to authorize the current call.
pub fn require_admin(env: &Env) -> Result<(), StakingError> {
    let config = admin_config(env)?;
    config.admin.require_auth();
    Ok(())
}

// ── Unstake cooldown ─────────────────────────────────────────────────────────

/// Return the configured unstake cooldown in seconds.
pub fn unstake_cooldown(env: &Env) -> u64 {
    env.storage()
        .instance()
        .get::<DataKey, u64>(&DataKey::UnstakeCooldown)
        .unwrap_or(DEFAULT_UNSTAKE_COOLDOWN)
}

/// Set the unstake cooldown. Admin only; rejects values above
/// [`MAX_UNSTAKE_COOLDOWN`] with [`StakingError::InvalidCooldown`].
pub fn set_unstake_cooldown(env: &Env, cooldown: u64) -> Result<(), StakingError> {
    require_admin(env)?;

    if cooldown > MAX_UNSTAKE_COOLDOWN {
        return Err(StakingError::InvalidCooldown);
    }

    env.storage()
        .instance()
        .set(&DataKey::UnstakeCooldown, &cooldown);

    env.events().publish(
        (Symbol::new(env, "config"), Symbol::new(env, "cooldown_set")),
        cooldown,
    );

    Ok(())
}

/// Gate a cooldown withdrawal: allowed at `available_at` and any time after,
/// rejected with [`StakingError::WithdrawalLocked`] before.
pub fn enforce_cooldown(now: u64, available_at: u64) -> Result<(), StakingError> {
    if now < available_at {
        return Err(StakingError::WithdrawalLocked);
    }
    Ok(())
}

// ── Emergency pause ──────────────────────────────────────────────────────────

/// Return whether the vault is currently paused.
pub fn is_paused(env: &Env) -> bool {
    env.storage()
        .instance()
        .get::<DataKey, bool>(&DataKey::Paused)
        .unwrap_or(false)
}

/// Revert with [`StakingError::Paused`] while the vault is paused.
pub fn require_not_paused(env: &Env) -> Result<(), StakingError> {
    if is_paused(env) {
        return Err(StakingError::Paused);
    }
    Ok(())
}

/// Set the pause flag. Admin only. The admin must authorize before the flag
/// is written, so a non-admin caller leaves it unchanged.
pub fn set_paused(env: &Env, paused: bool) -> Result<(), StakingError> {
    require_admin(env)?;

    env.storage().instance().set(&DataKey::Paused, &paused);

    let action = if paused { "paused" } else { "unpaused" };
    env.events()
        .publish((Symbol::new(env, "vault"), Symbol::new(env, action)), paused);

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::enforce_cooldown;
    use crate::errors::StakingError;

    const AVAILABLE_AT: u64 = 1_700_000_000;

    #[test]
    fn cooldown_withdrawal_before_available_at_is_rejected() {
        assert_eq!(
            enforce_cooldown(AVAILABLE_AT - 1, AVAILABLE_AT),
            Err(StakingError::WithdrawalLocked)
        );
    }

    #[test]
    fn cooldown_withdrawal_at_or_after_available_at_succeeds() {
        assert_eq!(enforce_cooldown(AVAILABLE_AT, AVAILABLE_AT), Ok(()));
        assert_eq!(enforce_cooldown(AVAILABLE_AT + 1, AVAILABLE_AT), Ok(()));
    }
}
