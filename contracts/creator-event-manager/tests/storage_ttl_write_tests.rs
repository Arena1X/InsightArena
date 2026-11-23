//! Integration tests for Issue #2201:
//! Extend storage TTL on write to prevent expiry.
//!
//! Verifies:
//! 1. Writing an entry extends its TTL to the configured bump — including
//!    writes made after the parent event is no longer active.
//! 2. A long-lived entry does not expire under periodic writes.
//! 3. Read-only operations follow the read policy: active-event state is
//!    extended on read, finalized state is not.

use creator_event_manager::storage::{self, TTL_BUMP, TTL_THRESHOLD};
use creator_event_manager::storage_types::DataKey;
use creator_event_manager::CreatorEventManagerContractClient;
use soroban_sdk::testutils::{storage::Persistent as _, Address as _, Ledger as _};
use soroban_sdk::token::StellarAssetClient;
use soroban_sdk::{Address, Env, String, Vec};

const FEE: i128 = 1_000_000;

fn setup() -> (Env, CreatorEventManagerContractClient<'static>, Address, Address) {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().with_mut(|li| li.timestamp = 1_700_000_000);

    let contract_id = env.register(creator_event_manager::CreatorEventManagerContract, ());
    let client = CreatorEventManagerContractClient::new(&env, &contract_id);
    let client: CreatorEventManagerContractClient<'static> =
        unsafe { core::mem::transmute(client) };

    let admin = Address::generate(&env);
    let ai_agent = Address::generate(&env);
    let treasury = Address::generate(&env);
    let xlm_token = env
        .register_stellar_asset_contract_v2(Address::generate(&env))
        .address();

    client.initialize(&admin, &ai_agent, &treasury, &xlm_token, &FEE);
    (env, client, contract_id, xlm_token)
}

fn create_event(
    env: &Env,
    client: &CreatorEventManagerContractClient<'static>,
    xlm_token: &Address,
) -> u64 {
    let creator = Address::generate(env);
    StellarAssetClient::new(env, xlm_token).mint(&creator, &FEE);
    let start_time = env.ledger().timestamp() + 3600;
    let end_time = env.ledger().timestamp() + 7200;
    let (event_id, _invite_code) = client.create_event(
        &creator,
        &String::from_str(env, "TTL Event"),
        &String::from_str(env, "TTL on write"),
        &50u32,
        &start_time,
        &end_time,
        &0i128,
        &Vec::new(env),
        &0i128,
    );
    event_id
}

/// Keep the contract instance alive while the ledger advances.
fn keep_instance_alive(env: &Env, contract_id: &Address) {
    env.as_contract(contract_id, || {
        env.storage().instance().extend_ttl(TTL_THRESHOLD, TTL_BUMP);
    });
}

fn advance_ledgers(env: &Env, ledgers: u32) {
    env.ledger().with_mut(|l| l.sequence_number += ledgers);
}

fn ttl(env: &Env, contract_id: &Address, key: &DataKey) -> u32 {
    env.as_contract(contract_id, || env.storage().persistent().get_ttl(key))
}

/// Mark an event finalized directly in storage so it is no longer active.
fn finalize_in_storage(env: &Env, contract_id: &Address, event_id: u64) {
    env.as_contract(contract_id, || {
        let mut event = storage::get_event_raw(env, event_id).expect("event exists");
        event.is_finalized = true;
        storage::set_event(env, event_id, &event);
    });
}

#[test]
fn test_writing_an_entry_extends_its_ttl() {
    let (env, client, contract_id, xlm_token) = setup();
    let event_id = create_event(&env, &client, &xlm_token);
    let event_key = DataKey::Event(event_id);

    advance_ledgers(&env, 100_000);
    keep_instance_alive(&env, &contract_id);
    let decayed = ttl(&env, &contract_id, &event_key);
    assert!(decayed < TTL_BUMP);

    // A write to an inactive (finalized) event must still extend its TTL —
    // previously only active-event writes did, so the final write could
    // leave the entry close to expiry.
    finalize_in_storage(&env, &contract_id, event_id);
    assert_eq!(ttl(&env, &contract_id, &event_key), TTL_BUMP);

    // Same for list and claim entries written after finalization.
    env.as_contract(&contract_id, || {
        storage::add_event_match(&env, event_id, 42);
        storage::set_claim_deadline(&env, event_id, 1_800_000_000);
    });
    assert_eq!(
        ttl(&env, &contract_id, &DataKey::EventMatches(event_id)),
        TTL_BUMP
    );
    assert_eq!(
        ttl(&env, &contract_id, &DataKey::ClaimDeadline(event_id)),
        TTL_BUMP
    );
}

#[test]
fn test_long_lived_entry_does_not_expire_under_periodic_writes() {
    let (env, client, contract_id, xlm_token) = setup();
    let event_id = create_event(&env, &client, &xlm_token);
    finalize_in_storage(&env, &contract_id, event_id);
    let key = DataKey::ClaimDeadline(event_id);

    // Total elapsed ledgers (4 × 2_500_000 = 10_000_000) far exceed a single
    // TTL_BUMP (6_307_200); only the periodic writes keep the entry alive.
    let step = 2_500_000_u32;
    for i in 0..4u64 {
        env.as_contract(&contract_id, || {
            storage::set_claim_deadline(&env, event_id, 1_800_000_000 + i);
        });
        assert_eq!(ttl(&env, &contract_id, &key), TTL_BUMP);

        advance_ledgers(&env, step);
        keep_instance_alive(&env, &contract_id);
        assert_eq!(ttl(&env, &contract_id, &key), TTL_BUMP - step);
    }

    let deadline = env.as_contract(&contract_id, || storage::get_claim_deadline(&env, event_id));
    assert_eq!(deadline, Some(1_800_000_003));
}

#[test]
fn test_read_only_ops_follow_ttl_policy() {
    let (env, client, contract_id, xlm_token) = setup();
    let event_id = create_event(&env, &client, &xlm_token);
    let event_key = DataKey::Event(event_id);

    // Active event: a read extends the TTL.
    advance_ledgers(&env, 100_000);
    keep_instance_alive(&env, &contract_id);
    assert!(ttl(&env, &contract_id, &event_key) < TTL_BUMP);
    let _ = client.get_event(&event_id);
    assert_eq!(ttl(&env, &contract_id, &event_key), TTL_BUMP);

    // Finalized event: reads leave the TTL decaying so old state can expire.
    finalize_in_storage(&env, &contract_id, event_id);
    advance_ledgers(&env, 100_000);
    keep_instance_alive(&env, &contract_id);
    let decayed = ttl(&env, &contract_id, &event_key);
    let _ = client.get_event(&event_id);
    env.as_contract(&contract_id, || {
        let _ = storage::get_event(&env, event_id);
        let _ = storage::get_event_matches(&env, event_id);
    });
    assert_eq!(ttl(&env, &contract_id, &event_key), decayed);
}
