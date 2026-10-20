//! Market Creation Anti-Spam Bond tests (#1327)
//!
//! Covers the acceptance criteria from the issue:
//!
//! - Market creation reverts if the bond is not provided (allowance insufficient).
//! - Bond is returned on clean resolution (`refund` path).
//! - Bond is forfeited to the treasury on invalid cancellation (`forfeit` path).
//! - Bond amount is configurable and validated as non-negative.
//! - `get_market_bond` correctly reports the held amount and zero after settlement.

use insightarena_contract::market::CreateMarketParams;
use insightarena_contract::{InsightArenaContract, InsightArenaContractClient, InsightArenaError};
use soroban_sdk::testutils::{Address as _, Ledger as _};
use soroban_sdk::token::{Client as TokenClient, StellarAssetClient};
use soroban_sdk::{symbol_short, vec, Address, Env, String, Symbol, BytesN};

// ── Helpers ───────────────────────────────────────────────────────────────────

fn register_token(env: &Env) -> Address {
    let token_admin = Address::generate(env);
    env.register_stellar_asset_contract_v2(token_admin)
        .address()
}

/// Deploy and initialize the contract, returning (client, admin, oracle, xlm_token).
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

/// Mint tokens to an address.
fn fund(env: &Env, xlm_token: &Address, to: &Address, amount: i128) {
    StellarAssetClient::new(env, xlm_token).mint(to, &amount);
}

/// Approve the contract to spend `amount` from `from`.
fn approve(env: &Env, xlm_token: &Address, from: &Address, spender: &Address, amount: i128) {
    TokenClient::new(env, xlm_token).approve(from, spender, &amount, &200_u32);
}

fn default_params(env: &Env) -> CreateMarketParams {
    let now = env.ledger().timestamp();
    CreateMarketParams {
        title: String::from_str(env, "Bond test market"),
        description: String::from_str(env, "Created to test anti-spam bond"),
        category: Symbol::new(env, "Sports"),
        outcomes: vec![env, symbol_short!("yes"), symbol_short!("no")],
        end_time: now + 1_000,
        resolution_time: now + 2_000,
        dispute_window: 86_400,
        creator_fee_bps: 100,
        min_stake: 10_000_000,
        max_stake: 100_000_000,
        is_public: true,
        metadata_hash: BytesN::from_array(env, &[0u8; 32]),
    }
}

// ── set_bond_amount ───────────────────────────────────────────────────────────

/// Setting a positive bond amount by the admin succeeds.
#[test]
fn test_set_bond_amount_success() {
    let env = Env::default();
    let (client, admin, _oracle, _xlm) = deploy(&env);

    // Default is 0 (disabled).
    let cfg = client.get_config();
    assert_eq!(cfg.bond_amount, 0);

    // Admin sets the bond to 50 XLM (5_000_000_000 stroops).
    client.set_bond_amount(&admin, &5_000_000_000_i128);
    let cfg = client.get_config();
    assert_eq!(cfg.bond_amount, 5_000_000_000_i128);
}

/// Non-admin cannot change the bond amount.
#[test]
fn test_set_bond_amount_unauthorized() {
    let env = Env::default();
    let (client, _admin, _oracle, _xlm) = deploy(&env);
    let stranger = Address::generate(&env);

    let result = client.try_set_bond_amount(&stranger, &1_000_000_i128);
    assert_eq!(result, Err(Ok(InsightArenaError::Unauthorized)));
}

/// Negative bond amount is rejected.
#[test]
fn test_set_bond_amount_negative_rejected() {
    let env = Env::default();
    let (client, admin, _oracle, _xlm) = deploy(&env);

    let result = client.try_set_bond_amount(&admin, &-1_i128);
    assert_eq!(result, Err(Ok(InsightArenaError::InvalidInput)));
}

/// Zero bond amount disables the requirement.
#[test]
fn test_set_bond_amount_zero_disables() {
    let env = Env::default();
    let (client, admin, _oracle, _xlm) = deploy(&env);

    // Set then clear.
    client.set_bond_amount(&admin, &100_000_000_i128);
    client.set_bond_amount(&admin, &0_i128);
    assert_eq!(client.get_config().bond_amount, 0);
}

// ── Bond disabled (bond_amount == 0, default) ─────────────────────────────────

/// When bond is disabled (0), market creation succeeds without any approval.
#[test]
fn test_create_market_no_bond_required_by_default() {
    let env = Env::default();
    let (client, _admin, _oracle, _xlm) = deploy(&env);

    let creator = Address::generate(&env);
    // No allowance granted — bond is disabled so this must succeed.
    let market_id = client.create_market(&creator, &default_params(&env));
    assert_eq!(market_id, 1);

    // No bond recorded.
    assert_eq!(client.get_market_bond(&market_id), 0);
}

