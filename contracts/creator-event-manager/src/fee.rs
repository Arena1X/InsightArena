use soroban_sdk::{Address, Env, Symbol};

use crate::admin;
use crate::storage::{self, TTL_LEDGERS};
use crate::storage_types::{CreatorVestingSchedule, DataKey, MAX_FEE_BPS};
use crate::token::TokenHelper;

/// Errors for fee module operations.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum FeeError {
    Paused = 1,
    Unauthorized = 2,
    InvalidAddress = 3,
    InvalidAmount = 4,
    InsufficientBalance = 5,
    TransferFailed = 6,
    /// `set_creator_vesting_config` called with a share > 10000 bps.
    InvalidConfig = 7,
    /// No vesting schedule exists for the given (creator, event_id).
    NoVestingSchedule = 8,
    /// The vesting schedule has already reached its terminal state (fully
    /// claimed or forfeited).
    AlreadySettled = 9,
    /// `claim_vested_revenue` called before any additional amount has
    /// unlocked since the last claim.
    NothingToClaim = 10,
    /// A fee/share computation overflowed `i128` — guards against corrupt or
    /// adversarial inputs on very large pools rather than panicking.
    Overflow = 11,
}

/// Compute `amount * share_bps / MAX_FEE_BPS` using checked arithmetic.
///
/// This is the single bounded, overflow-safe fee/share calculation used
/// throughout the contract (e.g. splitting a creator's leftover prize-pool
/// revenue into an immediate payout and a vested portion). `share_bps` must
/// already have been validated to be `<= MAX_FEE_BPS` by the caller (see
/// [`set_creator_vesting_config`]) — this function additionally re-checks the
/// bound defensively and rejects it with [`FeeError::InvalidConfig`].
///
/// # Errors
/// * [`FeeError::InvalidConfig`] — `share_bps > MAX_FEE_BPS`.
/// * [`FeeError::Overflow`] — the multiplication overflowed `i128` (only
///   possible for pathologically large `amount` values).
pub fn calculate_bounded_fee(amount: i128, share_bps: u32) -> Result<i128, FeeError> {
    if share_bps > MAX_FEE_BPS {
        return Err(FeeError::InvalidConfig);
    }

    amount
        .checked_mul(share_bps as i128)
        .and_then(|scaled| scaled.checked_div(MAX_FEE_BPS as i128))
        .ok_or(FeeError::Overflow)
}

/// Return the XLM balance of the configured treasury address.
pub fn get_treasury_balance(env: &Env) -> i128 {
    let treasury = admin::get_treasury(env).unwrap_or_else(|| panic!("not_initialized"));
    let xlm_token = admin::get_xlm_token(env).unwrap_or_else(|| panic!("not_initialized"));
    TokenHelper::get_balance(env, &xlm_token, &treasury)
}

/// Withdraw XLM from the treasury to `to` address. Only admin may call.
pub fn withdraw_fees(
    env: &Env,
    caller: Address,
    to: Address,
    amount: i128,
) -> Result<(), FeeError> {
    // Verify not paused
    if admin::is_paused(env) {
        return Err(FeeError::Paused);
    }

    // Verify caller is admin
    caller.require_auth();
    let is_admin = env
        .storage()
        .persistent()
        .get::<DataKey, Address>(&DataKey::Admin(caller.clone()))
        .is_some();
    if !is_admin {
        return Err(FeeError::Unauthorized);
    }

    // Validate `to` address
    if to == env.current_contract_address() {
        return Err(FeeError::InvalidAddress);
    }

    if amount <= 0 {
        return Err(FeeError::InvalidAmount);
    }

    let treasury = admin::get_treasury(env).unwrap_or_else(|| panic!("not_initialized"));
    let xlm_token = admin::get_xlm_token(env).unwrap_or_else(|| panic!("not_initialized"));

    let balance = TokenHelper::get_balance(env, &xlm_token, &treasury);
    if balance < amount {
        return Err(FeeError::InsufficientBalance);
    }

    TokenHelper::transfer_from(env, &xlm_token, &treasury, &to, amount).map_err(
        |err| match err {
            crate::token::TokenError::InsufficientBalance => FeeError::InsufficientBalance,
            crate::token::TokenError::TransferFailed => FeeError::TransferFailed,
            _ => FeeError::TransferFailed,
        },
    )?;

    Ok(())
}

// ---------------------------------------------------------------------------
// Creator revenue share vesting
// ---------------------------------------------------------------------------

