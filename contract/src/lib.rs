#![no_std]

pub mod analytics;
pub mod config;
pub mod dispute;
pub mod errors;
pub mod escrow;
pub mod governance;
pub mod invite;
pub mod leaderboard;
pub mod market;
pub mod oracle;
pub mod prediction;
pub mod reputation;
pub mod season;
pub mod security;
pub mod storage_types;
pub mod ttl;
pub use crate::config::Config;
pub use crate::errors::InsightArenaError;
pub use crate::governance::{Proposal, ProposalType};
pub use crate::market::CreateMarketParams;
pub use crate::storage_types::{
    CreatorStats, DataKey, InviteCode, LeaderboardEntry, LeaderboardSnapshot, Market, MarketStats,
    PlatformStats, Prediction, Season, UserProfile,
};

use soroban_sdk::{contract, contractimpl, Address, Env, Symbol, Vec};

#[contract]
pub struct InsightArenaContract;

#[contractimpl]
impl InsightArenaContract {
    // ── Initialisation ────────────────────────────────────────────────────────

    /// Set up the contract for the first time.
    /// Reverts with `AlreadyInitialized` on any subsequent call.
    pub fn initialize(
        env: Env,
        admin: Address,
        oracle: Address,
        fee_bps: u32,
        xlm_token: Address,
    ) -> Result<(), InsightArenaError> {
        config::initialize(&env, admin, oracle, fee_bps, xlm_token)
    }

    /// Transition a market into the "resolved" state by recording the winning outcome.
    ///
    /// Validation order:
    /// 1. `oracle` address must provide valid cryptographic authorisation.
    /// 2. `oracle` must match the `oracle_address` stored in global configuration.
    /// 3. Market must exist in persistent storage.
    /// 4. `current_time >= market.resolution_time` — resolution window must be open.
    /// 5. `market.is_resolved == false` — prevents double-resolution.
    /// 6. `resolved_outcome` must be one of the symbols in `market.outcome_options`.
    ///
    /// On success:
    /// - `market.is_resolved` is set to `true`.
    /// - `market.resolved_outcome` stores the winning `Symbol`.
    /// - The updated record is saved to storage and its TTL is extended.
    /// - A `MarketResolved` event is emitted.
    pub fn resolve_market(
        env: Env,
        oracle: Address,
        market_id: u64,
        resolved_outcome: Symbol,
    ) -> Result<(), InsightArenaError> {
        oracle::resolve_market(env, oracle, market_id, resolved_outcome)
    }

    // ── Config read ───────────────────────────────────────────────────────────

    /// Return the current global [`Config`]. TTL is extended on each call.
    /// Reverts with `Paused` when the contract is in emergency-halt mode.
    pub fn get_config(env: Env) -> Result<Config, InsightArenaError> {
        config::ensure_not_paused(&env)?;
        config::get_config(&env)
    }

    // ── Admin mutators ────────────────────────────────────────────────────────

    /// Update the platform fee rate. Caller must be the stored admin.
    pub fn update_protocol_fee(env: Env, new_fee_bps: u32) -> Result<(), InsightArenaError> {
        config::update_protocol_fee(&env, new_fee_bps)
    }

    /// Pause or resume the contract. Caller must be the stored admin.
    pub fn set_paused(env: Env, paused: bool) -> Result<(), InsightArenaError> {
        config::set_paused(&env, paused)
    }

    /// Transfer admin rights to `new_admin`. Caller must be the current admin.
    pub fn transfer_admin(env: Env, new_admin: Address) -> Result<(), InsightArenaError> {
        config::transfer_admin(&env, new_admin)
    }

    /// Update the trusted oracle address. Caller must be the current admin.
    pub fn update_oracle(
        env: Env,
        admin: Address,
        new_oracle: Address,
    ) -> Result<(), InsightArenaError> {
        config::update_oracle(&env, admin, new_oracle)
    }

    // ── Market ────────────────────────────────────────────────────────────────

    /// Create a new prediction market. Returns the auto-assigned `market_id`.
    ///
    /// All market configuration fields are bundled in [`CreateMarketParams`] to
    /// stay within Soroban's 10-parameter ABI limit. Reverts with `Paused` when
    /// the contract is halted, or with a specific validation error on bad input.
    pub fn create_market(
        env: Env,
        creator: Address,
        params: CreateMarketParams,
    ) -> Result<u64, InsightArenaError> {
        market::create_market(&env, creator, params)
    }

