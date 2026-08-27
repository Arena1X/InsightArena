/// Tests for invite code expiry and use-cap enforcement (#1699).
use creator_event_manager::CreatorEventManagerContractClient;
use soroban_sdk::testutils::Address as _;
use soroban_sdk::testutils::Ledger as _;
use soroban_sdk::token::StellarAssetClient;
use soroban_sdk::{Address, Env, String, Vec};

const FEE: i128 = 1_000_000;

fn setup() -> (
    Env,
    CreatorEventManagerContractClient<'static>,
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
    (env, client, contract_id, xlm_token)
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

fn get_future_time(env: &Env, offset_seconds: u64) -> u64 {
    env.ledger().timestamp() + offset_seconds
}

fn create_event_default(
    client: &CreatorEventManagerContractClient<'static>,
    env: &Env,
    creator: &Address,
    max_participants: u32,
) -> (u64, soroban_sdk::Symbol) {
    let start_time = get_future_time(env, 3600);
    let end_time = get_future_time(env, 7200);
    client.create_event(
        creator,
        &title(env),
        &desc(env),
        &max_participants,
        &start_time,
        &end_time,
        &0i128,
        &Vec::new(env),
        &0i128,
    )
}

// ---------------------------------------------------------------------------
// Defaults: unrestricted until configured
// ---------------------------------------------------------------------------

#[test]
fn test_fresh_invite_code_has_no_expiry_or_cap() {
    let (env, client, _contract_id, xlm_token) = setup();
    let creator = Address::generate(&env);
    fund(&env, &xlm_token, &creator, FEE);
    let (_event_id, invite_code) = create_event_default(&client, &env, &creator, 10);

    // Many users can join without hitting any cap, and far in the future
    // still succeeds without hitting any expiry.
    for _ in 0..5 {
        let user = Address::generate(&env);
        client.join_event(&user, &invite_code);
    }

    env.ledger().with_mut(|l| l.timestamp += 10_000_000);
    let late_user = Address::generate(&env);
    client.join_event(&late_user, &invite_code);
}

// ---------------------------------------------------------------------------
// Expiry
// ---------------------------------------------------------------------------

#[test]
fn test_set_invite_limits_expiry_rejects_after_expiry() {
    let (env, client, _contract_id, xlm_token) = setup();
    let creator = Address::generate(&env);
    fund(&env, &xlm_token, &creator, FEE);
    let (event_id, invite_code) = create_event_default(&client, &env, &creator, 10);

    let expires_at = env.ledger().timestamp() + 100;
    client.set_invite_limits(&creator, &event_id, &expires_at, &0u32);

    env.ledger().with_mut(|l| l.timestamp = expires_at);

    let user = Address::generate(&env);
    let result = client.try_join_event(&user, &invite_code);
    assert!(result.is_err());
}

#[test]
fn test_set_invite_limits_expiry_allows_before_expiry() {
    let (env, client, _contract_id, xlm_token) = setup();
    let creator = Address::generate(&env);
    fund(&env, &xlm_token, &creator, FEE);
    let (event_id, invite_code) = create_event_default(&client, &env, &creator, 10);

    let expires_at = env.ledger().timestamp() + 100;
    client.set_invite_limits(&creator, &event_id, &expires_at, &0u32);

    let user = Address::generate(&env);
    client.join_event(&user, &invite_code);

    let event = client.get_event(&event_id);
    assert_eq!(event.participant_count, 1);
}

// ---------------------------------------------------------------------------
// Use cap
// ---------------------------------------------------------------------------

#[test]
fn test_set_invite_limits_use_cap_rejects_once_exceeded() {
    let (env, client, _contract_id, xlm_token) = setup();
    let creator = Address::generate(&env);
    fund(&env, &xlm_token, &creator, FEE);
    let (event_id, invite_code) = create_event_default(&client, &env, &creator, 10);

    client.set_invite_limits(&creator, &event_id, &0u64, &2u32);

    let user_a = Address::generate(&env);
    let user_b = Address::generate(&env);
    let user_c = Address::generate(&env);

    client.join_event(&user_a, &invite_code);
    client.join_event(&user_b, &invite_code);

    let result = client.try_join_event(&user_c, &invite_code);
    assert!(result.is_err());

    let event = client.get_event(&event_id);
    assert_eq!(event.participant_count, 2);
}

#[test]
fn test_valid_redemption_increments_use_count_exactly_once() {
    let (env, client, _contract_id, xlm_token) = setup();
    let creator = Address::generate(&env);
    fund(&env, &xlm_token, &creator, FEE);
    let (event_id, invite_code) = create_event_default(&client, &env, &creator, 10);

    client.set_invite_limits(&creator, &event_id, &0u64, &5u32);

    let user = Address::generate(&env);
    client.join_event(&user, &invite_code);

    // Redeeming exactly once leaves 4 more uses available — verify by
    // successfully joining with 4 more distinct users and then rejecting a
    // 6th, proving use_count advanced by exactly 1 per redemption.
    for _ in 0..4 {
        let more = Address::generate(&env);
        client.join_event(&more, &invite_code);
    }

    let sixth = Address::generate(&env);
    let result = client.try_join_event(&sixth, &invite_code);
    assert!(result.is_err());
}

// ---------------------------------------------------------------------------
// Authorization
// ---------------------------------------------------------------------------

#[test]
#[should_panic(expected = "unauthorized")]
fn test_set_invite_limits_non_creator_rejected() {
    let (env, client, _contract_id, xlm_token) = setup();
    let creator = Address::generate(&env);
    let stranger = Address::generate(&env);
    fund(&env, &xlm_token, &creator, FEE);
    let (event_id, _invite_code) = create_event_default(&client, &env, &creator, 10);

    client.set_invite_limits(&stranger, &event_id, &0u64, &1u32);
}

#[test]
#[should_panic(expected = "event_not_found")]
fn test_set_invite_limits_unknown_event_panics() {
    let (env, client, _contract_id, _xlm_token) = setup();
    let creator = Address::generate(&env);

    client.set_invite_limits(&creator, &999u64, &0u64, &1u32);
}

// ---------------------------------------------------------------------------
// get_invite_code_info view (#1514)
// ---------------------------------------------------------------------------

#[test]
fn test_get_invite_code_info_legacy_code_is_unlimited_and_valid() {
    let (env, client, _contract_id, xlm_token) = setup();
    let creator = Address::generate(&env);
    fund(&env, &xlm_token, &creator, FEE);
    let (event_id, invite_code) = create_event_default(&client, &env, &creator, 10);

    let info = client.get_invite_code_info(&invite_code);
    assert_eq!(info.event_id, event_id);
    assert_eq!(info.expires_at, 0);
    assert_eq!(info.max_uses, 0);
    assert_eq!(info.use_count, 0);
    assert_eq!(info.remaining_uses, u32::MAX);
    assert!(info.is_valid);
}

#[test]
fn test_get_invite_code_info_reflects_remaining_uses() {
    let (env, client, _contract_id, xlm_token) = setup();
    let creator = Address::generate(&env);
    fund(&env, &xlm_token, &creator, FEE);
    let (event_id, invite_code) = create_event_default(&client, &env, &creator, 10);

    client.set_invite_limits(&creator, &event_id, &0u64, &3u32);

    let user = Address::generate(&env);
    client.join_event(&user, &invite_code);

    let info = client.get_invite_code_info(&invite_code);
    assert_eq!(info.max_uses, 3);
    assert_eq!(info.use_count, 1);
    assert_eq!(info.remaining_uses, 2);
    assert!(info.is_valid);
}

#[test]
fn test_get_invite_code_info_reports_invalid_once_exhausted() {
    let (env, client, _contract_id, xlm_token) = setup();
    let creator = Address::generate(&env);
    fund(&env, &xlm_token, &creator, FEE);
    let (event_id, invite_code) = create_event_default(&client, &env, &creator, 10);

    client.set_invite_limits(&creator, &event_id, &0u64, &1u32);

    let user = Address::generate(&env);
    client.join_event(&user, &invite_code);

    let info = client.get_invite_code_info(&invite_code);
    assert_eq!(info.use_count, 1);
    assert_eq!(info.remaining_uses, 0);
    assert!(!info.is_valid);
}

#[test]
fn test_get_invite_code_info_reports_invalid_once_expired() {
    let (env, client, _contract_id, xlm_token) = setup();
    let creator = Address::generate(&env);
    fund(&env, &xlm_token, &creator, FEE);
    let (event_id, invite_code) = create_event_default(&client, &env, &creator, 10);

    let expires_at = env.ledger().timestamp() + 100;
    client.set_invite_limits(&creator, &event_id, &expires_at, &0u32);

    let info_before = client.get_invite_code_info(&invite_code);
    assert!(info_before.is_valid);

    env.ledger().with_mut(|l| l.timestamp = expires_at);

    let info_after = client.get_invite_code_info(&invite_code);
    assert!(!info_after.is_valid);
    // Expiry does not affect the recorded use count/remaining budget.
    assert_eq!(info_after.remaining_uses, u32::MAX);
}

#[test]
#[should_panic(expected = "invalid_invite_code")]
fn test_get_invite_code_info_unknown_code_panics() {
    let (env, client, _contract_id, _xlm_token) = setup();
    client.get_invite_code_info(&soroban_sdk::Symbol::new(&env, "NOPE0000"));
}
