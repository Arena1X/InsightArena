use soroban_sdk::{Address, Env, Map, Symbol, Vec};

use crate::config::{self, PERSISTENT_BUMP, PERSISTENT_THRESHOLD};
use crate::errors::InsightArenaError;
use crate::escrow;
use crate::market;
use crate::storage_types::{DataKey, LPPosition, LiquidityPool, SwapRecord};

// ── Constants ─────────────────────────────────────────────────────────────────

/// Minimum liquidity to prevent division by zero and manipulation.
pub const MIN_LIQUIDITY: i128 = 1000;

/// Default trading fee in basis points (0.3% = 30 bps).
pub const DEFAULT_FEE_BPS: u32 = 30;

// ── AMM Math Functions ────────────────────────────────────────────────────────

/// Calculate output amount for a swap using constant product formula.
///
/// Formula: amount_out = (amount_in * reserve_out) / (reserve_in + amount_in)
/// Then apply trading fee: amount_out_with_fee = amount_out * (1 - fee_bps/10000)
pub fn calculate_swap_output(
    amount_in: i128,
    reserve_in: i128,
    reserve_out: i128,
    fee_bps: u32,
) -> Result<i128, InsightArenaError> {
    if amount_in <= 0 || reserve_in <= 0 || reserve_out <= 0 {
        return Err(InsightArenaError::InvalidInput);
    }

    let numerator = amount_in
        .checked_mul(reserve_out)
        .ok_or(InsightArenaError::Overflow)?;

    let denominator = reserve_in
        .checked_add(amount_in)
        .ok_or(InsightArenaError::Overflow)?;

    let amount_out = numerator
        .checked_div(denominator)
        .ok_or(InsightArenaError::Overflow)?;

    let fee_multiplier = 10_000i128
        .checked_sub(fee_bps as i128)
        .ok_or(InsightArenaError::Overflow)?;

    let amount_out_with_fee = amount_out
        .checked_mul(fee_multiplier)
        .ok_or(InsightArenaError::Overflow)?
        .checked_div(10_000)
        .ok_or(InsightArenaError::Overflow)?;

    Ok(amount_out_with_fee)
}

// ── Helper Functions ──────────────────────────────────────────────────────────

fn bump_pool(env: &Env, market_id: u64) {
    env.storage().persistent().extend_ttl(
        &DataKey::LiquidityPool(market_id),
        PERSISTENT_THRESHOLD,
        PERSISTENT_BUMP,
    );
}

fn bump_lp_position(env: &Env, market_id: u64, provider: &Address) {
    env.storage().persistent().extend_ttl(
        &DataKey::LPPosition(market_id, provider.clone()),
        PERSISTENT_THRESHOLD,
        PERSISTENT_BUMP,
    );
}

fn bump_lp_provider_list(env: &Env, market_id: u64) {
    env.storage().persistent().extend_ttl(
        &DataKey::LPProviderList(market_id),
        PERSISTENT_THRESHOLD,
        PERSISTENT_BUMP,
    );
}

fn get_pool(env: &Env, market_id: u64) -> Result<LiquidityPool, InsightArenaError> {
    bump_pool(env, market_id);
    env.storage()
        .persistent()
        .get(&DataKey::LiquidityPool(market_id))
        .ok_or(InsightArenaError::MarketNotFound)
}

fn get_lp_position(
    env: &Env,
    provider: &Address,
    market_id: u64,
) -> Result<LPPosition, InsightArenaError> {
    bump_lp_position(env, market_id, provider);
    env.storage()
        .persistent()
        .get(&DataKey::LPPosition(market_id, provider.clone()))
        .ok_or(InsightArenaError::PredictionNotFound)
}

fn save_pool(env: &Env, pool: &LiquidityPool) {
    bump_pool(env, pool.market_id);
    env.storage()
        .persistent()
        .set(&DataKey::LiquidityPool(pool.market_id), pool);
}

fn save_lp_position(env: &Env, position: &LPPosition) {
    bump_lp_position(env, position.market_id, &position.provider);
    env.storage().persistent().set(
        &DataKey::LPPosition(position.market_id, position.provider.clone()),
        position,
    );
}

fn add_provider_to_list(env: &Env, market_id: u64, provider: &Address) {
    bump_lp_provider_list(env, market_id);
    let mut providers: Vec<Address> = env
        .storage()
        .persistent()
        .get(&DataKey::LPProviderList(market_id))
        .unwrap_or_else(|| Vec::new(env));

    if !providers.iter().any(|p| p == *provider) {
        providers.push_back(provider.clone());
        env.storage()
            .persistent()
            .set(&DataKey::LPProviderList(market_id), &providers);
    }
}