    /// Add a category to the admin-managed whitelist used during market creation.
    pub fn add_category(
        env: Env,
        admin: Address,
        category: Symbol,
    ) -> Result<(), InsightArenaError> {
        market::add_category(&env, admin, category)
    }

    /// Remove a category from the whitelist for future market creation.
    pub fn remove_category(
        env: Env,
        admin: Address,
        category: Symbol,
    ) -> Result<(), InsightArenaError> {
        market::remove_category(&env, admin, category)
    }

    /// Return the current category whitelist.
    pub fn list_categories(env: Env) -> Vec<Symbol> {
        market::list_categories(&env)
    }

    /// Return markets for a category using a zero-based offset in that category's index.
    pub fn get_markets_by_category(
        env: Env,
        category: Symbol,
        start: u64,
        limit: u32,
    ) -> Vec<Market> {
        market::get_markets_by_category(&env, category, start, limit)
    }

    /// Fetch a market by ID. Returns `MarketNotFound` if it does not exist.
    pub fn get_market(env: Env, market_id: u64) -> Result<Market, InsightArenaError> {
        market::get_market(&env, market_id)
    }

    /// Return the total number of markets ever created (0 if none yet).
    pub fn get_market_count(env: Env) -> u64 {
        market::get_market_count(&env)
    }

    /// Return a paginated list of markets in creation order.
    ///
    /// - `start`: 1-based market ID to begin from (inclusive).
    /// - `limit`: maximum markets to return; hard-capped at 50.
    /// - Returns an empty `Vec` when `start` exceeds the market count.
    pub fn list_markets(env: Env, start: u64, limit: u32) -> Vec<Market> {
        market::list_markets(&env, start, limit)
    }

    /// Transition a market into the "closed" state, blocking further predictions.
    ///
    /// Can only be called after `market.end_time` has passed. Caller must be the
    /// platform admin or the configured oracle address. Emits a `MarketClosed` event.
    pub fn close_market(
        env: Env,
        caller: Address,
        market_id: u64,
    ) -> Result<(), InsightArenaError> {
        market::close_market(&env, caller, market_id)
    }

    /// Cancel a market and refund all stakers.
    ///
    /// Only callable by the platform admin. Iterates every `Prediction` record
    /// stored under `PredictorList(market_id)` and returns each stake via the
    /// escrow module. Emits a `MarketCancelled` event on success.
    pub fn cancel_market(
        env: Env,
        caller: Address,
        market_id: u64,
    ) -> Result<(), InsightArenaError> {
        market::cancel_market(&env, caller, market_id)
    }

    // ── Dispute ───────────────────────────────────────────────────────────────

    /// File a dispute within the market's post-resolution dispute window.
    /// Locks `bond` in escrow and stores a `Dispute(market_id)` record.
    pub fn raise_dispute(
        env: Env,
        disputer: Address,
        market_id: u64,
        bond: i128,
    ) -> Result<(), InsightArenaError> {
        dispute::raise_dispute(env, disputer, market_id, bond)
    }

    /// Resolve an active dispute (admin-only).
    /// - `uphold=true`: return bond to disputer and reopen market for re-resolution.
    /// - `uphold=false`: forfeit bond to treasury accounting.
    pub fn resolve_dispute(
        env: Env,
        admin: Address,
        market_id: u64,
        uphold: bool,
    ) -> Result<(), InsightArenaError> {
        dispute::resolve_dispute(env, admin, market_id, uphold)
    }

    // ── Prediction ────────────────────────────────────────────────────────────

    /// Submit a prediction for an open market by staking XLM on a chosen outcome.
    ///
    /// The predictor selects one of the market's valid `outcome_options` and
    /// locks `stake_amount` stroops of XLM into escrow. Returns `AlreadyPredicted`
    /// if the same address has already staked on this market. Emits a
    /// `PredictionSubmitted` event on success.
    pub fn submit_prediction(
        env: Env,
        predictor: Address,
        market_id: u64,
        chosen_outcome: Symbol,
        stake_amount: i128,
    ) -> Result<(), InsightArenaError> {
        prediction::submit_prediction(&env, predictor, market_id, chosen_outcome, stake_amount)
    }

