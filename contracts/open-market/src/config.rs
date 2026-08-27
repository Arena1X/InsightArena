use soroban_sdk::{contracttype, symbol_short, Address, Env, Symbol, Vec};

#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ReputationDecayMode {
    Exponential,
    Linear,
}

use crate::errors::InsightArenaError;
use crate::storage_types::{DataKey, VolumeFeeConfig};

// ── TTL constants ─────────────────────────────────────────────────────────────
// Assuming ~5 s per ledger:
//   PERSISTENT_BUMP      ≈ 30 days  (518 400 ledgers)
//   PERSISTENT_THRESHOLD ≈ 29 days  — only bump when remaining TTL falls below this
pub const PERSISTENT_BUMP: u32 = 518_400;
pub const PERSISTENT_THRESHOLD: u32 = 501_120; // PERSISTENT_BUMP − 1 day

// ── Governance timelock defaults ──────────────────────────────────────────────
/// Default delay (seconds) a passed governance proposal must sit in the queue
/// before it becomes executable. ~2 days at real time. Admin-configurable via
/// [`set_timelock_delay`].
pub const DEFAULT_TIMELOCK_DELAY: u64 = 172_800;
pub const DEFAULT_MAX_OUTCOMES: u32 = 10;

// ── Storage-specific TTL constants (merged from ttl.rs) ───────────────────────
// ~30 days at ~6s/ledger for frequently accessed market state.
pub const LEDGER_BUMP_MARKET: u32 = 432_000;
// ~7 days for prediction records after payout is claimed.
pub const LEDGER_BUMP_PREDICTION_CLAIMED: u32 = 100_800;
// ~90 days for long-lived user profiles.
pub const LEDGER_BUMP_USER: u32 = 1_296_000;
// ~7 days for short-lived invite code records.
pub const LEDGER_BUMP_INVITE: u32 = 100_800;
// ~1 year for global config and season snapshots.
pub const LEDGER_BUMP_PERMANENT: u32 = 5_184_000;

// ── Active-market hot-key TTL thresholds (Issue #1516) ────────────────────────
// An active market is backed by several "hot" persistent keys that are read and
// written throughout its lifecycle: the market record itself, the AMM escrow
// pool that custodies pooled reserves, and the rolling price accumulator
// (volatility state) used to derive dynamic fees. If any of these is archived
// mid-lifecycle, the market becomes unusable for stakers. They are therefore
// bumped together on every active-market write via [`extend_active_market_ttl`],
// and can be topped up permissionlessly through the `bump_market_ttl`
// maintenance entry point.
//
// Kept equal to `LEDGER_BUMP_MARKET` so the escrow and accumulator never expire
// before the market they belong to; retune the whole set from here.
pub const LEDGER_BUMP_ESCROW: u32 = LEDGER_BUMP_MARKET;
pub const LEDGER_BUMP_ACCUMULATOR: u32 = LEDGER_BUMP_MARKET;

fn ttl_threshold(max: u32) -> u32 {
    max.saturating_sub(14_400)
}

pub fn extend_market_ttl(env: &Env, market_id: u64) {
    let extension = market_ttl_extension_amount(env);
    env.storage().persistent().extend_ttl(
        &DataKey::Market(market_id),
        ttl_threshold(extension),
        extension,
    );
}

/// Number of ledgers to extend a market's TTL by on each interaction and via
/// the explicit `market::extend_market_ttl` maintenance entrypoint. Reads the
/// admin-configurable `Config::market_ttl_extension`, falling back to
/// `LEDGER_BUMP_MARKET` if the contract has not been initialized yet.
fn market_ttl_extension_amount(env: &Env) -> u32 {
    get_config_readonly(env)
        .map(|c| c.market_ttl_extension)
        .unwrap_or(LEDGER_BUMP_MARKET)
}

/// Extend the TTL on every "hot" persistent key backing an active market so that
/// none of them is archived out from under stakers mid-lifecycle:
///
/// - [`DataKey::Market`] — the market record (always present),
/// - [`DataKey::LiquidityPool`] — the AMM escrow pool holding pooled reserves,
/// - [`DataKey::VolatilityState`] — the rolling price accumulator.
///
/// The market record is bumped via [`extend_market_ttl`], honouring the
/// admin-configurable extension amount. The escrow and accumulator keys are
/// optional — a market with no AMM liquidity has no pool, and one with no
/// recorded swaps has no volatility state — so each is bumped only when
/// [`has`](soroban_sdk::storage::Persistent::has) confirms it exists, because
/// `extend_ttl` panics on a missing key.
///
/// This is the single choke point for active-market TTL maintenance: it is called
/// on every active-market write and by the permissionless `bump_market_ttl` entry
/// point. Callers must ensure the market record exists before invoking it.
pub fn extend_active_market_ttl(env: &Env, market_id: u64) {
    // Market record — always present for a live market; honours admin config.
    extend_market_ttl(env, market_id);

    // Escrow / AMM pool — only when the market has a liquidity pool.
    if env
        .storage()
        .persistent()
        .has(&DataKey::LiquidityPool(market_id))
    {
        env.storage().persistent().extend_ttl(
            &DataKey::LiquidityPool(market_id),
            ttl_threshold(LEDGER_BUMP_ESCROW),
            LEDGER_BUMP_ESCROW,
        );
    }

    // Price accumulator — only after at least one swap has recorded volatility.
    if env
        .storage()
        .persistent()
        .has(&DataKey::VolatilityState(market_id))
    {
        env.storage().persistent().extend_ttl(
            &DataKey::VolatilityState(market_id),
            ttl_threshold(LEDGER_BUMP_ACCUMULATOR),
            LEDGER_BUMP_ACCUMULATOR,
        );
    }
}

pub fn extend_prediction_ttl(env: &Env, market_id: u64, predictor: &Address) {
    env.storage().persistent().extend_ttl(
        &DataKey::Prediction(market_id, predictor.clone()),
        ttl_threshold(LEDGER_BUMP_MARKET),
        LEDGER_BUMP_MARKET,
    );
}

pub fn shorten_prediction_ttl_after_claim(env: &Env, market_id: u64, predictor: &Address) {
    env.storage().temporary().extend_ttl(
        &DataKey::Prediction(market_id, predictor.clone()),
        ttl_threshold(LEDGER_BUMP_PREDICTION_CLAIMED),
        LEDGER_BUMP_PREDICTION_CLAIMED,
    );
}

pub fn extend_user_ttl(env: &Env, user: &Address) {
    env.storage().persistent().extend_ttl(
        &DataKey::User(user.clone()),
        ttl_threshold(LEDGER_BUMP_USER),
        LEDGER_BUMP_USER,
    );
}

pub fn extend_invite_ttl(env: &Env, code: &Symbol) {
    env.storage().persistent().extend_ttl(
        &DataKey::InviteCode(code.clone()),
        ttl_threshold(LEDGER_BUMP_INVITE),
        LEDGER_BUMP_INVITE,
    );
}

pub fn extend_config_ttl(env: &Env) {
    env.storage().persistent().extend_ttl(
        &DataKey::Config,
        ttl_threshold(LEDGER_BUMP_PERMANENT),
        LEDGER_BUMP_PERMANENT,
    );
}

pub fn extend_season_ttl(env: &Env, season_id: u32) {
    env.storage().persistent().extend_ttl(
        &DataKey::Season(season_id),
        ttl_threshold(LEDGER_BUMP_PERMANENT),
        LEDGER_BUMP_PERMANENT,
    );

    if env
        .storage()
        .persistent()
        .has(&DataKey::Leaderboard(season_id))
    {
        env.storage().persistent().extend_ttl(
            &DataKey::Leaderboard(season_id),
            ttl_threshold(LEDGER_BUMP_PERMANENT),
            LEDGER_BUMP_PERMANENT,
        );
    }
}

