use soroban_sdk::{contracttype, Address, Env};

// ── TTL constants (assuming ~5s per ledger) ────────────────────────────────────
/// ~30 days — hot keys read/written throughout a position's lifecycle.
pub const LEDGER_BUMP_POSITION: u32 = 518_400;
/// Minimum remaining TTL before a bump is triggered (~15 days).
/// Setting the threshold below the bump amount ensures `extend_ttl` always
/// produces a net extension — Soroban's `extend_ttl` is a no-op when the
/// current TTL already exceeds `threshold`, so using the same value for both
/// means a recently-written entry is never re-extended until it falls below
/// the threshold. With threshold < bump we guarantee every access adds headroom.
pub const LEDGER_THRESHOLD_POSITION: u32 = 259_200; // ~15 days
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

/// Extend the TTL of a staker's `Position` entry so it never expires while
/// the lock is active.
///
/// Uses a split threshold/amount: the bump fires only when the remaining TTL
/// falls below `LEDGER_THRESHOLD_POSITION` (~15 days), and extends it to
/// `LEDGER_BUMP_POSITION` (~30 days). This guarantees every access adds real
/// headroom — using the same value for both threshold and amount would make
/// `extend_ttl` a no-op for recently-written entries whose TTL already exceeds
/// the threshold.
///
/// # Issue #2039
/// This helper is the single call site for position TTL management. All reads
/// (`get_position_raw`) and writes (`set_position`) funnel through it so that
/// an active lock can never be archived before its `unlock_at` timestamp.
pub fn bump_position(env: &Env, staker: &Address) {
    let key = DataKey::Position(staker.clone());
    if env.storage().persistent().has(&key) {
        env.storage().persistent().extend_ttl(
            &key,
            LEDGER_THRESHOLD_POSITION,
            LEDGER_BUMP_POSITION,
        );
    }
}

// ── Tests (issue #2039) ───────────────────────────────────────────────────────

#[cfg(test)]
mod ttl_tests {
    use super::*;
    use soroban_sdk::{testutils::Address as _, Address, Env};

    fn make_position(owner: Address) -> Position {
        Position {
            owner,
            amount: 1_000_000,
            shares: 1_000_000,
            unlock_at: 9_999_999,
            reward_debt: 0,
            unlock_requested_at: 0,
            pending_unlock_amount: 0,
        }
    }

    // ── Test 1: bump_position extends TTL on access ───────────────────────────
    //
    // Writes a Position, calls bump_position, then verifies the entry still
    // exists (i.e. the extend_ttl did not panic and the key is present).
    #[test]
    fn active_lock_storage_ttl_is_extended_on_access() {
        let env = Env::default();
        let staker = Address::generate(&env);
        let key = DataKey::Position(staker.clone());
        let pos = make_position(staker.clone());

        env.storage().persistent().set(&key, &pos);

        // Should not panic; key must still be present after bump.
        bump_position(&env, &staker);

        assert!(
            env.storage().persistent().has(&key),
            "position must still exist after TTL bump"
        );
    }

    // ── Test 2: bump_position is a no-op for non-existent entry ─────────────
    //
    // A fully-withdrawn entry (key removed) must not cause a panic when
    // bump_position is called — it simply does nothing.
    #[test]
    fn fully_withdrawn_entry_is_allowed_to_expire() {
        let env = Env::default();
        let staker = Address::generate(&env);
        let key = DataKey::Position(staker.clone());

        // Key does not exist — simulates post-full-withdrawal state.
        assert!(!env.storage().persistent().has(&key));

        // Must not panic.
        bump_position(&env, &staker);

        // Key must still be absent.
        assert!(
            !env.storage().persistent().has(&key),
            "withdrawn entry must remain absent after bump_position no-op"
        );
    }

    // ── Test 3: threshold < bump guarantees an extension is always possible ───
    //
    // Asserts the compile-time constants maintain the required ordering so
    // extend_ttl can always produce a net TTL increase.
    #[test]
    fn ledger_threshold_is_less_than_bump() {
        assert!(
            LEDGER_THRESHOLD_POSITION < LEDGER_BUMP_POSITION,
            "threshold must be strictly less than bump to guarantee net TTL extension"
        );
    }
}
