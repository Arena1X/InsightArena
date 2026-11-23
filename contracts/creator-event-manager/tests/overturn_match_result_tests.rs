/// Tests for match result immutability and the admin-only overturn/dispute
/// path (#1701).
///
/// `submit_match_result` already rejects any direct resubmission
/// (`result_already_submitted`) — these tests cover the correction path:
/// `overturn_match_result` is the only way a finalized match's scoreline may
/// change, and only the admin may invoke it, only before the parent event is
/// finalized.
use creator_event_manager::storage;
use creator_event_manager::storage_types::{
    Match, FINALIZATION_BOND_STROOPS, MATCH_RESULT_OVERTURN_WINDOW_SECONDS,
};
use creator_event_manager::CreatorEventManagerContractClient;
use soroban_sdk::testutils::Address as _;
use soroban_sdk::testutils::Events as _;
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

// ---------------------------------------------------------------------------
// Immutability: direct resubmission is rejected
// ---------------------------------------------------------------------------

#[test]
#[should_panic(expected = "result_already_submitted")]
fn test_resubmission_after_finalized_match_result_rejected() {
    let (env, client, contract_id, _admin, ai_agent, xlm_token) = setup();
    let creator = Address::generate(&env);
    let (_event_id, _invite, match_id) =
        create_event_with_match(&env, &contract_id, &client, &creator, &xlm_token, 1_000);

    env.ledger().with_mut(|l| l.timestamp += 2_000);
    client.submit_match_result(&ai_agent, &match_id, &2u32, &1u32);

    // Any attempt to resubmit directly — even from the legitimate AI agent —
    // must be rejected. Correction only via overturn_match_result.
    client.submit_match_result(&ai_agent, &match_id, &0u32, &3u32);
}

// ---------------------------------------------------------------------------
// overturn_match_result: happy path
// ---------------------------------------------------------------------------

#[test]
fn test_admin_can_overturn_match_result() {
    let (env, client, contract_id, admin, ai_agent, xlm_token) = setup();
    let creator = Address::generate(&env);
    let (_event_id, _invite, match_id) =
        create_event_with_match(&env, &contract_id, &client, &creator, &xlm_token, 1_000);

    env.ledger().with_mut(|l| l.timestamp += 2_000);
    client.submit_match_result(&ai_agent, &match_id, &2u32, &1u32);

    client.overturn_match_result(&admin, &match_id, &0u32, &3u32);

    let m = read_match(&env, &contract_id, match_id);
    assert_eq!(m.home_score, Some(0));
    assert_eq!(m.away_score, Some(3));
    assert_eq!(m.winning_team, Some(1)); // TeamB now wins
    assert!(m.result_submitted);
}

#[test]
fn test_overturn_regrades_predictions() {
    let (env, client, contract_id, admin, ai_agent, xlm_token) = setup();
    let creator = Address::generate(&env);
    let predictor = Address::generate(&env);
    let (event_id, invite_code, match_id) =
        create_event_with_match(&env, &contract_id, &client, &creator, &xlm_token, 10_000);

    client.join_event(&predictor, &invite_code);
    // Predictor picks TeamA (2-1); the initial result agrees.
    let prediction_id = client.submit_prediction(&predictor, &match_id, &2u32, &1u32);

    env.ledger().with_mut(|l| l.timestamp += 10_000);
    client.submit_match_result(&ai_agent, &match_id, &2u32, &1u32);

    let prediction = client.get_prediction(&prediction_id);
    assert_eq!(prediction.points_earned, Some(4)); // exact score

    // Overturn to a scoreline the predictor's pick no longer matches at all.
    client.overturn_match_result(&admin, &match_id, &0u32, &3u32);

    let regraded = client.get_prediction(&prediction_id);
    assert_eq!(regraded.points_earned, Some(0));
    assert_eq!(regraded.is_correct, Some(false));

    // event_id kept alive for potential future assertions / clarity.
    let _ = event_id;
}

