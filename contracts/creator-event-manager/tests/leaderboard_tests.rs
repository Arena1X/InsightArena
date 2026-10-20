/// Comprehensive tests for ranked event leaderboard functionality (#967).
///
/// Tests cover:
/// - Basic leaderboard ranking by total points
/// - Tiebreaking by exact scores count
/// - Tiebreaking by earliest prediction time
/// - Live leaderboard before all matches are resolved
/// - Empty event (no participants)
/// - Single participant
/// - Tie-handling and reward boundaries (#1270)
use creator_event_manager::storage;
use creator_event_manager::storage_types::MatchResult;
use creator_event_manager::CreatorEventManagerContractClient;
use soroban_sdk::testutils::Address as _;
use soroban_sdk::testutils::Ledger as _;
use soroban_sdk::token::StellarAssetClient;
use soroban_sdk::{Address, Env, String, Symbol};

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

fn create_event_with_matches(
    env: &Env,
    contract_id: &Address,
    client: &CreatorEventManagerContractClient<'static>,
    creator: &Address,
    xlm_token: &Address,
    num_matches: u32,
) -> (u64, Symbol, Vec<u64>) {
    fund(env, xlm_token, creator, FEE);
    let start_time = env.ledger().timestamp() + 3600;
    let end_time = env.ledger().timestamp() + 7200;
    let (event_id, invite_code) = client.create_event(
        creator,
        &title(env),
        &desc(env),
        &100u32,
        &start_time,
        &end_time,
        &0i128,
        &soroban_sdk::Vec::new(env),
        &0i128,
    );

    let mut match_ids: Vec<u64> = Vec::new();

    env.as_contract(contract_id, || {
        for i in 0..num_matches {
            let match_id = storage::next_match_id(env);
            let match_record = creator_event_manager::storage_types::Match::new(
                match_id,
                event_id,
                String::from_str(env, &format!("Team A{}", i)),
                String::from_str(env, &format!("Team B{}", i)),
                env.ledger().timestamp() + 100 + (i as u64) * 60,
                1u32,
                0,
            );
            storage::set_match(env, match_id, &match_record);
            storage::add_event_match(env, event_id, match_id);
            match_ids.push(match_id);

            let mut event = storage::get_event(env, event_id).expect("event exists");
            event.add_match();
            storage::set_event(env, event_id, &event);
        }
    });

    (event_id, invite_code, match_ids)
}

fn submit_predictions(
    _env: &Env,
    _contract_id: &Address,
    _client: &CreatorEventManagerContractClient<'static>,
    _user: &Address,
    _event_id: u64,
    _match_id: u64,
    _home_score: u32,
    _away_score: u32,
) {
    // Placeholder for future use
}

fn submit_match_result(
    _env: &Env,
    client: &CreatorEventManagerContractClient<'static>,
    ai_agent: &Address,
    match_id: u64,
    result: MatchResult,
) {
    let (home_score, away_score) = match result {
        MatchResult::TeamA => (1, 0),
        MatchResult::TeamB => (0, 1),
        MatchResult::Draw => (1, 1),
    };
    client.submit_match_result(ai_agent, &match_id, &home_score, &away_score);
}

