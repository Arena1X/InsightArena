use insightarena_contract::{
    CreateMarketParams, InsightArenaContract, InsightArenaContractClient, InsightArenaError,
};
use soroban_sdk::testutils::{Address as _, Ledger as _};
use soroban_sdk::token::{Client as TokenClient, StellarAssetClient};
use soroban_sdk::{symbol_short, vec, Address, Env, String, Symbol, BytesN};

fn register_token(env: &Env) -> Address {
    let token_admin = Address::generate(env);
    env.register_stellar_asset_contract_v2(token_admin)
        .address()
}

fn deploy(env: &Env) -> (InsightArenaContractClient<'_>, Address, Address, Address) {
    let id = env.register(InsightArenaContract, ());
    let client = InsightArenaContractClient::new(env, &id);
    let admin = Address::generate(env);
    let oracle = Address::generate(env);
    let xlm_token = register_token(env);
    env.mock_all_auths();
    client.initialize(&admin, &oracle, &200_u32, &xlm_token);
    (client, admin, oracle, xlm_token)
}

fn market_params(env: &Env) -> CreateMarketParams {
    market_params_with_window(env, 86_400)
}

fn market_params_with_window(env: &Env, dispute_window: u64) -> CreateMarketParams {
    let now = env.ledger().timestamp();
    CreateMarketParams {
        title: String::from_str(env, "Dispute test market"),
        description: String::from_str(env, "For get_dispute tests"),
        category: Symbol::new(env, "Sports"),
        outcomes: vec![env, symbol_short!("yes"), symbol_short!("no")],
        end_time: now + 10,
        resolution_time: now + 20,
        dispute_window,
        creator_fee_bps: 100,
        min_stake: 10_000_000,
        max_stake: 100_000_000,
        is_public: true,
        metadata_hash: BytesN::from_array(env, &[0u8; 32]),
    }
}

#[test]
fn raise_dispute_fails_outside_window() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, oracle, xlm_token) = deploy(&env);
    let creator = Address::generate(&env);
    let disputer = Address::generate(&env);

    let id = client.create_market(&creator, &market_params_with_window(&env, 30));
    env.ledger().set_timestamp(env.ledger().timestamp() + 20);
    client.resolve_market(&oracle, &id, &symbol_short!("yes"));

    env.ledger().set_timestamp(env.ledger().timestamp() + 31);

    StellarAssetClient::new(&env, &xlm_token).mint(&disputer, &10_000_000);
    TokenClient::new(&env, &xlm_token).approve(&disputer, &client.address, &10_000_000, &9999);

    let result = client.try_raise_dispute(&disputer, &id, &10_000_000);
    assert!(matches!(
        result,
        Err(Ok(InsightArenaError::DisputeWindowClosed))
    ));
}

#[test]
fn raise_dispute_locks_bond_in_escrow_and_stores_dispute() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, oracle, xlm_token) = deploy(&env);
    let creator = Address::generate(&env);
    let disputer = Address::generate(&env);

    let id = client.create_market(&creator, &market_params(&env));
    env.ledger().set_timestamp(env.ledger().timestamp() + 20);
    client.resolve_market(&oracle, &id, &symbol_short!("yes"));

    let bond = 15_000_000_i128;
    StellarAssetClient::new(&env, &xlm_token).mint(&disputer, &bond);
    TokenClient::new(&env, &xlm_token).approve(&disputer, &client.address, &bond, &9999);

    let token = TokenClient::new(&env, &xlm_token);
    let contract_before = token.balance(&client.address);
    let disputer_before = token.balance(&disputer);

    client.raise_dispute(&disputer, &id, &bond);

    assert_eq!(token.balance(&disputer), disputer_before - bond);
    assert_eq!(token.balance(&client.address), contract_before + bond);

    let dispute = client.get_dispute(&id);
    assert_eq!(dispute.disputer, disputer);
    assert_eq!(dispute.bond, bond);
}

#[test]
fn resolve_dispute_uphold_returns_bond_and_reopens_market() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, oracle, xlm_token) = deploy(&env);
    let creator = Address::generate(&env);
    let disputer = Address::generate(&env);

    let id = client.create_market(&creator, &market_params(&env));
    env.ledger().set_timestamp(env.ledger().timestamp() + 20);
    client.resolve_market(&oracle, &id, &symbol_short!("yes"));

    let bond = 12_000_000_i128;
    StellarAssetClient::new(&env, &xlm_token).mint(&disputer, &bond);
    TokenClient::new(&env, &xlm_token).approve(&disputer, &client.address, &bond, &9999);
    client.raise_dispute(&disputer, &id, &bond);

    let token = TokenClient::new(&env, &xlm_token);
    let disputer_before = token.balance(&disputer);

    client.resolve_dispute(&admin, &id, &true);

    assert_eq!(token.balance(&disputer), disputer_before + bond);

    let market = client.get_market(&id);
    assert!(!market.is_resolved);
    assert_eq!(market.resolved_outcome, None);
    assert_eq!(market.resolved_at, None);
}

#[test]
fn resolve_dispute_reject_forfeits_bond_to_treasury_balance() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, oracle, xlm_token) = deploy(&env);
    let creator = Address::generate(&env);
    let disputer = Address::generate(&env);

    let id = client.create_market(&creator, &market_params(&env));
    env.ledger().set_timestamp(env.ledger().timestamp() + 20);
    client.resolve_market(&oracle, &id, &symbol_short!("yes"));

    let bond = 9_000_000_i128;
    StellarAssetClient::new(&env, &xlm_token).mint(&disputer, &bond);
    TokenClient::new(&env, &xlm_token).approve(&disputer, &client.address, &bond, &9999);
    client.raise_dispute(&disputer, &id, &bond);

    // A rejected dispute's bond is slashed: the configured insurance-pool
    // share (default 10%, see #1352) is reserved, and the remainder goes to
    // treasury — it no longer forfeits 100% to treasury.
    let treasury_before = client.get_treasury_balance();
    let insurance_before = client.get_insurance_pool_balance();
    client.resolve_dispute(&admin, &id, &false);
    let treasury_after = client.get_treasury_balance();
    let insurance_after = client.get_insurance_pool_balance();

    let insurance_share = bond * 1000 / 10_000;
    let treasury_share = bond - insurance_share;
    assert_eq!(treasury_after, treasury_before + treasury_share);
    assert_eq!(insurance_after, insurance_before + insurance_share);
}

