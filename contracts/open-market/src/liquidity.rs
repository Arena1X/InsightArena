use soroban_sdk::{symbol_short, Address, Env, Map, Symbol, Vec};

use crate::config::{self, PERSISTENT_BUMP, PERSISTENT_THRESHOLD};
use crate::errors::InsightArenaError;
use crate::escrow;
use crate::market;
use crate::storage_types::{
    DataKey, FeeTier, FeeTierConfig, LPPosition, LiquidityPool, Market, MarketFeeInfo,
    PriceAccumulator, PriceObservation, SwapRecord, VolatilityState, VolumeFeeConfig,
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

/// Fixed-point scale used when computing the entry-vs-current reserve ratio for
/// impermanent-loss accounting. `1e8` is chosen because it is a perfect square
/// (`(1e4)^2`), which keeps the integer-sqrt step in
/// [`calculate_impermanent_loss_bps`] exact for clean reference ratios.
const IL_RATIO_SCALE: u128 = 100_000_000;

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

/// Select the volume-based fee tier for a market given its cumulative volume.
/// Returns the index into `VolumeFeeConfig::tiers` and the corresponding fee bps.
/// The last tier whose threshold is ≤ `cumulative_volume` is chosen.
pub fn select_volume_fee_tier(
    cumulative_volume: i128,
    config: &VolumeFeeConfig,
) -> (u32, u32) {
    let mut active_idx: u32 = 0;
    let mut active_fee_bps = config.tiers.get(0).map(|t| t.fee_bps).unwrap_or(30);

    for i in 1..config.tiers.len() {
        let entry = config.tiers.get(i).unwrap();
        if cumulative_volume >= entry.volume_threshold {
            active_idx = i;
            active_fee_bps = entry.fee_bps;
        } else {
            break;
        }
    }

    (active_idx, active_fee_bps)
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
    config::ensure_not_paused(env)?;
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

/// Return the current dynamic fee state for a market.
/// `effective_fee_bps` reflects the volume-based fee tier active for this
/// market's cumulative volume. Volatility-tier info (`tier`, `volatility_ema_bps`)
/// is provided for informational / off-chain analysis.
pub fn get_market_fee_info(env: &Env, market_id: u64) -> Result<MarketFeeInfo, InsightArenaError> {
    let mkt = market::get_market(env, market_id)?;

    let tier_config = get_fee_tier_config(env);
    let volatility = get_volatility_state(env, market_id);
    let tier = determine_fee_tier(volatility.ema_bps, &tier_config);

    let cfg = config::get_config(env)?;
    let (volume_tier_index, effective_fee_bps) =
        select_volume_fee_tier(mkt.cumulative_volume, &cfg.volume_fee_config);

    Ok(MarketFeeInfo {
        market_id,
        tier,
        effective_fee_bps,
        volatility_ema_bps: volatility.ema_bps,
        volume_tier_index,
        volume_tier_fee_bps: effective_fee_bps,
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

// ── Impermanent Loss Accounting ───────────────────────────────────────────────
//
// Scope: this contract's AMM pool is generalized to N outcomes
// (`LiquidityPool::outcome_reserves`), but the standard impermanent-loss
// formula is derived for a 2-asset constant-product pool. Rather than
// inventing a non-standard N-asset generalization, IL here is tracked against
// a single *designated pair*: the market's first two `outcome_options`, in
// declaration order (see `il_pair_reserves`). This covers the common 2-outcome
// prediction market exactly; for markets with more than 2 outcomes, the
// reported IL reflects only the price movement between those two designated
// outcomes, not the full multi-asset position. Markets with a single outcome
// degrade to a trivial (a, a) pair, for which the ratio is always 1 and IL is
// always zero.

/// Integer square root (floor) of a `u128`, via Newton's method. Soroban
/// contracts cannot use floating point, so this backs the fixed-point
/// impermanent-loss formula below.
fn isqrt_u128(n: u128) -> u128 {
    if n == 0 {
        return 0;
    }
    let mut x = n;
    let mut y = x.div_ceil(2);
    while y < x {
        x = y;
        y = (x + n / x) / 2;
    }
    x
}

/// Resolve the reserve pair this pool tracks for impermanent-loss purposes:
/// the reserves of `mkt.outcome_options[0]` and `mkt.outcome_options[1]`. If
/// the market has fewer than 2 outcomes, both entries mirror
/// `outcome_options[0]`'s reserve (ratio 1, i.e. IL is always zero).
fn il_pair_reserves(pool: &LiquidityPool, mkt: &Market) -> (i128, i128) {
    let outcome_a = match mkt.outcome_options.get(0) {
        Some(o) => o,
        None => return (0, 0),
    };
    let reserve_a = pool.outcome_reserves.get(outcome_a).unwrap_or(0);

    let reserve_b = match mkt.outcome_options.get(1) {
        Some(outcome_b) => pool.outcome_reserves.get(outcome_b).unwrap_or(reserve_a),
        None => reserve_a,
    };

    (reserve_a, reserve_b)
}

/// Compute the impermanent loss, in basis points (always `<= 0`), of an LP
/// position that entered a pool at reserve ratio `entry_a : entry_b` and is
/// now observed at `current_a : current_b`.
///
/// Uses the standard constant-product-AMM impermanent-loss formula, expressed
/// in terms of the *ratio of ratios* `k = (current_a/current_b) / (entry_a/entry_b)`:
///
/// ```text
/// IL = 2*sqrt(k) / (1 + k) - 1        (always <= 0; 0 exactly when k == 1)
/// ```
///
/// e.g. `k == 1` (no price change) gives `IL == 0`; `k == 4` (the tracked
/// pair's relative price quadruples) gives `IL == 2*sqrt(4)/(1+4) - 1 == -0.2`,
/// i.e. -2000 bps.
///
/// Substituting `N = current_a*entry_b`, `D = entry_a*current_b` (so `k = N/D`)
/// lets the whole computation stay in fixed-point integer arithmetic — Soroban
/// contracts have no floating point:
///
/// ```text
/// IL = 2*sqrt(N*D) / (N + D) - 1
/// ```
///
/// This is evaluated here by scaling the entry/current ratios by
/// [`IL_RATIO_SCALE`] (a perfect square) before taking an integer square root,
/// which keeps the result exact for clean reference ratios such as the ones
/// above.
pub fn calculate_impermanent_loss_bps(
    entry_a: i128,
    entry_b: i128,
    current_a: i128,
    current_b: i128,
) -> Result<i128, InsightArenaError> {
    if entry_a <= 0 || entry_b <= 0 || current_a <= 0 || current_b <= 0 {
        return Err(InsightArenaError::InvalidInput);
    }

    let scale = IL_RATIO_SCALE as i128;

    // r0 = (entry_a / entry_b) * SCALE, r1 = (current_a / current_b) * SCALE
    let r0 = entry_a
        .checked_mul(scale)
        .ok_or(InsightArenaError::Overflow)?
        .checked_div(entry_b)
        .ok_or(InsightArenaError::Overflow)?;
    let r1 = current_a
        .checked_mul(scale)
        .ok_or(InsightArenaError::Overflow)?
        .checked_div(current_b)
        .ok_or(InsightArenaError::Overflow)?;

    if r0 <= 0 {
        return Err(InsightArenaError::InvalidInput);
    }

    // k_scaled represents k * SCALE, where k = r1/r0 (current ratio over entry ratio).
    let k_scaled = r1
        .checked_mul(scale)
        .ok_or(InsightArenaError::Overflow)?
        .checked_div(r0)
        .ok_or(InsightArenaError::Overflow)? as u128;

    // s ~= sqrt(k) * sqrt(SCALE)
    let s = isqrt_u128(k_scaled);

    let numerator = 2u128
        .checked_mul(s)
        .and_then(|v| v.checked_mul(IL_RATIO_SCALE))
        .ok_or(InsightArenaError::Overflow)?;
    let denominator = IL_RATIO_SCALE
        .checked_add(k_scaled)
        .ok_or(InsightArenaError::Overflow)?;

    // term_bps == (2*sqrt(k)/(1+k)) * 10_000, already in basis points.
    let term_bps = numerator
        .checked_div(denominator)
        .ok_or(InsightArenaError::Overflow)?;

    let il_bps = (term_bps as i128) - 10_000;

    // By AM-GM, 2*sqrt(k)/(1+k) <= 1 always (equality only at k == 1), so
    // `il_bps` is mathematically <= 0. `.min(0)` is just a rounding-noise belt.
    Ok(il_bps.min(0))
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

/// Resolve the effective per-outcome liquidity cap for a market: a non-zero
/// `Market::outcome_liquidity_cap` override takes precedence over the global
/// `Config::max_liquidity_per_outcome`. Returns `None` when neither is set
/// (unlimited).
fn effective_outcome_cap(
    env: &Env,
    market: &Market,
) -> Result<Option<i128>, InsightArenaError> {
    if market.outcome_liquidity_cap > 0 {
        return Ok(Some(market.outcome_liquidity_cap));
    }

    let cfg = config::get_config_readonly(env)?;
    if cfg.max_liquidity_per_outcome > 0 {
        Ok(Some(cfg.max_liquidity_per_outcome))
    } else {
        Ok(None)
    }
}

/// Return the remaining liquidity capacity (stroops) for `outcome` in
/// `market_id`, or `None` if no cap applies (unlimited).
pub fn get_remaining_outcome_capacity(
    env: &Env,
    market_id: u64,
    outcome: Symbol,
) -> Result<Option<i128>, InsightArenaError> {
    let mkt = market::get_market(env, market_id)?;
    if !mkt.outcome_options.contains(outcome.clone()) {
        return Err(InsightArenaError::InvalidOutcome);
    }

    let cap = match effective_outcome_cap(env, &mkt)? {
        Some(cap) => cap,
        None => return Ok(None),
    };

    let current_reserve = env
        .storage()
        .persistent()
        .get::<_, LiquidityPool>(&DataKey::LiquidityPool(market_id))
        .and_then(|p| p.outcome_reserves.get(outcome))
        .unwrap_or(0);

    Ok(Some((cap - current_reserve).max(0)))
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

    let outcome_count = mkt.outcome_options.len() as i128;
    if outcome_count == 0 {
        return Err(InsightArenaError::InvalidInput);
    }
    let per_outcome_amount = amount / outcome_count;

    let pool = env
        .storage()
        .persistent()
        .get::<_, LiquidityPool>(&DataKey::LiquidityPool(market_id));

    // ── Per-outcome liquidity cap check (before any funds move) ──────────────
    if let Some(cap) = effective_outcome_cap(env, &mkt)? {
        for outcome in mkt.outcome_options.iter() {
            let current_reserve = pool
                .as_ref()
                .and_then(|p| p.outcome_reserves.get(outcome))
                .unwrap_or(0);
            let projected = current_reserve
                .checked_add(per_outcome_amount)
                .ok_or(InsightArenaError::Overflow)?;
            if projected > cap {
                return Err(InsightArenaError::StakeTooHigh);
            }
        }
    }

    escrow::lock_stake(env, &provider, amount)?;

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
        for outcome in mkt.outcome_options.iter() {
            let current_reserve = pool.outcome_reserves.get(outcome.clone()).unwrap_or(0);
            pool.outcome_reserves.set(
                outcome,
                current_reserve
                    .checked_add(per_outcome_amount)
                    .ok_or(InsightArenaError::Overflow)?,
            );
        }
        (lp_tokens, pool)
    } else {
        let mut reserves = Map::new(env);
        for outcome in mkt.outcome_options.iter() {
            reserves.set(outcome, per_outcome_amount);
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

    // The IL entry snapshot must never change once a position exists, even if
    // the same provider deposits again later (a "top-up"). Carry the original
    // snapshot (and the last-recorded cumulative IL) forward in that case;
    // only a brand-new position gets a fresh snapshot of the pool's current
    // designated-pair reserves.
    let existing_position: Option<LPPosition> = env
        .storage()
        .persistent()
        .get(&DataKey::LPPosition(market_id, provider.clone()));

    let (entry_reserve_a, entry_reserve_b, cumulative_il_bps) = match &existing_position {
        Some(existing) => (
            existing.entry_reserve_a,
            existing.entry_reserve_b,
            existing.cumulative_il_bps,
        ),
        None => {
            let (a, b) = il_pair_reserves(&new_pool, &mkt);
            (a, b, 0)
        }
    };

    let mut position = LPPosition::new(
        provider.clone(),
        market_id,
        lp_tokens,
        amount,
        env.ledger().timestamp(),
        entry_reserve_a,
        entry_reserve_b,
    );
    position.cumulative_il_bps = cumulative_il_bps;
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

    let mkt = market::get_market(env, market_id)?;
    let mut pool = get_pool(env, market_id)?;
    let mut position = get_lp_position(env, &provider, market_id)?;

    if position.lp_tokens < lp_tokens {
        return Err(InsightArenaError::InsufficientFunds);
    }

    let withdrawal_amount =
        calculate_liquidity_value(lp_tokens, pool.lp_token_supply, pool.total_liquidity)?;

    // Compute impermanent loss relative to the position's immutable entry
    // snapshot, using the pool's reserves as they stand *before* this
    // withdrawal mutates them (i.e. the price the provider is exiting at), and
    // persist it as the position's cumulative IL for reporting.
    let (current_a, current_b) = il_pair_reserves(&pool, &mkt);
    position.cumulative_il_bps = calculate_impermanent_loss_bps(
        position.entry_reserve_a,
        position.entry_reserve_b,
        current_a,
        current_b,
    )?;

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

    // ── Volume-based fee tier selection ────────────────────────────────────
    // The fee is derived from the market's cumulative volume *before* this
    // swap, so a trade cannot influence the fee rate it itself pays.
    let cfg = config::get_config(env)?;
    let volume_before = mkt.cumulative_volume;
    let (volume_tier_before, effective_fee_bps) =
        select_volume_fee_tier(volume_before, &cfg.volume_fee_config);

    // Volatility state is still tracked (for informational purposes / TWAP).
    let tier_config = get_fee_tier_config(env);
    let volatility_before = get_volatility_state(env, market_id);

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
    // Protocol share bps is read from the volatility-based FeeTierConfig.
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

    // Further split the protocol's fee cut between the configured treasury
    // address and liquidity providers, per `Config::treasury_split_bps` /
    // `Config::lp_split_bps` (validated at configuration time — see
    // `config::set_treasury_split` — to sum to exactly 10_000 bps). By
    // default `treasury_split_bps == 10_000`, so the entire protocol fee
    // share keeps flowing to the treasury exactly as it did before this
    // split was introduced.
    let treasury_amount = protocol_fee_share
        .checked_mul(cfg.treasury_split_bps as i128)
        .ok_or(InsightArenaError::Overflow)?
        .checked_div(10_000)
        .ok_or(InsightArenaError::Overflow)?;
    let lp_amount_from_protocol = protocol_fee_share
        .checked_sub(treasury_amount)
        .ok_or(InsightArenaError::Overflow)?;
    let total_lp_share = lp_fee_share
        .checked_add(lp_amount_from_protocol)
        .ok_or(InsightArenaError::Overflow)?;

    distribute_fees_to_lps(env, market_id, total_lp_share)?;
    if treasury_amount > 0 {
        escrow::add_to_treasury_balance(env, treasury_amount);
    }

    emit_treasury_fee_split(
        env,
        market_id,
        &cfg.treasury_address,
        fee_amount,
        treasury_amount,
        total_lp_share,
    );

    // ── Update cumulative market volume and detect tier crossing ─────────────
    let new_volume = volume_before
        .checked_add(amount_in)
        .ok_or(InsightArenaError::Overflow)?;

    let (volume_tier_after, _) =
        select_volume_fee_tier(new_volume, &cfg.volume_fee_config);

    if volume_tier_after > volume_tier_before {
        emit_volume_tier_crossed(env, market_id, volume_tier_before, volume_tier_after, new_volume);
    }

    let mut mkt = mkt;
    mkt.cumulative_volume = new_volume;
    env.storage()
        .persistent()
        .set(&DataKey::Market(market_id), &mkt);
    market::bump_market(env, market_id);

    // ── Record swap with volume tier snapshot ────────────────────────────────
    let record = SwapRecord::new(
        trader,
        market_id,
        from_outcome,
        to_outcome,
        amount_in,
        amount_out,
        fee_amount,
        env.ledger().timestamp(),
        volume_tier_before,
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

fn emit_volume_tier_crossed(
    env: &Env,
    market_id: u64,
    from_tier: u32,
    to_tier: u32,
    cumulative_volume: i128,
) {
    env.events().publish(
        (symbol_short!("vol"), symbol_short!("tier_x")),
        (market_id, from_tier, to_tier, cumulative_volume),
    );
}

/// Emit an event recording exactly how a swap's collected fee was split
/// between the protocol treasury and liquidity providers. Published on every
/// swap that reaches the fee-collection step, including zero-fee swaps (in
/// which case both shares are `0`), so off-chain consumers can reconstruct a
/// complete, gap-free accounting trail per market.
fn emit_treasury_fee_split(
    env: &Env,
    market_id: u64,
    treasury_address: &Address,
    fee_amount: i128,
    treasury_amount: i128,
    lp_amount: i128,
) {
    env.events().publish(
        (symbol_short!("fee"), symbol_short!("split")),
        (
            market_id,
            treasury_address.clone(),
            fee_amount,
            treasury_amount,
            lp_amount,
        ),
    );
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

/// Return the current impermanent loss (basis points, always `<= 0`) for an
/// open LP position, computed live against the pool's *current* reserves.
///
/// Unlike `LPPosition::cumulative_il_bps` (only refreshed as of the position's
/// last withdrawal), this always reflects "now" — it recomputes
/// `calculate_impermanent_loss_bps` from the position's immutable entry
/// snapshot and the pool's live reserves on every call, without mutating any
/// stored state.
pub fn get_position_il(
    env: &Env,
    provider: Address,
    market_id: u64,
) -> Result<i128, InsightArenaError> {
    let mkt = market::get_market(env, market_id)?;
    let pool = get_pool(env, market_id)?;
    let position = get_lp_position(env, &provider, market_id)?;

    let (current_a, current_b) = il_pair_reserves(&pool, &mkt);

    calculate_impermanent_loss_bps(
        position.entry_reserve_a,
        position.entry_reserve_b,
        current_a,
        current_b,
    )
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
    config::ensure_not_paused(env)?;
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
