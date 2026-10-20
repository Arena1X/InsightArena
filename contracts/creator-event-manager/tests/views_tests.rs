/// Tests for aggregate event statistics views.
use creator_event_manager::storage;
use creator_event_manager::storage_types::{
    Match, MatchResult, Prediction, FINALIZATION_BOND_STROOPS,
};
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
    (env, client, contract_id, xlm_token)
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

fn add_match(env: &Env, event_id: u64, submitted: bool) -> u64 {
    let match_id = storage::next_match_id(env);
    let mut match_record = Match::new(
        match_id,
        event_id,
        String::from_str(env, "Team A"),
        String::from_str(env, "Team B"),
        env.ledger().timestamp() + 10_000,
        1u32,
        0,
    );

    if submitted {
        match_record
            .submit_result(
                MatchResult::TeamA,
                Address::generate(env),
                env.ledger().timestamp(),
            )
            .expect("result can be submitted");
    }

    storage::set_match(env, match_id, &match_record);
    storage::add_event_match(env, event_id, match_id);

    let mut event = storage::get_event(env, event_id).expect("event exists");
    event.add_match();
    storage::set_event(env, event_id, &event);

    match_id
}

fn add_prediction(env: &Env, event_id: u64, match_id: u64, predictor: &Address) {
    let prediction_id = storage::next_prediction_id(env);
    let prediction = Prediction::new(
        prediction_id,
        match_id,
        event_id,
        predictor.clone(),
        2u32,
        1u32,
        env.ledger().timestamp(),
        env,
    );
    storage::set_prediction(env, prediction_id, &prediction);
    storage::add_match_prediction(env, match_id, prediction_id);
    storage::add_user_prediction(env, predictor, event_id, prediction_id);
}

#[test]
fn test_get_event_participants_returns_all_participants() {
    let (env, client, _contract_id, xlm_token) = setup();
    let creator = Address::generate(&env);
    let user_one = Address::generate(&env);
    let user_two = Address::generate(&env);
    let user_three = Address::generate(&env);
    fund(&env, &xlm_token, &creator, FEE);

    let start_time = get_future_time(&env, 3600);
    let end_time = get_future_time(&env, 7200);
    let (event_id, invite_code) = client.create_event(
        &creator,
        &title(&env),
        &desc(&env),
        &5u32,
        &start_time,
        &end_time,
        &0i128,
        &Vec::new(&env),
        &0i128,
    );
    client.join_event(&user_one, &invite_code);
    client.join_event(&user_two, &invite_code);
    client.join_event(&user_three, &invite_code);

    let participants = client.get_event_participants(&event_id);

    assert_eq!(participants.len(), 3);
    assert_eq!(participants.get(0).unwrap(), user_one);
    assert_eq!(participants.get(1).unwrap(), user_two);
    assert_eq!(participants.get(2).unwrap(), user_three);
}

#[test]
fn test_get_event_participants_empty_for_new_event() {
    let (env, client, _contract_id, xlm_token) = setup();
    let creator = Address::generate(&env);
    fund(&env, &xlm_token, &creator, FEE);

    let start_time = get_future_time(&env, 3600);
    let end_time = get_future_time(&env, 7200);
    let (event_id, _) = client.create_event(
        &creator,
        &title(&env),
        &desc(&env),
        &5u32,
        &start_time,
        &end_time,
        &0i128,
        &Vec::new(&env),
        &0i128,
    );

    let participants = client.get_event_participants(&event_id);
    assert_eq!(participants.len(), 0);
}

#[test]
fn test_get_event_participants_updates_as_participants_join() {
    let (env, client, _contract_id, xlm_token) = setup();
    let creator = Address::generate(&env);
    let user_one = Address::generate(&env);
    let user_two = Address::generate(&env);
    fund(&env, &xlm_token, &creator, FEE);

    let start_time = get_future_time(&env, 3600);
    let end_time = get_future_time(&env, 7200);
    let (event_id, invite_code) = client.create_event(
        &creator,
        &title(&env),
        &desc(&env),
        &5u32,
        &start_time,
        &end_time,
        &0i128,
        &Vec::new(&env),
        &0i128,
    );

    let initial_participants = client.get_event_participants(&event_id);
    assert_eq!(initial_participants.len(), 0);

    client.join_event(&user_one, &invite_code);
    let one_participant = client.get_event_participants(&event_id);
    assert_eq!(one_participant.len(), 1);
    assert_eq!(one_participant.get(0).unwrap(), user_one);

    client.join_event(&user_two, &invite_code);
    let two_participants = client.get_event_participants(&event_id);
    assert_eq!(two_participants.len(), 2);
    assert_eq!(two_participants.get(0).unwrap(), user_one);
    assert_eq!(two_participants.get(1).unwrap(), user_two);
}