// ── Config struct ─────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone, Debug)]
pub struct Config {
    /// Platform administrator; the only address allowed to call mutators.
    pub admin: Address,
    /// Platform cut in basis points (e.g. 200 = 2 %).
    pub protocol_fee_bps: u32,
    /// Hard cap on the fee a market creator may charge, in basis points.
    pub max_creator_fee_bps: u32,
    /// Global per-prediction minimum stake in stroops. Markets may override
    /// this with a non-zero `Market::min_stake`; `0` on the market means
    /// "use this global floor".
    pub min_stake_xlm: i128,
    /// Global per-prediction maximum stake in stroops. Markets may override
    /// this with a non-zero `Market::max_stake`; `0` on the market means
    /// "use this global ceiling". Must always satisfy `min_stake_xlm <= max_stake_xlm`.
    pub max_stake_xlm: i128,
    /// Trusted oracle contract address used for market resolution.
    pub oracle_address: Address,
    /// Address of the XLM Stellar Asset Contract used for escrow transfers.
    pub xlm_token: Address,
    /// When `true`, all non-admin entry points must revert with `Paused`.
    /// Set via [`set_paused`]: only `guardian` may set this to `true`
    /// (pause); only `admin` may set it back to `false` (unpause).
    pub is_paused: bool,
    /// Address authorized to veto a queued governance proposal during its
    /// timelock window, and to engage the emergency pause (see
    /// [`set_paused`]). Distinct from `admin` so a single compromised role
    /// cannot both halt *and* resume the contract. Defaults to `admin` at
    /// initialization.
    pub guardian: Address,
    /// Delay (seconds) a passed governance proposal must wait in the queue
    /// before `execute_proposal` will apply it. This value — and `guardian`
    /// above — are only mutable via the admin-only setters in this module;
    /// no `ProposalType` variant may change them, so a proposal can never
    /// vote itself a shorter timelock or a friendlier guardian.
    pub timelock_delay: u64,
    /// Minimum reputation score (0-1000, see
    /// `reputation::calculate_creator_reputation`) a creator must have to
    /// create a market. Creators below this score are rejected with
    /// `InsufficientReputation` unless they are on the trusted-creator
    /// allowlist (`DataKey::TrustedCreator`). Governance-configurable via
    /// `set_min_creator_reputation` (admin, immediate) or
    /// `ProposalType::UpdateMinReputation` (timelocked governance). Defaults
    /// to `0` at initialization, which disables the gate entirely.
    pub min_creator_reputation: u32,
    /// Half-life (seconds) used to decay a creator's live reputation score
    /// toward zero as seconds pass since `CreatorStats::last_updated` with
    /// no new activity. Read-time only — never mutates stored counters. See
    /// `reputation::apply_reputation_decay`. Must be > 0.
    pub reputation_half_life_seconds: u32,
    /// Decay curve applied at read time. See `reputation::apply_reputation_decay`.
    pub reputation_decay_mode: ReputationDecayMode,
    /// Number of ledgers a market's persistent-storage entry is extended by
    /// on each interaction (`market::bump_market`) and by the explicit
    /// `extend_market_ttl` maintenance entrypoint. Admin-configurable via
    /// `set_market_ttl_extension`. Defaults to `LEDGER_BUMP_MARKET` (~30
    /// days) at initialization.
    pub market_ttl_extension: u32,
    /// Share (bps, 0-10000) of every slashed bond (failed dispute/appeal
    /// forfeiture) routed into the insurance pool rather than the protocol
    /// treasury. Governance-configurable via `set_insurance_pool_share_bps`.
    /// Defaults to `1000` (10%) at initialization.
    pub insurance_pool_share_bps: u32,
    /// Running balance (stroops) held in the insurance pool, funded by
    /// `insurance_pool_share_bps` of every slashed bond. Drawn down only via
    /// `escrow::draw_insurance_pool` (admin/governance-only) to cover
    /// documented accounting/settlement shortfalls.
    pub insurance_pool_balance: i128,
    /// Cumulative total (stroops) ever paid out of the insurance pool via
    /// `escrow::draw_insurance_pool`. Monotonic; never decreases.
    pub insurance_pool_payouts_total: i128,
    /// Global cap (stroops) on the liquidity any single outcome's AMM
    /// reserve may hold. `0` means unlimited. Markets may override this with
    /// a non-zero `Market::outcome_liquidity_cap`; see
    /// `liquidity::add_liquidity`. Admin-configurable via
    /// `set_max_liquidity_per_outcome`. Defaults to `0` at initialization.
    pub max_liquidity_per_outcome: i128,
    /// Address that receives the protocol's share of every collected swap
    /// fee (see `treasury_split_bps`), tracked via the internal treasury
    /// balance (`escrow::get_treasury_balance` / `escrow::withdraw_treasury`).
    /// Admin-configurable via `set_treasury_split`. Defaults to `admin` at
    /// initialization.
    pub treasury_address: Address,
    /// Share (bps, 0-10000) of the protocol's fee cut — i.e. the portion of
    /// every collected swap fee already earmarked for the protocol via
    /// `FeeTierConfig::protocol_share_bps` (see `liquidity::swap_outcome`) —
    /// that is routed to `treasury_address` rather than redistributed to
    /// liquidity providers. Paired with `lp_split_bps`; the two must always
    /// sum to exactly `10_000`, enforced by `set_treasury_split`. Defaults to
    /// `10_000` (100%) at initialization, which preserves the pre-existing
    /// behaviour where the entire protocol fee share accrues to the
    /// treasury.
    pub treasury_split_bps: u32,
    /// Complement of `treasury_split_bps`: share (bps) of the protocol's fee
    /// cut redirected to liquidity providers instead of the treasury.
    /// Defaults to `0` at initialization. See `treasury_split_bps`.
    pub lp_split_bps: u32,
    /// Fraction (bps, 0-10000) of a dispute's total assigned arbiter weight
    /// that must have voted before `dispute::finalize_arbiter_vote` will
    /// settle the panel. Snapshotted onto each `Dispute` when its panel is
    /// assigned via `dispute::assign_arbiters`. Admin-configurable via
    /// `set_arbiter_config`. Defaults to `5000` (50%).
    pub arbiter_quorum_bps: u32,
    /// Share (bps, 0-10000) of an assigned arbiter's staked bond
    /// (`dispute::get_arbiter_stake`) slashed when they fail to vote before
    /// their dispute's `voting_deadline`. The slashed amount is
    /// redistributed to arbiters who did vote, proportional to their
    /// weight. Admin-configurable via `set_arbiter_config`. Defaults to
    /// `1000` (10%).
    pub arbiter_slash_bps: u32,
    /// Duration (seconds) of the voting window granted to an arbiter panel
    /// once assigned via `dispute::assign_arbiters`. Admin-configurable via
    /// `set_arbiter_config`. Defaults to `172_800` (~2 days).
    pub arbiter_voting_period_seconds: u64,
    /// Minimum participation threshold (bps of total registered users, 0-10000)
    /// required for a governance proposal to pass. Proposals where total votes
    /// (for + against) fall below this fraction of registered users are rejected
    /// with `Unauthorized`, regardless of the yes/no ratio.
    ///
    /// Admin-configurable via [`set_governance_quorum_bps`] (immediate) or
    /// via `ProposalType::UpdateQuorum` (timelocked governance path). Defaults
    /// to `1000` (10%) at initialization.
    pub governance_quorum_bps: u32,
    /// Maximum number of mutually exclusive outcomes allowed per market.
    /// Admin-configurable via [`set_max_outcomes`]. Defaults to 10 at initialization.
    pub max_outcomes: u32,
    /// Volume-based fee tier schedule. Governs the swap fee charged by every
    /// market's AMM pool based on its cumulative trading volume.
    /// Governance-configurable via `set_volume_fee_config` (admin, immediate).
    /// Defaults to [`VolumeFeeConfig::default_config`] at initialization.
    pub volume_fee_config: VolumeFeeConfig,
    /// Stake (stroops) an oracle must lock via
    /// `dispute::submit_resolution_with_stake` when submitting a market
    /// resolution. Held through the market's dispute window; slashed if a
    /// dispute overturns the resolution, refunded plus a reward otherwise.
    /// Admin-configurable via `set_oracle_stake_config`. Defaults to
    /// `100_000_000` (10 XLM) at initialization.
    pub oracle_stake_amount: i128,
    /// Reward paid to the oracle (bps of their locked stake) when their
    /// submitted resolution stands unchallenged or survives a dispute.
    /// Paid out of the protocol treasury balance, capped at what the
    /// treasury actually holds. Admin-configurable via
    /// `set_oracle_stake_config`. Defaults to `500` (5%) at initialization.
    pub oracle_reward_bps: u32,
    /// Number of vesting tranches a `season::finalize_season` reward is
    /// split into, instead of one lump payout. Admin-configurable via
    /// `set_vesting_config`. Defaults to `4` at initialization.
    pub vesting_tranche_count: u32,
    /// Seconds between successive tranche unlocks in a season reward vesting
    /// schedule. Admin-configurable via `set_vesting_config`. Defaults to
    /// `2_592_000` (~30 days) at initialization.
    pub vesting_interval_seconds: u64,
    /// Refundable bond (stroops) required from the creator at market creation
    /// time to deter spam and low-quality markets. Held in escrow until the
    /// market is resolved normally (refunded to creator) or cancelled as
    /// invalid/spam (forfeited to the protocol treasury). `0` disables the
    /// bond requirement. Admin-configurable via [`set_bond_amount`] or the
    /// governance path `ProposalType::UpdateBondAmount`. Defaults to `0`
    /// at initialization (disabled).
    pub bond_amount: i128,
    /// Early-exit fee (bps, 0-10000) applied to partial withdrawals before
    /// market lock time. Deducted from the withdrawal amount and redistributed
    /// to remaining participants. Admin-configurable via `set_early_exit_fee_bps`.
    /// Defaults to `500` (5%) at initialization.
    pub early_exit_fee_bps: u32,
    /// Number of fully-inactive seasons (no market created/resolved/disputed
    /// by the creator) tolerated before season-based reputation decay begins
    /// to apply. `0` means decay starts from the very first inactive season.
    /// Applied lazily, at read time, on top of the existing time-based decay
    /// (`reputation_half_life_seconds`). Admin-configurable via
    /// `set_season_decay_config`. Defaults to `1` at initialization.
    /// See `reputation::apply_season_inactivity_decay`.
    pub reputation_season_decay_grace: u32,
    /// Decay (bps, 0-10000) applied to a creator's reputation score for each
    /// inactive season beyond `reputation_season_decay_grace`, compounding
    /// multiplicatively (i.e. `score *= (10000 - bps) / 10000` per inactive
    /// season). `0` disables season-based decay entirely. Admin-configurable
    /// via `set_season_decay_config`. Defaults to `1000` (10% per season) at
    /// initialization. See `reputation::apply_season_inactivity_decay`.
    pub reputation_season_decay_bps: u32,
}

