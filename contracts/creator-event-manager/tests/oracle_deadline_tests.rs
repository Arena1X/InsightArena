//! Tests for creator event oracle submission deadline enforcement (#2010).
//!
//! # Boundary Rule
//! A submission at `now == deadline` (where `deadline == event.end_time`) is ACCEPTED
//! (inclusive boundary rule: `now <= deadline`). Submissions made strictly after the
//! deadline (`now > deadline`) are rejected with [`OracleError::SubmissionDeadlinePassed`].
//!
//! Evaluated against `env.ledger().timestamp()` across all oracle result submission entry points:
//! - `submit_match_result`
//! - `propose_match_result`
//! - `submit_oracle_value`

use creator_event_manager::oracle::{self, OracleError};
use creator_event_manager::storage;
use creator_event_manager::storage_types::Match;
use creator_event_manager::CreatorEventManagerContractClient;
use soroban_sdk::testutils::Address as _;
use soroban_sdk::testutils::Ledger as _;
use soroban_sdk::token::StellarAssetClient;
use soroban_sdk::{Address, Env, String, Symbol, Vec};

const FEE: i128 = 1_000_000;

fn setup() -> (
    Env,
    CreatorEventManagerContractClient<'static>,
    Address,
    Address,
    Address,
    Address,
) {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(creator_event_manager::CreatorEventManagerContract, ());
    let client = CreatorEventManagerContractClient::new(&env, &contract_id);
    let client: CreatorEventManagerContractClient<'static> =
        unsafe { core::mem::transmute(client) };

    let admin = Address::generate(&env);
    let ai_agent = Address::generate(&env);
    let treasury = Address::generate(&env);
    let token_admin = Address::generate(&env);
    let xlm_token = env
        .register_stellar_asset_contract_v2(token_admin)
        .address();

    client.initialize(&admin, &ai_agent, &treasury, &xlm_token, &FEE);
    (env, client, contract_id, admin, ai_agent, xlm_token)
}

fn fund(env: &Env, token: &Address, user: &Address, amount: i128) {
    StellarAssetClient::new(env, token).mint(user, &amount);
}

fn title(env: &Env) -> String {
    String::from_str(env, "Test Event")
}

fn desc(env: &Env) -> String {
    String::from_str(env, "Test Description")
}

fn create_event_with_match(
    env: &Env,
    contract_id: &Address,
    client: &CreatorEventManagerContractClient<'static>,
    creator: &Address,
    xlm_token: &Address,
    match_time_offset: u64,
    event_duration: u64,
) -> (u64, Symbol, u64, u64) {
    fund(env, xlm_token, creator, FEE);
    let start_time = env.ledger().timestamp() + 3600;
    let end_time = env.ledger().timestamp() + event_duration;
    let (event_id, invite_code) = client.create_event(
        creator,
        &title(env),
        &desc(env),
        &10u32,
        &start_time,
        &end_time,
        &0i128,
        &Vec::new(env),
        &0i128,
    );

    let match_id = env.as_contract(contract_id, || {
        let match_id = storage::next_match_id(env);
        let match_record = Match::new(
            match_id,
            event_id,
            String::from_str(env, "Team A"),
            String::from_str(env, "Team B"),
            env.ledger().timestamp() + match_time_offset,
            1u32,
            0,
        );
        storage::set_match(env, match_id, &match_record);
        storage::add_event_match(env, event_id, match_id);

        let mut event = storage::get_event(env, event_id).expect("event exists");
        event.add_match();
        storage::set_event(env, event_id, &event);
        match_id
    });

    (event_id, invite_code, match_id, end_time)
}

fn read_match(env: &Env, contract_id: &Address, match_id: u64) -> Match {
    env.as_contract(contract_id, || storage::get_match(env, match_id).unwrap())
}

// ============================================================================
// submit_match_result — Deadline Enforcement (#2010)
// ============================================================================

/// A submission before the deadline (`now < deadline` and `now >= match_time`)
/// is accepted.
#[test]
fn test_submit_match_result_before_deadline_accepted() {
    let (env, client, contract_id, _admin, ai_agent, xlm_token) = setup();
    let creator = Address::generate(&env);
    let (_event_id, _invite, match_id, deadline) =
        create_event_with_match(&env, &contract_id, &client, &creator, &xlm_token, 1_000, 10_000);

    // Place time after match start (1000) and before the deadline (10000)
    env.ledger().with_mut(|l| l.timestamp = deadline - 500);

    client.submit_match_result(&ai_agent, &match_id, &2u32, &1u32);

    let m = read_match(&env, &contract_id, match_id);
    assert!(m.result_submitted);
    assert_eq!(m.home_score, Some(2));
    assert_eq!(m.away_score, Some(1));
    assert_eq!(m.winning_team, Some(0)); // Team A
}

