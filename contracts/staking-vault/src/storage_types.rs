use soroban_sdk::{contracttype, Address};

// ── TTL constants (assuming ~5s per ledger) ────────────────────────────────────
/// ~30 days — hot keys read/written throughout a position's lifecycle.
pub const LEDGER_BUMP_POSITION: u32 = 518_400;
/// ~1 year — global config and pool accounting.
pub const LEDGER_BUMP_PERMANENT: u32 = 5_184_000;

/// Global vault configuration, set once at `initialize`.
#[contracttype]
#[derive(Clone)]
pub struct Config {
    /// Address allowed to change parameters and pause the vault.
    pub admin: Address,
    /// Token that users stake and rewards are paid in (e.g. XLM SAC address).
    pub token: Address,
    /// Address permitted to push protocol fees into the reward pool
    /// (e.g. the open-market contract).
    pub fee_source: Address,
}

/// Unbonding configuration for early-exit penalties.
#[contracttype]
#[derive(Clone)]
pub struct UnbondingConfig {
    /// Cooldown period in seconds after unlock request before funds can be claimed.
    pub cooldown_period: u64,
    /// Early-exit penalty in basis points (e.g. 500 = 5%). Max is 10_000 bps.
    pub penalty_bps: u32,
}

/// Global reward accounting for the pool, using the accumulator-per-share model.
#[contracttype]
#[derive(Clone)]
pub struct PoolState {
    /// Sum of all staked amounts (weighted by lock boost).
    pub total_shares: i128,
    /// Accumulated rewards per share, scaled by `ACC_PRECISION`.
    pub acc_reward_per_share: i128,
    /// Rewards received but not yet distributed (when `total_shares == 0`).
    pub pending_rewards: i128,
}

/// A single staker's position.
#[contracttype]
#[derive(Clone)]
pub struct Position {
    pub owner: Address,
    /// Raw amount of tokens the user has staked.
    pub amount: i128,
    /// Effective shares after applying the lock-period boost multiplier.
    pub shares: i128,
    /// Ledger timestamp when the lock expires and unstaking is allowed.
    pub unlock_at: u64,
    /// Reward debt — bookkeeping for the accumulator model.
    pub reward_debt: i128,
    /// Timestamp when unlock was requested (0 if not requested).
    pub unlock_requested_at: u64,
    /// Amount pending unlock (0 if not unlocking).
    pub pending_unlock_amount: i128,
}

/// A configured lock tier: longer locks earn a higher boost multiplier.
#[contracttype]
#[derive(Clone)]
pub struct LockTier {
    /// Lock duration in seconds.
    pub duration: u64,
    /// Boost in basis points applied to staked amount (10_000 = 1.0x).
    pub boost_bps: u32,
}

/// Persistent storage keys.
#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    /// Global [`Config`]. Set once.
    Config,
    /// Emergency pause flag.
    Paused,
    /// Global [`PoolState`] reward accounting.
    Pool,
    /// Per-staker [`Position`].
    Position(Address),
    /// Configured [`LockTier`] list.
    LockTiers,
    /// Unbonding configuration for early-exit penalties.
    UnbondingConfig,
}
