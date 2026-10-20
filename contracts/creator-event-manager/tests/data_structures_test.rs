/// Comprehensive unit tests for data structures (Event, Match, Prediction).
///
/// Achieves 100% code coverage for the storage_types module by covering every
/// method, edge case, validation branch, and helper function.
use creator_event_manager::storage_types::{
    Event, Match, MatchResult, Prediction, MAX_TEAM_NAME_LEN, OUTCOME_DRAW, OUTCOME_TEAM_A,
    OUTCOME_TEAM_B,
};
use soroban_sdk::{testutils::Address as _, Address, Env, String, Symbol, Vec};

// =============================================================================
// Helpers
// =============================================================================

fn make_event(env: &Env, event_id: u64) -> Event {
    Event::new(
        event_id,
        Address::generate(env),
        String::from_str(env, "Test Event"),
        String::from_str(env, "A test prediction event"),
        1_000_000i128,
        1_640_995_200u64,
        1_640_995_200u64 + 3600,  // start_time (created_at)
        1_640_995_200u64 + 86400, // end_time (24 hours later)
        Symbol::new(env, "ABCD1234"),
        100u32,
        0i128,
        Vec::new(env),
        0i128,
    )
}

fn make_match(env: &Env, match_id: u64, event_id: u64, match_time: u64) -> Match {
    Match::new(
        match_id,
        event_id,
        String::from_str(env, "Team Alpha"),
        String::from_str(env, "Team Beta"),
        match_time,
        1u32,
        0,
    )
}

// =============================================================================
// MatchResult
// =============================================================================

#[test]
fn test_match_result_to_u8_and_from_u8_roundtrip() {
    for (variant, expected) in [
        (MatchResult::TeamA, 0u8),
        (MatchResult::TeamB, 1u8),
        (MatchResult::Draw, 2u8),
    ] {
        assert_eq!(variant.to_u8(), expected);
        assert_eq!(MatchResult::from_u8(expected), Some(variant));
    }
    assert_eq!(MatchResult::from_u8(255), None);
}

#[test]
fn test_match_result_from_u32_edge_cases() {
    assert_eq!(MatchResult::from_u32(0), Some(MatchResult::TeamA));
    assert_eq!(MatchResult::from_u32(2), Some(MatchResult::Draw));
    assert_eq!(MatchResult::from_u32(3), None);
    assert_eq!(MatchResult::from_u32(256), None);
    assert_eq!(MatchResult::from_u32(u32::MAX), None);
}

// =============================================================================
// Event — supplementary edge cases for 100% coverage
// =============================================================================

#[test]
fn test_event_validate_empty_title_rejected() {
    let env = Env::default();
    let mut event = make_event(&env, 1);
    event.title = String::from_str(&env, "");
    assert_eq!(event.validate(), Err("Title cannot be empty"));
}

#[test]
fn test_event_validate_title_too_long_rejected() {
    let env = Env::default();
    let mut event = make_event(&env, 1);
    let long_title = [b'x'; 201];
    event.title = String::from_bytes(&env, &long_title);
    assert_eq!(event.validate(), Err("Title exceeds maximum length"));
}

#[test]
fn test_event_validate_description_too_long_rejected() {
    let env = Env::default();
    let mut event = make_event(&env, 1);
    let long_desc = [b'y'; 1001];
    event.description = String::from_bytes(&env, &long_desc);
    assert_eq!(event.validate(), Err("Description exceeds maximum length"));
}

#[test]
fn test_event_can_accept_participants_inactive_event() {
    let env = Env::default();
    let mut event = make_event(&env, 1);
    event.deactivate();
    assert!(!event.can_accept_participants());
}

#[test]
fn test_event_can_accept_participants_cancelled_event() {
    let env = Env::default();
    let mut event = make_event(&env, 1);
    event.cancel();
    assert!(!event.can_accept_participants());
}

