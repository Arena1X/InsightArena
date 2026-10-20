/// Tests for match management functions: add_match, get_match, list_event_matches, get_match_count.
use creator_event_manager::storage;
use creator_event_manager::storage_types::{DataKey, Match, MatchResult};
use creator_event_manager::CreatorEventManagerContractClient;
use soroban_sdk::testutils::Address as _;
use soroban_sdk::testutils::Ledger as _;
use soroban_sdk::token::StellarAssetClient;
use soroban_sdk::{Address, Env, String, Vec};

const FEE: i128 = 1_000_000;

fn setup() -> (
    Env,
    CreatorEventManagerContractClient<'static>,
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
    (env, client, contract_id, admin, xlm_token)
}

fn fund(env: &Env, token: &Address, user: &Address, amount: i128) {
    StellarAssetClient::new(env, token).mint(user, &amount);
}

fn title(env: &Env) -> String {
    String::from_str(env, "World Cup 2026 Predictions")
}

fn desc(env: &Env) -> String {
    String::from_str(env, "Predict the matches of the 2026 World Cup.")
}

fn get_future_time(env: &Env, offset_seconds: u64) -> u64 {
    env.ledger().timestamp() + offset_seconds
}

fn create_event_default(
    client: &CreatorEventManagerContractClient<'static>,
    env: &Env,
    creator: &Address,
    max_participants: u32,
) -> (u64, soroban_sdk::Symbol) {
    let start_time = get_future_time(env, 3600);
    let end_time = get_future_time(env, 7200);
    client.create_event(
        creator,
        &title(env),
        &desc(env),
        &max_participants,
        &start_time,
        &end_time,
        &0i128,
        &Vec::new(env),
        &0i128,
    )
}

#[test]
fn test_get_match_count_returns_zero_for_new_event() {
    let (env, client, _contract_id, _admin, xlm_token) = setup();
    let creator = Address::generate(&env);
    fund(&env, &xlm_token, &creator, FEE);

    let (event_id, _) = create_event_default(&client, &env, &creator, 5u32);

    assert_eq!(client.get_match_count(&event_id), 0);
}

#[test]
fn test_get_match_count_returns_correct_count() {
    let (env, client, contract_id, _admin, xlm_token) = setup();
    let creator = Address::generate(&env);
    fund(&env, &xlm_token, &creator, FEE);

    let (event_id, _) = create_event_default(&client, &env, &creator, 5u32);

    let _match_id = env.as_contract(&contract_id, || {
        let mut event = storage::get_event(&env, event_id).expect("event exists");
        event.add_match();
        storage::set_event(&env, event_id, &event);

        let match_id = storage::next_match_id(&env);
        let match_record = creator_event_manager::storage_types::Match::new(
            match_id,
            event_id,
            String::from_str(&env, "Team A"),
            String::from_str(&env, "Team B"),
            env.ledger().timestamp() + 10_000,
            1u32,
            0,
        );
        storage::set_match(&env, match_id, &match_record);
        storage::add_event_match(&env, event_id, match_id);
        match_id
    });

    assert_eq!(client.get_match_count(&event_id), 1);
}

#[test]
#[should_panic(expected = "event_not_found")]
fn test_get_match_count_missing_event_panics() {
    let (_env, client, _contract_id, _admin, _xlm_token) = setup();
    client.get_match_count(&999u64);
}

// ---------------------------------------------------------------------------
// list_event_matches tests
// ---------------------------------------------------------------------------

fn add_match(
    env: &Env,
    contract_id: &Address,
    event_id: u64,
    team_a: &str,
    team_b: &str,
    match_time: u64,
) -> u64 {
    env.as_contract(contract_id, || {
        let mut event = storage::get_event(env, event_id).expect("event exists");
        event.add_match();
        storage::set_event(env, event_id, &event);

        let match_id = storage::next_match_id(env);
        let match_record = creator_event_manager::storage_types::Match::new(
            match_id,
            event_id,
            String::from_str(env, team_a),
            String::from_str(env, team_b),
            match_time,
            1u32,
            0,
        );
        storage::set_match(env, match_id, &match_record);
        storage::add_event_match(env, event_id, match_id);
        match_id
    })
}

