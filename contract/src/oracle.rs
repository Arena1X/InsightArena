use soroban_sdk::{Address, Env, Symbol};

use crate::config;
use crate::errors::InsightArenaError;
use crate::market;
use crate::reputation;
use crate::storage_types::DataKey;

/// Transition a market into the "resolved" state by recording the winning outcome.
///
/// Validation order:
/// 1. `oracle` address must provide valid cryptographic authorisation.
/// 2. `oracle` must match the `oracle_address` stored in global configuration.
/// 3. Market must exist in persistent storage.
/// 4. `current_time >= market.resolution_time` — resolution window must be open.
/// 5. `market.is_resolved == false` — prevents double-resolution.
/// 6. `resolved_outcome` must be one of the symbols in `market.outcome_options`.
///
/// On success:
/// - `market.is_resolved` is set to `true`.
/// - `market.resolved_outcome` stores the winning `Symbol`.
/// - The updated record is saved to storage and its TTL is extended.
/// - A `MarketResolved` event is emitted.
pub fn resolve_market(
    env: Env,
    oracle: Address,
    market_id: u64,
    resolved_outcome: Symbol,
) -> Result<(), InsightArenaError> {
    // ── Guard 1: Oracle authorisation ─────────────────────────────────────────
    oracle.require_auth();

    // ── Guard 2: Verify trusted oracle address ───────────────────────────────
    let cfg = config::get_config(&env)?;
    if oracle != cfg.oracle_address {
        return Err(InsightArenaError::Unauthorized);
    }

    // ── Guard 3: Market must exist ────────────────────────────────────────────
    let mut market = market::get_market(&env, market_id)?;

    // ── Guard 4: Resolution window must be open ──────────────────────────────
    let now = env.ledger().timestamp();
    if now < market.resolution_time {
        return Err(InsightArenaError::MarketStillOpen);
    }

    // ── Guard 5: Market must not already be resolved ──────────────────────────
    if market.is_resolved {
        return Err(InsightArenaError::MarketAlreadyResolved);
    }

    // ── Guard 6: Outcome must be valid for this market ────────────────────────
    if !market.outcome_options.contains(resolved_outcome.clone()) {
        return Err(InsightArenaError::InvalidOutcome);
    }

    // ── Update status and persist ─────────────────────────────────────────────
    market.is_resolved = true;
    market.resolved_outcome = Some(resolved_outcome.clone());
    market.resolved_at = Some(now);

    env.storage()
        .persistent()
        .set(&DataKey::Market(market_id), &market);

    // Extend TTL using the same logic as market creation/lookup
    env.storage().persistent().extend_ttl(
        &DataKey::Market(market_id),
        config::PERSISTENT_THRESHOLD,
        config::PERSISTENT_BUMP,
    );

    // ── Emit MarketResolved event ─────────────────────────────────────────────
    market::emit_market_resolved(&env, market_id, resolved_outcome);

    // ── Update creator reputation stats ──────────────────────────────────────
    reputation::on_market_resolved(&env, &market.creator, market.participant_count);

    Ok(())
}

pub fn update_oracle_from_governance(
    env: &Env,
    new_oracle: Address,
) -> Result<(), InsightArenaError> {
    let mut cfg = config::get_config(env)?;
    cfg.oracle_address = new_oracle;
    env.storage().persistent().set(&DataKey::Config, &cfg);
    Ok(())
}
