// Comprehensive unit tests for data structures (Event, Match, Prediction, Winner).
// Covers serialization/deserialization, validation edge cases, and helper methods.

use creator_event_manager::storage;
use creator_event_manager::storage_types::{
    Event, Match, MatchResult, Prediction, Winner, OUTCOME_TEAM_A,
    MAX_DESCRIPTION_LEN, MAX_TEAM_NAME_LEN, MAX_TITLE_LEN,
};
use soroban_sdk::testutils::Address as _;
use soroban_sdk::{Address, Env, String, Symbol};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn make_event(env: &Env, event_id: u64) -> Event {
    Event::new(
        event_id,
        Address::generate(env),
        String::from_str(env, "Test Event"),
        String::from_str(env, "A test prediction event"),
        1_000_000i128,
        1_640_995_200u64,
        Symbol::new(env, "ABCD1234"),
        100u32,
    )
}

fn make_match(env: &Env, match_id: u64, event_id: u64, match_time: u64) -> Match {
    Match::new(
        match_id,
        event_id,
        String::from_str(env, "Team Alpha"),
        String::from_str(env, "Team Beta"),
        match_time,
    )
}

// ===========================================================================
// Serialization / Deserialisation (storage roundtrip)
// ===========================================================================
//
// Because Soroban's #[contracttype] derives XDR serialization automatically,
// the cleanest way to verify correct roundtrip encoding is to store a struct
// via the contract's persistent storage and read it back.

fn setup_env() -> (Env, soroban_sdk::Address) {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register_contract(
        None,
        creator_event_manager::CreatorEventManagerContract,
    );
    let admin = Address::generate(&env);
    let ai_agent = Address::generate(&env);
    let treasury = Address::generate(&env);
    let token_admin = Address::generate(&env);
    let xlm_token = env
        .register_stellar_asset_contract_v2(token_admin)
        .address();
    let client =
        creator_event_manager::CreatorEventManagerContractClient::new(&env, &contract_id);
    client.initialize(&admin, &ai_agent, &treasury, &xlm_token, &1_000_000i128);
    (env, contract_id)
}

#[test]
fn test_event_storage_roundtrip() {
    let (env, contract_id) = setup_env();
    let event = make_event(&env, 42);

    env.as_contract(&contract_id, || {
        storage::set_event(&env, 42, &event);
        let restored = storage::get_event(&env, 42).expect("event should exist");
        assert_eq!(restored, event);
        assert_eq!(restored.event_id, 42);
        assert_eq!(restored.title, String::from_str(&env, "Test Event"));
        assert_eq!(
            restored.description,
            String::from_str(&env, "A test prediction event")
        );
        assert!(restored.is_active);
        assert!(!restored.is_cancelled);
    });
}

#[test]
fn test_match_storage_roundtrip() {
    let (env, contract_id) = setup_env();
    let match_record = make_match(&env, 7, 42, 1_640_995_200);

    env.as_contract(&contract_id, || {
        storage::set_match(&env, 7, &match_record);
        let restored = storage::get_match(&env, 7).expect("match should exist");
        assert_eq!(restored, match_record);
        assert_eq!(restored.match_id, 7);
        assert_eq!(restored.event_id, 42);
        assert_eq!(restored.team_a, String::from_str(&env, "Team Alpha"));
        assert!(!restored.result_submitted);
    });
}

#[test]
fn test_prediction_storage_roundtrip() {
    let (env, contract_id) = setup_env();
    let predictor = Address::generate(&env);
    let prediction = Prediction::new(
        3,
        7,
        42,
        predictor.clone(),
        Symbol::new(&env, OUTCOME_TEAM_A),
        1_640_995_200,
    );

    env.as_contract(&contract_id, || {
        storage::set_prediction(&env, 3, &prediction);
        let restored = storage::get_prediction(&env, 3).expect("prediction should exist");
        assert_eq!(restored, prediction);
        assert_eq!(restored.prediction_id, 3);
        assert_eq!(restored.predictor, predictor);
        assert_eq!(
            restored.predicted_outcome,
            Symbol::new(&env, OUTCOME_TEAM_A)
        );
        assert!(restored.is_correct.is_none());
    });
}