// ── Private helpers ───────────────────────────────────────────────────────────

/// Extend the persistent TTL for the Config entry whenever it drops below
/// `PERSISTENT_THRESHOLD`. Must be called on every read *and* every write.
fn bump_config(env: &Env) {
    extend_config_ttl(env);
}

/// Load Config from persistent storage.
/// Returns `NotInitialized` if the key is absent rather than panicking.
fn load_config(env: &Env) -> Result<Config, InsightArenaError> {
    env.storage()
        .persistent()
        .get(&DataKey::Config)
        .ok_or(InsightArenaError::NotInitialized)
}

fn validate_protocol_fee(fee_bps: u32) -> Result<(), InsightArenaError> {
    if fee_bps > 10_000 {
        return Err(InsightArenaError::InvalidFee);
    }

    Ok(())
}

/// Validate that a protocol-treasury-vs-LP fee split sums to exactly
/// `10_000` bps. Reusing `InvalidFee` here matches the convention already
/// used by `validate_protocol_fee` and `set_insurance_pool_share_bps` for
/// bps-range validation.
fn validate_treasury_split(treasury_split_bps: u32, lp_split_bps: u32) -> Result<(), InsightArenaError> {
    if treasury_split_bps.checked_add(lp_split_bps) != Some(10_000) {
        return Err(InsightArenaError::InvalidFee);
    }

    Ok(())
}

fn validate_min_reputation(threshold: u32) -> Result<(), InsightArenaError> {
    // Reputation scores are clamped to [0, 1000] by `calculate_creator_reputation`;
    // a higher threshold could never be met by anyone, which is almost certainly
    // a misconfiguration rather than an intentional full lockout.
    if threshold > 1000 {
        return Err(InsightArenaError::InvalidInput);
    }

    Ok(())
}

/// Validate global (or market-override) stake bounds.
///
/// Both bounds must be strictly positive and `min_stake <= max_stake`.
pub(crate) fn validate_stake_bounds(min_stake: i128, max_stake: i128) -> Result<(), InsightArenaError> {
    if min_stake <= 0 || max_stake <= 0 {
        return Err(InsightArenaError::InvalidInput);
    }
    if min_stake > max_stake {
        return Err(InsightArenaError::InvalidInput);
    }
    Ok(())
}

/// Resolve the effective `[min, max]` stake window for a market.
///
/// A non-zero market field is treated as a per-market override and takes
/// precedence over the corresponding global `Config` bound. A zero market
/// field inherits the global bound. The resolved pair is always validated.
pub fn resolve_stake_bounds(
    env: &Env,
    market_min_stake: i128,
    market_max_stake: i128,
) -> Result<(i128, i128), InsightArenaError> {
    let cfg = load_config(env)?;
    let min = if market_min_stake > 0 {
        market_min_stake
    } else {
        cfg.min_stake_xlm
    };
    let max = if market_max_stake > 0 {
        market_max_stake
    } else {
        cfg.max_stake_xlm
    };
    validate_stake_bounds(min, max)?;
    Ok((min, max))
}

// ── Entry-point logic (called from contractimpl in lib.rs) ────────────────────

