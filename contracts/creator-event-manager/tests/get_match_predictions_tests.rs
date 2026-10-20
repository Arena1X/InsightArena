//! #808 — Integration tests for the public `get_match_predictions` view
//! (exercised through the contract client), covering:
//! - Returns all predictions for a match
//! - Empty list for a match with no predictions
//! - Correct count
//! - Unknown match id yields an empty list

use creator_event_manager::storage;
use creator_event_manager::CreatorEventManagerContractClient;
use soroban_sdk::testutils::Address as _;
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

fn get_future_time(env: &Env, offset_seconds: u64) -> u64 {
    env.ledger().timestamp() + offset_seconds
}

fn create_event_with_match(
    env: &Env,
    contract_id: &Address,
    client: &CreatorEventManagerContractClient<'static>,
    creator: &Address,
    xlm_token: &Address,
    match_time_offset: u64,
) -> (u64, Symbol, u64) {
    fund(env, xlm_token, creator, FEE);
    let start_time = get_future_time(env, 3600);
    let end_time = get_future_time(env, 7200);
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
        let match_record = creator_event_manager::storage_types::Match::new(
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

    (event_id, invite_code, match_id)
}

#[test]
fn test_returns_all_predictions_for_match() {
    let (env, client, contract_id, _admin, _ai_agent, xlm_token) = setup();
    let creator = Address::generate(&env);
    let (_event_id, invite, match_id) =
        create_event_with_match(&env, &contract_id, &client, &creator, &xlm_token, 10_000);

    let u1 = Address::generate(&env);
    let u2 = Address::generate(&env);
    let u3 = Address::generate(&env);
    client.join_event(&u1, &invite);
    client.join_event(&u2, &invite);
    client.join_event(&u3, &invite);
    client.submit_prediction(&u1, &match_id, &2u32, &1u32); // Team A wins 2-1
    client.submit_prediction(&u2, &match_id, &1u32, &2u32); // Team B wins 1-2
    client.submit_prediction(&u3, &match_id, &1u32, &1u32); // Draw 1-1

    let predictions = client.get_match_predictions(&match_id);
    assert_eq!(predictions.len(), 3);

    let mut matched = 0u32;
    for p in predictions.iter() {
        assert_eq!(p.match_id, match_id);
        if p.predictor == u1 || p.predictor == u2 || p.predictor == u3 {
            matched += 1;
        }
    }
    assert_eq!(matched, 3);
}

#[test]
fn test_empty_list_for_match_with_no_predictions() {
    let (env, client, contract_id, _admin, _ai_agent, xlm_token) = setup();
    let creator = Address::generate(&env);
    let (_event_id, _invite, match_id) =
        create_event_with_match(&env, &contract_id, &client, &creator, &xlm_token, 10_000);

    let predictions = client.get_match_predictions(&match_id);
    assert_eq!(predictions.len(), 0);
}

#[test]
fn test_correct_count() {
    let (env, client, contract_id, _admin, _ai_agent, xlm_token) = setup();
    let creator = Address::generate(&env);
    let (_event_id, invite, match_id) =
        create_event_with_match(&env, &contract_id, &client, &creator, &xlm_token, 10_000);

    let u1 = Address::generate(&env);
    let u2 = Address::generate(&env);
    client.join_event(&u1, &invite);
    client.join_event(&u2, &invite);
    client.submit_prediction(&u1, &match_id, &2u32, &1u32);
    client.submit_prediction(&u2, &match_id, &2u32, &1u32);

    assert_eq!(client.get_match_predictions(&match_id).len(), 2);
}

#[test]
fn test_unknown_match_returns_empty() {
    let (_env, client, _contract_id, _admin, _ai_agent, _xlm_token) = setup();
    let predictions = client.get_match_predictions(&99_999u64);
    assert_eq!(predictions.len(), 0);
}
