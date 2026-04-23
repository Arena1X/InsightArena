use soroban_sdk::{symbol_short, Address, Env};

use crate::config;
use crate::errors::InsightArenaError;
use crate::escrow;
use crate::market;
use crate::storage_types::{DataKey, Dispute};

fn bump_dispute(env: &Env, market_id: u64) {
    config::extend_market_ttl(env, market_id);
    env.storage().persistent().extend_ttl(
        &DataKey::Dispute(market_id),
        config::PERSISTENT_THRESHOLD,
        config::PERSISTENT_BUMP,
    );
}

fn require_admin(env: &Env, admin: &Address) -> Result<(), InsightArenaError> {
    admin.require_auth();
    let cfg = config::get_config(env)?;
    if admin != &cfg.admin {
        return Err(InsightArenaError::Unauthorized);
    }
    Ok(())
}

fn emit_dispute_raised(env: &Env, market_id: u64, disputer: &Address, bond: i128, filed_at: u64) {
    env.events().publish(
        (symbol_short!("dsp"), symbol_short!("raised")),
        (market_id, disputer.clone(), bond, filed_at),
    );
}

fn emit_dispute_resolved(env: &Env, market_id: u64, admin: &Address, uphold: bool) {
    env.events().publish(
        (symbol_short!("dsp"), symbol_short!("reslvd")),
        (market_id, admin.clone(), uphold),
    );
}

pub fn get_dispute(env: &Env, market_id: u64) -> Result<Dispute, InsightArenaError> {
    let dispute: Dispute = env
        .storage()
        .persistent()
        .get(&DataKey::Dispute(market_id))
        .ok_or(InsightArenaError::DisputeNotFound)?;
    bump_dispute(env, market_id);
    Ok(dispute)
}

pub fn raise_dispute(
    env: Env,
    disputer: Address,
    market_id: u64,
    bond: i128,
) -> Result<(), InsightArenaError> {
    config::ensure_not_paused(&env)?;

    if bond <= 0 {
        return Err(InsightArenaError::InvalidInput);
    }

    let market = market::get_market(&env, market_id)?;
    if !market.is_resolved {
        return Err(InsightArenaError::MarketNotResolved);
    }

    if env.storage().persistent().has(&DataKey::Dispute(market_id)) {
        return Err(InsightArenaError::DisputeAlreadyFiled);
    }

    let now = env.ledger().timestamp();
    let resolved_at = market
        .resolved_at
        .ok_or(InsightArenaError::MarketNotResolved)?;
    let deadline = resolved_at
        .checked_add(market.dispute_window)
        .ok_or(InsightArenaError::Overflow)?;
    if now > deadline {
        return Err(InsightArenaError::DisputeWindowClosed);
    }

    escrow::lock_stake(&env, &disputer, bond)?;

    let dispute = Dispute::new(disputer.clone(), bond, now);
    env.storage()
        .persistent()
        .set(&DataKey::Dispute(market_id), &dispute);
    bump_dispute(&env, market_id);

    emit_dispute_raised(&env, market_id, &disputer, bond, now);

    Ok(())
}

pub fn resolve_dispute(
    env: Env,
    admin: Address,
    market_id: u64,
    uphold: bool,
) -> Result<(), InsightArenaError> {
    config::ensure_not_paused(&env)?;
    require_admin(&env, &admin)?;

    let dispute: Dispute = env
        .storage()
        .persistent()
        .get(&DataKey::Dispute(market_id))
        .ok_or(InsightArenaError::DisputeNotFound)?;

    if uphold {
        // Return bond to disputer and reopen market for re-resolution.
        escrow::refund(&env, &dispute.disputer, dispute.bond)?;

        let mut market = market::get_market(&env, market_id)?;
        market.is_resolved = false;
        market.resolved_outcome = None;
        market.resolved_at = None;
        env.storage()
            .persistent()
            .set(&DataKey::Market(market_id), &market);
        config::extend_market_ttl(&env, market_id);
    } else {
        // Forfeit bond to treasury (accounting balance) while funds remain in escrow.
        escrow::add_to_treasury_balance(&env, dispute.bond);
    }

    env.storage()
        .persistent()
        .remove(&DataKey::Dispute(market_id));

    emit_dispute_resolved(&env, market_id, &admin, uphold);

    Ok(())
}