#[test]
fn test_leaderboard_ranks_by_total_points_desc() {
    let (env, client, contract_id, creator, ai_agent, xlm_token) = setup();
    let user1 = Address::generate(&env);
    let user2 = Address::generate(&env);
    let user3 = Address::generate(&env);

    // Create event with 3 matches
    let (event_id, invite_code, match_ids) =
        create_event_with_matches(&env, &contract_id, &client, &creator, &xlm_token, 3);

    // User1: correct all (3*4 = 12 points)
    client.join_event(&user1, &invite_code);
    for match_id_ref in match_ids.iter() {
        client.submit_prediction(&user1, match_id_ref, &1u32, &0u32);
    }

    // User2: correct 2 (2*4 = 8 points)
    client.join_event(&user2, &invite_code);
    client.submit_prediction(&user2, match_ids.get(0).unwrap(), &1u32, &0u32);
    client.submit_prediction(&user2, match_ids.get(1).unwrap(), &1u32, &0u32);
    client.submit_prediction(&user2, match_ids.get(2).unwrap(), &0u32, &0u32); // wrong

    // User3: correct 1 (1*4 = 4 points)
    client.join_event(&user3, &invite_code);
    client.submit_prediction(&user3, match_ids.get(0).unwrap(), &1u32, &0u32);
    client.submit_prediction(&user3, match_ids.get(1).unwrap(), &0u32, &0u32); // wrong
    client.submit_prediction(&user3, match_ids.get(2).unwrap(), &0u32, &0u32); // wrong

    // Advance time and submit results (all TeamA wins)
    // Need to advance past all match times (max is 220 relative to initial time)
    env.ledger().set_timestamp(env.ledger().timestamp() + 300);
    for match_id_ref in match_ids.iter() {
        submit_match_result(&env, &client, &ai_agent, *match_id_ref, MatchResult::TeamA);
    }

    // Get leaderboard
    let leaderboard = client.get_event_leaderboard(&event_id);

    assert_eq!(leaderboard.len(), 3);
    assert_eq!(leaderboard.get(0).unwrap().user, user1);
    assert_eq!(leaderboard.get(0).unwrap().rank, 1);
    assert_eq!(leaderboard.get(0).unwrap().total_points, 12);

    assert_eq!(leaderboard.get(1).unwrap().user, user2);
    assert_eq!(leaderboard.get(1).unwrap().rank, 2);
    assert_eq!(leaderboard.get(1).unwrap().total_points, 8);

    assert_eq!(leaderboard.get(2).unwrap().user, user3);
    assert_eq!(leaderboard.get(2).unwrap().rank, 3);
    assert_eq!(leaderboard.get(2).unwrap().total_points, 4);
}

#[test]
fn test_leaderboard_tiebreak_by_exact_scores() {
    let (env, client, contract_id, creator, ai_agent, xlm_token) = setup();
    let user1 = Address::generate(&env);
    let user2 = Address::generate(&env);

    // Create event with 2 matches
    let (event_id, invite_code, match_ids) =
        create_event_with_matches(&env, &contract_id, &client, &creator, &xlm_token, 2);

    // User1: 1 exact (4 pts) + 1 correct result (1 pt) = 5 pts, 1 exact
    client.join_event(&user1, &invite_code);
    client.submit_prediction(&user1, &match_ids.get(0).unwrap(), &1u32, &1u32); // Draw - EXACT (1-1)
    client.submit_prediction(&user1, &match_ids.get(1).unwrap(), &2u32, &0u32); // TeamA wins - CORRECT RESULT (2-0 instead of 1-0) = 1 pt

    // User2: 1 exact (4 pts) + 0 correct = 4 pts, 1 exact
    client.join_event(&user2, &invite_code);
    client.submit_prediction(&user2, &match_ids.get(0).unwrap(), &1u32, &1u32); // Draw - EXACT (1-1)
    client.submit_prediction(&user2, &match_ids.get(1).unwrap(), &0u32, &1u32); // WRONG - TeamB wins

    // Advance time and submit results
    env.ledger().set_timestamp(env.ledger().timestamp() + 200);
    submit_match_result(
        &env,
        &client,
        &ai_agent,
        *match_ids.get(0).unwrap(),
        MatchResult::Draw,
    );
    submit_match_result(
        &env,
        &client,
        &ai_agent,
        *match_ids.get(1).unwrap(),
        MatchResult::TeamA,
    );

    let leaderboard = client.get_event_leaderboard(&event_id);

    assert_eq!(leaderboard.len(), 2);
    assert_eq!(leaderboard.get(0).unwrap().user, user1);
    assert_eq!(leaderboard.get(0).unwrap().total_points, 5);
    assert_eq!(leaderboard.get(0).unwrap().exact_scores, 1);
    assert_eq!(leaderboard.get(0).unwrap().rank, 1);

    assert_eq!(leaderboard.get(1).unwrap().user, user2);
    assert_eq!(leaderboard.get(1).unwrap().total_points, 4);
    assert_eq!(leaderboard.get(1).unwrap().exact_scores, 1);
    assert_eq!(leaderboard.get(1).unwrap().rank, 2);
}