/// One-time contract setup.
///
/// Stores the initial [`Config`] and returns `AlreadyInitialized` on any
/// subsequent call, providing an idempotency guard.
pub fn initialize(
    env: &Env,
    admin: Address,
    oracle: Address,
    fee_bps: u32,
    xlm_token: Address,
) -> Result<(), InsightArenaError> {
    if env.storage().persistent().has(&DataKey::Config) {
        return Err(InsightArenaError::AlreadyInitialized);
    }

    validate_protocol_fee(fee_bps)?;

    let admin_for_treasury = admin.clone();
    let config = Config {
        guardian: admin.clone(),
        admin,
        protocol_fee_bps: fee_bps,
        max_creator_fee_bps: 500,  // 5 % absolute cap for market creators
        min_stake_xlm: 10_000_000, // 1 XLM expressed in stroops
        max_stake_xlm: 1_000_000_000_000, // 100_000 XLM expressed in stroops
        oracle_address: oracle,
        xlm_token,
        is_paused: false,
        timelock_delay: DEFAULT_TIMELOCK_DELAY,
        min_creator_reputation: 0, // gate disabled by default; admin/governance opt in
        reputation_half_life_seconds: 2_592_000, // ~30 days
        reputation_decay_mode: ReputationDecayMode::Exponential,
        market_ttl_extension: LEDGER_BUMP_MARKET,
        insurance_pool_share_bps: 1000, // 10% of every slashed bond reserved by default
        insurance_pool_balance: 0,
        insurance_pool_payouts_total: 0,
        max_liquidity_per_outcome: 0, // unlimited until admin configures a cap
        treasury_address: admin_for_treasury,
        treasury_split_bps: 10_000, // 100% to treasury, preserving prior behaviour
        lp_split_bps: 0,
        arbiter_quorum_bps: 5000, // 50% of assigned weight must vote
        arbiter_slash_bps: 1000,  // 10% of stake slashed for a missed vote
        arbiter_voting_period_seconds: 172_800, // ~2 days
        governance_quorum_bps: 1000, // 10% of registered users must participate
        max_outcomes: DEFAULT_MAX_OUTCOMES,
        volume_fee_config: VolumeFeeConfig::default_config(env),
        oracle_stake_amount: 100_000_000, // 10 XLM expressed in stroops
        oracle_reward_bps: 500, // 5% of stake paid as a reward when resolution stands
        vesting_tranche_count: 4,
        vesting_interval_seconds: 2_592_000, // ~30 days
        bond_amount: 0, // disabled by default; admin/governance opt in
        early_exit_fee_bps: 500, // 5% default early-exit fee
        reputation_season_decay_grace: 1, // tolerate one inactive season before decaying
        reputation_season_decay_bps: 1000, // 10% compounding decay per inactive season
    };

    env.storage().persistent().set(&DataKey::Config, &config);
    bump_config(env);
    env.storage()
        .instance()
        .set(&DataKey::Categories, &default_categories(env));
    env.storage()
        .instance()
        .extend_ttl(PERSISTENT_THRESHOLD, PERSISTENT_BUMP);

    Ok(())
}

pub(crate) fn default_categories(env: &Env) -> Vec<Symbol> {
    let mut categories = Vec::new(env);
    categories.push_back(Symbol::new(env, "Sports"));
    categories.push_back(Symbol::new(env, "Crypto"));
    categories.push_back(Symbol::new(env, "Politics"));
    categories.push_back(Symbol::new(env, "Entertainment"));
    categories.push_back(Symbol::new(env, "Science"));
    categories.push_back(Symbol::new(env, "Other"));
    categories
}

/// Return the current global [`Config`] and extend its TTL.
pub fn get_config(env: &Env) -> Result<Config, InsightArenaError> {
    let config = load_config(env)?;
    bump_config(env);
    Ok(config)
}

/// Return the current global [`Config`] without mutating storage.
///
/// This helper is intended for strict view functions that must avoid any state
/// writes, including TTL extension side-effects.
pub fn get_config_readonly(env: &Env) -> Result<Config, InsightArenaError> {
    load_config(env)
}

/// Update the protocol fee rate. Caller must be the stored admin.
pub fn update_protocol_fee(env: &Env, new_fee_bps: u32) -> Result<(), InsightArenaError> {
    ensure_not_paused(env)?;
    let mut config = load_config(env)?;

    // Authorisation check — reverts the entire transaction if auth is absent.
    config.admin.require_auth();

    validate_protocol_fee(new_fee_bps)?;

    config.protocol_fee_bps = new_fee_bps;
    env.storage().persistent().set(&DataKey::Config, &config);
    bump_config(env);

    Ok(())
}

pub fn update_protocol_fee_from_governance(
    env: &Env,
    new_fee_bps: u32,
) -> Result<(), InsightArenaError> {
    let mut config = load_config(env)?;
    validate_protocol_fee(new_fee_bps)?;
    config.protocol_fee_bps = new_fee_bps;
    env.storage().persistent().set(&DataKey::Config, &config);
    bump_config(env);
    Ok(())
}

/// Engage or lift the emergency pause, enforcing strict separation of duties:
///
/// - Pausing (`paused == true`) may only be authorized by the stored
///   **guardian**. The guardian is a distinct, lower-trust role intended to
///   react quickly to a discovered exploit without needing full admin
///   authority.
/// - Unpausing (`paused == false`) may only be authorized by the stored
///   **admin**. This ensures a single compromised or malicious guardian can
///   halt the contract but can never be the one to resume it — resuming
///   operation after an incident requires the higher-trust admin role.
///
/// While `paused` is `true`, all fund-moving and other sensitive entry points
/// call [`ensure_not_paused`] (or, for the escrow primitives, check it
/// directly) and revert with [`InsightArenaError::Paused`].
///
/// `reason_code` is an opaque, caller-defined code (e.g. 1 = incident,
/// 2 = scheduled maintenance, 0 = resume/no reason) recorded on the emitted
/// event for off-chain auditing. It is not validated or persisted.
///
/// # Errors
/// - `Unauthorized` is not returned directly here; instead `require_auth`
///   panics (reverting the transaction) when the wrong role signs the call,
///   consistent with every other role-gated setter in this module.
pub fn set_paused(env: &Env, paused: bool, reason_code: u32) -> Result<(), InsightArenaError> {
    let mut config = load_config(env)?;

    // Separation of duties: the guardian engages the pause, only the admin
    // may lift it. Branching on `paused` (rather than exposing two entry
    // points) keeps the public ABI unchanged while still requiring the
    // correct, distinct role for each direction.
    let actor = if paused {
        config.guardian.require_auth();
        config.guardian.clone()
    } else {
        config.admin.require_auth();
        config.admin.clone()
    };

    config.is_paused = paused;
    env.storage().persistent().set(&DataKey::Config, &config);
    bump_config(env);

    emit_paused_toggled(env, &actor, paused, reason_code);

    Ok(())
}

fn emit_paused_toggled(env: &Env, actor: &Address, paused: bool, reason_code: u32) {
    env.events().publish(
        (symbol_short!("cfg"), symbol_short!("paused")),
        (actor.clone(), paused, reason_code),
    );
}

pub fn transfer_admin(env: &Env, new_admin: Address) -> Result<(), InsightArenaError> {
    ensure_not_paused(env)?;
    let mut config = load_config(env)?;

    // Auth against the *current* admin before overwriting.
    config.admin.require_auth();

    config.admin = new_admin;
    env.storage().persistent().set(&DataKey::Config, &config);
    bump_config(env);

    Ok(())
}

/// Update the trusted oracle address. Caller must be the current admin.
///
/// After this call the old oracle address can no longer resolve markets.
pub fn update_oracle(
    env: &Env,
    admin: Address,
    new_oracle: Address,
) -> Result<(), InsightArenaError> {
    ensure_not_paused(env)?;
    let mut config = load_config(env)?;

    // Auth against the *current* admin.
    admin.require_auth();

    if admin != config.admin {
        return Err(InsightArenaError::Unauthorized);
    }

    let old_oracle = config.oracle_address;
    config.oracle_address = new_oracle.clone();
    env.storage().persistent().set(&DataKey::Config, &config);
    bump_config(env);

    emit_oracle_updated(env, &old_oracle, &new_oracle);

    Ok(())
}

