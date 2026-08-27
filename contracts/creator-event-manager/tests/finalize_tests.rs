/// Tests for `finalize_event`: ranking, prize-pool splitting, and payout.
///
/// Coverage:
/// - Top-N split paid to winners, verified against real token balances
/// - Rejected before end_time, with unresolved matches, or when called twice
/// - Fewer participants than reward ranks → unused percentage refunded
/// - Zero participants → full refund to creator
/// - Zero prize pool → no transfers, event still marked finalized
/// - Permissionless: a random caller can finalize
use creator_event_manager::storage;
use creator_event_manager::storage_types::{
    MatchResult, FINALIZATION_BOND_STROOPS, FINALIZATION_CHALLENGE_WINDOW_SECONDS,
};
use creator_event_manager::CreatorEventManagerContractClient;
use soroban_sdk::testutils::Address as _;
use soroban_sdk::testutils::Ledger as _;
use soroban_sdk::token::{StellarAssetClient, TokenClient};
use soroban_sdk::{Address, Env, String, Symbol, Vec};

const FEE: i128 = 1_000_000;
const PRIZE: i128 = 10_000_000;

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

fn fund_finalizer_bond(env: &Env, token: &Address, caller: &Address) {
    fund(env, token, caller, FINALIZATION_BOND_STROOPS);
}

fn balance(env: &Env, token: &Address, who: &Address) -> i128 {
    TokenClient::new(env, token).balance(who)
}

fn title(env: &Env) -> String {
    String::from_str(env, "Test Event")
}

fn desc(env: &Env) -> String {
    String::from_str(env, "Test Description")
}

/// Create a funded event (prize_pool + reward_distribution) and `num_matches`
/// matches. The creator is funded with exactly `FEE + prize_pool`, so after
/// creation the creator's balance is 0 and the contract escrows the prize pool.
fn create_funded_event(
    env: &Env,
    contract_id: &Address,
    client: &CreatorEventManagerContractClient<'static>,
    creator: &Address,
    xlm_token: &Address,
    prize_pool: i128,
    reward_distribution: Vec<u32>,
    num_matches: u32,
) -> (u64, Symbol, Vec<u64>) {
    fund(env, xlm_token, creator, FEE + prize_pool);
    let start_time = env.ledger().timestamp() + 3600;
    let end_time = env.ledger().timestamp() + 7200;
    let (event_id, invite_code) = client.create_event(
        creator,
        &title(env),
        &desc(env),
        &100u32,
        &start_time,
        &end_time,
        &prize_pool,
        &reward_distribution,
        &0i128,
    );

    let mut match_ids: Vec<u64> = Vec::new(env);

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
            match_ids.push_back(match_id);

            let mut event = storage::get_event(env, event_id).expect("event exists");
            event.add_match();
            storage::set_event(env, event_id, &event);
        }
    });

    (event_id, invite_code, match_ids)
}

fn submit_result(
    client: &CreatorEventManagerContractClient<'static>,
    ai_agent: &Address,
    match_id: u64,
    result: MatchResult,
) {
    let (home_score, away_score) = match result {
        MatchResult::TeamA => (1u32, 0u32),
        MatchResult::TeamB => (0u32, 1u32),
        MatchResult::Draw => (1u32, 1u32),
    };
    client.submit_match_result(ai_agent, &match_id, &home_score, &away_score);
}

fn reward_dist(env: &Env, percents: &[u32]) -> Vec<u32> {
    let mut v = Vec::new(env);
    for p in percents {
        v.push_back(*p);
    }
    v
}

// ---------------------------------------------------------------------------
// Happy path: top-5 split
// ---------------------------------------------------------------------------

