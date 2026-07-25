use soroban_sdk::{Address, Env, Map, Symbol, Vec};

use crate::config::{self, PERSISTENT_BUMP, PERSISTENT_THRESHOLD};
use crate::errors::InsightArenaError;
use crate::escrow;
use crate::market;
use crate::storage_types::{
    DataKey, FeeTier, FeeTierConfig, LPPosition, LiquidityPool, MarketFeeInfo, PriceAccumulator,
    PriceObservation, SwapRecord, VolatilityState,
};

// ── Constants ─────────────────────────────────────────────────────────────────

/// Minimum liquidity to prevent division by zero and manipulation.
pub const MIN_LIQUIDITY: i128 = 1000;

/// Default trading fee in basis points (0.3% = 30 bps).
pub const DEFAULT_FEE_BPS: u32 = 30;

/// Smoothing factor (bps) applied to each new price-move sample when updating
/// the rolling volatility EMA. Higher values make the measure more reactive
/// to recent swaps; lower values smooth it out over a longer window.
pub const VOLATILITY_ALPHA_BPS: u32 = 2000;

/// Fixed number of [`PriceObservation`] slots retained per (market, outcome) pair
/// in the TWAP ring buffer. Bounds per-outcome storage growth: once this many
/// price-changing operations have occurred, the oldest observation is
/// overwritten by the newest.
///
/// **Max supported window:** `get_twap` can only average over the span still
/// covered by the buffer, i.e. from the oldest surviving observation's
/// timestamp to now. If an outcome has traded fewer than
/// `TWAP_RING_BUFFER_CAPACITY` times since the pool was created, its entire
/// history is available and any window back to pool creation is honored. Once
/// more than `TWAP_RING_BUFFER_CAPACITY` price-changing swaps have occurred,
/// only the most recent ones remain, so a window reaching further back than
/// the oldest retained sample returns `TwapInsufficientHistory` rather than a
/// silently truncated (and therefore misleading) average.
pub const TWAP_RING_BUFFER_CAPACITY: u32 = 64;

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

// ── Dynamic Fee / Volatility Math ─────────────────────────────────────────────

/// Compute the traded-pair reserve ratio in bps: `reserve_a * 10_000 / (reserve_a + reserve_b)`.
/// Used as the "price" sample for volatility tracking. Range is `[0, 10_000]`.
pub fn compute_price_bps(reserve_a: i128, reserve_b: i128) -> Result<u32, InsightArenaError> {
    let total = reserve_a
        .checked_add(reserve_b)
        .ok_or(InsightArenaError::Overflow)?;

    if total <= 0 || reserve_a < 0 || reserve_b < 0 {
        return Err(InsightArenaError::InvalidInput);
    }

    let bps = reserve_a
        .checked_mul(10_000)
        .ok_or(InsightArenaError::Overflow)?
        .checked_div(total)
        .ok_or(InsightArenaError::Overflow)?;

    Ok(bps as u32)
}

/// Blend a new price-move sample (bps) into the previous EMA (bps) using `alpha_bps`
/// as the smoothing weight: `ema' = (ema * (10_000 - alpha) + sample * alpha) / 10_000`.
pub fn compute_ema(prev_ema_bps: u32, sample_bps: u32, alpha_bps: u32) -> u32 {
    let prev = prev_ema_bps as u64;
    let sample = sample_bps as u64;
    let alpha = (alpha_bps as u64).min(10_000);

    let blended = prev
        .saturating_mul(10_000u64.saturating_sub(alpha))
        .saturating_add(sample.saturating_mul(alpha))
        / 10_000;

    blended.min(u32::MAX as u64) as u32
}

/// Classify a rolling volatility measure (bps) into a fee tier using admin-configured thresholds.
pub fn determine_fee_tier(ema_bps: u32, cfg: &FeeTierConfig) -> FeeTier {
    if ema_bps <= cfg.calm_threshold_bps {
        FeeTier::Calm
    } else if ema_bps <= cfg.volatile_threshold_bps {
        FeeTier::Normal
    } else {
        FeeTier::Volatile
    }
}

/// Look up the swap fee (bps) configured for a given tier.
pub fn fee_bps_for_tier(tier: &FeeTier, cfg: &FeeTierConfig) -> u32 {
    match tier {
        FeeTier::Calm => cfg.calm_fee_bps,
        FeeTier::Normal => cfg.normal_fee_bps,
        FeeTier::Volatile => cfg.volatile_fee_bps,
    }
}

