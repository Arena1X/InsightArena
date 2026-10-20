use soroban_sdk::{symbol_short, token, Address, Env, Vec};

use crate::config::{self, PERSISTENT_BUMP, PERSISTENT_THRESHOLD};
use crate::errors::InsightArenaError;
use crate::storage_types::{DataKey, Market, Prediction};

// ── Reentrancy guard (merged from security.rs) ────────────────────────────────

/// Acquire temporary escrow lock. Returns `Paused` error if already locked.
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

#[cfg(test)]
pub fn test_simulate_reentrant_call(env: &Env) -> Result<(), InsightArenaError> {
    acquire_escrow_lock(env)?;
    let result = acquire_escrow_lock(env);
    release_escrow_lock(env);
    result
}

/// Invariant check shared by every outbound transfer path.
///
/// Returns `Err(EscrowEmpty)` when `escrow_balance == 0` (pool is fully
/// drained or was never funded), and `Err(InsufficientFunds)` when the pool
/// is non-zero but still too small to cover `amount`. Returns `Ok(())` when
/// the balance is sufficient.
///
/// Pass the *current* live escrow balance (from `client.balance(&contract)`)
/// so this helper stays pure and testable without touching storage itself.
/// Call this before any state mutation or token transfer.
fn assert_escrow_sufficient(
    amount: i128,
    escrow_balance: i128,
) -> Result<(), InsightArenaError> {
    if escrow_balance == 0 {
        return Err(InsightArenaError::EscrowEmpty);
    }
    if escrow_balance < amount {
        return Err(InsightArenaError::InsufficientFunds);
    }
    Ok(())
}

fn bump_treasury(env: &Env) {
    env.storage().persistent().extend_ttl(
        &DataKey::Treasury,
        PERSISTENT_THRESHOLD,
        PERSISTENT_BUMP,
    );
}

/// Transfer `amount` stroops from `predictor` into the contract's escrow.
///
/// The contract address becomes the custodian of the staked XLM; funds are held
/// until the market is resolved (payout) or cancelled (refund).
///
/// # Errors
/// - `Paused` when the contract's emergency pause is engaged (checked here
///   directly so this fund-moving primitive is self-defending regardless of
///   whether the caller already checked, defense in depth).
/// - `InvalidInput` when `amount <= 0`.
/// - Propagates any error returned by [`config::get_config`].
///
/// Token transfer panics are handled by the Soroban runtime and surface as
/// contract failures.
pub fn lock_stake(env: &Env, from: &Address, amount: i128) -> Result<(), InsightArenaError> {
    config::ensure_not_paused(env)?;
    acquire_escrow_lock(env)?;

    if amount <= 0 {
        release_escrow_lock(env);
        return Err(InsightArenaError::InvalidInput);
    }

    from.require_auth();

    let cfg = config::get_config(env)?;
    token::Client::new(env, &cfg.xlm_token).transfer(
        from,
        &env.current_contract_address(),
        &amount,
    );

    release_escrow_lock(env);
    Ok(())
}

/// Transfer `amount` stroops from `from` to the contract via pre-approved allowance.
///
/// Uses `transfer_from` instead of direct `transfer`, enabling gasless approval flows
/// where the token holder pre-approves the contract separately.
///
/// # Errors
/// - `Paused` when the contract's emergency pause is engaged (checked here
///   directly, defense in depth).
/// - `InvalidInput` when `amount <= 0`.
/// - `InsufficientFunds` when the allowance is insufficient.
/// - Propagates any error returned by [`config::get_config`].
pub fn lock_stake_via_allowance(
    env: &Env,
    from: &Address,
    amount: i128,
) -> Result<(), InsightArenaError> {
    config::ensure_not_paused(env)?;
    acquire_escrow_lock(env)?;

    if amount <= 0 {
        release_escrow_lock(env);
        return Err(InsightArenaError::InvalidInput);
    }

    from.require_auth();

    let cfg = config::get_config(env)?;
    let contract = env.current_contract_address();
    let client = token::Client::new(env, &cfg.xlm_token);

    if client.allowance(from, &contract) < amount {
        release_escrow_lock(env);
        return Err(InsightArenaError::InsufficientFunds);
    }

    client.transfer_from(&contract, from, &contract, &amount);

    release_escrow_lock(env);
    Ok(())
}