#[test]
fn test_leaderboard_tiebreak_by_earliest_prediction() {
    let (env, client, contract_id, creator, ai_agent, xlm_token) = setup();
    let user1 = Address::generate(&env);
    let user2 = Address::generate(&env);

    // Create event with 1 match
    let (event_id, invite_code, match_ids) =
        create_event_with_matches(&env, &contract_id, &client, &creator, &xlm_token, 1);

    // User1: submit prediction early
    client.join_event(&user1, &invite_code);
    client.submit_prediction(&user1, &match_ids.get(0).unwrap(), &1u32, &0u32);

    // Advance time
    env.ledger().set_timestamp(env.ledger().timestamp() + 50);

    // User2: submit prediction later (same result)
    client.join_event(&user2, &invite_code);
    client.submit_prediction(&user2, &match_ids.get(0).unwrap(), &1u32, &0u32);

    // Advance time and submit result
    env.ledger().set_timestamp(env.ledger().timestamp() + 200);
    submit_match_result(
        &env,
        &client,
        &ai_agent,
        *match_ids.get(0).unwrap(),
        MatchResult::TeamA,
    );

    let leaderboard = client.get_event_leaderboard(&event_id);

    assert_eq!(leaderboard.len(), 2);
    // Both have same total_points and exact_scores, so earlier prediction time ranks higher
    assert_eq!(leaderboard.get(0).unwrap().user, user1);
    assert_eq!(leaderboard.get(0).unwrap().rank, 1);

    assert_eq!(leaderboard.get(1).unwrap().user, user2);
    assert_eq!(leaderboard.get(1).unwrap().rank, 2);
}

#[test]
fn test_leaderboard_live_before_all_matches_resolved() {
    let (env, client, contract_id, creator, _ai_agent, xlm_token) = setup();
    let user1 = Address::generate(&env);

    // Create event with 2 matches
    let (event_id, invite_code, match_ids) =
        create_event_with_matches(&env, &contract_id, &client, &creator, &xlm_token, 2);

    client.join_event(&user1, &invite_code);
    client.submit_prediction(&user1, &match_ids.get(0).unwrap(), &1u32, &0u32);
    client.submit_prediction(&user1, &match_ids.get(1).unwrap(), &2u32, &1u32);

    // Get leaderboard BEFORE matches are resolved
    // Unresolved matches should contribute 0 points
    let leaderboard = client.get_event_leaderboard(&event_id);

    assert_eq!(leaderboard.len(), 1);
    assert_eq!(leaderboard.get(0).unwrap().user, user1);
    assert_eq!(leaderboard.get(0).unwrap().total_points, 0); // No points yet, matches not resolved
    assert_eq!(leaderboard.get(0).unwrap().rank, 1);
}

#[test]
fn test_leaderboard_empty_event() {
    let (env, client, contract_id, creator, _ai_agent, xlm_token) = setup();

    // Create event with no participants
    let (event_id, _invite_code, _match_ids) =
        create_event_with_matches(&env, &contract_id, &client, &creator, &xlm_token, 0);

    // Get leaderboard for empty event
    let leaderboard = client.get_event_leaderboard(&event_id);

    assert_eq!(leaderboard.len(), 0);
}

#[test]
fn test_leaderboard_single_participant() {
    let (env, client, contract_id, creator, ai_agent, xlm_token) = setup();
    let user1 = Address::generate(&env);

    // Create event with 1 match
    let (event_id, invite_code, match_ids) =
        create_event_with_matches(&env, &contract_id, &client, &creator, &xlm_token, 1);

    client.join_event(&user1, &invite_code);
    client.submit_prediction(&user1, match_ids.get(0).unwrap(), &1u32, &0u32);

    env.ledger().set_timestamp(env.ledger().timestamp() + 200);
    submit_match_result(
        &env,
        &client,
        &ai_agent,
        *match_ids.get(0).unwrap(),
        MatchResult::TeamA,
    );

    let leaderboard = client.get_event_leaderboard(&event_id);

    assert_eq!(leaderboard.len(), 1);
    assert_eq!(leaderboard.get(0).unwrap().user, user1);
    assert_eq!(leaderboard.get(0).unwrap().rank, 1);
    assert_eq!(leaderboard.get(0).unwrap().total_points, 4);
    assert_eq!(leaderboard.get(0).unwrap().correct_results, 1);
    assert_eq!(leaderboard.get(0).unwrap().exact_scores, 1);
    assert_eq!(leaderboard.get(0).unwrap().matches_played, 1);
}

