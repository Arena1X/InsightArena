/// Comprehensive unit tests for AI oracle result submission and winner verification.
use creator_event_manager::storage;
use creator_event_manager::storage_types::MatchResult;
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
) -> (u64, Symbol, u64) {
    fund(env, xlm_token, creator, FEE);
    let start_time = env.ledger().timestamp() + 3600;
    let end_time = env.ledger().timestamp() + 7200;
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

fn submit_match_result(
    env: &Env,
    client: &CreatorEventManagerContractClient<'static>,
    ai_agent: &Address,
    match_id: u64,
    result: MatchResult,
) {
    let (home_score, away_score) = match result {
        MatchResult::TeamA => (2, 1), // Default: Team A wins 2-1
        MatchResult::TeamB => (1, 2), // Default: Team B wins 1-2
        MatchResult::Draw => (1, 1),  // Default: 1-1 draw
    };
    client.submit_match_result(ai_agent, &match_id, &home_score, &away_score);
}

/// Convert an expected result to a default scoreline for testing.
fn result_to_scores(result: MatchResult) -> (u32, u32) {
    match result {
        MatchResult::TeamA => (2, 1), // Team A wins 2-1
        MatchResult::TeamB => (1, 2), // Team B wins 1-2
        MatchResult::Draw => (1, 1),  // 1-1 draw
    }
}

// ============================================================================
// submit_match_result tests
// ============================================================================

#[test]
fn test_submit_match_result_ai_agent_can_submit() {
    let (env, client, contract_id, _admin, ai_agent, xlm_token) = setup();
    let creator = Address::generate(&env);
    let (_event_id, _invite_code, match_id) =
        create_event_with_match(&env, &contract_id, &client, &creator, &xlm_token, 1000);

    // Advance time past match start
    env.ledger().with_mut(|l| l.timestamp += 2000);

    submit_match_result(&env, &client, &ai_agent, match_id, MatchResult::TeamA);

    let match_record =
        env.as_contract(&contract_id, || storage::get_match(&env, match_id).unwrap());
    assert!(match_record.result_submitted);
    assert_eq!(match_record.winning_team, Some(0));
}

#[test]
#[should_panic(expected = "unauthorized")]
fn test_submit_match_result_wrong_role_rejected() {
    // Neither the admin nor an arbitrary address is the configured AI agent
    // (#1704) — only the address bound via `initialize`/`set_ai_agent` may
    // submit match results.
    let (env, client, contract_id, admin, _ai_agent, xlm_token) = setup();
    let creator = Address::generate(&env);
    let (_event_id, _invite_code, match_id) =
        create_event_with_match(&env, &contract_id, &client, &creator, &xlm_token, 1000);

    env.ledger().with_mut(|l| l.timestamp += 2000);

    client.submit_match_result(&admin, &match_id, &2u32, &1u32);
}

#[test]
#[should_panic(expected = "unauthorized")]
fn test_submit_match_result_random_address_rejected() {
    let (env, client, contract_id, _admin, _ai_agent, xlm_token) = setup();
    let creator = Address::generate(&env);
    let (_event_id, _invite_code, match_id) =
        create_event_with_match(&env, &contract_id, &client, &creator, &xlm_token, 1000);

    env.ledger().with_mut(|l| l.timestamp += 2000);

    let random = Address::generate(&env);
    client.submit_match_result(&random, &match_id, &2u32, &1u32);
}

#[test]
#[should_panic(expected = "result_already_submitted")]
fn test_submit_match_result_duplicate_submission_rejected() {
    let (env, client, contract_id, _admin, ai_agent, xlm_token) = setup();
    let creator = Address::generate(&env);
    let (_event_id, _invite_code, match_id) =
        create_event_with_match(&env, &contract_id, &client, &creator, &xlm_token, 1000);

    env.ledger().with_mut(|l| l.timestamp += 2000);

    submit_match_result(&env, &client, &ai_agent, match_id, MatchResult::TeamA);
    submit_match_result(&env, &client, &ai_agent, match_id, MatchResult::TeamB);
}

#[test]
fn test_submit_match_result_match_updated_correctly() {
    let (env, client, contract_id, _admin, ai_agent, xlm_token) = setup();
    let creator = Address::generate(&env);
    let (_event_id, _invite_code, match_id) =
        create_event_with_match(&env, &contract_id, &client, &creator, &xlm_token, 1000);

    env.ledger().with_mut(|l| l.timestamp += 2000);

    submit_match_result(&env, &client, &ai_agent, match_id, MatchResult::Draw);

    let match_record =
        env.as_contract(&contract_id, || storage::get_match(&env, match_id).unwrap());
    assert!(match_record.result_submitted);
    assert_eq!(match_record.winning_team, Some(2)); // Draw = 2
    assert_eq!(match_record.submitted_by, Some(ai_agent.clone()));
}

// Note: Tests for verify_event_winners and get_event_winners have been removed.
// These functions have been deprecated in favor of the ranked leaderboard model
// (Issue #967). The leaderboard is tested in leaderboard_tests.rs.

// ============================================================================
// get_user_score tests
// ============================================================================

#[test]
fn test_get_user_score_calculation_accurate() {
    let (env, client, contract_id, _admin, ai_agent, xlm_token) = setup();
    let creator = Address::generate(&env);
    let user = Address::generate(&env);

    fund(&env, &xlm_token, &creator, FEE);
    let start_time = env.ledger().timestamp() + 3600;
    let end_time = env.ledger().timestamp() + 7200;
    let (event_id, invite_code) = client.create_event(
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

    let (match_id_1, match_id_2) = env.as_contract(&contract_id, || {
        let m1 = storage::next_match_id(&env);
        storage::set_match(
            &env,
            m1,
            &creator_event_manager::storage_types::Match::new(
                m1,
                event_id,
                String::from_str(&env, "Team A"),
                String::from_str(&env, "Team B"),
                env.ledger().timestamp() + 10_000,
                1u32,
                0,
            ),
        );
        storage::add_event_match(&env, event_id, m1);

        let m2 = storage::next_match_id(&env);
        storage::set_match(
            &env,
            m2,
            &creator_event_manager::storage_types::Match::new(
                m2,
                event_id,
                String::from_str(&env, "Team C"),
                String::from_str(&env, "Team D"),
                env.ledger().timestamp() + 20_000,
                1u32,
                0,
            ),
        );
        storage::add_event_match(&env, event_id, m2);

        let mut event = storage::get_event(&env, event_id).expect("event exists");
        event.add_match();
        event.add_match();
        storage::set_event(&env, event_id, &event);

        (m1, m2)
    });

    client.join_event(&user, &invite_code);
    client.submit_prediction(&user, &match_id_1, &2u32, &1u32);
    client.submit_prediction(&user, &match_id_2, &1u32, &2u32);

    env.ledger().with_mut(|l| l.timestamp += 25_000);
    submit_match_result(&env, &client, &ai_agent, match_id_1, MatchResult::TeamA);
    submit_match_result(&env, &client, &ai_agent, match_id_2, MatchResult::TeamA);

    let (total_points, correct_results, _exact_scores, total_matches) =
        client.get_user_score(&user, &event_id);
    assert_eq!(correct_results, 1);
    assert_eq!(total_matches, 2);
}

#[test]
fn test_get_user_score_unresolved_predictions_not_counted() {
    let (env, client, contract_id, _admin, _ai_agent, xlm_token) = setup();
    let creator = Address::generate(&env);
    let user = Address::generate(&env);

    let (event_id, invite_code, match_id) =
        create_event_with_match(&env, &contract_id, &client, &creator, &xlm_token, 10_000);

    client.join_event(&user, &invite_code);
    client.submit_prediction(&user, &match_id, &2u32, &1u32);

    let (total_points, correct_results, exact_scores, total_matches) =
        client.get_user_score(&user, &event_id);
    assert_eq!(correct_results, 0);
    assert_eq!(total_matches, 1);
}

#[test]
fn test_get_user_score_zero_score_handled() {
    let (env, client, contract_id, _admin, ai_agent, xlm_token) = setup();
    let creator = Address::generate(&env);
    let user = Address::generate(&env);

    let (event_id, invite_code, match_id) =
        create_event_with_match(&env, &contract_id, &client, &creator, &xlm_token, 10_000);

    client.join_event(&user, &invite_code);
    client.submit_prediction(&user, &match_id, &2u32, &1u32);

    env.ledger().with_mut(|l| l.timestamp += 15_000);
    submit_match_result(&env, &client, &ai_agent, match_id, MatchResult::TeamB);

    let (total_points, correct_results, exact_scores, total_matches) =
        client.get_user_score(&user, &event_id);
    assert_eq!(correct_results, 0);
    assert_eq!(total_matches, 1);
}

// ============================================================================
// Scoreline grading additional tests (#xxx)
// ============================================================================

// ============================================================================
// Scoreline grading additional tests (#xxx)
// Acceptance test specification: See SCORELINE_TESTS.md
//
// Test specification:
// test_grading_multiple_predictions_different_scores
// - Multiple predictors with different accuracy levels:
//   - User 1 (exact): predicts 2-1, actual 2-1 → (4, 1, 1, 1)
//   - User 2 (result): predicts 3-0, actual 2-1 → (1, 1, 0, 1)
//   - User 3 (wrong): predicts 0-1, actual 2-1 → (0, 0, 0, 1)
// ============================================================================

// ============================================================================
// Points multiplier tests (#1024)
// ============================================================================

fn create_event_with_match_and_multiplier(
    env: &Env,
    contract_id: &Address,
    client: &CreatorEventManagerContractClient<'static>,
    creator: &Address,
    xlm_token: &Address,
    match_time_offset: u64,
    points_multiplier: u32,
) -> (u64, Symbol, u64) {
    fund(env, xlm_token, creator, FEE);
    let start_time = env.ledger().timestamp() + 3600;
    let end_time = env.ledger().timestamp() + 7200;
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
            points_multiplier,
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

/// Double result test: points_multiplier=2, correct result (not exact) → 1 × 2 = 2 points
#[test]
fn test_get_user_score_double_multiplier_correct_result() {
    let (env, client, contract_id, _admin, ai_agent, xlm_token) = setup();
    let creator = Address::generate(&env);
    let user = Address::generate(&env);

    let (event_id, invite_code, match_id) = create_event_with_match_and_multiplier(
        &env,
        &contract_id,
        &client,
        &creator,
        &xlm_token,
        10_000,
        2,
    );

    client.join_event(&user, &invite_code);
    // Predict 3-0: Team A wins (correct result) but wrong scoreline
    client.submit_prediction(&user, &match_id, &3u32, &0u32);

    env.ledger().with_mut(|l| l.timestamp += 15_000);
    // Actual: Team A wins 2-1
    client.submit_match_result(&ai_agent, &match_id, &2u32, &1u32);

    let (total_points, correct_results, exact_scores, total_matches) =
        client.get_user_score(&user, &event_id);
    assert_eq!(total_points, 2); // 1 base point × 2 multiplier
    assert_eq!(correct_results, 1);
    assert_eq!(exact_scores, 0);
    assert_eq!(total_matches, 1);
}

/// Double exact-score test: points_multiplier=2, exact score → 4 × 2 = 8 points
#[test]
fn test_get_user_score_double_multiplier_exact_score() {
    let (env, client, contract_id, _admin, ai_agent, xlm_token) = setup();
    let creator = Address::generate(&env);
    let user = Address::generate(&env);

    let (event_id, invite_code, match_id) = create_event_with_match_and_multiplier(
        &env,
        &contract_id,
        &client,
        &creator,
        &xlm_token,
        10_000,
        2,
    );

    client.join_event(&user, &invite_code);
    // Predict exact score 2-1
    client.submit_prediction(&user, &match_id, &2u32, &1u32);

    env.ledger().with_mut(|l| l.timestamp += 15_000);
    // Actual: Team A wins 2-1 (exact match)
    client.submit_match_result(&ai_agent, &match_id, &2u32, &1u32);

    let (total_points, correct_results, exact_scores, total_matches) =
        client.get_user_score(&user, &event_id);
    assert_eq!(total_points, 8); // 4 base points × 2 multiplier
    assert_eq!(correct_results, 1);
    assert_eq!(exact_scores, 1);
    assert_eq!(total_matches, 1);
}

/// Triple exact-score test: points_multiplier=3, exact score → 4 × 3 = 12 points
#[test]
fn test_get_user_score_triple_multiplier_exact_score() {
    let (env, client, contract_id, _admin, ai_agent, xlm_token) = setup();
    let creator = Address::generate(&env);
    let user = Address::generate(&env);

    let (event_id, invite_code, match_id) = create_event_with_match_and_multiplier(
        &env,
        &contract_id,
        &client,
        &creator,
        &xlm_token,
        10_000,
        3,
    );

    client.join_event(&user, &invite_code);
    // Predict exact score 1-0
    client.submit_prediction(&user, &match_id, &1u32, &0u32);

    env.ledger().with_mut(|l| l.timestamp += 15_000);
    // Actual: Team A wins 1-0 (exact match)
    client.submit_match_result(&ai_agent, &match_id, &1u32, &0u32);

    let (total_points, correct_results, exact_scores, total_matches) =
        client.get_user_score(&user, &event_id);
    assert_eq!(total_points, 12); // 4 base points × 3 multiplier
    assert_eq!(correct_results, 1);
    assert_eq!(exact_scores, 1);
    assert_eq!(total_matches, 1);
}

/// Wrong prediction with multiplier: wrong result → 0 points regardless of multiplier
#[test]
fn test_get_user_score_wrong_result_with_multiplier_yields_zero() {
    let (env, client, contract_id, _admin, ai_agent, xlm_token) = setup();
    let creator = Address::generate(&env);
    let user = Address::generate(&env);

    let (event_id, invite_code, match_id) = create_event_with_match_and_multiplier(
        &env,
        &contract_id,
        &client,
        &creator,
        &xlm_token,
        10_000,
        2,
    );

    client.join_event(&user, &invite_code);
    // Predict Team B wins (wrong: actual is Team A)
    client.submit_prediction(&user, &match_id, &0u32, &1u32);

    env.ledger().with_mut(|l| l.timestamp += 15_000);
    // Actual: Team A wins 2-1
    client.submit_match_result(&ai_agent, &match_id, &2u32, &1u32);

    let (total_points, correct_results, exact_scores, total_matches) =
        client.get_user_score(&user, &event_id);
    assert_eq!(total_points, 0); // 0 base points × 2 multiplier = 0
    assert_eq!(correct_results, 0);
    assert_eq!(exact_scores, 0);
    assert_eq!(total_matches, 1);
}

/// Mixed multiplier event: match1 (multiplier=1) correct result + match2 (multiplier=2) correct
/// result → total = 1×1 + 1×2 = 3 points
#[test]
fn test_get_user_score_mixed_multiplier_event() {
    let (env, client, contract_id, _admin, ai_agent, xlm_token) = setup();
    let creator = Address::generate(&env);
    let user = Address::generate(&env);

    fund(&env, &xlm_token, &creator, FEE);
    let start_time = env.ledger().timestamp() + 3600;
    let end_time = env.ledger().timestamp() + 7200;
    let (event_id, invite_code) = client.create_event(
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

    let (match_id_1, match_id_2) = env.as_contract(&contract_id, || {
        let m1 = storage::next_match_id(&env);
        storage::set_match(
            &env,
            m1,
            &creator_event_manager::storage_types::Match::new(
                m1,
                event_id,
                String::from_str(&env, "Team A"),
                String::from_str(&env, "Team B"),
                env.ledger().timestamp() + 10_000,
                1u32,
                0,
            ),
        );
        storage::add_event_match(&env, event_id, m1);

        let m2 = storage::next_match_id(&env);
        storage::set_match(
            &env,
            m2,
            &creator_event_manager::storage_types::Match::new(
                m2,
                event_id,
                String::from_str(&env, "Team C"),
                String::from_str(&env, "Team D"),
                env.ledger().timestamp() + 20_000,
                2u32,
                0,
            ),
        );
        storage::add_event_match(&env, event_id, m2);

        let mut event = storage::get_event(&env, event_id).expect("event exists");
        event.add_match();
        event.add_match();
        storage::set_event(&env, event_id, &event);

        (m1, m2)
    });

    client.join_event(&user, &invite_code);
    // Both matches: predict correct result (Team A wins) but wrong score
    client.submit_prediction(&user, &match_id_1, &3u32, &0u32);
    client.submit_prediction(&user, &match_id_2, &3u32, &0u32);

    env.ledger().with_mut(|l| l.timestamp += 25_000);
    // Actual for both: Team A wins 2-1
    client.submit_match_result(&ai_agent, &match_id_1, &2u32, &1u32);
    client.submit_match_result(&ai_agent, &match_id_2, &2u32, &1u32);

    let (total_points, correct_results, exact_scores, total_matches) =
        client.get_user_score(&user, &event_id);
    // Match 1: 1 pt × multiplier 1 = 1
    // Match 2: 1 pt × multiplier 2 = 2
    // Total: 3 pts
    assert_eq!(total_points, 3);
    assert_eq!(correct_results, 2);
    assert_eq!(exact_scores, 0);
    assert_eq!(total_matches, 2);
}
