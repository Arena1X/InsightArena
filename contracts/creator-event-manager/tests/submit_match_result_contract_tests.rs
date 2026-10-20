//! #966 — Integration tests for exact scoreline predictions.
//! Covers:
//! - Exact score predictions award 4 points (1 for result + 3 for exact)
//! - Correct 1X2 result but wrong score awards 1 point
//! - Wrong result awards 0 points
//! - Scoring works for all outcomes (Team A win, Team B win, Draw)
//! - get_user_score returns (total_points, correct_results, exact_scores, total_matches)
//! - Predictions are graded after match result submission

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

fn get_future_time(env: &Env, offset_seconds: u64) -> u64 {
    env.ledger().timestamp() + offset_seconds
}

/// Create an event with a single match starting `match_time_offset` seconds
/// from now. Returns `(event_id, invite_code, match_id)`.
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

fn read_match(env: &Env, contract_id: &Address, match_id: u64) -> Match {
    env.as_contract(contract_id, || storage::get_match(env, match_id).unwrap())
}

#[test]
fn test_ai_agent_can_submit_result_with_scoreline() {
    let (env, client, contract_id, _admin, ai_agent, xlm_token) = setup();
    let creator = Address::generate(&env);
    let (_event_id, _invite, match_id) =
        create_event_with_match(&env, &contract_id, &client, &creator, &xlm_token, 1_000);

    env.ledger().with_mut(|l| l.timestamp += 2_000);
    client.submit_match_result(&ai_agent, &match_id, &2u32, &1u32);

    let m = read_match(&env, &contract_id, match_id);
    assert!(m.result_submitted);
    assert_eq!(m.winning_team, Some(0)); // TeamA wins 2-1
    assert_eq!(m.home_score, Some(2));
    assert_eq!(m.away_score, Some(1));
    assert_eq!(m.submitted_by, Some(ai_agent));
}

#[test]
#[should_panic(expected = "unauthorized")]
fn test_non_agent_cannot_submit() {
    let (env, client, contract_id, _admin, _ai_agent, xlm_token) = setup();
    let creator = Address::generate(&env);
    let (_event_id, _invite, match_id) =
        create_event_with_match(&env, &contract_id, &client, &creator, &xlm_token, 1_000);

    env.ledger().with_mut(|l| l.timestamp += 2_000);
    let imposter = Address::generate(&env);
    client.submit_match_result(&imposter, &match_id, &2u32, &1u32);
}

#[test]
#[should_panic(expected = "match_not_started")]
fn test_result_before_match_time_rejected() {
    let (env, client, contract_id, _admin, ai_agent, xlm_token) = setup();
    let creator = Address::generate(&env);
    let (_event_id, _invite, match_id) =
        create_event_with_match(&env, &contract_id, &client, &creator, &xlm_token, 10_000);

    // Do NOT advance time — the match has not started yet.
    client.submit_match_result(&ai_agent, &match_id, &2u32, &1u32);
}

#[test]
#[should_panic(expected = "result_already_submitted")]
fn test_duplicate_submission_rejected() {
    let (env, client, contract_id, _admin, ai_agent, xlm_token) = setup();
    let creator = Address::generate(&env);
    let (_event_id, _invite, match_id) =
        create_event_with_match(&env, &contract_id, &client, &creator, &xlm_token, 1_000);

    env.ledger().with_mut(|l| l.timestamp += 2_000);
    client.submit_match_result(&ai_agent, &match_id, &2u32, &1u32);
    // Second submission must be rejected.
    client.submit_match_result(&ai_agent, &match_id, &3u32, &1u32);
}

#[test]
#[should_panic(expected = "match_not_found")]
fn test_unknown_match_rejected() {
    let (env, client, _contract_id, _admin, ai_agent, _xlm_token) = setup();
    env.ledger().with_mut(|l| l.timestamp += 2_000);
    client.submit_match_result(&ai_agent, &404u64, &2u32, &1u32);
}

#[test]
fn test_predictions_marked_correct_and_incorrect() {
    let (env, client, contract_id, _admin, ai_agent, xlm_token) = setup();
    let creator = Address::generate(&env);
    let (_event_id, invite, match_id) =
        create_event_with_match(&env, &contract_id, &client, &creator, &xlm_token, 10_000);

    let winner = Address::generate(&env);
    let loser = Address::generate(&env);
    client.join_event(&winner, &invite);
    client.join_event(&loser, &invite);
    let winner_pred = client.submit_prediction(&winner, &match_id, &2u32, &1u32); // Exact
    let loser_pred = client.submit_prediction(&loser, &match_id, &0u32, &1u32); // Team B wins (wrong)

    env.ledger().with_mut(|l| l.timestamp += 20_000);
    client.submit_match_result(&ai_agent, &match_id, &2u32, &1u32); // Team A wins

    assert_eq!(client.get_prediction(&winner_pred).is_correct, Some(true));
    assert_eq!(client.get_prediction(&loser_pred).is_correct, Some(false));
}