fn emit_oracle_updated(env: &Env, old_oracle: &Address, new_oracle: &Address) {
    env.events().publish(
        (symbol_short!("cfg"), symbol_short!("ora_upd")),
        (old_oracle.clone(), new_oracle.clone()),
    );
}

/// Update the governance timelock delay. Caller must be the stored admin.
///
/// This is intentionally only reachable through the admin path — no
/// `ProposalType` exists to change it via governance — so a proposal can
/// never shorten its own timelock to bypass the veto window.
pub fn set_timelock_delay(
    env: &Env,
    admin: Address,
    new_delay: u64,
) -> Result<(), InsightArenaError> {
    ensure_not_paused(env)?;
    let mut config = load_config(env)?;

    admin.require_auth();
    if admin != config.admin {
        return Err(InsightArenaError::Unauthorized);
    }

    let old_delay = config.timelock_delay;
    config.timelock_delay = new_delay;
    env.storage().persistent().set(&DataKey::Config, &config);
    bump_config(env);

    emit_timelock_delay_updated(env, old_delay, new_delay);

    Ok(())
}

fn emit_timelock_delay_updated(env: &Env, old_delay: u64, new_delay: u64) {
    env.events().publish(
        (symbol_short!("cfg"), symbol_short!("tl_upd")),
        (old_delay, new_delay),
    );
}

/// Update the governance guardian address. Caller must be the stored admin.
///
/// Like `timelock_delay`, this is only reachable through the admin path —
/// no `ProposalType` exists to change it via governance — so a proposal can
/// never appoint a friendly guardian to neutralize the veto safeguard.
pub fn set_guardian(
    env: &Env,
    admin: Address,
    new_guardian: Address,
) -> Result<(), InsightArenaError> {
    ensure_not_paused(env)?;
    let mut config = load_config(env)?;

    admin.require_auth();
    if admin != config.admin {
        return Err(InsightArenaError::Unauthorized);
    }

    let old_guardian = config.guardian;
    config.guardian = new_guardian.clone();
    env.storage().persistent().set(&DataKey::Config, &config);
    bump_config(env);

    emit_guardian_updated(env, &old_guardian, &new_guardian);

    Ok(())
}

fn emit_guardian_updated(env: &Env, old_guardian: &Address, new_guardian: &Address) {
    env.events().publish(
        (symbol_short!("cfg"), symbol_short!("grd_upd")),
        (old_guardian.clone(), new_guardian.clone()),
    );
}

/// Update the minimum creator reputation required to create a market.
/// Caller must be the stored admin. For the timelocked governance path see
/// [`update_min_reputation_from_governance`], invoked via
/// `ProposalType::UpdateMinReputation`.
pub fn set_min_creator_reputation(
    env: &Env,
    admin: Address,
    new_threshold: u32,
) -> Result<(), InsightArenaError> {
    ensure_not_paused(env)?;
    let mut config = load_config(env)?;

    admin.require_auth();
    if admin != config.admin {
        return Err(InsightArenaError::Unauthorized);
    }

    validate_min_reputation(new_threshold)?;

    let old_threshold = config.min_creator_reputation;
    config.min_creator_reputation = new_threshold;
    env.storage().persistent().set(&DataKey::Config, &config);
    bump_config(env);

    emit_min_reputation_updated(env, old_threshold, new_threshold);

    Ok(())
}

/// Governance path for updating the minimum reputation threshold. Called only
/// from `governance::execute_proposal` after a `ProposalType::UpdateMinReputation`
/// proposal has cleared quorum, majority, and the timelock window.
pub fn update_min_reputation_from_governance(
    env: &Env,
    new_threshold: u32,
) -> Result<(), InsightArenaError> {
    let mut config = load_config(env)?;
    validate_min_reputation(new_threshold)?;

    let old_threshold = config.min_creator_reputation;
    config.min_creator_reputation = new_threshold;
    env.storage().persistent().set(&DataKey::Config, &config);
    bump_config(env);

    emit_min_reputation_updated(env, old_threshold, new_threshold);

    Ok(())
}

fn emit_min_reputation_updated(env: &Env, old_threshold: u32, new_threshold: u32) {
    env.events().publish(
        (symbol_short!("cfg"), symbol_short!("rep_upd")),
        (old_threshold, new_threshold),
    );
}

fn validate_half_life(half_life_seconds: u32) -> Result<(), InsightArenaError> {
    if half_life_seconds == 0 {
        return Err(InsightArenaError::InvalidInput);
    }
    Ok(())
}

/// Update the reputation decay half-life and curve. Caller must be the
/// stored admin.
pub fn set_reputation_decay_config(
    env: &Env,
    admin: Address,
    half_life_seconds: u32,
    mode: ReputationDecayMode,
) -> Result<(), InsightArenaError> {
    ensure_not_paused(env)?;
    let mut config = load_config(env)?;

    admin.require_auth();
    if admin != config.admin {
        return Err(InsightArenaError::Unauthorized);
    }

    validate_half_life(half_life_seconds)?;

    config.reputation_half_life_seconds = half_life_seconds;
    config.reputation_decay_mode = mode;
    env.storage().persistent().set(&DataKey::Config, &config);
    bump_config(env);

    emit_reputation_decay_config_updated(env, half_life_seconds, mode);

    Ok(())
}

fn emit_reputation_decay_config_updated(env: &Env, half_life_seconds: u32, mode: ReputationDecayMode) {
    let mode_sym = match mode {
        ReputationDecayMode::Exponential => symbol_short!("exp"),
        ReputationDecayMode::Linear => symbol_short!("linear"),
    };
    env.events().publish(
        (symbol_short!("cfg"), symbol_short!("rdk_upd")),
        (half_life_seconds, mode_sym),
    );
}

fn validate_season_decay_bps(decay_bps: u32) -> Result<(), InsightArenaError> {
    if decay_bps > 10_000 {
        return Err(InsightArenaError::InvalidInput);
    }
    Ok(())
}

/// Update the season-inactivity reputation decay grace period and per-season
/// rate. Caller must be the stored admin. See
/// `reputation::apply_season_inactivity_decay`.
pub fn set_season_decay_config(
    env: &Env,
    admin: Address,
    grace_seasons: u32,
    decay_bps: u32,
) -> Result<(), InsightArenaError> {
    ensure_not_paused(env)?;
    let mut config = load_config(env)?;

    admin.require_auth();
    if admin != config.admin {
        return Err(InsightArenaError::Unauthorized);
    }

    validate_season_decay_bps(decay_bps)?;

    config.reputation_season_decay_grace = grace_seasons;
    config.reputation_season_decay_bps = decay_bps;
    env.storage().persistent().set(&DataKey::Config, &config);
    bump_config(env);

    emit_season_decay_config_updated(env, grace_seasons, decay_bps);

    Ok(())
}

fn emit_season_decay_config_updated(env: &Env, grace_seasons: u32, decay_bps: u32) {
    env.events().publish(
        (symbol_short!("cfg"), symbol_short!("sdk_upd")),
        (grace_seasons, decay_bps),
    );
}