fn require_is_admin(env: &Env, caller: &Address) -> Result<(), FeeError> {
    caller.require_auth();
    let is_admin = env
        .storage()
        .persistent()
        .get::<DataKey, Address>(&DataKey::Admin(caller.clone()))
        .is_some();
    if !is_admin {
        return Err(FeeError::Unauthorized);
    }
    Ok(())
}

/// Share (bps) of creator event revenue locked into a vesting schedule at
/// finalization. `0` (default) means fully immediate payout.
pub fn get_creator_vest_share_bps(env: &Env) -> u32 {
    env.storage()
        .persistent()
        .get::<DataKey, u32>(&DataKey::CreatorVestShareBps)
        .unwrap_or(0)
}

/// Lock period (seconds) over which vested creator revenue linearly unlocks.
pub fn get_creator_vesting_period_seconds(env: &Env) -> u64 {
    env.storage()
        .persistent()
        .get::<DataKey, u64>(&DataKey::CreatorVestingPeriodSeconds)
        .unwrap_or(0)
}

/// Configure the creator revenue vesting share and lock period. Only the
/// admin may call this.
///
/// # Errors
/// * [`FeeError::Unauthorized`] — caller is not the admin.
/// * [`FeeError::InvalidConfig`] — `vest_share_bps` exceeds 10000.
///
/// # Events
/// Emits `(Symbol("fee"), Symbol("vest_config_updated"))` with data
/// `(vest_share_bps, vesting_period_seconds)`.
pub fn set_creator_vesting_config(
    env: &Env,
    caller: Address,
    vest_share_bps: u32,
    vesting_period_seconds: u64,
) -> Result<(), FeeError> {
    require_is_admin(env, &caller)?;

    if vest_share_bps > MAX_FEE_BPS {
        return Err(FeeError::InvalidConfig);
    }

    let storage = env.storage().persistent();
    storage.set(&DataKey::CreatorVestShareBps, &vest_share_bps);
    storage.extend_ttl(&DataKey::CreatorVestShareBps, TTL_LEDGERS, TTL_LEDGERS);
    storage.set(
        &DataKey::CreatorVestingPeriodSeconds,
        &vesting_period_seconds,
    );
    storage.extend_ttl(
        &DataKey::CreatorVestingPeriodSeconds,
        TTL_LEDGERS,
        TTL_LEDGERS,
    );

    env.events().publish(
        (
            Symbol::new(env, "fee"),
            Symbol::new(env, "vest_config_updated"),
        ),
        (vest_share_bps, vesting_period_seconds),
    );

    Ok(())
}

/// Return a creator's vesting schedule for an event, if one was staged.
pub fn get_creator_vesting_schedule(
    env: &Env,
    creator: Address,
    event_id: u64,
) -> Option<CreatorVestingSchedule> {
    storage::get_creator_vesting(env, &creator, event_id)
}

/// Amount unlocked so far under a linear vesting curve from `start_time` to
/// `unlock_time`. Fully unlocked once `now >= unlock_time`.
fn unlocked_amount(schedule: &CreatorVestingSchedule, now: u64) -> i128 {
    if now >= schedule.unlock_time || schedule.unlock_time <= schedule.start_time {
        return schedule.total_amount;
    }
    if now <= schedule.start_time {
        return 0;
    }
    let elapsed = (now - schedule.start_time) as i128;
    let duration = (schedule.unlock_time - schedule.start_time) as i128;
    schedule.total_amount * elapsed / duration
}

/// Claim whatever portion of a creator's vesting schedule has unlocked since
/// their last claim. Only the allocated creator may claim their own
/// schedule. Callable repeatedly as more of the schedule unlocks.
///
/// # Errors
/// * [`FeeError::NoVestingSchedule`] — no schedule exists for this (creator, event_id).
/// * [`FeeError::AlreadySettled`] — the schedule already reached a terminal state.
/// * [`FeeError::NothingToClaim`] — no additional amount has unlocked yet.
/// * [`FeeError::TransferFailed`] — the payout transfer failed.
///
/// # Events
/// Emits `(Symbol("creator"), Symbol("vested_claimed"))` with data
/// `(event_id, creator, amount)`.
pub fn claim_vested_revenue(env: &Env, creator: Address, event_id: u64) -> Result<i128, FeeError> {
    creator.require_auth();

    let mut schedule =
        storage::get_creator_vesting(env, &creator, event_id).ok_or(FeeError::NoVestingSchedule)?;

    if schedule.settled {
        return Err(FeeError::AlreadySettled);
    }

    let now = env.ledger().timestamp();
    let unlocked = unlocked_amount(&schedule, now);
    let claimable = unlocked - schedule.claimed_amount;
    if claimable <= 0 {
        return Err(FeeError::NothingToClaim);
    }

    let xlm_token = admin::get_xlm_token(env).unwrap_or_else(|| panic!("not_initialized"));
    TokenHelper::distribute_winnings(env, &xlm_token, &creator, claimable)
        .map_err(|_| FeeError::TransferFailed)?;

    schedule.claimed_amount += claimable;
    if schedule.claimed_amount >= schedule.total_amount {
        schedule.settled = true;
    }
    storage::set_creator_vesting(env, &schedule);

    env.events().publish(
        (
            Symbol::new(env, "creator"),
            Symbol::new(env, "vested_claimed"),
        ),
        (event_id, creator, claimable),
    );

    Ok(claimable)
}

