use soroban_sdk::{contracttype, Address, String, Symbol, Vec};

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    /// Keyed by market_id. Represents a prediction market instance.
    Market(u64),
    /// Keyed by market_id. Stores the ordered list of all predictor addresses for that market.
    /// Updated whenever a new prediction is submitted so cancel_market can iterate all stakers.
    PredictorList(u64),
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
            is_closed: false,
            is_resolved: false,
            is_cancelled: false,
            is_public,
            total_pool: 0,
            creator_fee_bps,
            min_stake,
            max_stake,
            participant_count: 0,
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