#[test]
fn test_winner_storage_roundtrip() {
    let (env, contract_id) = setup_env();
    let user = Address::generate(&env);
    let winner = Winner::new(user.clone(), 42, 5, 5, 1_640_995_100, 1_640_995_200);

    env.as_contract(&contract_id, || {
        storage::add_event_winner(&env, 42, &winner);
        let winners = storage::get_event_winners(&env, 42);
        assert_eq!(winners.len(), 1);
        let restored = winners.get(0).unwrap();
        assert_eq!(restored, winner);
        assert_eq!(restored.user, user);
        assert_eq!(restored.total_correct, 5);
        assert_eq!(restored.total_matches, 5);
    });
}

// ===========================================================================
// Event — comprehensive validation
// ===========================================================================

#[test]
fn test_event_validate_empty_title_fails() {
    let env = Env::default();
    let event = Event::new(
        1,
        Address::generate(&env),
        String::from_str(&env, ""),
        String::from_str(&env, "Has description"),
        0i128,
        0u64,
        Symbol::new(&env, "CODE1234"),
        10u32,
    );
    assert_eq!(event.validate(), Err("Title cannot be empty"));
}

#[test]
fn test_event_validate_title_too_long_fails() {
    let env = Env::default();
    let long_title = String::from_bytes(&env, &[b'x'; (MAX_TITLE_LEN + 1) as usize]);
    let event = Event::new(
        1,
        Address::generate(&env),
        long_title,
        String::from_str(&env, "Valid description"),
        0i128,
        0u64,
        Symbol::new(&env, "CODE1234"),
        10u32,
    );
    assert_eq!(event.validate(), Err("Title exceeds maximum length"));
}

#[test]
fn test_event_validate_description_too_long_fails() {
    let env = Env::default();
    let long_desc = String::from_bytes(&env, &[b'y'; (MAX_DESCRIPTION_LEN + 1) as usize]);
    let event = Event::new(
        1,
        Address::generate(&env),
        String::from_str(&env, "Valid title"),
        long_desc,
        0i128,
        0u64,
        Symbol::new(&env, "CODE1234"),
        10u32,
    );
    assert_eq!(event.validate(), Err("Description exceeds maximum length"));
}

// ===========================================================================
// Event — helper methods edge cases
// ===========================================================================

#[test]
fn test_event_can_accept_participants_when_inactive() {
    let env = Env::default();
    let mut event = make_event(&env, 1);
    event.deactivate();
    assert!(!event.can_accept_participants());
}

#[test]
fn test_event_can_accept_participants_when_cancelled() {
    let env = Env::default();
    let mut event = make_event(&env, 1);
    event.cancel();
    assert!(!event.can_accept_participants());
}

#[test]
fn test_event_can_accept_participants_when_full() {
    let env = Env::default();
    let mut event = Event::new(
        1,
        Address::generate(&env),
        String::from_str(&env, "Full Event"),
        String::from_str(&env, "Maxed out"),
        0i128,
        0u64,
        Symbol::new(&env, "FULL001"),
        1u32,
    );
    assert!(event.can_accept_participants());
    let _ = event.add_participant();
    assert!(!event.can_accept_participants());
}

#[test]
fn test_event_add_participant_rejects_when_deactivated() {
    let env = Env::default();
    let mut event = make_event(&env, 1);
    event.deactivate();
    assert_eq!(
        event.add_participant(),
        Err("Event is not active")
    );
}

#[test]
fn test_event_add_participant_rejects_when_cancelled() {
    let env = Env::default();
    let mut event = make_event(&env, 1);
    event.cancel();
    assert_eq!(event.add_participant(), Err("Event is cancelled"));
}

#[test]
fn test_event_add_participant_reaches_max() {
    let env = Env::default();
    let mut event = Event::new(
        1,
        Address::generate(&env),
        String::from_str(&env, "Capped"),
        String::from_str(&env, "Exactly 3"),
        0i128,
        0u64,
        Symbol::new(&env, "CAP002"),
        3u32,
    );
    assert!(event.add_participant().is_ok());
    assert!(event.add_participant().is_ok());
    assert!(event.add_participant().is_ok());
    assert_eq!(
        event.add_participant(),
        Err("Event has reached maximum participants")
    );
}

#[test]
fn test_event_age_seconds_saturating_before_creation() {
    let env = Env::default();
    let event = make_event(&env, 1); // created_at = 1_640_995_200
    assert_eq!(event.get_age_seconds(0), 0); // saturating_sub prevents underflow
}

#[test]
fn test_event_add_match_increments_counter() {
    let env = Env::default();
    let mut event = make_event(&env, 1);
    assert_eq!(event.match_count, 0);
    event.add_match();
    assert_eq!(event.match_count, 1);
    event.add_match();
    event.add_match();
    assert_eq!(event.match_count, 3);
}