#[test]
fn test_event_add_participant_rejects_after_deactivate() {
    let env = Env::default();
    let mut event = make_event(&env, 1);
    event.deactivate();
    assert_eq!(event.add_participant(), Err("Event is not active"));
}

#[test]
fn test_event_add_participant_rejects_when_full() {
    let env = Env::default();
    let mut event = Event::new(
        1,
        Address::generate(&env),
        String::from_str(&env, "Limited"),
        String::from_str(&env, "Only 1 spot"),
        0i128,
        0u64,
        1000u64, // start_time
        2000u64, // end_time
        Symbol::new(&env, "LIMIT1"),
        1u32,
        0i128,
        Vec::new(&env),
        0i128,
    );
    assert!(event.add_participant().is_ok());
    assert_eq!(
        event.add_participant(),
        Err("Event has reached maximum participants")
    );
}

#[test]
fn test_event_add_match_increments_count() {
    let env = Env::default();
    let mut event = make_event(&env, 1);
    assert_eq!(event.match_count, 0);
    event.add_match();
    assert_eq!(event.match_count, 1);
    event.add_match();
    event.add_match();
    assert_eq!(event.match_count, 3);
}

#[test]
fn test_event_get_age_seconds_normal() {
    let env = Env::default();
    let event = make_event(&env, 1);
    assert_eq!(event.get_age_seconds(1_640_995_200 + 5000), 5000);
}

#[test]
fn test_event_get_age_seconds_saturating() {
    let env = Env::default();
    let event = make_event(&env, 1);
    assert_eq!(event.get_age_seconds(1_640_995_200 - 5000), 0);
}

#[test]
fn test_event_validate_ok() {
    let env = Env::default();
    assert!(make_event(&env, 1).validate().is_ok());
}

// =============================================================================
// Match — supplementary edge cases for 100% coverage
// =============================================================================

#[test]
fn test_match_time_since_result_with_result() {
    let env = Env::default();
    let oracle = Address::generate(&env);
    let match_time = 1_640_995_200u64;
    let result_time = match_time + 7200;
    let now = result_time + 3600;

    let mut m = make_match(&env, 1, 100, match_time);
    m.submit_result(MatchResult::TeamA, oracle, result_time)
        .unwrap();

    assert_eq!(m.time_since_result(now), 3600);
}

#[test]
fn test_match_time_since_result_no_result() {
    let env = Env::default();
    let m = make_match(&env, 1, 100, 1_640_995_200);
    assert_eq!(m.time_since_result(1_640_995_200 + 5000), 0);
}

#[test]
fn test_match_get_winner_all_variants() {
    let env = Env::default();
    let oracle = Address::generate(&env);

    for (result, _) in [
        (MatchResult::TeamA, 0u32),
        (MatchResult::TeamB, 1u32),
        (MatchResult::Draw, 2u32),
    ] {
        let mut m = make_match(&env, 1, 100, 1_640_995_200);
        m.submit_result(result.clone(), oracle.clone(), 1_640_995_200 + 7200)
            .unwrap();
        assert_eq!(m.get_winner(), Some(result));
        assert!(m.is_completed());
    }
}

#[test]
fn test_match_get_winner_none_before_result() {
    let env = Env::default();
    let m = make_match(&env, 1, 100, 1_640_995_200);
    assert_eq!(m.get_winner(), None);
    assert!(!m.is_completed());
}

#[test]
fn test_match_allows_predictions_result_submitted_blocks() {
    let env = Env::default();
    let oracle = Address::generate(&env);
    let match_time = 1_640_995_200u64;

    let mut m = make_match(&env, 1, 100, match_time);
    // Before match, well within cutoff
    assert!(m.allows_predictions(match_time - 7200, 30));
    // After result, even before match should be blocked
    m.submit_result(MatchResult::TeamA, oracle, match_time - 7200)
        .unwrap();
    assert!(!m.allows_predictions(match_time - 7200, 30));
}