// ===========================================================================
// Address tiebreaker tests (#1018)
// ===========================================================================

/// Two participants with identical scores in every dimension are ranked by
/// address: the address that compares as `<` under Soroban's `Address` `Ord`
/// implementation always gets rank 1.
#[test]
fn test_leaderboard_address_tiebreaker_smaller_address_ranks_first() {
    let (env, client, contract_id, creator, ai_agent, xlm_token) = setup();

    let user_a = Address::generate(&env);
    let user_b = Address::generate(&env);

    let (event_id, invite_code, match_ids) =
        create_event_with_matches(&env, &contract_id, &client, &creator, &xlm_token, 1);

    // Determine lexicographic ordering at runtime.
    let (smaller, larger) = if user_a < user_b {
        (user_a.clone(), user_b.clone())
    } else {
        (user_b.clone(), user_a.clone())
    };

    // Both join and predict the same outcome at the same ledger timestamp so
    // that total_points, exact_scores, and last_prediction_time are identical.
    client.join_event(&smaller, &invite_code);
    client.join_event(&larger, &invite_code);
    client.submit_prediction(&smaller, &match_ids.get(0).unwrap(), &1u32, &0u32);
    client.submit_prediction(&larger, &match_ids.get(0).unwrap(), &1u32, &0u32);

    // Advance past match time and submit result so both earn the same points.
    env.ledger().set_timestamp(env.ledger().timestamp() + 300);
    submit_match_result(
        &env,
        &client,
        &ai_agent,
        *match_ids.get(0).unwrap(),
        MatchResult::TeamA,
    );

    let leaderboard = client.get_event_leaderboard(&event_id);

    assert_eq!(leaderboard.len(), 2);
    assert_eq!(leaderboard.get(0).unwrap().rank, 1);
    assert_eq!(leaderboard.get(0).unwrap().user, smaller);
    assert_eq!(leaderboard.get(1).unwrap().rank, 2);
    assert_eq!(leaderboard.get(1).unwrap().user, larger);
}

/// Swapping the join/predict insertion order must not change the outcome:
/// the lexicographically smaller address always gets rank 1.
#[test]
fn test_leaderboard_address_tiebreaker_insertion_order_irrelevant() {
    let (env, client, contract_id, creator, ai_agent, xlm_token) = setup();

    let user_a = Address::generate(&env);
    let user_b = Address::generate(&env);

    let (event_id, invite_code, match_ids) =
        create_event_with_matches(&env, &contract_id, &client, &creator, &xlm_token, 1);

    let (smaller, larger) = if user_a < user_b {
        (user_a.clone(), user_b.clone())
    } else {
        (user_b.clone(), user_a.clone())
    };

    // Insert in REVERSE order: larger joins and predicts first.
    client.join_event(&larger, &invite_code);
    client.join_event(&smaller, &invite_code);
    client.submit_prediction(&larger, &match_ids.get(0).unwrap(), &1u32, &0u32);
    client.submit_prediction(&smaller, &match_ids.get(0).unwrap(), &1u32, &0u32);

    env.ledger().set_timestamp(env.ledger().timestamp() + 300);
    submit_match_result(
        &env,
        &client,
        &ai_agent,
        *match_ids.get(0).unwrap(),
        MatchResult::TeamA,
    );

    let leaderboard = client.get_event_leaderboard(&event_id);

    assert_eq!(leaderboard.len(), 2);
    // Smaller address must still be rank 1 regardless of insertion order.
    assert_eq!(leaderboard.get(0).unwrap().user, smaller);
    assert_eq!(leaderboard.get(0).unwrap().rank, 1);
    assert_eq!(leaderboard.get(1).unwrap().user, larger);
    assert_eq!(leaderboard.get(1).unwrap().rank, 2);
}

// ---------------------------------------------------------------------------
// Multi-way ties + exposed rank (#1343)
// ---------------------------------------------------------------------------

