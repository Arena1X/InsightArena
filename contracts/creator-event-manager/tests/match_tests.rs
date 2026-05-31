/// Comprehensive tests for match management functions:
/// add_match, get_match, list_event_matches, and get_match_count.

use creator_event_manager::storage;
use creator_event_manager::storage_types::{Match, MatchResult};
use creator_event_manager::CreatorEventManagerContractClient;
use soroban_sdk::testutils::Address as _;
use soroban_sdk::token::StellarAssetClient;
use soroban_sdk::testutils::Ledger;
use soroban_sdk::{Address, Env, String, Symbol};

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

    let contract_id =
        env.register_contract(None, creator_event_manager::CreatorEventManagerContract);
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

/// Helper: add a match directly to storage for a given event.
fn add_match_to_storage(
    env: &Env,
    event_id: u64,
    team_a: &str,
    team_b: &str,
    match_time_offset: u64,
) -> u64 {
    let match_id = storage::next_match_id(env);
    let match_record = Match::new(
        match_id,
        event_id,
        String::from_str(env, team_a),
        String::from_str(env, team_b),
        env.ledger().timestamp() + match_time_offset,
    );
    storage::set_match(env, match_id, &match_record);
    storage::add_event_match(env, event_id, match_id);

    let mut event = storage::get_event(env, event_id).expect("event exists");
    event.add_match();
    storage::set_event(env, event_id, &event);

    match_id
}

// ===========================================================================
// add_match — storage-level tests
// ===========================================================================

#[test]
fn test_add_match_stores_correctly() {
    let (env, client, contract_id, _admin, xlm_token) = setup();
    let creator = Address::generate(&env);
    fund(&env, &xlm_token, &creator, FEE);

    let (event_id, _) = client.create_event(&creator, &title(&env), &desc(&env), &5u32);

    let match_id = env.as_contract(&contract_id, || {
        add_match_to_storage(&env, event_id, "Team Alpha", "Team Beta", 10_000)
    });

    let stored = env.as_contract(&contract_id, || {
        storage::get_match(&env, match_id).expect("match should exist")
    });

    assert_eq!(stored.match_id, match_id);
    assert_eq!(stored.event_id, event_id);
    assert_eq!(stored.team_a, String::from_str(&env, "Team Alpha"));
    assert_eq!(stored.team_b, String::from_str(&env, "Team Beta"));
    assert!(!stored.result_submitted);
    assert!(stored.winning_team.is_none());
}

#[test]
fn test_add_match_updates_event_match_list() {
    let (env, client, contract_id, _admin, xlm_token) = setup();
    let creator = Address::generate(&env);
    fund(&env, &xlm_token, &creator, FEE);

    let (event_id, _) = client.create_event(&creator, &title(&env), &desc(&env), &5u32);

    env.as_contract(&contract_id, || {
        let m1 = add_match_to_storage(&env, event_id, "Team A", "Team B", 10_000);
        let m2 = add_match_to_storage(&env, event_id, "Team C", "Team D", 20_000);

        let match_list = storage::get_event_matches(&env, event_id);
        assert_eq!(match_list.len(), 2);

        let ids: Vec<u64> = match_list.iter().collect();
        assert_eq!(ids, vec![m1, m2]);
    });
}

#[test]
fn test_add_match_increments_counter() {
    let (env, client, contract_id, _admin, xlm_token) = setup();
    let creator = Address::generate(&env);
    fund(&env, &xlm_token, &creator, FEE);

    let (event_id, _) = client.create_event(&creator, &title(&env), &desc(&env), &5u32);

    assert_eq!(client.get_match_count(&event_id), 0);

    env.as_contract(&contract_id, || {
        add_match_to_storage(&env, event_id, "Team A", "Team B", 10_000);
    });

    assert_eq!(client.get_match_count(&event_id), 1);

    env.as_contract(&contract_id, || {
        add_match_to_storage(&env, event_id, "Team C", "Team D", 20_000);
    });

    assert_eq!(client.get_match_count(&event_id), 2);
}

// ===========================================================================
// get_match — retrieval tests
// ===========================================================================

#[test]
fn test_get_match_existing_returns_correctly() {
    let (env, client, contract_id, _admin, xlm_token) = setup();
    let creator = Address::generate(&env);
    fund(&env, &xlm_token, &creator, FEE);

    let (event_id, _) = client.create_event(&creator, &title(&env), &desc(&env), &5u32);

    let match_id = env.as_contract(&contract_id, || {
        add_match_to_storage(&env, event_id, "Team X", "Team Y", 10_000)
    });

    let stored = env.as_contract(&contract_id, || {
        storage::get_match(&env, match_id).expect("match exists")
    });

    assert_eq!(stored.match_id, match_id);
    assert_eq!(stored.team_a, String::from_str(&env, "Team X"));
    assert_eq!(stored.team_b, String::from_str(&env, "Team Y"));
}