#[test]
fn test_finalize_event_distributes_top5_split() {
    let (env, client, contract_id, creator, ai_agent, xlm_token) = setup();

    let dist = reward_dist(&env, &[40, 30, 20, 5, 5]);
    let (event_id, invite_code, match_ids) = create_funded_event(
        &env,
        &contract_id,
        &client,
        &creator,
        &xlm_token,
        PRIZE,
        dist,
        5,
    );

    // Contract escrows the full prize pool; creator spent everything.
    assert_eq!(balance(&env, &xlm_token, &contract_id), PRIZE);
    assert_eq!(balance(&env, &xlm_token, &creator), 0);

    // Five participants with strictly decreasing scores (distinct ranks).
    // Actual result for every match is TeamA (1-0). An exact 1-0 prediction is
    // worth 4 points; a 0-1 prediction is wrong (0 points).
    let users = [
        Address::generate(&env),
        Address::generate(&env),
        Address::generate(&env),
        Address::generate(&env),
        Address::generate(&env),
    ];
    // user i predicts correctly on the first (5 - i) matches.
    for (i, user) in users.iter().enumerate() {
        client.join_event(user, &invite_code);
        let correct = 5 - i as u32;
        for (m, match_id) in match_ids.iter().enumerate() {
            if (m as u32) < correct {
                client.submit_prediction(user, &match_id, &1u32, &0u32); // exact
            } else {
                client.submit_prediction(user, &match_id, &0u32, &1u32); // wrong
            }
        }
    }

    // Advance past all match times and the event end_time, then resolve.
    env.ledger().set_timestamp(env.ledger().timestamp() + 7300);
    for match_id in match_ids.iter() {
        submit_result(&client, &ai_agent, match_id, MatchResult::TeamA);
    }

    // Permissionless finalize.
    let caller = Address::generate(&env);
    fund_finalizer_bond(&env, &xlm_token, &caller);
    let payouts = client.finalize_event(&caller, &event_id);

    // Expected per-rank amounts.
    let expected = [
        PRIZE * 40 / 100,
        PRIZE * 30 / 100,
        PRIZE * 20 / 100,
        PRIZE * 5 / 100,
        PRIZE * 5 / 100,
    ];

    assert_eq!(payouts.len(), 5);
    for (i, user) in users.iter().enumerate() {
        // Leaderboard order matches the user order (decreasing points).
        let (addr, amount) = payouts.get(i as u32).unwrap();
        assert_eq!(addr, *user);
        assert_eq!(amount, expected[i]);
        // Allocations are staged, not transferred, until claim_prize is called.
        assert_eq!(balance(&env, &xlm_token, user), 0);
    }

    // Full pool staged in the contract; nothing refunded to the creator.
    assert_eq!(
        balance(&env, &xlm_token, &contract_id),
        PRIZE + FINALIZATION_BOND_STROOPS
    );
    assert_eq!(balance(&env, &xlm_token, &creator), 0);

    // Each winner claims their own allocation exactly once.
    for (i, user) in users.iter().enumerate() {
        let claimed = client.claim_prize(user, &event_id);
        assert_eq!(claimed, expected[i]);
        assert_eq!(balance(&env, &xlm_token, user), expected[i]);
    }

    // Prize pool distributed; finalization bond remains until settlement.
    assert_eq!(
        balance(&env, &xlm_token, &contract_id),
        FINALIZATION_BOND_STROOPS
    );
    assert_eq!(balance(&env, &xlm_token, &creator), 0);

    // Event marked finalized; snapshot retrievable.
    assert!(client.get_event(&event_id).is_finalized);
    let snapshot = client.get_event_payouts(&event_id);
    assert_eq!(snapshot, payouts);
}

// ---------------------------------------------------------------------------
// Rejections
// ---------------------------------------------------------------------------

#[test]
#[should_panic(expected = "event_not_ended")]
fn test_finalize_event_before_end_time_rejected() {
    let (env, client, contract_id, creator, _ai_agent, xlm_token) = setup();

    let dist = reward_dist(&env, &[100]);
    let (event_id, _invite, _matches) = create_funded_event(
        &env,
        &contract_id,
        &client,
        &creator,
        &xlm_token,
        PRIZE,
        dist,
        1,
    );

    // Time is still well before end_time (7200).
    let caller = Address::generate(&env);
    fund_finalizer_bond(&env, &xlm_token, &caller);
    client.finalize_event(&caller, &event_id);
}

#[test]
#[should_panic(expected = "matches_not_complete")]
fn test_finalize_event_with_unresolved_match_rejected() {
    let (env, client, contract_id, creator, ai_agent, xlm_token) = setup();

    let dist = reward_dist(&env, &[100]);
    let (event_id, invite_code, match_ids) = create_funded_event(
        &env,
        &contract_id,
        &client,
        &creator,
        &xlm_token,
        PRIZE,
        dist,
        2,
    );

    let user = Address::generate(&env);
    client.join_event(&user, &invite_code);
    for match_id in match_ids.iter() {
        client.submit_prediction(&user, &match_id, &1u32, &0u32);
    }

    // Past end_time, but only resolve the first of two matches.
    env.ledger().set_timestamp(env.ledger().timestamp() + 7300);
    submit_result(
        &client,
        &ai_agent,
        match_ids.get(0).unwrap(),
        MatchResult::TeamA,
    );

    let caller = Address::generate(&env);
    fund_finalizer_bond(&env, &xlm_token, &caller);
    client.finalize_event(&caller, &event_id);
}