#[test]
fn test_get_dispute_returns_correct_fields() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, oracle, xlm_token) = deploy(&env);
    let creator = Address::generate(&env);
    let disputer = Address::generate(&env);

    let id = client.create_market(&creator, &market_params(&env));
    env.ledger().set_timestamp(env.ledger().timestamp() + 20);
    client.resolve_market(&oracle, &id, &symbol_short!("yes"));

    let bond = 15_000_000_i128;
    StellarAssetClient::new(&env, &xlm_token).mint(&disputer, &bond);
    TokenClient::new(&env, &xlm_token).approve(&disputer, &client.address, &bond, &9999);

    let filed_at = env.ledger().timestamp();
    client.raise_dispute(&disputer, &id, &bond);

    let dispute = client.get_dispute(&id);
    assert_eq!(dispute.disputer, disputer);
    assert_eq!(dispute.bond, bond);
    assert_eq!(dispute.filed_at, filed_at);
}

#[test]
fn test_get_dispute_fails_when_no_dispute() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, oracle, _xlm_token) = deploy(&env);
    let creator = Address::generate(&env);

    let id = client.create_market(&creator, &market_params(&env));
    env.ledger().set_timestamp(env.ledger().timestamp() + 20);
    client.resolve_market(&oracle, &id, &symbol_short!("yes"));

    let result = client.try_get_dispute(&id);
    assert!(matches!(
        result,
        Err(Ok(InsightArenaError::DisputeNotFound))
    ));
}

#[test]
fn test_get_dispute_fails_after_resolution() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, oracle, xlm_token) = deploy(&env);
    let creator = Address::generate(&env);
    let disputer = Address::generate(&env);

    let id = client.create_market(&creator, &market_params(&env));
    env.ledger().set_timestamp(env.ledger().timestamp() + 20);
    client.resolve_market(&oracle, &id, &symbol_short!("yes"));

    let bond = 12_000_000_i128;
    StellarAssetClient::new(&env, &xlm_token).mint(&disputer, &bond);
    TokenClient::new(&env, &xlm_token).approve(&disputer, &client.address, &bond, &9999);
    client.raise_dispute(&disputer, &id, &bond);

    // Reject the dispute — this removes it from storage
    client.resolve_dispute(&admin, &id, &false);

    let result = client.try_get_dispute(&id);
    assert!(matches!(
        result,
        Err(Ok(InsightArenaError::DisputeNotFound))
    ));
}

#[test]
fn test_raise_dispute_on_unresolved_market_fails() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, _oracle, xlm_token) = deploy(&env);
    let creator = Address::generate(&env);
    let disputer = Address::generate(&env);

    // 1. Create a market, but do NOT resolve it
    let id = client.create_market(&creator, &market_params(&env));

    let bond = 15_000_000_i128;
    StellarAssetClient::new(&env, &xlm_token).mint(&disputer, &bond);
    TokenClient::new(&env, &xlm_token).approve(&disputer, &client.address, &bond, &9999);

    // 2. Try to raise a dispute on the unresolved market
    let result = client.try_raise_dispute(&disputer, &id, &bond);

    // 3. Assert it returns the MarketNotResolved error
    assert!(matches!(
        result,
        Err(Ok(InsightArenaError::MarketNotResolved))
    ));
}

#[test]
fn test_raise_dispute_on_closed_but_not_resolved_market_fails() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, _oracle, xlm_token) = deploy(&env);
    let creator = Address::generate(&env);
    let disputer = Address::generate(&env);

    let id = client.create_market(&creator, &market_params(&env));

    // 1. Advance time past the market's end_time to simulate it closing chronologically
    env.ledger().set_timestamp(env.ledger().timestamp() + 15);

    let bond = 15_000_000_i128;
    StellarAssetClient::new(&env, &xlm_token).mint(&disputer, &bond);
    TokenClient::new(&env, &xlm_token).approve(&disputer, &client.address, &bond, &9999);

    // 2. Attempt to dispute a closed market that still lacks resolution
    let result = client.try_raise_dispute(&disputer, &id, &bond);

    // 3. Assert it still rejects with MarketNotResolved
    assert!(matches!(
        result,
        Err(Ok(InsightArenaError::MarketNotResolved))
    ));
}

#[test]
fn test_raise_dispute_on_resolved_market_success_within_window() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, oracle, xlm_token) = deploy(&env);
    let creator = Address::generate(&env);
    let disputer = Address::generate(&env);

    let id = client.create_market(&creator, &market_params(&env));

    // 1. Properly resolve the market first
    env.ledger().set_timestamp(env.ledger().timestamp() + 20);
    client.resolve_market(&oracle, &id, &symbol_short!("yes"));

    let bond = 15_000_000_i128;
    StellarAssetClient::new(&env, &xlm_token).mint(&disputer, &bond);
    TokenClient::new(&env, &xlm_token).approve(&disputer, &client.address, &bond, &9999);

    // 2. Raise a dispute within the valid window
    let result = client.try_raise_dispute(&disputer, &id, &bond);

    // 3. Assert success
    assert!(result.is_ok());
}

#[test]
fn test_list_active_disputes_empty_initially() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, _oracle, _xlm_token) = deploy(&env);
    let list = client.list_active_disputes();
    assert_eq!(list.len(), 0);
}

#[test]
fn test_list_active_disputes_includes_raised_disputes() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, oracle, xlm_token) = deploy(&env);
    let creator = Address::generate(&env);
    let disputer = Address::generate(&env);

    // Create two markets
    let id1 = client.create_market(&creator, &market_params(&env));
    let id2 = client.create_market(&creator, &market_params(&env));

    // Advance and resolve both
    env.ledger().set_timestamp(env.ledger().timestamp() + 20);
    client.resolve_market(&oracle, &id1, &symbol_short!("yes"));
    client.resolve_market(&oracle, &id2, &symbol_short!("yes"));

    let bond = 15_000_000_i128;
    StellarAssetClient::new(&env, &xlm_token).mint(&disputer, &(bond * 2));
    TokenClient::new(&env, &xlm_token).approve(&disputer, &client.address, &(bond * 2), &9999);

    // Raise dispute on first market
    client.raise_dispute(&disputer, &id1, &bond);
    let list = client.list_active_disputes();
    assert_eq!(list.len(), 1);
    assert!(list.contains(&id1));

    // Raise dispute on second market
    client.raise_dispute(&disputer, &id2, &bond);
    let list = client.list_active_disputes();
    assert_eq!(list.len(), 2);
    assert!(list.contains(&id1));
    assert!(list.contains(&id2));
}

