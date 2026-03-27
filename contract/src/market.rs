use soroban_sdk::{contracttype, symbol_short, Address, Env, String, Symbol, Vec};

use crate::config::{self, PERSISTENT_BUMP, PERSISTENT_THRESHOLD};
use crate::errors::InsightArenaError;
use crate::escrow;
use crate::storage_types::{DataKey, Market, Prediction};
use crate::ttl;

// ── Params struct ─────────────────────────────────────────────────────────────
// Soroban limits contract functions to 10 parameters. Bundling the market
// creation fields into a single `#[contracttype]` struct keeps the ABI legal
// while preserving full type-safety for every individual field.

#[contracttype]
#[derive(Clone, Debug)]
pub struct CreateMarketParams {
    pub title: String,
    pub description: String,
    pub category: Symbol,
    pub outcomes: Vec<Symbol>,
    pub end_time: u64,
    pub resolution_time: u64,
    pub creator_fee_bps: u32,
    pub min_stake: i128,
    pub max_stake: i128,
    pub is_public: bool,
}

// ── TTL helpers ───────────────────────────────────────────────────────────────

fn bump_market(env: &Env, market_id: u64) {
    ttl::extend_market_ttl(env, market_id);
}

fn bump_counter(env: &Env) {
    env.storage().persistent().extend_ttl(
        &DataKey::MarketCount,
        PERSISTENT_THRESHOLD,
        PERSISTENT_BUMP,
    );
}

// ── Counter helpers ───────────────────────────────────────────────────────────

fn load_market_count(env: &Env) -> u64 {
    env.storage()
        .persistent()
        .get(&DataKey::MarketCount)
        .unwrap_or(0u64)
}

fn next_market_id(env: &Env) -> Result<u64, InsightArenaError> {
    let count = load_market_count(env);
    let next = count.checked_add(1).ok_or(InsightArenaError::Overflow)?;
    env.storage().persistent().set(&DataKey::MarketCount, &next);
    bump_counter(env);
    Ok(next)
}

// ── Event emission ────────────────────────────────────────────────────────────

fn emit_market_created(env: &Env, market_id: u64, creator: &Address, end_time: u64) {
    env.events().publish(
        (symbol_short!("mkt"), symbol_short!("created")),
        (market_id, creator.clone(), end_time),
    );
}

fn emit_market_closed(env: &Env, market_id: u64, caller: &Address) {
    env.events().publish(
        (symbol_short!("mkt"), symbol_short!("closed")),
        (market_id, caller.clone()),
    );
}

fn emit_market_cancelled(env: &Env, market_id: u64, caller: &Address) {
    env.events().publish(
        (symbol_short!("mkt"), symbol_short!("canceld")),
        (market_id, caller.clone()),
    );
}

pub fn emit_market_resolved(env: &Env, market_id: u64, resolved_outcome: Symbol) {
    env.events().publish(
        (symbol_short!("mkt"), symbol_short!("reslvd")),
        (market_id, resolved_outcome),
    );
}

// ── Entry-point logic ─────────────────────────────────────────────────────────

