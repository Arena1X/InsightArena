use soroban_sdk::contracterror;

/// Error codes returned by the staking vault.
///
/// NOTE: `#[contracterror]` enums are hard-capped at 50 XDR cases. Group new
/// codes into the existing sections and leave numeric gaps for future growth.
#[contracterror]
#[derive(Clone, Debug, Eq, PartialEq, Copy)]
pub enum StakingError {
    // ── Initialization ────────────────────────────────────────────────────────
    /// `initialize` has already been called.
    AlreadyInitialized = 1,
    /// A state-dependent function was called before `initialize`.
    NotInitialized = 2,

    // ── Authorization ─────────────────────────────────────────────────────────
    /// The caller lacks the role required for this operation (admin/fee-source).
    Unauthorized = 3,

    // ── Staking ───────────────────────────────────────────────────────────────
    /// No stake position exists for the given address.
    PositionNotFound = 10,
    /// Stake amount is zero or negative.
    InvalidAmount = 11,
    /// Requested unstake amount exceeds the staker's balance.
    InsufficientStake = 12,
    /// The lock period on this position has not yet elapsed.
    LockNotElapsed = 13,
    /// The supplied lock duration is not one of the configured tiers.
    InvalidLockPeriod = 14,

    // ── Rewards / fees ────────────────────────────────────────────────────────
    /// There are no rewards available to claim for this position.
    NothingToClaim = 20,
    /// The vault's token balance is insufficient to settle this transfer.
    InsufficientFunds = 21,
    /// The underlying token transfer failed.
    TransferFailed = 22,

    // ── General ───────────────────────────────────────────────────────────────
    /// A checked arithmetic operation overflowed.
    Overflow = 100,
    /// The contract is in emergency-paused state.
    Paused = 101,
    /// An argument failed basic validation not covered by a more specific code.
    InvalidInput = 102,
}