#[test]
fn test_list_event_matches_returns_all_matches() {
    let (env, client, contract_id, _admin, xlm_token) = setup();
    let creator = Address::generate(&env);
    fund(&env, &xlm_token, &creator, FEE);

    let (event_id, _) = create_event_default(&client, &env, &creator, 5u32);

    let base_time = 1_000_000u64;
    add_match(
        &env,
        &contract_id,
        event_id,
        "Team A",
        "Team B",
        base_time + 3000,
    );
    add_match(
        &env,
        &contract_id,
        event_id,
        "Team C",
        "Team D",
        base_time + 1000,
    );
    add_match(
        &env,
        &contract_id,
        event_id,
        "Team E",
        "Team F",
        base_time + 2000,
    );

    let matches = client.list_event_matches(&event_id);
    assert_eq!(matches.len(), 3);
}

#[test]
fn test_list_event_matches_empty_for_new_event() {
    let (env, client, _contract_id, _admin, xlm_token) = setup();
    let creator = Address::generate(&env);
    fund(&env, &xlm_token, &creator, FEE);

    let (event_id, _) = create_event_default(&client, &env, &creator, 5u32);

    let matches = client.list_event_matches(&event_id);
    assert_eq!(matches.len(), 0);
}

#[test]
fn test_list_event_matches_sorted_by_match_time_ascending() {
    let (env, client, contract_id, _admin, xlm_token) = setup();
    let creator = Address::generate(&env);
    fund(&env, &xlm_token, &creator, FEE);

    let (event_id, _) = create_event_default(&client, &env, &creator, 5u32);

    let base_time = 2_000_000u64;
    // Insert in reverse order to ensure sort is applied.
    add_match(
        &env,
        &contract_id,
        event_id,
        "Team A",
        "Team B",
        base_time + 3000,
    );
    add_match(
        &env,
        &contract_id,
        event_id,
        "Team C",
        "Team D",
        base_time + 1000,
    );
    add_match(
        &env,
        &contract_id,
        event_id,
        "Team E",
        "Team F",
        base_time + 2000,
    );

    let matches = client.list_event_matches(&event_id);
    assert_eq!(matches.len(), 3);
    assert_eq!(matches.get(0).unwrap().match_time, base_time + 1000);
    assert_eq!(matches.get(1).unwrap().match_time, base_time + 2000);
    assert_eq!(matches.get(2).unwrap().match_time, base_time + 3000);
}

#[test]
#[should_panic(expected = "event_not_found")]
fn test_list_event_matches_nonexistent_event_panics() {
    let (_env, client, _contract_id, _admin, _xlm_token) = setup();
    client.list_event_matches(&999u64);
}

// =============================================================================
// add_match (via storage manipulation) — comprehensive tests
// =============================================================================

fn add_match_full(
    env: &Env,
    contract_id: &Address,
    event_id: u64,
    team_a: &str,
    team_b: &str,
    match_time: u64,
) -> u64 {
    env.as_contract(contract_id, || {
        let mut event = storage::get_event(env, event_id).expect("event exists");
        event.add_match();
        storage::set_event(env, event_id, &event);

        let match_id = storage::next_match_id(env);
        let match_record = Match::new(
            match_id,
            event_id,
            String::from_str(env, team_a),
            String::from_str(env, team_b),
            match_time,
            1u32,
            0,
        );
        storage::set_match(env, match_id, &match_record);
        storage::add_event_match(env, event_id, match_id);
        match_id
    })
}

#[test]
fn test_add_match_stores_match_correctly() {
    let (env, client, contract_id, _admin, xlm_token) = setup();
    let creator = Address::generate(&env);
    fund(&env, &xlm_token, &creator, FEE);

    let (event_id, _) = create_event_default(&client, &env, &creator, 5u32);
    let match_time = env.ledger().timestamp() + 10_000;
    let match_id = add_match_full(&env, &contract_id, event_id, "Team A", "Team B", match_time);

    let stored = env.as_contract(&contract_id, || {
        storage::get_match(&env, match_id).expect("match should exist")
    });
    assert_eq!(stored.match_id, match_id);
    assert_eq!(stored.event_id, event_id);
    assert_eq!(stored.team_a, String::from_str(&env, "Team A"));
    assert_eq!(stored.team_b, String::from_str(&env, "Team B"));
    assert_eq!(stored.match_time, match_time);
    assert!(!stored.result_submitted);
    assert!(stored.winning_team.is_none());
}