#[test]
#[should_panic(expected = "already_finalized")]
fn test_finalize_event_twice_rejected() {
    let (env, client, contract_id, creator, ai_agent, xlm_token) = setup();

    let dist = reward_dist(&env, &[100]);
    let (event_id, invite_code, match_ids) = create_funded_event(
        &env,
        &contract_id,
        &client,
        &creator,
        &xlm_token,
        PRIZE,
        dist,
        1,
    );

    let user = Address::generate(&env);
    client.join_event(&user, &invite_code);
    client.submit_prediction(&user, &match_ids.get(0).unwrap(), &1u32, &0u32);

    env.ledger().set_timestamp(env.ledger().timestamp() + 7300);
    submit_result(
        &client,
        &ai_agent,
        match_ids.get(0).unwrap(),
        MatchResult::TeamA,
    );

    let caller = Address::generate(&env);
    fund_finalizer_bond(&env, &xlm_token, &caller);
    client.finalize_event(&caller, &event_id);
    // Second call must be rejected.
    client.finalize_event(&caller, &event_id);
}

// ---------------------------------------------------------------------------
// Refund scenarios
// ---------------------------------------------------------------------------

#[test]
fn test_finalize_event_fewer_participants_than_ranks_refunds_creator() {
    let (env, client, contract_id, creator, ai_agent, xlm_token) = setup();

    // 5 reward ranks but only 2 participants. Ranks 3-5 (5 + 5 + ... ) are
    // unallocated and refunded to the creator.
    let dist = reward_dist(&env, &[40, 30, 20, 5, 5]);
    let (event_id, invite_code, match_ids) = create_funded_event(
        &env,
        &contract_id,
        &client,
        &creator,
        &xlm_token,
        PRIZE,
        dist,
        1,
    );

    let user1 = Address::generate(&env);
    let user2 = Address::generate(&env);
    // user1 exact (4 pts), user2 wrong (0 pts) → distinct ranks.
    client.join_event(&user1, &invite_code);
    client.submit_prediction(&user1, &match_ids.get(0).unwrap(), &1u32, &0u32);
    client.join_event(&user2, &invite_code);
    client.submit_prediction(&user2, &match_ids.get(0).unwrap(), &0u32, &1u32);

    env.ledger().set_timestamp(env.ledger().timestamp() + 7300);
    submit_result(
        &client,
        &ai_agent,
        match_ids.get(0).unwrap(),
        MatchResult::TeamA,
    );

    let caller = Address::generate(&env);
    fund_finalizer_bond(&env, &xlm_token, &caller);
    let payouts = client.finalize_event(&caller, &event_id);

    let rank1 = PRIZE * 40 / 100;
    let rank2 = PRIZE * 30 / 100;
    let refund = PRIZE - rank1 - rank2; // 30% (ranks 3-5) back to creator

    assert_eq!(payouts.len(), 2);
    // Winner allocations are staged; the creator's refund is unaffected and
    // still transfers immediately at finalize.
    assert_eq!(balance(&env, &xlm_token, &user1), 0);
    assert_eq!(balance(&env, &xlm_token, &user2), 0);
    assert_eq!(balance(&env, &xlm_token, &creator), refund);
    // Two staged allocations + finalization bond remain in the contract.
    assert_eq!(
        balance(&env, &xlm_token, &contract_id),
        rank1 + rank2 + FINALIZATION_BOND_STROOPS
    );

    assert_eq!(client.claim_prize(&user1, &event_id), rank1);
    assert_eq!(client.claim_prize(&user2, &event_id), rank2);
    assert_eq!(balance(&env, &xlm_token, &user1), rank1);
    assert_eq!(balance(&env, &xlm_token, &user2), rank2);
    // Only the finalization bond remains once both winners have claimed.
    assert_eq!(
        balance(&env, &xlm_token, &contract_id),
        FINALIZATION_BOND_STROOPS
    );
}

#[test]
fn test_finalize_event_zero_participants_refunds_full_pool() {
    let (env, client, contract_id, creator, _ai_agent, xlm_token) = setup();

    let dist = reward_dist(&env, &[60, 40]);
    let (event_id, _invite, _matches) = create_funded_event(
        &env,
        &contract_id,
        &client,
        &creator,
        &xlm_token,
        PRIZE,
        dist,
        0,
    );

    // No participants, no matches. Past end_time.
    env.ledger().set_timestamp(env.ledger().timestamp() + 7300);

    let caller = Address::generate(&env);
    fund_finalizer_bond(&env, &xlm_token, &caller);
    let payouts = client.finalize_event(&caller, &event_id);

    assert_eq!(payouts.len(), 0);
    // Entire pool refunded to creator; only the finalization bond remains.
    assert_eq!(balance(&env, &xlm_token, &creator), PRIZE);
    assert_eq!(
        balance(&env, &xlm_token, &contract_id),
        FINALIZATION_BOND_STROOPS
    );
    assert!(client.get_event(&event_id).is_finalized);
}

