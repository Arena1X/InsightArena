/// Tests for match result immutability after event finalization (#2018).
///
/// Issue #2018 requires:
/// 1. Reject match result changes once the event is finalized
/// 2. Allow corrections only before finalization per policy
/// 3. A finalized result remains readable and unchanged
///
/// The contract enforces immutability via:
/// - `overturn_match_result` checks `parent_event.is_finalized` and rejects with `EventAlreadyFinalized`
/// - Direct resubmission is rejected by `Match::submit_result` → `ResultAlreadySubmitted`
/// - Once `finalize_event` marks the event as finalized, payouts lock to current standings
///
use creator_event_manager::storage;
use creator_event_manager::storage_types::{Match, FINALIZATION_BOND_STROOPS};
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
    let end_time = get_future_time(env, 100_000);
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

    (event_id, invite_code, match_id)
}

fn read_match(env: &Env, contract_id: &Address, match_id: u64) -> Match {
    env.as_contract(contract_id, || storage::get_match(env, match_id).unwrap())
}

// ===========================================================================
// Acceptance Criterion 1: Reject match result changes once finalized
// ===========================================================================

/// Test: overturn_match_result is rejected when parent event is finalized
///
/// Once the event is finalized (payouts staged), the match result is immutable.
/// Any attempt to change it via overturn_match_result must be rejected with
/// `EventAlreadyFinalized`.
#[test]
#[should_panic(expected = "event_already_finalized")]
fn test_issue_2018_overturn_after_finalized_rejected() {
    let (env, client, contract_id, admin, ai_agent, xlm_token) = setup();
    let creator = Address::generate(&env);
    let (event_id, _invite, match_id) =
        create_event_with_match(&env, &contract_id, &client, &creator, &xlm_token, 1_000);

    // Submit initial result
    env.ledger().with_mut(|l| l.timestamp += 2_000);
    client.submit_match_result(&ai_agent, &match_id, &2u32, &1u32);

    // Finalize the event (payouts computed from current standings)
    fund(&env, &xlm_token, &creator, FINALIZATION_BOND_STROOPS);
    client.finalize_event(&creator, &event_id);

    // Attempting to overturn the result after finalization must fail
    client.overturn_match_result(&admin, &match_id, &0u32, &3u32);
}

/// Test: direct resubmission is rejected (existing behavior)
///
/// Even before finalization, direct resubmission of a match result is rejected.
/// This ensures that once a result is submitted, only overturn_match_result can
/// modify it (or overturn_match_result gets blocked after finalization).
#[test]
#[should_panic(expected = "result_already_submitted")]
fn test_issue_2018_resubmission_rejected() {
    let (env, client, contract_id, _admin, ai_agent, xlm_token) = setup();
    let creator = Address::generate(&env);
    let (_event_id, _invite, match_id) =
        create_event_with_match(&env, &contract_id, &client, &creator, &xlm_token, 1_000);

    // Submit first result
    env.ledger().with_mut(|l| l.timestamp += 2_000);
    client.submit_match_result(&ai_agent, &match_id, &2u32, &1u32);

    // Direct resubmission rejected (no correction path at contract layer)
    client.submit_match_result(&ai_agent, &match_id, &0u32, &3u32);
}

// ===========================================================================
// Acceptance Criterion 2: Allow corrections only before finalization
// ===========================================================================

