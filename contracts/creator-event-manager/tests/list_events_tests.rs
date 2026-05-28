/// Integration tests for list_events (#799).
use creator_event_manager::CreatorEventManagerContractClient;
use soroban_sdk::testutils::Address as _;
use soroban_sdk::token::StellarAssetClient;
use soroban_sdk::{Address, Env, String};

const FEE: i128 = 1_000_000;

fn setup() -> (
    Env,
    CreatorEventManagerContractClient<'static>,
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
    (env, client, admin, xlm_token)
}

fn fund(env: &Env, token: &Address, user: &Address) {
    StellarAssetClient::new(env, token).mint(user, &(FEE * 10));
}

fn create_n_events(env: &Env, client: &CreatorEventManagerContractClient, token: &Address, n: u32) {
    for _ in 0..n {
        let creator = Address::generate(env);
        fund(env, token, &creator);
        let title = String::from_str(env, "Event Title");
        let desc = String::from_str(env, "Event description for testing.");
        client.create_event(&creator, &title, &desc, &10u32);
    }
}

// ---------------------------------------------------------------------------
// Empty store
// ---------------------------------------------------------------------------

#[test]
fn test_list_events_empty_when_no_events() {
    let (_env, client, _admin, _token) = setup();
    let events = client.list_events(&0u64, &10u32);
    assert_eq!(events.len(), 0);
}

// ---------------------------------------------------------------------------
// Basic retrieval
// ---------------------------------------------------------------------------

#[test]
fn test_list_events_returns_correct_events() {
    let (env, client, _admin, token) = setup();
    create_n_events(&env, &client, &token, 3);

    let events = client.list_events(&0u64, &10u32);
    assert_eq!(events.len(), 3);
    assert_eq!(events.get(0).unwrap().event_id, 1);
    assert_eq!(events.get(1).unwrap().event_id, 2);
    assert_eq!(events.get(2).unwrap().event_id, 3);
}

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

#[test]
fn test_list_events_pagination_first_page() {
    let (env, client, _admin, token) = setup();
    create_n_events(&env, &client, &token, 5);

    let page = client.list_events(&0u64, &3u32);
    assert_eq!(page.len(), 3);
    assert_eq!(page.get(0).unwrap().event_id, 1);
    assert_eq!(page.get(1).unwrap().event_id, 2);
    assert_eq!(page.get(2).unwrap().event_id, 3);
}

#[test]
fn test_list_events_pagination_second_page() {
    let (env, client, _admin, token) = setup();
    create_n_events(&env, &client, &token, 5);

    let page = client.list_events(&3u64, &3u32);
    assert_eq!(page.len(), 2); // only events 4 and 5 remain
    assert_eq!(page.get(0).unwrap().event_id, 4);
    assert_eq!(page.get(1).unwrap().event_id, 5);
}

#[test]
fn test_list_events_pagination_exact_boundary() {
    let (env, client, _admin, token) = setup();
    create_n_events(&env, &client, &token, 4);

    // start=0, limit=4 — should return exactly all 4
    let page = client.list_events(&0u64, &4u32);
    assert_eq!(page.len(), 4);
}

// ---------------------------------------------------------------------------
// Limit cap at 50
// ---------------------------------------------------------------------------

#[test]
fn test_list_events_limit_capped_at_50() {
    let (env, client, _admin, token) = setup();
    create_n_events(&env, &client, &token, 60);

    // Requesting more than 50 should return at most 50.
    let events = client.list_events(&0u64, &100u32);
    assert_eq!(events.len(), 50);
}

#[test]
fn test_list_events_limit_exactly_50_allowed() {
    let (env, client, _admin, token) = setup();
    create_n_events(&env, &client, &token, 50);

    let events = client.list_events(&0u64, &50u32);
    assert_eq!(events.len(), 50);
}

// ---------------------------------------------------------------------------
// Out-of-bounds start
// ---------------------------------------------------------------------------

#[test]
fn test_list_events_out_of_bounds_start_returns_empty() {
    let (env, client, _admin, token) = setup();
    create_n_events(&env, &client, &token, 3);

    // start=5 is beyond the last event (total=3)
    let events = client.list_events(&5u64, &10u32);
    assert_eq!(events.len(), 0);
}

#[test]
fn test_list_events_start_equals_total_count_returns_empty() {
    let (env, client, _admin, token) = setup();
    create_n_events(&env, &client, &token, 3);

    // start=3 == total_count=3 → out of bounds
    let events = client.list_events(&3u64, &10u32);
    assert_eq!(events.len(), 0);
}