// ===========================================================================
// Match — team name length validation
// ===========================================================================

#[test]
fn test_match_team_a_name_too_long_fails() {
    let env = Env::default();
    let long_name = String::from_bytes(&env, &[b'A'; (MAX_TEAM_NAME_LEN + 1) as usize]);
    let m = Match::new(
        1,
        100,
        long_name,
        String::from_str(&env, "Team B"),
        0,
    );
    assert_eq!(m.validate(), Err("Team A name exceeds maximum length"));
}

#[test]
fn test_match_team_b_name_too_long_fails() {
    let env = Env::default();
    let long_name = String::from_bytes(&env, &[b'B'; (MAX_TEAM_NAME_LEN + 1) as usize]);
    let m = Match::new(
        1,
        100,
        String::from_str(&env, "Team A"),
        long_name,
        0,
    );
    assert_eq!(m.validate(), Err("Team B name exceeds maximum length"));
}

#[test]
fn test_match_max_team_name_length_boundary() {
    let env = Env::default();
    let exact_long = String::from_bytes(&env, &[b'C'; MAX_TEAM_NAME_LEN as usize]);
    let m = Match::new(
        1,
        100,
        String::from_str(&env, "Team A"),
        exact_long,
        0,
    );
    assert!(m.validate().is_ok());
}

// ===========================================================================
// Match — get_winner with all outcomes
// ===========================================================================

#[test]
fn test_match_get_winner_team_a() {
    let env = Env::default();
    let mut m = make_match(&env, 1, 100, 0);
    let oracle = Address::generate(&env);
    m.submit_result(MatchResult::TeamA, oracle, 100).unwrap();
    assert_eq!(m.get_winner(), Some(MatchResult::TeamA));
}

#[test]
fn test_match_get_winner_team_b() {
    let env = Env::default();
    let mut m = make_match(&env, 1, 100, 0);
    let oracle = Address::generate(&env);
    m.submit_result(MatchResult::TeamB, oracle, 100).unwrap();
    assert_eq!(m.get_winner(), Some(MatchResult::TeamB));
}

#[test]
fn test_match_get_winner_draw() {
    let env = Env::default();
    let mut m = make_match(&env, 1, 100, 0);
    let oracle = Address::generate(&env);
    m.submit_result(MatchResult::Draw, oracle, 100).unwrap();
    assert_eq!(m.get_winner(), Some(MatchResult::Draw));
}

#[test]
fn test_match_get_winner_none_when_unsubmitted() {
    let env = Env::default();
    let m = make_match(&env, 1, 100, 0);
    assert_eq!(m.get_winner(), None);
}

// ===========================================================================
// Match — is_completed edge cases
// ===========================================================================

#[test]
fn test_match_is_completed_false_initially() {
    let env = Env::default();
    let m = make_match(&env, 1, 100, 0);
    assert!(!m.is_completed());
}

#[test]
fn test_match_is_completed_true_after_result() {
    let env = Env::default();
    let mut m = make_match(&env, 1, 100, 0);
    let oracle = Address::generate(&env);
    m.submit_result(MatchResult::TeamA, oracle, 100).unwrap();
    assert!(m.is_completed());
}

// ===========================================================================
// Match — result validation edge cases
// ===========================================================================

#[test]
fn test_match_validate_inconsistent_result_missing_submitted_by() {
    let env = Env::default();
    let mut m = make_match(&env, 1, 100, 0);
    m.result_submitted = true;
    m.winning_team = Some(0u32);
    // submitted_by is None → should fail
    assert_eq!(
        m.validate(),
        Err("Result submitted but submitted_by is None")
    );
}

#[test]
fn test_match_validate_inconsistent_result_missing_submitted_at() {
    let env = Env::default();
    let mut m = make_match(&env, 1, 100, 0);
    m.result_submitted = true;
    m.winning_team = Some(0u32);
    m.submitted_by = Some(Address::generate(&env));
    // submitted_at is None → should fail
    assert_eq!(
        m.validate(),
        Err("Result submitted but submitted_at is None")
    );
}