pub fn calculate_liquidity_value(
    lp_tokens: i128,
    total_lp_supply: i128,
    total_liquidity: i128,
) -> Result<i128, InsightArenaError> {
    if lp_tokens <= 0 || total_lp_supply <= 0 {
        return Err(InsightArenaError::InvalidInput);
    }

    let value = lp_tokens
        .checked_mul(total_liquidity)
        .ok_or(InsightArenaError::Overflow)?
        .checked_div(total_lp_supply)
        .ok_or(InsightArenaError::Overflow)?;

    Ok(value)
}

// ── Liquidity Management ──────────────────────────────────────────────────────

pub fn calculate_lp_tokens(
    deposit_amount: i128,
    total_liquidity: i128,
    total_lp_supply: i128,
) -> Result<i128, InsightArenaError> {
    if deposit_amount <= 0 {
        return Err(InsightArenaError::InvalidInput);
    }

    // First deposit: mint tokens equal to deposit
    if total_lp_supply == 0 || total_liquidity == 0 {
        return Ok(deposit_amount);
    }

    // Subsequent deposits: mint proportionally
    let lp_tokens = deposit_amount
        .checked_mul(total_lp_supply)
        .ok_or(InsightArenaError::Overflow)?
        .checked_div(total_liquidity)
        .ok_or(InsightArenaError::Overflow)?;

    Ok(lp_tokens)
}

/// Add liquidity to a market pool and mint LP tokens
pub fn add_liquidity(
    env: &Env,
    provider: Address,
    market_id: u64,
    amount: i128,
) -> Result<i128, InsightArenaError> {
    provider.require_auth();
    config::ensure_not_paused(env)?;

    if amount < MIN_LIQUIDITY {
        return Err(InsightArenaError::StakeTooLow);
    }

    let mkt = market::get_market(env, market_id)?;
    if mkt.is_resolved || mkt.is_cancelled {
        return Err(InsightArenaError::MarketExpired);
    }

    escrow::lock_stake(env, &provider, amount)?;

    let pool = env
        .storage()
        .persistent()
        .get::<_, LiquidityPool>(&DataKey::LiquidityPool(market_id));

    let (lp_tokens, new_pool) = if let Some(mut pool) = pool {
        let lp_tokens = calculate_lp_tokens(amount, pool.total_liquidity, pool.lp_token_supply)?;
        pool.total_liquidity = pool
            .total_liquidity
            .checked_add(amount)
            .ok_or(InsightArenaError::Overflow)?;
        pool.lp_token_supply = pool
            .lp_token_supply
            .checked_add(lp_tokens)
            .ok_or(InsightArenaError::Overflow)?;
        (lp_tokens, pool)
    } else {
        let mut reserves = Map::new(env);
        for outcome in mkt.outcome_options.iter() {
            reserves.set(outcome, amount / mkt.outcome_options.len() as i128);
        }
        let pool = LiquidityPool::new(
            market_id,
            reserves,
            DEFAULT_FEE_BPS,
            env.ledger().timestamp(),
        );
        let mut pool = pool;
        pool.lp_token_supply = amount;
        pool.total_liquidity = amount;
        (amount, pool)
    };

    save_pool(env, &new_pool);
    add_provider_to_list(env, market_id, &provider);

    let position = LPPosition::new(
        provider.clone(),
        market_id,
        lp_tokens,
        amount,
        env.ledger().timestamp(),
    );
    save_lp_position(env, &position);

    Ok(lp_tokens)
}

/// Remove liquidity from a pool by burning LP tokens
pub fn remove_liquidity(
    env: &Env,
    provider: Address,
    market_id: u64,
    lp_tokens: i128,
) -> Result<i128, InsightArenaError> {
    provider.require_auth();
    config::ensure_not_paused(env)?;

    if lp_tokens <= 0 {
        return Err(InsightArenaError::InvalidInput);
    }

    let mut pool = get_pool(env, market_id)?;
    let mut position = get_lp_position(env, &provider, market_id)?;

    if position.lp_tokens < lp_tokens {
        return Err(InsightArenaError::InsufficientFunds);
    }

    let withdrawal_amount =
        calculate_liquidity_value(lp_tokens, pool.lp_token_supply, pool.total_liquidity)?;

    pool.lp_token_supply = pool
        .lp_token_supply
        .checked_sub(lp_tokens)
        .ok_or(InsightArenaError::Overflow)?;
    pool.total_liquidity = pool
        .total_liquidity
        .checked_sub(withdrawal_amount)
        .ok_or(InsightArenaError::Overflow)?;

    position.lp_tokens = position
        .lp_tokens
        .checked_sub(lp_tokens)
        .ok_or(InsightArenaError::Overflow)?;

    save_pool(env, &pool);
    if position.lp_tokens > 0 {
        save_lp_position(env, &position);
    } else {
        env.storage()
            .persistent()
            .remove(&DataKey::LPPosition(market_id, provider.clone()));
    }

    escrow::refund(env, &provider, withdrawal_amount)?;

    Ok(withdrawal_amount)
}