/// Three participants with identical scores are ordered by earliest
/// qualifying timestamp, then address. Ranks are stable across repeated reads
/// and match `get_user_rank`.
#[test]
fn test_leaderboard_multiway_tie_earliest_timestamp_then_address() {
    let (env, client, contract_id, creator, ai_agent, xlm_token) = setup();

    let user_a = Address::generate(&env);
    let user_b = Address::generate(&env);
    let user_c = Address::generate(&env);

    let (event_id, invite_code, match_ids) =
        create_event_with_matches(&env, &contract_id, &client, &creator, &xlm_token, 1);

    // Stagger join/predict times so each has a distinct earliest timestamp,
    // then ensure points/exact_scores are identical.
    client.join_event(&user_a, &invite_code);
    client.submit_prediction(&user_a, &match_ids.get(0).unwrap(), &1u32, &0u32);
    let t_a = env.ledger().timestamp();

    env.ledger().set_timestamp(env.ledger().timestamp() + 10);
    client.join_event(&user_b, &invite_code);
    client.submit_prediction(&user_b, &match_ids.get(0).unwrap(), &1u32, &0u32);
    let t_b = env.ledger().timestamp();

    env.ledger().set_timestamp(env.ledger().timestamp() + 10);
    client.join_event(&user_c, &invite_code);
    client.submit_prediction(&user_c, &match_ids.get(0).unwrap(), &1u32, &0u32);
    let t_c = env.ledger().timestamp();

    env.ledger().set_timestamp(env.ledger().timestamp() + 300);
    submit_match_result(
        &env,
        &client,
        &ai_agent,
        *match_ids.get(0).unwrap(),
        MatchResult::TeamA,
    );

    let lb1 = client.get_event_leaderboard(&event_id);
    let lb2 = client.get_event_leaderboard(&event_id);
    assert_eq!(lb1, lb2);
    assert_eq!(lb1.len(), 3);

    // Earliest qualifier ranks first.
    assert_eq!(lb1.get(0).unwrap().user, user_a);
    assert_eq!(lb1.get(0).unwrap().rank, 1);
    assert_eq!(lb1.get(0).unwrap().tie_break_key, t_a);
    assert_eq!(lb1.get(1).unwrap().user, user_b);
    assert_eq!(lb1.get(1).unwrap().rank, 2);
    assert_eq!(lb1.get(1).unwrap().tie_break_key, t_b);
    assert_eq!(lb1.get(2).unwrap().user, user_c);
    assert_eq!(lb1.get(2).unwrap().rank, 3);
    assert_eq!(lb1.get(2).unwrap().tie_break_key, t_c);

    assert_eq!(client.get_user_rank(&event_id, &user_a), 1);
    assert_eq!(client.get_user_rank(&event_id, &user_b), 2);
    assert_eq!(client.get_user_rank(&event_id, &user_c), 3);
}

/// When timestamps are also identical, the address tie-break produces a
/// stable three-way order independent of join order.
#[test]
fn test_leaderboard_multiway_tie_identical_timestamps_by_address() {
    let (env, client, contract_id, creator, ai_agent, xlm_token) = setup();

    let u1 = Address::generate(&env);
    let u2 = Address::generate(&env);
    let u3 = Address::generate(&env);

    // Sort addresses lexicographically for the expected order.
    let mut ordered = [u1.clone(), u2.clone(), u3.clone()];
    ordered.sort();

    let (event_id, invite_code, match_ids) =
        create_event_with_matches(&env, &contract_id, &client, &creator, &xlm_token, 1);

    // Join in reverse order relative to address sort; same ledger timestamp.
    for user in [ordered[2].clone(), ordered[0].clone(), ordered[1].clone()] {
        client.join_event(&user, &invite_code);
        client.submit_prediction(&user, &match_ids.get(0).unwrap(), &1u32, &0u32);
    }

    env.ledger().set_timestamp(env.ledger().timestamp() + 300);
    submit_match_result(
        &env,
        &client,
        &ai_agent,
        *match_ids.get(0).unwrap(),
        MatchResult::TeamA,
    );

    let lb = client.get_event_leaderboard(&event_id);
    assert_eq!(lb.len(), 3);
    assert_eq!(lb.get(0).unwrap().user, ordered[0]);
    assert_eq!(lb.get(0).unwrap().rank, 1);
    assert_eq!(lb.get(1).unwrap().user, ordered[1]);
    assert_eq!(lb.get(1).unwrap().rank, 2);
    assert_eq!(lb.get(2).unwrap().user, ordered[2]);
    assert_eq!(lb.get(2).unwrap().rank, 3);
}