#[test]
fn test_all_outcomes_work() {
    let (env, client, contract_id, _admin, ai_agent, xlm_token) = setup();
    let creator = Address::generate(&env);

    let (_e1, _i1, m_a) =
        create_event_with_match(&env, &contract_id, &client, &creator, &xlm_token, 1_000);
    let (_e2, _i2, m_b) =
        create_event_with_match(&env, &contract_id, &client, &creator, &xlm_token, 1_000);
    let (_e3, _i3, m_d) =
        create_event_with_match(&env, &contract_id, &client, &creator, &xlm_token, 1_000);

    env.ledger().with_mut(|l| l.timestamp += 2_000);
    client.submit_match_result(&ai_agent, &m_a, &2u32, &1u32); // TeamA wins
    client.submit_match_result(&ai_agent, &m_b, &1u32, &2u32); // TeamB wins
    client.submit_match_result(&ai_agent, &m_d, &1u32, &1u32); // Draw

    assert_eq!(read_match(&env, &contract_id, m_a).winning_team, Some(0)); // TeamA
    assert_eq!(read_match(&env, &contract_id, m_b).winning_team, Some(1)); // TeamB
    assert_eq!(read_match(&env, &contract_id, m_d).winning_team, Some(2)); // Draw
}

#[test]
fn test_full_prediction_flow_with_scoring() {
    let (env, client, contract_id, _admin, ai_agent, xlm_token) = setup();
    let creator = Address::generate(&env);
    let (event_id, invite, match_id) =
        create_event_with_match(&env, &contract_id, &client, &creator, &xlm_token, 10_000);

    let alice = Address::generate(&env);
    let bob = Address::generate(&env);
    client.join_event(&alice, &invite);
    client.join_event(&bob, &invite);
    client.submit_prediction(&alice, &match_id, &1u32, &1u32);
    client.submit_prediction(&bob, &match_id, &2u32, &0u32);

    env.ledger().with_mut(|l| l.timestamp += 20_000);
    client.submit_match_result(&ai_agent, &match_id, &1u32, &1u32); // Draw

    // Alice predicted the exact score (1-1 Draw); Bob did not.
    let (alice_points, alice_correct, alice_exact, alice_total) =
        client.get_user_score(&alice, &event_id);
    assert_eq!(alice_points, 4); // 1 for result + 3 for exact score
    assert_eq!(alice_correct, 1);
    assert_eq!(alice_exact, 1);
    assert_eq!(alice_total, 1);

    let (bob_points, bob_correct, bob_exact, bob_total) = client.get_user_score(&bob, &event_id);
    assert_eq!(bob_points, 0); // Wrong result (predicted 2-0, got 1-1)
    assert_eq!(bob_correct, 0);
    assert_eq!(bob_exact, 0);
    assert_eq!(bob_total, 1);

    // And the match is fully resolved.
    let m = read_match(&env, &contract_id, match_id);
    assert!(m.result_submitted);
    assert_eq!(m.winning_team, Some(2)); // Draw
    assert_eq!(m.home_score, Some(1));
    assert_eq!(m.away_score, Some(1));
}

// ============================================================================
// New tests for exact scoreline predictions (#966)
// ============================================================================

#[test]
fn test_grading_exact_score_awards_4_points() {
    let (env, client, contract_id, _admin, ai_agent, xlm_token) = setup();
    let creator = Address::generate(&env);
    let (_event_id, invite, match_id) =
        create_event_with_match(&env, &contract_id, &client, &creator, &xlm_token, 10_000);

    let predictor = Address::generate(&env);
    client.join_event(&predictor, &invite);
    let pred_id = client.submit_prediction(&predictor, &match_id, &2u32, &1u32);

    env.ledger().with_mut(|l| l.timestamp += 20_000);
    client.submit_match_result(&ai_agent, &match_id, &2u32, &1u32); // Exact match

    let prediction = client.get_prediction(&pred_id);
    assert_eq!(prediction.points_earned, Some(4)); // 1 for result + 3 for exact score
    assert_eq!(prediction.is_correct, Some(true));
}