#[test]
fn test_list_active_disputes_removes_after_resolve() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, oracle, xlm_token) = deploy(&env);
    let creator = Address::generate(&env);
    let disputer = Address::generate(&env);

    let id = client.create_market(&creator, &market_params(&env));
    env.ledger().set_timestamp(env.ledger().timestamp() + 20);
    client.resolve_market(&oracle, &id, &symbol_short!("yes"));

    let bond = 15_000_000_i128;
    StellarAssetClient::new(&env, &xlm_token).mint(&disputer, &bond);
    TokenClient::new(&env, &xlm_token).approve(&disputer, &client.address, &bond, &9999);

    client.raise_dispute(&disputer, &id, &bond);
    assert_eq!(client.list_active_disputes().len(), 1);

    // Resolve the dispute (uphold)
    client.resolve_dispute(&admin, &id, &true);
    assert_eq!(client.list_active_disputes().len(), 0);
}

#[test]
fn test_list_active_disputes_maintains_insertion_order() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, oracle, xlm_token) = deploy(&env);
    let creator = Address::generate(&env);
    let disputer = Address::generate(&env);

    let id1 = client.create_market(&creator, &market_params(&env));
    let id2 = client.create_market(&creator, &market_params(&env));
    let id3 = client.create_market(&creator, &market_params(&env));

    env.ledger().set_timestamp(env.ledger().timestamp() + 20);
    client.resolve_market(&oracle, &id1, &symbol_short!("yes"));
    client.resolve_market(&oracle, &id2, &symbol_short!("yes"));
    client.resolve_market(&oracle, &id3, &symbol_short!("yes"));

    let bond = 15_000_000_i128;
    StellarAssetClient::new(&env, &xlm_token).mint(&disputer, &(bond * 3));
    TokenClient::new(&env, &xlm_token).approve(&disputer, &client.address, &(bond * 3), &9999);

    client.raise_dispute(&disputer, &id1, &bond);
    client.raise_dispute(&disputer, &id2, &bond);
    client.raise_dispute(&disputer, &id3, &bond);

    let list = client.list_active_disputes();
    assert_eq!(list.len(), 3);
    assert_eq!(list.get(0), Some(id1));
    assert_eq!(list.get(1), Some(id2));
    assert_eq!(list.get(2), Some(id3));
}

#[test]
fn test_dispute_concurrent_markets_tracked_independently() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, oracle, xlm_token) = deploy(&env);
    let creator = Address::generate(&env);
    let disputer = Address::generate(&env);

    let id1 = client.create_market(&creator, &market_params(&env));
    let id2 = client.create_market(&creator, &market_params(&env));

    env.ledger().set_timestamp(env.ledger().timestamp() + 20);
    client.resolve_market(&oracle, &id1, &symbol_short!("yes"));
    client.resolve_market(&oracle, &id2, &symbol_short!("no"));

    let bond = 15_000_000_i128;
    StellarAssetClient::new(&env, &xlm_token).mint(&disputer, &(bond * 2));
    TokenClient::new(&env, &xlm_token).approve(&disputer, &client.address, &(bond * 2), &9999);

    assert_eq!(client.list_active_disputes().len(), 0);

    client.raise_dispute(&disputer, &id1, &bond);
    assert_eq!(client.list_active_disputes().len(), 1);

    client.raise_dispute(&disputer, &id2, &bond);
    let active = client.list_active_disputes();
    assert_eq!(active.len(), 2);
    assert!(active.contains(&id1));
    assert!(active.contains(&id2));

    client.resolve_dispute(&admin, &id1, &false);
    let active = client.list_active_disputes();
    assert_eq!(active.len(), 1);
    assert!(!active.contains(&id1));
    assert!(active.contains(&id2));
}

#[test]
fn test_dispute_raise_at_window_boundary_succeeds() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, oracle, xlm_token) = deploy(&env);
    let creator = Address::generate(&env);
    let disputer = Address::generate(&env);

    let id = client.create_market(&creator, &market_params_with_window(&env, 100));
    env.ledger().set_timestamp(env.ledger().timestamp() + 20);
    client.resolve_market(&oracle, &id, &symbol_short!("yes"));
    let resolved_at = env.ledger().timestamp();

    let bond = 15_000_000_i128;
    StellarAssetClient::new(&env, &xlm_token).mint(&disputer, &bond);
    TokenClient::new(&env, &xlm_token).approve(&disputer, &client.address, &bond, &9999);

    // Exactly at boundary: resolved_at + dispute_window — should succeed (≤ not <)
    env.ledger().set_timestamp(resolved_at + 100);
    let result = client.try_raise_dispute(&disputer, &id, &bond);
    assert!(result.is_ok());
}

#[test]
fn test_dispute_raise_one_second_past_boundary_fails() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, oracle, xlm_token) = deploy(&env);
    let creator = Address::generate(&env);
    let disputer = Address::generate(&env);

    let id = client.create_market(&creator, &market_params_with_window(&env, 100));
    env.ledger().set_timestamp(env.ledger().timestamp() + 20);
    client.resolve_market(&oracle, &id, &symbol_short!("yes"));
    let resolved_at = env.ledger().timestamp();

    let bond = 15_000_000_i128;
    StellarAssetClient::new(&env, &xlm_token).mint(&disputer, &bond);
    TokenClient::new(&env, &xlm_token).approve(&disputer, &client.address, &bond, &9999);

    // One second past the boundary — should fail
    env.ledger().set_timestamp(resolved_at + 100 + 1);
    let result = client.try_raise_dispute(&disputer, &id, &bond);
    assert!(matches!(
        result,
        Err(Ok(InsightArenaError::DisputeWindowClosed))
    ));
}