// ---------------------------------------------------------------------------
// Dust refund
// ---------------------------------------------------------------------------

#[test]
fn test_finalize_event_integer_division_dust_refunded_to_creator() {
    let (env, client, contract_id, creator, ai_agent, xlm_token) = setup();

    // An odd prize pool ensures integer-division remainder (dust).
    let prize_pool: i128 = 1_000_000_001;
    let dist = reward_dist(&env, &[60, 40]);
    let (event_id, invite_code, match_ids) = create_funded_event(
        &env,
        &contract_id,
        &client,
        &creator,
        &xlm_token,
        prize_pool,
        dist,
        1,
    );

    let user1 = Address::generate(&env);
    let user2 = Address::generate(&env);

    client.join_event(&user1, &invite_code);
    client.submit_prediction(&user1, &match_ids.get(0).unwrap(), &1u32, &0u32);
    client.join_event(&user2, &invite_code);
    client.submit_prediction(&user2, &match_ids.get(0).unwrap(), &0u32, &1u32);

    env.ledger().set_timestamp(env.ledger().timestamp() + 7300);
    submit_result(
        &client,
        &ai_agent,
        match_ids.get(0).unwrap(),
        MatchResult::TeamA,
    );

    let creator_balance_before = balance(&env, &xlm_token, &creator);

    let caller = Address::generate(&env);
    fund_finalizer_bond(&env, &xlm_token, &caller);
    let payouts = client.finalize_event(&caller, &event_id);

    let expected_rank1 = prize_pool * 60 / 100; // 600_000_000
    let expected_rank2 = prize_pool * 40 / 100; // 400_000_000
    let expected_dust = prize_pool - expected_rank1 - expected_rank2; // 1

    assert_eq!(payouts.len(), 2);
    // Winner allocations are staged, not yet transferred.
    assert_eq!(balance(&env, &xlm_token, &user1), 0);
    assert_eq!(balance(&env, &xlm_token, &user2), 0);

    // Creator gets the dust immediately (plus any refund from unallocated
    // percentage) — the creator refund is not staged.
    assert_eq!(
        balance(&env, &xlm_token, &creator),
        creator_balance_before + expected_dust,
    );

    // Contract still holds the two staged allocations plus the bond.
    assert_eq!(
        balance(&env, &xlm_token, &contract_id),
        expected_rank1 + expected_rank2 + FINALIZATION_BOND_STROOPS
    );

    assert_eq!(client.claim_prize(&user1, &event_id), expected_rank1);
    assert_eq!(client.claim_prize(&user2, &event_id), expected_rank2);
    assert_eq!(balance(&env, &xlm_token, &user1), expected_rank1);
    assert_eq!(balance(&env, &xlm_token, &user2), expected_rank2);

    // Bond remains until settlement.
    assert_eq!(
        balance(&env, &xlm_token, &contract_id),
        FINALIZATION_BOND_STROOPS
    );

    // Total outflows equal the full prize pool.
    let total_paid = expected_rank1 + expected_rank2 + expected_dust;
    assert_eq!(total_paid, prize_pool);
}

#[test]
fn test_finalize_event_zero_prize_pool_noop() {
    let (env, client, contract_id, creator, ai_agent, xlm_token) = setup();

    // Fun event: zero prize pool, empty reward distribution.
    let (event_id, invite_code, match_ids) = create_funded_event(
        &env,
        &contract_id,
        &client,
        &creator,
        &xlm_token,
        0,
        Vec::new(&env),
        1,
    );

    let user = Address::generate(&env);
    client.join_event(&user, &invite_code);
    client.submit_prediction(&user, &match_ids.get(0).unwrap(), &1u32, &0u32);

    env.ledger().set_timestamp(env.ledger().timestamp() + 7300);
    submit_result(
        &client,
        &ai_agent,
        match_ids.get(0).unwrap(),
        MatchResult::TeamA,
    );

    assert_eq!(balance(&env, &xlm_token, &contract_id), 0);

    let caller = Address::generate(&env);
    fund_finalizer_bond(&env, &xlm_token, &caller);
    let payouts = client.finalize_event(&caller, &event_id);

    // No reward ranks → no payouts, no prize transfers; only the bond remains.
    assert_eq!(payouts.len(), 0);
    assert_eq!(
        balance(&env, &xlm_token, &contract_id),
        FINALIZATION_BOND_STROOPS
    );
    assert_eq!(balance(&env, &xlm_token, &creator), 0);
    assert_eq!(balance(&env, &xlm_token, &user), 0);
    // But the event is still marked finalized.
    assert!(client.get_event(&event_id).is_finalized);
}