#[test]
#[should_panic(expected = "event_not_found")]
fn test_get_event_participants_missing_event_panics() {
    let (_env, client, _contract_id, _xlm_token) = setup();
    client.get_event_participants(&999u64);
}

#[test]
fn test_event_statistics_are_accurate() {
    let (env, client, contract_id, xlm_token) = setup();
    let creator = Address::generate(&env);
    let user_one = Address::generate(&env);
    let user_two = Address::generate(&env);
    fund(&env, &xlm_token, &creator, FEE);

    let start_time = get_future_time(&env, 3600);
    let end_time = get_future_time(&env, 7200);
    let (event_id, invite_code) = client.create_event(
        &creator,
        &title(&env),
        &desc(&env),
        &5u32,
        &start_time,
        &end_time,
        &0i128,
        &Vec::new(&env),
        &0i128,
    );
    client.join_event(&user_one, &invite_code);
    client.join_event(&user_two, &invite_code);

    env.as_contract(&contract_id, || {
        let first_match = add_match(&env, event_id, false);
        let second_match = add_match(&env, event_id, false);

        add_prediction(&env, event_id, first_match, &user_one);
        add_prediction(&env, event_id, first_match, &user_two);
        add_prediction(&env, event_id, second_match, &user_one);
    });

    let statistics = client.get_event_statistics(&event_id);
    assert_eq!(statistics.event_id, event_id);
    assert_eq!(statistics.participant_count, 2);
    assert_eq!(statistics.match_count, 2);
    assert_eq!(statistics.total_predictions, 3);
    assert!(!statistics.all_matches_resolved);
}

#[test]
fn test_event_statistics_completion_status() {
    let (env, client, contract_id, xlm_token) = setup();
    let creator = Address::generate(&env);
    fund(&env, &xlm_token, &creator, FEE);

    let start_time = get_future_time(&env, 3600);
    let end_time = get_future_time(&env, 7200);
    let (event_id, _) = client.create_event(
        &creator,
        &title(&env),
        &desc(&env),
        &5u32,
        &start_time,
        &end_time,
        &0i128,
        &Vec::new(&env),
        &0i128,
    );

    env.as_contract(&contract_id, || {
        add_match(&env, event_id, true);
        add_match(&env, event_id, false);
    });

    let pending_statistics = client.get_event_statistics(&event_id);
    assert!(!pending_statistics.all_matches_resolved);

    env.as_contract(&contract_id, || {
        for match_id in storage::get_event_matches(&env, event_id).iter() {
            let mut match_record = storage::get_match(&env, match_id).expect("match exists");
            if !match_record.result_submitted {
                match_record
                    .submit_result(
                        MatchResult::TeamA,
                        Address::generate(&env),
                        env.ledger().timestamp(),
                    )
                    .expect("result can be submitted");
                storage::set_match(&env, match_id, &match_record);
            }
        }
    });

    let completed_statistics = client.get_event_statistics(&event_id);
    assert!(completed_statistics.all_matches_resolved);
}

/// #1706 — `get_event_statistics` must read `EventParticipants` /
/// `EventMatches` directly rather than trusting the cached
/// `Event.participant_count` / `Event.match_count` counters, so a view stays
/// correct even if those cached counters were ever to desync from the
/// source lists (e.g. a future code path that mutates one without the
/// other). This test forces exactly that desync directly in storage and
/// asserts the view still reports the true, source-derived counts.
#[test]
fn test_event_statistics_match_source_records_after_counter_drift() {
    let (env, client, contract_id, xlm_token) = setup();
    let creator = Address::generate(&env);
    let user_one = Address::generate(&env);
    let user_two = Address::generate(&env);
    let user_three = Address::generate(&env);
    fund(&env, &xlm_token, &creator, FEE);

    let start_time = get_future_time(&env, 3600);
    let end_time = get_future_time(&env, 7200);
    let (event_id, invite_code) = client.create_event(
        &creator,
        &title(&env),
        &desc(&env),
        &5u32,
        &start_time,
        &end_time,
        &0i128,
        &Vec::new(&env),
        &0i128,
    );

    client.join_event(&user_one, &invite_code);
    client.join_event(&user_two, &invite_code);
    client.join_event(&user_three, &invite_code);

    env.as_contract(&contract_id, || {
        add_match(&env, event_id, false);
        add_match(&env, event_id, false);
        add_match(&env, event_id, false);

        // Simulate the cached counters falling out of sync with the source
        // lists (the drift scenario #1706 guards against) by rewriting them
        // directly, without touching EventParticipants / EventMatches.
        let mut event = storage::get_event(&env, event_id).expect("event exists");
        event.participant_count = 1;
        event.match_count = 1;
        storage::set_event(&env, event_id, &event);
    });

    let statistics = client.get_event_statistics(&event_id);

    // The view must reflect the real source records (3 participants, 3
    // matches), not the desynced cached counters (1, 1).
    assert_eq!(statistics.participant_count, 3);
    assert_eq!(statistics.match_count, 3);
}