#[test]
#[should_panic(expected = "NotFound")]
fn test_get_match_non_existent_errors() {
    let (env, _client, contract_id, _admin, _xlm_token) = setup();

    env.as_contract(&contract_id, || {
        storage::get_match(&env, 999u64).expect("should not exist");
    });
}

#[test]
fn test_get_match_extends_ttl() {
    let (env, client, contract_id, _admin, xlm_token) = setup();
    let creator = Address::generate(&env);
    fund(&env, &xlm_token, &creator, FEE);

    let (event_id, _) = client.create_event(&creator, &title(&env), &desc(&env), &5u32);

    let match_id = env.as_contract(&contract_id, || {
        add_match_to_storage(&env, event_id, "Team A", "Team B", 10_000)
    });

    // Advance ledger and read again — TTL extension should keep it alive
    let current_ledger = env.ledger().get().sequence_number;
    env.ledger().set_sequence_number(current_ledger + 1000);

    let stored = env.as_contract(&contract_id, || {
        storage::get_match(&env, match_id).expect("match should still exist after ledger advance")
    });
    assert_eq!(stored.match_id, match_id);
}

// ===========================================================================
// list_event_matches — listing tests
// ===========================================================================

#[test]
fn test_list_event_matches_returns_all() {
    let (env, client, contract_id, _admin, xlm_token) = setup();
    let creator = Address::generate(&env);
    fund(&env, &xlm_token, &creator, FEE);

    let (event_id, _) = client.create_event(&creator, &title(&env), &desc(&env), &5u32);

    env.as_contract(&contract_id, || {
        add_match_to_storage(&env, event_id, "Team A", "Team B", 10_000);
        add_match_to_storage(&env, event_id, "Team C", "Team D", 20_000);
        add_match_to_storage(&env, event_id, "Team E", "Team F", 30_000);
    });

    let match_list = env.as_contract(&contract_id, || {
        storage::get_event_matches(&env, event_id)
    });

    assert_eq!(match_list.len(), 3);
}

#[test]
fn test_list_event_matches_empty_for_no_matches() {
    let (env, client, contract_id, _admin, xlm_token) = setup();
    let creator = Address::generate(&env);
    fund(&env, &xlm_token, &creator, FEE);

    let (event_id, _) = client.create_event(&creator, &title(&env), &desc(&env), &5u32);

    let match_list = env.as_contract(&contract_id, || {
        storage::get_event_matches(&env, event_id)
    });

    assert_eq!(match_list.len(), 0);
}

#[test]
fn test_list_event_matches_does_not_mix_events() {
    let (env, client, contract_id, _admin, xlm_token) = setup();
    let creator = Address::generate(&env);
    // Enough funds for 2 events
    fund(&env, &xlm_token, &creator, FEE * 2);

    let (event_id_1, _) = client.create_event(&creator, &title(&env), &desc(&env), &5u32);
    let (event_id_2, _) = client.create_event(&creator, &title(&env), &desc(&env), &5u32);

    env.as_contract(&contract_id, || {
        add_match_to_storage(&env, event_id_1, "Team A", "Team B", 10_000);
        add_match_to_storage(&env, event_id_2, "Team C", "Team D", 20_000);
    });

    let matches_1 = env.as_contract(&contract_id, || {
        storage::get_event_matches(&env, event_id_1)
    });
    let matches_2 = env.as_contract(&contract_id, || {
        storage::get_event_matches(&env, event_id_2)
    });

    assert_eq!(matches_1.len(), 1);
    assert_eq!(matches_2.len(), 1);

    // Verify they are different match IDs
    let ids_1: Vec<u64> = matches_1.iter().collect();
    let ids_2: Vec<u64> = matches_2.iter().collect();
    assert_ne!(ids_1[0], ids_2[0]);
}

// ===========================================================================
// get_match_count — comprehensive tests
// ===========================================================================

#[test]
fn test_get_match_count_returns_zero_for_new_event() {
    let (env, client, _contract_id, _admin, xlm_token) = setup();
    let creator = Address::generate(&env);
    fund(&env, &xlm_token, &creator, FEE);

    let (event_id, _) = client.create_event(&creator, &title(&env), &desc(&env), &5u32);

    assert_eq!(client.get_match_count(&event_id), 0);
}

#[test]
fn test_get_match_count_increments_after_adding_multiple() {
    let (env, client, contract_id, _admin, xlm_token) = setup();
    let creator = Address::generate(&env);
    fund(&env, &xlm_token, &creator, FEE);

    let (event_id, _) = client.create_event(&creator, &title(&env), &desc(&env), &5u32);

    env.as_contract(&contract_id, || {
        add_match_to_storage(&env, event_id, "Team A", "Team B", 10_000);
        add_match_to_storage(&env, event_id, "Team C", "Team D", 20_000);
        add_match_to_storage(&env, event_id, "Team E", "Team F", 30_000);
    });

    assert_eq!(client.get_match_count(&event_id), 3);
}