#[test]
fn test_add_match_updates_event_match_list() {
    let (env, client, contract_id, _admin, xlm_token) = setup();
    let creator = Address::generate(&env);
    fund(&env, &xlm_token, &creator, FEE);

    let (event_id, _) = create_event_default(&client, &env, &creator, 5u32);
    let match_time = env.ledger().timestamp() + 10_000;

    let m1 = add_match_full(&env, &contract_id, event_id, "Team A", "Team B", match_time);
    let m2 = add_match_full(
        &env,
        &contract_id,
        event_id,
        "Team C",
        "Team D",
        match_time + 1000,
    );

    let match_ids = env.as_contract(&contract_id, || storage::get_event_matches(&env, event_id));
    assert_eq!(match_ids.len(), 2);
    assert_eq!(match_ids.get(0).unwrap(), m1);
    assert_eq!(match_ids.get(1).unwrap(), m2);
}

#[test]
fn test_add_match_increments_event_match_count() {
    let (env, client, contract_id, _admin, xlm_token) = setup();
    let creator = Address::generate(&env);
    fund(&env, &xlm_token, &creator, FEE);

    let (event_id, _) = create_event_default(&client, &env, &creator, 5u32);
    let match_time = env.ledger().timestamp() + 10_000;

    assert_eq!(client.get_match_count(&event_id), 0);
    add_match_full(&env, &contract_id, event_id, "Team A", "Team B", match_time);
    assert_eq!(client.get_match_count(&event_id), 1);
    add_match_full(
        &env,
        &contract_id,
        event_id,
        "Team C",
        "Team D",
        match_time + 1000,
    );
    assert_eq!(client.get_match_count(&event_id), 2);
}

#[test]
fn test_add_match_increments_global_match_counter() {
    let (env, client, contract_id, _admin, xlm_token) = setup();
    let creator = Address::generate(&env);
    fund(&env, &xlm_token, &creator, FEE);

    let (event_id, _) = create_event_default(&client, &env, &creator, 5u32);
    let match_time = env.ledger().timestamp() + 10_000;

    // Global counter starts at 1 after initialization
    let m1 = add_match_full(&env, &contract_id, event_id, "Team A", "Team B", match_time);
    assert_eq!(m1, 1);
    let m2 = add_match_full(
        &env,
        &contract_id,
        event_id,
        "Team C",
        "Team D",
        match_time + 1000,
    );
    assert_eq!(m2, 2);
}

#[test]
fn test_add_match_cancelled_event_does_not_affect_existing_match() {
    let (env, client, contract_id, _admin, xlm_token) = setup();
    let creator = Address::generate(&env);
    fund(&env, &xlm_token, &creator, FEE);

    let (event_id, _) = create_event_default(&client, &env, &creator, 5u32);
    let match_time = env.ledger().timestamp() + 10_000;

    let match_id = add_match_full(&env, &contract_id, event_id, "Team A", "Team B", match_time);

    // Cancel event
    env.as_contract(&contract_id, || {
        let mut event = storage::get_event(&env, event_id).expect("event exists");
        event.cancel();
        storage::set_event(&env, event_id, &event);
    });

    // Existing match should still be retrievable
    let stored = env.as_contract(&contract_id, || {
        storage::get_match(&env, match_id).expect("match should still exist")
    });
    assert_eq!(stored.match_id, match_id);
}

#[test]
fn test_add_match_validates_team_names_empty_rejected() {
    let env = Env::default();

    // Empty team A
    let m = Match::new(
        1,
        1,
        String::from_str(&env, ""),
        String::from_str(&env, "Team B"),
        100,
        1u32,
        0,
    );
    assert!(m.validate().is_err());

    // Empty team B
    let m = Match::new(
        1,
        1,
        String::from_str(&env, "Team A"),
        String::from_str(&env, ""),
        100,
        1u32,
        0,
    );
    assert!(m.validate().is_err());
}

#[test]
fn test_add_match_validates_team_uniqueness() {
    let env = Env::default();
    let name = String::from_str(&env, "Same Team");
    let m = Match::new(1, 1, name.clone(), name, 100, 1u32, 0);
    assert!(m.validate().is_err());
}

#[test]
fn test_add_match_validates_team_name_length() {
    let env = Env::default();
    let long_name = [b'x'; 101];

    let m = Match::new(
        1,
        1,
        String::from_bytes(&env, &long_name),
        String::from_str(&env, "Team B"),
        100,
        1u32,
        0,
    );
    assert!(m.validate().is_err());

    let m2 = Match::new(
        1,
        1,
        String::from_str(&env, "Team A"),
        String::from_bytes(&env, &long_name),
        100,
        1u32,
        0,
    );
    assert!(m2.validate().is_err());
}