#[test]
#[should_panic(expected = "event_not_found")]
fn test_event_statistics_missing_event_panics() {
    let (_env, client, _contract_id, _xlm_token) = setup();
    client.get_event_statistics(&999u64);
}

// ============================================================================
// Platform Statistics Tests (#821)
// ============================================================================

#[test]
fn test_get_platform_statistics_all_statistics_accurate() {
    let (env, client, contract_id, xlm_token) = setup();
    let creator1 = Address::generate(&env);
    let creator2 = Address::generate(&env);
    let user1 = Address::generate(&env);
    let user2 = Address::generate(&env);

    // Create first event
    fund(&env, &xlm_token, &creator1, FEE);
    let start_time = get_future_time(&env, 3600);
    let end_time = get_future_time(&env, 7200);
    let (event_id_1, invite_code_1) = client.create_event(
        &creator1,
        &title(&env),
        &desc(&env),
        &5u32,
        &start_time,
        &end_time,
        &0i128,
        &Vec::new(&env),
        &0i128,
    );
    client.join_event(&user1, &invite_code_1);
    client.join_event(&user2, &invite_code_1);

    env.as_contract(&contract_id, || {
        let match_id = add_match(&env, event_id_1, false);
        add_prediction(&env, event_id_1, match_id, &user1);
        add_prediction(&env, event_id_1, match_id, &user2);
    });

    // Create second event
    fund(&env, &xlm_token, &creator2, FEE);
    let start_time2 = get_future_time(&env, 3700);
    let end_time2 = get_future_time(&env, 7300);
    let (event_id_2, invite_code_2) = client.create_event(
        &creator2,
        &title(&env),
        &desc(&env),
        &5u32,
        &start_time2,
        &end_time2,
        &0i128,
        &Vec::new(&env),
        &0i128,
    );
    client.join_event(&user1, &invite_code_2);

    env.as_contract(&contract_id, || {
        let match_id = add_match(&env, event_id_2, false);
        add_prediction(&env, event_id_2, match_id, &user1);
    });

    let stats = client.get_platform_statistics();

    assert_eq!(stats.total_events, 2);
    assert_eq!(stats.total_matches, 2);
    assert_eq!(stats.total_predictions, 3);
    assert_eq!(stats.unique_participants, 2); // user1 and user2
    assert_eq!(stats.total_fees_collected, FEE * 2);
}

#[test]
fn test_get_platform_statistics_counters_increment_correctly() {
    let (env, client, contract_id, xlm_token) = setup();
    let creator = Address::generate(&env);

    // Initial state
    let initial_stats = client.get_platform_statistics();
    assert_eq!(initial_stats.total_events, 0);
    assert_eq!(initial_stats.total_matches, 0);
    assert_eq!(initial_stats.total_predictions, 0);

    // Create event
    fund(&env, &xlm_token, &creator, FEE);
    let start_time = get_future_time(&env, 3600);
    let end_time = get_future_time(&env, 7200);
    let (event_id, _) = client.create_event(
        &creator,
        &title(&env),
        &desc(&env),
        &5u32,
        &start_time,
        &end_time,
        &0i128,
        &Vec::new(&env),
        &0i128,
    );

    let after_event = client.get_platform_statistics();
    assert_eq!(after_event.total_events, 1);
    assert_eq!(after_event.total_fees_collected, FEE);

    // Add match
    env.as_contract(&contract_id, || {
        add_match(&env, event_id, false);
    });

    let after_match = client.get_platform_statistics();
    assert_eq!(after_match.total_matches, 1);

    // Add prediction
    let user = Address::generate(&env);
    env.as_contract(&contract_id, || {
        storage::add_event_participant(&env, event_id, &user);
        let match_id = storage::get_event_matches(&env, event_id).get(0).unwrap();
        add_prediction(&env, event_id, match_id, &user);
    });

    let after_prediction = client.get_platform_statistics();
    assert_eq!(after_prediction.total_predictions, 1);
}