#[test]
fn test_match_validate_inconsistent_winning_team_out_of_range() {
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
fn test_match_validate_winning_team_set_but_not_submitted() {
    let env = Env::default();
    let mut m = make_match(&env, 1, 100, 0);
    m.winning_team = Some(0u32);
    // result_submitted is false → should fail
    assert_eq!(
        m.validate(),
        Err("winning_team set but result_submitted is false")
    );
}

#[test]
fn test_match_validate_submitted_at_set_but_not_submitted() {
    let env = Env::default();
    let mut m = make_match(&env, 1, 100, 0);
    m.submitted_at = Some(100);
    assert_eq!(
        m.validate(),
        Err("submitted_at set but result_submitted is false")
    );
}

// ===========================================================================
// Match — timing helper edge cases
// ===========================================================================

#[test]
fn test_match_time_until_start_exact() {
    let env = Env::default();
    let m = make_match(&env, 1, 100, 1000);
    assert_eq!(m.time_until_start(1000), 0);
}

#[test]
fn test_match_time_until_start_future() {
    let env = Env::default();
    let m = make_match(&env, 1, 100, 1000);
    assert_eq!(m.time_until_start(500), 500);
}

#[test]
fn test_match_time_since_result_without_result() {
    let env = Env::default();
    let m = make_match(&env, 1, 100, 1000);
    assert_eq!(m.time_since_result(2000), 0);
}

#[test]
fn test_match_time_since_result_with_result() {
    let env = Env::default();
    let mut m = make_match(&env, 1, 100, 1000);
    let oracle = Address::generate(&env);
    m.submit_result(MatchResult::TeamA, oracle, 2000).unwrap();
    assert_eq!(m.time_since_result(3000), 1000);
}

// ===========================================================================
// Match — allows_predictions edge cases
// ===========================================================================

#[test]
fn test_match_allows_predictions_cutoff_boundary() {
    let env = Env::default();
    let match_time = 1_640_995_200u64;
    let m = make_match(&env, 1, 100, match_time);

    // Exactly at cutoff (30 min before) → not allowed (must be strictly before)
    let cutoff_seconds = 30 * 60;
    assert!(!m.allows_predictions(match_time - cutoff_seconds, 30));
}

#[test]
fn test_match_allows_predictions_result_submitted_blocks() {
    let env = Env::default();
    let mut m = make_match(&env, 1, 100, 1_640_995_200);
    let oracle = Address::generate(&env);
    m.submit_result(MatchResult::TeamA, oracle, 1_640_995_200 + 100)
        .unwrap();
    // Even though current_time is before match_time, result is submitted
    assert!(!m.allows_predictions(1_640_995_200 - 7200, 30));
}

// ===========================================================================
// Prediction — outcome validation edge cases
// ===========================================================================

#[test]
fn test_prediction_validate_outcome_case_sensitive() {
    let env = Env::default();
    let lower = Symbol::new(&env, "team_a");
    let mixed = Symbol::new(&env, "Team_A");
    let extra = Symbol::new(&env, "TEAM_A_");
    assert!(Prediction::validate_outcome(&env, &lower).is_err());
    assert!(Prediction::validate_outcome(&env, &mixed).is_err());
    assert!(Prediction::validate_outcome(&env, &extra).is_err());
}

#[test]
fn test_prediction_validate_outcome_empty_symbol() {
    let env = Env::default();
    let empty = Symbol::new(&env, "");
    assert!(Prediction::validate_outcome(&env, &empty).is_err());
}

// ===========================================================================
// Prediction — is_before_match_time edge cases
// ===========================================================================

#[test]
fn test_prediction_is_before_match_time_zero_offset() {
    let env = Env::default();
    let predictor = Address::generate(&env);
    let outcome = Symbol::new(&env, OUTCOME_TEAM_A);
    // Predicted at the exact match time boundary
    let pred = Prediction::new(1, 5, 10, predictor, outcome, 100);
    assert!(!pred.is_before_match_time(100));
    assert!(pred.is_before_match_time(101));
}

#[test]
fn test_prediction_is_before_match_time_large_gap() {
    let env = Env::default();
    let predictor = Address::generate(&env);
    let outcome = Symbol::new(&env, OUTCOME_TEAM_A);
    // Predicted well before match
    let pred = Prediction::new(1, 5, 10, predictor, outcome, 0);
    assert!(pred.is_before_match_time(u64::MAX));
}

// ===========================================================================
// Winner — accuracy percentage comprehensive
// ===========================================================================

#[test]
fn test_winner_accuracy_percentage_25_percent() {
    let env = Env::default();
    let user = Address::generate(&env);
    let w = Winner::new(user, 1, 1, 4, 0, 0);
    assert_eq!(w.get_accuracy_percentage(), 25);
}

#[test]
fn test_winner_accuracy_percentage_rounds_down() {
    let env = Env::default();
    let user = Address::generate(&env);
    // 1 correct out of 3 = 33% (integer division, rounds down)
    let w = Winner::new(user, 1, 1, 3, 0, 0);
    assert_eq!(w.get_accuracy_percentage(), 33);
}

#[test]
fn test_winner_accuracy_percentage_all_wrong() {
    let env = Env::default();
    let user = Address::generate(&env);
    let w = Winner::new(user, 1, 0, 10, 0, 0);
    assert_eq!(w.get_accuracy_percentage(), 0);
}

// ===========================================================================
// Winner — comparison / sorting comprehensive
// ===========================================================================

#[test]
fn test_winner_outranks_by_correct_count_reverse() {
    let env = Env::default();
    let u1 = Address::generate(&env);
    let u2 = Address::generate(&env);

    let w1 = Winner::new(u1, 1, 3, 5, 1000, 0);
    let w2 = Winner::new(u2, 1, 5, 5, 500, 0);

    // w2 has more correct, so w2 outranks w1
    assert!(w2.outranks(&w1));
    assert!(!w1.outranks(&w2));
}

#[test]
fn test_winner_outranks_same_correct_later_completion() {
    let env = Env::default();
    let u1 = Address::generate(&env);
    let u2 = Address::generate(&env);

    // Same correct count; w2 finished earlier
    let w1 = Winner::new(u1, 1, 5, 5, 1000, 0); // later
    let w2 = Winner::new(u2, 1, 5, 5, 500, 0);  // earlier

    assert!(w2.outranks(&w1));
    assert!(!w1.outranks(&w2));
}

#[test]
fn test_winner_outranks_edge_large_counts() {
    let env = Env::default();
    let u1 = Address::generate(&env);
    let u2 = Address::generate(&env);

    let w1 = Winner::new(u1, 1, u32::MAX, u32::MAX, 0, 0);
    let w2 = Winner::new(u2, 1, u32::MAX - 1, u32::MAX, 0, 0);

    assert!(w1.outranks(&w2));
    assert!(!w2.outranks(&w1));
}

// ===========================================================================
// MatchResult — additional encoding edge cases
// ===========================================================================

#[test]
fn test_match_result_from_u32_out_of_range() {
    assert_eq!(MatchResult::from_u32(u32::MAX), None);
}

#[test]
fn test_match_result_from_u8_out_of_range() {
    assert_eq!(MatchResult::from_u8(255), None);
}

#[test]
fn test_match_result_to_u32_values() {
    assert_eq!(MatchResult::TeamA.to_u32(), 0);
    assert_eq!(MatchResult::TeamB.to_u32(), 1);
    assert_eq!(MatchResult::Draw.to_u32(), 2);
}

#[test]
fn test_match_result_from_u32_valid() {
    assert_eq!(MatchResult::from_u32(0), Some(MatchResult::TeamA));
    assert_eq!(MatchResult::from_u32(1), Some(MatchResult::TeamB));
    assert_eq!(MatchResult::from_u32(2), Some(MatchResult::Draw));
}

// ===========================================================================
// Clone / Debug / Eq derived trait tests
// ===========================================================================

#[test]
fn test_event_clone_eq() {
    let env = Env::default();
    let a = make_event(&env, 1);
    let b = a.clone();
    assert_eq!(a, b);
}

#[test]
fn test_match_clone_eq() {
    let env = Env::default();
    let a = make_match(&env, 1, 100, 0);
    let b = a.clone();
    assert_eq!(a, b);
}

#[test]
fn test_prediction_clone_eq() {
    let env = Env::default();
    let predictor = Address::generate(&env);
    let a = Prediction::new(1, 5, 10, predictor.clone(), Symbol::new(&env, OUTCOME_TEAM_A), 100);
    let b = a.clone();
    assert_eq!(a, b);
}

#[test]
fn test_winner_clone_eq() {
    let env = Env::default();
    let user = Address::generate(&env);
    let a = Winner::new(user, 1, 5, 5, 100, 200);
    let b = a.clone();
    assert_eq!(a, b);
}

#[test]
fn test_event_debug_format() {
    let env = Env::default();
    let event = make_event(&env, 1);
    let debug_str = format!("{:?}", event);
    assert!(debug_str.contains("event_id: 1"));
    assert!(debug_str.contains("is_active: true"));
}

#[test]
fn test_match_debug_format() {
    let env = Env::default();
    let m = make_match(&env, 1, 100, 0);
    let debug_str = format!("{:?}", m);
    assert!(debug_str.contains("match_id: 1"));
    assert!(debug_str.contains("event_id: 100"));
}