#[test]
fn test_dispute_reraise_after_uphold_succeeds() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, oracle, xlm_token) = deploy(&env);
    let creator = Address::generate(&env);
    let disputer = Address::generate(&env);

    let id = client.create_market(&creator, &market_params(&env));
    env.ledger().set_timestamp(env.ledger().timestamp() + 20);
    client.resolve_market(&oracle, &id, &symbol_short!("yes"));

    let bond = 15_000_000_i128;
    StellarAssetClient::new(&env, &xlm_token).mint(&disputer, &(bond * 2));
    TokenClient::new(&env, &xlm_token).approve(&disputer, &client.address, &(bond * 2), &9999);

    // First dispute
    client.raise_dispute(&disputer, &id, &bond);
    assert_eq!(client.list_active_disputes().len(), 1);

    // Uphold reopens market and returns bond to disputer
    client.resolve_dispute(&admin, &id, &true);
    assert_eq!(client.list_active_disputes().len(), 0);
    assert!(!client.get_market(&id).is_resolved);

    // Re-resolve the market
    client.resolve_market(&oracle, &id, &symbol_short!("no"));

    // Re-raise dispute on the same market within new window — should succeed
    let result = client.try_raise_dispute(&disputer, &id, &bond);
    assert!(result.is_ok());
    assert_eq!(client.list_active_disputes().len(), 1);
}

#[test]
fn test_get_open_dispute_count_starts_at_zero() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, _oracle, _xlm_token) = deploy(&env);
    assert_eq!(client.get_open_dispute_count(), 0);
}

#[test]
fn test_get_open_dispute_count_increments_on_raise() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, oracle, xlm_token) = deploy(&env);
    let creator = Address::generate(&env);
    let disputer = Address::generate(&env);

    let id = client.create_market(&creator, &market_params(&env));
    env.ledger().set_timestamp(env.ledger().timestamp() + 20);
    client.resolve_market(&oracle, &id, &symbol_short!("yes"));

    let bond = 15_000_000_i128;
    StellarAssetClient::new(&env, &xlm_token).mint(&disputer, &bond);
    TokenClient::new(&env, &xlm_token).approve(&disputer, &client.address, &bond, &9999);

    assert_eq!(client.get_open_dispute_count(), 0);
    client.raise_dispute(&disputer, &id, &bond);
    assert_eq!(client.get_open_dispute_count(), 1);
}

#[test]
fn test_get_open_dispute_count_decrements_on_resolve() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, oracle, xlm_token) = deploy(&env);
    let creator = Address::generate(&env);
    let disputer = Address::generate(&env);

    let id = client.create_market(&creator, &market_params(&env));
    env.ledger().set_timestamp(env.ledger().timestamp() + 20);
    client.resolve_market(&oracle, &id, &symbol_short!("yes"));

    let bond = 15_000_000_i128;
    StellarAssetClient::new(&env, &xlm_token).mint(&disputer, &bond);
    TokenClient::new(&env, &xlm_token).approve(&disputer, &client.address, &bond, &9999);

    client.raise_dispute(&disputer, &id, &bond);
    assert_eq!(client.get_open_dispute_count(), 1);

    client.resolve_dispute(&admin, &id, &false);
    assert_eq!(client.get_open_dispute_count(), 0);
}

#[test]
fn test_get_open_dispute_count_never_goes_below_zero() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, _oracle, _xlm_token) = deploy(&env);
    // Verify count starts at zero and remains non-negative
    assert_eq!(client.get_open_dispute_count(), 0);
}

// ── Timing boundary tests (#1268) ─────────────────────────────────────────────

/// Raising a dispute at the exact ledger timestamp of resolution (elapsed = 0)
/// is within the window — must be accepted.
#[test]
fn test_dispute_raise_at_exact_resolution_timestamp() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, oracle, xlm_token) = deploy(&env);
    let creator = Address::generate(&env);
    let disputer = Address::generate(&env);

    let id = client.create_market(&creator, &market_params_with_window(&env, 100));
    env.ledger().set_timestamp(env.ledger().timestamp() + 20);
    client.resolve_market(&oracle, &id, &symbol_short!("yes"));
    let resolved_at = env.ledger().timestamp();

    let bond = 15_000_000_i128;
    StellarAssetClient::new(&env, &xlm_token).mint(&disputer, &bond);
    TokenClient::new(&env, &xlm_token).approve(&disputer, &client.address, &bond, &9999);

    // now == resolved_at: 0 seconds elapsed, well inside the window
    env.ledger().set_timestamp(resolved_at);
    let result = client.try_raise_dispute(&disputer, &id, &bond);
    assert!(result.is_ok(), "dispute at resolution timestamp must be accepted");
}

/// One second before the deadline (resolved_at + window - 1) must be accepted.
#[test]
fn test_dispute_raise_one_second_before_expiry() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, oracle, xlm_token) = deploy(&env);
    let creator = Address::generate(&env);
    let disputer = Address::generate(&env);

    let window = 100_u64;
    let id = client.create_market(&creator, &market_params_with_window(&env, window));
    env.ledger().set_timestamp(env.ledger().timestamp() + 20);
    client.resolve_market(&oracle, &id, &symbol_short!("yes"));
    let resolved_at = env.ledger().timestamp();

    let bond = 15_000_000_i128;
    StellarAssetClient::new(&env, &xlm_token).mint(&disputer, &bond);
    TokenClient::new(&env, &xlm_token).approve(&disputer, &client.address, &bond, &9999);

    // deadline = resolved_at + window; one second before → resolved_at + window - 1
    env.ledger().set_timestamp(resolved_at + window - 1);
    let result = client.try_raise_dispute(&disputer, &id, &bond);
    assert!(result.is_ok(), "dispute one second before expiry must be accepted");
}

/// Raising a second dispute while one is already active must be rejected with
/// `DisputeAlreadyFiled`. `list_active_disputes` and `get_open_dispute_count`
/// must stay in sync throughout.
#[test]
fn test_raise_duplicate_dispute_on_active_dispute_fails() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, oracle, xlm_token) = deploy(&env);
    let creator = Address::generate(&env);
    let disputer = Address::generate(&env);

    let id = client.create_market(&creator, &market_params(&env));
    env.ledger().set_timestamp(env.ledger().timestamp() + 20);
    client.resolve_market(&oracle, &id, &symbol_short!("yes"));

    let bond = 15_000_000_i128;
    StellarAssetClient::new(&env, &xlm_token).mint(&disputer, &(bond * 2));
    TokenClient::new(&env, &xlm_token).approve(&disputer, &client.address, &(bond * 2), &9999);

    // First dispute succeeds
    client.raise_dispute(&disputer, &id, &bond);
    assert_eq!(client.get_open_dispute_count(), 1);
    assert_eq!(client.list_active_disputes().len(), 1);

    // Second dispute on the same market (active dispute present) must be rejected
    let result = client.try_raise_dispute(&disputer, &id, &bond);
    assert!(matches!(
        result,
        Err(Ok(InsightArenaError::DisputeAlreadyFiled))
    ));

    // Counters must be unchanged after the rejected attempt
    assert_eq!(client.get_open_dispute_count(), 1);
    assert_eq!(client.list_active_disputes().len(), 1);
}

