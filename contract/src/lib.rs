#![no_std]

pub mod config;
pub mod errors;
pub mod escrow;
pub mod market;
pub mod oracle;
pub mod prediction;
pub mod storage_types;

pub use crate::config::Config;
pub use crate::errors::InsightArenaError;
pub use crate::market::CreateMarketParams;
pub use crate::storage_types::{DataKey, InviteCode, Market, Prediction, Season, UserProfile};

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

    /// Return the total protocol fees accumulated in the treasury.
    /// Returns `0` if no fees have been collected yet. Never panics.
    pub fn get_treasury_balance(env: Env) -> i128 {
        escrow::get_treasury_balance(&env)
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