/// A submission exactly at the deadline boundary (`now == deadline`) is accepted
/// per the documented inclusive rule (`now <= deadline`).
#[test]
fn test_submit_match_result_at_boundary_accepted() {
    let (env, client, contract_id, _admin, ai_agent, xlm_token) = setup();
    let creator = Address::generate(&env);
    let (_event_id, _invite, match_id, deadline) =
        create_event_with_match(&env, &contract_id, &client, &creator, &xlm_token, 1_000, 10_000);

    // Place time exactly at the deadline boundary: now == deadline
    env.ledger().with_mut(|l| l.timestamp = deadline);

    client.submit_match_result(&ai_agent, &match_id, &1u32, &1u32);

    let m = read_match(&env, &contract_id, match_id);
    assert!(m.result_submitted);
    assert_eq!(m.home_score, Some(1));
    assert_eq!(m.away_score, Some(1));
    assert_eq!(m.winning_team, Some(2)); // Draw
}

/// A submission after the deadline (`now > deadline`) is rejected with
/// `"submission_deadline_passed"`.
#[test]
#[should_panic(expected = "submission_deadline_passed")]
fn test_submit_match_result_after_deadline_rejected() {
    let (env, client, contract_id, _admin, ai_agent, xlm_token) = setup();
    let creator = Address::generate(&env);
    let (_event_id, _invite, match_id, deadline) =
        create_event_with_match(&env, &contract_id, &client, &creator, &xlm_token, 1_000, 10_000);

    // Place time past the deadline: now > deadline
    env.ledger().with_mut(|l| l.timestamp = deadline + 1);

    client.submit_match_result(&ai_agent, &match_id, &2u32, &1u32);
}

/// Direct module invocation verifies that [`OracleError::SubmissionDeadlinePassed`]
/// is returned when `now > deadline`.
#[test]
fn test_submit_match_result_direct_error_after_deadline() {
    let (env, client, contract_id, _admin, ai_agent, xlm_token) = setup();
    let creator = Address::generate(&env);
    let (_event_id, _invite, match_id, deadline) =
        create_event_with_match(&env, &contract_id, &client, &creator, &xlm_token, 1_000, 10_000);

    // Place time strictly after deadline
    env.ledger().with_mut(|l| l.timestamp = deadline + 1);

    let result = env.as_contract(&contract_id, || {
        oracle::submit_match_result(&env, ai_agent, match_id, 2, 1)
    });
    assert_eq!(result, Err(OracleError::SubmissionDeadlinePassed));
}

// ============================================================================
// propose_match_result — Deadline Enforcement (#2010)
// ============================================================================

/// A scoreline proposal submitted before the deadline (`now < deadline`) is accepted.
#[test]
fn test_propose_match_result_before_deadline_accepted() {
    let (env, client, contract_id, admin, _ai_agent, xlm_token) = setup();
    let creator = Address::generate(&env);
    let (_event_id, _invite, match_id, deadline) =
        create_event_with_match(&env, &contract_id, &client, &creator, &xlm_token, 1_000, 10_000);

    let source = Address::generate(&env);
    let mut sources = Vec::new(&env);
    sources.push_back(source.clone());
    client.configure_oracle_sources(&admin, &sources, &1u32);

    // Place time before deadline: now < deadline
    env.ledger().with_mut(|l| l.timestamp = deadline - 200);

    let finalized = client.propose_match_result(&source, &match_id, &2u32, &1u32);
    assert!(finalized);

    let m = read_match(&env, &contract_id, match_id);
    assert!(m.result_submitted);
}

/// A scoreline proposal submitted exactly at the deadline boundary (`now == deadline`)
/// is accepted per the documented inclusive rule.
#[test]
fn test_propose_match_result_at_boundary_accepted() {
    let (env, client, contract_id, admin, _ai_agent, xlm_token) = setup();
    let creator = Address::generate(&env);
    let (_event_id, _invite, match_id, deadline) =
        create_event_with_match(&env, &contract_id, &client, &creator, &xlm_token, 1_000, 10_000);

    let source = Address::generate(&env);
    let mut sources = Vec::new(&env);
    sources.push_back(source.clone());
    client.configure_oracle_sources(&admin, &sources, &1u32);

    // Place time exactly at the deadline boundary: now == deadline
    env.ledger().with_mut(|l| l.timestamp = deadline);

    let finalized = client.propose_match_result(&source, &match_id, &0u32, &3u32);
    assert!(finalized);

    let m = read_match(&env, &contract_id, match_id);
    assert!(m.result_submitted);
    assert_eq!(m.winning_team, Some(1)); // Team B
}

/// A scoreline proposal submitted after the deadline (`now > deadline`) is rejected.
#[test]
#[should_panic(expected = "submission_deadline_passed")]
fn test_propose_match_result_after_deadline_rejected() {
    let (env, client, contract_id, admin, _ai_agent, xlm_token) = setup();
    let creator = Address::generate(&env);
    let (_event_id, _invite, match_id, deadline) =
        create_event_with_match(&env, &contract_id, &client, &creator, &xlm_token, 1_000, 10_000);

    let source = Address::generate(&env);
    let mut sources = Vec::new(&env);
    sources.push_back(source.clone());
    client.configure_oracle_sources(&admin, &sources, &1u32);

    // Place time past deadline: now > deadline
    env.ledger().with_mut(|l| l.timestamp = deadline + 1);

    client.propose_match_result(&source, &match_id, &2u32, &1u32);
}