/// Create a new prediction market and return its auto-assigned `market_id`.
///
/// Validation order:
/// 1. Platform not paused
/// 2. Creator authorisation via `require_auth()`
/// 3. `end_time` must be strictly after the current ledger timestamp
/// 4. `resolution_time` must be >= `end_time`
/// 5. At least two distinct outcomes required
/// 6. `creator_fee_bps` must not exceed the platform cap
/// 7. `min_stake` >= platform minimum; `max_stake` >= `min_stake`
pub fn create_market(
    env: &Env,
    creator: Address,
    params: CreateMarketParams,
) -> Result<u64, InsightArenaError> {
    // ── Guard 1: platform not paused ─────────────────────────────────────────
    config::ensure_not_paused(env)?;

    // ── Guard 2: creator authorisation ───────────────────────────────────────
    creator.require_auth();

    // ── Guard 3: end_time must be in the future ───────────────────────────────
    let now = env.ledger().timestamp();
    if params.end_time <= now {
        return Err(InsightArenaError::InvalidTimeRange);
    }

    // ── Guard 4: resolution_time must be at or after end_time ────────────────
    if params.resolution_time < params.end_time {
        return Err(InsightArenaError::InvalidTimeRange);
    }

    // ── Guard 5: at least two outcomes required ───────────────────────────────
    if params.outcomes.len() < 2 {
        return Err(InsightArenaError::InvalidInput);
    }

    // ── Load config for fee and stake floor checks ────────────────────────────
    let cfg = config::get_config(env)?;

    // ── Guard 6: creator fee must not exceed the platform cap ─────────────────
    if params.creator_fee_bps > cfg.max_creator_fee_bps {
        return Err(InsightArenaError::InvalidFee);
    }

    // ── Guard 7: stake bounds ─────────────────────────────────────────────────
    if params.min_stake < cfg.min_stake_xlm {
        return Err(InsightArenaError::StakeTooLow);
    }
    if params.max_stake < params.min_stake {
        return Err(InsightArenaError::InvalidInput);
    }

    // ── Atomically assign a new market ID ────────────────────────────────────
    let market_id = next_market_id(env)?;

    // ── Construct and persist the market ─────────────────────────────────────
    let market = Market::new(
        market_id,
        creator.clone(),
        params.title,
        params.description,
        params.category,
        params.outcomes,
        now, // start_time = creation ledger timestamp
        params.end_time,
        params.resolution_time,
        params.is_public,
        params.creator_fee_bps,
        params.min_stake,
        params.max_stake,
    );

    env.storage()
        .persistent()
        .set(&DataKey::Market(market_id), &market);
    bump_market(env, market_id);

    // ── Emit MarketCreated event ──────────────────────────────────────────────
    emit_market_created(env, market_id, &creator, params.end_time);

    Ok(market_id)
}

/// Load a single market by ID. Returns `MarketNotFound` if absent.
pub fn get_market(env: &Env, market_id: u64) -> Result<Market, InsightArenaError> {
    let market = env
        .storage()
        .persistent()
        .get(&DataKey::Market(market_id))
        .ok_or(InsightArenaError::MarketNotFound)?;
    bump_market(env, market_id);
    Ok(market)
}

/// Return the total number of markets ever created (0 before any are made).
/// Extends the counter TTL on every call.
pub fn get_market_count(env: &Env) -> u64 {
    let count = load_market_count(env);
    // Only bump when the key actually exists — extend_ttl panics on missing keys.
    if env.storage().persistent().has(&DataKey::MarketCount) {
        bump_counter(env);
    }
    count
}

/// Return a paginated slice of markets in creation order.
///
/// - `start` is the 1-based market ID to begin from (inclusive).
/// - `limit` is capped at 50 to bound simulation cost.
/// - Markets that have been deleted from storage are silently skipped.
/// - Returns an empty `Vec` when `start` exceeds the current market count.
pub fn list_markets(env: &Env, start: u64, limit: u32) -> Vec<Market> {
    const MAX_LIMIT: u32 = 50;
    let effective_limit = if limit > MAX_LIMIT { MAX_LIMIT } else { limit };

    let total = get_market_count(env);
    let mut result: Vec<Market> = Vec::new(env);

    if start == 0 || start > total || effective_limit == 0 {
        return result;
    }

    let mut collected: u32 = 0;
    let mut id = start;

    while id <= total && collected < effective_limit {
        if let Some(market) = env
            .storage()
            .persistent()
            .get::<DataKey, Market>(&DataKey::Market(id))
        {
            bump_market(env, id);
            result.push_back(market);
            collected += 1;
        }
        id += 1;
    }

    result
}

/// Transition a market into the "closed" state, blocking any further predictions.
///
/// Validation order:
/// 1. Market exists
/// 2. `current_time >= market.end_time` — reverts with `MarketStillOpen` if not
/// 3. `market.is_resolved == false` — reverts with `MarketAlreadyResolved` if already resolved
/// 4. `caller` must be the platform admin or the oracle address — reverts with `Unauthorized`
///
/// On success the market's `is_closed` flag is set to `true`, the record is
/// re-saved to persistent storage, and a `MarketClosed` event is emitted.
pub fn close_market(env: &Env, caller: Address, market_id: u64) -> Result<(), InsightArenaError> {
    // ── Guard 1: market must exist ────────────────────────────────────────────
    let mut market = get_market(env, market_id)?;

    // ── Guard 2: end_time must have passed ────────────────────────────────────
    let now = env.ledger().timestamp();
    if now < market.end_time {
        return Err(InsightArenaError::MarketStillOpen);
    }

    // ── Guard 3: market must not already be resolved ──────────────────────────
    if market.is_resolved {
        return Err(InsightArenaError::MarketAlreadyResolved);
    }

    // ── Guard 4: caller must be admin or oracle ────────────────────────────────
    caller.require_auth();
    let cfg = config::get_config(env)?;
    if caller != cfg.admin && caller != cfg.oracle_address {
        return Err(InsightArenaError::Unauthorized);
    }

    // ── Update status and persist ─────────────────────────────────────────────
    market.is_closed = true;
    env.storage()
        .persistent()
        .set(&DataKey::Market(market_id), &market);
    bump_market(env, market_id);

    // ── Emit MarketClosed event ───────────────────────────────────────────────
    emit_market_closed(env, market_id, &caller);

    Ok(())
}