// ===========================================================================
// Tie-handling and reward boundaries (#1270)
// ===========================================================================

/// Three participants finish with identical point totals and two finish
/// below them. The three tied participants must occupy the top positions,
/// ordered deterministically by their earliest prediction time.
#[test]
fn test_leaderboard_tie_handling_three_tied_two_below() {
    let (env, client, contract_id, creator, ai_agent, xlm_token) = setup();
    let user1 = Address::generate(&env); // Will predict first
    let user2 = Address::generate(&env); // Will predict second
    let user3 = Address::generate(&env); // Will predict third
    let user4 = Address::generate(&env); // Will predict wrong
    let user5 = Address::generate(&env); // Will predict wrong

    let (event_id, invite_code, match_ids) =
        create_event_with_matches(&env, &contract_id, &client, &creator, &xlm_token, 1);
    let match_id = match_ids.get(0).unwrap();

    // Tied group (all correct, 4 points, staggered prediction times)
    client.join_event(&user1, &invite_code);
    client.submit_prediction(&user1, match_id, &1u32, &0u32);

    env.ledger().set_timestamp(env.ledger().timestamp() + 10);
    client.join_event(&user2, &invite_code);
    client.submit_prediction(&user2, match_id, &1u32, &0u32);

    env.ledger().set_timestamp(env.ledger().timestamp() + 10);
    client.join_event(&user3, &invite_code);
    client.submit_prediction(&user3, match_id, &1u32, &0u32);

    // Below group (wrong prediction, 0 points)
    client.join_event(&user4, &invite_code);
    client.submit_prediction(&user4, match_id, &0u32, &1u32);

    client.join_event(&user5, &invite_code);
    client.submit_prediction(&user5, match_id, &0u32, &1u32);

    // Advance time and submit result (TeamA wins)
    env.ledger().set_timestamp(env.ledger().timestamp() + 300);
    submit_match_result(&env, &client, &ai_agent, *match_id, MatchResult::TeamA);

    let lb1 = client.get_event_leaderboard(&event_id);
    let lb2 = client.get_event_leaderboard(&event_id);

    // Verify nondeterminism: two consecutive reads must be identical
    assert_eq!(lb1, lb2);

    // Verify all 5 participants are returned
    assert_eq!(lb1.len(), 5);

    // Verify the 3 tied participants occupy the top positions
    assert_eq!(lb1.get(0).unwrap().user, user1);
    assert_eq!(lb1.get(0).unwrap().rank, 1);
    assert_eq!(lb1.get(0).unwrap().total_points, 4);

    assert_eq!(lb1.get(1).unwrap().user, user2);
    assert_eq!(lb1.get(1).unwrap().rank, 2);
    assert_eq!(lb1.get(1).unwrap().total_points, 4);

    assert_eq!(lb1.get(2).unwrap().user, user3);
    assert_eq!(lb1.get(2).unwrap().rank, 3);
    assert_eq!(lb1.get(2).unwrap().total_points, 4);

    // Verify the 2 below participants are ranked lower
    assert_eq!(lb1.get(3).unwrap().user, user4);
    assert_eq!(lb1.get(3).unwrap().rank, 4);
    assert_eq!(lb1.get(3).unwrap().total_points, 0);

    assert_eq!(lb1.get(4).unwrap().user, user5);
    assert_eq!(lb1.get(4).unwrap().rank, 5);
    assert_eq!(lb1.get(4).unwrap().total_points, 0);
}

