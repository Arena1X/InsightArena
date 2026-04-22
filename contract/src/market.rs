use soroban_sdk::{contracttype, symbol_short, Address, Env, String, Symbol, Vec};

use crate::config::{self, PERSISTENT_BUMP, PERSISTENT_THRESHOLD};
use crate::errors::InsightArenaError;
use crate::escrow;
use crate::reputation;
use crate::storage_types::{
    ConditionalMarket, DataKey, Market, MarketStats, PlatformStats, Prediction, UserProfile,
};

// ── Params struct ─────────────────────────────────────────────────────────────
// Soroban limits contract functions to 10 parameters. Bundling the market
// creation fields into a single `#[contracttype]` struct keeps the ABI legal
// while preserving full type-safety for every individual field.

#[contracttype]
#[derive(Clone, Debug)]
pub struct CreateMarketParams {
    pub title: String,
    pub description: String,
    pub category: Symbol,
    pub outcomes: Vec<Symbol>,
    pub end_time: u64,
    pub resolution_time: u64,
    pub dispute_window: u64,
    pub creator_fee_bps: u32,
    pub min_stake: i128,
    pub max_stake: i128,
    pub is_public: bool,
}

// ── TTL helpers ───────────────────────────────────────────────────────────────

fn bump_market(env: &Env, market_id: u64) {
    config::extend_market_ttl(env, market_id);
}

fn bump_counter(env: &Env) {
    env.storage().persistent().extend_ttl(
        &DataKey::MarketCount,
        PERSISTENT_THRESHOLD,
        PERSISTENT_BUMP,
    );
}

fn bump_categories(env: &Env) {
    env.storage()
        .instance()
        .extend_ttl(PERSISTENT_THRESHOLD, PERSISTENT_BUMP);
}

fn bump_category_index(env: &Env, category: &Symbol) {
    env.storage().persistent().extend_ttl(
        &DataKey::CategoryIndex(category.clone()),
        PERSISTENT_THRESHOLD,
        PERSISTENT_BUMP,
    );
}

fn load_categories(env: &Env) -> Vec<Symbol> {
    let categories = env
        .storage()
        .instance()
        .get(&DataKey::Categories)
        .unwrap_or_else(|| config::default_categories(env));

    if env.storage().instance().has(&DataKey::Categories) {
        bump_categories(env);
    }

    categories
}

fn save_categories(env: &Env, categories: &Vec<Symbol>) {
    env.storage()
        .instance()
        .set(&DataKey::Categories, categories);
    bump_categories(env);
}

fn load_category_index(env: &Env, category: &Symbol) -> Vec<u64> {
    let key = DataKey::CategoryIndex(category.clone());
    let market_ids = env
        .storage()
        .persistent()
        .get(&key)
        .unwrap_or_else(|| Vec::new(env));

    if env.storage().persistent().has(&key) {
        bump_category_index(env, category);
    }

    market_ids
}

fn save_category_index(env: &Env, category: &Symbol, market_ids: &Vec<u64>) {
    env.storage()
        .persistent()
        .set(&DataKey::CategoryIndex(category.clone()), market_ids);
    bump_category_index(env, category);
}

fn append_market_to_category_index(env: &Env, category: &Symbol, market_id: u64) {
    let mut market_ids = load_category_index(env, category);
    market_ids.push_back(market_id);
    save_category_index(env, category, &market_ids);
}

fn require_admin(env: &Env, admin: &Address) -> Result<(), InsightArenaError> {
    admin.require_auth();

    let cfg = config::get_config(env)?;
    if admin != &cfg.admin {
        return Err(InsightArenaError::Unauthorized);
    }

    Ok(())
}

// ── Counter helpers ───────────────────────────────────────────────────────────

fn load_market_count(env: &Env) -> u64 {
    env.storage()
        .persistent()
        .get(&DataKey::MarketCount)
        .unwrap_or(0u64)
}

fn next_market_id(env: &Env) -> Result<u64, InsightArenaError> {
    let count = load_market_count(env);
    let next = count.checked_add(1).ok_or(InsightArenaError::Overflow)?;
    env.storage().persistent().set(&DataKey::MarketCount, &next);
    bump_counter(env);
    Ok(next)
}