#[test]
fn test_get_platform_statistics_unique_participants_calculated() {
    let (env, client, _contract_id, xlm_token) = setup();
    let creator = Address::generate(&env);
    let user1 = Address::generate(&env);
    let user2 = Address::generate(&env);

    // Event 1 with user1 and user2
    fund(&env, &xlm_token, &creator, FEE);
    let start_time1 = get_future_time(&env, 3600);
    let end_time1 = get_future_time(&env, 7200);
    let (_event_id_1, invite_code_1) = client.create_event(
        &creator,
        &title(&env),
        &desc(&env),
        &5u32,
        &start_time1,
        &end_time1,
        &0i128,
        &Vec::new(&env),
        &0i128,
    );
    client.join_event(&user1, &invite_code_1);
    client.join_event(&user2, &invite_code_1);

    // Event 2 with user1 only (should not double count)
    fund(&env, &xlm_token, &creator, FEE);
    let start_time2 = get_future_time(&env, 3700);
    let end_time2 = get_future_time(&env, 7300);
    let (_event_id_2, invite_code_2) = client.create_event(
        &creator,
        &title(&env),
        &desc(&env),
        &5u32,
        &start_time2,
        &end_time2,
        &0i128,
        &Vec::new(&env),
        &0i128,
    );
    client.join_event(&user1, &invite_code_2);

    let stats = client.get_platform_statistics();
    assert_eq!(stats.unique_participants, 2); // Only user1 and user2, no duplicates
}

#[test]
fn test_get_platform_statistics_empty_platform() {
    let (_env, client, _contract_id, _xlm_token) = setup();

    let stats = client.get_platform_statistics();

    assert_eq!(stats.total_events, 0);
    assert_eq!(stats.total_matches, 0);
    assert_eq!(stats.total_predictions, 0);
    assert_eq!(stats.unique_participants, 0);
    assert_eq!(stats.total_fees_collected, 0);
}

#[test]
fn test_get_platform_statistics_fees_accumulated() {
    let (env, client, _contract_id, xlm_token) = setup();
    let creator1 = Address::generate(&env);
    let creator2 = Address::generate(&env);
    let creator3 = Address::generate(&env);

    fund(&env, &xlm_token, &creator1, FEE);
    let start_time1 = get_future_time(&env, 3600);
    let end_time1 = get_future_time(&env, 7200);
    client.create_event(
        &creator1,
        &title(&env),
        &desc(&env),
        &5u32,
        &start_time1,
        &end_time1,
        &0i128,
        &Vec::new(&env),
        &0i128,
    );

    fund(&env, &xlm_token, &creator2, FEE);
    let start_time2 = get_future_time(&env, 3700);
    let end_time2 = get_future_time(&env, 7300);
    client.create_event(
        &creator2,
        &title(&env),
        &desc(&env),
        &5u32,
        &start_time2,
        &end_time2,
        &0i128,
        &Vec::new(&env),
        &0i128,
    );

    fund(&env, &xlm_token, &creator3, FEE);
    let start_time3 = get_future_time(&env, 3800);
    let end_time3 = get_future_time(&env, 7400);
    client.create_event(
        &creator3,
        &title(&env),
        &desc(&env),
        &5u32,
        &start_time3,
        &end_time3,
        &0i128,
        &Vec::new(&env),
        &0i128,
    );

    let stats = client.get_platform_statistics();
    assert_eq!(stats.total_fees_collected, FEE * 3);
}