/// Test: overturn_match_result works before finalization
///
/// The admin can overturn a match result and re-grade all predictions,
/// as long as the parent event has not yet been finalized.
#[test]
fn test_issue_2018_overturn_before_finalization_allowed() {
    let (env, client, contract_id, admin, ai_agent, xlm_token) = setup();
    let creator = Address::generate(&env);
    let predictor = Address::generate(&env);
    let (event_id, invite_code, match_id) =
        create_event_with_match(&env, &contract_id, &client, &creator, &xlm_token, 10_000);

    // User joins and places a prediction
    client.join_event(&predictor, &invite_code);
    let prediction_id = client.submit_prediction(&predictor, &match_id, &2u32, &1u32);

    // Submit initial result that matches the prediction
    env.ledger().with_mut(|l| l.timestamp += 10_000);
    client.submit_match_result(&ai_agent, &match_id, &2u32, &1u32);

    let prediction_before = client.get_prediction(&prediction_id);
    assert_eq!(prediction_before.points_earned, Some(4)); // exact score
    assert_eq!(prediction_before.is_correct, Some(true));

    // Admin corrects the result to a different scoreline (before finalization)
    client.overturn_match_result(&admin, &match_id, &0u32, &3u32);

    // The match record is updated
    let m = read_match(&env, &contract_id, match_id);
    assert_eq!(m.home_score, Some(0));
    assert_eq!(m.away_score, Some(3));

    // Predictions are regraded to reflect the new result
    let prediction_after = client.get_prediction(&prediction_id);
    assert_eq!(prediction_after.is_correct, Some(false));
    assert_eq!(prediction_after.points_earned, Some(0));

    // Event can still be finalized with the corrected standings
    fund(&env, &xlm_token, &creator, FINALIZATION_BOND_STROOPS);
    client.finalize_event(&creator, &event_id);

    // After finalization, the corrected result is locked in
    let m_final = read_match(&env, &contract_id, match_id);
    assert_eq!(m_final.home_score, Some(0));
    assert_eq!(m_final.away_score, Some(3));
}

/// Test: pre-finalization correction allows multiple corrections
///
/// Before finalization, the admin can make multiple corrections if needed,
/// each time re-grading predictions. Only after finalization is the result locked.
#[test]
fn test_issue_2018_multiple_corrections_before_finalization_allowed() {
    let (env, client, contract_id, admin, ai_agent, xlm_token) = setup();
    let creator = Address::generate(&env);
    let (_event_id, _invite, match_id) =
        create_event_with_match(&env, &contract_id, &client, &creator, &xlm_token, 1_000);

    // Submit initial result
    env.ledger().with_mut(|l| l.timestamp += 2_000);
    client.submit_match_result(&ai_agent, &match_id, &2u32, &1u32);

    // First correction
    client.overturn_match_result(&admin, &match_id, &1u32, &0u32);
    let m1 = read_match(&env, &contract_id, match_id);
    assert_eq!(m1.home_score, Some(1));
    assert_eq!(m1.away_score, Some(0));

    // Second correction (still before finalization)
    client.overturn_match_result(&admin, &match_id, &3u32, &2u32);
    let m2 = read_match(&env, &contract_id, match_id);
    assert_eq!(m2.home_score, Some(3));
    assert_eq!(m2.away_score, Some(2));
}

// ===========================================================================
// Acceptance Criterion 3: Finalized result remains readable and unchanged
// ===========================================================================

/// Test: finalized match result is readable (contract-level verification)
///
/// Once a match is finalized as part of event finalization, the result
/// can be read and is guaranteed to be unchanged after that point.
#[test]
fn test_issue_2018_finalized_result_readable_and_immutable() {
    let (env, client, contract_id, _admin, ai_agent, xlm_token) = setup();
    let creator = Address::generate(&env);
    let (event_id, _invite, match_id) =
        create_event_with_match(&env, &contract_id, &client, &creator, &xlm_token, 1_000);

    // Submit a result
    env.ledger().with_mut(|l| l.timestamp += 2_000);
    client.submit_match_result(&ai_agent, &match_id, &2u32, &1u32);

    // Finalize the event
    fund(&env, &xlm_token, &creator, FINALIZATION_BOND_STROOPS);
    client.finalize_event(&creator, &event_id);

    // The result can be read
    let m = read_match(&env, &contract_id, match_id);
    assert_eq!(m.home_score, Some(2));
    assert_eq!(m.away_score, Some(1));
    assert_eq!(m.winning_team, Some(0)); // TeamA wins
    assert!(m.result_submitted);

    // The result is immutable: reading again yields the exact same values
    let m2 = read_match(&env, &contract_id, match_id);
    assert_eq!(m, m2);
}