// ── Event emission ────────────────────────────────────────────────────────────

fn emit_market_created(env: &Env, market_id: u64, creator: &Address, end_time: u64) {
    env.events().publish(
        (symbol_short!("mkt"), symbol_short!("created")),
        (market_id, creator.clone(), end_time),
    );
}

fn emit_market_closed(env: &Env, market_id: u64, caller: &Address) {
    env.events().publish(
        (symbol_short!("mkt"), symbol_short!("closed")),
        (market_id, caller.clone()),
    );
}

fn emit_market_cancelled(env: &Env, market_id: u64, caller: &Address) {
    env.events().publish(
        (symbol_short!("mkt"), symbol_short!("canceld")),
        (market_id, caller.clone()),
    );
}

pub fn emit_market_resolved(env: &Env, market_id: u64, resolved_outcome: Symbol) {
    env.events().publish(
        (symbol_short!("mkt"), symbol_short!("reslvd")),
        (market_id, resolved_outcome),
    );
}

/// Calculate price of outcome A in terms of outcome B.
/// Returns price with 6 decimal precision (multiplied by 1_000_000).
pub fn calculate_price(reserve_a: i128, reserve_b: i128) -> Result<i128, InsightArenaError> {
    if reserve_a <= 0 || reserve_b <= 0 {
        return Err(InsightArenaError::InvalidInput);
    }

    let price = reserve_b
        .checked_mul(1_000_000)
        .ok_or(InsightArenaError::Overflow)?
        .checked_div(reserve_a)
        .ok_or(InsightArenaError::Overflow)?;

    Ok(price)
}

fn has_duplicate_outcomes(outcomes: &Vec<Symbol>) -> bool {
    let mut index: u32 = 0;
    while index < outcomes.len() {
        let outcome = outcomes.get(index).unwrap();
        let mut next_index = index + 1;

        while next_index < outcomes.len() {
            if outcomes.get(next_index) == Some(outcome.clone()) {
                return true;
            }
            next_index += 1;
        }

        index += 1;
    }

    false
}

// ── Entry-point logic ─────────────────────────────────────────────────────────

/// Create a new prediction market and return its auto-assigned `market_id`.
///
/// Validation order:
/// 1. Platform not paused
/// 2. Creator authorisation via `require_auth()`
/// 3. `end_time` must be strictly after the current ledger timestamp
/// 4. `resolution_time` must be >= `end_time`
/// 5. At least two distinct outcomes required
/// 6. `category` must be in the admin-managed whitelist
/// 7. `creator_fee_bps` must not exceed the platform cap
/// 8. `min_stake` >= platform minimum; `max_stake` >= `min_stake`
pub fn create_market(
    env: &Env,
    creator: Address,
    params: CreateMarketParams,
) -> Result<u64, InsightArenaError> {
    // ── Guard 1: platform not paused ─────────────────────────────────────────
    config::ensure_not_paused(env)?;

    // ── Guard 2: creator authorisation ───────────────────────────────────────
    creator.require_auth();

    // ── Guard 3: end_time must be in the future ───────────────────────────────
    let now = env.ledger().timestamp();
    if params.end_time <= now {
        return Err(InsightArenaError::InvalidTimeRange);
    }

    // ── Guard 4: resolution_time must be at or after end_time ────────────────
    if params.resolution_time < params.end_time {
        return Err(InsightArenaError::InvalidTimeRange);
    }

    // ── Guard 5: at least two outcomes required ───────────────────────────────
    if params.outcomes.len() < 2 {
        return Err(InsightArenaError::InvalidInput);
    }
    if has_duplicate_outcomes(&params.outcomes) {
        return Err(InsightArenaError::InvalidInput);
    }

    // ── Load config for fee and stake floor checks ────────────────────────────
    let cfg = config::get_config(env)?;
    if !load_categories(env).contains(params.category.clone()) {
        return Err(InsightArenaError::InvalidInput);
    }

    // ── Guard 6: creator fee must not exceed the platform cap ─────────────────
    if params.creator_fee_bps > cfg.max_creator_fee_bps {
        return Err(InsightArenaError::InvalidFee);
    }

    // ── Guard 7: stake bounds ─────────────────────────────────────────────────
    if params.min_stake < cfg.min_stake_xlm {
        return Err(InsightArenaError::StakeTooLow);
    }
    if params.max_stake < params.min_stake {
        return Err(InsightArenaError::InvalidInput);
    }

    // ── Atomically assign a new market ID ────────────────────────────────────
    let market_id = next_market_id(env)?;

    // ── Construct and persist the market ─────────────────────────────────────
    let market = Market::new(
        market_id,
        creator.clone(),
        params.title,
        params.description,
        params.category,
        params.outcomes,
        now, // start_time = creation ledger timestamp
        params.end_time,
        params.resolution_time,
        params.is_public,
        params.creator_fee_bps,
        params.min_stake,
        params.max_stake,
        params.dispute_window,
    );

    env.storage()
        .persistent()
        .set(&DataKey::Market(market_id), &market);
    bump_market(env, market_id);
    append_market_to_category_index(env, &market.category, market_id);

    // ── Emit MarketCreated event ──────────────────────────────────────────────
    emit_market_created(env, market_id, &creator, params.end_time);

    // ── Update creator reputation stats ──────────────────────────────────────
    reputation::on_market_created(env, &creator);

    Ok(market_id)
}

