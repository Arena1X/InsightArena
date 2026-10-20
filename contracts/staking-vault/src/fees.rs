//! Fee intake: the `fee_source` contract (e.g. open-market) transfers protocol
//! fees into the vault, which are then distributed to stakers via [`crate::pool`].
//!
//! Basis-point fees carry the division remainder across operations, so many
//! small stakes do not drop a unit on every call. Withdrawn fees are checked
//! against the accrued total and cannot exceed it.

use soroban_sdk::{contracttype, token::Client as TokenClient, Address, Env};

use crate::errors::StakingError;
use crate::pool;
use crate::storage_types::{Config, DataKey, PoolState};

/// Basis-point denominator. 10_000 = 100%.
pub const FEE_BPS_DENOMINATOR: i128 = 10_000;

/// Running fee books. `remainder` is the unapplied numerator from basis-point
/// division, in the range `0..FEE_BPS_DENOMINATOR`.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct FeeLedger {
    pub accrued: i128,
    pub withdrawn: i128,
    pub remainder: i128,
}

#[contracttype]
#[derive(Clone)]
enum FeeDataKey {
    Ledger,
}

impl FeeLedger {
    pub fn new() -> Self {
        Self {
            accrued: 0,
            withdrawn: 0,
            remainder: 0,
        }
    }
}

/// Fees still available to withdraw: `accrued - withdrawn`.
pub fn outstanding(ledger: &FeeLedger) -> Result<i128, StakingError> {
    ledger
        .accrued
        .checked_sub(ledger.withdrawn)
        .ok_or(StakingError::Overflow)
}

/// Accrue the fee on `principal` charged at `fee_bps`.
///
/// The division remainder stays on the ledger and is applied to the next
/// operation, so the accrued total matches `floor(sum(principal) * fee_bps /
/// FEE_BPS_DENOMINATOR)` instead of drifting by one unit per small stake.
/// Returns the fee recorded for this operation.
pub fn accrue(ledger: &mut FeeLedger, principal: i128, fee_bps: u32) -> Result<i128, StakingError> {
    if principal <= 0 {
        return Err(StakingError::InvalidAmount);
    }
    if fee_bps as i128 > FEE_BPS_DENOMINATOR {
        return Err(StakingError::InvalidInput);
    }

    let numerator = principal
        .checked_mul(fee_bps as i128)
        .ok_or(StakingError::Overflow)?
        .checked_add(ledger.remainder)
        .ok_or(StakingError::Overflow)?;

    let fee = numerator / FEE_BPS_DENOMINATOR;
    ledger.remainder = numerator % FEE_BPS_DENOMINATOR;
    ledger.accrued = ledger
        .accrued
        .checked_add(fee)
        .ok_or(StakingError::Overflow)?;
    Ok(fee)
}

/// Record `amount` of fees as withdrawn.
///
/// `amount` must be positive and no greater than the outstanding accrued
/// balance, so `withdrawn` never exceeds `accrued`.
pub fn withdraw_fees(ledger: &mut FeeLedger, amount: i128) -> Result<(), StakingError> {
    if amount <= 0 {
        return Err(StakingError::InvalidAmount);
    }

    let available = outstanding(ledger)?;
    if amount > available {
        return Err(StakingError::InsufficientFunds);
    }

    ledger.withdrawn = ledger
        .withdrawn
        .checked_add(amount)
        .ok_or(StakingError::Overflow)?;
    Ok(())
}

fn load_ledger(env: &Env) -> FeeLedger {
    env.storage()
        .instance()
        .get(&FeeDataKey::Ledger)
        .unwrap_or_else(FeeLedger::new)
}

fn save_ledger(env: &Env, ledger: &FeeLedger) {
    env.storage().instance().set(&FeeDataKey::Ledger, ledger);
}