/// Cancel a market that could not be resolved (oracle failure, creator error, etc.).
///
/// Upon cancellation every predictor's full stake is refunded via the escrow
/// module. No payouts or fees are processed.
///
/// Validation order:
/// 1. Market exists
/// 2. Market has not already been resolved
/// 3. Market has not already been cancelled
/// 4. `caller` must be the platform admin
///
/// On success:
/// - `market.is_cancelled` is set to `true` and persisted.
/// - All entries in `PredictorList(market_id)` are iterated; for each, the
///   corresponding `Prediction` record is loaded and `escrow::refund` is called.
/// - A `MarketCancelled` event is emitted.
pub fn cancel_market(env: &Env, caller: Address, market_id: u64) -> Result<(), InsightArenaError> {
    // ── Guard 1: market must exist ────────────────────────────────────────────
    let mut market = get_market(env, market_id)?;

    // ── Guard 2: market must not already be resolved ──────────────────────────
    if market.is_resolved {
        return Err(InsightArenaError::MarketAlreadyResolved);
    }

    // ── Guard 3: market must not already be cancelled ─────────────────────────
    if market.is_cancelled {
        return Err(InsightArenaError::MarketAlreadyCancelled);
    }

    // ── Guard 4: only the platform admin may cancel ───────────────────────────
    caller.require_auth();
    let cfg = config::get_config(env)?;
    if caller != cfg.admin {
        return Err(InsightArenaError::Unauthorized);
    }

    // ── Mark market as cancelled and persist ──────────────────────────────────
    market.is_cancelled = true;
    env.storage()
        .persistent()
        .set(&DataKey::Market(market_id), &market);
    bump_market(env, market_id);

    // ── Iterate all predictors and issue refunds ──────────────────────────────
    let predictors: Vec<Address> = env
        .storage()
        .persistent()
        .get(&DataKey::PredictorList(market_id))
        .unwrap_or_else(|| Vec::new(env));

    for predictor in predictors.iter() {
        let key = DataKey::Prediction(market_id, predictor.clone());
        if let Some(prediction) = env.storage().persistent().get::<DataKey, Prediction>(&key) {
            escrow::refund(env, &predictor, prediction.stake_amount)?;
        }
    }

    // ── Emit MarketCancelled event ────────────────────────────────────────────
    emit_market_cancelled(env, market_id, &caller);

    Ok(())
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod market_tests {
    use soroban_sdk::testutils::{Address as _, Ledger as _};
    use soroban_sdk::{symbol_short, vec, Address, Env, String};

    use crate::{InsightArenaContract, InsightArenaContractClient, InsightArenaError};

    use super::CreateMarketParams;

    /// Register a mock XLM token (Stellar Asset Contract) and return its address.
    fn register_token(env: &Env) -> Address {
        let token_admin = Address::generate(env);
        env.register_stellar_asset_contract_v2(token_admin)
            .address()
    }

    fn deploy(env: &Env) -> InsightArenaContractClient<'_> {
        let id = env.register(InsightArenaContract, ());
        let client = InsightArenaContractClient::new(env, &id);
        let admin = Address::generate(env);
        let oracle = Address::generate(env);
        let xlm_token = register_token(env);
        env.mock_all_auths();
        client.initialize(&admin, &oracle, &200_u32, &xlm_token);
        client
    }

    fn default_params(env: &Env) -> CreateMarketParams {
        let now = env.ledger().timestamp();
        CreateMarketParams {
            title: String::from_str(env, "Will it rain?"),
            description: String::from_str(env, "Daily weather market"),
            category: symbol_short!("weather"),
            outcomes: vec![env, symbol_short!("yes"), symbol_short!("no")],
            end_time: now + 1000,
            resolution_time: now + 2000,
            creator_fee_bps: 100,
            min_stake: 10_000_000,
            max_stake: 100_000_000,
            is_public: true,
        }
    }

    #[test]
    fn create_market_success_returns_incremented_id() {
        let env = Env::default();
        env.mock_all_auths();
        let client = deploy(&env);
        let creator = Address::generate(&env);

        let id = client.create_market(&creator, &default_params(&env));
        assert_eq!(id, 1);

        let id2 = client.create_market(&creator, &default_params(&env));
        assert_eq!(id2, 2);
    }

    #[test]
    fn create_market_fails_end_time_in_past() {
        let env = Env::default();
        env.mock_all_auths();
        let client = deploy(&env);
        let creator = Address::generate(&env);

        let mut p = default_params(&env);
        p.end_time = env.ledger().timestamp(); // not strictly after now

        let result = client.try_create_market(&creator, &p);
        assert!(matches!(
            result,
            Err(Ok(InsightArenaError::InvalidTimeRange))
        ));
    }

    #[test]
    fn create_market_fails_resolution_before_end() {
        let env = Env::default();
        env.mock_all_auths();
        let client = deploy(&env);
        let creator = Address::generate(&env);

        let mut p = default_params(&env);
        p.resolution_time = p.end_time - 1;

        let result = client.try_create_market(&creator, &p);
        assert!(matches!(
            result,
            Err(Ok(InsightArenaError::InvalidTimeRange))
        ));
    }

    #[test]
    fn create_market_fails_single_outcome() {
        let env = Env::default();
        env.mock_all_auths();
        let client = deploy(&env);
        let creator = Address::generate(&env);

        let mut p = default_params(&env);
        p.outcomes = vec![&env, symbol_short!("yes")];

        let result = client.try_create_market(&creator, &p);
        assert!(matches!(result, Err(Ok(InsightArenaError::InvalidInput))));
    }

    #[test]
    fn create_market_fails_fee_too_high() {
        let env = Env::default();
        env.mock_all_auths();
        let client = deploy(&env);
        let creator = Address::generate(&env);

        let mut p = default_params(&env);
        p.creator_fee_bps = 501; // exceeds 500 bps cap

        let result = client.try_create_market(&creator, &p);
        assert!(matches!(result, Err(Ok(InsightArenaError::InvalidFee))));
    }

    #[test]
    fn create_market_fails_when_paused() {
        let env = Env::default();
        env.mock_all_auths();
        let client = deploy(&env);
        let creator = Address::generate(&env);

        client.set_paused(&true);
        let result = client.try_create_market(&creator, &default_params(&env));
        assert!(matches!(result, Err(Ok(InsightArenaError::Paused))));
    }

    #[test]
    fn create_market_fails_stake_too_low() {
        let env = Env::default();
        env.mock_all_auths();
        let client = deploy(&env);
        let creator = Address::generate(&env);

        let mut p = default_params(&env);
        p.min_stake = 1; // below 10_000_000 stroops platform floor

        let result = client.try_create_market(&creator, &p);
        assert!(matches!(result, Err(Ok(InsightArenaError::StakeTooLow))));
    }

    // ── get_market ────────────────────────────────────────────────────────────

    #[test]
    fn get_market_returns_correct_market() {
        let env = Env::default();
        env.mock_all_auths();
        let client = deploy(&env);
        let creator = Address::generate(&env);

        let id = client.create_market(&creator, &default_params(&env));
        let market = client.get_market(&id);
        assert_eq!(market.market_id, id);
        assert_eq!(market.creator, creator);
    }

    #[test]
    fn get_market_returns_not_found_for_missing_id() {
        let env = Env::default();
        env.mock_all_auths();
        let client = deploy(&env);

        let result = client.try_get_market(&99_u64);
        assert!(matches!(result, Err(Ok(InsightArenaError::MarketNotFound))));
    }

    // ── get_market_count ──────────────────────────────────────────────────────

    #[test]
    fn get_market_count_zero_before_any_market() {
        let env = Env::default();
        env.mock_all_auths();
        let client = deploy(&env);

        assert_eq!(client.get_market_count(), 0);
    }

    #[test]
    fn get_market_count_increments_with_each_market() {
        let env = Env::default();
        env.mock_all_auths();
        let client = deploy(&env);
        let creator = Address::generate(&env);

        client.create_market(&creator, &default_params(&env));
        assert_eq!(client.get_market_count(), 1);

        client.create_market(&creator, &default_params(&env));
        assert_eq!(client.get_market_count(), 2);
    }

    // ── list_markets ──────────────────────────────────────────────────────────

    #[test]
    fn list_markets_empty_when_no_markets() {
        let env = Env::default();
        env.mock_all_auths();
        let client = deploy(&env);

        let list = client.list_markets(&1_u64, &10_u32);
        assert_eq!(list.len(), 0);
    }

    #[test]
    fn list_markets_returns_all_when_within_limit() {
        let env = Env::default();
        env.mock_all_auths();
        let client = deploy(&env);
        let creator = Address::generate(&env);

        for _ in 0..3 {
            client.create_market(&creator, &default_params(&env));
        }

        let list = client.list_markets(&1_u64, &10_u32);
        assert_eq!(list.len(), 3);
        assert_eq!(list.get(0).unwrap().market_id, 1);
        assert_eq!(list.get(2).unwrap().market_id, 3);
    }

    #[test]
    fn list_markets_respects_pagination_start() {
        let env = Env::default();
        env.mock_all_auths();
        let client = deploy(&env);
        let creator = Address::generate(&env);

        for _ in 0..5 {
            client.create_market(&creator, &default_params(&env));
        }

        // Start from market ID 3, take up to 10
        let list = client.list_markets(&3_u64, &10_u32);
        assert_eq!(list.len(), 3); // IDs 3, 4, 5
        assert_eq!(list.get(0).unwrap().market_id, 3);
    }

    #[test]
    fn list_markets_caps_at_max_limit_50() {
        let env = Env::default();
        env.mock_all_auths();
        let client = deploy(&env);
        let creator = Address::generate(&env);

        for _ in 0..60 {
            client.create_market(&creator, &default_params(&env));
        }

        let list = client.list_markets(&1_u64, &100_u32); // ask for 100, should get 50
        assert_eq!(list.len(), 50);
    }

    #[test]
    fn list_markets_empty_when_start_out_of_bounds() {
        let env = Env::default();
        env.mock_all_auths();
        let client = deploy(&env);
        let creator = Address::generate(&env);

        client.create_market(&creator, &default_params(&env));

        // start > total count → empty
        let list = client.list_markets(&99_u64, &10_u32);
        assert_eq!(list.len(), 0);
    }

    // ── close_market ──────────────────────────────────────────────────────────

    /// Helper: deploy a contract and return client together with pre-registered
    /// admin and oracle addresses (the same ones used during `initialize`).
    fn deploy_with_actors(env: &Env) -> (InsightArenaContractClient<'_>, Address, Address) {
        let id = env.register(InsightArenaContract, ());
        let client = InsightArenaContractClient::new(env, &id);
        let admin = Address::generate(env);
        let oracle = Address::generate(env);
        let xlm_token = register_token(env);
        env.mock_all_auths();
        client.initialize(&admin, &oracle, &200_u32, &xlm_token);
        (client, admin, oracle)
    }

    /// Helper: deploy contract, return client + admin + oracle + token address.
    fn deploy_with_token(env: &Env) -> (InsightArenaContractClient<'_>, Address, Address, Address) {
        let id = env.register(InsightArenaContract, ());
        let client = InsightArenaContractClient::new(env, &id);
        let admin = Address::generate(env);
        let oracle = Address::generate(env);
        let xlm_token = register_token(env);
        env.mock_all_auths();
        client.initialize(&admin, &oracle, &200_u32, &xlm_token);
        (client, admin, oracle, xlm_token)
    }

    // (a) close_market called before end_time → MarketStillOpen
    #[test]
    fn close_market_fails_before_end_time() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, _admin, oracle) = deploy_with_actors(&env);
        let creator = Address::generate(&env);

        // Market end_time is now + 1000; current timestamp is still "now"
        let id = client.create_market(&creator, &default_params(&env));

        let result = client.try_close_market(&oracle, &id);
        assert!(matches!(
            result,
            Err(Ok(InsightArenaError::MarketStillOpen))
        ));
    }

    // (b) close_market called after end_time by the oracle → success + is_closed == true
    #[test]
    fn close_market_success_by_oracle_after_end_time() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, _admin, oracle) = deploy_with_actors(&env);
        let creator = Address::generate(&env);

        let id = client.create_market(&creator, &default_params(&env));

        // Advance ledger time past end_time (now + 1000)
        env.ledger().set_timestamp(env.ledger().timestamp() + 1001);

        client.close_market(&oracle, &id);

        let market = client.get_market(&id);
        assert!(market.is_closed);
        assert!(!market.is_resolved);
    }

    // (b-alt) close_market called after end_time by the admin → success
    #[test]
    fn close_market_success_by_admin_after_end_time() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, admin, _oracle) = deploy_with_actors(&env);
        let creator = Address::generate(&env);

        let id = client.create_market(&creator, &default_params(&env));

        env.ledger().set_timestamp(env.ledger().timestamp() + 1001);

        client.close_market(&admin, &id);

        let market = client.get_market(&id);
        assert!(market.is_closed);
    }

    // (c) double-close attempt → MarketAlreadyResolved not triggered, but a
    //     second close on an already-closed (not yet resolved) market succeeds
    //     because is_resolved is still false; however once resolved it must fail.
    //     We test the resolved path: set is_resolved manually via a resolved market
    //     scenario by directly checking that a market flagged resolved returns the error.
    //
    //     Since we can only interact through the public ABI, we test the reachable
    //     path: close a market that has already been resolved (simulated by calling
    //     close twice — second call must still pass because is_resolved stays false
    //     until resolve_market is implemented).  Instead we verify that calling
    //     close on a non-existent market returns MarketNotFound, and that calling
    //     close on an already-closed-then-externally-resolved market returns
    //     MarketAlreadyResolved via direct storage manipulation in the test.
    #[test]
    fn close_market_fails_when_already_resolved() {
        use crate::storage_types::{DataKey, Market};

        let env = Env::default();
        env.mock_all_auths();
        let (client, _admin, oracle) = deploy_with_actors(&env);
        let creator = Address::generate(&env);

        let id = client.create_market(&creator, &default_params(&env));

        // Advance past end_time and close the market normally
        env.ledger().set_timestamp(env.ledger().timestamp() + 1001);
        client.close_market(&oracle, &id);

        // Simulate resolution by mutating the stored market directly using the
        // correct contract address from the deployed client.
        let contract_id = client.address.clone();
        let mut market: Market = env.as_contract(&contract_id, || {
            env.storage()
                .persistent()
                .get(&DataKey::Market(id))
                .unwrap()
        });
        market.is_resolved = true;
        env.as_contract(&contract_id, || {
            env.storage()
                .persistent()
                .set(&DataKey::Market(id), &market);
        });

        // Now try to close again — should fail with MarketAlreadyResolved
        let result = client.try_close_market(&oracle, &id);
        assert!(matches!(
            result,
            Err(Ok(InsightArenaError::MarketAlreadyResolved))
        ));
    }

    // ── cancel_market ─────────────────────────────────────────────────────────

    // (a) Non-admin caller → Unauthorized
    #[test]
    fn cancel_market_fails_for_non_admin() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, _admin, _oracle, _token) = deploy_with_token(&env);
        let creator = Address::generate(&env);
        let random = Address::generate(&env);

        let id = client.create_market(&creator, &default_params(&env));

        let result = client.try_cancel_market(&random, &id);
        assert!(matches!(result, Err(Ok(InsightArenaError::Unauthorized))));
    }

    // (b) Unknown market_id → MarketNotFound
    #[test]
    fn cancel_market_fails_market_not_found() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, admin, _oracle, _token) = deploy_with_token(&env);

        let result = client.try_cancel_market(&admin, &99_u64);
        assert!(matches!(result, Err(Ok(InsightArenaError::MarketNotFound))));
    }

    // (c) Already-resolved market → MarketAlreadyResolved
    #[test]
    fn cancel_market_fails_when_already_resolved() {
        use crate::storage_types::{DataKey, Market};

        let env = Env::default();
        env.mock_all_auths();
        let (client, admin, _oracle, _token) = deploy_with_token(&env);
        let creator = Address::generate(&env);

        let id = client.create_market(&creator, &default_params(&env));

        // Simulate resolution via direct storage mutation.
        let contract_id = client.address.clone();
        let mut market: Market = env.as_contract(&contract_id, || {
            env.storage()
                .persistent()
                .get(&DataKey::Market(id))
                .unwrap()
        });
        market.is_resolved = true;
        env.as_contract(&contract_id, || {
            env.storage()
                .persistent()
                .set(&DataKey::Market(id), &market);
        });

        let result = client.try_cancel_market(&admin, &id);
        assert!(matches!(
            result,
            Err(Ok(InsightArenaError::MarketAlreadyResolved))
        ));
    }

    // (d) Double-cancel → MarketAlreadyCancelled
    #[test]
    fn cancel_market_fails_when_already_cancelled() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, admin, _oracle, _token) = deploy_with_token(&env);
        let creator = Address::generate(&env);

        let id = client.create_market(&creator, &default_params(&env));
        client.cancel_market(&admin, &id); // first cancel succeeds

        let result = client.try_cancel_market(&admin, &id);
        assert!(matches!(
            result,
            Err(Ok(InsightArenaError::MarketAlreadyCancelled))
        ));
    }

    // (e) Successful cancel with no predictors → market.is_cancelled == true,
    //     MarketCancelled event emitted, no refund calls made.
    #[test]
    fn cancel_market_success_no_predictors() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, admin, _oracle, _token) = deploy_with_token(&env);
        let creator = Address::generate(&env);

        let id = client.create_market(&creator, &default_params(&env));
        client.cancel_market(&admin, &id);

        let market = client.get_market(&id);
        assert!(market.is_cancelled);
        assert!(!market.is_resolved);
    }

    // (f) Cancel with multiple predictors → all stakes refunded, balances restored.
    //
    // Because no `predict` function exists yet, predictions are seeded directly
    // into persistent storage (same technique as the close_market resolved test).
    // The contract escrow balance is pre-funded by minting tokens to the contract.
    #[test]
    fn cancel_market_refunds_all_predictors() {
        use crate::storage_types::{DataKey, Prediction};
        use soroban_sdk::token::{Client as TokenClient, StellarAssetClient};

        let env = Env::default();
        env.mock_all_auths();
        let (client, admin, _oracle, xlm_token) = deploy_with_token(&env);
        let creator = Address::generate(&env);

        let id = client.create_market(&creator, &default_params(&env));

        // Prepare two predictors with distinct stakes.
        let predictor_a = Address::generate(&env);
        let predictor_b = Address::generate(&env);
        let stake_a: i128 = 20_000_000; // 2 XLM
        let stake_b: i128 = 50_000_000; // 5 XLM

        let contract_id = client.address.clone();

        // Seed Prediction records and PredictorList directly into contract storage.
        env.as_contract(&contract_id, || {
            let pred_a = Prediction::new(
                id,
                predictor_a.clone(),
                symbol_short!("yes"),
                stake_a,
                env.ledger().timestamp(),
            );
            let pred_b = Prediction::new(
                id,
                predictor_b.clone(),
                symbol_short!("no"),
                stake_b,
                env.ledger().timestamp(),
            );

            env.storage()
                .persistent()
                .set(&DataKey::Prediction(id, predictor_a.clone()), &pred_a);
            env.storage()
                .persistent()
                .set(&DataKey::Prediction(id, predictor_b.clone()), &pred_b);

            let mut predictors = soroban_sdk::Vec::new(&env);
            predictors.push_back(predictor_a.clone());
            predictors.push_back(predictor_b.clone());
            env.storage()
                .persistent()
                .set(&DataKey::PredictorList(id), &predictors);
        });

        // Fund the contract escrow with the total staked amount.
        let total_staked = stake_a + stake_b;
        StellarAssetClient::new(&env, &xlm_token).mint(&contract_id, &total_staked);

        // Confirm predictors start with zero balance.
        let token_client = TokenClient::new(&env, &xlm_token);
        assert_eq!(token_client.balance(&predictor_a), 0);
        assert_eq!(token_client.balance(&predictor_b), 0);

        // Cancel the market.
        client.cancel_market(&admin, &id);

        // Every predictor must receive exactly their stake back.
        assert_eq!(token_client.balance(&predictor_a), stake_a);
        assert_eq!(token_client.balance(&predictor_b), stake_b);

        // Market must be flagged as cancelled.
        let market = client.get_market(&id);
        assert!(market.is_cancelled);
    }
}