/// Load a single market by ID. Returns `MarketNotFound` if absent.
pub fn get_market(env: &Env, market_id: u64) -> Result<Market, InsightArenaError> {
    let market = env
        .storage()
        .persistent()
        .get(&DataKey::Market(market_id))
        .ok_or(InsightArenaError::MarketNotFound)?;
    bump_market(env, market_id);
    Ok(market)
}

/// Return the total number of markets ever created (0 before any are made).
/// Extends the counter TTL on every call.
pub fn get_market_count(env: &Env) -> u64 {
    let count = load_market_count(env);
    // Only bump when the key actually exists — extend_ttl panics on missing keys.
    if env.storage().persistent().has(&DataKey::MarketCount) {
        bump_counter(env);
    }
    count
}

/// Return a paginated slice of markets in creation order.
///
/// - `start` is the 1-based market ID to begin from (inclusive).
/// - `limit` is capped at 50 to bound simulation cost.
/// - Markets that have been deleted from storage are silently skipped.
/// - Returns an empty `Vec` when `start` exceeds the current market count.
pub fn list_markets(env: &Env, start: u64, limit: u32) -> Vec<Market> {
    const MAX_LIMIT: u32 = 50;
    let effective_limit = if limit > MAX_LIMIT { MAX_LIMIT } else { limit };

    let total = get_market_count(env);
    let mut result: Vec<Market> = Vec::new(env);

    if start == 0 || start > total || effective_limit == 0 {
        return result;
    }

    let mut collected: u32 = 0;
    let mut id = start;

    while id <= total && collected < effective_limit {
        if let Some(market) = env
            .storage()
            .persistent()
            .get::<DataKey, Market>(&DataKey::Market(id))
        {
            bump_market(env, id);
            result.push_back(market);
            collected += 1;
        }
        id += 1;
    }

    result
}

pub fn add_category(env: &Env, admin: Address, category: Symbol) -> Result<(), InsightArenaError> {
    require_admin(env, &admin)?;

    let mut categories = load_categories(env);
    if !categories.contains(category.clone()) {
        categories.push_back(category);
        save_categories(env, &categories);
    }

    Ok(())
}

pub fn remove_category(
    env: &Env,
    admin: Address,
    category: Symbol,
) -> Result<(), InsightArenaError> {
    require_admin(env, &admin)?;

    let mut categories = load_categories(env);
    let mut index: u32 = 0;

    while index < categories.len() {
        if categories.get(index) == Some(category.clone()) {
            categories.remove(index);
            save_categories(env, &categories);
            break;
        }
        index += 1;
    }

    Ok(())
}

pub fn list_categories(env: &Env) -> Vec<Symbol> {
    load_categories(env)
}