fn validate_fee_tier_config(cfg: &FeeTierConfig) -> Result<(), InsightArenaError> {
    if cfg.calm_threshold_bps >= cfg.volatile_threshold_bps {
        return Err(InsightArenaError::InvalidInput);
    }

    if cfg.calm_fee_bps > 10_000 || cfg.normal_fee_bps > 10_000 || cfg.volatile_fee_bps > 10_000 {
        return Err(InsightArenaError::InvalidFee);
    }

    if cfg.calm_fee_bps > cfg.normal_fee_bps || cfg.normal_fee_bps > cfg.volatile_fee_bps {
        return Err(InsightArenaError::InvalidFee);
    }

    if cfg.protocol_share_bps > 10_000 {
        return Err(InsightArenaError::InvalidFee);
    }

    Ok(())
}

fn bump_fee_tier_config(env: &Env) {
    env.storage().persistent().extend_ttl(
        &DataKey::FeeTierConfig,
        PERSISTENT_THRESHOLD,
        PERSISTENT_BUMP,
    );
}

fn bump_volatility_state(env: &Env, market_id: u64) {
    env.storage().persistent().extend_ttl(
        &DataKey::VolatilityState(market_id),
        PERSISTENT_THRESHOLD,
        PERSISTENT_BUMP,
    );
}

/// Return the current admin-configured fee tier schedule, or built-in defaults
/// if the admin has never customised it.
pub fn get_fee_tier_config(env: &Env) -> FeeTierConfig {
    if env.storage().persistent().has(&DataKey::FeeTierConfig) {
        bump_fee_tier_config(env);
    }
    env.storage()
        .persistent()
        .get(&DataKey::FeeTierConfig)
        .unwrap_or_else(FeeTierConfig::default_config)
}

/// Update the fee tier schedule. Caller must be the platform admin.
pub fn set_fee_tier_config(
    env: &Env,
    admin: Address,
    new_config: FeeTierConfig,
) -> Result<(), InsightArenaError> {
    admin.require_auth();

    let cfg = config::get_config(env)?;
    if admin != cfg.admin {
        return Err(InsightArenaError::Unauthorized);
    }

    validate_fee_tier_config(&new_config)?;

    env.storage()
        .persistent()
        .set(&DataKey::FeeTierConfig, &new_config);
    bump_fee_tier_config(env);

    Ok(())
}

fn get_volatility_state(env: &Env, market_id: u64) -> VolatilityState {
    if env
        .storage()
        .persistent()
        .has(&DataKey::VolatilityState(market_id))
    {
        bump_volatility_state(env, market_id);
    }
    env.storage()
        .persistent()
        .get(&DataKey::VolatilityState(market_id))
        .unwrap_or_else(|| VolatilityState::empty(market_id))
}

fn save_volatility_state(env: &Env, state: &VolatilityState) {
    env.storage()
        .persistent()
        .set(&DataKey::VolatilityState(state.market_id), state);
    bump_volatility_state(env, state.market_id);
}

/// Record a swap's effect on the traded pair's reserve ratio and roll it into
/// the market's volatility EMA. `new_from_reserve`/`new_to_reserve` must be the
/// pool reserves *after* the swap has been applied.
fn update_volatility_state(
    env: &Env,
    market_id: u64,
    prev: &VolatilityState,
    new_from_reserve: i128,
    new_to_reserve: i128,
) -> Result<VolatilityState, InsightArenaError> {
    let new_price_bps = compute_price_bps(new_from_reserve, new_to_reserve)?;

    let new_ema_bps = if prev.sample_count == 0 {
        0
    } else {
        let delta_bps = new_price_bps.abs_diff(prev.last_price_bps);
        compute_ema(prev.ema_bps, delta_bps, VOLATILITY_ALPHA_BPS)
    };

    let state = VolatilityState {
        market_id,
        ema_bps: new_ema_bps,
        last_price_bps: new_price_bps,
        last_updated: env.ledger().timestamp(),
        sample_count: prev.sample_count.saturating_add(1),
    };

    save_volatility_state(env, &state);
    Ok(state)
}

