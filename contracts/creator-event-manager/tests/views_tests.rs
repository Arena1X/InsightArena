/// Tests for aggregate event statistics views.
use creator_event_manager::storage;
use creator_event_manager::storage_types::{Match, MatchResult, Prediction, Winner};
use creator_event_manager::CreatorEventManagerContractClient;
use soroban_sdk::testutils::Address as _;
use soroban_sdk::token::StellarAssetClient;
use soroban_sdk::{Address, Env, String, Symbol};

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

fn add_match(env: &Env, event_id: u64, submitted: bool) -> u64 {
    let match_id = storage::next_match_id(env);
    let mut match_record = Match::new(
        match_id,
        event_id,
        String::from_str(env, "Team A"),
        String::from_str(env, "Team B"),
        env.ledger().timestamp() + 10_000,
    );

    if submitted {
        match_record
            .submit_result(
                MatchResult::TeamA,
                Address::generate(env),
                env.ledger().timestamp(),
            )
            .expect("result can be submitted");
    }

    storage::set_match(env, match_id, &match_record);
    storage::add_event_match(env, event_id, match_id);

    let mut event = storage::get_event(env, event_id).expect("event exists");
    event.add_match();
    storage::set_event(env, event_id, &event);

    match_id
}

fn add_prediction(env: &Env, event_id: u64, match_id: u64, predictor: &Address) {
    let prediction_id = storage::next_prediction_id(env);
    let prediction = Prediction::new(
        prediction_id,
        match_id,
        event_id,
        predictor.clone(),
        Symbol::new(env, "TEAM_A"),
        env.ledger().timestamp(),
    );
    storage::set_prediction(env, prediction_id, &prediction);
    storage::add_match_prediction(env, match_id, prediction_id);
    storage::add_user_prediction(env, predictor, event_id, prediction_id);
}

#[test]
fn test_get_event_participants_returns_all_participants() {
    let (env, client, _contract_id, xlm_token) = setup();
    let creator = Address::generate(&env);
    let user_one = Address::generate(&env);
    let user_two = Address::generate(&env);
    let user_three = Address::generate(&env);
    fund(&env, &xlm_token, &creator, FEE);

    let (event_id, invite_code) = client.create_event(&creator, &title(&env), &desc(&env), &5u32);
    client.join_event(&user_one, &invite_code);
    client.join_event(&user_two, &invite_code);
    client.join_event(&user_three, &invite_code);

    let participants = client.get_event_participants(&event_id);

    assert_eq!(participants.len(), 3);
    assert_eq!(participants.get(0).unwrap(), user_one);
    assert_eq!(participants.get(1).unwrap(), user_two);
    assert_eq!(participants.get(2).unwrap(), user_three);
}

#[test]
fn test_get_event_participants_empty_for_new_event() {
    let (env, client, _contract_id, xlm_token) = setup();
    let creator = Address::generate(&env);
    fund(&env, &xlm_token, &creator, FEE);

    let (event_id, _) = client.create_event(&creator, &title(&env), &desc(&env), &5u32);

    let participants = client.get_event_participants(&event_id);
    assert_eq!(participants.len(), 0);
}

#[test]
fn test_get_event_participants_updates_as_participants_join() {
    let (env, client, _contract_id, xlm_token) = setup();
    let creator = Address::generate(&env);
    let user_one = Address::generate(&env);
    let user_two = Address::generate(&env);
    fund(&env, &xlm_token, &creator, FEE);

    let (event_id, invite_code) = client.create_event(&creator, &title(&env), &desc(&env), &5u32);

    let initial_participants = client.get_event_participants(&event_id);
    assert_eq!(initial_participants.len(), 0);

    client.join_event(&user_one, &invite_code);
    let one_participant = client.get_event_participants(&event_id);
    assert_eq!(one_participant.len(), 1);
    assert_eq!(one_participant.get(0).unwrap(), user_one);

    client.join_event(&user_two, &invite_code);
    let two_participants = client.get_event_participants(&event_id);
    assert_eq!(two_participants.len(), 2);
    assert_eq!(two_participants.get(0).unwrap(), user_one);
    assert_eq!(two_participants.get(1).unwrap(), user_two);
}

#[test]
#[should_panic(expected = "event_not_found")]
fn test_get_event_participants_missing_event_panics() {
    let (_env, client, _contract_id, _xlm_token) = setup();
    client.get_event_participants(&999u64);
}

#[test]
fn test_event_statistics_are_accurate() {
    let (env, client, contract_id, xlm_token) = setup();
    let creator = Address::generate(&env);
    let user_one = Address::generate(&env);
    let user_two = Address::generate(&env);
    fund(&env, &xlm_token, &creator, FEE);

    let (event_id, invite_code) = client.create_event(&creator, &title(&env), &desc(&env), &5u32);
    client.join_event(&user_one, &invite_code);
    client.join_event(&user_two, &invite_code);

    env.as_contract(&contract_id, || {
        let first_match = add_match(&env, event_id, false);
        let second_match = add_match(&env, event_id, false);

        add_prediction(&env, event_id, first_match, &user_one);
        add_prediction(&env, event_id, first_match, &user_two);
        add_prediction(&env, event_id, second_match, &user_one);
    });

    let statistics = client.get_event_statistics(&event_id);
    assert_eq!(statistics.event_id, event_id);
    assert_eq!(statistics.participant_count, 2);
    assert_eq!(statistics.match_count, 2);
    assert_eq!(statistics.total_predictions, 3);
    assert!(!statistics.all_matches_resolved);
    assert!(!statistics.winners_verified);
    assert_eq!(statistics.winner_count, 0);
}

#[test]
fn test_event_statistics_completion_status() {
    let (env, client, contract_id, xlm_token) = setup();
    let creator = Address::generate(&env);
    let winner = Address::generate(&env);
    fund(&env, &xlm_token, &creator, FEE);

    let (event_id, _) = client.create_event(&creator, &title(&env), &desc(&env), &5u32);

    env.as_contract(&contract_id, || {
        add_match(&env, event_id, true);
        add_match(&env, event_id, false);
    });

    let pending_statistics = client.get_event_statistics(&event_id);
    assert!(!pending_statistics.all_matches_resolved);
    assert!(!pending_statistics.winners_verified);
    assert_eq!(pending_statistics.winner_count, 0);

    env.as_contract(&contract_id, || {
        for match_id in storage::get_event_matches(&env, event_id).iter() {
            let mut match_record = storage::get_match(&env, match_id).expect("match exists");
            if !match_record.result_submitted {
                match_record
                    .submit_result(
                        MatchResult::TeamA,
                        Address::generate(&env),
                        env.ledger().timestamp(),
                    )
                    .expect("result can be submitted");
                storage::set_match(&env, match_id, &match_record);
            }
        }

        let verified_winner = Winner::new(winner, event_id, 2, 2, 100, env.ledger().timestamp());
        storage::add_event_winner(&env, event_id, &verified_winner);
    });

    let completed_statistics = client.get_event_statistics(&event_id);
    assert!(completed_statistics.all_matches_resolved);
    assert!(completed_statistics.winners_verified);
    assert_eq!(completed_statistics.winner_count, 1);
}

#[test]
#[should_panic(expected = "event_not_found")]
fn test_event_statistics_missing_event_panics() {
    let (_env, client, _contract_id, _xlm_token) = setup();
    client.get_event_statistics(&999u64);
}