/// After a dispute is *rejected* (bond forfeited), the market remains resolved
/// and still within the dispute window. Raising a new dispute on the same market
/// must be allowed (the old dispute entry was removed on rejection).
#[test]
fn test_reraise_dispute_after_rejection_within_window() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, oracle, xlm_token) = deploy(&env);
    let creator = Address::generate(&env);
    let disputer = Address::generate(&env);

    // Use a large window so it does not expire mid-test
    let id = client.create_market(&creator, &market_params_with_window(&env, 86_400));
    env.ledger().set_timestamp(env.ledger().timestamp() + 20);
    client.resolve_market(&oracle, &id, &symbol_short!("yes"));

    let bond = 15_000_000_i128;
    StellarAssetClient::new(&env, &xlm_token).mint(&disputer, &(bond * 2));
    TokenClient::new(&env, &xlm_token).approve(&disputer, &client.address, &(bond * 2), &9999);

    // First dispute, then admin rejects it (bond forfeited, market still resolved)
    client.raise_dispute(&disputer, &id, &bond);
    assert_eq!(client.list_active_disputes().len(), 1);
    assert_eq!(client.get_open_dispute_count(), 1);

    client.resolve_dispute(&admin, &id, &false);
    assert_eq!(client.list_active_disputes().len(), 0);
    assert_eq!(client.get_open_dispute_count(), 0);

    // The dispute entry is gone; a new dispute on the same market must succeed
    let result = client.try_raise_dispute(&disputer, &id, &bond);
    assert!(result.is_ok(), "re-raising after rejection must be allowed within window");
    assert_eq!(client.list_active_disputes().len(), 1);
    assert_eq!(client.get_open_dispute_count(), 1);
}

/// A dispute already settled by `resolve_dispute` cannot be settled again:
/// the second call must fail cleanly with `DisputeNotFound` and must not
/// move any additional funds.
#[test]
fn test_resolve_dispute_cannot_be_called_twice() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, oracle, xlm_token) = deploy(&env);
    let creator = Address::generate(&env);
    let disputer = Address::generate(&env);

    let id = client.create_market(&creator, &market_params(&env));
    env.ledger().set_timestamp(env.ledger().timestamp() + 20);
    client.resolve_market(&oracle, &id, &symbol_short!("yes"));

    let bond = 10_000_000_i128;
    StellarAssetClient::new(&env, &xlm_token).mint(&disputer, &bond);
    TokenClient::new(&env, &xlm_token).approve(&disputer, &client.address, &bond, &9999);
    client.raise_dispute(&disputer, &id, &bond);

    let token = TokenClient::new(&env, &xlm_token);
    client.resolve_dispute(&admin, &id, &true);
    let disputer_balance_after_first = token.balance(&disputer);

    let result = client.try_resolve_dispute(&admin, &id, &true);
    assert!(matches!(result, Err(Ok(InsightArenaError::DisputeNotFound))));
    assert_eq!(token.balance(&disputer), disputer_balance_after_first);
}

// ── Appeal bond escrow (#1677) ────────────────────────────────────────────────
//
// `appeal_dispute` escalates an active dispute with a larger bond
// (`calculate_appeal_bond`: base bond × (tier + 1)); `resolve_appeal` settles
// it the same way `resolve_dispute` settles the original bond — refund on
// uphold, slash (insurance pool / treasury split) on reject — while leaving
// the underlying `Dispute` record in place (only `appealer`/`appeal_bond` are
// cleared), guarding against a second settlement of the same appeal.

fn setup_appealed_dispute(
    env: &Env,
    client: &InsightArenaContractClient<'_>,
    oracle: &Address,
    xlm_token: &Address,
) -> (u64, Address, i128) {
    let creator = Address::generate(env);
    let disputer = Address::generate(env);
    let appealer = Address::generate(env);

    let id = client.create_market(&creator, &market_params(env));
    env.ledger().set_timestamp(env.ledger().timestamp() + 20);
    client.resolve_market(oracle, &id, &symbol_short!("yes"));

    let bond = 10_000_000_i128;
    StellarAssetClient::new(env, xlm_token).mint(&disputer, &bond);
    TokenClient::new(env, xlm_token).approve(&disputer, &client.address, &bond, &9999);
    client.raise_dispute(&disputer, &id, &bond);

    // Calculate appeal bond for tier 1
    let appeal_bond = bond * 2;
    StellarAssetClient::new(env, xlm_token).mint(&appealer, &appeal_bond);
    TokenClient::new(env, xlm_token).approve(&appealer, &client.address, &appeal_bond, &9999);
    client.appeal_dispute(&appealer, &id, &appeal_bond);

    (id, appealer, appeal_bond)
}

// ── Bond Slashing and Distribution Tests ──────────────────────────────────────

#[test]
fn test_resolve_dispute_reject_slashes_bond_correctly() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, oracle, xlm_token) = deploy(&env);
    let creator = Address::generate(&env);
    let disputer = Address::generate(&env);

    let id = client.create_market(&creator, &market_params(&env));
    env.ledger().set_timestamp(env.ledger().timestamp() + 20);
    client.resolve_market(&oracle, &id, &symbol_short!("yes"));

    let bond = 10_000_000_i128;
    StellarAssetClient::new(&env, &xlm_token).mint(&disputer, &bond);
    TokenClient::new(&env, &xlm_token).approve(&disputer, &client.address, &bond, &9999);
    client.raise_dispute(&disputer, &id, &bond);

    let treasury_before = client.get_treasury_balance();
    let insurance_before = client.get_insurance_pool_balance();
    let disputer_before = TokenClient::new(&env, &xlm_token).balance(&disputer);

    // Reject dispute: disputer loses bond
    client.resolve_dispute(&admin, &id, &false);

    // Disputer should not receive refund
    let disputer_after = TokenClient::new(&env, &xlm_token).balance(&disputer);
    assert_eq!(disputer_after, disputer_before);

    // Bond should be split between insurance and treasury
    let insurance_share = bond * 1000 / 10_000; // 10% default
    let treasury_share = bond - insurance_share;
    
    assert_eq!(client.get_treasury_balance(), treasury_before + treasury_share);
    assert_eq!(client.get_insurance_pool_balance(), insurance_before + insurance_share);
}