/// Transfer `amount` stroops from contract escrow back to `to` as a refund.
///
/// This entry point is intentionally separate from [`release_payout`] even
/// though both operations move escrowed XLM from the contract to a user.
/// Auditors can grep for `refund` and immediately isolate the cancellation
/// workflow used by `cancel_market`, without mixing that logic with winner
/// payout distribution.
///
/// # Errors
/// - `Paused` when the contract's emergency pause is engaged (checked here
///   directly, defense in depth).
/// - `InvalidInput` when `amount <= 0`.
/// - `EscrowEmpty` when the contract balance cannot cover the refund.
/// - Propagates any error returned by [`config::get_config`].
pub fn refund(env: &Env, to: &Address, amount: i128) -> Result<(), InsightArenaError> {
    config::ensure_not_paused(env)?;
    acquire_escrow_lock(env)?;

    if amount <= 0 {
        release_escrow_lock(env);
        return Err(InsightArenaError::InvalidInput);
    }

    let cfg = config::get_config(env)?;
    let client = token::Client::new(env, &cfg.xlm_token);
    let contract = env.current_contract_address();

    if let Err(e) = assert_escrow_sufficient(amount, client.balance(&contract)) {
        release_escrow_lock(env);
        return Err(e);
    }

    client.transfer(&contract, to, &amount);

    release_escrow_lock(env);
    Ok(())
}

/// Release a winner payout from contract escrow to `predictor`.
///
/// This is semantically distinct from `refund` (used for market cancellation),
/// but uses the same escrow transfer path from contract balance to recipient.
///
/// # Errors
/// - `Paused` when the contract's emergency pause is engaged (checked here
///   directly, defense in depth).
pub fn release_payout(env: &Env, to: &Address, amount: i128) -> Result<(), InsightArenaError> {
    config::ensure_not_paused(env)?;
    acquire_escrow_lock(env)?;

    if amount <= 0 {
        release_escrow_lock(env);
        return Err(InsightArenaError::InvalidInput);
    }

    let cfg = config::get_config(env)?;
    let client = token::Client::new(env, &cfg.xlm_token);
    let contract = env.current_contract_address();

    if let Err(e) = assert_escrow_sufficient(amount, client.balance(&contract)) {
        release_escrow_lock(env);
        return Err(e);
    }

    client.transfer(&contract, to, &amount);

    release_escrow_lock(env);
    Ok(())
}

/// Return the contract's live escrow balance in stroops.
///
/// This getter intentionally queries the configured XLM token contract rather
/// than relying on mirrored storage counters. The token balance held by the
/// contract address is the authoritative solvency source for both auditing and
/// later invariant checks.
pub fn get_contract_balance(env: &Env) -> i128 {
    let cfg = config::get_config_readonly(env).expect("contract must be initialized");
    token::Client::new(env, &cfg.xlm_token).balance(&env.current_contract_address())
}

/// Assert that live escrow holdings remain above the total of all unclaimed
/// prediction stakes across the contract.
///
/// This audit helper deliberately scans contract storage and compares that
/// aggregate against the token contract's live balance rather than trusting a
/// mirrored counter. It is used both as an externally callable admin audit aid
/// and as an automatic post-condition after batch payout distribution.
pub fn assert_escrow_solvent(env: &Env) -> Result<(), InsightArenaError> {
    let market_count: u64 = env
        .storage()
        .persistent()
        .get(&DataKey::MarketCount)
        .unwrap_or(0);

    let mut total_unclaimed_stakes: i128 = 0;
    let mut market_id = 1_u64;

    while market_id <= market_count {
        let Some(market) = env
            .storage()
            .persistent()
            .get::<DataKey, Market>(&DataKey::Market(market_id))
        else {
            market_id += 1;
            continue;
        };

        if market.is_resolved || market.is_cancelled {
            market_id += 1;
            continue;
        }

        let predictors: Vec<Address> = env
            .storage()
            .persistent()
            .get(&DataKey::PredictorList(market_id))
            .unwrap_or_else(|| Vec::new(env));

        for predictor in predictors.iter() {
            let prediction_key = DataKey::Prediction(market_id, predictor.clone());
            if let Some(prediction) = env
                .storage()
                .persistent()
                .get::<DataKey, Prediction>(&prediction_key)
            {
                if prediction.payout_claimed {
                    continue;
                }

                total_unclaimed_stakes = total_unclaimed_stakes
                    .checked_add(prediction.stake_amount)
                    .ok_or(InsightArenaError::Overflow)?;
            }
        }

        market_id += 1;
    }

    if get_contract_balance(env) < total_unclaimed_stakes {
        return Err(InsightArenaError::EscrowEmpty);
    }

    Ok(())
}

