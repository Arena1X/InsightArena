/// Integration tests for cancel_event (#1019).
use creator_event_manager::CreatorEventManagerContractClient;
use soroban_sdk::testutils::Address as _;
use soroban_sdk::testutils::Ledger;
use soroban_sdk::token::StellarAssetClient;
use soroban_sdk::{Address, Env, String, Vec};

const FEE: i128 = 1_000_000;

fn setup() -> (
    Env,
    CreatorEventManagerContractClient<'static>,
    Address, // admin
    Address, // xlm_token
) {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().with_mut(|li| {
        li.timestamp = 1_700_000_000;
    });

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
    (env, client, admin, xlm_token)
}

fn fund(env: &Env, token: &Address, user: &Address, amount: i128) {
    StellarAssetClient::new(env, token).mint(user, &amount);
}

/// Create a basic event and return its id.
fn create_event(
    env: &Env,
    client: &CreatorEventManagerContractClient,
    creator: &Address,
    xlm_token: &Address,
) -> u64 {
    fund(env, xlm_token, creator, FEE);
    let now = env.ledger().timestamp();
    let (event_id, _) = client.create_event(
        creator,
        &String::from_str(env, "Test Event"),
        &String::from_str(env, "A test event"),
        &10u32,
        &(now + 3600),
        &(now + 7200),
        &0i128,
        &Vec::new(env),
        &0i128,
    );
    event_id
}

// -----------------------------------------------------------------------
// Happy path
// -----------------------------------------------------------------------

#[test]
fn test_cancel_event_success() {
    let (env, client, _admin, xlm_token) = setup();
    let creator = Address::generate(&env);
    let event_id = create_event(&env, &client, &creator, &xlm_token);

    client.cancel_event(&creator, &event_id);

    let event = client.get_event(&event_id);
    assert!(event.is_cancelled);
    assert!(!event.is_active);
}

// -----------------------------------------------------------------------
// Guard: non-creator cannot cancel
// -----------------------------------------------------------------------

#[test]
#[should_panic(expected = "unauthorized")]
fn test_cancel_event_non_creator_rejected() {
    let (env, client, _admin, xlm_token) = setup();
    let creator = Address::generate(&env);
    let stranger = Address::generate(&env);
    let event_id = create_event(&env, &client, &creator, &xlm_token);

    client.cancel_event(&stranger, &event_id);
}

// -----------------------------------------------------------------------
// Guard: already-cancelled event is rejected
// -----------------------------------------------------------------------

#[test]
#[should_panic(expected = "event_cancelled")]
fn test_cancel_event_already_cancelled() {
    let (env, client, _admin, xlm_token) = setup();
    let creator = Address::generate(&env);
    let event_id = create_event(&env, &client, &creator, &xlm_token);

    client.cancel_event(&creator, &event_id);
    client.cancel_event(&creator, &event_id); // second call must panic
}

// -----------------------------------------------------------------------
// Guard: cancelled event blocks join_event
// -----------------------------------------------------------------------

#[test]
#[should_panic(expected = "event_cancelled")]
fn test_join_cancelled_event_rejected() {
    let (env, client, _admin, xlm_token) = setup();
    let creator = Address::generate(&env);
    let participant = Address::generate(&env);
    let event_id = create_event(&env, &client, &creator, &xlm_token);

    let event = client.get_event(&event_id);
    client.cancel_event(&creator, &event_id);
    client.join_event(&participant, &event.invite_code);
}

// -----------------------------------------------------------------------
// Guard: cancelled event blocks create_match
// -----------------------------------------------------------------------

#[test]
#[should_panic(expected = "event_cancelled")]
fn test_create_match_on_cancelled_event_rejected() {
    let (env, client, _admin, xlm_token) = setup();
    let creator = Address::generate(&env);
    let event_id = create_event(&env, &client, &creator, &xlm_token);

    client.cancel_event(&creator, &event_id);

    let now = env.ledger().timestamp();
    client.create_match(
        &creator,
        &event_id,
        &String::from_str(&env, "Team A"),
        &String::from_str(&env, "Team B"),
        &(now + 3600),
        &1u32,
    );
}

// -----------------------------------------------------------------------
// Guard: non-existent event returns event_not_found
// -----------------------------------------------------------------------

#[test]
#[should_panic(expected = "event_not_found")]
fn test_cancel_event_not_found() {
    let (env, client, _admin, _xlm_token) = setup();
    let caller = Address::generate(&env);
    client.cancel_event(&caller, &9999u64);
}