/// Update the number of ledgers a market's TTL is extended by, both on each
/// interaction and via the explicit `extend_market_ttl` maintenance
/// entrypoint. Caller must be the stored admin.
pub fn set_market_ttl_extension(
    env: &Env,
    admin: Address,
    new_extension: u32,
) -> Result<(), InsightArenaError> {
    ensure_not_paused(env)?;
    let mut config = load_config(env)?;

    admin.require_auth();
    if admin != config.admin {
        return Err(InsightArenaError::Unauthorized);
    }

    if new_extension == 0 {
        return Err(InsightArenaError::InvalidInput);
    }

    let old_extension = config.market_ttl_extension;
    config.market_ttl_extension = new_extension;
    env.storage().persistent().set(&DataKey::Config, &config);
    bump_config(env);

    emit_market_ttl_extension_updated(env, old_extension, new_extension);

    Ok(())
}

fn emit_market_ttl_extension_updated(env: &Env, old_extension: u32, new_extension: u32) {
    env.events().publish(
        (symbol_short!("cfg"), symbol_short!("ttl_upd")),
        (old_extension, new_extension),
    );
}

/// Update the global per-prediction min/max stake bounds.
///
/// Caller must be the stored admin. Reverts with [`InsightArenaError::InvalidInput`]
/// when either bound is non-positive or when `min_stake > max_stake`.
pub fn set_stake_bounds(
    env: &Env,
    admin: Address,
    min_stake: i128,
    max_stake: i128,
) -> Result<(), InsightArenaError> {
    ensure_not_paused(env)?;
    let mut config = load_config(env)?;

    admin.require_auth();
    if admin != config.admin {
        return Err(InsightArenaError::Unauthorized);
    }

    validate_stake_bounds(min_stake, max_stake)?;

    let old_min = config.min_stake_xlm;
    let old_max = config.max_stake_xlm;
    config.min_stake_xlm = min_stake;
    config.max_stake_xlm = max_stake;
    env.storage().persistent().set(&DataKey::Config, &config);
    bump_config(env);

    emit_stake_bounds_updated(env, old_min, old_max, min_stake, max_stake);

    Ok(())
}

/// Governance path for updating the global minimum stake. Keeps the existing
/// `max_stake_xlm` and rejects the update when the new minimum would exceed it.
pub fn update_min_stake_from_governance(
    env: &Env,
    new_min_stake: i128,
) -> Result<(), InsightArenaError> {
    let mut config = load_config(env)?;
    validate_stake_bounds(new_min_stake, config.max_stake_xlm)?;

    let old_min = config.min_stake_xlm;
    let old_max = config.max_stake_xlm;
    config.min_stake_xlm = new_min_stake;
    env.storage().persistent().set(&DataKey::Config, &config);
    bump_config(env);

    emit_stake_bounds_updated(env, old_min, old_max, new_min_stake, old_max);

    Ok(())
}

fn emit_stake_bounds_updated(
    env: &Env,
    old_min: i128,
    old_max: i128,
    new_min: i128,
    new_max: i128,
) {
    env.events().publish(
        (symbol_short!("cfg"), symbol_short!("stk_bnd")),
        (old_min, old_max, new_min, new_max),
    );
}

/// Update the share (bps) of every slashed bond routed into the insurance
/// pool. Caller must be the stored admin.
pub fn set_insurance_pool_share_bps(
    env: &Env,
    admin: Address,
    new_share_bps: u32,
) -> Result<(), InsightArenaError> {
    ensure_not_paused(env)?;
    let mut config = load_config(env)?;

    admin.require_auth();
    if admin != config.admin {
        return Err(InsightArenaError::Unauthorized);
    }

    if new_share_bps > 10_000 {
        return Err(InsightArenaError::InvalidFee);
    }

    let old_share_bps = config.insurance_pool_share_bps;
    config.insurance_pool_share_bps = new_share_bps;
    env.storage().persistent().set(&DataKey::Config, &config);
    bump_config(env);

    emit_insurance_pool_share_updated(env, old_share_bps, new_share_bps);

    Ok(())
}

fn emit_insurance_pool_share_updated(env: &Env, old_share_bps: u32, new_share_bps: u32) {
    env.events().publish(
        (symbol_short!("cfg"), symbol_short!("ins_upd")),
        (old_share_bps, new_share_bps),
    );
}

/// Update the global maximum liquidity a single outcome's AMM reserve may
/// hold. `0` means unlimited. Caller must be the stored admin. See
/// `market::set_market_liquidity_cap` for the per-market override.
pub fn set_max_liquidity_per_outcome(
    env: &Env,
    admin: Address,
    new_cap: i128,
) -> Result<(), InsightArenaError> {
    ensure_not_paused(env)?;
    let mut config = load_config(env)?;

    admin.require_auth();
    if admin != config.admin {
        return Err(InsightArenaError::Unauthorized);
    }

    if new_cap < 0 {
        return Err(InsightArenaError::InvalidInput);
    }

    let old_cap = config.max_liquidity_per_outcome;
    config.max_liquidity_per_outcome = new_cap;
    env.storage().persistent().set(&DataKey::Config, &config);
    bump_config(env);

    emit_max_liquidity_per_outcome_updated(env, old_cap, new_cap);

    Ok(())
}

fn emit_max_liquidity_per_outcome_updated(env: &Env, old_cap: i128, new_cap: i128) {
    env.events().publish(
        (symbol_short!("cfg"), symbol_short!("liq_cap")),
        (old_cap, new_cap),
    );
}

/// Update the protocol treasury address and the split (bps) of the
/// protocol's fee cut between the treasury and liquidity providers. Caller
/// must be the stored admin.
///
/// The actual per-swap split is applied in `liquidity::swap_outcome`, which
/// further divides the fee share already earmarked for the protocol (via
/// `FeeTierConfig::protocol_share_bps`) between `treasury_address`
/// (`treasury_split_bps`) and liquidity providers (`lp_split_bps`), emitting
/// a `(fee, split)` event on every swap that collects a non-zero fee.
///
/// # Errors
/// - `Unauthorized` if `admin` is not the stored admin.
/// - `InvalidFee` if `treasury_split_bps + lp_split_bps != 10_000`.
pub fn set_treasury_split(
    env: &Env,
    admin: Address,
    new_treasury_address: Address,
    treasury_split_bps: u32,
    lp_split_bps: u32,
) -> Result<(), InsightArenaError> {
    ensure_not_paused(env)?;
    let mut config = load_config(env)?;

    admin.require_auth();
    if admin != config.admin {
        return Err(InsightArenaError::Unauthorized);
    }

    validate_treasury_split(treasury_split_bps, lp_split_bps)?;

    let old_treasury_address = config.treasury_address.clone();
    let old_treasury_split_bps = config.treasury_split_bps;
    let old_lp_split_bps = config.lp_split_bps;

    config.treasury_address = new_treasury_address.clone();
    config.treasury_split_bps = treasury_split_bps;
    config.lp_split_bps = lp_split_bps;
    env.storage().persistent().set(&DataKey::Config, &config);
    bump_config(env);

    emit_treasury_split_updated(
        env,
        &old_treasury_address,
        &new_treasury_address,
        old_treasury_split_bps,
        old_lp_split_bps,
        treasury_split_bps,
        lp_split_bps,
    );

    Ok(())
}

#[allow(clippy::too_many_arguments)]
fn emit_treasury_split_updated(
    env: &Env,
    old_treasury_address: &Address,
    new_treasury_address: &Address,
    old_treasury_split_bps: u32,
    old_lp_split_bps: u32,
    new_treasury_split_bps: u32,
    new_lp_split_bps: u32,
) {
    env.events().publish(
        (symbol_short!("cfg"), symbol_short!("trs_upd")),
        (
            old_treasury_address.clone(),
            new_treasury_address.clone(),
            old_treasury_split_bps,
            old_lp_split_bps,
            new_treasury_split_bps,
            new_lp_split_bps,
        ),
    );
}