#[test]
fn test_add_match_team_name_length_boundary_ok() {
    let env = Env::default();
    let exact_name = [b'x'; 100];
    let m = Match::new(
        1,
        1,
        String::from_bytes(&env, &exact_name),
        String::from_str(&env, "Team B"),
        100,
        1u32,
        0,
    );
    assert!(m.validate().is_ok());
}

// =============================================================================
// get_match tests
// =============================================================================

#[test]
fn test_get_match_returns_existing_match() {
    let (env, client, contract_id, _admin, xlm_token) = setup();
    let creator = Address::generate(&env);
    fund(&env, &xlm_token, &creator, FEE);

    let (event_id, _) = create_event_default(&client, &env, &creator, 5u32);
    let match_time = env.ledger().timestamp() + 10_000;
    let match_id = add_match_full(&env, &contract_id, event_id, "Team A", "Team B", match_time);

    let stored = env.as_contract(&contract_id, || {
        storage::get_match(&env, match_id).expect("match should exist")
    });
    assert_eq!(stored.match_id, match_id);
    assert_eq!(stored.event_id, event_id);
    assert_eq!(stored.team_a, String::from_str(&env, "Team A"));
}

#[test]
fn test_get_match_nonexistent_returns_error() {
    let (env, _client, contract_id, _admin, _xlm_token) = setup();
    let result = env.as_contract(&contract_id, || storage::get_match(&env, 99999u64));
    assert!(result.is_err());
}

#[test]
fn test_get_match_extends_ttl() {
    let (env, client, contract_id, _admin, xlm_token) = setup();
    let creator = Address::generate(&env);
    fund(&env, &xlm_token, &creator, FEE);

    let (event_id, _) = create_event_default(&client, &env, &creator, 5u32);
    let match_time = env.ledger().timestamp() + 10_000;
    let match_id = add_match_full(&env, &contract_id, event_id, "Team A", "Team B", match_time);

    // Read once (first read extends TTL from initial write)
    let _first_read = env.as_contract(&contract_id, || {
        storage::get_match(&env, match_id).expect("match exists")
    });
    // Read again (should extend TTL again)
    let stored = env.as_contract(&contract_id, || {
        storage::get_match(&env, match_id).expect("match exists")
    });
    assert_eq!(stored.match_id, match_id);
}

#[test]
fn test_get_match_after_result_submission() {
    let (env, client, contract_id, _admin, xlm_token) = setup();
    let creator = Address::generate(&env);
    fund(&env, &xlm_token, &creator, FEE);

    let (event_id, _) = create_event_default(&client, &env, &creator, 5u32);
    let match_time = env.ledger().timestamp() + 10_000;
    let match_id = add_match_full(&env, &contract_id, event_id, "Team A", "Team B", match_time);

    // Submit result
    env.as_contract(&contract_id, || {
        let mut m = storage::get_match(&env, match_id).expect("match exists");
        m.submit_result(
            MatchResult::TeamA,
            Address::generate(&env),
            env.ledger().timestamp(),
        )
        .unwrap();
        storage::set_match(&env, match_id, &m);
    });

    let stored = env.as_contract(&contract_id, || {
        storage::get_match(&env, match_id).expect("match exists")
    });
    assert!(stored.result_submitted);
    assert_eq!(stored.winning_team, Some(0u32));
}

#[test]
fn test_get_match_with_multiple_matches_returns_correct_one() {
    let (env, client, contract_id, _admin, xlm_token) = setup();
    let creator = Address::generate(&env);
    fund(&env, &xlm_token, &creator, FEE);

    let (event_id, _) = create_event_default(&client, &env, &creator, 5u32);
    let match_time = env.ledger().timestamp() + 10_000;

    let m1 = add_match_full(&env, &contract_id, event_id, "Team A", "Team B", match_time);
    let m2 = add_match_full(
        &env,
        &contract_id,
        event_id,
        "Team C",
        "Team D",
        match_time + 1000,
    );

    let stored1 = env.as_contract(&contract_id, || {
        storage::get_match(&env, m1).expect("match m1 exists")
    });
    let stored2 = env.as_contract(&contract_id, || {
        storage::get_match(&env, m2).expect("match m2 exists")
    });
    assert_eq!(stored1.match_id, m1);
    assert_eq!(stored2.match_id, m2);
    assert_ne!(stored1.match_id, stored2.match_id);
}