#[test]
fn test_grading_correct_result_wrong_score_awards_1_point() {
    let (env, client, contract_id, _admin, ai_agent, xlm_token) = setup();
    let creator = Address::generate(&env);
    let (_event_id, invite, match_id) =
        create_event_with_match(&env, &contract_id, &client, &creator, &xlm_token, 10_000);

    let predictor = Address::generate(&env);
    client.join_event(&predictor, &invite);
    let pred_id = client.submit_prediction(&predictor, &match_id, &2u32, &1u32);

    env.ledger().with_mut(|l| l.timestamp += 20_000);
    client.submit_match_result(&ai_agent, &match_id, &3u32, &1u32); // Different score, same result

    let prediction = client.get_prediction(&pred_id);
    assert_eq!(prediction.points_earned, Some(1)); // Only result is correct
    assert_eq!(prediction.is_correct, Some(true));
}

#[test]
fn test_grading_wrong_result_awards_0_points() {
    let (env, client, contract_id, _admin, ai_agent, xlm_token) = setup();
    let creator = Address::generate(&env);
    let (_event_id, invite, match_id) =
        create_event_with_match(&env, &contract_id, &client, &creator, &xlm_token, 10_000);

    let predictor = Address::generate(&env);
    client.join_event(&predictor, &invite);
    let pred_id = client.submit_prediction(&predictor, &match_id, &1u32, &0u32); // Team A wins

    env.ledger().with_mut(|l| l.timestamp += 20_000);
    client.submit_match_result(&ai_agent, &match_id, &0u32, &1u32); // Team B wins

    let prediction = client.get_prediction(&pred_id);
    assert_eq!(prediction.points_earned, Some(0)); // Wrong result
    assert_eq!(prediction.is_correct, Some(false));
}

#[test]
fn test_grading_draw_exact_score() {
    let (env, client, contract_id, _admin, ai_agent, xlm_token) = setup();
    let creator = Address::generate(&env);
    let (_event_id, invite, match_id) =
        create_event_with_match(&env, &contract_id, &client, &creator, &xlm_token, 10_000);

    let predictor = Address::generate(&env);
    client.join_event(&predictor, &invite);
    let pred_id = client.submit_prediction(&predictor, &match_id, &2u32, &2u32);

    env.ledger().with_mut(|l| l.timestamp += 20_000);
    client.submit_match_result(&ai_agent, &match_id, &2u32, &2u32);

    let prediction = client.get_prediction(&pred_id);
    assert_eq!(prediction.points_earned, Some(4)); // Exact draw
    assert_eq!(prediction.is_correct, Some(true));
}

#[test]
fn test_grading_draw_wrong_score() {
    let (env, client, contract_id, _admin, ai_agent, xlm_token) = setup();
    let creator = Address::generate(&env);
    let (_event_id, invite, match_id) =
        create_event_with_match(&env, &contract_id, &client, &creator, &xlm_token, 10_000);

    let predictor = Address::generate(&env);
    client.join_event(&predictor, &invite);
    let pred_id = client.submit_prediction(&predictor, &match_id, &1u32, &1u32);

    env.ledger().with_mut(|l| l.timestamp += 20_000);
    client.submit_match_result(&ai_agent, &match_id, &2u32, &2u32); // Draw but different score

    let prediction = client.get_prediction(&pred_id);
    assert_eq!(prediction.points_earned, Some(1)); // Correct result (draw), wrong score
    assert_eq!(prediction.is_correct, Some(true));
}

