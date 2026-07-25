#![no_std]
#![allow(non_snake_case)]
#[cfg(test)]
mod test {
    // mod governance_test;//.
}

pub mod config;
pub mod dispute;
pub mod errors;
pub mod escrow;
// pub mod events;
pub mod governance;
pub mod invite;
pub mod liquidity;
pub mod market;
pub mod prediction;
pub mod reputation;
pub mod season;
pub mod storage_types;

pub use crate::config::Config;
pub use crate::errors::InsightArenaError;
pub use crate::governance::{Proposal, ProposalType};
pub use crate::storage_types::ProposalState;
pub use crate::liquidity::{calculate_liquidity_value, calculate_lp_tokens, calculate_swap_output};
pub use crate::market::CreateMarketParams;
pub use crate::storage_types::{
    BatchPredictionRequest,
    ConditionalChain, ConditionalMarket, CreatorLeaderboardEntry, CreatorStats, DataKey,
    DependencyStatus, Dispute, Event, EventMatch, EventPrediction, FeeTier, FeeTierConfig,
    InviteCode, LPPosition, LeaderboardEntry, LeaderboardSnapshot, LiquidityPool, Market,
    MarketFeeInfo, MarketStats, PlatformStats, Prediction, PriceAccumulator, PriceObservation,
    Season, SwapRecord, UserProfile, VolatilityState, Winner,
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
        market::resolve_market(env, oracle, market_id, resolved_outcome)
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
    /// `reason_code` is recorded on the emitted event for auditing.
    pub fn set_paused(env: Env, paused: bool, reason_code: u32) -> Result<(), InsightArenaError> {
        config::set_paused(&env, paused, reason_code)
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

    /// Update the minimum creator reputation required to create a market.
    /// Caller must be the current admin. See `ProposalType::UpdateMinReputation`
    /// for the timelocked governance path.
    pub fn set_min_creator_reputation(
        env: Env,
        admin: Address,
        new_threshold: u32,
    ) -> Result<(), InsightArenaError> {
        config::set_min_creator_reputation(&env, admin, new_threshold)
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

    /// Update the creator fee for a market before it closes.
    pub fn update_creator_fee(
        env: Env,
        creator: Address,
        market_id: u64,
        new_creator_fee_bps: u32,
    ) -> Result<(), InsightArenaError> {
        market::update_creator_fee(&env, creator, market_id, new_creator_fee_bps)
    }

    /// Extend the end_time of a market before it closes.
    pub fn extend_market_end_time(
        env: Env,
        creator: Address,
        market_id: u64,
        new_end_time: u64,
    ) -> Result<(), InsightArenaError> {
        market::extend_market_end_time(&env, creator, market_id, new_end_time)
    }

    /// Cancel a market and refund all stakers.
    pub fn cancel_market(
        env: Env,
        caller: Address,
        market_id: u64,
    ) -> Result<(), InsightArenaError> {
        market::cancel_market(&env, caller, market_id)
    }

    // ── Conditional Markets ───────────────────────────────────────────────────

    pub fn create_conditional_market(
        env: Env,
        creator: Address,
        parent_market_id: u64,
        required_outcome: Symbol,
        params: CreateMarketParams,
    ) -> Result<u64, InsightArenaError> {
        market::create_conditional_market(&env, creator, parent_market_id, required_outcome, params)
    }

    /// Get all conditional markets (children) for a given parent market.
    pub fn get_conditional_markets(
        env: Env,
        parent_market_id: u64,
    ) -> Vec<crate::storage_types::ConditionalMarket> {
        market::get_conditional_markets(&env, parent_market_id)
    }

    /// Get the direct parent market for a conditional market.
    pub fn get_parent_market(env: Env, market_id: u64) -> Result<Market, InsightArenaError> {
        market::get_parent_market(&env, market_id)
    }

    /// Get full conditional ancestry chain for a market.
    pub fn get_conditional_chain(
        env: Env,
        market_id: u64,
    ) -> Result<crate::storage_types::ConditionalChain, InsightArenaError> {
        market::get_conditional_chain(&env, market_id)
    }

    /// Return the conditional depth of a market (0 for root, 1 for first-level conditional, etc.).
    pub fn calculate_conditional_depth(env: Env, market_id: u64) -> u32 {
        market::calculate_conditional_depth(&env, market_id)
    }

    /// Return a market's conditional-dependency status: whether it is a
    /// conditional child, its immediate parent (if any), and whether that
    /// parent has resolved. `resolve_market` blocks on an unresolved parent.
    pub fn get_dependency_status(
        env: Env,
        market_id: u64,
    ) -> Result<crate::storage_types::DependencyStatus, InsightArenaError> {
        market::get_dependency_status(&env, market_id)
    }

    // ── Dispute ───────────────────────────────────────────────────────────────

    /// Return the active dispute for a market. Extends TTL on read.
    pub fn get_dispute(
        env: Env,
        market_id: u64,
    ) -> Result<crate::storage_types::Dispute, InsightArenaError> {
        dispute::get_dispute(&env, market_id)
    }

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

    /// Enumerate all markets that currently have an active dispute.
    pub fn list_active_disputes(env: Env) -> Vec<u64> {
        dispute::list_active_disputes(&env)
    }

    /// Get the total count of currently open disputes.
    pub fn get_open_dispute_count(env: Env) -> u32 {
        dispute::get_open_dispute_count(&env)
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

    /// Submit a batch of predictions atomically.
    pub fn submit_predictions_batch(
        env: Env,
        predictor: Address,
        requests: Vec<BatchPredictionRequest>,
    ) -> Result<Vec<()>, InsightArenaError> {
        prediction::submit_predictions_batch(&env, predictor, requests)
    }

    /// Transfer part or all of a prediction position from `from` to `to` while
    /// the market is still open. Pure accounting move — no token transfer.
    pub fn transfer_prediction(
        env: Env,
        market_id: u64,
        from: Address,
        to: Address,
        shares: i128,
    ) -> Result<(), InsightArenaError> {
        prediction::transfer_prediction(&env, market_id, from, to, shares)
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

    /// Return market IDs that `user` has staked in.
    pub fn list_user_markets(env: Env, user: Address) -> Vec<u64> {
        market::list_user_markets(env, user)
    }

    /// Claim a resolved-market payout for `predictor`.
    pub fn claim_payout(
        env: Env,
        predictor: Address,
        market_id: u64,
    ) -> Result<i128, InsightArenaError> {
        prediction::claim_payout(&env, predictor, market_id)
    }

    /// Pull-based cancellation refund: transfer the caller's full staked amount
    /// back to them from escrow.
    ///
    /// The market must be cancelled. Each participant calls this once for
    /// themselves; a second call reverts with `RefundAlreadyClaimed`.
    /// A caller with no stake in the market reverts with `NotAParticipant`.
    /// Returns the refund amount in stroops.
    pub fn claim_cancel_refund(
        env: Env,
        predictor: Address,
        market_id: u64,
    ) -> Result<i128, InsightArenaError> {
        prediction::claim_cancel_refund(&env, predictor, market_id)
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

    /// Return a paginated list of governance proposals in creation order.
    /// `start` is 1-based; `limit` is capped at 50.
    pub fn list_proposals(env: Env, start: u32, limit: u32) -> Vec<Proposal> {
        governance::list_proposals(&env, start, limit)
    }

    /// Return a single governance proposal by ID.
    pub fn get_proposal(env: Env, proposal_id: u32) -> Result<Proposal, InsightArenaError> {
        governance::get_proposal(&env, proposal_id)
    }

    /// Cancel a proposal. Only the proposer or admin may cancel; executed proposals cannot be cancelled.
    pub fn cancel_proposal(
        env: Env,
        caller: Address,
        proposal_id: u32,
    ) -> Result<(), InsightArenaError> {
        governance::cancel_proposal(&env, caller, proposal_id)
    }

    /// Guardian-only veto of a queued proposal during its timelock window.
    pub fn veto_proposal(
        env: Env,
        guardian: Address,
        proposal_id: u32,
    ) -> Result<(), InsightArenaError> {
        governance::veto_proposal(&env, guardian, proposal_id)
    }

    /// Return the current lifecycle state of a proposal (Voting/Queued/Executable/Executed/Cancelled/Vetoed).
    pub fn get_proposal_state(
        env: Env,
        proposal_id: u32,
    ) -> Result<ProposalState, InsightArenaError> {
        governance::get_proposal_state(&env, proposal_id)
    }

    /// Update the governance timelock delay (seconds). Caller must be the current admin.
    pub fn set_timelock_delay(
        env: Env,
        admin: Address,
        new_delay: u64,
    ) -> Result<(), InsightArenaError> {
        config::set_timelock_delay(&env, admin, new_delay)
    }

    /// Update the governance guardian address. Caller must be the current admin.
    pub fn set_guardian(
        env: Env,
        admin: Address,
        new_guardian: Address,
    ) -> Result<(), InsightArenaError> {
        config::set_guardian(&env, admin, new_guardian)
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

    pub fn get_season_participants(
        env: Env,
        season_id: u32,
    ) -> Result<Vec<Address>, InsightArenaError> {
        season::get_season_participants(&env, season_id)
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
        season::get_user_season_points(&env, user, season_id)
    }

    // ── Reputation ────────────────────────────────────────────────────────────

    /// Return the [`CreatorStats`] for a given creator address.
    pub fn get_creator_stats(
        env: Env,
        creator: Address,
    ) -> Result<CreatorStats, InsightArenaError> {
        reputation::get_creator_stats(env, creator)
    }

    /// Return a sorted list of top creators by reputation score.
    pub fn get_top_creators(env: Env, limit: u32) -> Vec<CreatorLeaderboardEntry> {
        reputation::get_top_creators(&env, limit)
    }

    /// Admin function to forcefully reset a creator's statistics.
    pub fn reset_creator_stats(
        env: Env,
        admin: Address,
        creator: Address,
    ) -> Result<(), InsightArenaError> {
        reputation::reset_creator_stats(&env, admin, creator)
    }

    /// Return `creator`'s current reputation score (0-1000). Pure read, no
    /// storage mutation.
    pub fn get_reputation_score(env: Env, creator: Address) -> u32 {
        reputation::get_reputation_score(&env, &creator)
    }

    /// `true` if `creator` is exempt from the minimum-reputation gate on
    /// market creation.
    pub fn is_trusted_creator(env: Env, creator: Address) -> bool {
        reputation::is_trusted_creator(&env, &creator)
    }

    /// Add `creator` to the trusted-creator allowlist, exempting them from the
    /// minimum-reputation gate on market creation. Caller must be the current
    /// admin. See `ProposalType::AddTrustedCreator` for the timelocked
    /// governance path.
    pub fn add_trusted_creator(
        env: Env,
        admin: Address,
        creator: Address,
    ) -> Result<(), InsightArenaError> {
        reputation::add_trusted_creator(&env, admin, creator)
    }

    /// Remove `creator` from the trusted-creator allowlist. Caller must be the
    /// current admin. See `ProposalType::RemoveTrustedCreator` for the
    /// timelocked governance path.
    pub fn remove_trusted_creator(
        env: Env,
        admin: Address,
        creator: Address,
    ) -> Result<(), InsightArenaError> {
        reputation::remove_trusted_creator(&env, admin, creator)
    }

    // ── Analytics ─────────────────────────────────────────────────────────────

    /// Return aggregated stats for a single market.
    pub fn get_market_stats(env: Env, market_id: u64) -> Result<MarketStats, InsightArenaError> {
        market::get_market_stats(env, market_id)
    }

    /// Return per-outcome stake totals sorted descending by stake.
    pub fn get_outcome_distribution(
        env: Env,
        market_id: u64,
    ) -> Result<Vec<(Symbol, i128)>, InsightArenaError> {
        market::get_outcome_distribution(env, market_id)
    }

    /// Return the stored `UserProfile` for a given address.
    pub fn get_user_stats(env: Env, user: Address) -> Result<UserProfile, InsightArenaError> {
        market::get_user_stats(env, user)
    }

    /// Return platform-wide aggregated stats using cached counters.
    pub fn get_platform_stats(env: Env) -> PlatformStats {
        market::get_platform_stats(env)
    }

    // ── Liquidity Pool / AMM ──────────────────────────────────────────────────

    /// Add liquidity to a market pool and receive LP tokens
    pub fn add_liquidity(
        env: Env,
        provider: Address,
        market_id: u64,
        amount: i128,
    ) -> Result<i128, InsightArenaError> {
        liquidity::add_liquidity(&env, provider, market_id, amount)
    }

    /// Remove liquidity from a pool by burning LP tokens
    pub fn remove_liquidity(
        env: Env,
        provider: Address,
        market_id: u64,
        lp_tokens: i128,
    ) -> Result<i128, InsightArenaError> {
        liquidity::remove_liquidity(&env, provider, market_id, lp_tokens)
    }

    /// Swap from one outcome position to another
    pub fn swap_outcome(
        env: Env,
        trader: Address,
        market_id: u64,
        from_outcome: Symbol,
        to_outcome: Symbol,
        amount_in: i128,
        min_amount_out: i128,
    ) -> Result<i128, InsightArenaError> {
        liquidity::swap_outcome(
            &env,
            trader,
            market_id,
            from_outcome,
            to_outcome,
            amount_in,
            min_amount_out,
        )
    }

    /// Get current price of an outcome in the pool
    pub fn get_outcome_price(
        env: Env,
        market_id: u64,
        outcome: Symbol,
    ) -> Result<i128, InsightArenaError> {
        liquidity::get_outcome_price(&env, market_id, outcome)
    }

    /// Get LP position for a provider
    pub fn get_lp_position(
        env: Env,
        provider: Address,
        market_id: u64,
    ) -> Result<crate::storage_types::LPPosition, InsightArenaError> {
        liquidity::get_lp_position_public(&env, provider, market_id)
    }

    /// Get all active LP positions for a market.
    pub fn get_all_lp_providers(env: Env, market_id: u64) -> Vec<crate::storage_types::LPPosition> {
        liquidity::get_all_lp_providers(&env, market_id)
    }

    /// Extends analytics to expose 24-hour pool trading volume.
    pub fn get_pool_volume_24h(env: Env, market_id: u64) -> i128 {
        liquidity::get_pool_volume_24h(&env, market_id)
    }

    /// Extends analytics to expose full swap history of the pool.
    pub fn get_swap_history(env: Env, market_id: u64) -> Vec<SwapRecord> {
        liquidity::get_swap_history(&env, market_id)
    }

    /// Withdraw accumulated trading fees earned by a liquidity provider.
    pub fn collect_lp_fees(
        env: Env,
        provider: Address,
        market_id: u64,
    ) -> Result<i128, InsightArenaError> {
        liquidity::collect_lp_fees(&env, provider, market_id)
    }

    /// Compute the time-weighted average price of `outcome` over the trailing
    /// `window` seconds. See `liquidity::TWAP_RING_BUFFER_CAPACITY` for the
    /// maximum window the ring buffer can currently honor.
    pub fn get_twap(
        env: Env,
        market_id: u64,
        outcome: Symbol,
        window: u64,
    ) -> Result<i128, InsightArenaError> {
        liquidity::get_twap(&env, market_id, outcome, window)
    }

    // ── Dynamic Swap Fee ──────────────────────────────────────────────────────

    /// Return the current dynamic fee tier and effective swap fee for a market.
    pub fn get_market_fee_info(
        env: Env,
        market_id: u64,
    ) -> Result<crate::storage_types::MarketFeeInfo, InsightArenaError> {
        liquidity::get_market_fee_info(&env, market_id)
    }

    /// Return the current admin-configured volatility fee tier schedule.
    pub fn get_fee_tier_config(env: Env) -> crate::storage_types::FeeTierConfig {
        liquidity::get_fee_tier_config(&env)
    }

    /// Update the volatility fee tier schedule. Caller must be the platform admin.
    pub fn update_fee_tier_config(
        env: Env,
        admin: Address,
        new_config: crate::storage_types::FeeTierConfig,
    ) -> Result<(), InsightArenaError> {
        liquidity::set_fee_tier_config(&env, admin, new_config)
    }
}
