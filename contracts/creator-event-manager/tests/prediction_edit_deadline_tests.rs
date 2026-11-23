/// Tests for the on-chain prediction edit deadline (#2204).
use creator_event_manager::CreatorEventManagerContractClient;
use soroban_sdk::testutils::Address as _;
use soroban_sdk::testutils::Events as _;
use soroban_sdk::testutils::Ledger as _;
use soroban_sdk::token::StellarAssetClient;
use soroban_sdk::{Address, Env, String, Symbol, TryIntoVal, Vec};

const FEE: i128 = 1_000_000;
const LOCK_LEAD_SECONDS: u64 = 600;
const MATCH_OFFSET: u64 = 5_000;

struct Fixture {
    env: Env,
    client: CreatorEventManagerContractClient<'static>,
    contract_id: Address,
    predictor: Address,
    match_id: u64,
    match_time: u64,
}

fn setup() -> Fixture {
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
    client.set_prediction_lock_lead_seconds(&admin, &LOCK_LEAD_SECONDS);

    let creator = Address::generate(&env);
    StellarAssetClient::new(&env, &xlm_token).mint(&creator, &FEE);

    let now = env.ledger().timestamp();
    let (event_id, invite_code) = client.create_event(
        &creator,
        &String::from_str(&env, "Edit Deadline Cup"),
        &String::from_str(&env, "Prediction edit deadline tests."),
        &10u32,
        &(now + 3_600),
        &(now + 7_200),
        &0i128,
        &Vec::new(&env),
        &0i128,
    );

    let match_time = now + MATCH_OFFSET;
    let match_id = client.create_match(
        &creator,
        &event_id,
        &String::from_str(&env, "Team A"),
        &String::from_str(&env, "Team B"),
        &match_time,
        &1u32,
    );

    let predictor = Address::generate(&env);
    client.join_event(&predictor, &invite_code);

    Fixture {
        env,
        client,
        contract_id,
        predictor,
        match_id,
        match_time,
    }
}

fn has_event(f: &Fixture, action: &str) -> bool {
    f.env.events().all().iter().any(|event| {
        if event.0 != f.contract_id || event.1.len() != 2 {
            return false;
        }
        let t0: Result<Symbol, _> = event.1.get(0).unwrap().try_into_val(&f.env);
        let t1: Result<Symbol, _> = event.1.get(1).unwrap().try_into_val(&f.env);
        matches!(
            (t0, t1),
            (Ok(a), Ok(b)) if a == Symbol::new(&f.env, "prediction") && b == Symbol::new(&f.env, action)
        )
    })
}

#[test]
fn test_edit_deadline_derives_from_match_start() {
    let f = setup();

    let deadline = f.client.get_prediction_edit_deadline(&f.match_id);

    assert_eq!(deadline, f.match_time - LOCK_LEAD_SECONDS);
    assert_eq!(deadline, f.client.get_match(&f.match_id).prediction_lock_time);
}

#[test]
fn test_edit_before_deadline_succeeds() {
    let f = setup();
    let prediction_id = f.client.submit_prediction(&f.predictor, &f.match_id, &1u32, &0u32);
    let original = f.client.get_prediction(&prediction_id);

    // One second before the deadline is still within the edit window.
    let deadline = f.client.get_prediction_edit_deadline(&f.match_id);
    f.env.ledger().with_mut(|l| l.timestamp = deadline - 1);

    let applied = f.client.edit_prediction(&f.predictor, &prediction_id, &0u32, &2u32);

    assert!(applied);
    assert!(has_event(&f, "edited"));
    let edited = f.client.get_prediction(&prediction_id);
    assert_eq!(edited.predicted_home_score, 0);
    assert_eq!(edited.predicted_away_score, 2);
    assert_eq!(edited.predicted_outcome, Symbol::new(&f.env, "TEAM_B"));
    assert_eq!(edited.predicted_at, original.predicted_at);
}

#[test]
fn test_edit_after_deadline_rejected_and_emits_event() {
    let f = setup();
    let prediction_id = f.client.submit_prediction(&f.predictor, &f.match_id, &1u32, &0u32);

    let deadline = f.client.get_prediction_edit_deadline(&f.match_id);
    f.env.ledger().with_mut(|l| l.timestamp = deadline + 1);

    let applied = f.client.edit_prediction(&f.predictor, &prediction_id, &0u32, &2u32);

    assert!(!applied);
    assert!(has_event(&f, "edit_rejected"));
    assert!(!has_event(&f, "edited"));
    let unchanged = f.client.get_prediction(&prediction_id);
    assert_eq!(unchanged.predicted_home_score, 1);
    assert_eq!(unchanged.predicted_away_score, 0);
}

#[test]
fn test_edit_at_exact_deadline_rejected() {
    let f = setup();
    let prediction_id = f.client.submit_prediction(&f.predictor, &f.match_id, &1u32, &0u32);

    let deadline = f.client.get_prediction_edit_deadline(&f.match_id);
    f.env.ledger().with_mut(|l| l.timestamp = deadline);

    assert!(!f.client.edit_prediction(&f.predictor, &prediction_id, &2u32, &2u32));
    assert_eq!(f.client.get_prediction(&prediction_id).predicted_home_score, 1);
}

#[test]
fn test_edit_after_match_start_rejected() {
    let f = setup();
    let prediction_id = f.client.submit_prediction(&f.predictor, &f.match_id, &1u32, &0u32);

    f.env.ledger().with_mut(|l| l.timestamp = f.match_time + 1);

    assert!(!f.client.edit_prediction(&f.predictor, &prediction_id, &3u32, &3u32));
    assert_eq!(f.client.get_prediction(&prediction_id).predicted_home_score, 1);
}

#[test]
#[should_panic(expected = "not_prediction_owner")]
fn test_edit_by_non_owner_rejected() {
    let f = setup();
    let prediction_id = f.client.submit_prediction(&f.predictor, &f.match_id, &1u32, &0u32);
    let stranger = Address::generate(&f.env);

    f.client.edit_prediction(&stranger, &prediction_id, &0u32, &2u32);
}