    /// Return the stored [`Prediction`] for a given `(market_id, predictor)` pair.
    ///
    /// Read-only — no state is mutated. The prediction's TTL is extended on
    /// every successful call. Returns `PredictionNotFound` if no prediction
    /// exists for the supplied key.
    pub fn get_prediction(
        env: Env,
        market_id: u64,
        predictor: Address,
    ) -> Result<Prediction, InsightArenaError> {
        prediction::get_prediction(&env, market_id, predictor)
    }

    /// Lightweight boolean check: has `predictor` already submitted a
    /// prediction on `market_id`?
    ///
    /// Does not load the full `Prediction` struct — only tests key existence.
    /// Never panics; returns `false` for non-existent markets or predictors.
    pub fn has_predicted(env: Env, market_id: u64, predictor: Address) -> bool {
        prediction::has_predicted(&env, market_id, predictor)
    }

    /// Return all [`Prediction`] records for a given market.
    ///
    /// Iterates the `PredictorList(market_id)` and fetches each prediction.
    /// Returns an empty `Vec` when the market has no predictions or does not
    /// exist. TTLs are extended for every record accessed.
    pub fn list_market_predictions(env: Env, market_id: u64) -> Vec<Prediction> {
        prediction::list_market_predictions(&env, market_id)
    }

    /// Claim a resolved-market payout for `predictor`.
    ///
    /// Reverts when the market is unresolved, the caller did not predict the
    /// winning outcome, or a payout for this `(market_id, predictor)` has
    /// already been claimed.
    pub fn claim_payout(
        env: Env,
        predictor: Address,
        market_id: u64,
    ) -> Result<i128, InsightArenaError> {
        prediction::claim_payout(&env, predictor, market_id)
    }

    /// Return the current XLM balance held by the contract escrow in stroops.
    ///
    /// This is a pure view over the configured token contract and does not
    /// mutate any internal state.
    pub fn get_contract_balance(env: Env) -> i128 {
        escrow::get_contract_balance(&env)
    }

    /// Audit the contract's escrow solvency against all unclaimed prediction
    /// stakes currently stored on-chain.
    pub fn assert_escrow_solvent(env: Env) -> Result<(), InsightArenaError> {
        escrow::assert_escrow_solvent(&env)
    }

    /// Batch distribute payouts for all unclaimed winning predictions in a
    /// resolved market. Callable only by admin or oracle.
    ///
    /// Returns the number of winner payouts processed in this invocation.
    pub fn batch_distribute_payouts(
        env: Env,
        caller: Address,
        market_id: u64,
    ) -> Result<u32, InsightArenaError> {
        prediction::batch_distribute_payouts(&env, caller, market_id)
    }

    pub fn create_proposal(
        env: Env,
        proposer: Address,
        proposal_type: ProposalType,
        voting_duration: u64,
    ) -> Result<u32, InsightArenaError> {
        governance::create_proposal(&env, proposer, proposal_type, voting_duration)
    }

    pub fn vote(
        env: Env,
        voter: Address,
        proposal_id: u32,
        vote_for: bool,
    ) -> Result<(), InsightArenaError> {
        governance::vote(&env, voter, proposal_id, vote_for)
    }

    pub fn execute_proposal(
        env: Env,
        executor: Address,
        proposal_id: u32,
    ) -> Result<(), InsightArenaError> {
        governance::execute_proposal(&env, executor, proposal_id)
    }

    /// Return the total protocol fees accumulated in the treasury.
    /// Returns `0` if no fees have been collected yet. Never panics.
    pub fn get_treasury_balance(env: Env) -> i128 {
        escrow::get_treasury_balance(&env)
    }

    /// Withdraw an amount from the accumulated protocol treasury.
    ///
    /// Caller must be the configured admin.
    pub fn withdraw_treasury(
        env: Env,
        admin: Address,
        to: Address,
        amount: i128,
    ) -> Result<(), InsightArenaError> {
        escrow::transfer_fee(&env, &admin, &to, amount)
    }

    // ── Invite ────────────────────────────────────────────────────────────────