// ---------------------------------------------------------------------------
// get_event_payouts — pre-finalization, non-existent, post-finalization (#1033)
// ---------------------------------------------------------------------------

#[test]
fn test_get_event_payouts_before_finalization_returns_empty() {
    let (env, client, contract_id, creator, _ai_agent, xlm_token) = setup();

    let dist = reward_dist(&env, &[100]);
    let (event_id, _invite, _match_ids) = create_funded_event(
        &env,
        &contract_id,
        &client,
        &creator,
        &xlm_token,
        PRIZE,
        dist,
        1,
    );

    // The event is funded but finalize_event has not been called yet.
    let payouts = client.get_event_payouts(&event_id);
    assert_eq!(payouts.len(), 0);
}

#[test]
fn test_get_event_payouts_nonexistent_event_returns_empty() {
    let (_env, client, _contract_id, _creator, _ai_agent, _xlm_token) = setup();

    // No event with this ID has ever been created; must return empty, not panic.
    let payouts = client.get_event_payouts(&99999u64);
    assert_eq!(payouts.len(), 0);
}

#[test]
fn test_get_event_payouts_after_finalization_returns_correct_entries() {
    let (env, client, contract_id, creator, ai_agent, xlm_token) = setup();

    let dist = reward_dist(&env, &[100]);
    let (event_id, invite_code, match_ids) = create_funded_event(
        &env,
        &contract_id,
        &client,
        &creator,
        &xlm_token,
        PRIZE,
        dist,
        1,
    );

    let user = Address::generate(&env);
    client.join_event(&user, &invite_code);
    client.submit_prediction(&user, &match_ids.get(0).unwrap(), &1u32, &0u32);

    env.ledger().set_timestamp(env.ledger().timestamp() + 7300);
    submit_result(
        &client,
        &ai_agent,
        match_ids.get(0).unwrap(),
        MatchResult::TeamA,
    );

    let caller = Address::generate(&env);
    fund_finalizer_bond(&env, &xlm_token, &caller);
    let payouts = client.finalize_event(&caller, &event_id);

    // Snapshot must match the returned payout vector.
    let snapshot = client.get_event_payouts(&event_id);
    assert_eq!(snapshot.len(), 1);
    assert_eq!(snapshot, payouts);
    let (winner, amount) = snapshot.get(0).unwrap();
    assert_eq!(winner, user);
    assert_eq!(amount, PRIZE);
}

#[test]
fn test_finalize_event_permissionless() {
    let (env, client, contract_id, creator, ai_agent, xlm_token) = setup();

    let dist = reward_dist(&env, &[100]);
    let (event_id, invite_code, match_ids) = create_funded_event(
        &env,
        &contract_id,
        &client,
        &creator,
        &xlm_token,
        PRIZE,
        dist,
        1,
    );

    let user = Address::generate(&env);
    client.join_event(&user, &invite_code);
    client.submit_prediction(&user, &match_ids.get(0).unwrap(), &1u32, &0u32);

    env.ledger().set_timestamp(env.ledger().timestamp() + 7300);
    submit_result(
        &client,
        &ai_agent,
        match_ids.get(0).unwrap(),
        MatchResult::TeamA,
    );

    // A random address — neither admin nor creator — can finalize.
    let random_caller = Address::generate(&env);
    fund_finalizer_bond(&env, &xlm_token, &random_caller);
    let payouts = client.finalize_event(&random_caller, &event_id);

    assert_eq!(payouts.len(), 1);
    // Allocation staged, not yet transferred.
    assert_eq!(balance(&env, &xlm_token, &user), 0);
    assert_eq!(
        balance(&env, &xlm_token, &contract_id),
        PRIZE + FINALIZATION_BOND_STROOPS
    );

    // The winner (or anyone, on the winner's behalf via auth) claims.
    assert_eq!(client.claim_prize(&user, &event_id), PRIZE);
    assert_eq!(balance(&env, &xlm_token, &user), PRIZE);
    assert_eq!(
        balance(&env, &xlm_token, &contract_id),
        FINALIZATION_BOND_STROOPS
    );
}

