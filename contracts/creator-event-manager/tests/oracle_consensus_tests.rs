/// Tests for multi-submitter oracle consensus on match results (#1698).
///
/// `propose_match_result` lets any configured oracle source submit a
/// scoreline proposal for a match. Once distinct sources agree on the same
/// scoreline `min_sources` (the configured threshold) times, the match is
/// finalized exactly as `submit_match_result` would be. Submissions after
/// finalization — matching or conflicting — are rejected.
///
/// `compute_oracle_median` aggregates the submitted values into a consensus
/// value. For an even number of submissions the documented rule is the
/// **lower-middle** value (the element at index `len / 2 - 1` of the sorted
/// submissions), i.e. no averaging of the two middle values. Identical
/// submissions collapse to that single value for both odd and even counts.
use creator_event_manager::oracle::compute_oracle_median;
use creator_event_manager::storage;
use creator_event_manager::storage_types::Match;
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
    (env, client, contract_id, admin, xlm_token)
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

fn create_event_with_match(
    env: &Env,
    contract_id: &Address,
    client: &CreatorEventManagerContractClient<'static>,
    creator: &Address,
    xlm_token: &Address,
    match_time_offset: u64,
) -> (u64, Symbol, u64) {
    fund(env, xlm_token, creator, FEE);
    let start_time = env.ledger().timestamp() + 3600;
    let end_time = env.ledger().timestamp() + 100_000;
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
// compute_oracle_median — even-count rule (#1823)
// ---------------------------------------------------------------------------

/// With 4 distinct submissions the documented even-count rule is the
/// lower-middle value: sorted `[10, 20, 30, 40]` -> index `4 / 2 - 1 = 1`
/// -> `20` (not the average `25`, not the upper-middle `30`).
#[test]
fn test_compute_oracle_median_even_count_four_distinct_uses_lower_middle() {
    let env = Env::default();
    let mut values = Vec::new(&env);
    values.push_back(40u32);
    values.push_back(10u32);
    values.push_back(30u32);
    values.push_back(20u32);

    assert_eq!(compute_oracle_median(&env, &values), 20u32);
}

/// With 2 submissions the same lower-middle rule applies: sorted
/// `[7, 9]` -> index `2 / 2 - 1 = 0` -> `7`.
#[test]
fn test_compute_oracle_median_even_count_two_uses_lower_middle() {
    let env = Env::default();
    let mut values = Vec::new(&env);
    values.push_back(9u32);
    values.push_back(7u32);

    assert_eq!(compute_oracle_median(&env, &values), 7u32);
}

/// Identical submissions collapse to that value regardless of count.
#[test]
fn test_compute_oracle_median_identical_values_collapse() {
    let env = Env::default();

    let mut odd = Vec::new(&env);
    odd.push_back(5u32);
    odd.push_back(5u32);
    odd.push_back(5u32);
    assert_eq!(compute_oracle_median(&env, &odd), 5u32);

    let mut even = Vec::new(&env);
    even.push_back(5u32);
    even.push_back(5u32);
    even.push_back(5u32);
    even.push_back(5u32);
    assert_eq!(compute_oracle_median(&env, &even), 5u32);
}

// ---------------------------------------------------------------------------
// Role separation (#1704)
// ---------------------------------------------------------------------------

#[test]
#[should_panic(expected = "unauthorized")]
fn test_configure_oracle_sources_non_admin_rejected() {
    let (env, client, _contract_id, _admin, _xlm_token) = setup();

    let non_admin = Address::generate(&env);
    let source_a = Address::generate(&env);
    let mut sources = Vec::new(&env);
    sources.push_back(source_a);

    client.configure_oracle_sources(&non_admin, &sources, &1u32);
}

// ---------------------------------------------------------------------------
// Threshold reached finalizes
// ---------------------------------------------------------------------------

#[test]
fn test_threshold_reached_finalizes_match() {
    let (env, client, contract_id, admin, xlm_token) = setup();
    let creator = Address::generate(&env);
    let (_event_id, _invite, match_id) =
        create_event_with_match(&env, &contract_id, &client, &creator, &xlm_token, 1_000);

    let source_a = Address::generate(&env);
    let source_b = Address::generate(&env);
    let source_c = Address::generate(&env);
    let mut sources = Vec::new(&env);
    sources.push_back(source_a.clone());
    sources.push_back(source_b.clone());
    sources.push_back(source_c.clone());
    client.configure_oracle_sources(&admin, &sources, &2u32);

    env.ledger().with_mut(|l| l.timestamp += 2_000);

    let finalized_first = client.propose_match_result(&source_a, &match_id, &2u32, &1u32);
    assert!(!finalized_first);

    let m_before = read_match(&env, &contract_id, match_id);
    assert!(!m_before.result_submitted);

    let finalized_second = client.propose_match_result(&source_b, &match_id, &2u32, &1u32);
    assert!(finalized_second);

    let m_after = read_match(&env, &contract_id, match_id);
    assert!(m_after.result_submitted);
    assert_eq!(m_after.home_score, Some(2));
    assert_eq!(m_after.away_score, Some(1));
    assert_eq!(m_after.winning_team, Some(0)); // TeamA
}

// ---------------------------------------------------------------------------
// Below-threshold waits
// ---------------------------------------------------------------------------

#[test]
fn test_below_threshold_leaves_match_unresolved() {
    let (env, client, contract_id, admin, xlm_token) = setup();
    let creator = Address::generate(&env);
    let (_event_id, _invite, match_id) =
        create_event_with_match(&env, &contract_id, &client, &creator, &xlm_token, 1_000);

    let source_a = Address::generate(&env);
    let source_b = Address::generate(&env);
    let source_c = Address::generate(&env);
    let mut sources = Vec::new(&env);
    sources.push_back(source_a.clone());
    sources.push_back(source_b.clone());
    sources.push_back(source_c.clone());
    client.configure_oracle_sources(&admin, &sources, &3u32);

    env.ledger().with_mut(|l| l.timestamp += 2_000);

    let finalized_a = client.propose_match_result(&source_a, &match_id, &2u32, &1u32);
    let finalized_b = client.propose_match_result(&source_b, &match_id, &2u32, &1u32);
    assert!(!finalized_a);
    assert!(!finalized_b);

    let m = read_match(&env, &contract_id, match_id);
    assert!(!m.result_submitted);

    let proposals = client.get_match_result_proposals(&match_id);
    assert_eq!(proposals.len(), 2);
}

#[test]
fn test_conflicting_proposals_do_not_finalize_until_agreement_reached() {
    let (env, client, contract_id, admin, xlm_token) = setup();
    let creator = Address::generate(&env);
    let (_event_id, _invite, match_id) =
        create_event_with_match(&env, &contract_id, &client, &creator, &xlm_token, 1_000);

    let source_a = Address::generate(&env);
    let source_b = Address::generate(&env);
    let source_c = Address::generate(&env);
    let mut sources = Vec::new(&env);
    sources.push_back(source_a.clone());
    sources.push_back(source_b.clone());
    sources.push_back(source_c.clone());
    client.configure_oracle_sources(&admin, &sources, &2u32);

    env.ledger().with_mut(|l| l.timestamp += 2_000);

    // source_a and source_b disagree — neither scoreline reaches 2 agreeing
    // sources yet.
    let finalized_a = client.propose_match_result(&source_a, &match_id, &2u32, &1u32);
    let finalized_b = client.propose_match_result(&source_b, &match_id, &1u32, &1u32);
    assert!(!finalized_a);
    assert!(!finalized_b);
    assert!(!read_match(&env, &contract_id, match_id).result_submitted);

    // source_c agrees with source_a's score
    let finalized_c = client.propose_match_result(&source_c, &match_id, &2u32, &1u32);
    assert!(finalized_c);

    let m = read_match(&env, &contract_id, match_id);
    assert!(m.result_submitted);
    assert_eq!(m.home_score, Some(2));
    assert_eq!(m.away_score, Some(1));
}