    /// Generate a unique 8-character invite code for a private market.
    ///
    /// Validation:
    /// 1. `creator` must be the actual market creator.
    /// 2. `max_uses` must be at least 1.
    pub fn generate_invite_code(
        env: Env,
        creator: Address,
        market_id: u64,
        max_uses: u32,
        expires_in_seconds: u64,
    ) -> Result<Symbol, InsightArenaError> {
        invite::generate_invite_code(env, creator, market_id, max_uses, expires_in_seconds)
        // ── Season / Leaderboard ────────────────────────────────────────────────
    }

    /// Redeem a private-market invite code and return the associated market id.
    pub fn redeem_invite_code(
        env: Env,
        invitee: Address,
        code: Symbol,
    ) -> Result<u64, InsightArenaError> {
        invite::redeem_invite_code(env, invitee, code)
    }

    /// Revoke an invite code so it can no longer be redeemed.
    pub fn revoke_invite_code(
        env: Env,
        creator: Address,
        code: Symbol,
    ) -> Result<(), InsightArenaError> {
        invite::revoke_invite_code(env, creator, code)
    }

    /// List all season IDs which have snapshots available.
    pub fn list_snapshot_seasons(env: Env) -> Vec<u32> {
        env.storage()
            .persistent()
            .get(&DataKey::SnapshotSeasonList)
            .unwrap_or_else(|| Vec::new(&env))
    }

    // ── Season Management ─────────────────────────────────────────────────────

    pub fn create_season(
        env: Env,
        admin: Address,
        start_time: u64,
        end_time: u64,
        reward_pool: i128,
    ) -> Result<u32, InsightArenaError> {
        season::create_season(&env, admin, start_time, end_time, reward_pool)
    }

    pub fn get_season(env: Env, season_id: u32) -> Result<Season, InsightArenaError> {
        season::get_season(&env, season_id)
    }

    pub fn get_active_season(env: Env) -> Option<Season> {
        season::get_active_season(&env)
    }

    pub fn update_leaderboard(
        env: Env,
        admin: Address,
        season_id: u32,
        entries: Vec<LeaderboardEntry>,
    ) -> Result<(), InsightArenaError> {
        config::ensure_not_paused(&env)?;
        season::update_leaderboard(&env, admin, season_id, entries)?;

        // Update SnapshotSeasonList
        let list_key = DataKey::SnapshotSeasonList;
        let mut seasons: Vec<u32> = env
            .storage()
            .persistent()
            .get(&list_key)
            .unwrap_or_else(|| Vec::new(&env));

        if !seasons.contains(season_id) {
            seasons.push_back(season_id);
            env.storage().persistent().set(&list_key, &seasons);
        }

        Ok(())
    }

    pub fn get_leaderboard(
        env: Env,
        season_id: u32,
    ) -> Result<LeaderboardSnapshot, InsightArenaError> {
        season::get_leaderboard(&env, season_id)
    }

    pub fn finalize_season(
        env: Env,
        admin: Address,
        season_id: u32,
    ) -> Result<(), InsightArenaError> {
        season::finalize_season(&env, admin, season_id)
    }

    pub fn reset_season_points(
        env: Env,
        admin: Address,
        new_season_id: u32,
    ) -> Result<u32, InsightArenaError> {
        season::reset_season_points(&env, admin, new_season_id)
    }

    /// Season points for `user` in `season_id` (snapshot if finalized, else live profile when applicable).
    /// Returns `0` for unknown users. Never panics.
    pub fn get_user_season_points(env: Env, user: Address, season_id: u32) -> u32 {
        leaderboard::get_user_season_points(&env, user, season_id)
    }

    // ── Reputation ────────────────────────────────────────────────────────────

    /// Return the [`CreatorStats`] for a given creator address.
    /// Returns zeroed stats if the creator has never created a market.
    pub fn get_creator_stats(
        env: Env,
        creator: Address,
    ) -> Result<CreatorStats, InsightArenaError> {
        reputation::get_creator_stats(env, creator)
    }

    // ── Analytics ─────────────────────────────────────────────────────────────

    /// Return aggregated stats for a single market.
    pub fn get_market_stats(env: Env, market_id: u64) -> Result<MarketStats, InsightArenaError> {
        analytics::get_market_stats(env, market_id)
    }

