/// Integration tests for add_match (#800).
use creator_event_manager::storage_types::DataKey;
use creator_event_manager::CreatorEventManagerContractClient;
use soroban_sdk::testutils::Address as _;
use soroban_sdk::token::StellarAssetClient;
use soroban_sdk::{Address, Env, String};

const FEE: i128 = 1_000_000;
const FUTURE_OFFSET: u64 = 3_600;

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
    (env, client, admin, contract_id, xlm_token)
}

fn fund(env: &Env, token: &Address, user: &Address) {
    StellarAssetClient::new(env, token).mint(user, &(FEE * 10));
}

fn create_event(
    env: &Env,
    client: &CreatorEventManagerContractClient,
    token: &Address,
) -> (Address, u64) {
    let creator = Address::generate(env);
    fund(env, token, &creator);
    let (event_id, _) = client.create_event(
        &creator,
        &String::from_str(env, "World Cup 2026"),
        &String::from_str(env, "Predict the matches."),
        &50u32,
    );
    (creator, event_id)
}

fn team_a(env: &Env) -> String {
    String::from_str(env, "Argentina")
}

fn team_b(env: &Env) -> String {
    String::from_str(env, "Brazil")
}

fn future_time(env: &Env) -> u64 {
    env.ledger().timestamp() + FUTURE_OFFSET
}

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

#[test]
fn test_add_match_creator_can_add_match() {
    let (env, client, _admin, _contract_id, token) = setup();
    let (creator, event_id) = create_event(&env, &client, &token);

    let match_id = client.add_match(
        &creator,
        &event_id,
        &team_a(&env),
        &team_b(&env),
        &future_time(&env),
    );
    assert_eq!(match_id, 1);
}

#[test]
fn test_add_match_match_id_increments() {
    let (env, client, _admin, _contract_id, token) = setup();
    let (creator, event_id) = create_event(&env, &client, &token);

    let id1 = client.add_match(
        &creator,
        &event_id,
        &team_a(&env),
        &team_b(&env),
        &future_time(&env),
    );
    let id2 = client.add_match(
        &creator,
        &event_id,
        &String::from_str(&env, "France"),
        &String::from_str(&env, "Germany"),
        &future_time(&env),
    );
    assert_eq!(id1, 1);
    assert_eq!(id2, 2);
}

#[test]
fn test_add_match_increments_event_match_count() {
    let (env, client, _admin, _contract_id, token) = setup();
    let (creator, event_id) = create_event(&env, &client, &token);

    assert_eq!(client.get_event(&event_id).match_count, 0);

    client.add_match(
        &creator,
        &event_id,
        &team_a(&env),
        &team_b(&env),
        &future_time(&env),
    );

    assert_eq!(client.get_event(&event_id).match_count, 1);
}

// ---------------------------------------------------------------------------
// Authorization
// ---------------------------------------------------------------------------

#[test]
#[should_panic(expected = "unauthorized")]
fn test_add_match_non_creator_cannot_add_match() {
    let (env, client, _admin, _contract_id, token) = setup();
    let (_creator, event_id) = create_event(&env, &client, &token);
    let stranger = Address::generate(&env);

    client.add_match(
        &stranger,
        &event_id,
        &team_a(&env),
        &team_b(&env),
        &future_time(&env),
    );
}

// ---------------------------------------------------------------------------
// Pause guard
// ---------------------------------------------------------------------------

#[test]
#[should_panic(expected = "contract_paused")]
fn test_add_match_fails_when_paused() {
    let (env, client, admin, _contract_id, token) = setup();
    let (creator, event_id) = create_event(&env, &client, &token);
    client.pause(&admin);

    client.add_match(
        &creator,
        &event_id,
        &team_a(&env),
        &team_b(&env),
        &future_time(&env),
    );
}

// ---------------------------------------------------------------------------
// Event existence
// ---------------------------------------------------------------------------

#[test]
#[should_panic(expected = "event_not_found")]
fn test_add_match_event_not_found() {
    let (env, client, _admin, _contract_id, _token) = setup();
    let stranger = Address::generate(&env);

    client.add_match(
        &stranger,
        &999u64,
        &team_a(&env),
        &team_b(&env),
        &future_time(&env),
    );
}

// ---------------------------------------------------------------------------
// Cancelled event
// ---------------------------------------------------------------------------

#[test]
#[should_panic(expected = "event_cancelled")]
fn test_add_match_cancelled_event_blocks_adding() {
    let (env, client, _admin, contract_id, token) = setup();
    let (creator, event_id) = create_event(&env, &client, &token);

    // Inject cancelled state directly via as_contract — standard Soroban test pattern.
    env.as_contract(&contract_id, || {
        let key = DataKey::Event(event_id);
        let mut ev: creator_event_manager::storage_types::Event =
            env.storage().persistent().get(&key).unwrap();
        ev.is_cancelled = true;
        ev.is_active = false;
        env.storage().persistent().set(&key, &ev);
    });

    client.add_match(
        &creator,
        &event_id,
        &team_a(&env),
        &team_b(&env),
        &future_time(&env),
    );
}

// ---------------------------------------------------------------------------
// Team name validation
// ---------------------------------------------------------------------------

#[test]
#[should_panic(expected = "invalid_team_name")]
fn test_add_match_empty_team_a_rejected() {
    let (env, client, _admin, _contract_id, token) = setup();
    let (creator, event_id) = create_event(&env, &client, &token);

    client.add_match(
        &creator,
        &event_id,
        &String::from_str(&env, ""),
        &team_b(&env),
        &future_time(&env),
    );
}

#[test]
#[should_panic(expected = "invalid_team_name")]
fn test_add_match_empty_team_b_rejected() {
    let (env, client, _admin, _contract_id, token) = setup();
    let (creator, event_id) = create_event(&env, &client, &token);

    client.add_match(
        &creator,
        &event_id,
        &team_a(&env),
        &String::from_str(&env, ""),
        &future_time(&env),
    );
}

#[test]
#[should_panic(expected = "duplicate_team")]
fn test_add_match_duplicate_team_names_rejected() {
    let (env, client, _admin, _contract_id, token) = setup();
    let (creator, event_id) = create_event(&env, &client, &token);

    client.add_match(
        &creator,
        &event_id,
        &String::from_str(&env, "Argentina"),
        &String::from_str(&env, "Argentina"),
        &future_time(&env),
    );
}

// ---------------------------------------------------------------------------
// match_time validation
// ---------------------------------------------------------------------------

#[test]
#[should_panic(expected = "invalid_match_time")]
fn test_add_match_past_match_time_rejected() {
    let (env, client, _admin, _contract_id, token) = setup();
    let (creator, event_id) = create_event(&env, &client, &token);

    // Ledger timestamp equals now — not strictly in the future.
    let now = env.ledger().timestamp();
    client.add_match(&creator, &event_id, &team_a(&env), &team_b(&env), &now);
}

#[test]
#[should_panic(expected = "invalid_match_time")]
fn test_add_match_zero_match_time_rejected() {
    let (env, client, _admin, _contract_id, token) = setup();
    let (creator, event_id) = create_event(&env, &client, &token);

    client.add_match(
        &creator,
        &event_id,
        &team_a(&env),
        &team_b(&env),
        &0u64,
    );
}