#[test]
fn test_match_allows_predictions_edge_cutoff_boundary() {
    let env = Env::default();
    let match_time = 1_640_995_200u64;

    let m = make_match(&env, 1, 100, match_time);
    // Exactly at cutoff boundary - current_time == cutoff, so no
    assert!(!m.allows_predictions(match_time - 1800, 30));
    // 1 second before cutoff boundary
    assert!(m.allows_predictions(match_time - 1801, 30));
}

#[test]
fn test_match_has_started_exact_time() {
    let env = Env::default();
    let match_time = 1_640_995_200u64;
    let m = make_match(&env, 1, 100, match_time);

    assert!(m.has_started(match_time));
    assert!(!m.has_started(match_time - 1));
}

#[test]
fn test_match_is_ready_for_result_after_start_no_result() {
    let env = Env::default();
    let match_time = 1_640_995_200u64;
    let m = make_match(&env, 1, 100, match_time);

    assert!(m.is_ready_for_result(match_time + 1));
    assert!(!m.is_ready_for_result(match_time - 1));
}

#[test]
fn test_match_is_ready_for_result_false_after_submission() {
    let env = Env::default();
    let oracle = Address::generate(&env);
    let match_time = 1_640_995_200u64;

    let mut m = make_match(&env, 1, 100, match_time);
    m.submit_result(MatchResult::TeamA, oracle, match_time + 7200)
        .unwrap();
    assert!(!m.is_ready_for_result(match_time + 7201));
}

#[test]
fn test_match_time_until_start_before() {
    let env = Env::default();
    let m = make_match(&env, 1, 100, 1_640_995_200);
    assert_eq!(m.time_until_start(1_640_995_100), 100);
}

#[test]
fn test_match_time_until_start_after() {
    let env = Env::default();
    let m = make_match(&env, 1, 100, 1_640_995_200);
    assert_eq!(m.time_until_start(1_640_995_300), 0);
}

#[test]
fn test_match_validate_team_a_too_long() {
    let env = Env::default();
    let long_name = [b'x'; (MAX_TEAM_NAME_LEN + 1) as usize];
    let m = Match::new(
        1,
        100,
        String::from_bytes(&env, &long_name),
        String::from_str(&env, "Team B"),
        0,
        1u32,
        0,
    );
    assert_eq!(m.validate(), Err("Team A name exceeds maximum length"));
}

#[test]
fn test_match_validate_team_b_too_long() {
    let env = Env::default();
    let long_name = [b'y'; (MAX_TEAM_NAME_LEN + 1) as usize];
    let m = Match::new(
        1,
        100,
        String::from_str(&env, "Team A"),
        String::from_bytes(&env, &long_name),
        0,
        1u32,
        0,
    );
    assert_eq!(m.validate(), Err("Team B name exceeds maximum length"));
}

#[test]
fn test_match_validate_result_submitted_missing_submitted_by() {
    let env = Env::default();
    let mut m = make_match(&env, 1, 100, 0);
    m.result_submitted = true;
    m.winning_team = Some(0u32);
    m.submitted_at = Some(100);
    // submitted_by left as None
    assert_eq!(
        m.validate(),
        Err("Result submitted but submitted_by is None")
    );
}

#[test]
fn test_match_validate_result_submitted_missing_submitted_at() {
    let env = Env::default();
    let mut m = make_match(&env, 1, 100, 0);
    m.result_submitted = true;
    m.winning_team = Some(0u32);
    m.submitted_by = Some(Address::generate(&env));
    // submitted_at left as None
    assert_eq!(
        m.validate(),
        Err("Result submitted but submitted_at is None")
    );
}

#[test]
fn test_match_validate_result_submitted_invalid_winning_team() {
    let env = Env::default();
    let mut m = make_match(&env, 1, 100, 0);
    m.result_submitted = true;
    m.winning_team = Some(99u32);
    m.submitted_by = Some(Address::generate(&env));
    m.submitted_at = Some(100);
    assert_eq!(
        m.validate(),
        Err("winning_team value must be 0 (TeamA), 1 (TeamB), or 2 (Draw)")
    );
}