pub(crate) fn add_to_treasury_balance(env: &Env, amount: i128) {
    if amount <= 0 {
        return;
    }

    let current_balance: i128 = env
        .storage()
        .persistent()
        .get(&DataKey::Treasury)
        .unwrap_or(0);

    let next_balance = current_balance
        .checked_add(amount)
        .expect("treasury balance overflow");

    env.storage()
        .persistent()
        .set(&DataKey::Treasury, &next_balance);
    bump_treasury(env);
}

/// Transfer accumulated fee to a designated treasury or creator address.
///
/// This moves funds out of the shared prediction pool.
///
/// # Errors
/// - `InvalidInput` when `amount <= 0`.
/// - `Unauthorized` when caller is not the configured admin.
/// - `EscrowEmpty` if the contract lacks sufficient balance.
pub fn transfer_fee(
    env: &Env,
    admin: &Address,
    to: &Address,
    amount: i128,
) -> Result<(), InsightArenaError> {
    config::ensure_not_paused(env)?;

    if amount <= 0 {
        return Err(InsightArenaError::InvalidInput);
    }

    let cfg = config::get_config(env)?;
    admin.require_auth();
    if admin != &cfg.admin {
        return Err(InsightArenaError::Unauthorized);
    }

    let treasury_balance = get_treasury_balance(env);
    if treasury_balance < amount {
        return Err(InsightArenaError::EscrowEmpty);
    }

    let client = token::Client::new(env, &cfg.xlm_token);
    let contract = env.current_contract_address();

    assert_escrow_sufficient(amount, client.balance(&contract))?;

    client.transfer(&contract, to, &amount);

    let next_treasury_balance = treasury_balance
        .checked_sub(amount)
        .ok_or(InsightArenaError::Overflow)?;
    env.storage()
        .persistent()
        .set(&DataKey::Treasury, &next_treasury_balance);
    bump_treasury(env);

    Ok(())
}

/// Withdraw accumulated treasury fees to the admin address.
///
/// Only the contract admin may call this. The amount must not exceed the
/// tracked treasury balance.
///
/// # Errors
/// - `Paused` when the contract's emergency pause is engaged (checked here
///   directly, defense in depth).
/// - `InvalidInput` when `amount <= 0`.
/// - `Unauthorized` when caller is not the admin.
/// - `InsufficientFunds` when `amount` exceeds the tracked treasury balance.
/// - `EscrowEmpty` if the contract token balance cannot cover the withdrawal.
pub fn withdraw_treasury(env: Env, caller: Address, amount: i128) -> Result<(), InsightArenaError> {
    config::ensure_not_paused(&env)?;

    if amount <= 0 {
        return Err(InsightArenaError::InvalidInput);
    }

    caller.require_auth();

    let cfg = config::get_config(&env)?;
    if caller != cfg.admin {
        return Err(InsightArenaError::Unauthorized);
    }

    let treasury_balance: i128 = env
        .storage()
        .persistent()
        .get(&DataKey::Treasury)
        .unwrap_or(0);

    if amount > treasury_balance {
        return Err(InsightArenaError::InsufficientFunds);
    }

    let client = token::Client::new(&env, &cfg.xlm_token);
    let contract = env.current_contract_address();

    assert_escrow_sufficient(amount, client.balance(&contract))?;

    client.transfer(&contract, &caller, &amount);

    let new_balance = treasury_balance - amount;
    env.storage()
        .persistent()
        .set(&DataKey::Treasury, &new_balance);
    bump_treasury(&env);

    Ok(())
}