// ── Bond deposit path ─────────────────────────────────────────────────────────

/// When bond is enabled, a creator with sufficient approved allowance can
/// create a market; the bond is held in escrow and `get_market_bond` reflects it.
#[test]
fn test_create_market_with_bond_deposits_correctly() {
    let env = Env::default();
    let (client, admin, _oracle, xlm) = deploy(&env);

    let bond = 50_000_000_i128; // 5 XLM
    client.set_bond_amount(&admin, &bond);

    let creator = Address::generate(&env);
    fund(&env, &xlm, &creator, bond + 100_000_000); // give creator enough
    approve(&env, &xlm, &creator, &client.address, bond);

    let market_id = client.create_market(&creator, &default_params(&env));

    // Bond is held in escrow.
    assert_eq!(client.get_market_bond(&market_id), bond);

    // Creator's balance has decreased by the bond.
    let creator_balance = TokenClient::new(&env, &xlm).balance(&creator);
    assert_eq!(creator_balance, 100_000_000); // started with bond + 100M, lost bond
}

/// Market creation reverts when the creator has not approved the contract
/// for the bond amount.
#[test]
fn test_create_market_reverts_when_bond_not_approved() {
    let env = Env::default();
    let (client, admin, _oracle, xlm) = deploy(&env);

    let bond = 50_000_000_i128;
    client.set_bond_amount(&admin, &bond);

    let creator = Address::generate(&env);
    fund(&env, &xlm, &creator, bond + 100_000_000);
    // Intentionally NOT approving allowance.

    let result = client.try_create_market(&creator, &default_params(&env));
    assert_eq!(result, Err(Ok(InsightArenaError::InsufficientFunds)));
}

/// Market creation reverts when the creator's allowance is too small.
#[test]
fn test_create_market_reverts_when_allowance_too_small() {
    let env = Env::default();
    let (client, admin, _oracle, xlm) = deploy(&env);

    let bond = 50_000_000_i128;
    client.set_bond_amount(&admin, &bond);

    let creator = Address::generate(&env);
    fund(&env, &xlm, &creator, bond + 100_000_000);
    // Approve only half.
    approve(&env, &xlm, &creator, &client.address, bond / 2);

    let result = client.try_create_market(&creator, &default_params(&env));
    assert_eq!(result, Err(Ok(InsightArenaError::InsufficientFunds)));
}

// ── Bond refund path (clean resolution) ──────────────────────────────────────

/// When a market resolves normally the bond is returned to the creator.
#[test]
fn test_bond_refunded_on_resolution() {
    let env = Env::default();
    let (client, admin, oracle, xlm) = deploy(&env);

    let bond = 50_000_000_i128;
    client.set_bond_amount(&admin, &bond);

    let creator = Address::generate(&env);
    fund(&env, &xlm, &creator, bond);
    approve(&env, &xlm, &creator, &client.address, bond);

    let market_id = client.create_market(&creator, &default_params(&env));

    // Bond is now in escrow.
    assert_eq!(client.get_market_bond(&market_id), bond);
    let balance_after_creation = TokenClient::new(&env, &xlm).balance(&creator);
    assert_eq!(balance_after_creation, 0); // all funds transferred to escrow

    // Advance past resolution_time.
    env.ledger().with_mut(|l| l.timestamp += 3_000);

    client.resolve_market(&oracle, &market_id, &symbol_short!("yes"));

    // Bond returned — creator has their tokens back.
    let balance_after_resolution = TokenClient::new(&env, &xlm).balance(&creator);
    assert_eq!(balance_after_resolution, bond);

    // Bond record is cleared.
    assert_eq!(client.get_market_bond(&market_id), 0);
}

/// After resolution the bond record is gone (idempotent / no double-refund).
#[test]
fn test_bond_cleared_after_resolution() {
    let env = Env::default();
    let (client, admin, oracle, xlm) = deploy(&env);

    let bond = 50_000_000_i128;
    client.set_bond_amount(&admin, &bond);

    let creator = Address::generate(&env);
    fund(&env, &xlm, &creator, bond);
    approve(&env, &xlm, &creator, &client.address, bond);

    let market_id = client.create_market(&creator, &default_params(&env));
    env.ledger().with_mut(|l| l.timestamp += 3_000);
    client.resolve_market(&oracle, &market_id, &symbol_short!("yes"));

    assert_eq!(client.get_market_bond(&market_id), 0);
}

// ── Bond forfeiture path (invalid/spam cancellation) ─────────────────────────

