use soroban_sdk::{contracttype, Address, Env, Map, String, Symbol, Vec};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct BatchPredictionRequest {
    pub market_id: u64,
    pub chosen_outcome: Symbol,
    pub stake_amount: i128,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    /// Keyed by market_id. Represents a prediction market instance.
    Market(u64),
    /// Keyed by market_id. Stores the ordered list of all predictor addresses for that market.
    /// Updated whenever a new prediction is submitted so cancel_market can iterate all stakers.
    PredictorList(u64),
    /// Keyed by user address. Stores market IDs the user has staked in.
    UserMarkets(Address),
    /// Keyed by (market_id, predictor). Represents a user's prediction in a given market.
    Prediction(u64, Address),
    /// Keyed by user address. Represents an individual user's profile or state.
    User(Address),
    /// Singleton list of all addresses that have a persisted user profile.
    UserList,
    /// Keyed by season_id. Stores the leaderboard rankings per season.
    Leaderboard(u32),
    /// Singleton. Stores the list of season IDs that have snapshots available.
    SnapshotSeasonList,
    /// Keyed by season number. Represents a season's metadata and schedule.
    Season(u32),
    /// Singleton. Stores the currently active season identifier.
    ActiveSeason,
    /// Keyed by code symbol. Maps an invite code to its underlying metadata.
    InviteCode(Symbol),
    /// Keyed by market_id. Stores the set-like list of addresses approved for private markets.
    MarketAllowlist(u64),
    /// Singleton. Holds global configuration for the platform.
    Config,
    /// Singleton. Tracks cumulative protocol fees accrued to treasury.
    Treasury,
    /// Global counter. Tracks the total number of markets created.
    MarketCount,
    /// Global counter. Tracks the total number of seasons.
    SeasonCount,
    /// Emergency pause flag. Used to halt sensitive operations across the platform.
    Paused,
    /// Singleton category whitelist stored in instance storage.
    Categories,
    /// Keyed by category symbol. Stores market IDs in creation order for that category.
    CategoryIndex(Symbol),
    /// Keyed by proposal_id. Stores governance proposal metadata/state.
    Proposal(u32),
    /// Singleton counter. Tracks the total number of governance proposals.
    ProposalCount,
    /// Keyed by (proposal_id, voter). Tracks whether a voter has voted on a proposal.
    ProposalVote(u32, Address),
    /// Temporary storage lock for escrow operations (prevents reentrancy)
    EscrowLock,
    /// Keyed by market_id. Stores an active dispute (if any) for that market.
    Dispute(u64),
    /// Singleton list of market IDs that currently have an active dispute.
    ActiveDisputeList,
    /// Singleton. Cumulative platform stake volume (stroops) for analytics.
    PlatformVolume,
    /// Singleton. Count of currently open/active disputes.
    DisputeCount,
    /// Keyed by creator address. Aggregated creator reputation statistics.
    CreatorStats(Address),
    /// Keyed by market_id. Stores AMM pool state for a market.
    LiquidityPool(u64),
    /// Keyed by (market_id, provider). Stores a provider's LP position.
    LPPosition(u64, Address),
    /// Keyed by market_id. Stores the list of liquidity providers.
    LPProviderList(u64),
    /// Keyed by market_id. Stores historical swap records.
    SwapHistory(u64),
    /// Keyed by market_id. Stores rolling 24h pool volume.
    PoolVolume(u64),
    /// Keyed by market_id. Stores the rolling volatility measure used to derive the dynamic swap fee tier.
    VolatilityState(u64),
    /// Singleton. Admin-configurable thresholds and fee rates for the volatility-tiered swap fee schedule.
    FeeTierConfig,

    // Conditional Market keys
    ConditionalMarket(u64),   // market_id -> ConditionalMarket
    ConditionalChildren(u64), // parent_market_id -> Vec<u64>
    ConditionalParent(u64),   // market_id -> u64 (parent_market_id)
    ConditionalChain(u64),    // market_id -> ConditionalChain
    ConditionalDepth(u64),    // market_id -> u32

    // ── Creator Event keys ────────────────────────────────────────────────────
    /// Global counter tracking the total number of creator events.
    EventCounter,
    /// Keyed by event_id. Stores the full Event struct.
    Event(u64),
    /// Keyed by event_id. Counter for matches within that event.
    MatchCounter(u64),
    /// Keyed by (event_id, match_id). Stores an EventMatch struct.
    Match(u64, u64),
    /// Keyed by (event_id, match_id, predictor). Stores an EventPrediction.
    /// Named EventPrediction to distinguish from market Prediction(u64, Address).
    EventPrediction(u64, u64, Address),
    /// Keyed by user address. Vec of event_ids the user has joined.
    UserEvents(Address),
    /// Keyed by event_id. Vec of participant addresses for the event.
    EventParticipants(u64),
    /// Keyed by user address. Whether the address has passed verification.
    VerifiedAddress(Address),
    /// Keyed by event_id. Vec of Winner records for the event.
    Winners(u64),
    /// Singleton. Treasury balance separate from protocol fees.
    TreasuryBalance,
}