pub fn get_markets_by_category(env: &Env, category: Symbol, start: u64, limit: u32) -> Vec<Market> {
    const MAX_LIMIT: u32 = 50;
    let effective_limit = if limit > MAX_LIMIT { MAX_LIMIT } else { limit };
    let market_ids = load_category_index(env, &category);
    let mut result = Vec::new(env);
    let total = u64::from(market_ids.len());

    if effective_limit == 0 || start >= total {
        return result;
    }

    let mut collected: u32 = 0;
    let mut offset = start as u32;

    while u64::from(offset) < total && collected < effective_limit {
        if let Some(market_id) = market_ids.get(offset) {
            if let Some(market) = env
                .storage()
                .persistent()
                .get::<DataKey, Market>(&DataKey::Market(market_id))
            {
                bump_market(env, market_id);
                result.push_back(market);
                collected += 1;
            }
        }
        offset += 1;
    }

    result
}

/// Transition a market into the "closed" state, blocking any further predictions.
///
/// Validation order:
/// 1. Market exists
/// 2. `current_time >= market.end_time` — reverts with `MarketStillOpen` if not
/// 3. `market.is_resolved == false` — reverts with `MarketAlreadyResolved` if already resolved
/// 4. `caller` must be the platform admin or the oracle address — reverts with `Unauthorized`
///
/// On success the market's `is_closed` flag is set to `true`, the record is
/// re-saved to persistent storage, and a `MarketClosed` event is emitted.
pub fn close_market(env: &Env, caller: Address, market_id: u64) -> Result<(), InsightArenaError> {
    // ── Guard 1: market must exist ────────────────────────────────────────────
    let mut market = get_market(env, market_id)?;

    // ── Guard 2: end_time must have passed ────────────────────────────────────
    let now = env.ledger().timestamp();
    if now < market.end_time {
        return Err(InsightArenaError::MarketStillOpen);
    }

    // ── Guard 3: market must not already be resolved ──────────────────────────
    if market.is_resolved {
        return Err(InsightArenaError::MarketAlreadyResolved);
    }

    // ── Guard 4: caller must be admin or oracle ────────────────────────────────
    caller.require_auth();
    let cfg = config::get_config(env)?;
    if caller != cfg.admin && caller != cfg.oracle_address {
        return Err(InsightArenaError::Unauthorized);
    }

    // ── Update status and persist ─────────────────────────────────────────────
    market.is_closed = true;
    env.storage()
        .persistent()
        .set(&DataKey::Market(market_id), &market);
    bump_market(env, market_id);

    // ── Emit MarketClosed event ───────────────────────────────────────────────
    emit_market_closed(env, market_id, &caller);

    Ok(())
}

/// Cancel a market that could not be resolved (oracle failure, creator error, etc.).
///
/// Upon cancellation every predictor's full stake is refunded via the escrow
/// module. No payouts or fees are processed.
///
/// Validation order:
/// 1. Market exists
/// 2. Market has not already been resolved
/// 3. Market has not already been cancelled
/// 4. `caller` must be the platform admin
///
/// On success:
/// - `market.is_cancelled` is set to `true` and persisted.
/// - All entries in `PredictorList(market_id)` are iterated; for each, the
///   corresponding `Prediction` record is loaded and `escrow::refund` is called.
/// - A `MarketCancelled` event is emitted.
pub fn cancel_market(env: &Env, caller: Address, market_id: u64) -> Result<(), InsightArenaError> {
    // ── Guard 1: market must exist ────────────────────────────────────────────
    let mut market = get_market(env, market_id)?;

    // ── Guard 2: market must not already be resolved ──────────────────────────
    if market.is_resolved {
        return Err(InsightArenaError::MarketAlreadyResolved);
    }

    // ── Guard 3: market must not already be cancelled ─────────────────────────
    if market.is_cancelled {
        return Err(InsightArenaError::MarketAlreadyCancelled);
    }

    // ── Guard 4: only the platform admin may cancel ───────────────────────────
    caller.require_auth();
    let cfg = config::get_config(env)?;
    if caller != cfg.admin {
        return Err(InsightArenaError::Unauthorized);
    }

    // ── Mark market as cancelled and persist ──────────────────────────────────
    market.is_cancelled = true;
    env.storage()
        .persistent()
        .set(&DataKey::Market(market_id), &market);
    bump_market(env, market_id);

    let predictors = env
        .storage()
        .persistent()
        .get::<DataKey, Vec<Address>>(&DataKey::PredictorList(market_id))
        .unwrap_or_else(|| Vec::new(env));

    for predictor in predictors.iter() {
        let key = DataKey::Prediction(market_id, predictor.clone());
        if let Some(prediction) = env.storage().persistent().get::<DataKey, Prediction>(&key) {
            escrow::refund(env, &predictor, prediction.stake_amount)?;
        }
    }

    emit_market_cancelled(env, market_id, &caller);

    Ok(())
}