#[test]
fn test_get_platform_statistics_comprehensive_counter_test() {
    let (env, client, contract_id, xlm_token) = setup();
    let creator = Address::generate(&env);
    let user1 = Address::generate(&env);
    let user2 = Address::generate(&env);
    let user3 = Address::generate(&env);

    // Start: call get_platform_statistics; assert all counters are 0.
    let initial_stats = client.get_platform_statistics();
    assert_eq!(initial_stats.total_events, 0);
    assert_eq!(initial_stats.total_matches, 0);
    assert_eq!(initial_stats.total_predictions, 0);
    assert_eq!(initial_stats.unique_participants, 0);
    assert_eq!(initial_stats.total_fees_collected, 0);

    // Create 2 events; assert total_events == 2.
    fund(&env, &xlm_token, &creator, FEE);
    let start_time = get_future_time(&env, 3600);
    let end_time = get_future_time(&env, 7200);
    let (event_id_1, invite_code_1) = client.create_event(
        &creator,
        &title(&env),
        &desc(&env),
        &10u32,
        &start_time,
        &end_time,
        &0i128,
        &Vec::new(&env),
        &0i128,
    );

    fund(&env, &xlm_token, &creator, FEE);
    let start_time2 = get_future_time(&env, 3700);
    let end_time2 = get_future_time(&env, 7300);
    let (event_id_2, invite_code_2) = client.create_event(
        &creator,
        &title(&env),
        &desc(&env),
        &10u32,
        &start_time2,
        &end_time2,
        &0i128,
        &Vec::new(&env),
        &0i128,
    );

    let after_events = client.get_platform_statistics();
    assert_eq!(after_events.total_events, 2);
    assert_eq!(after_events.total_fees_collected, FEE * 2);

    // Add 2 matches to each event (4 total); assert total_matches == 4.
    let (match_id_1_1, match_id_1_2, match_id_2_1, match_id_2_2) =
        env.as_contract(&contract_id, || {
            let m1_1 = add_match(&env, event_id_1, false);
            let m1_2 = add_match(&env, event_id_1, false);
            let m2_1 = add_match(&env, event_id_2, false);
            let m2_2 = add_match(&env, event_id_2, false);
            (m1_1, m1_2, m2_1, m2_2)
        });

    let after_matches = client.get_platform_statistics();
    assert_eq!(after_matches.total_matches, 4);

    // Have 3 users join both events; submit predictions for each match.
    client.join_event(&user1, &invite_code_1);
    client.join_event(&user2, &invite_code_1);
    client.join_event(&user3, &invite_code_1);
    client.join_event(&user1, &invite_code_2);
    client.join_event(&user2, &invite_code_2);
    client.join_event(&user3, &invite_code_2);

    env.as_contract(&contract_id, || {
        // User1 predictions for event 1
        add_prediction(&env, event_id_1, match_id_1_1, &user1);
        add_prediction(&env, event_id_1, match_id_1_2, &user1);
        // User1 predictions for event 2
        add_prediction(&env, event_id_2, match_id_2_1, &user1);
        add_prediction(&env, event_id_2, match_id_2_2, &user1);

        // User2 predictions for event 1
        add_prediction(&env, event_id_1, match_id_1_1, &user2);
        add_prediction(&env, event_id_1, match_id_1_2, &user2);
        // User2 predictions for event 2
        add_prediction(&env, event_id_2, match_id_2_1, &user2);
        add_prediction(&env, event_id_2, match_id_2_2, &user2);

        // User3 predictions for event 1
        add_prediction(&env, event_id_1, match_id_1_1, &user3);
        add_prediction(&env, event_id_1, match_id_1_2, &user3);
        // User3 predictions for event 2
        add_prediction(&env, event_id_2, match_id_2_1, &user3);
        add_prediction(&env, event_id_2, match_id_2_2, &user3);
    });

    let final_stats = client.get_platform_statistics();
    assert_eq!(final_stats.total_predictions, 12); // 3 users × 2 events × 2 matches each
    assert_eq!(final_stats.unique_participants, 3); // user1, user2, user3
    assert_eq!(final_stats.total_fees_collected, FEE * 2); // 2 events created
}

// =============================================================================
// is_event_finalized tests
// =============================================================================

