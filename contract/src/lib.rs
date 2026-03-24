#![no_std]

pub mod config;
pub mod errors;
pub mod market;
pub mod storage_types;

pub use crate::config::Config;
pub use crate::errors::InsightArenaError;
pub use crate::market::CreateMarketParams;
pub use crate::storage_types::{DataKey, InviteCode, Market, Prediction, Season, UserProfile};

use soroban_sdk::{contract, contractimpl, Address, Env};

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
    ) -> Result<(), InsightArenaError> {
        config::initialize(&env, admin, oracle, fee_bps)
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

    // (a) Contract initialised and not paused → get_config (guarded) succeeds
    #[test]
    fn ensure_not_paused_ok_when_running() {
        let env = Env::default();
        env.mock_all_auths();
        let client = deploy(&env);
        let admin = Address::generate(&env);
        let oracle = Address::generate(&env);

        client.initialize(&admin, &oracle, &200_u32);

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

        client.initialize(&admin, &oracle, &200_u32);
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

        client.initialize(&admin, &oracle, &200_u32);
        client.set_paused(&true);
        client.set_paused(&false);

        // Must succeed after resuming
        client.get_config();
    }
}