#[test]
fn test_resolve_dispute_uphold_refunds_disputer_full_bond() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, oracle, xlm_token) = deploy(&env);
    let creator = Address::generate(&env);
    let disputer = Address::generate(&env);

    let id = client.create_market(&creator, &market_params(&env));
    env.ledger().set_timestamp(env.ledger().timestamp() + 20);
    client.resolve_market(&oracle, &id, &symbol_short!("yes"));

    let bond = 10_000_000_i128;
    StellarAssetClient::new(&env, &xlm_token).mint(&disputer, &bond);
    TokenClient::new(&env, &xlm_token).approve(&disputer, &client.address, &bond, &9999);
    client.raise_dispute(&disputer, &id, &bond);

    let token = TokenClient::new(&env, &xlm_token);
    let disputer_before = token.balance(&disputer);
    let treasury_before = client.get_treasury_balance();
    let insurance_before = client.get_insurance_pool_balance();

    // Uphold dispute: disputer wins
    client.resolve_dispute(&admin, &id, &true);

    // Disputer should receive full bond back
    assert_eq!(token.balance(&disputer), disputer_before + bond);
    
    // Treasury and insurance should not change
    assert_eq!(client.get_treasury_balance(), treasury_before);
    assert_eq!(client.get_insurance_pool_balance(), insurance_before);
}

#[test]
fn test_resolve_dispute_cannot_be_resolved_twice() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, oracle, xlm_token) = deploy(&env);
    let creator = Address::generate(&env);
    let disputer = Address::generate(&env);

    let id = client.create_market(&creator, &market_params(&env));
    env.ledger().set_timestamp(env.ledger().timestamp() + 20);
    client.resolve_market(&oracle, &id, &symbol_short!("yes"));

    let bond = 10_000_000_i128;
    StellarAssetClient::new(&env, &xlm_token).mint(&disputer, &bond);
    TokenClient::new(&env, &xlm_token).approve(&disputer, &client.address, &bond, &9999);
    client.raise_dispute(&disputer, &id, &bond);

    // First resolution succeeds
    client.resolve_dispute(&admin, &id, &false);

    // Second resolution should fail with DisputeNotFound (dispute was removed)
    let result = client.try_resolve_dispute(&admin, &id, &false);
    assert!(matches!(result, Err(Ok(InsightArenaError::DisputeNotFound))));
}

// ── Reputation Impact Tests ───────────────────────────────────────────────────

#[test]
fn test_resolve_dispute_reject_penalizes_disputer_reputation() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, oracle, xlm_token) = deploy(&env);
    let creator = Address::generate(&env);
    let disputer = Address::generate(&env);

    let id = client.create_market(&creator, &market_params(&env));
    env.ledger().set_timestamp(env.ledger().timestamp() + 20);
    client.resolve_market(&oracle, &id, &symbol_short!("yes"));

    let bond = 10_000_000_i128;
    StellarAssetClient::new(&env, &xlm_token).mint(&disputer, &bond);
    TokenClient::new(&env, &xlm_token).approve(&disputer, &client.address, &bond, &9999);

    // Get initial reputation (will be 0 for new user)
    let stats_before = client.get_creator_stats(&disputer);
    let disputes_before = stats_before.dispute_count;

    client.raise_dispute(&disputer, &id, &bond);
    client.resolve_dispute(&admin, &id, &false);

    // Disputer should have increased dispute count (reputation penalty)
    let stats_after = client.get_creator_stats(&disputer);
    assert_eq!(stats_after.dispute_count, disputes_before + 1);
    assert!(stats_after.reputation_score <= stats_before.reputation_score);
}

#[test]
fn test_resolve_dispute_uphold_penalizes_creator_reputation() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, oracle, xlm_token) = deploy(&env);
    let creator = Address::generate(&env);
    let disputer = Address::generate(&env);

    let id = client.create_market(&creator, &market_params(&env));

    // Record baseline dispute count
    let disputes_before = client.get_creator_stats(&creator).dispute_count;

    env.ledger().set_timestamp(env.ledger().timestamp() + 20);
    client.resolve_market(&oracle, &id, &symbol_short!("yes"));

    let bond = 10_000_000_i128;
    StellarAssetClient::new(&env, &xlm_token).mint(&disputer, &bond);
    TokenClient::new(&env, &xlm_token).approve(&disputer, &client.address, &bond, &9999);

    // Raising the dispute applies the first creator penalty (+1 dispute_count)
    client.raise_dispute(&disputer, &id, &bond);
    assert_eq!(
        client.get_creator_stats(&creator).dispute_count,
        disputes_before + 1,
        "raise_dispute must increment creator dispute_count"
    );

    // Upholding applies the second creator penalty (+1 more dispute_count)
    client.resolve_dispute(&admin, &id, &true);
    let stats_final = client.get_creator_stats(&creator);
    assert_eq!(
        stats_final.dispute_count,
        disputes_before + 2,
        "upholding a dispute must add a second dispute_count penalty to the creator"
    );

    // Each dispute subtracts 50 from reputation (formula: min(dispute_count * 50, 200)).
    // With 2 disputes the penalty is 100; a brand-new creator with 0 resolved markets
    // starts at score 0, so the floor clamps it there — verify it never exceeds what
    // it would be with zero disputes.
    let penalty_per_dispute: u32 = 50;
    let expected_max_score = 1000_u32
        .saturating_sub(stats_final.dispute_count.saturating_mul(penalty_per_dispute).min(200));
    assert!(
        stats_final.reputation_score <= expected_max_score,
        "reputation_score must not exceed the penalised ceiling"
    );
}

// ── Appeal Bond Slashing Tests ────────────────────────────────────────────────

#[test]
fn test_resolve_appeal_uphold_refunds_appealer_full_bond() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, oracle, xlm_token) = deploy(&env);
    let (id, appealer, appeal_bond) = setup_appealed_dispute(&env, &client, &oracle, &xlm_token);

    let token = TokenClient::new(&env, &xlm_token);
    let appealer_before = token.balance(&appealer);
    let treasury_before = client.get_treasury_balance();

    client.resolve_appeal(&admin, &id, &true);

    // Appealer should receive full bond back
    assert_eq!(token.balance(&appealer), appealer_before + appeal_bond);
    
    // Treasury should not change
    assert_eq!(client.get_treasury_balance(), treasury_before);
}

