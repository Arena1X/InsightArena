#![no_std]
#![allow(non_snake_case)]

pub mod analytics;
pub mod config;
pub mod dispute;
pub mod errors;
pub mod escrow;
// pub mod events;
pub mod governance;
pub mod invite;
pub mod leaderboard;
pub mod liquidity;
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
    pub fn list_markets(env: Env, start: u64, limit: u32) -> Vec<Market> {
        market::list_markets(&env, start, limit)
    }

    /// Transition a market into the "closed" state, blocking further predictions.
    pub fn close_market(
        env: Env,
        caller: Address,
        market_id: u64,
    ) -> Result<(), InsightArenaError> {
        market::close_market(&env, caller, market_id)
    }

    /// Cancel a market and refund all stakers.
    pub fn cancel_market(
        env: Env,
        caller: Address,
        market_id: u64,
    ) -> Result<(), InsightArenaError> {
        market::cancel_market(&env, caller, market_id)
    }

    // ── Dispute ───────────────────────────────────────────────────────────────

    /// File a dispute within the market's post-resolution dispute window.
    pub fn raise_dispute(
        env: Env,
        disputer: Address,
        market_id: u64,
        bond: i128,
    ) -> Result<(), InsightArenaError> {
        dispute::raise_dispute(env, disputer, market_id, bond)
    }

    /// Resolve an active dispute (admin-only).
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
    pub fn get_prediction(
        env: Env,
        market_id: u64,
        predictor: Address,
    ) -> Result<Prediction, InsightArenaError> {
        prediction::get_prediction(&env, market_id, predictor)
    }

    /// Lightweight boolean check: has `predictor` already submitted a prediction?
    pub fn has_predicted(env: Env, market_id: u64, predictor: Address) -> bool {
        prediction::has_predicted(&env, market_id, predictor)
    }

    /// Return all [`Prediction`] records for a given market.
    pub fn list_market_predictions(env: Env, market_id: u64) -> Vec<Prediction> {
        prediction::list_market_predictions(&env, market_id)
    }

    /// Claim a resolved-market payout for `predictor`.
    pub fn claim_payout(
        env: Env,
        predictor: Address,
        market_id: u64,
    ) -> Result<i128, InsightArenaError> {
        prediction::claim_payout(&env, predictor, market_id)
    }

    /// Return the current XLM balance held by the contract escrow in stroops.
    pub fn get_contract_balance(env: Env) -> i128 {
        escrow::get_contract_balance(&env)
    }

    /// Audit the contract's escrow solvency.
    pub fn assert_escrow_solvent(env: Env) -> Result<(), InsightArenaError> {
        escrow::assert_escrow_solvent(&env)
    }

    /// Batch distribute payouts for all unclaimed winning predictions.
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
    pub fn get_treasury_balance(env: Env) -> i128 {
        escrow::get_treasury_balance(&env)
    }

    /// Withdraw an amount from the accumulated protocol treasury.
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
    pub fn generate_invite_code(
        env: Env,
        creator: Address,
        market_id: u64,
        max_uses: u32,
        expires_in_seconds: u64,
    ) -> Result<Symbol, InsightArenaError> {
        invite::generate_invite_code(env, creator, market_id, max_uses, expires_in_seconds)
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
        // Logic Check: Ensure contract is not paused
        config::ensure_not_paused(&env)?;

        //  Delegate implementation to the season module
        season::update_leaderboard(&env, admin, season_id, entries)?;

        // . Update Snapshot List for historical tracking
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

#[cfg(test)]
mod season_tests;

#[cfg(test)]
mod prediction_tests;