// ---------------------------------------------------------------------------
// overturn_match_result: guards
// ---------------------------------------------------------------------------

#[test]
#[should_panic(expected = "unauthorized")]
fn test_overturn_by_non_admin_rejected() {
    let (env, client, contract_id, _admin, ai_agent, xlm_token) = setup();
    let creator = Address::generate(&env);
    let (_event_id, _invite, match_id) =
        create_event_with_match(&env, &contract_id, &client, &creator, &xlm_token, 1_000);

    env.ledger().with_mut(|l| l.timestamp += 2_000);
    client.submit_match_result(&ai_agent, &match_id, &2u32, &1u32);

    let stranger = Address::generate(&env);
    client.overturn_match_result(&stranger, &match_id, &0u32, &3u32);
}

#[test]
#[should_panic(expected = "result_not_submitted")]
fn test_overturn_before_any_result_submitted_rejected() {
    let (env, client, contract_id, admin, _ai_agent, xlm_token) = setup();
    let creator = Address::generate(&env);
    let (_event_id, _invite, match_id) =
        create_event_with_match(&env, &contract_id, &client, &creator, &xlm_token, 1_000);

    client.overturn_match_result(&admin, &match_id, &0u32, &3u32);
}

#[test]
#[should_panic(expected = "match_not_found")]
fn test_overturn_unknown_match_rejected() {
    let (_env, client, _contract_id, admin, _ai_agent, _xlm_token) = setup();
    client.overturn_match_result(&admin, &999u64, &0u32, &3u32);
}

// ---------------------------------------------------------------------------
// overturn_match_result: rejected after the parent event is finalized
// ---------------------------------------------------------------------------

#[test]
#[should_panic(expected = "event_already_finalized")]
fn test_overturn_after_event_finalized_rejected() {
    let (env, client, contract_id, admin, ai_agent, xlm_token) = setup();
    let creator = Address::generate(&env);
    let (event_id, _invite, match_id) =
        create_event_with_match(&env, &contract_id, &client, &creator, &xlm_token, 1_000);

    env.ledger().with_mut(|l| l.timestamp += 2_000);
    client.submit_match_result(&ai_agent, &match_id, &2u32, &1u32);

    // Finalize the parent event (payouts are now locked to the 2-1 result).
    fund(&env, &xlm_token, &creator, FINALIZATION_BOND_STROOPS);
    client.finalize_event(&creator, &event_id);

    // Correcting the scoreline after payouts have been made must be rejected.
    client.overturn_match_result(&admin, &match_id, &0u32, &3u32);
}

#[test]
fn test_payouts_consistent_when_overturn_rejected_post_finalization() {
    let (env, client, contract_id, admin, ai_agent, xlm_token) = setup();
    let creator = Address::generate(&env);
    let predictor = Address::generate(&env);
    let (event_id, invite_code, match_id) =
        create_event_with_match(&env, &contract_id, &client, &creator, &xlm_token, 10_000);

    client.join_event(&predictor, &invite_code);
    // Predictor picks TeamA (2-1); the initial result agrees.
    let prediction_id = client.submit_prediction(&predictor, &match_id, &2u32, &1u32);

    env.ledger().with_mut(|l| l.timestamp += 10_000);
    client.submit_match_result(&ai_agent, &match_id, &2u32, &1u32);

    // Finalize the event so payouts are computed from the 2-1 result.
    fund(&env, &xlm_token, &creator, FINALIZATION_BOND_STROOPS);
    client.finalize_event(&creator, &event_id);

    let payouts_before = client.get_event_payouts(&event_id);

    // The post-finalization overturn is rejected; payouts must stay unchanged.
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.overturn_match_result(&admin, &match_id, &0u32, &3u32);
    }));
    assert!(result.is_err(), "overturn must be rejected post-finalization");

    let payouts_after = client.get_event_payouts(&event_id);
    assert_eq!(payouts_before, payouts_after);

    // The stored match result and prediction grading remain the original ones.
    let m = read_match(&env, &contract_id, match_id);
    assert_eq!(m.home_score, Some(2));
    assert_eq!(m.away_score, Some(1));

    let prediction = client.get_prediction(&prediction_id);
    assert_eq!(prediction.points_earned, Some(4));
    assert_eq!(prediction.is_correct, Some(true));
}