/// Update the arbiter quorum threshold, slash share, and voting period used
/// by `dispute::assign_arbiters` / `dispute::finalize_arbiter_vote`. Caller
/// must be the stored admin. Changes only affect panels assigned after this
/// call - already-assigned panels keep their snapshotted values.
pub fn set_arbiter_config(
    env: &Env,
    admin: Address,
    quorum_bps: u32,
    slash_bps: u32,
    voting_period_seconds: u64,
) -> Result<(), InsightArenaError> {
    ensure_not_paused(env)?;
    let mut config = load_config(env)?;

    admin.require_auth();
    if admin != config.admin {
        return Err(InsightArenaError::Unauthorized);
    }

    if quorum_bps > 10_000 || quorum_bps == 0 {
        return Err(InsightArenaError::InvalidInput);
    }
    if slash_bps > 10_000 {
        return Err(InsightArenaError::InvalidInput);
    }
    if voting_period_seconds == 0 {
        return Err(InsightArenaError::InvalidInput);
    }

    config.arbiter_quorum_bps = quorum_bps;
    config.arbiter_slash_bps = slash_bps;
    config.arbiter_voting_period_seconds = voting_period_seconds;
    env.storage().persistent().set(&DataKey::Config, &config);
    bump_config(env);

    emit_arbiter_config_updated(env, quorum_bps, slash_bps, voting_period_seconds);

    Ok(())
}

fn emit_arbiter_config_updated(
    env: &Env,
    quorum_bps: u32,
    slash_bps: u32,
    voting_period_seconds: u64,
) {
    env.events().publish(
        (symbol_short!("cfg"), symbol_short!("arb_upd")),
        (quorum_bps, slash_bps, voting_period_seconds),
    );
}

/// Update the governance proposal quorum threshold (bps of total registered
/// users that must participate for a proposal to pass). Caller must be the
/// stored admin. For the timelocked governance path see
/// [`update_governance_quorum_from_governance`], invoked via
/// `ProposalType::UpdateQuorum`.
///
/// # Errors
/// - `Unauthorized` if `admin` is not the stored admin.
/// - `InvalidInput` if `new_quorum_bps > 10_000`.
pub fn set_governance_quorum_bps(
    env: &Env,
    admin: Address,
    new_quorum_bps: u32,
) -> Result<(), InsightArenaError> {
    ensure_not_paused(env)?;
    let mut config = load_config(env)?;

    admin.require_auth();
    if admin != config.admin {
        return Err(InsightArenaError::Unauthorized);
    }

    validate_quorum_bps(new_quorum_bps)?;

    let old_quorum_bps = config.governance_quorum_bps;
    config.governance_quorum_bps = new_quorum_bps;
    env.storage().persistent().set(&DataKey::Config, &config);
    bump_config(env);

    emit_governance_quorum_updated(env, old_quorum_bps, new_quorum_bps);

    Ok(())
}

/// Governance path for updating the proposal quorum threshold. Called only
/// from `governance::execute_proposal` after a `ProposalType::UpdateQuorum`
/// proposal has cleared quorum, majority, and the timelock window.
pub fn update_governance_quorum_from_governance(
    env: &Env,
    new_quorum_bps: u32,
) -> Result<(), InsightArenaError> {
    let mut config = load_config(env)?;
    validate_quorum_bps(new_quorum_bps)?;

    let old_quorum_bps = config.governance_quorum_bps;
    config.governance_quorum_bps = new_quorum_bps;
    env.storage().persistent().set(&DataKey::Config, &config);
    bump_config(env);

    emit_governance_quorum_updated(env, old_quorum_bps, new_quorum_bps);

    Ok(())
}

fn validate_quorum_bps(quorum_bps: u32) -> Result<(), InsightArenaError> {
    if quorum_bps > 10_000 {
        return Err(InsightArenaError::InvalidInput);
    }
    Ok(())
}

fn emit_governance_quorum_updated(env: &Env, old_quorum_bps: u32, new_quorum_bps: u32) {
    env.events().publish(
        (symbol_short!("cfg"), symbol_short!("qrm_upd")),
        (old_quorum_bps, new_quorum_bps),
    );
}

/// Update the global maximum number of outcomes allowed per market.
pub fn set_max_outcomes(
    env: &Env,
    admin: Address,
    new_max: u32,
) -> Result<(), InsightArenaError> {
    ensure_not_paused(env)?;
    let mut config = load_config(env)?;

    admin.require_auth();
    if admin != config.admin {
        return Err(InsightArenaError::Unauthorized);
    }

    if new_max < 2 {
        return Err(InsightArenaError::InvalidInput);
    }

    let old_max = config.max_outcomes;
    config.max_outcomes = new_max;
    env.storage().persistent().set(&DataKey::Config, &config);
    bump_config(env);

    emit_max_outcomes_updated(env, old_max, new_max);

    Ok(())
}

fn emit_max_outcomes_updated(env: &Env, old_max: u32, new_max: u32) {
    env.events().publish(
        (symbol_short!("cfg"), symbol_short!("max_out")),
        (old_max, new_max),
    );
}

// ── Volume Fee Config ──────────────────────────────────────────────────────────

fn validate_volume_fee_config(config: &VolumeFeeConfig) -> Result<(), InsightArenaError> {
    if config.tiers.is_empty() {
        return Err(InsightArenaError::InvalidInput);
    }

    // Tier 0 must have threshold 0.
    let first = config.tiers.get(0).unwrap();
    if first.volume_threshold != 0 {
        return Err(InsightArenaError::InvalidInput);
    }
    if first.fee_bps > 10_000 {
        return Err(InsightArenaError::InvalidFee);
    }

    // Thresholds must be monotonically increasing (non-overlapping tiers);
    // every tier's fee must stay within the valid bps range.
    let mut prev_threshold = first.volume_threshold;
    for i in 1..config.tiers.len() {
        let entry = config.tiers.get(i).unwrap();
        if entry.volume_threshold <= prev_threshold {
            return Err(InsightArenaError::InvalidInput);
        }
        if entry.fee_bps > 10_000 {
            return Err(InsightArenaError::InvalidFee);
        }
        prev_threshold = entry.volume_threshold;
    }

    Ok(())
}

/// Update the volume-based fee tier schedule. Caller must be the stored admin.
///
/// The new schedule must have at least one tier, with tier 0's threshold at `0`,
/// and monotonically increasing thresholds thereafter. All fee rates must be
/// ≤ 10_000 bps.
pub fn set_volume_fee_config(
    env: &Env,
    admin: Address,
    new_config: VolumeFeeConfig,
) -> Result<(), InsightArenaError> {
    ensure_not_paused(env)?;
    let mut config = load_config(env)?;

    admin.require_auth();
    if admin != config.admin {
        return Err(InsightArenaError::Unauthorized);
    }

    validate_volume_fee_config(&new_config)?;

    let old_config = config.volume_fee_config.clone();
    config.volume_fee_config = new_config;
    env.storage().persistent().set(&DataKey::Config, &config);
    bump_config(env);

    emit_volume_fee_config_updated(env, &old_config, &config.volume_fee_config);

    Ok(())
}

fn emit_volume_fee_config_updated(
    env: &Env,
    old_config: &VolumeFeeConfig,
    new_config: &VolumeFeeConfig,
) {
    env.events().publish(
        (symbol_short!("cfg"), symbol_short!("vfc_upd")),
        (old_config.clone(), new_config.clone()),
    );
}