/// Return the current dynamic fee tier and effective swap fee for a market.
pub fn get_market_fee_info(env: &Env, market_id: u64) -> Result<MarketFeeInfo, InsightArenaError> {
    market::get_market(env, market_id)?;

    let tier_config = get_fee_tier_config(env);
    let volatility = get_volatility_state(env, market_id);
    let tier = determine_fee_tier(volatility.ema_bps, &tier_config);
    let effective_fee_bps = fee_bps_for_tier(&tier, &tier_config);

    Ok(MarketFeeInfo {
        market_id,
        tier,
        effective_fee_bps,
        volatility_ema_bps: volatility.ema_bps,
    })
}

// ── TWAP Price Oracle ─────────────────────────────────────────────────────────
//
// Accumulators are stored inline on `LiquidityPool::price_accumulators` (keyed
// by outcome) rather than under a dedicated `DataKey` variant: `DataKey` is a
// `#[contracttype]` union, and the underlying XDR spec caps a union at 50
// cases — a limit this contract's `DataKey` already sits at. Piggybacking on
// the pool, which every price-changing operation already loads and saves,
// avoids the cap and gives each swap a single atomic read/write instead of two.

/// Record a new price sample for `outcome` on `pool`, updating its cumulative
/// price integral and pushing an observation into its ring buffer. Must be
/// called on every operation that changes an outcome's reserve, with the
/// pool's ledger timestamp; the caller is responsible for persisting `pool`
/// afterwards (e.g. via `save_pool`).
///
/// The price active since the *previous* observation (`acc.last_price`) is
/// integrated over the elapsed time since it was recorded before the new
/// sample is stored — so a price that spikes and reverts within a single
/// ledger timestamp contributes zero to the accumulator, making the resulting
/// TWAP expensive to move with an intra-block manipulation.
fn record_price_observation(
    env: &Env,
    pool: &mut LiquidityPool,
    outcome: Symbol,
    price: i128,
) -> Result<(), InsightArenaError> {
    let mut acc = pool
        .price_accumulators
        .get(outcome.clone())
        .unwrap_or_else(|| PriceAccumulator::empty(env, pool.market_id, outcome.clone()));

    let now = env.ledger().timestamp();

    if acc.total_count > 0 {
        let elapsed = now.saturating_sub(acc.last_timestamp);
        let contribution = acc
            .last_price
            .checked_mul(elapsed as i128)
            .ok_or(InsightArenaError::Overflow)?;
        acc.cumulative = acc
            .cumulative
            .checked_add(contribution)
            .ok_or(InsightArenaError::Overflow)?;
    }

    let observation = PriceObservation {
        timestamp: now,
        price,
        price_cumulative: acc.cumulative,
    };

    if acc.observations.len() < TWAP_RING_BUFFER_CAPACITY {
        acc.observations.push_back(observation);
    } else {
        acc.observations.set(acc.next_index, observation);
    }
    acc.next_index = (acc.next_index + 1) % TWAP_RING_BUFFER_CAPACITY;

    acc.last_price = price;
    acc.last_timestamp = now;
    acc.total_count = acc.total_count.saturating_add(1);

    pool.price_accumulators.set(outcome, acc);
    Ok(())
}