/// Pay `amount` (stroops) to `to` out of the tracked treasury balance.
///
/// Used to fund the oracle reward in `dispute::settle_oracle_submission`:
/// the reward is capped at the live treasury balance before this is called,
/// so it always succeeds and never overdraws the tracked accounting figure.
///
/// # Errors
/// - `InsufficientFunds` when `amount` exceeds the tracked treasury balance.
/// - `EscrowEmpty` if the contract token balance cannot cover the transfer.
pub(crate) fn pay_oracle_reward(env: &Env, to: &Address, amount: i128) -> Result<(), InsightArenaError> {
    if amount <= 0 {
        return Ok(());
    }

    acquire_escrow_lock(env)?;

    let treasury_balance = get_treasury_balance(env);
    if amount > treasury_balance {
        release_escrow_lock(env);
        return Err(InsightArenaError::InsufficientFunds);
    }

    let cfg = config::get_config(env)?;
    let client = token::Client::new(env, &cfg.xlm_token);
    let contract = env.current_contract_address();

    if let Err(e) = assert_escrow_sufficient(amount, client.balance(&contract)) {
        release_escrow_lock(env);
        return Err(e);
    }

    client.transfer(&contract, to, &amount);

    release_escrow_lock(env);

    let new_balance = treasury_balance
        .checked_sub(amount)
        .ok_or(InsightArenaError::Overflow)?;
    env.storage().persistent().set(&DataKey::Treasury, &new_balance);
    bump_treasury(env);

    Ok(())
}

pub fn get_treasury_balance(env: &Env) -> i128 {
    env.storage()
        .persistent()
        .get(&DataKey::Treasury)
        .unwrap_or(0)
}

// ── Slashed-funds insurance pool ─────────────────────────────────────────────

fn emit_insurance_pool_contribution(env: &Env, amount: i128) {
    env.events()
        .publish((symbol_short!("ins"), symbol_short!("contrib")), amount);
}

fn emit_insurance_pool_draw(env: &Env, admin: &Address, to: &Address, amount: i128) {
    env.events().publish(
        (symbol_short!("ins"), symbol_short!("draw")),
        (admin.clone(), to.clone(), amount),
    );
}

/// Split a slashed bond/forfeiture between the insurance pool and the
/// protocol treasury according to the configured `insurance_pool_share_bps`,
/// crediting each accounting balance. Used wherever slashed funds from bad
/// actors (failed disputes/appeals) are forfeited, so a reserve is built up
/// to cover future accounting/settlement shortfalls instead of the full
/// amount being redistributed immediately.
pub(crate) fn slash_funds(env: &Env, amount: i128) -> Result<(), InsightArenaError> {
    if amount <= 0 {
        return Ok(());
    }

    let mut cfg = config::get_config(env)?;

    let insurance_share = amount
        .checked_mul(cfg.insurance_pool_share_bps as i128)
        .ok_or(InsightArenaError::Overflow)?
        .checked_div(10_000)
        .ok_or(InsightArenaError::Overflow)?;
    let treasury_share = amount
        .checked_sub(insurance_share)
        .ok_or(InsightArenaError::Overflow)?;

    if insurance_share > 0 {
        cfg.insurance_pool_balance = cfg
            .insurance_pool_balance
            .checked_add(insurance_share)
            .ok_or(InsightArenaError::Overflow)?;
        env.storage().persistent().set(&DataKey::Config, &cfg);
        config::extend_config_ttl(env);
        emit_insurance_pool_contribution(env, insurance_share);
    }

    add_to_treasury_balance(env, treasury_share);

    Ok(())
}

/// Distribute a slashed dispute bond: refund winner (if any), route the
/// remainder to insurance pool + treasury via `slash_funds`. Used by
/// `dispute::resolve_dispute` and `dispute::finalize_arbiter_vote` to
/// enforce economic consequences on losing disputers.
///
/// # Parameters
/// - `winner`: Optional address to receive a refund (e.g., the disputer if
///   the dispute was upheld, or None if rejected).
/// - `winner_refund`: Amount to refund to `winner` (must be <= `total_bond`).
/// - `total_bond`: Total bond amount to distribute.
///
/// # Errors
/// - `InvalidInput` if `winner_refund > total_bond`.
/// - `Overflow` on checked arithmetic failures.
/// - Propagates escrow transfer errors.
pub(crate) fn distribute_slashed_bond(
    env: &Env,
    winner: Option<&Address>,
    winner_refund: i128,
    total_bond: i128,
) -> Result<(), InsightArenaError> {
    if winner_refund > total_bond {
        return Err(InsightArenaError::InvalidInput);
    }

    // Refund winner first
    if let Some(addr) = winner {
        if winner_refund > 0 {
            refund(env, addr, winner_refund)?;
        }
    }

    // Slash the remainder
    let slashed_amount = total_bond
        .checked_sub(winner_refund)
        .ok_or(InsightArenaError::Overflow)?;
    
    if slashed_amount > 0 {
        slash_funds(env, slashed_amount)?;
    }

    Ok(())
}