// ── Trading Functions ─────────────────────────────────────────────────────────

/// Swap from one outcome position to another
pub fn swap_outcome(
    env: &Env,
    trader: Address,
    market_id: u64,
    from_outcome: Symbol,
    to_outcome: Symbol,
    amount_in: i128,
    min_amount_out: i128,
) -> Result<i128, InsightArenaError> {
    trader.require_auth();
    config::ensure_not_paused(env)?;

    if amount_in <= 0 || from_outcome == to_outcome {
        return Err(InsightArenaError::InvalidInput);
    }

    let mkt = market::get_market(env, market_id)?;
    if mkt.is_resolved || mkt.is_cancelled {
        return Err(InsightArenaError::MarketExpired);
    }

    let mut pool = get_pool(env, market_id)?;

    let from_reserve = pool
        .outcome_reserves
        .get(from_outcome.clone())
        .ok_or(InsightArenaError::InvalidOutcome)?;
    let to_reserve = pool
        .outcome_reserves
        .get(to_outcome.clone())
        .ok_or(InsightArenaError::InvalidOutcome)?;

    let amount_out = calculate_swap_output(amount_in, from_reserve, to_reserve, pool.fee_bps)?;

    if amount_out < min_amount_out {
        return Err(InsightArenaError::InvalidInput);
    }

    let fee_amount = amount_in
        .checked_mul(pool.fee_bps as i128)
        .ok_or(InsightArenaError::Overflow)?
        .checked_div(10_000)
        .ok_or(InsightArenaError::Overflow)?;

    escrow::lock_stake(env, &trader, amount_in)?;

    pool.outcome_reserves.set(
        from_outcome.clone(),
        from_reserve
            .checked_add(amount_in)
            .ok_or(InsightArenaError::Overflow)?,
    );
    pool.outcome_reserves.set(
        to_outcome.clone(),
        to_reserve
            .checked_sub(amount_out)
            .ok_or(InsightArenaError::Overflow)?,
    );

    save_pool(env, &pool);

    distribute_fees_to_lps(env, market_id, fee_amount)?;

    let record = SwapRecord::new(
        trader,
        market_id,
        from_outcome,
        to_outcome,
        amount_in,
        amount_out,
        fee_amount,
        env.ledger().timestamp(),
    );

    let mut history: Vec<SwapRecord> = env
        .storage()
        .persistent()
        .get(&DataKey::SwapHistory(market_id))
        .unwrap_or_else(|| Vec::new(env));
    history.push_back(record);
    env.storage()
        .persistent()
        .set(&DataKey::SwapHistory(market_id), &history);

    Ok(amount_out)
}

fn distribute_fees_to_lps(
    env: &Env,
    market_id: u64,
    fee_amount: i128,
) -> Result<(), InsightArenaError> {
    let providers: Vec<Address> = env
        .storage()
        .persistent()
        .get(&DataKey::LPProviderList(market_id))
        .unwrap_or_else(|| Vec::new(env));

    if providers.is_empty() {
        return Ok(());
    }

    let fee_per_lp = fee_amount
        .checked_div(providers.len() as i128)
        .ok_or(InsightArenaError::Overflow)?;

    for provider in providers.iter() {
        if let Ok(mut position) = get_lp_position(env, &provider, market_id) {
            position.fees_earned = position
                .fees_earned
                .checked_add(fee_per_lp)
                .ok_or(InsightArenaError::Overflow)?;
            save_lp_position(env, &position);
        }
    }

    Ok(())
}

/// Get current price of an outcome in the pool
pub fn get_outcome_price(
    env: &Env,
    market_id: u64,
    outcome: Symbol,
) -> Result<i128, InsightArenaError> {
    let pool = get_pool(env, market_id)?;
    let reserve = pool
        .outcome_reserves
        .get(outcome)
        .ok_or(InsightArenaError::InvalidOutcome)?;
    Ok(reserve)
}

/// Get LP position for a provider
pub fn get_lp_position_public(
    env: &Env,
    provider: Address,
    market_id: u64,
) -> Result<LPPosition, InsightArenaError> {
    get_lp_position(env, &provider, market_id)
}

// ── Analytics ─────────────────────────────────────────────────────────────────