// =============================================================================
// list_event_matches — additional edge cases
// =============================================================================

#[test]
fn test_list_event_matches_single_match() {
    let (env, client, contract_id, _admin, xlm_token) = setup();
    let creator = Address::generate(&env);
    fund(&env, &xlm_token, &creator, FEE);

    let (event_id, _) = create_event_default(&client, &env, &creator, 5u32);
    let match_time = env.ledger().timestamp() + 10_000;
    add_match_full(&env, &contract_id, event_id, "Team A", "Team B", match_time);

    let matches = client.list_event_matches(&event_id);
    assert_eq!(matches.len(), 1);
    assert_eq!(
        matches.get(0).unwrap().team_a,
        String::from_str(&env, "Team A")
    );
}

#[test]
fn test_list_event_matches_handles_same_time_matches() {
    let (env, client, contract_id, _admin, xlm_token) = setup();
    let creator = Address::generate(&env);
    fund(&env, &xlm_token, &creator, FEE);

    let (event_id, _) = create_event_default(&client, &env, &creator, 5u32);
    let match_time = env.ledger().timestamp() + 10_000;

    add_match_full(&env, &contract_id, event_id, "Team A", "Team B", match_time);
    add_match_full(&env, &contract_id, event_id, "Team C", "Team D", match_time);

    let matches = client.list_event_matches(&event_id);
    assert_eq!(matches.len(), 2);
}

#[test]
fn test_list_event_matches_returns_different_events_separately() {
    let (env, client, contract_id, _admin, xlm_token) = setup();
    let creator = Address::generate(&env);
    fund(&env, &xlm_token, &creator, FEE * 2);

    let (event_id_1, _) = create_event_default(&client, &env, &creator, 5u32);
    let (event_id_2, _) = create_event_default(&client, &env, &creator, 5u32);

    let match_time = env.ledger().timestamp() + 10_000;
    add_match_full(
        &env,
        &contract_id,
        event_id_1,
        "Team A",
        "Team B",
        match_time,
    );
    add_match_full(
        &env,
        &contract_id,
        event_id_2,
        "Team C",
        "Team D",
        match_time,
    );

    assert_eq!(client.list_event_matches(&event_id_1).len(), 1);
    assert_eq!(client.list_event_matches(&event_id_2).len(), 1);
}

// =============================================================================
// get_match_count — additional edge cases
// =============================================================================

#[test]
fn test_get_match_count_increments_after_each_add() {
    let (env, client, contract_id, _admin, xlm_token) = setup();
    let creator = Address::generate(&env);
    fund(&env, &xlm_token, &creator, FEE);

    let (event_id, _) = create_event_default(&client, &env, &creator, 5u32);
    let match_time = env.ledger().timestamp() + 10_000;

    for i in 1..=5 {
        let team = format!("Team {}", i);
        add_match_full(
            &env,
            &contract_id,
            event_id,
            &team,
            "Opponent",
            match_time + (i as u64 * 1000),
        );
        assert_eq!(client.get_match_count(&event_id), i as u32);
    }
}

#[test]
fn test_get_match_count_independent_across_events() {
    let (env, client, contract_id, _admin, xlm_token) = setup();
    let creator = Address::generate(&env);
    fund(&env, &xlm_token, &creator, FEE * 3);

    let (event_id_1, _) = create_event_default(&client, &env, &creator, 5u32);
    let (event_id_2, _) = create_event_default(&client, &env, &creator, 5u32);

    let match_time = env.ledger().timestamp() + 10_000;
    add_match_full(
        &env,
        &contract_id,
        event_id_1,
        "Team A",
        "Team B",
        match_time,
    );
    add_match_full(
        &env,
        &contract_id,
        event_id_1,
        "Team C",
        "Team D",
        match_time + 1000,
    );
    add_match_full(
        &env,
        &contract_id,
        event_id_2,
        "Team E",
        "Team F",
        match_time,
    );

    assert_eq!(client.get_match_count(&event_id_1), 2);
    assert_eq!(client.get_match_count(&event_id_2), 1);
}

// =============================================================================
// get_match (via contract) — using env.as_contract pattern
// =============================================================================