/// Pull `amount` of the staking token from `from` into the vault and fold it
/// into the reward pool. Caller must be the configured `fee_source`.
///
/// `amount` is added to the fee ledger with checked arithmetic, so the accrued
/// total equals the sum of deposited fees.
pub fn deposit_fees(env: &Env, from: Address, amount: i128) -> Result<(), StakingError> {
    from.require_auth();

    if amount <= 0 {
        return Err(StakingError::InvalidAmount);
    }

    let config = env
        .storage()
        .instance()
        .get::<DataKey, Config>(&DataKey::Config)
        .ok_or(StakingError::NotInitialized)?;

    if from != config.fee_source {
        return Err(StakingError::Unauthorized);
    }

    let mut pool_state = env
        .storage()
        .instance()
        .get::<DataKey, PoolState>(&DataKey::Pool)
        .ok_or(StakingError::NotInitialized)?;

    let token_client = TokenClient::new(env, &config.token);
    token_client.transfer(&from, &env.current_contract_address(), &amount);

    pool::distribute(env, &mut pool_state, amount)?;

    env.storage().instance().set(&DataKey::Pool, &pool_state);

    let mut ledger = load_ledger(env);
    ledger.accrued = ledger
        .accrued
        .checked_add(amount)
        .ok_or(StakingError::Overflow)?;
    save_ledger(env, &ledger);

    Ok(())
}

/// Route early-exit penalty into the reward pool using checked arithmetic.
///
/// When the pool has zero total shares (e.g. every staker has withdrawn), the
/// penalty cannot be divided across positions. In that case it is parked as
/// pending rewards so it is not lost and becomes recoverable once a new staker
/// joins the pool. This mirrors the zero-shares behavior of `deposit_fees`
/// (`test_deposit_fees_with_zero_shares_parks_in_pending_rewards`).
///
/// With a nonzero `total_shares`, the penalty is distributed proportionally to
/// existing positions via [`pool::distribute`].
pub fn route_penalty_to_pool(env: &Env, penalty_amount: i128) -> Result<(), StakingError> {
    if penalty_amount <= 0 {
        return Ok(());
    }

    let mut pool_state = env
        .storage()
        .instance()
        .get::<DataKey, PoolState>(&DataKey::Pool)
        .ok_or(StakingError::NotInitialized)?;

    if pool_state.total_shares == 0 {
        // No positions to divide across: park the penalty as pending rewards
        // instead of dividing by zero. It is folded into the pool once a new
        // staker joins (see `pool::distribute`).
        pool_state.pending_rewards = pool_state
            .pending_rewards
            .checked_add(penalty_amount)
            .ok_or(StakingError::Overflow)?;
    } else {
        pool::distribute(env, &mut pool_state, penalty_amount)?;
    }

    env.storage().instance().set(&DataKey::Pool, &pool_state);

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accrued_fees_equal_the_sum_of_per_operation_fees() {
        let mut ledger = FeeLedger::new();
        let principals = [1_000_i128, 2_500, 7, 99_999];
        let fee_bps = 250_u32;
        let mut sum = 0_i128;

        for principal in principals {
            sum += accrue(&mut ledger, principal, fee_bps).unwrap();
        }

        assert_eq!(ledger.accrued, sum);
        assert_eq!(outstanding(&ledger).unwrap(), sum);
    }

    #[test]
    fn fee_withdrawal_reconciles_exactly() {
        let mut ledger = FeeLedger::new();
        let fee = accrue(&mut ledger, 1_000_000, 100).unwrap();
        assert_eq!(fee, ledger.accrued);

        withdraw_fees(&mut ledger, fee).unwrap();

        assert_eq!(outstanding(&ledger).unwrap(), 0);
        assert_eq!(ledger.withdrawn, ledger.accrued);
        assert_eq!(
            withdraw_fees(&mut ledger, 1),
            Err(StakingError::InsufficientFunds)
        );
    }

    #[test]
    fn many_small_operations_do_not_accumulate_drift() {
        let mut ledger = FeeLedger::new();
        let operations = 10_000_i128;
        let fee_bps = 1_u32;
        let mut sum_of_operations = 0_i128;

        for _ in 0..operations {
            // 1 * 1 / 10_000 truncates to 0 on its own. The carried remainder
            // must still produce the exact aggregate fee.
            sum_of_operations += accrue(&mut ledger, 1, fee_bps).unwrap();
        }

        let exact = operations * (fee_bps as i128) / FEE_BPS_DENOMINATOR;
        assert_eq!(exact, 1);
        assert_eq!(ledger.accrued, exact);
        assert_eq!(sum_of_operations, exact);
        assert_eq!(ledger.remainder, 0);

        let accrued = ledger.accrued;
        withdraw_fees(&mut ledger, accrued).unwrap();
        assert_eq!(ledger.withdrawn, exact);
        assert_eq!(outstanding(&ledger).unwrap(), 0);
    }
}