/// Direct module invocation verifies that [`OracleError::SubmissionDeadlinePassed`]
/// is returned for proposals past the deadline.
#[test]
fn test_propose_match_result_direct_error_after_deadline() {
    let (env, client, contract_id, admin, _ai_agent, xlm_token) = setup();
    let creator = Address::generate(&env);
    let (_event_id, _invite, match_id, deadline) =
        create_event_with_match(&env, &contract_id, &client, &creator, &xlm_token, 1_000, 10_000);

    let source = Address::generate(&env);
    let mut sources = Vec::new(&env);
    sources.push_back(source.clone());
    client.configure_oracle_sources(&admin, &sources, &1u32);

    env.ledger().with_mut(|l| l.timestamp = deadline + 10);

    let result = env.as_contract(&contract_id, || {
        oracle::propose_match_result(&env, source, match_id, 2, 1)
    });
    assert_eq!(result, Err(OracleError::SubmissionDeadlinePassed));
}

// ============================================================================
// submit_oracle_value — Deadline Enforcement (#2010)
// ============================================================================

/// An oracle numeric value submitted before the deadline (`now < deadline`) is accepted.
#[test]
fn test_submit_oracle_value_before_deadline_accepted() {
    let (env, client, contract_id, admin, _ai_agent, xlm_token) = setup();
    let creator = Address::generate(&env);
    let (_event_id, _invite, match_id, deadline) =
        create_event_with_match(&env, &contract_id, &client, &creator, &xlm_token, 1_000, 10_000);

    let source = Address::generate(&env);
    let mut sources = Vec::new(&env);
    sources.push_back(source.clone());
    client.configure_oracle_sources(&admin, &sources, &1u32);

    // Place time before deadline: now < deadline
    env.ledger().with_mut(|l| l.timestamp = deadline - 500);

    client.submit_oracle_value(&source, &match_id, &42i128);

    let submissions = client.get_oracle_submissions(&match_id);
    assert_eq!(submissions.len(), 1);
}

/// An oracle numeric value submitted exactly at the deadline boundary (`now == deadline`)
/// is accepted per the documented inclusive rule.
#[test]
fn test_submit_oracle_value_at_boundary_accepted() {
    let (env, client, contract_id, admin, _ai_agent, xlm_token) = setup();
    let creator = Address::generate(&env);
    let (_event_id, _invite, match_id, deadline) =
        create_event_with_match(&env, &contract_id, &client, &creator, &xlm_token, 1_000, 10_000);

    let source = Address::generate(&env);
    let mut sources = Vec::new(&env);
    sources.push_back(source.clone());
    client.configure_oracle_sources(&admin, &sources, &1u32);

    // Place time exactly at deadline: now == deadline
    env.ledger().with_mut(|l| l.timestamp = deadline);

    client.submit_oracle_value(&source, &match_id, &42i128);

    let submissions = client.get_oracle_submissions(&match_id);
    assert_eq!(submissions.len(), 1);
}

/// An oracle numeric value submitted after the deadline (`now > deadline`) is rejected.
#[test]
#[should_panic(expected = "submission_deadline_passed")]
fn test_submit_oracle_value_after_deadline_rejected() {
    let (env, client, contract_id, admin, _ai_agent, xlm_token) = setup();
    let creator = Address::generate(&env);
    let (_event_id, _invite, match_id, deadline) =
        create_event_with_match(&env, &contract_id, &client, &creator, &xlm_token, 1_000, 10_000);

    let source = Address::generate(&env);
    let mut sources = Vec::new(&env);
    sources.push_back(source.clone());
    client.configure_oracle_sources(&admin, &sources, &1u32);

    // Place time past deadline: now > deadline
    env.ledger().with_mut(|l| l.timestamp = deadline + 1);

    client.submit_oracle_value(&source, &match_id, &42i128);
}

/// Direct module invocation verifies that [`OracleError::SubmissionDeadlinePassed`]
/// is returned for numeric values submitted past the deadline.
#[test]
fn test_submit_oracle_value_direct_error_after_deadline() {
    let (env, client, contract_id, admin, _ai_agent, xlm_token) = setup();
    let creator = Address::generate(&env);
    let (_event_id, _invite, match_id, deadline) =
        create_event_with_match(&env, &contract_id, &client, &creator, &xlm_token, 1_000, 10_000);

    let source = Address::generate(&env);
    let mut sources = Vec::new(&env);
    sources.push_back(source.clone());
    client.configure_oracle_sources(&admin, &sources, &1u32);

    env.ledger().with_mut(|l| l.timestamp = deadline + 1);

    let result = env.as_contract(&contract_id, || {
        oracle::submit_oracle_value(&env, source, match_id, 42)
    });
    assert_eq!(result, Err(OracleError::SubmissionDeadlinePassed));
}
