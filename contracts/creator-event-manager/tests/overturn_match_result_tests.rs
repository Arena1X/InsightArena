/// Tests for match result immutability and the admin-only overturn/dispute
/// path (#1701).
///
/// `submit_match_result` already rejects any direct resubmission
/// (`result_already_submitted`) — these tests cover the correction path:
/// `overturn_match_result` is the only way a finalized match's scoreline may
/// change, and only the admin may invoke it, only before the parent event is
/// finalized.
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

#[test]
#[should_panic(expected = "event_already_finalized")]
fn test_overturn_after_event_finalized_rejected() {
    let (env, client, contract_id, admin, ai_agent, xlm_token) = setup();
    let creator = Address::generate(&env);
    fund(&env, &xlm_token, &creator, FEE);

    let start_time = env.ledger().timestamp() + 100;
    let end_time = env.ledger().timestamp() + 1_000;
    let (event_id, _invite_code) = client.create_event(
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

    let match_id = env.as_contract(&contract_id, || {
        let match_id = storage::next_match_id(&env);
        let match_record = Match::new(
            match_id,
            event_id,
            String::from_str(&env, "Team A"),
            String::from_str(&env, "Team B"),
            env.ledger().timestamp() + 200,
            1u32,
            0,
        );
        storage::set_match(&env, match_id, &match_record);
        storage::add_event_match(&env, event_id, match_id);

        let mut event = storage::get_event(&env, event_id).expect("event exists");
        event.add_match();
        storage::set_event(&env, event_id, &event);
        match_id
    });

    env.ledger().with_mut(|l| l.timestamp += 300);
    client.submit_match_result(&ai_agent, &match_id, &2u32, &1u32);

    // Move past end_time and finalize.
    env.ledger().with_mut(|l| l.timestamp += 1_000);
    let finalizer = Address::generate(&env);
    fund(&env, &xlm_token, &finalizer, FINALIZATION_BOND_STROOPS);
    client.finalize_event(&finalizer, &event_id);

    // Once finalized, the result is immutable — even to the admin.
    client.overturn_match_result(&admin, &match_id, &0u32, &3u32);
}