#[test]
fn test_get_match_via_storage_returns_error_for_invalid_id() {
    let (env, _client, contract_id, _admin, _xlm_token) = setup();
    let result = env.as_contract(&contract_id, || storage::get_match(&env, 0u64));
    assert!(result.is_err());
}

#[test]
fn test_add_match_team_time_can_be_in_future() {
    let (env, client, contract_id, _admin, xlm_token) = setup();
    let creator = Address::generate(&env);
    fund(&env, &xlm_token, &creator, FEE);

    let (event_id, _) = create_event_default(&client, &env, &creator, 5u32);
    // Future time (1 year from now)
    let future_time = env.ledger().timestamp() + 31_536_000;
    let match_id = add_match_full(
        &env,
        &contract_id,
        event_id,
        "Team A",
        "Team B",
        future_time,
    );

    let stored = env.as_contract(&contract_id, || {
        storage::get_match(&env, match_id).expect("future match should exist")
    });
    assert_eq!(stored.match_time, future_time);
}

// =============================================================================
// create_match on a cancelled event (#1032)
// =============================================================================

#[test]
#[should_panic(expected = "event_cancelled")]
fn test_create_match_on_cancelled_event_panics_event_cancelled() {
    let (env, client, _contract_id, _admin, xlm_token) = setup();
    let creator = Address::generate(&env);
    fund(&env, &xlm_token, &creator, FEE);

    let (event_id, _) = create_event_default(&client, &env, &creator, 5u32);

    // Transition the event to cancelled state via the contract entry point.
    client.cancel_event(&creator, &event_id);

    // create_match on a cancelled event must panic with "event_cancelled".
    client.create_match(
        &creator,
        &event_id,
        &String::from_str(&env, "Team A"),
        &String::from_str(&env, "Team B"),
        &get_future_time(&env, 4000),
        &1u32,
    );
}

#[test]
fn test_create_match_on_non_cancelled_event_same_creator_succeeds() {
    let (env, client, _contract_id, _admin, xlm_token) = setup();
    let creator = Address::generate(&env);
    fund(&env, &xlm_token, &creator, FEE);

    let (event_id, _) = create_event_default(&client, &env, &creator, 5u32);

    // Event is active; create_match by the same creator must succeed.
    let match_id = client.create_match(
        &creator,
        &event_id,
        &String::from_str(&env, "Team A"),
        &String::from_str(&env, "Team B"),
        &get_future_time(&env, 4000),
        &1u32,
    );
    assert!(match_id >= 1);
}

#[test]
fn test_add_match_team_time_can_be_in_past() {
    let (env, client, contract_id, _admin, xlm_token) = setup();
    let creator = Address::generate(&env);
    fund(&env, &xlm_token, &creator, FEE);

    let (event_id, _) = create_event_default(&client, &env, &creator, 5u32);
    // Past time (already started)
    env.ledger().with_mut(|l| l.timestamp = 100_000);
    let past_time = env.ledger().timestamp() - 3600;
    let match_id = add_match_full(&env, &contract_id, event_id, "Team A", "Team B", past_time);

    let stored = env.as_contract(&contract_id, || {
        storage::get_match(&env, match_id).expect("past match should exist")
    });
    assert_eq!(stored.match_time, past_time);
    assert!(stored.has_started(env.ledger().timestamp()));
}

// =============================================================================
// client get_match tests
// =============================================================================

#[test]
fn test_get_match_via_client_success() {
    let (env, client, contract_id, _admin, xlm_token) = setup();
    let creator = Address::generate(&env);
    fund(&env, &xlm_token, &creator, FEE);

    let (event_id, _) = create_event_default(&client, &env, &creator, 5u32);
    let match_time = env.ledger().timestamp() + 10_000;
    let match_id = add_match_full(&env, &contract_id, event_id, "Team A", "Team B", match_time);

    let m = client.get_match(&match_id);
    assert_eq!(m.match_id, match_id);
    assert_eq!(m.event_id, event_id);
    assert_eq!(m.team_a, String::from_str(&env, "Team A"));
    assert_eq!(m.team_b, String::from_str(&env, "Team B"));
    assert_eq!(m.match_time, match_time);
}

#[test]
#[should_panic(expected = "match_not_found")]
fn test_get_match_via_client_not_found_panics() {
    let (_env, client, _contract_id, _admin, _xlm_token) = setup();
    client.get_match(&99999u64);
}