/// Compute the time-weighted average price of `outcome` over the trailing
/// `window` seconds (i.e. `[now - window, now]`).
///
/// Uses the standard cumulative-price-accumulator technique: the price
/// integral is reconstructed at the window's start by locating the latest
/// retained observation at or before that timestamp and extrapolating with
/// its price for the remainder, then compared against the integral extrapolated
/// to now. See `TWAP_RING_BUFFER_CAPACITY` for the max window the ring buffer
/// can currently honor.
pub fn get_twap(
    env: &Env,
    market_id: u64,
    outcome: Symbol,
    window: u64,
) -> Result<i128, InsightArenaError> {
    if window == 0 {
        return Err(InsightArenaError::TwapEmptyWindow);
    }

    let pool = get_pool(env, market_id)?;
    if pool.outcome_reserves.get(outcome.clone()).is_none() {
        return Err(InsightArenaError::InvalidOutcome);
    }

    let acc = pool
        .price_accumulators
        .get(outcome)
        .ok_or(InsightArenaError::TwapInsufficientHistory)?;
    if acc.total_count == 0 {
        return Err(InsightArenaError::TwapInsufficientHistory);
    }

    let now = env.ledger().timestamp();
    let window_start = now.saturating_sub(window);

    // Latest retained observation at or before `window_start`.
    let mut before: Option<PriceObservation> = None;
    for obs in acc.observations.iter() {
        if obs.timestamp <= window_start {
            let take = match &before {
                Some(b) => obs.timestamp > b.timestamp,
                None => true,
            };
            if take {
                before = Some(obs);
            }
        }
    }
    let before = before.ok_or(InsightArenaError::TwapInsufficientHistory)?;

    let cumulative_start = before
        .price
        .checked_mul((window_start - before.timestamp) as i128)
        .ok_or(InsightArenaError::Overflow)?
        .checked_add(before.price_cumulative)
        .ok_or(InsightArenaError::Overflow)?;

    let cumulative_now = acc
        .last_price
        .checked_mul((now - acc.last_timestamp) as i128)
        .ok_or(InsightArenaError::Overflow)?
        .checked_add(acc.cumulative)
        .ok_or(InsightArenaError::Overflow)?;

    let elapsed = now.saturating_sub(window_start);
    if elapsed == 0 {
        return Err(InsightArenaError::TwapDivideByZero);
    }

    let twap = cumulative_now
        .checked_sub(cumulative_start)
        .ok_or(InsightArenaError::Overflow)?
        .checked_div(elapsed as i128)
        .ok_or(InsightArenaError::Overflow)?;

    Ok(twap)
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
    env.storage()
        .persistent()
        .set(&DataKey::LiquidityPool(pool.market_id), pool);
    bump_pool(env, pool.market_id);
}

fn save_lp_position(env: &Env, position: &LPPosition) {
    env.storage().persistent().set(
        &DataKey::LPPosition(position.market_id, position.provider.clone()),
        position,
    );
    bump_lp_position(env, position.market_id, &position.provider);
}