// ---------------------------------------------------------------------------
// Entry-fee accumulation before finalize (#1027)
// ---------------------------------------------------------------------------

/// Seed pool + entry fees accumulate correctly and the full combined pool is
/// distributed on finalization.  An odd seed is used so that integer-division
/// dust is generated and verified to reach the creator rather than being lost.
#[test]
fn test_finalize_event_seed_pool_plus_entry_fees_combined() {
    let (env, client, contract_id, creator, ai_agent, xlm_token) = setup();

    // Odd seed so 60/40 split leaves a 1-stroop dust remainder.
    let seed_pool: i128 = 5_000_001;
    let entry_fee: i128 = 1_000_000;

    fund(&env, &xlm_token, &creator, FEE + seed_pool);

    let start_time = env.ledger().timestamp() + 3600;
    let end_time = env.ledger().timestamp() + 7200;
    let dist = reward_dist(&env, &[60, 40]);

    let (event_id, invite_code) = client.create_event(
        &creator,
        &title(&env),
        &desc(&env),
        &100u32,
        &start_time,
        &end_time,
        &seed_pool,
        &dist,
        &entry_fee,
    );

    // Before any joins, prize pool equals the seed.
    assert_eq!(client.get_event_prize_pool(&event_id), seed_pool);

    // Three participants each pay entry_fee.
    let user1 = Address::generate(&env);
    let user2 = Address::generate(&env);
    let user3 = Address::generate(&env);

    for user in [&user1, &user2, &user3] {
        fund(&env, &xlm_token, user, entry_fee);
        client.join_event(user, &invite_code);
    }

    // Prize pool is now seed + 3 × entry_fee.
    let total_pool = seed_pool + 3 * entry_fee; // 5_000_001 + 3_000_000 = 8_000_001
    assert_eq!(client.get_event_prize_pool(&event_id), total_pool);

    // Add one match via storage.
    let match_id = env.as_contract(&contract_id, || {
        let mid = storage::next_match_id(&env);
        let m = creator_event_manager::storage_types::Match::new(
            mid,
            event_id,
            String::from_str(&env, "Team A"),
            String::from_str(&env, "Team B"),
            env.ledger().timestamp() + 100,
            1u32,
            0,
        );
        storage::set_match(&env, mid, &m);
        storage::add_event_match(&env, event_id, mid);
        let mut event = storage::get_event(&env, event_id).expect("event exists");
        event.add_match();
        storage::set_event(&env, event_id, &event);
        mid
    });

    // user1: exact 1-0 → 4 pts (rank 1)
    // user2: correct result 2-0 → 1 pt  (rank 2)
    // user3: wrong result  0-1 → 0 pts  (no prize)
    client.submit_prediction(&user1, &match_id, &1u32, &0u32);
    client.submit_prediction(&user2, &match_id, &2u32, &0u32);
    client.submit_prediction(&user3, &match_id, &0u32, &1u32);

    env.ledger().set_timestamp(env.ledger().timestamp() + 7300);
    // Actual result: Team A wins 1-0.
    submit_result(&client, &ai_agent, match_id, MatchResult::TeamA);

    let caller = Address::generate(&env);
    fund_finalizer_bond(&env, &xlm_token, &caller);
    let payouts = client.finalize_event(&caller, &event_id);

    // 8_000_001 * 60 / 100 = 4_800_000  (truncated)
    // 8_000_001 * 40 / 100 = 3_200_000  (truncated)
    // dust = 8_000_001 − 4_800_000 − 3_200_000 = 1 → creator
    let expected_rank1 = total_pool * 60 / 100; // 4_800_000
    let expected_rank2 = total_pool * 40 / 100; // 3_200_000
    let expected_dust = total_pool - expected_rank1 - expected_rank2; // 1

    assert_eq!(payouts.len(), 2);

    // Allocations are staged until claimed.
    assert_eq!(balance(&env, &xlm_token, &user1), 0);
    assert_eq!(balance(&env, &xlm_token, &user2), 0);
    // user3 paid the entry fee and scored 0 pts — receives no allocation.
    assert_eq!(balance(&env, &xlm_token, &user3), 0);

    // Integer-division remainder goes to creator immediately, not lost.
    assert_eq!(balance(&env, &xlm_token, &creator), expected_dust);

    // Total distributed equals seed_pool + N × entry_fee.
    let total_out = expected_rank1 + expected_rank2 + expected_dust;
    assert_eq!(total_out, total_pool);
    assert_eq!(
        balance(&env, &xlm_token, &contract_id),
        expected_rank1 + expected_rank2 + FINALIZATION_BOND_STROOPS
    );

    // Winners claim their staged allocations.
    assert_eq!(client.claim_prize(&user1, &event_id), expected_rank1);
    assert_eq!(client.claim_prize(&user2, &event_id), expected_rank2);
    assert_eq!(balance(&env, &xlm_token, &user1), expected_rank1);
    assert_eq!(balance(&env, &xlm_token, &user2), expected_rank2);
    assert_eq!(
        balance(&env, &xlm_token, &contract_id),
        FINALIZATION_BOND_STROOPS
    );

    assert!(client.get_event(&event_id).is_finalized);
}