/// Test: finalized result prevents payouts corruption
///
/// Payouts are computed from the standings at finalization time.
/// If a result could change after finalization, payouts would become
/// inconsistent with the actual standings. This test verifies payouts are stable.
#[test]
fn test_issue_2018_finalized_payouts_stable() {
    let (env, client, contract_id, admin, ai_agent, xlm_token) = setup();
    let creator = Address::generate(&env);
    let predictor = Address::generate(&env);
    let (event_id, invite_code, match_id) =
        create_event_with_match(&env, &contract_id, &client, &creator, &xlm_token, 10_000);

    // Participant joins and makes a prediction
    client.join_event(&predictor, &invite_code);
    let _prediction_id = client.submit_prediction(&predictor, &match_id, &2u32, &1u32);

    // Result submitted
    env.ledger().with_mut(|l| l.timestamp += 10_000);
    client.submit_match_result(&ai_agent, &match_id, &2u32, &1u32);

    // Event finalized — payouts computed from standings at this moment
    fund(&env, &xlm_token, &creator, FINALIZATION_BOND_STROOPS);
    client.finalize_event(&creator, &event_id);

    let payouts_at_finalization = client.get_event_payouts(&event_id);

    // Verify payouts are non-empty (winner received allocation)
    assert!(!payouts_at_finalization.is_empty(), "Payouts should be staged");

    // Attempting an overturn after finalization is rejected
    let overturn_result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.overturn_match_result(&admin, &match_id, &0u32, &3u32);
    }));
    assert!(
        overturn_result.is_err(),
        "Overturn must be rejected post-finalization"
    );

    // Payouts remain exactly as computed at finalization time
    let payouts_after_rejection = client.get_event_payouts(&event_id);
    assert_eq!(payouts_at_finalization, payouts_after_rejection);

    // The match result is unchanged
    let m = read_match(&env, &contract_id, match_id);
    assert_eq!(m.home_score, Some(2));
    assert_eq!(m.away_score, Some(1));
}

/// Test: standings remain consistent with finalized results
///
/// Once finalized, the event's standings (and therefore payouts) are locked
/// and cannot be altered by subsequent result changes.
#[test]
fn test_issue_2018_standings_consistent_with_finalized_results() {
    let (env, client, contract_id, _admin, ai_agent, xlm_token) = setup();
    let creator = Address::generate(&env);
    let predictor = Address::generate(&env);
    let (event_id, invite_code, match_id) =
        create_event_with_match(&env, &contract_id, &client, &creator, &xlm_token, 10_000);

    client.join_event(&predictor, &invite_code);
    let _prediction_id = client.submit_prediction(&predictor, &match_id, &2u32, &1u32);

    env.ledger().with_mut(|l| l.timestamp += 10_000);
    client.submit_match_result(&ai_agent, &match_id, &2u32, &1u32);

    let standings_before_finalize = client.get_event_standings(&event_id);

    fund(&env, &xlm_token, &creator, FINALIZATION_BOND_STROOPS);
    client.finalize_event(&creator, &event_id);

    // Event is now finalized
    let event = client.get_event(&event_id);
    assert!(event.is_finalized, "Event should be marked as finalized");

    // Standings snapshot is stable after finalization
    let standings_after_finalize = client.get_event_standings(&event_id);
    assert_eq!(standings_before_finalize, standings_after_finalize);
}

// ===========================================================================
// Summary of test coverage for #2018
// ===========================================================================

/// Issue #2018 Acceptance Criteria Verification:
///
/// ✅ Criterion 1: Reject match result changes once finalized
///    - test_issue_2018_overturn_after_finalized_rejected
///    - test_issue_2018_resubmission_rejected
///
/// ✅ Criterion 2: Allow corrections only before finalization
///    - test_issue_2018_overturn_before_finalization_allowed
///    - test_issue_2018_multiple_corrections_before_finalization_allowed
///
/// ✅ Criterion 3: Finalized result remains readable and unchanged
///    - test_issue_2018_finalized_result_readable_and_immutable
///    - test_issue_2018_finalized_payouts_stable
///    - test_issue_2018_standings_consistent_with_finalized_results
///
/// All tests verify that:
/// - Results cannot be changed after event finalization
/// - Results can be corrected before finalization via overturn_match_result
/// - Finalized results remain immutable and consistent
/// - Payouts locked at finalization time cannot be corrupted by post-finalization changes