// ── Oracle / Resolution ───────────────────────────────────────────────────────

/// Transition a market into the "resolved" state by recording the winning outcome.
///
/// Validation order:
/// 1. `oracle` address must provide valid cryptographic authorisation.
/// 2. `oracle` must match the `oracle_address` stored in global configuration.
/// 3. Market must exist in persistent storage.
/// 4. `current_time >= market.resolution_time` — resolution window must be open.
/// 5. `market.is_resolved == false` — prevents double-resolution.
/// 6. `resolved_outcome` must be one of the symbols in `market.outcome_options`.
pub fn resolve_market(
    env: Env,
    oracle: Address,
    market_id: u64,
    resolved_outcome: Symbol,
) -> Result<(), InsightArenaError> {
    oracle.require_auth();

    let cfg = config::get_config(&env)?;
    if oracle != cfg.oracle_address {
        return Err(InsightArenaError::Unauthorized);
    }

    let mut market = get_market(&env, market_id)?;

    let now = env.ledger().timestamp();
    if now < market.resolution_time {
        return Err(InsightArenaError::MarketStillOpen);
    }

    if market.is_resolved {
        return Err(InsightArenaError::MarketAlreadyResolved);
    }

    if !market.outcome_options.contains(resolved_outcome.clone()) {
        return Err(InsightArenaError::InvalidOutcome);
    }

    market.is_resolved = true;
    market.resolved_outcome = Some(resolved_outcome.clone());
    market.resolved_at = Some(now);

    env.storage()
        .persistent()
        .set(&DataKey::Market(market_id), &market);

    env.storage().persistent().extend_ttl(
        &DataKey::Market(market_id),
        config::PERSISTENT_THRESHOLD,
        config::PERSISTENT_BUMP,
    );

    emit_market_resolved(&env, market_id, resolved_outcome.clone());
    reputation::on_market_resolved(&env, &market.creator, market.participant_count);
    check_conditional_activation(&env, market_id, &resolved_outcome);

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

// ── Conditional Markets (merged from conditional.rs) ─────────────────────────

/// Maximum depth of conditional market chains.
pub const MAX_CONDITIONAL_DEPTH: u32 = 5;

/// Maximum number of conditional markets per parent.
pub const MAX_CONDITIONALS_PER_PARENT: u32 = 50;

/// Create a child market that only becomes active when a parent market resolves
/// to a specific outcome.
pub fn create_conditional_market(
    env: &Env,
    creator: Address,
    parent_market_id: u64,
    required_outcome: Symbol,
    params: CreateMarketParams,
) -> Result<u64, InsightArenaError> {
    let parent_market: Market = env
        .storage()
        .persistent()
        .get(&DataKey::Market(parent_market_id))
        .ok_or(InsightArenaError::MarketNotFound)?;

    if parent_market.is_resolved {
        return Err(InsightArenaError::MarketExpired);
    }

    if !parent_market
        .outcome_options
        .contains(required_outcome.clone())
    {
        return Err(InsightArenaError::InvalidOutcome);
    }

    let mut depth = 1;
    if let Some(parent_cond) = env
        .storage()
        .persistent()
        .get::<_, ConditionalMarket>(&DataKey::ConditionalMarket(parent_market_id))
    {
        depth = parent_cond.conditional_depth + 1;
        if depth > MAX_CONDITIONAL_DEPTH {
            return Err(InsightArenaError::ConditionalDepthExceeded);
        }
    }

    let market_id = create_market(env, creator, params)?;

    let conditional_market = ConditionalMarket::new(
        market_id,
        parent_market_id,
        required_outcome,
        depth,
        env.ledger().timestamp(),
    );
    env.storage()
        .persistent()
        .set(&DataKey::ConditionalMarket(market_id), &conditional_market);

    let children_key = DataKey::ConditionalChildren(parent_market_id);
    let mut children: Vec<u64> = env
        .storage()
        .persistent()
        .get(&children_key)
        .unwrap_or_else(|| Vec::new(env));
    children.push_back(market_id);
    env.storage().persistent().set(&children_key, &children);

    env.storage()
        .persistent()
        .set(&DataKey::ConditionalParent(market_id), &parent_market_id);

    Ok(market_id)
}

/// Get all conditional markets (children) for a given parent market.
///
/// Returns a vector of `ConditionalMarket` structs representing all child markets
/// that were created with the specified parent market ID. Returns an empty vector
/// if no children exist.
///
/// # Arguments
/// * `env` - The contract environment
/// * `parent_market_id` - The market ID to query for children
///
/// # Returns
/// A `Vec<ConditionalMarket>` containing all child markets, or an empty vector if none exist.
pub fn get_conditional_markets(env: &Env, parent_market_id: u64) -> Vec<ConditionalMarket> {
    let children_key = DataKey::ConditionalChildren(parent_market_id);
    let child_ids: Vec<u64> = env
        .storage()
        .persistent()
        .get(&children_key)
        .unwrap_or_else(|| Vec::new(env));

    let mut results: Vec<ConditionalMarket> = Vec::new(env);

    for child_id in child_ids.iter() {
        if let Some(conditional_market) = env
            .storage()
            .persistent()
            .get::<DataKey, ConditionalMarket>(&DataKey::ConditionalMarket(child_id))
        {
            results.push_back(conditional_market);
        }
    }

    results
}

// TODO: validate_conditional_params
// TODO: get_parent_market / get_conditional_chain
// TODO: calculate_conditional_depth / validate_no_circular_dependency

fn activate_conditional_market(env: &Env, market_id: u64) -> Result<(), InsightArenaError> {
    let mut conditional: ConditionalMarket = env
        .storage()
        .persistent()
        .get(&DataKey::ConditionalMarket(market_id))
        .ok_or(InsightArenaError::MarketNotFound)?;

    let now = env.ledger().timestamp();
    conditional.activate(now);

    env.storage()
        .persistent()
        .set(&DataKey::ConditionalMarket(market_id), &conditional);

    env.events().publish(
        (symbol_short!("cond"), symbol_short!("activ")),
        (market_id, now),
    );

    Ok(())
}

fn check_conditional_activation(env: &Env, parent_market_id: u64, resolved_outcome: &Symbol) {
    let child_ids: Vec<u64> = env
        .storage()
        .persistent()
        .get(&DataKey::ConditionalChildren(parent_market_id))
        .unwrap_or_else(|| Vec::new(env));

    for child_id in child_ids.iter() {
        if let Some(conditional) = env
            .storage()
            .persistent()
            .get::<_, ConditionalMarket>(&DataKey::ConditionalMarket(child_id))
        {
            if &conditional.required_outcome == resolved_outcome {
                let _ = activate_conditional_market(env, child_id);
            }
        }
    }
}

// ── Analytics (merged from analytics.rs) ─────────────────────────────────────

/// Increment the cumulative platform volume by `amount`. Called on every stake.
pub fn add_volume(env: &Env, amount: i128) {
    let key = DataKey::PlatformVolume;
    let current: i128 = env.storage().persistent().get(&key).unwrap_or(0);
    let updated = current.saturating_add(amount);
    env.storage().persistent().set(&key, &updated);
    env.storage()
        .persistent()
        .extend_ttl(&key, PERSISTENT_THRESHOLD, PERSISTENT_BUMP);
}

/// Accumulate per-outcome stake pools by iterating the predictor list.
fn accumulate_outcome_pools(env: &Env, market_id: u64) -> (Vec<Symbol>, Vec<i128>) {
    let predictors: Vec<Address> = env
        .storage()
        .persistent()
        .get(&DataKey::PredictorList(market_id))
        .unwrap_or_else(|| Vec::new(env));

    let mut outcome_symbols: Vec<Symbol> = Vec::new(env);
    let mut outcome_pools: Vec<i128> = Vec::new(env);

    for predictor in predictors.iter() {
        if let Some(pred) = env
            .storage()
            .persistent()
            .get::<DataKey, Prediction>(&DataKey::Prediction(market_id, predictor))
        {
            let mut found = false;
            for (idx, sym) in (0_u32..).zip(outcome_symbols.iter()) {
                if sym == pred.chosen_outcome {
                    let current = outcome_pools.get(idx).unwrap_or(0);
                    outcome_pools.set(idx, current.saturating_add(pred.stake_amount));
                    found = true;
                    break;
                }
            }
            if !found {
                outcome_symbols.push_back(pred.chosen_outcome.clone());
                outcome_pools.push_back(pred.stake_amount);
            }
        }
    }

    (outcome_symbols, outcome_pools)
}

/// Aggregate stats for a single market from stored market + prediction data.
pub fn get_market_stats(env: Env, market_id: u64) -> Result<MarketStats, InsightArenaError> {
    let market: Market = env
        .storage()
        .persistent()
        .get(&DataKey::Market(market_id))
        .ok_or(InsightArenaError::MarketNotFound)?;

    let (outcome_symbols, outcome_pools) = accumulate_outcome_pools(&env, market_id);

    let mut leading_outcome = Symbol::new(&env, "");
    let mut leading_pool: i128 = 0;
    for i in 0..outcome_symbols.len() {
        let pool = outcome_pools.get(i).unwrap_or(0);
        if pool > leading_pool {
            leading_pool = pool;
            leading_outcome = outcome_symbols.get(i).unwrap();
        }
    }

    Ok(MarketStats {
        total_pool: market.total_pool,
        participant_count: market.participant_count,
        leading_outcome,
        leading_outcome_pool: leading_pool,
    })
}

/// Return per-outcome stake totals sorted descending by stake.
pub fn get_outcome_distribution(
    env: Env,
    market_id: u64,
) -> Result<Vec<(Symbol, i128)>, InsightArenaError> {
    if !env.storage().persistent().has(&DataKey::Market(market_id)) {
        return Err(InsightArenaError::MarketNotFound);
    }

    let (mut outcome_symbols, mut outcome_pools) = accumulate_outcome_pools(&env, market_id);

    let n = outcome_symbols.len();
    for i in 1..n {
        let mut j = i;
        while j > 0 {
            let a = outcome_pools.get(j).unwrap_or(0);
            let b = outcome_pools.get(j - 1).unwrap_or(0);
            if a > b {
                outcome_pools.set(j, b);
                outcome_pools.set(j - 1, a);
                let sym_a = outcome_symbols.get(j).unwrap();
                let sym_b = outcome_symbols.get(j - 1).unwrap();
                outcome_symbols.set(j, sym_b);
                outcome_symbols.set(j - 1, sym_a);
                j -= 1;
            } else {
                break;
            }
        }
    }

    let mut result: Vec<(Symbol, i128)> = Vec::new(&env);
    for i in 0..n {
        result.push_back((
            outcome_symbols.get(i).unwrap(),
            outcome_pools.get(i).unwrap_or(0),
        ));
    }

    Ok(result)
}

/// Return the stored `UserProfile` for a given address.
pub fn get_user_stats(env: Env, user: Address) -> Result<UserProfile, InsightArenaError> {
    env.storage()
        .persistent()
        .get(&DataKey::User(user))
        .ok_or(InsightArenaError::UserNotFound)
}

/// Return platform-wide aggregated stats using cached counters (O(1)).
pub fn get_platform_stats(env: Env) -> PlatformStats {
    let total_markets: u64 = env
        .storage()
        .persistent()
        .get(&DataKey::MarketCount)
        .unwrap_or(0);

    let total_volume_xlm: i128 = env
        .storage()
        .persistent()
        .get(&DataKey::PlatformVolume)
        .unwrap_or(0);

    let active_users: u32 = env
        .storage()
        .persistent()
        .get::<DataKey, Vec<Address>>(&DataKey::UserList)
        .map(|v| v.len())
        .unwrap_or(0);

    let treasury_balance: i128 = env
        .storage()
        .persistent()
        .get(&DataKey::Treasury)
        .unwrap_or(0);

    PlatformStats {
        total_markets,
        total_volume_xlm,
        active_users,
        treasury_balance,
    }
}
