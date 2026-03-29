use soroban_sdk::{contracttype, symbol_short, Address, Env, String, Symbol, Vec};

use crate::config::{self, PERSISTENT_BUMP, PERSISTENT_THRESHOLD};
use crate::errors::InsightArenaError;
use crate::escrow;
use crate::reputation;
use crate::storage_types::{DataKey, Market, Prediction};
use crate::ttl;

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
    ttl::extend_market_ttl(env, market_id);
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