#[test]
fn test_is_event_finalized_states() {
    let (env, client, _contract_id, xlm_token) = setup();
    let creator = Address::generate(&env);
    fund(&env, &xlm_token, &creator, FEE);

    let start_time = get_future_time(&env, 3600);
    let end_time = get_future_time(&env, 7200);
    let (event_id, _invite_code) = client.create_event(
        &creator,
        &title(&env),
        &desc(&env),
        &5u32,
        &start_time,
        &end_time,
        &0i128,
        &Vec::new(&env),
        &0i128,
    );

    // State 1: Active (not finalized)
    assert!(!client.is_event_finalized(&event_id));
    assert_eq!(
        client.is_event_finalized(&event_id),
        client.get_event(&event_id).is_finalized
    );

    // State 2: Cancelled (not finalized)
    client.cancel_event(&creator, &event_id);
    assert!(!client.is_event_finalized(&event_id));
    assert_eq!(
        client.is_event_finalized(&event_id),
        client.get_event(&event_id).is_finalized
    );

    // State 3: Finalized
    let creator2 = Address::generate(&env);
    fund(&env, &xlm_token, &creator2, FEE);
    let start_time2 = get_future_time(&env, 3600);
    let end_time2 = get_future_time(&env, 7200);
    let (event_id2, _invite_code2) = client.create_event(
        &creator2,
        &title(&env),
        &desc(&env),
        &5u32,
        &start_time2,
        &end_time2,
        &0i128,
        &Vec::new(&env),
        &0i128,
    );

    // Advance ledger timestamp to end_time2 to allow finalization
    env.ledger().with_mut(|l| l.timestamp = end_time2 + 10);

    // Finalize the event
    fund(&env, &xlm_token, &creator2, FINALIZATION_BOND_STROOPS);
    client.finalize_event(&creator2, &event_id2);

    assert!(client.is_event_finalized(&event_id2));
    assert_eq!(
        client.is_event_finalized(&event_id2),
        client.get_event(&event_id2).is_finalized
    );
}

#[test]
#[should_panic(expected = "event_not_found")]
fn test_is_event_finalized_not_found() {
    let (_env, client, _contract_id, _xlm_token) = setup();
    client.is_event_finalized(&9999u64);
}

// =============================================================================
// get_event_count tests (#1028)
// =============================================================================

#[test]
fn test_get_event_count_returns_zero_before_any_events() {
    let (_env, client, _contract_id, _xlm_token) = setup();
    assert_eq!(client.get_event_count(), 0);
}

#[test]
fn test_get_event_count_increments_monotonically() {
    let (env, client, _contract_id, xlm_token) = setup();
    let creator = Address::generate(&env);

    assert_eq!(client.get_event_count(), 0);

    fund(&env, &xlm_token, &creator, FEE);
    let start_time = get_future_time(&env, 3600);
    let end_time = get_future_time(&env, 7200);
    client.create_event(
        &creator,
        &title(&env),
        &desc(&env),
        &5u32,
        &start_time,
        &end_time,
        &0i128,
        &Vec::new(&env),
        &0i128,
    );
    assert_eq!(client.get_event_count(), 1);

    fund(&env, &xlm_token, &creator, FEE);
    let start_time2 = get_future_time(&env, 3600);
    let end_time2 = get_future_time(&env, 7200);
    client.create_event(
        &creator,
        &title(&env),
        &desc(&env),
        &5u32,
        &start_time2,
        &end_time2,
        &0i128,
        &Vec::new(&env),
        &0i128,
    );
    assert_eq!(client.get_event_count(), 2);

    fund(&env, &xlm_token, &creator, FEE);
    let start_time3 = get_future_time(&env, 3600);
    let end_time3 = get_future_time(&env, 7200);
    client.create_event(
        &creator,
        &title(&env),
        &desc(&env),
        &5u32,
        &start_time3,
        &end_time3,
        &0i128,
        &Vec::new(&env),
        &0i128,
    );
    assert_eq!(client.get_event_count(), 3);
}

#[test]
fn test_get_event_count_matches_platform_statistics_total_events() {
    let (env, client, _contract_id, xlm_token) = setup();
    let creator = Address::generate(&env);

    // Verified that get_event_count and get_platform_statistics.total_events agree.
    assert_eq!(
        client.get_event_count(),
        client.get_platform_statistics().total_events
    );

    fund(&env, &xlm_token, &creator, FEE);
    let start_time = get_future_time(&env, 3600);
    let end_time = get_future_time(&env, 7200);
    client.create_event(
        &creator,
        &title(&env),
        &desc(&env),
        &5u32,
        &start_time,
        &end_time,
        &0i128,
        &Vec::new(&env),
        &0i128,
    );

    assert_eq!(
        client.get_event_count(),
        client.get_platform_statistics().total_events
    );
    assert_eq!(client.get_event_count(), 1);
}

// =============================================================================
// get_event_prize_pool tests (#1021)
// =============================================================================