// ---------------------------------------------------------------------------
// Finalization challenge bond (#1344)
// ---------------------------------------------------------------------------

#[test]
#[should_panic(expected = "bond_required")]
fn test_finalize_event_without_bond_rejected() {
    let (env, client, contract_id, creator, ai_agent, xlm_token) = setup();
    let dist = reward_dist(&env, &[100]);
    let (event_id, invite_code, match_ids) = create_funded_event(
        &env,
        &contract_id,
        &client,
        &creator,
        &xlm_token,
        PRIZE,
        dist,
        1,
    );
    let user = Address::generate(&env);
    client.join_event(&user, &invite_code);
    client.submit_prediction(&user, &match_ids.get(0).unwrap(), &1u32, &0u32);
    env.ledger().set_timestamp(env.ledger().timestamp() + 7300);
    submit_result(
        &client,
        &ai_agent,
        match_ids.get(0).unwrap(),
        MatchResult::TeamA,
    );

    let caller = Address::generate(&env);
    client.finalize_event(&caller, &event_id);
}

#[test]
fn test_unchallenged_finalization_returns_bond_after_window() {
    let (env, client, contract_id, creator, ai_agent, xlm_token) = setup();
    let dist = reward_dist(&env, &[100]);
    let (event_id, invite_code, match_ids) = create_funded_event(
        &env,
        &contract_id,
        &client,
        &creator,
        &xlm_token,
        PRIZE,
        dist,
        1,
    );
    let user = Address::generate(&env);
    client.join_event(&user, &invite_code);
    client.submit_prediction(&user, &match_ids.get(0).unwrap(), &1u32, &0u32);
    env.ledger().set_timestamp(env.ledger().timestamp() + 7300);
    submit_result(
        &client,
        &ai_agent,
        match_ids.get(0).unwrap(),
        MatchResult::TeamA,
    );

    let caller = Address::generate(&env);
    fund_finalizer_bond(&env, &xlm_token, &caller);
    client.finalize_event(&caller, &event_id);

    let bond = client.get_finalization_bond(&event_id);
    assert_eq!(bond.finalizer, caller);
    assert_eq!(bond.bond, FINALIZATION_BOND_STROOPS);
    assert!(!bond.challenged);
    assert!(!bond.settled);

    env.ledger()
        .set_timestamp(env.ledger().timestamp() + FINALIZATION_CHALLENGE_WINDOW_SECONDS + 1);

    let before = balance(&env, &xlm_token, &caller);
    let returned = client.settle_finalization_bond(&caller, &event_id);
    assert_eq!(returned, FINALIZATION_BOND_STROOPS);
    assert_eq!(
        balance(&env, &xlm_token, &caller),
        before + FINALIZATION_BOND_STROOPS
    );

    let settled = client.get_finalization_bond(&event_id);
    assert!(settled.settled);
    assert!(!settled.challenged);
}

#[test]
#[should_panic(expected = "bond_already_settled")]
fn test_returned_finalization_bond_cannot_be_settled_twice() {
    let (env, client, contract_id, creator, ai_agent, xlm_token) = setup();
    let dist = reward_dist(&env, &[100]);
    let (event_id, invite_code, match_ids) = create_funded_event(
        &env,
        &contract_id,
        &client,
        &creator,
        &xlm_token,
        PRIZE,
        dist,
        1,
    );
    let user = Address::generate(&env);
    client.join_event(&user, &invite_code);
    client.submit_prediction(&user, &match_ids.get(0).unwrap(), &1u32, &0u32);
    env.ledger().set_timestamp(env.ledger().timestamp() + 7300);
    submit_result(
        &client,
        &ai_agent,
        match_ids.get(0).unwrap(),
        MatchResult::TeamA,
    );

    let caller = Address::generate(&env);
    fund_finalizer_bond(&env, &xlm_token, &caller);
    client.finalize_event(&caller, &event_id);
    env.ledger()
        .set_timestamp(env.ledger().timestamp() + FINALIZATION_CHALLENGE_WINDOW_SECONDS + 1);

    client.settle_finalization_bond(&caller, &event_id);
    client.settle_finalization_bond(&caller, &event_id);
}

