/// Integration tests for create_event, get_event, and get_event_by_code.
use creator_event_manager::CreatorEventManagerContractClient;
use soroban_sdk::testutils::Address as _;
use soroban_sdk::testutils::Ledger;
use soroban_sdk::token::StellarAssetClient;
use soroban_sdk::{Address, Env, String, Symbol, Vec};

const FEE: i128 = 1_000_000;

fn setup() -> (
    Env,
    CreatorEventManagerContractClient<'static>,
    Address,
    Address,
    Address,
) {
    let env = Env::default();
    env.mock_all_auths();

    // Set up a mock ledger timestamp (simulate that we're not at genesis time 0)
    env.ledger().with_mut(|li| {
        li.timestamp = 1_700_000_000; // Some reasonable timestamp
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
    (env, client, admin, treasury, xlm_token)
}

fn fund(env: &Env, token: &Address, user: &Address, amount: i128) {
    StellarAssetClient::new(env, token).mint(user, &amount);
}

fn title(env: &Env) -> String {
    String::from_str(env, "World Cup 2026 Predictions")
}

fn desc(env: &Env) -> String {
    String::from_str(env, "Predict the matches of the 2026 World Cup.")
}

// Helper functions for time management
fn get_future_time(env: &Env, offset_seconds: u64) -> u64 {
    env.ledger().timestamp() + offset_seconds
}

#[allow(dead_code)]
fn get_past_time(env: &Env, offset_seconds: u64) -> u64 {
    let current = env.ledger().timestamp();
    current.saturating_sub(offset_seconds)
}

#[test]
fn test_create_event_success() {
    let (env, client, _admin, _treasury, xlm_token) = setup();
    let creator = Address::generate(&env);
    fund(&env, &xlm_token, &creator, FEE);

    let start_time = get_future_time(&env, 3600); // 1 hour from now
    let end_time = get_future_time(&env, 7200); // 2 hours from now

    let (event_id, _invite_code) = client.create_event(
        &creator,
        &title(&env),
        &desc(&env),
        &5u32,
        &start_time,
        &end_time,
        &0i128,
        &Vec::new(&env),
        &0i128,
    );
    assert_eq!(event_id, 1);
}

#[test]
fn test_create_event_stores_correct_fields() {
    let (env, client, _admin, _treasury, xlm_token) = setup();
    let creator = Address::generate(&env);
    fund(&env, &xlm_token, &creator, FEE);

    let start_time = get_future_time(&env, 3600);
    let end_time = get_future_time(&env, 7200);

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

    let event = client.get_event(&event_id);
    assert_eq!(event.event_id, event_id);
    assert_eq!(event.creator, creator);
    assert_eq!(event.max_participants, 10);
    assert_eq!(event.creation_fee_paid, FEE);
    assert_eq!(event.invite_code, invite_code);
    assert_eq!(event.start_time, start_time);
    assert_eq!(event.end_time, end_time);
    assert!(event.is_active);
    assert!(!event.is_cancelled);
}

#[test]
fn test_create_event_fee_transferred_to_treasury() {
    let (env, client, _admin, treasury, xlm_token) = setup();
    let creator = Address::generate(&env);
    fund(&env, &xlm_token, &creator, FEE);

    let start_time = get_future_time(&env, 3600);
    let end_time = get_future_time(&env, 7200);

    let token = soroban_sdk::token::Client::new(&env, &xlm_token);
    let before = token.balance(&treasury);
    client.create_event(
        &creator,
        &title(&env),
        &desc(&env),
        &5u32,
        &start_time,
        &end_time,
        &0i128,
        &Vec::new(&env),
        &0i128,
    );
    assert_eq!(token.balance(&treasury) - before, FEE);
}

#[test]
#[should_panic(expected = "contract_paused")]
fn test_create_event_fails_when_paused() {
    let (env, client, admin, _treasury, xlm_token) = setup();
    client.pause(&admin);
    let creator = Address::generate(&env);
    fund(&env, &xlm_token, &creator, FEE);

    let start_time = get_future_time(&env, 3600);
    let end_time = get_future_time(&env, 7200);

    client.create_event(
        &creator,
        &title(&env),
        &desc(&env),
        &5u32,
        &start_time,
        &end_time,
        &0i128,
        &Vec::new(&env),
        &0i128,
    );
}

#[test]
#[should_panic(expected = "invalid_title")]
fn test_create_event_fails_empty_title() {
    let (env, client, _admin, _treasury, xlm_token) = setup();
    let creator = Address::generate(&env);
    fund(&env, &xlm_token, &creator, FEE);

    let start_time = get_future_time(&env, 3600);
    let end_time = get_future_time(&env, 7200);

    client.create_event(
        &creator,
        &String::from_str(&env, ""),
        &desc(&env),
        &5u32,
        &start_time,
        &end_time,
        &0i128,
        &Vec::new(&env),
        &0i128,
    );
}

#[test]
#[should_panic(expected = "invalid_description")]
fn test_create_event_fails_empty_description() {
    let (env, client, _admin, _treasury, xlm_token) = setup();
    let creator = Address::generate(&env);
    fund(&env, &xlm_token, &creator, FEE);

    let start_time = get_future_time(&env, 3600);
    let end_time = get_future_time(&env, 7200);

    client.create_event(
        &creator,
        &title(&env),
        &String::from_str(&env, ""),
        &5u32,
        &start_time,
        &end_time,
        &0i128,
        &Vec::new(&env),
        &0i128,
    );
}

#[test]
#[should_panic(expected = "invalid_max_participants")]
fn test_create_event_fails_zero_max_participants() {
    let (env, client, _admin, _treasury, xlm_token) = setup();
    let creator = Address::generate(&env);
    fund(&env, &xlm_token, &creator, FEE);

    let start_time = get_future_time(&env, 3600);
    let end_time = get_future_time(&env, 7200);

    client.create_event(
        &creator,
        &title(&env),
        &desc(&env),
        &0u32,
        &start_time,
        &end_time,
        &0i128,
        &Vec::new(&env),
        &0i128,
    );
}

#[test]
#[should_panic(expected = "insufficient_fee")]
fn test_create_event_fails_insufficient_balance() {
    let (env, client, _admin, _treasury, _xlm_token) = setup();
    let creator = Address::generate(&env);

    let start_time = get_future_time(&env, 3600);
    let end_time = get_future_time(&env, 7200);

    // no fund() call — creator has 0 balance
    client.create_event(
        &creator,
        &title(&env),
        &desc(&env),
        &5u32,
        &start_time,
        &end_time,
        &0i128,
        &Vec::new(&env),
        &0i128,
    );
}

#[test]
fn test_get_event_returns_correct_data() {
    let (env, client, _admin, _treasury, xlm_token) = setup();
    let creator = Address::generate(&env);
    fund(&env, &xlm_token, &creator, FEE);

    let start_time = get_future_time(&env, 3600);
    let end_time = get_future_time(&env, 7200);

    let (event_id, _) = client.create_event(
        &creator,
        &title(&env),
        &desc(&env),
        &7u32,
        &start_time,
        &end_time,
        &0i128,
        &Vec::new(&env),
        &0i128,
    );
    let event = client.get_event(&event_id);
    assert_eq!(event.event_id, event_id);
    assert_eq!(event.max_participants, 7);
    assert_eq!(event.start_time, start_time);
    assert_eq!(event.end_time, end_time);
}

#[test]
#[should_panic(expected = "event_not_found")]
fn test_get_event_not_found() {
    let (_env, client, _admin, _treasury, _xlm_token) = setup();
    client.get_event(&999u64);
}

#[test]
fn test_get_event_by_code_returns_correct_event() {
    let (env, client, _admin, _treasury, xlm_token) = setup();
    let creator = Address::generate(&env);
    fund(&env, &xlm_token, &creator, FEE);

    let start_time = get_future_time(&env, 3600);
    let end_time = get_future_time(&env, 7200);

    let (event_id, invite_code) = client.create_event(
        &creator,
        &title(&env),
        &desc(&env),
        &5u32,
        &start_time,
        &end_time,
        &0i128,
        &Vec::new(&env),
        &0i128,
    );
    let event = client.get_event_by_code(&invite_code);
    assert_eq!(event.event_id, event_id);
}

#[test]
#[should_panic(expected = "invalid_invite_code")]
fn test_get_event_by_code_invalid_code() {
    let (env, client, _admin, _treasury, _xlm_token) = setup();
    client.get_event_by_code(&Symbol::new(&env, "ZZZZZZZZ"));
}

// ============================================================================
// New Time-Based Validation Tests
// ============================================================================

#[test]
fn test_create_event_with_valid_duration() {
    let (env, client, _admin, _treasury, xlm_token) = setup();
    let creator = Address::generate(&env);
    fund(&env, &xlm_token, &creator, FEE);

    // Create an event with a 1-day duration (valid)
    let start_time = get_future_time(&env, 3600); // 1 hour from now
    let end_time = get_future_time(&env, 90000); // 25 hours from now (1 day + 1 hour)

    let (event_id, _invite_code) = client.create_event(
        &creator,
        &title(&env),
        &desc(&env),
        &5u32,
        &start_time,
        &end_time,
        &0i128,
        &Vec::new(&env),
        &0i128,
    );

    let event = client.get_event(&event_id);
    assert_eq!(event.start_time, start_time);
    assert_eq!(event.end_time, end_time);
}

#[test]
#[should_panic(expected = "invalid_time_range")]
fn test_create_event_end_before_start_rejected() {
    let (env, client, _admin, _treasury, xlm_token) = setup();
    let creator = Address::generate(&env);
    fund(&env, &xlm_token, &creator, FEE);

    // end_time before start_time
    let start_time = get_future_time(&env, 7200); // 2 hours from now
    let end_time = get_future_time(&env, 3600); // 1 hour from now

    client.create_event(
        &creator,
        &title(&env),
        &desc(&env),
        &5u32,
        &start_time,
        &end_time,
        &0i128,
        &Vec::new(&env),
        &0i128,
    );
}

#[test]
#[should_panic(expected = "invalid_time_range")]
fn test_create_event_end_equals_start_rejected() {
    let (env, client, _admin, _treasury, xlm_token) = setup();
    let creator = Address::generate(&env);
    fund(&env, &xlm_token, &creator, FEE);

    // end_time equals start_time
    let start_time = get_future_time(&env, 3600);
    let end_time = start_time;

    client.create_event(
        &creator,
        &title(&env),
        &desc(&env),
        &5u32,
        &start_time,
        &end_time,
        &0i128,
        &Vec::new(&env),
        &0i128,
    );
}

#[test]
#[should_panic(expected = "event_start_in_past")]
fn test_create_event_start_in_past_rejected() {
    let (env, client, _admin, _treasury, xlm_token) = setup();
    let creator = Address::generate(&env);
    fund(&env, &xlm_token, &creator, FEE);

    // start_time in the past - use current time minus some amount
    let current_time = env.ledger().timestamp();
    let start_time = current_time - 3600; // 1 hour ago
    let end_time = get_future_time(&env, 3600); // 1 hour from now

    client.create_event(
        &creator,
        &title(&env),
        &desc(&env),
        &5u32,
        &start_time,
        &end_time,
        &0i128,
        &Vec::new(&env),
        &0i128,
    );
}

#[test]
#[should_panic(expected = "event_duration_too_long")]
fn test_create_event_duration_too_long_rejected() {
    let (env, client, _admin, _treasury, xlm_token) = setup();
    let creator = Address::generate(&env);
    fund(&env, &xlm_token, &creator, FEE);

    // Duration longer than MAX_EVENT_DURATION_SECONDS (90 days)
    let start_time = get_future_time(&env, 3600); // 1 hour from now
    let end_time = get_future_time(&env, 7_776_001 + 3600); // 90 days + 1 second + 1 hour

    client.create_event(
        &creator,
        &title(&env),
        &desc(&env),
        &5u32,
        &start_time,
        &end_time,
        &0i128,
        &Vec::new(&env),
        &0i128,
    );
}

#[test]
fn test_event_has_ended_helper() {
    let (env, client, _admin, _treasury, xlm_token) = setup();
    let creator = Address::generate(&env);
    fund(&env, &xlm_token, &creator, FEE);

    let start_time = get_future_time(&env, 3600);
    let end_time = get_future_time(&env, 7200);

    let (event_id, _) = client.create_event(
        &creator,
        &title(&env),
        &desc(&env),
        &5u32,
        &start_time,
        &end_time,
        &0i128,
        &Vec::new(&env),
        &0i128,
    );
    let event = client.get_event(&event_id);

    // Before end_time
    assert!(!event.has_ended(end_time - 1));

    // At end_time
    assert!(event.has_ended(end_time));

    // After end_time
    assert!(event.has_ended(end_time + 1));
}

#[test]
fn test_event_is_within_window_helper() {
    let (env, client, _admin, _treasury, xlm_token) = setup();
    let creator = Address::generate(&env);
    fund(&env, &xlm_token, &creator, FEE);

    let start_time = get_future_time(&env, 3600);
    let end_time = get_future_time(&env, 7200);

    let (event_id, _) = client.create_event(
        &creator,
        &title(&env),
        &desc(&env),
        &5u32,
        &start_time,
        &end_time,
        &0i128,
        &Vec::new(&env),
        &0i128,
    );
    let event = client.get_event(&event_id);

    // Before start_time
    assert!(!event.is_within_window(start_time - 1));

    // At start_time (inclusive)
    assert!(event.is_within_window(start_time));

    // Between start and end
    assert!(event.is_within_window(start_time + 1800)); // 30 minutes after start

    // At end_time (inclusive)
    assert!(event.is_within_window(end_time));

    // After end_time
    assert!(!event.is_within_window(end_time + 1));
}

// ============================================================================
// Prize pool escrow + reward distribution tests
// ============================================================================

const PRIZE_POOL: i128 = 5_000_000;

/// A valid top-5 distribution summing to 100.
fn distribution(env: &Env) -> soroban_sdk::Vec<u32> {
    soroban_sdk::vec![env, 40u32, 30u32, 20u32, 5u32, 5u32]
}

#[test]
fn test_create_event_with_prize_pool_escrows_funds() {
    let (env, client, _admin, _treasury, xlm_token) = setup();
    let creator = Address::generate(&env);
    // Creator must cover both the creation fee and the prize pool.
    fund(&env, &xlm_token, &creator, FEE + PRIZE_POOL);

    let start_time = get_future_time(&env, 3600);
    let end_time = get_future_time(&env, 7200);

    let token = soroban_sdk::token::Client::new(&env, &xlm_token);
    let contract_before = token.balance(&client.address);
    let creator_before = token.balance(&creator);

    client.create_event(
        &creator,
        &title(&env),
        &desc(&env),
        &5u32,
        &start_time,
        &end_time,
        &PRIZE_POOL,
        &distribution(&env),
        &0i128,
    );

    // Contract escrows exactly the prize pool (the creation fee goes to treasury).
    assert_eq!(token.balance(&client.address) - contract_before, PRIZE_POOL);
    // Creator pays the creation fee plus the prize pool.
    assert_eq!(creator_before - token.balance(&creator), FEE + PRIZE_POOL);
}

#[test]
#[should_panic(expected = "invalid_reward_distribution")]
fn test_create_event_reward_distribution_must_sum_to_100() {
    let (env, client, _admin, _treasury, xlm_token) = setup();
    let creator = Address::generate(&env);
    fund(&env, &xlm_token, &creator, FEE + PRIZE_POOL);

    let start_time = get_future_time(&env, 3600);
    let end_time = get_future_time(&env, 7200);

    // 50 + 30 + 10 = 90, not 100.
    let dist = soroban_sdk::vec![&env, 50u32, 30u32, 10u32];
    client.create_event(
        &creator,
        &title(&env),
        &desc(&env),
        &5u32,
        &start_time,
        &end_time,
        &PRIZE_POOL,
        &dist,
        &0i128,
    );
}

#[test]
#[should_panic(expected = "invalid_reward_distribution")]
fn test_create_event_too_many_reward_ranks() {
    let (env, client, _admin, _treasury, xlm_token) = setup();
    let creator = Address::generate(&env);
    fund(&env, &xlm_token, &creator, FEE + PRIZE_POOL);

    let start_time = get_future_time(&env, 3600);
    let end_time = get_future_time(&env, 7200);

    // 6 entries exceeds MAX_REWARD_RANKS (5), even though they sum to 100.
    let dist = soroban_sdk::vec![&env, 20u32, 20u32, 20u32, 20u32, 10u32, 10u32];
    client.create_event(
        &creator,
        &title(&env),
        &desc(&env),
        &5u32,
        &start_time,
        &end_time,
        &PRIZE_POOL,
        &dist,
        &0i128,
    );
}

#[test]
#[should_panic(expected = "invalid_reward_distribution")]
fn test_create_event_zero_entry_in_distribution_rejected() {
    let (env, client, _admin, _treasury, xlm_token) = setup();
    let creator = Address::generate(&env);
    fund(&env, &xlm_token, &creator, FEE + PRIZE_POOL);

    let start_time = get_future_time(&env, 3600);
    let end_time = get_future_time(&env, 7200);

    // Sums to 100 but contains a zero entry.
    let dist = soroban_sdk::vec![&env, 100u32, 0u32];
    client.create_event(
        &creator,
        &title(&env),
        &desc(&env),
        &5u32,
        &start_time,
        &end_time,
        &PRIZE_POOL,
        &dist,
        &0i128,
    );
}

#[test]
#[should_panic(expected = "insufficient_prize_pool_funds")]
fn test_create_event_insufficient_balance_for_prize_pool() {
    let (env, client, _admin, _treasury, xlm_token) = setup();
    let creator = Address::generate(&env);
    // Enough for the fee, but one stroop short of the fee + prize pool.
    fund(&env, &xlm_token, &creator, FEE + PRIZE_POOL - 1);

    let start_time = get_future_time(&env, 3600);
    let end_time = get_future_time(&env, 7200);

    client.create_event(
        &creator,
        &title(&env),
        &desc(&env),
        &5u32,
        &start_time,
        &end_time,
        &PRIZE_POOL,
        &distribution(&env),
        &0i128,
    );
}

#[test]
#[should_panic(expected = "invalid_reward_distribution")]
fn test_create_event_zero_prize_pool_requires_empty_distribution() {
    let (env, client, _admin, _treasury, xlm_token) = setup();
    let creator = Address::generate(&env);
    fund(&env, &xlm_token, &creator, FEE);

    let start_time = get_future_time(&env, 3600);
    let end_time = get_future_time(&env, 7200);

    // Fun event (prize_pool == 0) must not specify a distribution.
    let dist = soroban_sdk::vec![&env, 50u32, 50u32];
    client.create_event(
        &creator,
        &title(&env),
        &desc(&env),
        &5u32,
        &start_time,
        &end_time,
        &0i128,
        &dist,
        &0i128,
    );
}

#[test]
fn test_get_event_prize_pool_and_distribution_views() {
    let (env, client, _admin, _treasury, xlm_token) = setup();
    let creator = Address::generate(&env);
    fund(&env, &xlm_token, &creator, FEE + PRIZE_POOL);

    let start_time = get_future_time(&env, 3600);
    let end_time = get_future_time(&env, 7200);

    let (event_id, _) = client.create_event(
        &creator,
        &title(&env),
        &desc(&env),
        &5u32,
        &start_time,
        &end_time,
        &PRIZE_POOL,
        &distribution(&env),
        &0i128,
    );

    assert_eq!(client.get_event_prize_pool(&event_id), PRIZE_POOL);
    assert_eq!(
        client.get_event_reward_distribution(&event_id),
        distribution(&env)
    );

    // Fields are persisted on the event itself, not finalized at creation.
    let event = client.get_event(&event_id);
    assert_eq!(event.prize_pool, PRIZE_POOL);
    assert_eq!(event.reward_distribution, distribution(&env));
    assert!(!event.is_finalized);
}

#[test]
fn test_get_event_prize_pool_zero_for_fun_event() {
    let (env, client, _admin, _treasury, xlm_token) = setup();
    let creator = Address::generate(&env);
    fund(&env, &xlm_token, &creator, FEE);

    let start_time = get_future_time(&env, 3600);
    let end_time = get_future_time(&env, 7200);

    let (event_id, _) = client.create_event(
        &creator,
        &title(&env),
        &desc(&env),
        &5u32,
        &start_time,
        &end_time,
        &0i128,
        &Vec::new(&env),
        &0i128,
    );

    assert_eq!(client.get_event_prize_pool(&event_id), 0);
    assert!(client.get_event_reward_distribution(&event_id).is_empty());
}