/// Forfeit the unclaimed remainder of a creator's vesting schedule — e.g.
/// when the event's finalization is later invalidated — sweeping it to
/// treasury and settling the schedule. Only the admin may call this.
///
/// # Errors
/// * [`FeeError::Unauthorized`] — caller is not the admin.
/// * [`FeeError::NoVestingSchedule`] — no schedule exists for this (creator, event_id).
/// * [`FeeError::AlreadySettled`] — the schedule already reached a terminal state.
/// * [`FeeError::TransferFailed`] — the treasury sweep transfer failed.
///
/// # Events
/// Emits `(Symbol("creator"), Symbol("vesting_forfeited"))` with data
/// `(event_id, creator, forfeited_amount)`.
pub fn forfeit_creator_vesting(
    env: &Env,
    caller: Address,
    creator: Address,
    event_id: u64,
) -> Result<i128, FeeError> {
    require_is_admin(env, &caller)?;

    let mut schedule =
        storage::get_creator_vesting(env, &creator, event_id).ok_or(FeeError::NoVestingSchedule)?;

    if schedule.settled {
        return Err(FeeError::AlreadySettled);
    }

    let remaining = schedule.total_amount - schedule.claimed_amount;
    schedule.forfeited_amount += remaining;
    schedule.settled = true;
    storage::set_creator_vesting(env, &schedule);

    if remaining > 0 {
        let treasury = admin::get_treasury(env).unwrap_or_else(|| panic!("not_initialized"));
        let xlm_token = admin::get_xlm_token(env).unwrap_or_else(|| panic!("not_initialized"));
        TokenHelper::distribute_winnings(env, &xlm_token, &treasury, remaining)
            .map_err(|_| FeeError::TransferFailed)?;
    }

    env.events().publish(
        (
            Symbol::new(env, "creator"),
            Symbol::new(env, "vesting_forfeited"),
        ),
        (event_id, creator, remaining),
    );

    Ok(remaining)
}

// ---------------------------------------------------------------------------
// Tests: calculate_bounded_fee (#1703)
// ---------------------------------------------------------------------------

#[cfg(test)]
mod bounded_fee_tests {
    use super::*;

    #[test]
    fn rejects_share_above_max_fee_bps() {
        let result = calculate_bounded_fee(1_000_000, MAX_FEE_BPS + 1);
        assert_eq!(result, Err(FeeError::InvalidConfig));
    }

    #[test]
    fn accepts_share_at_max_fee_bps() {
        // 100% share returns the full amount.
        let result = calculate_bounded_fee(1_000_000, MAX_FEE_BPS);
        assert_eq!(result, Ok(1_000_000));
    }

    #[test]
    fn computes_partial_share_correctly() {
        // 25% of 1,000,000 = 250,000.
        let result = calculate_bounded_fee(1_000_000, 2_500);
        assert_eq!(result, Ok(250_000));
    }

    #[test]
    fn zero_share_yields_zero_fee() {
        let result = calculate_bounded_fee(1_000_000, 0);
        assert_eq!(result, Ok(0));
    }

    #[test]
    fn large_pool_computes_without_overflow() {
        // Near the top of i128's range — a naive `amount * bps` would
        // overflow long before this, but the checked multiply catches it
        // and only succeeds because share_bps is small enough that the
        // scaled intermediate still fits.
        let large_pool = i128::MAX / 20_000; // headroom for MAX_FEE_BPS multiply
        let result = calculate_bounded_fee(large_pool, MAX_FEE_BPS);
        assert_eq!(result, Ok(large_pool));
    }

    #[test]
    fn overflow_is_rejected_not_panicking() {
        // amount so large that amount * share_bps overflows i128 even
        // though share_bps itself is within bounds.
        let result = calculate_bounded_fee(i128::MAX, 2);
        assert_eq!(result, Err(FeeError::Overflow));
    }
}