fn add_provider_to_list(env: &Env, market_id: u64, provider: &Address) {
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
    bump_lp_provider_list(env, market_id);
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

    let is_new_pool = pool.is_none();

    let (lp_tokens, mut new_pool) = if let Some(mut pool) = pool {
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
            env,
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

    if is_new_pool {
        for outcome in mkt.outcome_options.iter() {
            if let Some(reserve) = new_pool.outcome_reserves.get(outcome.clone()) {
                record_price_observation(env, &mut new_pool, outcome, reserve)?;
            }
        }
    }

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

    // Fee tier is derived from volatility observed *before* this swap, so a
    // trade cannot influence the fee rate it itself pays.
    let tier_config = get_fee_tier_config(env);
    let volatility_before = get_volatility_state(env, market_id);
    let tier = determine_fee_tier(volatility_before.ema_bps, &tier_config);
    let effective_fee_bps = fee_bps_for_tier(&tier, &tier_config);

    let amount_out = calculate_swap_output(amount_in, from_reserve, to_reserve, effective_fee_bps)?;

    if amount_out < min_amount_out {
        return Err(InsightArenaError::InvalidInput);
    }

    let fee_amount = amount_in
        .checked_mul(effective_fee_bps as i128)
        .ok_or(InsightArenaError::Overflow)?
        .checked_div(10_000)
        .ok_or(InsightArenaError::Overflow)?;

    // Split the fee between the protocol treasury and liquidity providers.
    // `lp_fee_share` is derived by subtraction so the two shares always sum
    // to `fee_amount` exactly, with no stroop lost or double-counted.
    let protocol_fee_share = fee_amount
        .checked_mul(tier_config.protocol_share_bps as i128)
        .ok_or(InsightArenaError::Overflow)?
        .checked_div(10_000)
        .ok_or(InsightArenaError::Overflow)?;
    let lp_fee_share = fee_amount
        .checked_sub(protocol_fee_share)
        .ok_or(InsightArenaError::Overflow)?;

    escrow::lock_stake(env, &trader, amount_in)?;

    let new_from_reserve = from_reserve
        .checked_add(amount_in)
        .ok_or(InsightArenaError::Overflow)?;
    let new_to_reserve = to_reserve
        .checked_sub(amount_out)
        .ok_or(InsightArenaError::Overflow)?;

    pool.outcome_reserves
        .set(from_outcome.clone(), new_from_reserve);
    pool.outcome_reserves.set(to_outcome.clone(), new_to_reserve);
    pool.fee_bps = effective_fee_bps;

    record_price_observation(env, &mut pool, from_outcome.clone(), new_from_reserve)?;
    record_price_observation(env, &mut pool, to_outcome.clone(), new_to_reserve)?;

    save_pool(env, &pool);

    update_volatility_state(
        env,
        market_id,
        &volatility_before,
        new_from_reserve,
        new_to_reserve,
    )?;

    distribute_fees_to_lps(env, market_id, lp_fee_share)?;
    if protocol_fee_share > 0 {
        escrow::add_to_treasury_balance(env, protocol_fee_share);
    }

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

    update_pool_volume(env, market_id, amount_in);

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

pub fn get_all_lp_providers(env: &Env, market_id: u64) -> Vec<LPPosition> {
    let providers: Vec<Address> = env
        .storage()
        .persistent()
        .get(&DataKey::LPProviderList(market_id))
        .unwrap_or_else(|| Vec::new(env));

    if env
        .storage()
        .persistent()
        .has(&DataKey::LPProviderList(market_id))
    {
        bump_lp_provider_list(env, market_id);
    }

    let mut positions = Vec::new(env);
    for provider in providers.iter() {
        if let Some(position) = env
            .storage()
            .persistent()
            .get::<DataKey, LPPosition>(&DataKey::LPPosition(market_id, provider.clone()))
        {
            positions.push_back(position);
            bump_lp_position(env, market_id, &provider);
        }
    }

    positions
}

/// Withdraw accumulated trading fees for a liquidity provider
pub fn collect_lp_fees(
    env: &Env,
    provider: Address,
    market_id: u64,
) -> Result<i128, InsightArenaError> {
    provider.require_auth();

    let mut position = get_lp_position(env, &provider, market_id)?;

    if position.fees_earned == 0 {
        return Err(InsightArenaError::InvalidInput);
    }

    let fees = position.fees_earned;
    escrow::refund(env, &provider, fees)?;

    position.fees_earned = 0;
    save_lp_position(env, &position);

    Ok(fees)
}

// ── Analytics ─────────────────────────────────────────────────────────────────

pub fn update_pool_volume(env: &Env, market_id: u64, amount: i128) {
    let volume_entries: Vec<(u64, i128)> = env
        .storage()
        .persistent()
        .get(&DataKey::PoolVolume(market_id))
        .unwrap_or_else(|| Vec::new(env));

    let now = env.ledger().timestamp();
    let twenty_four_hours: u64 = 24 * 60 * 60;
    let cutoff = now.saturating_sub(twenty_four_hours);

    let mut new_entries = Vec::new(env);
    for entry in volume_entries.iter() {
        if entry.0 >= cutoff {
            new_entries.push_back(entry);
        }
    }

    new_entries.push_back((now, amount));
    env.storage()
        .persistent()
        .set(&DataKey::PoolVolume(market_id), &new_entries);
    env.storage().persistent().extend_ttl(
        &DataKey::PoolVolume(market_id),
        PERSISTENT_THRESHOLD,
        PERSISTENT_BUMP,
    );
}

pub fn get_pool_volume_24h(env: &Env, market_id: u64) -> i128 {
    let volume_entries: Vec<(u64, i128)> = env
        .storage()
        .persistent()
        .get(&DataKey::PoolVolume(market_id))
        .unwrap_or_else(|| Vec::new(env));

    let now = env.ledger().timestamp();
    let twenty_four_hours: u64 = 24 * 60 * 60;
    let cutoff = now.saturating_sub(twenty_four_hours);

    let mut total: i128 = 0;
    for entry in volume_entries.iter() {
        if entry.0 >= cutoff {
            total = total.saturating_add(entry.1);
        }
    }

    if env
        .storage()
        .persistent()
        .has(&DataKey::PoolVolume(market_id))
    {
        env.storage().persistent().extend_ttl(
            &DataKey::PoolVolume(market_id),
            PERSISTENT_THRESHOLD,
            PERSISTENT_BUMP,
        );
    }

    total
}

pub fn get_swap_history(env: &Env, market_id: u64) -> Vec<SwapRecord> {
    if env
        .storage()
        .persistent()
        .has(&DataKey::SwapHistory(market_id))
    {
        env.storage().persistent().extend_ttl(
            &DataKey::SwapHistory(market_id),
            PERSISTENT_THRESHOLD,
            PERSISTENT_BUMP,
        );
    }
    env.storage()
        .persistent()
        .get(&DataKey::SwapHistory(market_id))
        .unwrap_or_else(|| Vec::new(env))
}
