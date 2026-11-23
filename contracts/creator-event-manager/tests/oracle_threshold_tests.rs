//! Integration tests for Issue #2202: configurable oracle consensus threshold.
//!
//! Verifies:
//! 1. A configured per-event threshold is enforced at finalization.
//! 2. Out-of-range thresholds are rejected.
//! 3. The global default (`min_sources`) applies when no override is set.

use creator_event_manager::storage;
use creator_event_manager::storage_types::Match;
use creator_event_manager::CreatorEventManagerContractClient;
use soroban_sdk::testutils::{Address as _, Ledger as _};
use soroban_sdk::token::StellarAssetClient;
use soroban_sdk::{Address, Env, String, Vec};

const FEE: i128 = 1_000_000;

struct Ctx {
    env: Env,
    client: CreatorEventManagerContractClient<'static>,
    admin: Address,
    event_id: u64,
    match_id: u64,
    sources: [Address; 3],
}

/// Initialize the contract, create one event with one match, and configure
/// three oracle sources with a global `min_sources` of 2.
fn setup() -> Ctx {
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

    let creator = Address::generate(&env);
    StellarAssetClient::new(&env, &xlm_token).mint(&creator, &FEE);
    let start_time = env.ledger().timestamp() + 3600;
    let end_time = env.ledger().timestamp() + 100_000;
    let (event_id, _invite_code) = client.create_event(
        &creator,
        &String::from_str(&env, "Threshold Event"),
        &String::from_str(&env, "Configurable consensus"),
        &10u32,
        &start_time,
        &end_time,
        &0i128,
        &Vec::new(&env),
        &0i128,
    );

    let match_id = env.as_contract(&contract_id, || {
        let match_id = storage::next_match_id(&env);
        let record = Match::new(
            match_id,
            event_id,
            String::from_str(&env, "Team A"),
            String::from_str(&env, "Team B"),
            start_time + 600,
            1u32,
            0,
        );
        storage::set_match(&env, match_id, &record);
        storage::add_event_match(&env, event_id, match_id);
        let mut event = storage::get_event(&env, event_id).expect("event exists");
        event.add_match();
        storage::set_event(&env, event_id, &event);
        match_id
    });

    let sources = [
        Address::generate(&env),
        Address::generate(&env),
        Address::generate(&env),
    ];
    let mut source_vec = Vec::new(&env);
    for s in sources.iter() {
        source_vec.push_back(s.clone());
    }
    client.configure_oracle_sources(&admin, &source_vec, &2u32);

    Ctx {
        env,
        client,
        admin,
        event_id,
        match_id,
        sources,
    }
}

fn result_submitted(ctx: &Ctx) -> bool {
    ctx.client.get_match(&ctx.match_id).result_submitted
}

#[test]
fn test_default_threshold_applies_when_unset() {
    let ctx = setup();
    assert_eq!(ctx.client.get_event_consensus_threshold(&ctx.event_id), 2);

    assert!(!ctx
        .client
        .propose_match_result(&ctx.sources[0], &ctx.match_id, &2u32, &1u32));
    assert!(ctx
        .client
        .propose_match_result(&ctx.sources[1], &ctx.match_id, &2u32, &1u32));
    assert!(result_submitted(&ctx));
}

#[test]
fn test_stricter_configured_threshold_is_enforced_at_finalization() {
    let ctx = setup();
    ctx.client
        .set_event_consensus_threshold(&ctx.admin, &ctx.event_id, &3u32);
    assert_eq!(ctx.client.get_event_consensus_threshold(&ctx.event_id), 3);

    // Two agreeing sources would satisfy the global default (2) but not the
    // event's stricter threshold.
    assert!(!ctx
        .client
        .propose_match_result(&ctx.sources[0], &ctx.match_id, &2u32, &1u32));
    assert!(!ctx
        .client
        .propose_match_result(&ctx.sources[1], &ctx.match_id, &2u32, &1u32));
    assert!(!result_submitted(&ctx));

    assert!(ctx
        .client
        .propose_match_result(&ctx.sources[2], &ctx.match_id, &2u32, &1u32));
    assert!(result_submitted(&ctx));
}

#[test]
fn test_looser_configured_threshold_is_enforced_at_finalization() {
    let ctx = setup();
    ctx.client
        .set_event_consensus_threshold(&ctx.admin, &ctx.event_id, &1u32);

    assert!(ctx
        .client
        .propose_match_result(&ctx.sources[0], &ctx.match_id, &0u32, &0u32));
    assert!(result_submitted(&ctx));
}

#[test]
#[should_panic(expected = "invalid_consensus_threshold")]
fn test_zero_threshold_is_rejected() {
    let ctx = setup();
    ctx.client
        .set_event_consensus_threshold(&ctx.admin, &ctx.event_id, &0u32);
}

#[test]
#[should_panic(expected = "invalid_consensus_threshold")]
fn test_threshold_above_source_count_is_rejected() {
    let ctx = setup();
    ctx.client
        .set_event_consensus_threshold(&ctx.admin, &ctx.event_id, &4u32);
}

#[test]
#[should_panic(expected = "unauthorized")]
fn test_non_admin_cannot_set_threshold() {
    let ctx = setup();
    let stranger = Address::generate(&ctx.env);
    ctx.client
        .set_event_consensus_threshold(&stranger, &ctx.event_id, &3u32);
}

#[test]
#[should_panic(expected = "event_not_found")]
fn test_threshold_for_unknown_event_is_rejected() {
    let ctx = setup();
    ctx.client
        .set_event_consensus_threshold(&ctx.admin, &999u64, &2u32);
}