/// Draw `amount` from the insurance pool to `to`, to cover a documented
/// accounting/settlement shortfall. Caller must be the platform admin
/// (governance).
///
/// # Errors
/// - `InvalidInput` when `amount <= 0`.
/// - `Unauthorized` when caller is not the configured admin.
/// - `InsufficientFunds` when `amount` exceeds the tracked pool balance
///   (over-draw prevention).
/// - `EscrowEmpty` if the live token balance cannot cover the transfer.
pub fn draw_insurance_pool(
    env: Env,
    admin: Address,
    to: Address,
    amount: i128,
) -> Result<(), InsightArenaError> {
    config::ensure_not_paused(&env)?;

    if amount <= 0 {
        return Err(InsightArenaError::InvalidInput);
    }

    admin.require_auth();
    let mut cfg = config::get_config(&env)?;
    if admin != cfg.admin {
        return Err(InsightArenaError::Unauthorized);
    }

    if amount > cfg.insurance_pool_balance {
        return Err(InsightArenaError::InsufficientFunds);
    }

    let client = token::Client::new(&env, &cfg.xlm_token);
    let contract = env.current_contract_address();
    assert_escrow_sufficient(amount, client.balance(&contract))?;

    client.transfer(&contract, &to, &amount);

    cfg.insurance_pool_balance = cfg
        .insurance_pool_balance
        .checked_sub(amount)
        .ok_or(InsightArenaError::Overflow)?;
    cfg.insurance_pool_payouts_total = cfg
        .insurance_pool_payouts_total
        .checked_add(amount)
        .ok_or(InsightArenaError::Overflow)?;
    env.storage().persistent().set(&DataKey::Config, &cfg);
    config::extend_config_ttl(&env);

    emit_insurance_pool_draw(&env, &admin, &to, amount);

    Ok(())
}

/// Return the current insurance pool balance (stroops).
pub fn get_insurance_pool_balance(env: &Env) -> i128 {
    config::get_config_readonly(env)
        .map(|c| c.insurance_pool_balance)
        .unwrap_or(0)
}

/// Return the cumulative total ever paid out of the insurance pool (stroops).
pub fn get_insurance_pool_payouts_total(env: &Env) -> i128 {
    config::get_config_readonly(env)
        .map(|c| c.insurance_pool_payouts_total)
        .unwrap_or(0)
}

// ── Market Creation Anti-Spam Bond ────────────────────────────────────────────
//
// Bond records are stored with a raw tuple key `(Symbol, u64)` instead of a
// `DataKey` variant, because `DataKey` is already at the 50-variant XDR cap.
// This follows the same pattern used elsewhere in `storage_types.rs` when the
// enum has no room to grow.
//
// Key layout: (Symbol::new(env, "MktBond"), market_id)  →  i128 (bond amount)

fn bond_storage_key(env: &Env, market_id: u64) -> (soroban_sdk::Symbol, u64) {
    (soroban_sdk::Symbol::new(env, "MktBond"), market_id)
}

/// Deposit the anti-spam bond from `creator` into the contract's escrow for
/// `market_id`.
///
/// The bond amount is read from the current global `Config::bond_amount`. If
/// `bond_amount == 0` the function is a no-op and returns `Ok(())`.
///
/// # Errors
/// - `NotAParticipant` (reused) if a bond record already exists for this
///   market (double-deposit guard).
/// - `InsufficientFunds` (reused) if the creator's allowance/balance is
///   insufficient to cover the bond.
/// - Propagates pause and config errors from inner helpers.
pub fn deposit_market_bond(
    env: &Env,
    creator: &Address,
    market_id: u64,
) -> Result<(), InsightArenaError> {
    let cfg = config::get_config(env)?;

    // Bond is disabled — nothing to do.
    if cfg.bond_amount == 0 {
        return Ok(());
    }

    let bond_key = bond_storage_key(env, market_id);

    // Guard: refuse if a bond was already deposited (should not normally
    // happen, but prevents accidental double-deposit).
    if env.storage().persistent().has(&bond_key) {
        return Err(InsightArenaError::NotAParticipant);
    }

    let amount = cfg.bond_amount;
    let contract = env.current_contract_address();
    let client = token::Client::new(env, &cfg.xlm_token);

    // Verify sufficient allowance before attempting the transfer.
    if client.allowance(creator, &contract) < amount {
        return Err(InsightArenaError::InsufficientFunds);
    }

    client.transfer_from(&contract, creator, &contract, &amount);

    // Record the bond against the market.
    env.storage().persistent().set(&bond_key, &amount);
    env.storage().persistent().extend_ttl(
        &bond_key,
        config::PERSISTENT_THRESHOLD,
        config::PERSISTENT_BUMP,
    );

    emit_bond_deposited(env, market_id, creator, amount);

    Ok(())
}