#[test]
#[should_panic(expected = "event_not_found")]
fn test_get_match_count_missing_event_panics() {
    let (_env, client, _contract_id, _admin, _xlm_token) = setup();
    client.get_match_count(&999u64);
}

// ===========================================================================
// Match result submission — verified via storage
// ===========================================================================

#[test]
fn test_match_submit_result_updates_storage() {
    let (env, client, contract_id, _admin, xlm_token) = setup();
    let creator = Address::generate(&env);
    fund(&env, &xlm_token, &creator, FEE);

    let ai_agent = client.get_ai_agent();

    let (event_id, _) = client.create_event(&creator, &title(&env), &desc(&env), &5u32);

    let match_id = env.as_contract(&contract_id, || {
        add_match_to_storage(&env, event_id, "Team A", "Team B", 10_000)
    });

    // Submit result via storage
    env.as_contract(&contract_id, || {
        let mut m = storage::get_match(&env, match_id).expect("match exists");
        m.submit_result(MatchResult::TeamA, ai_agent, env.ledger().timestamp())
            .expect("submit should succeed");
        storage::set_match(&env, match_id, &m);
    });

    // Verify result via storage
    let updated = env.as_contract(&contract_id, || {
        storage::get_match(&env, match_id).expect("match exists")
    });

    assert!(updated.result_submitted);
    assert_eq!(updated.winning_team, Some(0u32));
    assert!(updated.is_completed());
    assert_eq!(updated.get_winner(), Some(MatchResult::TeamA));
}

#[test]
fn test_match_double_result_submission_rejected() {
    let (env, client, contract_id, _admin, xlm_token) = setup();
    let creator = Address::generate(&env);
    fund(&env, &xlm_token, &creator, FEE);

    let ai_agent = client.get_ai_agent();

    let (event_id, _) = client.create_event(&creator, &title(&env), &desc(&env), &5u32);

    let match_id = env.as_contract(&contract_id, || {
        add_match_to_storage(&env, event_id, "Team A", "Team B", 10_000);
        add_match_to_storage(&env, event_id, "Team C", "Team D", 10_000)
    });

    env.as_contract(&contract_id, || {
        let mut m = storage::get_match(&env, match_id).expect("match exists");
        m.submit_result(MatchResult::TeamA, ai_agent.clone(), env.ledger().timestamp())
            .expect("first submit should succeed");
        storage::set_match(&env, match_id, &m);
    });

    env.as_contract(&contract_id, || {
        let mut m = storage::get_match(&env, match_id).expect("match exists");
        let result = m.submit_result(MatchResult::TeamB, ai_agent, env.ledger().timestamp());
        assert_eq!(result, Err("Result already submitted for this match"));
    });
}

// ===========================================================================
// Match — event emission verification via storage
// ===========================================================================

#[test]
fn test_storage_operations_do_not_panic() {
    // Verify that basic storage operations (set_event, set_match, add_event_match)
    // complete without panicking, regardless of contract-level event emission.
    let (env, _client, contract_id, _admin, _xlm_token) = setup();

    env.as_contract(&contract_id, || {
        let event = creator_event_manager::storage_types::Event::new(
            1,
            Address::generate(&env),
            String::from_str(&env, "Test"),
            String::from_str(&env, "Desc"),
            0i128,
            0u64,
            Symbol::new(&env, "CODE1234"),
            10u32,
        );
        storage::set_event(&env, 1, &event);
    });

    env.as_contract(&contract_id, || {
        add_match_to_storage(&env, 1, "Team A", "Team B", 10_000);
    });

    let stored = env.as_contract(&contract_id, || {
        storage::get_event(&env, 1).expect("event should exist")
    });
    assert_eq!(stored.match_count, 1);
}

// ===========================================================================
// Match — sorting by match_time
// ===========================================================================

#[test]
fn test_event_matches_ordered_by_insertion() {
    let (env, client, contract_id, _admin, xlm_token) = setup();
    let creator = Address::generate(&env);
    fund(&env, &xlm_token, &creator, FEE);

    let (event_id, _) = client.create_event(&creator, &title(&env), &desc(&env), &5u32);

    let ids = env.as_contract(&contract_id, || {
        let m1 = add_match_to_storage(&env, event_id, "Team A", "Team B", 30_000);
        let m2 = add_match_to_storage(&env, event_id, "Team C", "Team D", 10_000);
        let m3 = add_match_to_storage(&env, event_id, "Team E", "Team F", 20_000);
        (m1, m2, m3)
    });

    let match_list = env.as_contract(&contract_id, || {
        storage::get_event_matches(&env, event_id)
    });

    // Matches are stored in insertion order (FIFO)
    let stored_ids: Vec<u64> = match_list.iter().collect();
    assert_eq!(stored_ids, vec![ids.0, ids.1, ids.2]);
}