/// When a market is cancelled the bond is forfeited to the treasury (not returned).
#[test]
fn test_bond_forfeited_on_cancellation() {
    let env = Env::default();
    let (client, admin, _oracle, xlm) = deploy(&env);

    let bond = 50_000_000_i128;
    client.set_bond_amount(&admin, &bond);

    let creator = Address::generate(&env);
    fund(&env, &xlm, &creator, bond);
    approve(&env, &xlm, &creator, &client.address, bond);

    let market_id = client.create_market(&creator, &default_params(&env));

    // Confirm bond is held.
    assert_eq!(client.get_market_bond(&market_id), bond);

    // Admin cancels the market (spam/invalid classification).
    client.cancel_market(&admin, &market_id);

    // Bond record is cleared.
    assert_eq!(client.get_market_bond(&market_id), 0);

    // Creator did NOT get the tokens back.
    let creator_balance = TokenClient::new(&env, &xlm).balance(&creator);
    assert_eq!(creator_balance, 0);

    // Treasury received the bond.
    assert_eq!(client.get_treasury_balance(), bond);
}

/// Forfeited bond increases the treasury balance even when the treasury
/// already had a positive balance from prior operations.
#[test]
fn test_bond_forfeiture_adds_to_existing_treasury() {
    let env = Env::default();
    let (client, admin, _oracle, xlm) = deploy(&env);

    let bond = 50_000_000_i128;
    client.set_bond_amount(&admin, &bond);

    // Create and cancel two markets, accumulating two bonds in treasury.
    for _ in 0..2 {
        let creator = Address::generate(&env);
        fund(&env, &xlm, &creator, bond);
        approve(&env, &xlm, &creator, &client.address, bond);

        let market_id = client.create_market(&creator, &default_params(&env));
        client.cancel_market(&admin, &market_id);
    }

    assert_eq!(client.get_treasury_balance(), bond * 2);
}

/// When the bond is disabled (0), cancellation does not affect the treasury.
#[test]
fn test_no_bond_on_cancellation_when_disabled() {
    let env = Env::default();
    let (client, admin, _oracle, _xlm) = deploy(&env);

    // Bond disabled (default).
    let creator = Address::generate(&env);
    let market_id = client.create_market(&creator, &default_params(&env));

    client.cancel_market(&admin, &market_id);

    assert_eq!(client.get_market_bond(&market_id), 0);
    assert_eq!(client.get_treasury_balance(), 0);
}

/// When the bond is disabled (0), resolution does not affect the creator's balance.
#[test]
fn test_no_bond_on_resolution_when_disabled() {
    let env = Env::default();
    let (client, _admin, oracle, xlm) = deploy(&env);

    let creator = Address::generate(&env);
    fund(&env, &xlm, &creator, 1_000_000_000);

    let market_id = client.create_market(&creator, &default_params(&env));

    env.ledger().with_mut(|l| l.timestamp += 3_000);
    client.resolve_market(&oracle, &market_id, &symbol_short!("yes"));

    // Creator's balance is unchanged (no bond was deducted at create time).
    assert_eq!(
        TokenClient::new(&env, &xlm).balance(&creator),
        1_000_000_000
    );
    assert_eq!(client.get_market_bond(&market_id), 0);
}

// ── get_market_bond ───────────────────────────────────────────────────────────

/// `get_market_bond` returns 0 for a non-existent market ID (no panic).
#[test]
fn test_get_market_bond_unknown_market() {
    let env = Env::default();
    let (client, _admin, _oracle, _xlm) = deploy(&env);

    assert_eq!(client.get_market_bond(&999_u64), 0);
}

/// `get_market_bond` correctly reports the held bond mid-lifecycle.
#[test]
fn test_get_market_bond_reflects_live_amount() {
    let env = Env::default();
    let (client, admin, oracle, xlm) = deploy(&env);

    let bond = 10_000_000_i128;
    client.set_bond_amount(&admin, &bond);

    let creator = Address::generate(&env);
    fund(&env, &xlm, &creator, bond);
    approve(&env, &xlm, &creator, &client.address, bond);

    // Before creation: 0.
    assert_eq!(client.get_market_bond(&1_u64), 0);

    let market_id = client.create_market(&creator, &default_params(&env));

    // After creation: bond held.
    assert_eq!(client.get_market_bond(&market_id), bond);

    // After resolution: 0.
    env.ledger().with_mut(|l| l.timestamp += 3_000);
    client.resolve_market(&oracle, &market_id, &symbol_short!("yes"));
    assert_eq!(client.get_market_bond(&market_id), 0);
}