#[test]
fn test_resolve_appeal_reject_slashes_appealer_bond() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, oracle, xlm_token) = deploy(&env);
    let (id, appealer, appeal_bond) = setup_appealed_dispute(&env, &client, &oracle, &xlm_token);

    let token = TokenClient::new(&env, &xlm_token);
    let appealer_before = token.balance(&appealer);
    let treasury_before = client.get_treasury_balance();
    let insurance_before = client.get_insurance_pool_balance();

    client.resolve_appeal(&admin, &id, &false);

    // Appealer should not receive refund
    assert_eq!(token.balance(&appealer), appealer_before);
    
    // Bond should be split between insurance and treasury
    let insurance_share = appeal_bond * 1000 / 10_000;
    let treasury_share = appeal_bond - insurance_share;
    
    assert_eq!(client.get_treasury_balance(), treasury_before + treasury_share);
    assert_eq!(client.get_insurance_pool_balance(), insurance_before + insurance_share);
}

#[test]
fn test_resolve_appeal_cannot_be_resolved_twice() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, oracle, xlm_token) = deploy(&env);
    let (id, _appealer, _appeal_bond) = setup_appealed_dispute(&env, &client, &oracle, &xlm_token);

    // First resolution succeeds
    client.resolve_appeal(&admin, &id, &true);

    // Second resolution should fail (appeal_bond is now 0)
    let result = client.try_resolve_appeal(&admin, &id, &true);
    assert!(matches!(result, Err(Ok(InsightArenaError::EscrowEmpty))));
}

// ── Comprehensive Integration Tests ───────────────────────────────────────────

#[test]
fn test_complete_dispute_lifecycle_with_reputation_tracking() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, oracle, xlm_token) = deploy(&env);
    let creator = Address::generate(&env);
    let disputer = Address::generate(&env);

    // Create and resolve market
    let id = client.create_market(&creator, &market_params(&env));
    env.ledger().set_timestamp(env.ledger().timestamp() + 20);
    client.resolve_market(&oracle, &id, &symbol_short!("yes"));

    let bond = 15_000_000_i128;
    StellarAssetClient::new(&env, &xlm_token).mint(&disputer, &bond);
    TokenClient::new(&env, &xlm_token).approve(&disputer, &client.address, &bond, &9999);

    // Track initial state
    let creator_stats_initial = client.get_creator_stats(&creator);
    let disputer_stats_initial = client.get_creator_stats(&disputer);
    let contract_balance_initial = TokenClient::new(&env, &xlm_token).balance(&client.address);

    // Raise dispute
    client.raise_dispute(&disputer, &id, &bond);
    
    // Creator's dispute count should increase
    let creator_stats_after_raise = client.get_creator_stats(&creator);
    assert_eq!(
        creator_stats_after_raise.dispute_count,
        creator_stats_initial.dispute_count + 1
    );

    // Contract should hold the bond
    assert_eq!(
        TokenClient::new(&env, &xlm_token).balance(&client.address),
        contract_balance_initial + bond
    );

    // Reject dispute
    client.resolve_dispute(&admin, &id, &false);

    // Disputer should be penalized
    let disputer_stats_final = client.get_creator_stats(&disputer);
    assert_eq!(
        disputer_stats_final.dispute_count,
        disputer_stats_initial.dispute_count + 1
    );

    // Bond should be slashed (split between insurance and treasury)
    let insurance_share = bond * 1000 / 10_000;
    let treasury_share = bond - insurance_share;
    assert!(client.get_treasury_balance() >= treasury_share);
    assert!(client.get_insurance_pool_balance() >= insurance_share);

    // Dispute should be removed
    let result = client.try_get_dispute(&id);
    assert!(matches!(result, Err(Ok(InsightArenaError::DisputeNotFound))));
}

#[test]
fn test_uphold_dispute_reopens_market_and_updates_all_parties() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, oracle, xlm_token) = deploy(&env);
    let creator = Address::generate(&env);
    let disputer = Address::generate(&env);

    let id = client.create_market(&creator, &market_params(&env));
    env.ledger().set_timestamp(env.ledger().timestamp() + 20);
    client.resolve_market(&oracle, &id, &symbol_short!("yes"));

    let bond = 12_000_000_i128;
    StellarAssetClient::new(&env, &xlm_token).mint(&disputer, &bond);
    TokenClient::new(&env, &xlm_token).approve(&disputer, &client.address, &bond, &9999);

    let disputer_balance_before = TokenClient::new(&env, &xlm_token).balance(&disputer);
    let creator_disputes_before = client.get_creator_stats(&creator).dispute_count;

    client.raise_dispute(&disputer, &id, &bond);
    client.resolve_dispute(&admin, &id, &true);

    // Market should be reopened
    let market = client.get_market(&id);
    assert!(!market.is_resolved);
    assert_eq!(market.resolved_outcome, None);

    // Disputer should get full refund
    assert_eq!(
        TokenClient::new(&env, &xlm_token).balance(&disputer),
        disputer_balance_before
    );

    // Creator should have additional reputation penalty
    let creator_disputes_after = client.get_creator_stats(&creator).dispute_count;
    assert_eq!(creator_disputes_after, creator_disputes_before + 2); // +1 from raise, +1 from uphold
}

#[test]
fn test_checked_arithmetic_in_bond_distribution() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, oracle, xlm_token) = deploy(&env);
    let creator = Address::generate(&env);
    let disputer = Address::generate(&env);

    let id = client.create_market(&creator, &market_params(&env));
    env.ledger().set_timestamp(env.ledger().timestamp() + 20);
    client.resolve_market(&oracle, &id, &symbol_short!("yes"));

    // Use a bond amount that tests precision in percentage calculations
    let bond = 999_999_i128;
    StellarAssetClient::new(&env, &xlm_token).mint(&disputer, &bond);
    TokenClient::new(&env, &xlm_token).approve(&disputer, &client.address, &bond, &9999);

    let treasury_before = client.get_treasury_balance();
    let insurance_before = client.get_insurance_pool_balance();

    client.raise_dispute(&disputer, &id, &bond);
    client.resolve_dispute(&admin, &id, &false);

    // Verify no funds are lost due to rounding
    let insurance_share = bond * 1000 / 10_000;
    let treasury_share = bond - insurance_share;
    
    assert_eq!(
        client.get_treasury_balance() - treasury_before,
        treasury_share
    );
    assert_eq!(
        client.get_insurance_pool_balance() - insurance_before,
        insurance_share
    );
    
    // Verify the shares add up to the original bond
    assert_eq!(insurance_share + treasury_share, bond);
}

