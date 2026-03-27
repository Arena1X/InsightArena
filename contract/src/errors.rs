use soroban_sdk::contracterror;

#[contracterror]
#[derive(Clone, Debug, Eq, PartialEq, Copy)]
pub enum InsightArenaError {
    // ── Initialization ────────────────────────────────────────────────────────
    /// The contract `initialize` function has already been called.
    /// Raised to prevent re-initialization from overwriting global config.
    AlreadyInitialized = 1,
    /// The contract has not yet been initialized.
    /// Raised when any state-dependent function is called before `initialize`.
    NotInitialized = 2,

    // ── Authorization ─────────────────────────────────────────────────────────
    /// The caller does not have the required role for this operation
    /// (e.g. a non-creator attempting to resolve a market, or a non-admin
    /// calling an admin-only function).
    Unauthorized = 3,
    /// A cryptographic signature supplied with the call could not be verified
    /// against the expected public key or message payload.
    InvalidSignature = 4,

    // ── Market ────────────────────────────────────────────────────────────────
    /// No market exists for the given `market_id`.
    /// Raised on any market lookup that returns nothing from storage.
    MarketNotFound = 10,
    /// The market has already been resolved and its outcome is finalized.
    /// Raised when a second resolution or conflicting write is attempted.
    MarketAlreadyResolved = 11,
    /// The market has not yet been resolved.
    /// Raised when a payout claim or post-resolution action is attempted early.
    MarketNotResolved = 12,
    /// The current ledger timestamp is past `end_time`.
    /// Raised when a prediction submission arrives after the market has closed.
    MarketExpired = 13,
    /// The current ledger timestamp is before `start_time`.
    /// Raised when a prediction submission arrives before the market opens.
    MarketNotStarted = 14,
    /// The market's `end_time` has not yet been reached.
    /// Raised when resolution is attempted while the market is still accepting
    /// predictions.
    MarketStillOpen = 15,
    /// The market has already been cancelled by an admin.
    /// Raised when cancel_market is called a second time or when any post-cancel
    /// mutation (prediction, resolution) is attempted.
    MarketAlreadyCancelled = 19,
    /// The predicted outcome symbol is not present in `outcome_options`.
    /// Raised when a user submits a prediction with an unrecognised outcome.
    InvalidOutcome = 16,
    /// The supplied time range is logically inconsistent
    /// (e.g. `end_time <= start_time`, or `resolution_time < end_time`).
    InvalidTimeRange = 17,
    /// The `creator_fee_bps` value exceeds the platform maximum of 500 bps (5%).
    /// Raised during market creation when the requested fee is out of bounds.
    InvalidFee = 18,

    // ── Dispute ───────────────────────────────────────────────────────────────
    /// Dispute window has closed for this market.
    DisputeWindowClosed = 60,
    /// A dispute has already been filed for this market.
    DisputeAlreadyFiled = 61,
    /// No active dispute exists for this market.
    DisputeNotFound = 62,

    // ── Prediction ────────────────────────────────────────────────────────────
    /// No prediction exists for the given `(market_id, predictor)` pair.
    /// Raised on lookup when the user has not yet staked in this market.
    PredictionNotFound = 20,
    /// The caller has already submitted a prediction for this market.
    /// Raised to enforce the one-prediction-per-wallet-per-market rule.
    AlreadyPredicted = 21,
    /// The submitted stake is below the market's `min_stake` threshold.
    /// Raised during prediction submission to enforce the minimum entry amount.
    StakeTooLow = 22,
    /// The submitted stake exceeds the market's `max_stake` ceiling.
    /// Raised during prediction submission to enforce the maximum entry amount.
    StakeTooHigh = 23,
    /// The user has already successfully claimed their payout for this market.
    /// Raised to prevent double-claiming after `payout_claimed` is set to true.
    PayoutAlreadyClaimed = 24,

    // ── Escrow ────────────────────────────────────────────────────────────────
    /// The contract's escrow balance is insufficient to complete the transfer.
    /// Raised when a payout or refund exceeds the available on-chain funds.
    InsufficientFunds = 30,
    /// A native XLM token transfer via the Stellar asset contract failed.
    /// Raised when the underlying `transfer` call returns an error.
    TransferFailed = 31,
    /// The escrow pool for this market contains no funds.
    /// Raised when resolution or refund logic encounters a zero `total_pool`.
    EscrowEmpty = 32,

    // ── Season ────────────────────────────────────────────────────────────────
    /// The referenced season is not currently active (`is_active` is false).
    /// Raised when a points award or participation action targets a closed season.
    SeasonNotActive = 40,
    /// The season has already been finalized (`is_finalized` is true).
    /// Raised when a second finalization or post-finalization write is attempted.
    SeasonAlreadyFinalized = 41,
    /// No season exists for the given `season_id`.
    /// Raised on any season lookup that returns nothing from storage.
    SeasonNotFound = 42,

    // ── Invite ────────────────────────────────────────────────────────────────
    /// The supplied invite code symbol does not exist in storage or does not
    /// match the target market. Raised on redemption of an unrecognised code.
    InvalidInviteCode = 50,
    /// The invite code's `expires_at` timestamp is in the past.
    /// Raised when a redemption attempt arrives after the expiry ledger time.
    InviteCodeExpired = 51,
    /// The invite code has reached its `max_uses` limit (`current_uses >= max_uses`).
    /// Raised when a redemption attempt arrives after the usage cap is exhausted.
    InviteCodeMaxUsed = 52,

    // ── User ──────────────────────────────────────────────────────────────────
    /// No user profile exists for the given address.
    /// Raised when a user stats lookup finds no stored profile.
    UserNotFound = 63,

    // ── General ───────────────────────────────────────────────────────────────
    /// An arithmetic operation produced a value outside the valid i128/u32 range.
    /// Raised anywhere checked arithmetic (pool accumulation, payout calculation)
    /// would otherwise silently wrap or saturate.
    Overflow = 100,
    /// The contract is in emergency-paused state (`DataKey::Paused` is set).
    /// Raised at the top of any sensitive function when the pause flag is active.
    Paused = 101,
    /// A supplied argument fails basic validation that is not covered by a more
    /// specific error code (e.g. empty strings, zero-length outcome lists).
    InvalidInput = 102,
}