/// Refund the anti-spam bond to `creator` when the market resolves normally.
///
/// If no bond record exists (bond was disabled at creation time) the function
/// is a no-op and returns `Ok(())`.
///
/// # Errors
/// - Propagates pause and config errors from inner helpers.
/// - `EscrowEmpty` if the contract token balance cannot cover the refund.
pub fn refund_market_bond(
    env: &Env,
    creator: &Address,
    market_id: u64,
) -> Result<(), InsightArenaError> {
    let bond_key = bond_storage_key(env, market_id);

    let amount: i128 = match env.storage().persistent().get(&bond_key) {
        Some(v) => v,
        None => return Ok(()), // bond was never required — nothing to refund
    };

    if amount <= 0 {
        env.storage().persistent().remove(&bond_key);
        return Ok(());
    }

    let cfg = config::get_config(env)?;
    let client = token::Client::new(env, &cfg.xlm_token);
    let contract = env.current_contract_address();

    assert_escrow_sufficient(amount, client.balance(&contract))?;

    client.transfer(&contract, creator, &amount);

    // Remove the bond record — it can never be claimed again.
    env.storage().persistent().remove(&bond_key);

    emit_bond_refunded(env, market_id, creator, amount);

    Ok(())
}

/// Forfeit the anti-spam bond to the protocol treasury when a market is
/// cancelled for being invalid/spam.
///
/// If no bond record exists (bond was disabled at creation time) the function
/// is a no-op and returns `Ok(())`.
///
/// The forfeited amount is credited to the treasury balance via
/// [`add_to_treasury_balance`] and the bond record is removed.
///
/// # Errors
/// - Propagates config errors from inner helpers.
pub fn forfeit_market_bond(env: &Env, market_id: u64) -> Result<(), InsightArenaError> {
    let bond_key = bond_storage_key(env, market_id);

    let amount: i128 = match env.storage().persistent().get(&bond_key) {
        Some(v) => v,
        None => return Ok(()), // bond was never required — nothing to forfeit
    };

    // Remove the bond record before crediting the treasury (fail-safe ordering).
    env.storage().persistent().remove(&bond_key);

    if amount > 0 {
        add_to_treasury_balance(env, amount);
        emit_bond_forfeited(env, market_id, amount);
    }

    Ok(())
}

/// Return the bond amount currently held for `market_id`, or `0` if no bond
/// was deposited (bond was disabled at creation time or already settled).
pub fn get_market_bond(env: &Env, market_id: u64) -> i128 {
    let bond_key = bond_storage_key(env, market_id);
    env.storage().persistent().get(&bond_key).unwrap_or(0)
}

// ── Bond event emission ───────────────────────────────────────────────────────

fn emit_bond_deposited(env: &Env, market_id: u64, creator: &Address, amount: i128) {
    env.events().publish(
        (symbol_short!("bnd"), symbol_short!("deposit")),
        (market_id, creator.clone(), amount),
    );
}

fn emit_bond_refunded(env: &Env, market_id: u64, creator: &Address, amount: i128) {
    env.events().publish(
        (symbol_short!("bnd"), symbol_short!("refund")),
        (market_id, creator.clone(), amount),
    );
}

fn emit_bond_forfeited(env: &Env, market_id: u64, amount: i128) {
    env.events().publish(
        (symbol_short!("bnd"), symbol_short!("forfeit")),
        (market_id, amount),
    );
}