#[test]
fn test_successful_challenge_slashes_bond_to_treasury() {
    let (env, client, contract_id, admin, ai_agent, xlm_token) = setup();
    let treasury = client.get_treasury();
    let dist = reward_dist(&env, &[100]);
    let creator = Address::generate(&env);
    let (event_id, invite_code, match_ids) = create_funded_event(
        &env,
        &contract_id,
        &client,
        &creator,
        &xlm_token,
        PRIZE,
        dist,
        1,
    );
    let user = Address::generate(&env);
    client.join_event(&user, &invite_code);
    client.submit_prediction(&user, &match_ids.get(0).unwrap(), &1u32, &0u32);
    env.ledger().set_timestamp(env.ledger().timestamp() + 7300);
    submit_result(
        &client,
        &ai_agent,
        match_ids.get(0).unwrap(),
        MatchResult::TeamA,
    );

    let finalizer = Address::generate(&env);
    fund_finalizer_bond(&env, &xlm_token, &finalizer);
    client.finalize_event(&finalizer, &event_id);

    let treasury_before = balance(&env, &xlm_token, &treasury);
    let slashed = client.challenge_finalization(&admin, &event_id);
    assert_eq!(slashed, FINALIZATION_BOND_STROOPS);
    assert_eq!(
        balance(&env, &xlm_token, &treasury),
        treasury_before + FINALIZATION_BOND_STROOPS
    );

    let bond = client.get_finalization_bond(&event_id);
    assert!(bond.challenged);
    assert!(bond.settled);
}

#[test]
#[should_panic(expected = "bond_already_settled")]
fn test_slashed_finalization_bond_cannot_be_settled_again() {
    let (env, client, contract_id, admin, ai_agent, xlm_token) = setup();
    let treasury = client.get_treasury();
    let dist = reward_dist(&env, &[100]);
    let creator = Address::generate(&env);
    let (event_id, invite_code, match_ids) = create_funded_event(
        &env,
        &contract_id,
        &client,
        &creator,
        &xlm_token,
        PRIZE,
        dist,
        1,
    );
    let user = Address::generate(&env);
    client.join_event(&user, &invite_code);
    client.submit_prediction(&user, &match_ids.get(0).unwrap(), &1u32, &0u32);
    env.ledger().set_timestamp(env.ledger().timestamp() + 7300);
    submit_result(
        &client,
        &ai_agent,
        match_ids.get(0).unwrap(),
        MatchResult::TeamA,
    );

    let finalizer = Address::generate(&env);
    fund_finalizer_bond(&env, &xlm_token, &finalizer);
    client.finalize_event(&finalizer, &event_id);
    let treasury_before = balance(&env, &xlm_token, &treasury);
    client.challenge_finalization(&admin, &event_id);

    assert_eq!(
        balance(&env, &xlm_token, &treasury),
        treasury_before + FINALIZATION_BOND_STROOPS
    );
    env.ledger()
        .set_timestamp(env.ledger().timestamp() + FINALIZATION_CHALLENGE_WINDOW_SECONDS + 1);
    client.settle_finalization_bond(&admin, &event_id);
}

#[test]
#[should_panic(expected = "unauthorized_challenge")]
fn test_challenge_by_non_admin_non_verifier_rejected() {
    let (env, client, contract_id, _admin, ai_agent, xlm_token) = setup();
    let dist = reward_dist(&env, &[100]);
    let creator = Address::generate(&env);
    let (event_id, invite_code, match_ids) = create_funded_event(
        &env,
        &contract_id,
        &client,
        &creator,
        &xlm_token,
        PRIZE,
        dist,
        1,
    );
    let user = Address::generate(&env);
    client.join_event(&user, &invite_code);
    client.submit_prediction(&user, &match_ids.get(0).unwrap(), &1u32, &0u32);
    env.ledger().set_timestamp(env.ledger().timestamp() + 7300);
    submit_result(
        &client,
        &ai_agent,
        match_ids.get(0).unwrap(),
        MatchResult::TeamA,
    );

    let finalizer = Address::generate(&env);
    fund_finalizer_bond(&env, &xlm_token, &finalizer);
    client.finalize_event(&finalizer, &event_id);

    let stranger = Address::generate(&env);
    client.challenge_finalization(&stranger, &event_id);
}