#[test]
fn test_get_match_via_client_extends_ttl() {
    let (env, client, contract_id, _admin, xlm_token) = setup();
    let creator = Address::generate(&env);
    fund(&env, &xlm_token, &creator, FEE);

    let (event_id, _) = create_event_default(&client, &env, &creator, 5u32);
    let match_time = env.ledger().timestamp() + 10_000;
    let match_id = add_match_full(&env, &contract_id, event_id, "Team A", "Team B", match_time);

    let current_ledger = env.ledger().get().sequence_number;
    env.ledger().set_sequence_number(current_ledger + 1);

    let m = client.get_match(&match_id);
    assert_eq!(m.match_id, match_id);
}

#[test]
fn test_list_event_matches_sorts_same_time_by_match_id_deterministically() {
    let (env, client, contract_id, _admin, xlm_token) = setup();
    let creator = Address::generate(&env);
    fund(&env, &xlm_token, &creator, FEE);

    let (event_id, _) = create_event_default(&client, &env, &creator, 5u32);
    let match_time = env.ledger().timestamp() + 10_000;

    let first_id = add_match_full(&env, &contract_id, event_id, "Team A", "Team B", match_time);
    let second_id = add_match_full(&env, &contract_id, event_id, "Team C", "Team D", match_time);
    let third_id = add_match_full(&env, &contract_id, event_id, "Team E", "Team F", match_time);

    env.as_contract(&contract_id, || {
        env.storage().persistent().set(
            &DataKey::EventMatches(event_id),
            &soroban_sdk::vec![&env, third_id, second_id, first_id],
        );
    });

    let first_call = client.list_event_matches(&event_id);
    let second_call = client.list_event_matches(&event_id);

    assert_eq!(first_call.len(), 3);
    assert_eq!(first_call.get(0).unwrap().match_id, first_id);
    assert_eq!(first_call.get(1).unwrap().match_id, second_id);
    assert_eq!(first_call.get(2).unwrap().match_id, third_id);

    assert_eq!(second_call.get(0).unwrap().match_id, first_id);
    assert_eq!(second_call.get(1).unwrap().match_id, second_id);
    assert_eq!(second_call.get(2).unwrap().match_id, third_id);
}

// =============================================================================
// create_match — match_time outside event window (#1016)
// =============================================================================

#[test]
#[should_panic(expected = "invalid_match_time")]
fn test_create_match_rejects_match_time_at_end_time() {
    let (env, client, _contract_id, _admin, xlm_token) = setup();
    let creator = Address::generate(&env);
    fund(&env, &xlm_token, &creator, FEE);

    let (event_id, _) = create_event_default(&client, &env, &creator, 5u32);
    let event = env.as_contract(&_contract_id, || {
        creator_event_manager::storage::get_event(&env, event_id).unwrap()
    });

    client.create_match(
        &creator,
        &event_id,
        &String::from_str(&env, "Team A"),
        &String::from_str(&env, "Team B"),
        &event.end_time,
        &1u32,
    );
}

#[test]
#[should_panic(expected = "invalid_match_time")]
fn test_create_match_rejects_match_time_after_end_time() {
    let (env, client, _contract_id, _admin, xlm_token) = setup();
    let creator = Address::generate(&env);
    fund(&env, &xlm_token, &creator, FEE);

    let (event_id, _) = create_event_default(&client, &env, &creator, 5u32);
    let event = env.as_contract(&_contract_id, || {
        creator_event_manager::storage::get_event(&env, event_id).unwrap()
    });

    client.create_match(
        &creator,
        &event_id,
        &String::from_str(&env, "Team A"),
        &String::from_str(&env, "Team B"),
        &(event.end_time + 1),
        &1u32,
    );
}

#[test]
fn test_create_match_accepts_match_time_before_end_time() {
    let (env, client, _contract_id, _admin, xlm_token) = setup();
    let creator = Address::generate(&env);
    fund(&env, &xlm_token, &creator, FEE);

    let (event_id, _) = create_event_default(&client, &env, &creator, 5u32);
    let event = env.as_contract(&_contract_id, || {
        creator_event_manager::storage::get_event(&env, event_id).unwrap()
    });

    let match_id = client.create_match(
        &creator,
        &event_id,
        &String::from_str(&env, "Team A"),
        &String::from_str(&env, "Team B"),
        &(event.end_time - 60),
        &1u32,
    );
    assert!(match_id > 0);
}
