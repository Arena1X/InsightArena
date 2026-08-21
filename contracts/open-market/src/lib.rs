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
    ArbiterAssignment, ArbiterTally, BatchPredictionRequest,
    ConditionalChain, ConditionalMarket, CreatorLeaderboardEntry, CreatorStats, DataKey,
    DependencyStatus, Dispute, Event, EventMatch, EventPrediction, FeeTier, FeeTierConfig,
    InviteCode, InviteCodeInfo, LPPosition, LeaderboardEntry, LeaderboardSnapshot, LiquidityPool,
    Market, MarketFeeInfo, MarketStats, OracleSubmission, PlatformStats, Prediction,
    PriceAccumulator, PriceObservation, Season, SwapRecord, UserProfile, VestingSchedule,
    VolatilityState, Winner,
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

    /// Pause or resume the contract. Only the stored **guardian** may pause
    /// (`paused = true`); only the stored **admin** may unpause
    /// (`paused = false`) — a deliberate separation of duties so no single
    /// role can both trigger and clear an emergency halt.
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

    /// Update the number of ledgers a market's TTL is extended by on each
    /// interaction and via `extend_market_ttl`. Caller must be the current admin.
    pub fn set_market_ttl_extension(
        env: Env,
        admin: Address,
        new_extension: u32,
    ) -> Result<(), InsightArenaError> {
        config::set_market_ttl_extension(&env, admin, new_extension)
    }

    /// Update the global per-prediction min/max stake bounds.
    /// Caller must be the current admin. Reverts when `min_stake > max_stake`
    /// or when either bound is non-positive.
    pub fn set_stake_bounds(
        env: Env,
        admin: Address,
        min_stake: i128,
        max_stake: i128,
    ) -> Result<(), InsightArenaError> {
        config::set_stake_bounds(&env, admin, min_stake, max_stake)
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

    /// Return the immutable off-chain metadata content hash stored at market creation.
    pub fn get_metadata_hash(
        env: Env,
        market_id: u64,
    ) -> Result<soroban_sdk::BytesN<32>, InsightArenaError> {
        market::get_metadata_hash(&env, market_id)
    }

    /// Return the total number of markets ever created (0 if none yet).
    pub fn get_market_count(env: Env) -> u64 {
        market::get_market_count(&env)
    }

    /// Permissionless TTL maintenance for an active market (Issue #1516).
    ///
    /// Callable by **anyone** with no authorization, so participants or keepers
    /// can keep a live market alive by extending the TTL on its hot keys — the
    /// market record, its escrow/liquidity pool, and its price accumulator —
    /// preventing them from being archived mid-lifecycle. Returns
    /// `MarketNotFound` if the market does not exist.
    pub fn bump_market_ttl(env: Env, market_id: u64) -> Result<(), InsightArenaError> {
        market::bump_market_ttl(&env, market_id)
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

    /// Explicitly extend a market's persistent-storage TTL by the configured
    /// extension amount. Permissionless maintenance entrypoint — anyone may
    /// call this to keep a long-running market's storage from expiring.
    pub fn extend_market_ttl(
        env: Env,
        caller: Address,
        market_id: u64,
    ) -> Result<(), InsightArenaError> {
        market::extend_market_ttl(&env, caller, market_id)
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

    /// Appeal an active dispute with an escalated bond.
    pub fn appeal_dispute(
        env: Env,
        appealer: Address,
        market_id: u64,
        appeal_bond: i128,
    ) -> Result<(), InsightArenaError> {
        dispute::appeal_dispute(env, appealer, market_id, appeal_bond)
    }

    /// Resolve an appeal (admin-only).
    pub fn resolve_appeal(
        env: Env,
        admin: Address,
        market_id: u64,
        uphold: bool,
    ) -> Result<(), InsightArenaError> {
        dispute::resolve_appeal(env, admin, market_id, uphold)
    }

    /// Enumerate all markets that currently have an active dispute.
    pub fn list_active_disputes(env: Env) -> Vec<u64> {
        dispute::list_active_disputes(&env)
    }

    /// Get the total count of currently open disputes.
    pub fn get_open_dispute_count(env: Env) -> u32 {
        dispute::get_open_dispute_count(&env)
    }

    // ── Weighted arbiter quorum voting ───────────────────────────────────────

    /// Deposit a bond making `arbiter` eligible for panel assignment via
    /// `assign_arbiters`. Cumulative; no withdrawal path in this iteration.
    pub fn stake_as_arbiter(env: Env, arbiter: Address, amount: i128) -> Result<(), InsightArenaError> {
        dispute::stake_as_arbiter(env, arbiter, amount)
    }

    /// Return `arbiter`'s current staked bond (stroops). `0` if never staked.
    pub fn get_arbiter_stake(env: Env, arbiter: Address) -> i128 {
        dispute::get_arbiter_stake(&env, &arbiter)
    }

    /// Assign a weighted arbiter panel to a pending dispute (admin-only).
    /// Each address must have a positive arbiter stake; weight is snapshotted
    /// at assignment time from stake and current reputation.
    pub fn assign_arbiters(
        env: Env,
        admin: Address,
        market_id: u64,
        arbiters: Vec<Address>,
    ) -> Result<(), InsightArenaError> {
        dispute::assign_arbiters(env, admin, market_id, arbiters)
    }

    /// Cast a single vote as an assigned arbiter on a dispute.
    pub fn cast_arbiter_vote(
        env: Env,
        arbiter: Address,
        market_id: u64,
        uphold: bool,
    ) -> Result<(), InsightArenaError> {
        dispute::cast_arbiter_vote(env, arbiter, market_id, uphold)
    }

    /// Read-only tally, quorum progress, and per-arbiter participation for a
    /// dispute's arbiter panel.
    pub fn get_arbiter_tally(
        env: Env,
        market_id: u64,
    ) -> Result<crate::storage_types::ArbiterTally, InsightArenaError> {
        dispute::get_arbiter_tally(env, market_id)
    }

    /// Finalize a dispute's arbiter panel (admin-only): requires the voting
    /// window closed and quorum met, slashes non-voters and redistributes to
    /// voters, then settles the dispute per the vote outcome.
    pub fn finalize_arbiter_vote(
        env: Env,
        caller: Address,
        market_id: u64,
    ) -> Result<(), InsightArenaError> {
        dispute::finalize_arbiter_vote(env, caller, market_id)
    }

    /// Update the arbiter quorum threshold, slash share, and voting period
    /// (admin-only). Only affects panels assigned after this call.
    pub fn set_arbiter_config(
        env: Env,
        admin: Address,
        quorum_bps: u32,
        slash_bps: u32,
        voting_period_seconds: u64,
    ) -> Result<(), InsightArenaError> {
        config::set_arbiter_config(&env, admin, quorum_bps, slash_bps, voting_period_seconds)
    }

    // ── Oracle Submission Staking ────────────────────────────────────────────

    /// Submit a market resolution backed by a mandatory locked oracle stake
    /// (`Config::oracle_stake_amount`). Reverts if the oracle cannot cover
    /// the stake. The stake is held through the market's dispute window and
    /// settled via `resolve_dispute` / `finalize_arbiter_vote` (if disputed)
    /// or `claim_oracle_stake` (if never disputed).
    pub fn submit_resolution_with_stake(
        env: Env,
        oracle: Address,
        market_id: u64,
        resolved_outcome: Symbol,
    ) -> Result<(), InsightArenaError> {
        dispute::submit_resolution_with_stake(env, oracle, market_id, resolved_outcome)
    }

    /// Claim a staked oracle submission's stake plus reward once the
    /// market's dispute window has elapsed with no dispute ever filed.
    /// Permissionless: the payout always goes to the recorded oracle, not
    /// the caller.
    pub fn claim_oracle_stake(env: Env, market_id: u64) -> Result<(), InsightArenaError> {
        dispute::claim_oracle_stake(env, market_id)
    }

    /// Read-only lookup of a market's staked oracle submission, if any.
    pub fn get_oracle_submission(
        env: Env,
        market_id: u64,
    ) -> Option<crate::storage_types::OracleSubmission> {
        dispute::get_oracle_submission_info(env, market_id)
    }

    /// Update the required oracle submission stake and the reward (bps of
    /// stake) paid when a submission stands. Caller must be the current admin.
    pub fn set_oracle_stake_config(
        env: Env,
        admin: Address,
        stake_amount: i128,
        reward_bps: u32,
    ) -> Result<(), InsightArenaError> {
        config::set_oracle_stake_config(&env, admin, stake_amount, reward_bps)
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

    /// Submit a prediction using a pre-approved token allowance (transfer_from).
    pub fn submit_prediction_via_allowance(
        env: Env,
        predictor: Address,
        market_id: u64,
        chosen_outcome: Symbol,
        stake_amount: i128,
    ) -> Result<(), InsightArenaError> {
        prediction::submit_prediction_via_allowance(&env, predictor, market_id, chosen_outcome, stake_amount)
    }

    /// Commit to a prediction with a hash (outcome + amount + salt).
    pub fn commit_prediction(
        env: Env,
        predictor: Address,
        market_id: u64,
        commitment_hash: soroban_sdk::BytesN<32>,
        reveal_delay_seconds: u64,
    ) -> Result<(), InsightArenaError> {
        prediction::commit_prediction(&env, predictor, market_id, commitment_hash, reveal_delay_seconds)
    }

    /// Reveal a committed prediction and lock funds.
    pub fn reveal_prediction(
        env: Env,
        predictor: Address,
        market_id: u64,
        chosen_outcome: Symbol,
        stake_amount: i128,
        salt: Vec<soroban_sdk::Val>,
    ) -> Result<(), InsightArenaError> {
        prediction::reveal_prediction(&env, predictor, market_id, chosen_outcome, stake_amount, salt)
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

    /// Withdraw part of an open position before market lock time.
    ///
    /// Allows a predictor to reduce exposure if conviction changes, improving
    /// capital efficiency. An early-exit fee is deducted and redistributed
    /// pro-rata to remaining participants.
    ///
    /// # Arguments
    /// - `predictor`: Address withdrawing the position (must authorize)
    /// - `market_id`: The market ID
    /// - `withdrawal_amount`: Amount to withdraw (stroops)
    ///
    /// # Returns
    /// - `(refund_amount, fee_amount)`: Tuple of (amount to be refunded, fee deducted)
    ///   where `refund_amount + fee_amount = withdrawal_amount`
    ///
    /// # Errors
    /// - `WithdrawalAfterLockTime`: Attempted withdrawal after market.end_time
    /// - `InvalidWithdrawalAmount`: Amount is zero or negative
    /// - `WithdrawalExceedsStake`: Attempting to withdraw more than current stake
    /// - `MarketNotFound`, `PredictionNotFound`: Market or position doesn't exist
    /// - `MarketAlreadyResolved`, `MarketAlreadyCancelled`: Market state doesn't allow withdrawal
    pub fn withdraw_position(
        env: Env,
        predictor: Address,
        market_id: u64,
        withdrawal_amount: i128,
    ) -> Result<(i128, i128), InsightArenaError> {
        prediction::withdraw_position(&env, predictor, market_id, withdrawal_amount)
    }

    /// Estimate early-exit fee and refund for a given withdrawal amount.
    /// Pure view function; does not modify state.
    ///
    /// Returns `(refund_amount, fee_amount)` where fee is calculated from the
    /// current `Config::early_exit_fee_bps`.
    pub fn get_early_exit_fee_estimate(
        env: Env,
        withdrawal_amount: i128,
    ) -> Result<(i128, i128), InsightArenaError> {
        prediction::get_early_exit_fee_estimate(&env, withdrawal_amount)
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

    /// Update the governance proposal quorum threshold (bps of total registered
    /// users that must participate for a proposal to pass). Caller must be the
    /// current admin. For the timelocked governance path, use
    /// `ProposalType::UpdateQuorum` via `create_proposal`.
    ///
    /// # Errors
    /// - `Unauthorized` if `admin` is not the stored admin.
    /// - `InvalidInput` if `new_quorum_bps > 10_000`.
    pub fn set_governance_quorum_bps(
        env: Env,
        admin: Address,
        new_quorum_bps: u32,
    ) -> Result<(), InsightArenaError> {
        config::set_governance_quorum_bps(&env, admin, new_quorum_bps)
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

    /// Update the protocol treasury address and the split (bps) of the
    /// protocol's fee cut between the treasury and liquidity providers.
    /// Caller must be the current admin. Reverts with `InvalidFee` if
    /// `treasury_split_bps + lp_split_bps != 10_000`. See
    /// `liquidity::swap_outcome` for where the split is applied and its
    /// `(fee, split)` event emitted.
    pub fn set_treasury_split(
        env: Env,
        admin: Address,
        treasury_address: Address,
        treasury_split_bps: u32,
        lp_split_bps: u32,
    ) -> Result<(), InsightArenaError> {
        config::set_treasury_split(
            &env,
            admin,
            treasury_address,
            treasury_split_bps,
            lp_split_bps,
        )
    }

    // ── Slashed-funds insurance pool ─────────────────────────────────────────

    /// Update the share (bps) of every slashed bond routed into the
    /// insurance pool. Caller must be the current admin.
    pub fn set_insurance_pool_share_bps(
        env: Env,
        admin: Address,
        new_share_bps: u32,
    ) -> Result<(), InsightArenaError> {
        config::set_insurance_pool_share_bps(&env, admin, new_share_bps)
    }

    /// Draw `amount` from the insurance pool to `to`, to cover a documented
    /// accounting/settlement shortfall. Caller must be the current admin.
    pub fn draw_insurance_pool(
        env: Env,
        admin: Address,
        to: Address,
        amount: i128,
    ) -> Result<(), InsightArenaError> {
        escrow::draw_insurance_pool(env, admin, to, amount)
    }

    /// Return the current insurance pool balance (stroops).
    pub fn get_insurance_pool_balance(env: Env) -> i128 {
        escrow::get_insurance_pool_balance(&env)
    }

    /// Return the cumulative total ever paid out of the insurance pool.
    pub fn get_insurance_pool_payouts_total(env: Env) -> i128 {
        escrow::get_insurance_pool_payouts_total(&env)
    }

    // ── Per-outcome liquidity caps ────────────────────────────────────────────

    /// Update the global maximum liquidity a single outcome's AMM reserve
    /// may hold (`0` = unlimited). Caller must be the current admin.
    pub fn set_max_liquidity_per_outcome(
        env: Env,
        admin: Address,
        new_cap: i128,
    ) -> Result<(), InsightArenaError> {
        config::set_max_liquidity_per_outcome(&env, admin, new_cap)
    }

    /// Update the global maximum number of outcomes allowed per market.
    /// Caller must be the current admin.
    pub fn set_max_outcomes(
        env: Env,
        admin: Address,
        new_max: u32,
    ) -> Result<(), InsightArenaError> {
        config::set_max_outcomes(&env, admin, new_max)
    }

    /// Update the early-exit fee rate (bps) applied to partial position withdrawals.
    /// Caller must be the current admin. Default is 500 bps (5%).
    ///
    /// The fee is deducted from withdrawal amounts and redistributed pro-rata
    /// to remaining participants, improving liquidity for those who stay.
    pub fn set_early_exit_fee_bps(
        env: Env,
        admin: Address,
        new_fee_bps: u32,
    ) -> Result<(), InsightArenaError> {
        config::set_early_exit_fee_bps(&env, admin, new_fee_bps)
    }

    /// Set a per-market override for the maximum liquidity a single
    /// outcome's AMM reserve may hold (`0` clears the override). Caller
    /// must be the current admin.
    pub fn set_market_liquidity_cap(
        env: Env,
        admin: Address,
        market_id: u64,
        cap: i128,
    ) -> Result<(), InsightArenaError> {
        market::set_market_liquidity_cap(&env, admin, market_id, cap)
    }

    /// Return the remaining liquidity capacity for `outcome` in `market_id`,
    /// or `None` if no cap applies (unlimited).
    pub fn get_remaining_outcome_capacity(
        env: Env,
        market_id: u64,
        outcome: Symbol,
    ) -> Result<Option<i128>, InsightArenaError> {
        liquidity::get_remaining_outcome_capacity(&env, market_id, outcome)
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

    /// Return an invite code's remaining redemption budget (uses left before
    /// `max_uses`) and its expiry. Read-only; does not mutate storage.
    pub fn get_invite_code_info(
        env: Env,
        code: Symbol,
    ) -> Result<crate::storage_types::InviteCodeInfo, InsightArenaError> {
        invite::get_invite_code_info(&env, code)
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

    // ── Season Reward Vesting ─────────────────────────────────────────────────

    /// Claim every currently-unlocked, not-yet-claimed tranche of the
    /// caller's season reward. Returns the amount transferred (`0` if
    /// nothing new has unlocked since the last claim).
    pub fn claim_vested_reward(
        env: Env,
        user: Address,
        season_id: u32,
    ) -> Result<i128, InsightArenaError> {
        season::claim_vested_reward(&env, user, season_id)
    }

    /// Return the vesting schedule for `user` in `season_id`: total awarded,
    /// tranche layout, and claimed-vs-unclaimed progress.
    pub fn get_vesting_schedule(
        env: Env,
        season_id: u32,
        user: Address,
    ) -> Result<crate::storage_types::VestingSchedule, InsightArenaError> {
        season::get_vesting_schedule(&env, season_id, user)
    }

    /// Update the number and spacing of tranches used to vest season
    /// rewards. Caller must be the current admin. Only affects schedules
    /// created by `finalize_season` calls made after this update.
    pub fn set_vesting_config(
        env: Env,
        admin: Address,
        tranche_count: u32,
        interval_seconds: u64,
    ) -> Result<(), InsightArenaError> {
        config::set_vesting_config(&env, admin, tranche_count, interval_seconds)
    }

    /// Season points for `user` in `season_id` (snapshot if finalized, else live profile when applicable).
    /// Returns `0` for unknown users. Never panics.
    pub fn get_user_season_points(env: Env, user: Address, season_id: u32) -> u32 {
        season::get_user_season_points(&env, user, season_id)
    }

    /// Set the market-creation anti-spam bond amount (stroops). A value of `0`
    /// disables the bond requirement. Caller must be the stored admin.
    ///
    /// When `bond_amount > 0`, callers must pre-approve the contract address for
    /// at least `bond_amount` via the XLM token contract before calling
    /// `create_market`.
    ///
    /// # Errors
    /// - `Unauthorized` if `admin` is not the stored admin.
    /// - `InvalidInput` if `new_bond_amount` is negative.
    pub fn set_bond_amount(
        env: Env,
        admin: Address,
        new_bond_amount: i128,
    ) -> Result<(), InsightArenaError> {
        config::set_bond_amount(&env, admin, new_bond_amount)
    }

    /// Return the bond amount currently held in escrow for `market_id`.
    /// Returns `0` if no bond was deposited (bond disabled at creation time
    /// or bond already settled by resolution/cancellation).
    pub fn get_market_bond(env: Env, market_id: u64) -> i128 {
        escrow::get_market_bond(&env, market_id)
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

    /// Return the current impermanent loss (bps, always `<= 0`) for an open LP
    /// position, computed live against the pool's current reserves relative to
    /// the position's immutable entry-price snapshot. See
    /// `liquidity::calculate_impermanent_loss_bps` for the formula and
    /// `liquidity::get_position_il` for how it differs from the
    /// `LPPosition::cumulative_il_bps` field (which only reflects the last
    /// withdrawal).
    pub fn get_position_il(
        env: Env,
        provider: Address,
        market_id: u64,
    ) -> Result<i128, InsightArenaError> {
        liquidity::get_position_il(&env, provider, market_id)
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

    // ── Volume-Based Fee Tiers (#1326) ──────────────────────────────────────────

    /// Return the current volume-based fee tier schedule.
    pub fn get_volume_fee_config(env: Env) -> crate::storage_types::VolumeFeeConfig {
        config::get_volume_fee_config(&env)
    }

    /// Update the volume-based fee tier schedule. Caller must be the platform admin.
    pub fn update_volume_fee_config(
        env: Env,
        admin: Address,
        new_config: crate::storage_types::VolumeFeeConfig,
    ) -> Result<(), InsightArenaError> {
        config::set_volume_fee_config(&env, admin, new_config)
    }
}