/// Return the current volume-based fee tier schedule. Extends the Config TTL.
pub fn get_volume_fee_config(env: &Env) -> VolumeFeeConfig {
    match load_config(env) {
        Ok(config) => {
            bump_config(env);
            config.volume_fee_config
        }
        Err(_) => VolumeFeeConfig::default_config(env),
    }
}

fn validate_oracle_stake_config(stake_amount: i128, reward_bps: u32) -> Result<(), InsightArenaError> {
    if stake_amount <= 0 {
        return Err(InsightArenaError::InvalidInput);
    }
    if reward_bps > 10_000 {
        return Err(InsightArenaError::InvalidFee);
    }
    Ok(())
}

/// Update the required oracle submission stake and the reward (bps of stake)
/// paid when a submission stands. Caller must be the stored admin. Only
/// affects submissions made after this call.
pub fn set_oracle_stake_config(
    env: &Env,
    admin: Address,
    stake_amount: i128,
    reward_bps: u32,
) -> Result<(), InsightArenaError> {
    ensure_not_paused(env)?;
    let mut config = load_config(env)?;

    admin.require_auth();
    if admin != config.admin {
        return Err(InsightArenaError::Unauthorized);
    }

    validate_oracle_stake_config(stake_amount, reward_bps)?;

    config.oracle_stake_amount = stake_amount;
    config.oracle_reward_bps = reward_bps;
    env.storage().persistent().set(&DataKey::Config, &config);
    bump_config(env);

    emit_oracle_stake_config_updated(env, stake_amount, reward_bps);

    Ok(())
}

fn emit_oracle_stake_config_updated(env: &Env, stake_amount: i128, reward_bps: u32) {
    env.events().publish(
        (symbol_short!("cfg"), symbol_short!("orc_upd")),
        (stake_amount, reward_bps),
    );
}

fn validate_vesting_config(tranche_count: u32, interval_seconds: u64) -> Result<(), InsightArenaError> {
    if tranche_count == 0 {
        return Err(InsightArenaError::InvalidInput);
    }
    if interval_seconds == 0 {
        return Err(InsightArenaError::InvalidInput);
    }
    Ok(())
}

/// Update the number and spacing of tranches used to vest season rewards.
/// Caller must be the stored admin. Only affects schedules created by
/// `season::finalize_season` calls made after this update — already-created
/// vesting schedules keep the parameters snapshotted at creation time.
pub fn set_vesting_config(
    env: &Env,
    admin: Address,
    tranche_count: u32,
    interval_seconds: u64,
) -> Result<(), InsightArenaError> {
    ensure_not_paused(env)?;
    let mut config = load_config(env)?;

    admin.require_auth();
    if admin != config.admin {
        return Err(InsightArenaError::Unauthorized);
    }

    validate_vesting_config(tranche_count, interval_seconds)?;

    config.vesting_tranche_count = tranche_count;
    config.vesting_interval_seconds = interval_seconds;
    env.storage().persistent().set(&DataKey::Config, &config);
    bump_config(env);

    emit_vesting_config_updated(env, tranche_count, interval_seconds);

    Ok(())
}

fn emit_vesting_config_updated(env: &Env, tranche_count: u32, interval_seconds: u64) {
    env.events().publish(
        (symbol_short!("cfg"), symbol_short!("vst_upd")),
        (tranche_count, interval_seconds),
    );
}

/// Update the market-creation anti-spam bond amount. Caller must be the
/// stored admin. A value of `0` disables the bond requirement entirely.
///
/// # Errors
/// - `Unauthorized` if `admin` is not the stored admin.
/// - `InvalidInput` if `new_bond_amount` is negative.
pub fn set_bond_amount(
    env: &Env,
    admin: Address,
    new_bond_amount: i128,
) -> Result<(), InsightArenaError> {
    ensure_not_paused(env)?;
    let mut config = load_config(env)?;

    admin.require_auth();
    if admin != config.admin {
        return Err(InsightArenaError::Unauthorized);
    }

    if new_bond_amount < 0 {
        return Err(InsightArenaError::InvalidInput);
    }

    let old_bond_amount = config.bond_amount;
    config.bond_amount = new_bond_amount;
    env.storage().persistent().set(&DataKey::Config, &config);
    bump_config(env);

    emit_bond_amount_updated(env, old_bond_amount, new_bond_amount);

    Ok(())
}

/// Governance path for updating the bond amount. Called only from
/// `governance::execute_proposal` after the appropriate proposal has
/// cleared quorum, majority, and the timelock window.
pub fn update_bond_amount_from_governance(
    env: &Env,
    new_bond_amount: i128,
) -> Result<(), InsightArenaError> {
    let mut config = load_config(env)?;

    if new_bond_amount < 0 {
        return Err(InsightArenaError::InvalidInput);
    }

    let old_bond_amount = config.bond_amount;
    config.bond_amount = new_bond_amount;
    env.storage().persistent().set(&DataKey::Config, &config);
    bump_config(env);

    emit_bond_amount_updated(env, old_bond_amount, new_bond_amount);

    Ok(())
}

fn emit_bond_amount_updated(env: &Env, old_amount: i128, new_amount: i128) {
    env.events().publish(
        (symbol_short!("cfg"), symbol_short!("bnd_upd")),
        (old_amount, new_amount),
    );
}

/// Guard used at the top of every user-facing entry point.
///
/// Visibility is `pub(crate)` — this function is intentionally **not** part of
/// the public contract ABI; it is an internal safety check only.
///
/// Behaviour:
/// - Returns `Err(NotInitialized)` if the contract has not been set up yet.
/// - Returns `Err(Paused)` while `config.is_paused == true`.
/// - Returns `Ok(())` otherwise, extending the Config TTL as a side-effect.
pub(crate) fn ensure_not_paused(env: &Env) -> Result<(), InsightArenaError> {
    let config = load_config(env)?;
    bump_config(env);
    if config.is_paused {
        return Err(InsightArenaError::Paused);
    }
    Ok(())
}

/// Update the early-exit fee rate for partial withdrawals.
/// Caller must be the stored admin.
///
/// The fee is deducted from withdrawal amounts and redistributed to remaining
/// participants pro-rata to their stake. Defaults to 5% (500 bps).
pub fn set_early_exit_fee_bps(
    env: &Env,
    admin: Address,
    new_fee_bps: u32,
) -> Result<(), InsightArenaError> {
    ensure_not_paused(env)?;
    let mut config = load_config(env)?;

    admin.require_auth();
    if admin != config.admin {
        return Err(InsightArenaError::Unauthorized);
    }

    if new_fee_bps > 10_000 {
        return Err(InsightArenaError::InvalidFee);
    }

    let old_fee_bps = config.early_exit_fee_bps;
    config.early_exit_fee_bps = new_fee_bps;
    env.storage().persistent().set(&DataKey::Config, &config);
    bump_config(env);

    emit_early_exit_fee_updated(env, old_fee_bps, new_fee_bps);

    Ok(())
}

fn emit_early_exit_fee_updated(env: &Env, old_fee_bps: u32, new_fee_bps: u32) {
    env.events().publish(
        (symbol_short!("cfg"), symbol_short!("exit_fee")),
        (old_fee_bps, new_fee_bps),
    );
}

/// Get the current early-exit fee without extending TTL (read-only).
pub fn get_early_exit_fee_bps(env: &Env) -> Result<u32, InsightArenaError> {
    let config = load_config(env)?;
    Ok(config.early_exit_fee_bps)
}