// ---------------------------------------------------------------------------
// Bounded overturn window & result finality
// ---------------------------------------------------------------------------

/// Count `("match", "result_final")` events emitted by the contract for
/// `match_id`.
fn count_result_final_events(env: &Env, contract_id: &Address, match_id: u64) -> u32 {
    use soroban_sdk::TryIntoVal;
    let mut count = 0u32;
    for event in env.events().all().iter() {
        if event.0 != *contract_id || event.1.len() != 2 {
            continue;
        }
        let t0: Result<Symbol, _> = event.1.get(0).unwrap().try_into_val(env);
        let t1: Result<Symbol, _> = event.1.get(1).unwrap().try_into_val(env);
        if let (Ok(t0), Ok(t1)) = (t0, t1) {
            if t0 == Symbol::new(env, "match") && t1 == Symbol::new(env, "result_final") {
                let data: Result<(u64, u64, u32, u32, u64), _> = event.2.try_into_val(env);
                if let Ok(data) = data {
                    if data.0 == match_id {
                        count += 1;
                    }
                }
            }
        }
    }
    count
}

#[test]
fn test_overturn_within_window_succeeds() {
    let (env, client, contract_id, admin, ai_agent, xlm_token) = setup();
    let creator = Address::generate(&env);
    let (_event_id, _invite, match_id) =
        create_event_with_match(&env, &contract_id, &client, &creator, &xlm_token, 1_000);

    env.ledger().with_mut(|l| l.timestamp += 2_000);
    client.submit_match_result(&ai_agent, &match_id, &2u32, &1u32);
    let submitted_at = env.ledger().timestamp();

    // One second before the window closes — still allowed.
    env.ledger()
        .set_timestamp(submitted_at + MATCH_RESULT_OVERTURN_WINDOW_SECONDS - 1);
    client.overturn_match_result(&admin, &match_id, &0u32, &3u32);

    let m = read_match(&env, &contract_id, match_id);
    assert_eq!(m.home_score, Some(0));
    assert_eq!(m.away_score, Some(3));
    // The window stays anchored to the original submission.
    assert_eq!(m.submitted_at, Some(submitted_at));
    assert_eq!(client.get_match_result_finalized_at(&match_id), None);
}

#[test]
#[should_panic(expected = "overturn_window_closed")]
fn test_overturn_after_window_rejected() {
    let (env, client, contract_id, admin, ai_agent, xlm_token) = setup();
    let creator = Address::generate(&env);
    let (_event_id, _invite, match_id) =
        create_event_with_match(&env, &contract_id, &client, &creator, &xlm_token, 1_000);

    env.ledger().with_mut(|l| l.timestamp += 2_000);
    client.submit_match_result(&ai_agent, &match_id, &2u32, &1u32);
    let submitted_at = env.ledger().timestamp();

    env.ledger()
        .set_timestamp(submitted_at + MATCH_RESULT_OVERTURN_WINDOW_SECONDS);
    client.overturn_match_result(&admin, &match_id, &0u32, &3u32);
}