#[test]
fn test_get_user_score_aggregates_points_across_multiple_matches() {
    let (env, client, contract_id, _admin, ai_agent, xlm_token) = setup();
    let creator = Address::generate(&env);

    // Create event with 3 matches
    let (event_id, invite, match1) =
        create_event_with_match(&env, &contract_id, &client, &creator, &xlm_token, 10_000);

    // Create and add 2 more matches to the same event
    let match2 = env.as_contract(&contract_id, || {
        let match_id = storage::next_match_id(&env);
        let match_record = creator_event_manager::storage_types::Match::new(
            match_id,
            event_id,
            String::from_str(&env, "Team C"),
            String::from_str(&env, "Team D"),
            env.ledger().timestamp() + 10_000,
            1u32,
            0,
        );
        storage::set_match(&env, match_id, &match_record);
        storage::add_event_match(&env, event_id, match_id);

        let mut event = storage::get_event(&env, event_id).unwrap();
        event.add_match();
        storage::set_event(&env, event_id, &event);
        match_id
    });

    let match3 = env.as_contract(&contract_id, || {
        let match_id = storage::next_match_id(&env);
        let match_record = creator_event_manager::storage_types::Match::new(
            match_id,
            event_id,
            String::from_str(&env, "Team E"),
            String::from_str(&env, "Team F"),
            env.ledger().timestamp() + 10_000,
            1u32,
            0,
        );
        storage::set_match(&env, match_id, &match_record);
        storage::add_event_match(&env, event_id, match_id);

        let mut event = storage::get_event(&env, event_id).unwrap();
        event.add_match();
        storage::set_event(&env, event_id, &event);
        match_id
    });

    let predictor = Address::generate(&env);
    client.join_event(&predictor, &invite);

    // Predictions for all 3 matches
    let _pred1 = client.submit_prediction(&predictor, &match1, &2u32, &1u32); // Exact
    let _pred2 = client.submit_prediction(&predictor, &match2, &1u32, &0u32); // Result only
    let _pred3 = client.submit_prediction(&predictor, &match3, &0u32, &1u32); // Wrong

    env.ledger().with_mut(|l| l.timestamp += 20_000);

    // Submit results for all 3 matches
    client.submit_match_result(&ai_agent, &match1, &2u32, &1u32); // Exact: 4 points
    client.submit_match_result(&ai_agent, &match2, &2u32, &0u32); // Correct result: 1 point
    client.submit_match_result(&ai_agent, &match3, &1u32, &0u32); // Wrong: 0 points

    let (total_points, correct_results, exact_scores, total_matches) =
        client.get_user_score(&predictor, &event_id);

    assert_eq!(total_points, 5); // 4 + 1 + 0
    assert_eq!(correct_results, 2); // Matches 1 and 2
    assert_eq!(exact_scores, 1); // Only match 1
    assert_eq!(total_matches, 3);
}

#[test]
fn test_submit_prediction_stores_scoreline() {
    let (env, client, contract_id, _admin, _ai_agent, xlm_token) = setup();
    let creator = Address::generate(&env);
    let (_event_id, invite, match_id) =
        create_event_with_match(&env, &contract_id, &client, &creator, &xlm_token, 10_000);

    let predictor = Address::generate(&env);
    client.join_event(&predictor, &invite);
    let pred_id = client.submit_prediction(&predictor, &match_id, &2u32, &1u32);

    let prediction = client.get_prediction(&pred_id);
    assert_eq!(prediction.predicted_home_score, 2);
    assert_eq!(prediction.predicted_away_score, 1);
    assert_eq!(prediction.points_earned, None); // Not yet graded
    assert_eq!(prediction.is_correct, None); // Not yet graded
}

// ============================================================================
// Scoreline grading tests (#xxx — exact score predictions)
// Acceptance tests specification: See SCORELINE_TESTS.md
//
// These tests define the API contract for the scoreline prediction feature.
// Test specifications (to be implemented):
//
// 1. test_grading_exact_score_awards_4_points
//    - Predict: 2-1 | Actual: 2-1
//    - Expected: points_earned = Some(4), is_correct = Some(true)
//    - Score: (4, 1, 1, 1) = (total_points, correct_results, exact_scores, total_matches)
//
// 2. test_grading_correct_result_wrong_score_awards_1_point
//    - Predict: 2-1 (TeamA) | Actual: 3-1 (TeamA)
//    - Expected: points_earned = Some(1), is_correct = Some(true)
//    - Score: (1, 1, 0, 1)
//
// 3. test_grading_wrong_result_awards_0_points
//    - Predict: 1-0 (TeamA) | Actual: 0-1 (TeamB)
//    - Expected: points_earned = Some(0), is_correct = Some(false)
//    - Score: (0, 0, 0, 1)
//
// 4. test_grading_draw_exact_score
//    - Predict: 1-1 | Actual: 1-1
//    - Expected: points_earned = Some(4)
//    - Score: (4, 1, 1, 1)
//
// 5. test_grading_draw_wrong_score
//    - Predict: 1-1 | Actual: 2-2
//    - Expected: points_earned = Some(1)
//    - Score: (1, 1, 0, 1)
//
// 6. test_get_user_score_aggregates_points_across_multiple_matches
//    - Match 1: Exact (2-1 → 2-1) = 4 points
//    - Match 2: Correct result (1-0 → 2-0) = 1 point
//    - Match 3: Wrong result (1-0 → 0-1) = 0 points
//    - Aggregated: (5, 2, 1, 3) = (total_points, correct_results, exact_scores, total_matches)
// ============================================================================