/// Pre-join test: get_event_prize_pool returns the creator-seeded amount before
/// any participants join.
#[test]
fn test_get_event_prize_pool_pre_join_equals_initial_seed() {
    let (env, client, _contract_id, xlm_token) = setup();
    let creator = Address::generate(&env);

    let prize_pool: i128 = 1_000_000_000;
    fund(&env, &xlm_token, &creator, FEE + prize_pool);

    let start_time = get_future_time(&env, 3600);
    let end_time = get_future_time(&env, 7200);
    let mut dist = Vec::new(&env);
    dist.push_back(100u32);

    let (event_id, _invite_code) = client.create_event(
        &creator,
        &title(&env),
        &desc(&env),
        &10u32,
        &start_time,
        &end_time,
        &prize_pool,
        &dist,
        &0i128,
    );

    // Before any joins the pool must equal the seeded amount.
    assert_eq!(client.get_event_prize_pool(&event_id), prize_pool);
}

/// Post-join growth test: prize pool grows by entry_fee with every join.
#[test]
fn test_get_event_prize_pool_grows_with_entry_fees() {
    let (env, client, _contract_id, xlm_token) = setup();
    let creator = Address::generate(&env);

    let seed: i128 = 500_000_000;
    let entry_fee: i128 = 50_000_000;
    let n: usize = 3;

    fund(&env, &xlm_token, &creator, FEE + seed);

    let start_time = get_future_time(&env, 3600);
    let end_time = get_future_time(&env, 7200);
    let mut dist = Vec::new(&env);
    dist.push_back(100u32);

    let (event_id, invite_code) = client.create_event(
        &creator,
        &title(&env),
        &desc(&env),
        &10u32,
        &start_time,
        &end_time,
        &seed,
        &dist,
        &entry_fee,
    );

    // Pool starts at seed.
    assert_eq!(client.get_event_prize_pool(&event_id), seed);

    // Each join adds exactly entry_fee to the pool.
    for i in 0..n {
        let user = Address::generate(&env);
        fund(&env, &xlm_token, &user, entry_fee);
        client.join_event(&user, &invite_code);
        let expected = seed + ((i + 1) as i128) * entry_fee;
        assert_eq!(client.get_event_prize_pool(&event_id), expected);
    }

    // Final pool = seed + n × entry_fee.
    assert_eq!(
        client.get_event_prize_pool(&event_id),
        seed + (n as i128) * entry_fee
    );
}

/// Post-finalize test: get_event_prize_pool does not panic after finalization
/// and still reflects the total pool that was distributed.
#[test]
fn test_get_event_prize_pool_post_finalize_is_readable() {
    let (env, client, contract_id, xlm_token) = setup();
    let creator = Address::generate(&env);

    let prize_pool: i128 = 10_000_000;
    fund(&env, &xlm_token, &creator, FEE + prize_pool);

    let start_time = get_future_time(&env, 3600);
    let end_time = get_future_time(&env, 7200);
    let mut dist = Vec::new(&env);
    dist.push_back(100u32);

    let (event_id, invite_code) = client.create_event(
        &creator,
        &title(&env),
        &desc(&env),
        &10u32,
        &start_time,
        &end_time,
        &prize_pool,
        &dist,
        &0i128,
    );

    // Retrieve the ai_agent so we can submit a match result.
    let ai_agent = client.get_ai_agent();

    // Add one match directly via storage.
    let match_id = env.as_contract(&contract_id, || {
        let mid = storage::next_match_id(&env);
        let m = Match::new(
            mid,
            event_id,
            String::from_str(&env, "Team A"),
            String::from_str(&env, "Team B"),
            env.ledger().timestamp() + 100,
            1u32,
            0,
        );
        storage::set_match(&env, mid, &m);
        storage::add_event_match(&env, event_id, mid);
        let mut event = storage::get_event(&env, event_id).expect("event exists");
        event.add_match();
        storage::set_event(&env, event_id, &event);
        mid
    });

    let user = Address::generate(&env);
    client.join_event(&user, &invite_code);
    client.submit_prediction(&user, &match_id, &1u32, &0u32);

    // Advance past end_time, submit result, then finalize.
    env.ledger().with_mut(|l| l.timestamp = end_time + 10);
    client.submit_match_result(&ai_agent, &match_id, &1u32, &0u32);
    fund(&env, &xlm_token, &creator, FINALIZATION_BOND_STROOPS);
    client.finalize_event(&creator, &event_id);

    assert!(client.get_event(&event_id).is_finalized);

    // get_event_prize_pool must not panic for a finalized event and must return
    // the recorded pool amount (prize_pool field is not zeroed by finalization).
    let pool = client.get_event_prize_pool(&event_id);
    assert_eq!(pool, prize_pool);
}