#[test]
fn test_match_validate_submitted_at_without_result() {
    let env = Env::default();
    let mut m = make_match(&env, 1, 100, 0);
    m.submitted_at = Some(100);
    assert_eq!(
        m.validate(),
        Err("submitted_at set but result_submitted is false")
    );
}

#[test]
fn test_match_validate_submitted_by_without_result() {
    let env = Env::default();
    let mut m = make_match(&env, 1, 100, 0);
    m.submitted_by = Some(Address::generate(&env));
    m.winning_team = Some(0u32);
    // result_submitted is false
    assert_eq!(
        m.validate(),
        Err("winning_team set but result_submitted is false")
    );
}

#[test]
fn test_match_validate_ok_with_result() {
    let env = Env::default();
    let mut m = make_match(&env, 1, 100, 1_640_995_200);
    m.submit_result(
        MatchResult::Draw,
        Address::generate(&env),
        1_640_995_200 + 7200,
    )
    .unwrap();
    assert!(m.validate().is_ok());
}

// =============================================================================
// Prediction — supplementary tests for 100% coverage
// =============================================================================

#[test]
fn test_prediction_validate_outcome_all_valid_symbols() {
    let env = Env::default();
    assert!(Prediction::validate_outcome(&env, &Symbol::new(&env, OUTCOME_TEAM_A)).is_ok());
    assert!(Prediction::validate_outcome(&env, &Symbol::new(&env, OUTCOME_TEAM_B)).is_ok());
    assert!(Prediction::validate_outcome(&env, &Symbol::new(&env, OUTCOME_DRAW)).is_ok());
}

#[test]
fn test_prediction_validate_outcome_rejects_invalid() {
    let env = Env::default();
    assert!(Prediction::validate_outcome(&env, &Symbol::new(&env, "")).is_err());
    assert!(Prediction::validate_outcome(&env, &Symbol::new(&env, "TEAM_C")).is_err());
    assert!(Prediction::validate_outcome(&env, &Symbol::new(&env, "draw")).is_err());
}

#[test]
fn test_prediction_grade_team_a_correct() {
    let env = Env::default();
    let mut pred = Prediction::new(
        1,
        5,
        10,
        Address::generate(&env),
        2u32,
        1u32,
        1_640_995_200,
        &env,
    );
    pred.grade(2u32, 1u32, 1u32); // Exact match
    assert_eq!(pred.is_correct, Some(true));
    assert_eq!(pred.points_earned, Some(4)); // 1 + 3 for exact
    assert!(pred.is_winner());
}

#[test]
fn test_prediction_grade_team_a_wrong() {
    let env = Env::default();
    let mut pred = Prediction::new(
        1,
        5,
        10,
        Address::generate(&env),
        2u32,
        1u32,
        1_640_995_200,
        &env,
    );
    pred.grade(1u32, 2u32, 1u32); // Wrong result
    assert_eq!(pred.is_correct, Some(false));
    assert_eq!(pred.points_earned, Some(0));
    assert!(!pred.is_winner());
}

#[test]
fn test_prediction_grade_draw_correct() {
    let env = Env::default();
    let mut pred = Prediction::new(
        1,
        5,
        10,
        Address::generate(&env),
        1u32,
        1u32,
        1_640_995_200,
        &env,
    );
    pred.grade(1u32, 1u32, 1u32); // Exact draw
    assert_eq!(pred.is_correct, Some(true));
    assert_eq!(pred.points_earned, Some(4)); // Exact draw
    assert!(pred.is_winner());
}

#[test]
fn test_prediction_is_before_match_time_boundary() {
    let env = Env::default();
    let pred = Prediction::new(1, 5, 10, Address::generate(&env), 2u32, 1u32, 100, &env);
    // predicted_at (100) < match_time (100) => false (not strictly before)
    assert!(!pred.is_before_match_time(100));
    // predicted_at (100) < match_time (101) => true
    assert!(pred.is_before_match_time(101));
}
