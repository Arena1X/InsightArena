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
/// # Behavior
/// * Before any vesting time has elapsed (`now <= start_time`), nothing has
///   unlocked, so this is a well-defined no-op: it returns `Ok(0)` and does
///   not mutate the schedule or emit a payout event. It never panics.
/// * After partial vesting, only the proportionally vested amount is released;
///   the remainder stays claimable on later calls.
/// * Once fully vested, the remainder is released exactly once; subsequent
///   calls return [`FeeError::AlreadySettled`] (no double payout).
///
/// # Errors
/// * [`FeeError::NoVestingSchedule`] — no schedule exists for this (creator, event_id).
/// * [`FeeError::AlreadySettled`] — the schedule already reached a terminal state.
/// * [`FeeError::TransferFailed`] — the payout transfer failed.
///
/// # Events
/// Emits `(Symbol("creator"), Symbol("vested_claimed"))` with data
/// `(event_id, creator, amount)` when a non-zero amount is released.
pub fn claim_vested_revenue(env: &Env, creator: Address, event_id: u64) -> Result<i128, FeeError> {
    creator.require_auth();

    let mut schedule = storage::get_creator_vesting(env, &creator, event_id)
        .ok_or(FeeError::NoVestingSchedule)?;

    if schedule.claimed >= schedule.total_amount {
        return Err(FeeError::AlreadySettled);
    }

    let now = env.ledger().timestamp();
    let unlocked = unlocked_amount(&schedule, now);
    let claimable = unlocked - schedule.claimed;

    // Nothing has vested yet (or nothing new since the last claim): a
    // well-defined no-op rather than a panic or a zero-value transfer.
    if claimable <= 0 {
        return Ok(0);
    }

    let xlm_token = admin::get_xlm_token(env).unwrap_or_else(|| panic!("not_initialized"));
    let treasury = admin::get_treasury(env).unwrap_or_else(|| panic!("not_initialized"));

    TokenHelper::transfer_from(env, &xlm_token, &treasury, &creator, claimable).map_err(
        |err| match err {
            crate::token::TokenError::InsufficientBalance => FeeError::InsufficientBalance,
            crate::token::TokenError::TransferFailed => FeeError::TransferFailed,
            _ => FeeError::TransferFailed,
        },
    )?;

    schedule.claimed += claimable;
    storage::set_creator_vesting(env, &creator, event_id, &schedule);

    env.events().publish(
        (
            Symbol::new(env, "creator"),
            Symbol::new(env, "vested_claimed"),
        ),
        (event_id, creator, claimable),
    );

    Ok(claimable)
}