/// Not-found test: calling get_event_prize_pool with a non-existent event_id
/// panics with "event_not_found".
#[test]
#[should_panic(expected = "event_not_found")]
fn test_get_event_prize_pool_not_found_panics() {
    let (_env, client, _contract_id, _xlm_token) = setup();
    client.get_event_prize_pool(&9999u64);
}

// =============================================================================
// get_user_joined_events_count tests (#1038)
// =============================================================================

#[test]
fn test_get_user_joined_events_count_returns_zero_for_unknown_users() {
    let (env, client, _contract_id, _xlm_token) = setup();
    let unknown_user = Address::generate(&env);

    let count = client.get_user_joined_events_count(&unknown_user);
    assert_eq!(count, 0);
}

#[test]
fn test_get_user_joined_events_count_consistent_with_get_user_events() {
    let (env, client, _contract_id, xlm_token) = setup();
    let creator = Address::generate(&env);
    let user = Address::generate(&env);

    fund(&env, &xlm_token, &creator, FEE);
    let start_time = get_future_time(&env, 3600);
    let end_time = get_future_time(&env, 7200);
    let (event_id_1, invite_code_1) = client.create_event(
        &creator,
        &title(&env),
        &desc(&env),
        &5u32,
        &start_time,
        &end_time,
        &0i128,
        &Vec::new(&env),
        &0i128,
    );

    fund(&env, &xlm_token, &creator, FEE);
    let start_time2 = get_future_time(&env, 3700);
    let end_time2 = get_future_time(&env, 7300);
    let (event_id_2, invite_code_2) = client.create_event(
        &creator,
        &title(&env),
        &desc(&env),
        &5u32,
        &start_time2,
        &end_time2,
        &0i128,
        &Vec::new(&env),
        &0i128,
    );

    fund(&env, &xlm_token, &creator, FEE);
    let start_time3 = get_future_time(&env, 3800);
    let end_time3 = get_future_time(&env, 7400);
    let (event_id_3, invite_code_3) = client.create_event(
        &creator,
        &title(&env),
        &desc(&env),
        &5u32,
        &start_time3,
        &end_time3,
        &0i128,
        &Vec::new(&env),
        &0i128,
    );

    // User joins 2 out of 3 events
    client.join_event(&user, &invite_code_1);
    client.join_event(&user, &invite_code_2);

    let events = client.get_user_events(&user);
    let count = client.get_user_joined_events_count(&user);

    assert_eq!(events.len(), 2);
    assert_eq!(count, 2);
    assert_eq!(count, events.len());
}

#[test]
fn test_get_user_joined_events_count_increments_with_joins() {
    let (env, client, _contract_id, xlm_token) = setup();
    let creator = Address::generate(&env);
    let user = Address::generate(&env);

    // Initial count should be 0
    assert_eq!(client.get_user_joined_events_count(&user), 0);

    // Create and join first event
    fund(&env, &xlm_token, &creator, FEE);
    let start_time = get_future_time(&env, 3600);
    let end_time = get_future_time(&env, 7200);
    let (event_id_1, invite_code_1) = client.create_event(
        &creator,
        &title(&env),
        &desc(&env),
        &5u32,
        &start_time,
        &end_time,
        &0i128,
        &Vec::new(&env),
        &0i128,
    );
    client.join_event(&user, &invite_code_1);
    assert_eq!(client.get_user_joined_events_count(&user), 1);

    // Create and join second event
    fund(&env, &xlm_token, &creator, FEE);
    let start_time2 = get_future_time(&env, 3700);
    let end_time2 = get_future_time(&env, 7300);
    let (event_id_2, invite_code_2) = client.create_event(
        &creator,
        &title(&env),
        &desc(&env),
        &5u32,
        &start_time2,
        &end_time2,
        &0i128,
        &Vec::new(&env),
        &0i128,
    );
    client.join_event(&user, &invite_code_2);
    assert_eq!(client.get_user_joined_events_count(&user), 2);

    // Create and join third event
    fund(&env, &xlm_token, &creator, FEE);
    let start_time3 = get_future_time(&env, 3800);
    let end_time3 = get_future_time(&env, 7400);
    let (event_id_3, invite_code_3) = client.create_event(
        &creator,
        &title(&env),
        &desc(&env),
        &5u32,
        &start_time3,
        &end_time3,
        &0i128,
        &Vec::new(&env),
        &0i128,
    );
    client.join_event(&user, &invite_code_3);
    assert_eq!(client.get_user_joined_events_count(&user), 3);
}
