use soroban_sdk::{contracttype, symbol_short, Address, Env, Symbol, Vec};

use crate::errors::InsightArenaError;
use crate::storage_types::DataKey;

// ── TTL constants ─────────────────────────────────────────────────────────────
// Assuming ~5 s per ledger:
//   PERSISTENT_BUMP      ≈ 30 days  (518 400 ledgers)
//   PERSISTENT_THRESHOLD ≈ 29 days  — only bump when remaining TTL falls below this
pub const PERSISTENT_BUMP: u32 = 518_400;
pub const PERSISTENT_THRESHOLD: u32 = 501_120; // PERSISTENT_BUMP − 1 day

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

fn ttl_threshold(max: u32) -> u32 {
    max.saturating_sub(14_400)
}

pub fn extend_market_ttl(env: &Env, market_id: u64) {
    env.storage().persistent().extend_ttl(
        &DataKey::Market(market_id),
        ttl_threshold(LEDGER_BUMP_MARKET),
        LEDGER_BUMP_MARKET,
    );
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
    /// Minimum XLM stake required to participate in a market, in stroops.
    pub min_stake_xlm: i128,
    /// Trusted oracle contract address used for market resolution.
    pub oracle_address: Address,
    /// Address of the XLM Stellar Asset Contract used for escrow transfers.
    pub xlm_token: Address,
    /// When `true`, all non-admin entry points must revert with `Paused`.
    pub is_paused: bool,
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

    let config = Config {
        admin,
        protocol_fee_bps: fee_bps,
        max_creator_fee_bps: 500,  // 5 % absolute cap for market creators
        min_stake_xlm: 10_000_000, // 1 XLM expressed in stroops
        oracle_address: oracle,
        xlm_token,
        is_paused: false,
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

/// Pause or resume the contract. Caller must be the stored admin.
///
/// When `paused` is `true`, all non-admin entry points should call
/// [`ensure_not_paused`] and revert with [`InsightArenaError::Paused`].
pub fn set_paused(env: &Env, paused: bool) -> Result<(), InsightArenaError> {
    let mut config = load_config(env)?;

    config.admin.require_auth();

    config.is_paused = paused;
    env.storage().persistent().set(&DataKey::Config, &config);
    bump_config(env);

    Ok(())
}

pub fn transfer_admin(env: &Env, new_admin: Address) -> Result<(), InsightArenaError> {
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