    /// Return per-outcome stake totals sorted descending by stake.
    pub fn get_outcome_distribution(
        env: Env,
        market_id: u64,
    ) -> Result<Vec<(Symbol, i128)>, InsightArenaError> {
        analytics::get_outcome_distribution(env, market_id)
    }

    /// Return the stored `UserProfile` for a given address.
    pub fn get_user_stats(env: Env, user: Address) -> Result<UserProfile, InsightArenaError> {
        analytics::get_user_stats(env, user)
    }

    /// Return platform-wide aggregated stats using cached counters.
    pub fn get_platform_stats(env: Env) -> PlatformStats {
        analytics::get_platform_stats(env)
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────
//
// Soroban storage can only be accessed from within a registered contract context.
// These tests use the auto-generated `InsightArenaContractClient` (available when
// the `testutils` feature is enabled) to call through the real ABI and exercise
// `ensure_not_paused` indirectly via `get_config`, which is guarded by it.

#[cfg(test)]
mod config_tests {
    use soroban_sdk::testutils::Address as _;
    use soroban_sdk::{Address, Env};

    use super::{InsightArenaContract, InsightArenaContractClient, InsightArenaError};

    /// Register a fresh contract instance and return its client.
    fn deploy(env: &Env) -> InsightArenaContractClient<'_> {
        let id = env.register(InsightArenaContract, ());
        InsightArenaContractClient::new(env, &id)
    }

    fn register_token(env: &Env) -> Address {
        let token_admin = Address::generate(env);
        env.register_stellar_asset_contract_v2(token_admin)
            .address()
    }

    // (a) Contract initialised and not paused → get_config (guarded) succeeds
    #[test]
    fn ensure_not_paused_ok_when_running() {
        let env = Env::default();
        env.mock_all_auths();
        let client = deploy(&env);
        let admin = Address::generate(&env);
        let oracle = Address::generate(&env);

        client.initialize(&admin, &oracle, &200_u32, &register_token(&env));

        // get_config is the first publicly guarded function; passing means Ok(())
        client.get_config();
    }

    // (b) Admin sets paused = true → get_config reverts with Paused
    #[test]
    fn ensure_not_paused_err_when_paused() {
        let env = Env::default();
        env.mock_all_auths();
        let client = deploy(&env);
        let admin = Address::generate(&env);
        let oracle = Address::generate(&env);

        client.initialize(&admin, &oracle, &200_u32, &register_token(&env));
        client.set_paused(&true);

        // try_* variant returns Err(Ok(ContractError)) instead of panicking
        let result = client.try_get_config();
        assert!(matches!(result, Err(Ok(InsightArenaError::Paused))));
    }

    // Edge case: guard returns NotInitialized when the contract hasn't been set up
    #[test]
    fn ensure_not_paused_not_initialized() {
        let env = Env::default();
        env.mock_all_auths();
        let client = deploy(&env);

        let result = client.try_get_config();
        assert!(matches!(result, Err(Ok(InsightArenaError::NotInitialized))));
    }

    // Unpause after pause → guard passes again
    #[test]
    fn ensure_not_paused_ok_after_unpause() {
        let env = Env::default();
        env.mock_all_auths();
        let client = deploy(&env);
        let admin = Address::generate(&env);
        let oracle = Address::generate(&env);

        client.initialize(&admin, &oracle, &200_u32, &register_token(&env));
        client.set_paused(&true);
        client.set_paused(&false);

        // Must succeed after resuming
        client.get_config();
    }
}

#[cfg(test)]
mod leaderboard_tests {
    use soroban_sdk::testutils::Address as _;
    use soroban_sdk::{vec, Address, Env};

    use super::{
        InsightArenaContract, InsightArenaContractClient, InsightArenaError, LeaderboardEntry,
    };

    fn deploy(env: &Env) -> (InsightArenaContractClient<'_>, Address, Address) {
        let id = env.register(InsightArenaContract, ());
        let client = InsightArenaContractClient::new(env, &id);
        let admin = Address::generate(env);
        let oracle = Address::generate(env);
        let token_admin = Address::generate(env);
        let xlm_token = env
            .register_stellar_asset_contract_v2(token_admin)
            .address();
        env.mock_all_auths();
        client.initialize(&admin, &oracle, &200_u32, &xlm_token);
        (client, admin, xlm_token)
    }