#[test]
#[should_panic(expected = "overturn_window_closed")]
fn test_repeated_overturn_does_not_extend_window() {
    let (env, client, contract_id, admin, ai_agent, xlm_token) = setup();
    let creator = Address::generate(&env);
    let (_event_id, _invite, match_id) =
        create_event_with_match(&env, &contract_id, &client, &creator, &xlm_token, 1_000);

    env.ledger().with_mut(|l| l.timestamp += 2_000);
    client.submit_match_result(&ai_agent, &match_id, &2u32, &1u32);
    let submitted_at = env.ledger().timestamp();

    // An overturn late in the window must not restart it.
    env.ledger()
        .set_timestamp(submitted_at + MATCH_RESULT_OVERTURN_WINDOW_SECONDS - 10);
    client.overturn_match_result(&admin, &match_id, &0u32, &3u32);

    env.ledger()
        .set_timestamp(submitted_at + MATCH_RESULT_OVERTURN_WINDOW_SECONDS + 10);
    client.overturn_match_result(&admin, &match_id, &1u32, &1u32);
}

#[test]
#[should_panic(expected = "overturn_window_open")]
fn test_finalize_match_result_before_window_rejected() {
    let (env, client, contract_id, _admin, ai_agent, xlm_token) = setup();
    let creator = Address::generate(&env);
    let (_event_id, _invite, match_id) =
        create_event_with_match(&env, &contract_id, &client, &creator, &xlm_token, 1_000);

    env.ledger().with_mut(|l| l.timestamp += 2_000);
    client.submit_match_result(&ai_agent, &match_id, &2u32, &1u32);

    client.finalize_match_result(&match_id);
}

#[test]
fn test_finalize_match_result_emits_event_and_blocks_overturn() {
    let (env, client, contract_id, admin, ai_agent, xlm_token) = setup();
    let creator = Address::generate(&env);
    let (_event_id, _invite, match_id) =
        create_event_with_match(&env, &contract_id, &client, &creator, &xlm_token, 1_000);

    env.ledger().with_mut(|l| l.timestamp += 2_000);
    client.submit_match_result(&ai_agent, &match_id, &2u32, &1u32);
    let submitted_at = env.ledger().timestamp();

    let final_at = submitted_at + MATCH_RESULT_OVERTURN_WINDOW_SECONDS;
    env.ledger().set_timestamp(final_at);
    let finalized_at = client.finalize_match_result(&match_id);
    assert_eq!(finalized_at, final_at);
    assert_eq!(count_result_final_events(&env, &contract_id, match_id), 1);
    assert_eq!(
        client.get_match_result_finalized_at(&match_id),
        Some(final_at)
    );

    // Finality is recorded only once.
    let again = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.finalize_match_result(&match_id);
    }));
    assert!(again.is_err(), "finality must only be recorded once");

    // And the result can no longer be overturned.
    let overturn = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.overturn_match_result(&admin, &match_id, &0u32, &3u32);
    }));
    assert!(overturn.is_err(), "final result must not be overturned");

    let m = read_match(&env, &contract_id, match_id);
    assert_eq!(m.home_score, Some(2));
    assert_eq!(m.away_score, Some(1));
}

#[test]
fn test_finalize_event_marks_results_final_and_emits_event() {
    let (env, client, contract_id, _admin, ai_agent, xlm_token) = setup();
    let creator = Address::generate(&env);
    let (event_id, _invite, match_id) =
        create_event_with_match(&env, &contract_id, &client, &creator, &xlm_token, 10_000);

    env.ledger().with_mut(|l| l.timestamp += 20_000);
    client.submit_match_result(&ai_agent, &match_id, &2u32, &1u32);

    // Past the event end (creation + 100_000) but still inside the result's
    // overturn window (submission + MATCH_RESULT_OVERTURN_WINDOW_SECONDS).
    env.ledger().with_mut(|l| l.timestamp += 80_000);
    fund(&env, &xlm_token, &creator, FINALIZATION_BOND_STROOPS);
    client.finalize_event(&creator, &event_id);

    assert_eq!(count_result_final_events(&env, &contract_id, match_id), 1);
    assert_eq!(
        client.get_match_result_finalized_at(&match_id),
        Some(env.ledger().timestamp())
    );
}