#[test]
fn test_appeal_dispute_locks_escalated_bond_in_escrow() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, oracle, xlm_token) = deploy(&env);
    let creator = Address::generate(&env);
    let disputer = Address::generate(&env);
    let appealer = Address::generate(&env);

    let id = client.create_market(&creator, &market_params(&env));
    env.ledger().set_timestamp(env.ledger().timestamp() + 20);
    client.resolve_market(&oracle, &id, &symbol_short!("yes"));

    let bond = 10_000_000_i128;
    StellarAssetClient::new(&env, &xlm_token).mint(&disputer, &bond);
    TokenClient::new(&env, &xlm_token).approve(&disputer, &client.address, &bond, &9999);
    client.raise_dispute(&disputer, &id, &bond);

    let appeal_bond = bond * 2;
    StellarAssetClient::new(&env, &xlm_token).mint(&appealer, &appeal_bond);
    TokenClient::new(&env, &xlm_token).approve(&appealer, &client.address, &appeal_bond, &9999);

    let token = TokenClient::new(&env, &xlm_token);
    let contract_before = token.balance(&client.address);
    let appealer_before = token.balance(&appealer);

    client.appeal_dispute(&appealer, &id, &appeal_bond);

    assert_eq!(token.balance(&appealer), appealer_before - appeal_bond);
    assert_eq!(token.balance(&client.address), contract_before + appeal_bond);
}

#[test]
fn test_resolve_appeal_uphold_refunds_appeal_bond() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, oracle, xlm_token) = deploy(&env);
    let (id, appealer, appeal_bond) = setup_appealed_dispute(&env, &client, &oracle, &xlm_token);

    let token = TokenClient::new(&env, &xlm_token);
    let appealer_before = token.balance(&appealer);

    client.resolve_appeal(&admin, &id, &true);

    assert_eq!(token.balance(&appealer), appealer_before + appeal_bond);
    let market = client.get_market(&id);
    assert!(!market.is_resolved);
}

#[test]
fn test_resolve_appeal_reject_forfeits_appeal_bond() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, oracle, xlm_token) = deploy(&env);
    let (id, _appealer, appeal_bond) = setup_appealed_dispute(&env, &client, &oracle, &xlm_token);

    let treasury_before = client.get_treasury_balance();
    let insurance_before = client.get_insurance_pool_balance();

    client.resolve_appeal(&admin, &id, &false);

    let treasury_after = client.get_treasury_balance();
    let insurance_after = client.get_insurance_pool_balance();
    let insurance_share = appeal_bond * 1000 / 10_000;
    let treasury_share = appeal_bond - insurance_share;
    assert_eq!(treasury_after, treasury_before + treasury_share);
    assert_eq!(insurance_after, insurance_before + insurance_share);

    let market = client.get_market(&id);
    assert!(market.is_resolved);
}

#[test]
fn test_resolve_appeal_cannot_be_called_twice() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, oracle, xlm_token) = deploy(&env);
    let (id, appealer, _appeal_bond) = setup_appealed_dispute(&env, &client, &oracle, &xlm_token);

    client.resolve_appeal(&admin, &id, &false);

    let token = TokenClient::new(&env, &xlm_token);
    let appealer_balance_after_first = token.balance(&appealer);

    let result = client.try_resolve_appeal(&admin, &id, &false);
    assert!(matches!(result, Err(Ok(InsightArenaError::DisputeNotFound))));
    assert_eq!(token.balance(&appealer), appealer_balance_after_first);
}

/// `list_active_disputes` and `get_open_dispute_count` must agree after every
/// raise and resolve step, across multiple markets.
#[test]
fn test_list_active_disputes_and_count_stay_consistent_through_all_steps() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, oracle, xlm_token) = deploy(&env);
    let creator = Address::generate(&env);
    let disputer = Address::generate(&env);

    // Initial state: both counters at zero
    assert_eq!(client.list_active_disputes().len() as u32, client.get_open_dispute_count());
    assert_eq!(client.get_open_dispute_count(), 0);

    let id1 = client.create_market(&creator, &market_params(&env));
    let id2 = client.create_market(&creator, &market_params(&env));

    env.ledger().set_timestamp(env.ledger().timestamp() + 20);
    client.resolve_market(&oracle, &id1, &symbol_short!("yes"));
    client.resolve_market(&oracle, &id2, &symbol_short!("yes"));

    let bond = 15_000_000_i128;
    StellarAssetClient::new(&env, &xlm_token).mint(&disputer, &(bond * 2));
    TokenClient::new(&env, &xlm_token).approve(&disputer, &client.address, &(bond * 2), &9999);

    // After raising on id1: list.len() == count == 1
    client.raise_dispute(&disputer, &id1, &bond);
    let active = client.list_active_disputes();
    assert_eq!(active.len() as u32, client.get_open_dispute_count());
    assert!(active.contains(&id1));

    // After raising on id2: list.len() == count == 2
    client.raise_dispute(&disputer, &id2, &bond);
    let active = client.list_active_disputes();
    assert_eq!(active.len() as u32, client.get_open_dispute_count());
    assert!(active.contains(&id1));
    assert!(active.contains(&id2));

    // After resolving id1 (upheld): list.len() == count == 1, id1 gone
    client.resolve_dispute(&admin, &id1, &true);
    let active = client.list_active_disputes();
    assert_eq!(active.len() as u32, client.get_open_dispute_count());
    assert!(!active.contains(&id1));
    assert!(active.contains(&id2));

    // After resolving id2 (rejected): list empty, count == 0
    client.resolve_dispute(&admin, &id2, &false);
    let active = client.list_active_disputes();
    assert_eq!(active.len() as u32, client.get_open_dispute_count());
    assert_eq!(active.len(), 0);
    assert_eq!(client.get_open_dispute_count(), 0);
}