    #[test]
    fn test_update_and_get_historical_leaderboard() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, admin, xlm_token) = deploy(&env);

        // Creator needs to fund and approve for season reward pool
        let reward_pool = 10_000_000;
        let token_client = soroban_sdk::token::Client::new(&env, &xlm_token);
        Address::generate(&env); // dummy
        soroban_sdk::token::StellarAssetClient::new(&env, &xlm_token).mint(&admin, &reward_pool);
        token_client.approve(&admin, &client.address, &reward_pool, &9999);

        let season_id = client.create_season(&admin, &100, &200, &reward_pool);
        let user1 = Address::generate(&env);
        let user2 = Address::generate(&env);
        let entries = vec![
            &env,
            LeaderboardEntry {
                rank: 1,
                user: user1.clone(),
                points: 100,
                correct_predictions: 10,
                total_predictions: 15,
            },
            LeaderboardEntry {
                rank: 2,
                user: user2.clone(),
                points: 80,
                correct_predictions: 8,
                total_predictions: 12,
            },
        ];

        client.update_leaderboard(&admin, &season_id, &entries);

        let snapshot = client.get_leaderboard(&season_id);
        assert_eq!(snapshot.season_id, season_id);
        assert_eq!(snapshot.entries.len(), 2);
        assert_eq!(snapshot.entries.get(0).unwrap().user, user1);
        assert_eq!(snapshot.entries.get(0).unwrap().points, 100);
        assert_eq!(snapshot.entries.get(1).unwrap().user, user2);
        assert_eq!(snapshot.entries.get(1).unwrap().points, 80);
    }

    #[test]
    fn test_list_snapshot_seasons_deduplication() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, admin, xlm_token) = deploy(&env);

        let reward_pool = 20_000_000;
        soroban_sdk::token::StellarAssetClient::new(&env, &xlm_token).mint(&admin, &reward_pool);
        soroban_sdk::token::Client::new(&env, &xlm_token).approve(
            &admin,
            &client.address,
            &reward_pool,
            &9999,
        );

        let s1 = client.create_season(&admin, &100, &200, &10_000_000);
        let s2 = client.create_season(&admin, &201, &300, &10_000_000);

        assert_eq!(client.list_snapshot_seasons().len(), 0);

        let entries = vec![
            &env,
            LeaderboardEntry {
                rank: 1,
                user: Address::generate(&env),
                points: 10,
                correct_predictions: 1,
                total_predictions: 1,
            },
        ];

        // First snapshot for Season 1 (admin)
        client.update_leaderboard(&admin, &s1, &entries);
        assert_eq!(client.list_snapshot_seasons().len(), 1);
        assert_eq!(client.list_snapshot_seasons().get(0).unwrap(), s1);

        // Update Snapshot for Season 1 (admin) — should not duplicate in list
        client.update_leaderboard(&admin, &s1, &entries);
        assert_eq!(client.list_snapshot_seasons().len(), 1);

        // Snapshot for Season 2
        client.update_leaderboard(&admin, &s2, &entries);
        assert_eq!(client.list_snapshot_seasons().len(), 2);
        assert_eq!(client.list_snapshot_seasons().get(1).unwrap(), s2);
    }

    #[test]
    fn test_get_leaderboard_not_found() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, _, _) = deploy(&env);

        let result = client.try_get_leaderboard(&99);
        assert!(matches!(result, Err(Ok(InsightArenaError::SeasonNotFound))));
    }

    #[test]
    fn test_update_leaderboard_unauthorized() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, _, _) = deploy(&env);
        let stranger = Address::generate(&env);

        let result = client.try_update_leaderboard(&stranger, &1, &vec![&env]);
        assert!(matches!(result, Err(Ok(InsightArenaError::Unauthorized))));
    }

    #[test]
    fn test_update_leaderboard_when_paused() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, admin, _) = deploy(&env);

        client.set_paused(&true);
        let result = client.try_update_leaderboard(&admin, &1, &vec![&env]);
        assert!(matches!(result, Err(Ok(InsightArenaError::Paused))));
    }
}

#[cfg(test)]
mod season_tests;

#[cfg(test)]
mod prediction_tests;