/// Test a leaderboard reward boundary where three participants tie for the
/// top spot even though only the top two would receive a prize.
#[test]
fn test_leaderboard_reward_boundary_tie() {
    let (env, client, contract_id, creator, ai_agent, xlm_token) = setup();
    let user1 = Address::generate(&env);
    let user2 = Address::generate(&env);
    let user3 = Address::generate(&env);
    let user4 = Address::generate(&env);
    let user5 = Address::generate(&env);

    let (event_id, invite_code, match_ids) =
        create_event_with_matches(&env, &contract_id, &client, &creator, &xlm_token, 1);
    let match_id = match_ids.get(0).unwrap();

    // Three participants tie at the top; two others are below them.
    client.join_event(&user1, &invite_code);
    client.submit_prediction(&user1, match_id, &1u32, &0u32);

    env.ledger().set_timestamp(env.ledger().timestamp() + 10);
    client.join_event(&user2, &invite_code);
    client.submit_prediction(&user2, match_id, &1u32, &0u32);

    env.ledger().set_timestamp(env.ledger().timestamp() + 10);
    client.join_event(&user3, &invite_code);
    client.submit_prediction(&user3, match_id, &1u32, &0u32);

    client.join_event(&user4, &invite_code);
    client.submit_prediction(&user4, match_id, &0u32, &1u32);

    client.join_event(&user5, &invite_code);
    client.submit_prediction(&user5, match_id, &0u32, &1u32);

    env.ledger().set_timestamp(env.ledger().timestamp() + 300);
    submit_match_result(&env, &client, &ai_agent, *match_id, MatchResult::TeamA);

    let leaderboard = client.get_event_leaderboard(&event_id);
    let leaderboard_again = client.get_event_leaderboard(&event_id);

    assert_eq!(leaderboard, leaderboard_again);
    assert_eq!(leaderboard.len(), 5);
    assert_eq!(leaderboard.get(0).unwrap().user, user1);
    assert_eq!(leaderboard.get(0).unwrap().rank, 1);
    assert_eq!(leaderboard.get(1).unwrap().user, user2);
    assert_eq!(leaderboard.get(1).unwrap().rank, 2);
    assert_eq!(leaderboard.get(2).unwrap().user, user3);
    assert_eq!(leaderboard.get(2).unwrap().rank, 3);
    assert_eq!(leaderboard.get(3).unwrap().user, user4);
    assert_eq!(leaderboard.get(3).unwrap().rank, 4);
    assert_eq!(leaderboard.get(4).unwrap().user, user5);
    assert_eq!(leaderboard.get(4).unwrap().rank, 5);
}

/// Test a leaderboard where all participants are tied at zero points.
/// This can happen if all predictions are wrong, or matches are unresolved.
#[test]
fn test_leaderboard_all_zero_points() {
    let (env, client, contract_id, creator, ai_agent, xlm_token) = setup();
    let user1 = Address::generate(&env);
    let user2 = Address::generate(&env);
    let user3 = Address::generate(&env);

    let (event_id, invite_code, match_ids) =
        create_event_with_matches(&env, &contract_id, &client, &creator, &xlm_token, 1);
    let match_id = match_ids.get(0).unwrap();

    // All users predict incorrectly (0 points)
    client.join_event(&user1, &invite_code);
    client.submit_prediction(&user1, match_id, &0u32, &1u32); // TeamB wins

    env.ledger().set_timestamp(env.ledger().timestamp() + 10);
    client.join_event(&user2, &invite_code);
    client.submit_prediction(&user2, match_id, &0u32, &1u32); // TeamB wins

    env.ledger().set_timestamp(env.ledger().timestamp() + 10);
    client.join_event(&user3, &invite_code);
    client.submit_prediction(&user3, match_id, &0u32, &1u32); // TeamB wins

    // Advance time and submit result (TeamA wins, so all are wrong)
    env.ledger().set_timestamp(env.ledger().timestamp() + 300);
    submit_match_result(&env, &client, &ai_agent, *match_id, MatchResult::TeamA);

    let lb = client.get_event_leaderboard(&event_id);

    // Assert no panic and all participants are returned
    assert_eq!(lb.len(), 3);

    // All have 0 points, ordered by earliest prediction time
    assert_eq!(lb.get(0).unwrap().user, user1);
    assert_eq!(lb.get(0).unwrap().rank, 1);
    assert_eq!(lb.get(0).unwrap().total_points, 0);

    assert_eq!(lb.get(1).unwrap().user, user2);
    assert_eq!(lb.get(1).unwrap().rank, 2);
    assert_eq!(lb.get(1).unwrap().total_points, 0);

    assert_eq!(lb.get(2).unwrap().user, user3);
    assert_eq!(lb.get(2).unwrap().rank, 3);
    assert_eq!(lb.get(2).unwrap().total_points, 0);

    // Verify consecutive reads are identical
    let lb2 = client.get_event_leaderboard(&event_id);
    assert_eq!(lb, lb2);
}