/// Lifecycle state of a governance proposal, derived from its stored flags and
/// the current ledger time rather than persisted directly.
///
/// `Voting -> Queued -> Executable -> (Executed | Vetoed | Cancelled)`
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ProposalState {
    /// Voting window is still open.
    Voting,
    /// Voting passed and `ready_at` has been recorded, but the timelock has not elapsed.
    Queued,
    /// The timelock has elapsed; the proposal may now be executed.
    Executable,
    /// The proposal's effect has been applied.
    Executed,
    /// The proposer or admin withdrew the proposal before execution.
    Cancelled,
    /// The guardian vetoed the proposal during the timelock window.
    Vetoed,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Dispute {
    pub disputer: Address,
    pub bond: i128,
    pub filed_at: u64,
}

impl Dispute {
    pub fn new(disputer: Address, bond: i128, filed_at: u64) -> Self {
        Self {
            disputer,
            bond,
            filed_at,
        }
    }
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MarketStats {
    pub total_pool: i128,
    pub participant_count: u32,
    pub leading_outcome: Symbol,
    pub leading_outcome_pool: i128,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PlatformStats {
    pub total_markets: u64,
    pub total_volume_xlm: i128,
    pub active_users: u32,
    pub treasury_balance: i128,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CreatorStats {
    pub markets_created: u32,
    pub markets_resolved: u32,
    pub average_participant_count: u32,
    pub dispute_count: u32,
    pub reputation_score: u32,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CreatorLeaderboardEntry {
    pub address: Address,
    pub stats: CreatorStats,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Prediction {
    /// The ID of the market this prediction is designated for.
    pub market_id: u64,
    /// The address of the user who submitted this prediction.
    pub predictor: Address,
    /// The specific outcome symbol the user predicted.
    pub chosen_outcome: Symbol,
    /// The total amount of native tokens (XLM) staked by the user, in stroops.
    pub stake_amount: i128,
    /// The ledger timestamp indicating when this prediction was submitted.
    pub submitted_at: u64,
    /// Indicates whether the user has successfully claimed their payout after resolution. Defaults to false.
    pub payout_claimed: bool,
    /// The final portion of XLM the user won, populated after resolution. Defaults to 0.
    pub payout_amount: i128,
}

impl Prediction {
    /// Creates an unresolved Prediction struct instance initialized with default payment metrics.
    pub fn new(
        market_id: u64,
        predictor: Address,
        chosen_outcome: Symbol,
        stake_amount: i128,
        submitted_at: u64,
    ) -> Self {
        Self {
            market_id,
            predictor,
            chosen_outcome,
            stake_amount,
            submitted_at,
            payout_claimed: false,
            payout_amount: 0,
        }
    }
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Market {
    /// Unique identifier for the market.
    pub market_id: u64,
    /// Address of the user who created this market.
    pub creator: Address,
    /// Title of the prediction market.
    pub title: String,
    /// Detailed description or rules for resolution.
    pub description: String,
    /// Category of the market (e.g., "Sports", "Crypto").
    pub category: Symbol,
    /// Valid outcome symbols users can predict (e.g., ["TeamA", "TeamB"]).
    pub outcome_options: Vec<Symbol>,
    /// The ledger timestamp indicating when the market becomes active.
    pub start_time: u64,
    /// The ledger timestamp after which predictions are no longer accepted.
    pub end_time: u64,
    /// The ledger timestamp after which the outcome can be officially resolved.
    pub resolution_time: u64,
    /// The final outcome, set only after the market is resolved. Defaults to None.
    pub resolved_outcome: Option<Symbol>,
    /// Ledger timestamp when the market was resolved (set alongside `resolved_outcome`).
    pub resolved_at: Option<u64>,
    /// Indicates whether the market has been closed (end_time passed) and is awaiting oracle resolution. Defaults to false.
    pub is_closed: bool,
    /// Indicates whether the market has been resolved and payouts processed. Defaults to false.
    pub is_resolved: bool,
    /// Indicates whether the market has been administratively cancelled. When true, no further
    /// predictions are accepted and all stakes are refunded. Defaults to false.
    pub is_cancelled: bool,
    /// If true, the market is open to anyone. If false, it acts as a private competition.
    pub is_public: bool,
    /// The aggregate amount of native tokens (XLM in stroops) staked in the market. Defaults to 0.
    pub total_pool: i128,
    /// The fee fraction assigned to the creator, measured in basis points (bps). Max 500 (5%).
    pub creator_fee_bps: u32,
    /// The predefined minimum stake permissible for a single prediction.
    pub min_stake: i128,
    /// The predefined maximum stake permissible for a single prediction.
    pub max_stake: i128,
    /// The current number of unique participants holding a stake. Defaults to 0.
    pub participant_count: u32,
    /// Dispute window duration in seconds after resolution.
    pub dispute_window: u64,
}

impl Market {
    /// Creates a novel, un-resolved Market struct instance initialized with default participant and pooling metrics.
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        market_id: u64,
        creator: Address,
        title: String,
        description: String,
        category: Symbol,
        outcome_options: Vec<Symbol>,
        start_time: u64,
        end_time: u64,
        resolution_time: u64,
        is_public: bool,
        creator_fee_bps: u32,
        min_stake: i128,
        max_stake: i128,
        dispute_window: u64,
    ) -> Self {
        Self {
            market_id,
            creator,
            title,
            description,
            category,
            outcome_options,
            start_time,
            end_time,
            resolution_time,
            resolved_outcome: None,
            resolved_at: None,
            is_closed: false,
            is_resolved: false,
            is_cancelled: false,
            is_public,
            total_pool: 0,
            creator_fee_bps,
            min_stake,
            max_stake,
            participant_count: 0,
            dispute_window,
        }
    }
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct LiquidityPool {
    pub market_id: u64,
    pub total_liquidity: i128,
    pub outcome_reserves: Map<Symbol, i128>,
    pub lp_token_supply: i128,
    pub fee_bps: u32,
    pub created_at: u64,
    /// Per-outcome TWAP price accumulators. Kept on the pool itself (rather than
    /// a separate storage key) so a single `save_pool` persists both the reserve
    /// update and its price observation atomically. See [`PriceAccumulator`].
    pub price_accumulators: Map<Symbol, PriceAccumulator>,
}

impl LiquidityPool {
    pub fn new(
        env: &Env,
        market_id: u64,
        initial_reserves: Map<Symbol, i128>,
        fee_bps: u32,
        created_at: u64,
    ) -> Self {
        let total_liquidity = initial_reserves.values().iter().sum::<i128>();

        Self {
            market_id,
            total_liquidity,
            outcome_reserves: initial_reserves,
            lp_token_supply: 0,
            fee_bps,
            created_at,
            price_accumulators: Map::new(env),
        }
    }
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct LPPosition {
    pub provider: Address,
    pub market_id: u64,
    pub lp_tokens: i128,
    pub initial_deposit: i128,
    pub fees_earned: i128,
    pub created_at: u64,
}

impl LPPosition {
    pub fn new(
        provider: Address,
        market_id: u64,
        lp_tokens: i128,
        initial_deposit: i128,
        created_at: u64,
    ) -> Self {
        Self {
            provider,
            market_id,
            lp_tokens,
            initial_deposit,
            fees_earned: 0,
            created_at,
        }
    }
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct SwapRecord {
    pub trader: Address,
    pub market_id: u64,
    pub from_outcome: Symbol,
    pub to_outcome: Symbol,
    pub amount_in: i128,
    pub amount_out: i128,
    pub fee_paid: i128,
    pub timestamp: u64,
}

impl SwapRecord {
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        trader: Address,
        market_id: u64,
        from_outcome: Symbol,
        to_outcome: Symbol,
        amount_in: i128,
        amount_out: i128,
        fee_paid: i128,
        timestamp: u64,
    ) -> Self {
        Self {
            trader,
            market_id,
            from_outcome,
            to_outcome,
            amount_in,
            amount_out,
            fee_paid,
            timestamp,
        }
    }
}

// ── Dynamic Fee / Volatility Types ────────────────────────────────────────────

/// Rolling record of recent price movement for a single market's AMM pool.
/// Updated on every swap; used to derive the current [`FeeTier`].
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct VolatilityState {
    pub market_id: u64,
    /// Exponentially-weighted moving average of recent per-swap price moves,
    /// expressed in bps of the traded pair's reserve ratio (0-10000).
    pub ema_bps: u32,
    /// The traded-pair reserve ratio (in bps) observed after the most recent swap.
    /// Used as the reference point to measure the next swap's price delta.
    pub last_price_bps: u32,
    /// Ledger timestamp of the most recent update.
    pub last_updated: u64,
    /// Total number of swaps that have contributed to this rolling measure.
    /// Zero means no swap has occurred yet, so `ema_bps`/`last_price_bps` are not yet meaningful.
    pub sample_count: u32,
}

impl VolatilityState {
    pub fn empty(market_id: u64) -> Self {
        Self {
            market_id,
            ema_bps: 0,
            last_price_bps: 0,
            last_updated: 0,
            sample_count: 0,
        }
    }
}

/// The current dynamic-fee tier for a market, derived from its rolling volatility measure.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum FeeTier {
    Calm,
    Normal,
    Volatile,
}

/// Admin-configurable thresholds and per-tier fee rates driving the dynamic swap fee,
/// plus the split of every collected fee between liquidity providers and the protocol treasury.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct FeeTierConfig {
    /// Inclusive upper bound (bps) of rolling volatility for the "calm" tier.
    pub calm_threshold_bps: u32,
    /// Inclusive upper bound (bps) of rolling volatility for the "normal" tier.
    /// Anything above this threshold is classified "volatile". Must be strictly
    /// greater than `calm_threshold_bps`.
    pub volatile_threshold_bps: u32,
    /// Swap fee (bps) applied while in the "calm" tier.
    pub calm_fee_bps: u32,
    /// Swap fee (bps) applied while in the "normal" tier.
    pub normal_fee_bps: u32,
    /// Swap fee (bps) applied while in the "volatile" tier.
    pub volatile_fee_bps: u32,
    /// Share of every collected swap fee routed to the protocol treasury, in bps
    /// of the fee itself (0-10000). The remainder is credited to liquidity providers.
    pub protocol_share_bps: u32,
}

impl FeeTierConfig {
    /// Sensible defaults used whenever no admin-configured schedule has been stored yet.
    pub fn default_config() -> Self {
        Self {
            calm_threshold_bps: 50,
            volatile_threshold_bps: 200,
            calm_fee_bps: 15,
            normal_fee_bps: 30,
            volatile_fee_bps: 100,
            protocol_share_bps: 2000,
        }
    }
}

/// Read-only view of a market's current dynamic fee state, returned by `get_market_fee_info`.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MarketFeeInfo {
    pub market_id: u64,
    pub tier: FeeTier,
    pub effective_fee_bps: u32,
    pub volatility_ema_bps: u32,
}

// ── TWAP Price Oracle Types ───────────────────────────────────────────────────

/// A single recorded price sample for one outcome, kept in the [`PriceAccumulator`]
/// ring buffer.
///
/// `price_cumulative` is the value of the running price integral (sum of
/// `price * elapsed_seconds` over the outcome's whole history) *as of*
/// `timestamp`, i.e. immediately before `price` itself takes effect. This lets
/// `get_twap` reconstruct the integral at any timestamp `t >= observations[0].timestamp`
/// by locating the latest observation at or before `t` and extrapolating with
/// its `price` for the remaining `t - timestamp` seconds.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PriceObservation {
    /// Ledger timestamp this observation was recorded at.
    pub timestamp: u64,
    /// Instantaneous outcome price (pool reserve) that became active at `timestamp`.
    pub price: i128,
    /// Cumulative price integral as of `timestamp`, not yet including `price` itself.
    pub price_cumulative: i128,
}

/// Per-(market, outcome) TWAP state: a cumulative price accumulator plus a
/// fixed-capacity ring buffer of historical observations used to answer
/// windowed `get_twap` queries. Updated on every operation that changes the
/// outcome's reserve (pool creation, swaps).
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PriceAccumulator {
    pub market_id: u64,
    pub outcome: Symbol,
    /// Fixed-capacity ring buffer of the most recent observations. Once full,
    /// new observations overwrite the oldest slot (see `next_index`).
    pub observations: Vec<PriceObservation>,
    /// Index in `observations` that the next write will occupy (wraps modulo capacity).
    pub next_index: u32,
    /// Total number of observations ever recorded for this outcome (monotonic;
    /// may exceed `observations.len()` once the buffer has wrapped).
    pub total_count: u64,
    /// The price active since `last_timestamp`, used to extrapolate the
    /// cumulative integral forward to "now" without a storage write.
    pub last_price: i128,
    /// Ledger timestamp of the most recent observation.
    pub last_timestamp: u64,
    /// Cumulative price integral as of `last_timestamp` (mirrors the most
    /// recent observation's `price_cumulative`).
    pub cumulative: i128,
}

impl PriceAccumulator {
    pub fn empty(env: &Env, market_id: u64, outcome: Symbol) -> Self {
        Self {
            market_id,
            outcome,
            observations: Vec::new(env),
            next_index: 0,
            total_count: 0,
            last_price: 0,
            last_timestamp: 0,
            cumulative: 0,
        }
    }
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct UserProfile {
    /// The wallet address uniquely identifying this user on-chain.
    pub address: Address,
    /// Total number of predictions this user has ever submitted across all markets.
    pub total_predictions: u32,
    /// Number of predictions that resolved in the user's favour.
    pub correct_predictions: u32,
    /// Cumulative XLM (in stroops) staked across all predictions.
    pub total_staked: i128,
    /// Cumulative XLM (in stroops) won across all resolved markets.
    pub total_winnings: i128,
    /// Points accumulated in the current active season.
    /// Points are awarded on payout: base points scale with stake size,
    /// with a correctness multiplier applied for winning predictions.
    pub season_points: u32,
    /// Derived reputation score, recomputed on every payout.
    /// Formula: (correct_predictions * 100) / total_predictions,
    /// clamped to [0, 100]. Represents the user's historical accuracy
    /// as a percentage and is used for leaderboard tiebreaking.
    pub reputation_score: u32,
    /// Ledger timestamp recorded when the user first interacted with the platform.
    pub joined_at: u64,
}

impl UserProfile {
    /// Creates a new `UserProfile` for a wallet joining the platform.
    /// All counters and accumulators are initialised to zero;
    /// only `address` and `joined_at` are set from the arguments.
    pub fn new(address: Address, joined_at: u64) -> Self {
        Self {
            address,
            total_predictions: 0,
            correct_predictions: 0,
            total_staked: 0,
            total_winnings: 0,
            season_points: 0,
            reputation_score: 0,
            joined_at,
        }
    }
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Season {
    /// Unique identifier for this season, incrementing from 1.
    pub season_id: u32,
    /// Ledger timestamp marking when this season's competition window opens
    /// and points accumulation begins.
    pub start_time: u64,
    /// Ledger timestamp marking when this season's competition window closes
    /// and no further points are awarded.
    pub end_time: u64,
    /// Total XLM prize pool (in stroops) allocated for distribution to
    /// top-ranked participants at finalization.
    pub reward_pool: i128,
    /// Number of unique wallets that have earned at least one point
    /// during this season.
    pub participant_count: u32,
    /// True while the season window is open (start_time <= now < end_time).
    /// Set to false when the season ends or is administratively closed.
    pub is_active: bool,
    /// Set to true only after the leaderboard has been fully settled,
    /// rewards have been distributed to winners, and season_points have
    /// been snapshotted. No further mutations to this season are permitted
    /// once finalized.
    pub is_finalized: bool,
    /// The address of the highest-ranked participant after finalization.
    /// Remains None throughout the active window; populated only when
    /// `is_finalized` is set to true and the leaderboard is resolved.
    pub top_winner: Option<Address>,
}

impl Season {
    /// Creates a new `Season` for an upcoming competition window.
    /// The season opens immediately as active with no participants or winner;
    /// finalization is deferred until rewards are distributed after `end_time`.
    pub fn new(season_id: u32, start_time: u64, end_time: u64, reward_pool: i128) -> Self {
        Self {
            season_id,
            start_time,
            end_time,
            reward_pool,
            participant_count: 0,
            is_active: true,
            is_finalized: false,
            top_winner: None,
        }
    }
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct LeaderboardEntry {
    pub rank: u32,
    pub user: Address,
    pub points: u32,
    pub correct_predictions: u32,
    pub total_predictions: u32,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct LeaderboardSnapshot {
    pub season_id: u32,
    pub updated_at: u64,
    pub entries: Vec<LeaderboardEntry>,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RewardPayout {
    pub rank: u32,
    pub user: Address,
    pub amount: i128,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct InviteCode {
    /// The unique symbol string representing this invite code,
    /// used as the `DataKey::InviteCode(code)` storage key.
    pub code: Symbol,
    /// The market this invite code grants access to.
    /// Must reference a valid, non-resolved private market (`is_public: false`).
    pub market_id: u64,
    /// The wallet address of the market creator who generated this code.
    pub creator: Address,
    /// Maximum number of times this code may be redeemed before it is
    /// automatically considered exhausted. Once `current_uses >= max_uses`,
    /// any further redemption attempt must be rejected regardless of
    /// `is_active` or `expires_at`.
    pub max_uses: u32,
    /// Running count of successful redemptions so far.
    /// Incremented atomically on each valid redemption; never decremented.
    pub current_uses: u32,
    /// Ledger timestamp after which this code is no longer redeemable,
    /// even if `current_uses < max_uses`. Should be set at or before
    /// the market's `end_time` to prevent late-entry abuse.
    pub expires_at: u64,
    /// Allows the creator to manually revoke the code before it expires
    /// or reaches `max_uses`. When false, redemption must be rejected
    /// immediately without checking other fields.
    pub is_active: bool,
}

impl InviteCode {
    /// Creates a new `InviteCode` granting access to a private market.
    /// The code is immediately active with zero recorded uses;
    /// expiry and usage cap are enforced at redemption time by the contract.
    pub fn new(
        code: Symbol,
        market_id: u64,
        creator: Address,
        max_uses: u32,
        expires_at: u64,
    ) -> Self {
        Self {
            code,
            market_id,
            creator,
            max_uses,
            current_uses: 0,
            expires_at,
            is_active: true,
        }
    }
}

// ── Conditional Market Types ──────────────────────────────────────────────────

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct ConditionalMarket {
    pub market_id: u64,
    pub parent_market_id: u64,
    pub required_outcome: Symbol,
    pub is_activated: bool,
    pub activation_time: Option<u64>,
    pub conditional_depth: u32,
    pub created_at: u64,
}

impl ConditionalMarket {
    pub fn new(
        market_id: u64,
        parent_market_id: u64,
        required_outcome: Symbol,
        conditional_depth: u32,
        created_at: u64,
    ) -> Self {
        Self {
            market_id,
            parent_market_id,
            required_outcome,
            is_activated: false,
            activation_time: None,
            conditional_depth,
            created_at,
        }
    }

    pub fn activate(&mut self, activation_time: u64) {
        self.is_activated = true;
        self.activation_time = Some(activation_time);
    }
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct ConditionalChain {
    pub market_ids: Vec<u64>,
    pub depth: u32,
}

/// Read-only view of a market's conditional-dependency status, returned by
/// `get_dependency_status`.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DependencyStatus {
    pub market_id: u64,
    /// True if this market has a `ConditionalParent` entry (i.e. it was
    /// created via `create_conditional_market`).
    pub is_conditional: bool,
    /// The immediate parent's market_id, if any.
    pub parent_market_id: Option<u64>,
    /// True when there is no parent, or when the parent has resolved.
    /// `resolve_market` on this market is blocked with `ParentNotResolved`
    /// while this is false.
    pub parent_resolved: bool,
}

// ── Creator Event Types ───────────────────────────────────────────────────────

/// Represents a sports prediction event created by a user.
/// An event groups multiple matches; participants predict the winner of each match.
/// Use DataKey::Event(event_id) to store and retrieve this struct.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Event {
    /// Unique identifier assigned at creation via EventCounter.
    pub event_id: u64,
    /// Address of the creator who paid the creation fee.
    pub creator: Address,
    /// Human-readable event name (max 200 chars — validate with Event::is_valid_title).
    pub title: String,
    /// Extended description or rules (max 1000 chars — validate with Event::is_valid_description).
    pub description: String,
    /// XLM fee (stroops) paid by the creator when this event was created.
    pub creation_fee_paid: i128,
    /// Ledger timestamp when the event was created.
    pub created_at: u64,
    /// True while the event is open for participants and predictions.
    pub is_active: bool,
    /// True if the event was cancelled before resolution; refunds should be triggered.
    pub is_cancelled: bool,
    /// 8-character invite code used for private event access (stored as Symbol).
    pub invite_code: Symbol,
    /// Upper bound on participants; 0 means unlimited.
    pub max_participants: u32,
    /// Running count of unique addresses that have joined this event.
    pub participant_count: u32,
    /// Total number of matches added to this event so far.
    pub match_count: u32,
}

impl Event {
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        event_id: u64,
        creator: Address,
        title: String,
        description: String,
        creation_fee_paid: i128,
        created_at: u64,
        invite_code: Symbol,
        max_participants: u32,
    ) -> Self {
        Self {
            event_id,
            creator,
            title,
            description,
            creation_fee_paid,
            created_at,
            is_active: true,
            is_cancelled: false,
            invite_code,
            max_participants,
            participant_count: 0,
            match_count: 0,
        }
    }

    /// Returns true when the title length is within the 200-character limit.
    pub fn is_valid_title(title: &String) -> bool {
        title.len() <= 200
    }

    /// Returns true when the description length is within the 1000-character limit.
    pub fn is_valid_description(description: &String) -> bool {
        description.len() <= 1000
    }
}

/// Represents a single match within a creator event.
/// Use DataKey::Match(event_id, match_id) to store and retrieve this struct.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EventMatch {
    /// Unique identifier for this match within its parent event (assigned via MatchCounter).
    pub match_id: u64,
    /// ID of the event this match belongs to.
    pub event_id: u64,
    /// Ledger timestamp when this match was added to the event.
    pub created_at: u64,
    /// The verified match result: 0=TeamA, 1=TeamB, 2=Draw. None until resolved.
    /// Uses u32 because Soroban contracttype does not support u8.
    pub actual_winner: Option<u32>,
    /// Set to true once actual_winner is recorded by the event creator or oracle.
    pub is_resolved: bool,
}

impl EventMatch {
    pub fn new(match_id: u64, event_id: u64, created_at: u64) -> Self {
        Self {
            match_id,
            event_id,
            created_at,
            actual_winner: None,
            is_resolved: false,
        }
    }

    /// Records the final result and marks the match as resolved.
    /// winner encoding: 0=TeamA, 1=TeamB, 2=Draw.
    pub fn resolve(&mut self, winner: u32) {
        self.actual_winner = Some(winner);
        self.is_resolved = true;
    }
}

/// Records a user's prediction for a single match in a creator event.
/// predicted_winner encoding: 0=TeamA wins, 1=TeamB wins, 2=Draw.
/// Use DataKey::EventPrediction(event_id, match_id, predictor) for storage.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EventPrediction {
    /// Address of the user who submitted this prediction.
    pub predictor: Address,
    /// ID of the parent event.
    pub event_id: u64,
    /// ID of the specific match within the event.
    pub match_id: u64,
    /// Predicted outcome: 0=TeamA, 1=TeamB, 2=Draw.
    /// Uses u32 because Soroban contracttype does not support u8.
    pub predicted_winner: u32,
    /// Ledger timestamp when the prediction was submitted.
    pub predicted_at: u64,
    /// Graded result: Some(true) = correct, Some(false) = wrong, None = not yet graded.
    pub is_correct: Option<bool>,
}

impl EventPrediction {
    pub fn new(
        predictor: Address,
        event_id: u64,
        match_id: u64,
        predicted_winner: u32,
        predicted_at: u64,
    ) -> Self {
        Self {
            predictor,
            event_id,
            match_id,
            predicted_winner,
            predicted_at,
            is_correct: None,
        }
    }

    /// Returns false if the prediction has not been graded yet.
    pub fn check_correct(&self) -> bool {
        self.is_correct.unwrap_or(false)
    }

    /// Grades this prediction against the actual match result.
    pub fn grade(&mut self, actual_winner: u32) {
        self.is_correct = Some(self.predicted_winner == actual_winner);
    }

    /// Returns true if the predicted_winner value is valid (must be 0, 1, or 2).
    pub fn is_valid_outcome(predicted_winner: u32) -> bool {
        predicted_winner <= 2
    }
}

/// Represents a verified winner of a creator event.
/// A winner is a participant who correctly predicted every match in the event.
/// Use DataKey::Winners(event_id) to store a Vec<Winner> for the event.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Winner {
    /// Wallet address of the winning participant.
    pub user: Address,
    /// ID of the event in which this user achieved a perfect prediction score.
    pub event_id: u64,
    /// Count of matches the user predicted correctly (equal to event match_count for a perfect winner).
    pub total_correct_predictions: u32,
    /// Ledger timestamp when winner status was verified and recorded on-chain.
    pub verified_at: u64,
}

impl Winner {
    pub fn new(
        user: Address,
        event_id: u64,
        total_correct_predictions: u32,
        verified_at: u64,
    ) -> Self {
        Self {
            user,
            event_id,
            total_correct_predictions,
            verified_at,
        }
    }

    /// Returns true if this winner has more correct predictions than `other`,
    /// useful for sorting the winners list in descending order.
    pub fn outranks(&self, other: &Winner) -> bool {
        self.total_correct_predictions > other.total_correct_predictions
    }
}
