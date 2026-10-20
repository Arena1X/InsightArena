/// Tests for staged prize distribution via `claim_prize` / `clawback_unclaimed` (#1312).
///
/// Coverage:
/// - Winners claim their staged allocation exactly once; a second claim errors
///   with no extra funds moved.
/// - `clawback_unclaimed` before the claim deadline errors; after the
///   deadline it sweeps only unclaimed allocations, leaving claimed winners
///   untouched.
/// - A claim attempted after `clawback_unclaimed` already swept the
///   allocation errors identically to a double-claim.
/// - `claim_prize` / `clawback_unclaimed` before finalization error.
/// - A repeated `clawback_unclaimed` call is a harmless no-op.
/// - Property test: across many randomized (winner count, pool size,
///   claim/no-show subset) scenarios, `sum(claims) + clawed_back` always
///   equals the original prize pool.
use creator_event_manager::storage;
use creator_event_manager::storage_types::{
    MatchResult, CLAIM_PERIOD_SECONDS, FINALIZATION_BOND_STROOPS,
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
    (
        env,
        client,
        contract_id,
        admin,
        ai_agent,
        xlm_token,
        treasury,
    )
}

fn fund(env: &Env, token: &Address, user: &Address, amount: i128) {
    StellarAssetClient::new(env, token).mint(user, &amount);
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
/// matches. The creator is funded with exactly `FEE + prize_pool`.
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
                String::from_str(env, &std::format!("Team A{}", i)),
                String::from_str(env, &std::format!("Team B{}", i)),
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
// claim_prize — happy path & double-claim guard
// ---------------------------------------------------------------------------

#[test]
fn test_claim_prize_transfers_allocation_once() {
    let (env, client, contract_id, creator, ai_agent, xlm_token, _treasury) = setup();

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
    fund(&env, &xlm_token, &caller, FINALIZATION_BOND_STROOPS);
    client.finalize_event(&caller, &event_id);

    // Nothing moved yet.
    assert_eq!(balance(&env, &xlm_token, &user), 0);

    let claimed = client.claim_prize(&user, &event_id);
    assert_eq!(claimed, PRIZE);
    assert_eq!(balance(&env, &xlm_token, &user), PRIZE);
    assert_eq!(
        balance(&env, &xlm_token, &contract_id),
        FINALIZATION_BOND_STROOPS
    );
}

#[test]
#[should_panic(expected = "already_claimed")]
fn test_claim_prize_twice_rejected() {
    let (env, client, contract_id, creator, ai_agent, xlm_token, _treasury) = setup();

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
    fund(&env, &xlm_token, &caller, FINALIZATION_BOND_STROOPS);
    client.finalize_event(&caller, &event_id);

    client.claim_prize(&user, &event_id);
    let balance_after_first_claim = balance(&env, &xlm_token, &user);
    assert_eq!(balance_after_first_claim, PRIZE);

    // Second claim must panic and move no additional funds.
    client.claim_prize(&user, &event_id);
}

#[test]
#[should_panic(expected = "no_allocation")]
fn test_claim_prize_non_winner_rejected() {
    let (env, client, contract_id, creator, ai_agent, xlm_token, _treasury) = setup();

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

    let winner = Address::generate(&env);
    client.join_event(&winner, &invite_code);
    client.submit_prediction(&winner, &match_ids.get(0).unwrap(), &1u32, &0u32);

    env.ledger().set_timestamp(env.ledger().timestamp() + 7300);
    submit_result(
        &client,
        &ai_agent,
        match_ids.get(0).unwrap(),
        MatchResult::TeamA,
    );

    let caller = Address::generate(&env);
    fund(&env, &xlm_token, &caller, FINALIZATION_BOND_STROOPS);
    client.finalize_event(&caller, &event_id);

    // Never joined, never allocated a prize.
    let stranger = Address::generate(&env);
    client.claim_prize(&stranger, &event_id);
}

#[test]
#[should_panic(expected = "event_not_finalized")]
fn test_claim_prize_before_finalize_rejected() {
    let (env, client, contract_id, creator, _ai_agent, xlm_token, _treasury) = setup();

    let dist = reward_dist(&env, &[100]);
    let (event_id, invite_code, _match_ids) = create_funded_event(
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

    client.claim_prize(&user, &event_id);
}

// ---------------------------------------------------------------------------
// clawback_unclaimed — deadline guard & selective sweep
// ---------------------------------------------------------------------------

#[test]
#[should_panic(expected = "claim_period_not_expired")]
fn test_clawback_before_deadline_rejected() {
    let (env, client, contract_id, creator, ai_agent, xlm_token, _treasury) = setup();

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
    fund(&env, &xlm_token, &caller, FINALIZATION_BOND_STROOPS);
    client.finalize_event(&caller, &event_id);

    // Deadline is CLAIM_PERIOD_SECONDS away — calling immediately must fail.
    client.clawback_unclaimed(&caller, &event_id);
}

#[test]
#[should_panic(expected = "event_not_finalized")]
fn test_clawback_before_finalize_rejected() {
    let (env, client, contract_id, creator, _ai_agent, xlm_token, _treasury) = setup();

    let dist = reward_dist(&env, &[100]);
    let (event_id, _invite_code, _match_ids) = create_funded_event(
        &env,
        &contract_id,
        &client,
        &creator,
        &xlm_token,
        PRIZE,
        dist,
        1,
    );

    let caller = Address::generate(&env);
    client.clawback_unclaimed(&caller, &event_id);
}

#[test]
fn test_clawback_after_deadline_sweeps_only_unclaimed() {
    let (env, client, contract_id, creator, ai_agent, xlm_token, treasury) = setup();

    // Two winners with distinct ranks (60/40 split).
    let dist = reward_dist(&env, &[60, 40]);
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

    let claimer = Address::generate(&env);
    let no_show = Address::generate(&env);

    client.join_event(&claimer, &invite_code);
    client.submit_prediction(&claimer, &match_ids.get(0).unwrap(), &1u32, &0u32); // exact → rank 1
    client.join_event(&no_show, &invite_code);
    client.submit_prediction(&no_show, &match_ids.get(0).unwrap(), &2u32, &0u32); // correct result only → rank 2

    env.ledger().set_timestamp(env.ledger().timestamp() + 7300);
    submit_result(
        &client,
        &ai_agent,
        match_ids.get(0).unwrap(),
        MatchResult::TeamA,
    );

    let caller = Address::generate(&env);
    fund(&env, &xlm_token, &caller, FINALIZATION_BOND_STROOPS);
    client.finalize_event(&caller, &event_id);

    let rank1 = PRIZE * 60 / 100;
    let rank2 = PRIZE * 40 / 100;

    // Only the claimer settles before the deadline.
    assert_eq!(client.claim_prize(&claimer, &event_id), rank1);
    assert_eq!(balance(&env, &xlm_token, &claimer), rank1);

    let treasury_before = balance(&env, &xlm_token, &treasury);

    // Past the deadline, sweep whatever the no-show never claimed.
    env.ledger()
        .set_timestamp(env.ledger().timestamp() + CLAIM_PERIOD_SECONDS + 1);
    let swept = client.clawback_unclaimed(&caller, &event_id);

    assert_eq!(swept, rank2);
    assert_eq!(
        balance(&env, &xlm_token, &treasury),
        treasury_before + rank2
    );
    // The claimer's settled funds are untouched by the sweep.
    assert_eq!(balance(&env, &xlm_token, &claimer), rank1);
    // The no-show never receives anything.
    assert_eq!(balance(&env, &xlm_token, &no_show), 0);
    // Only the finalization bond remains after prize settlements.
    assert_eq!(
        balance(&env, &xlm_token, &contract_id),
        FINALIZATION_BOND_STROOPS
    );
}

#[test]
#[should_panic(expected = "already_claimed")]
fn test_claim_after_clawback_rejected() {
    let (env, client, contract_id, creator, ai_agent, xlm_token, _treasury) = setup();

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

    let no_show = Address::generate(&env);
    client.join_event(&no_show, &invite_code);
    client.submit_prediction(&no_show, &match_ids.get(0).unwrap(), &1u32, &0u32);

    env.ledger().set_timestamp(env.ledger().timestamp() + 7300);
    submit_result(
        &client,
        &ai_agent,
        match_ids.get(0).unwrap(),
        MatchResult::TeamA,
    );

    let caller = Address::generate(&env);
    fund(&env, &xlm_token, &caller, FINALIZATION_BOND_STROOPS);
    client.finalize_event(&caller, &event_id);

    env.ledger()
        .set_timestamp(env.ledger().timestamp() + CLAIM_PERIOD_SECONDS + 1);
    let swept = client.clawback_unclaimed(&caller, &event_id);
    assert_eq!(swept, PRIZE);

    // The allocation was already swept to treasury — this must panic, not
    // move any (more) funds.
    client.claim_prize(&no_show, &event_id);
}

#[test]
fn test_clawback_called_twice_is_noop() {
    let (env, client, contract_id, creator, ai_agent, xlm_token, treasury) = setup();

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

    let no_show = Address::generate(&env);
    client.join_event(&no_show, &invite_code);
    client.submit_prediction(&no_show, &match_ids.get(0).unwrap(), &1u32, &0u32);

    env.ledger().set_timestamp(env.ledger().timestamp() + 7300);
    submit_result(
        &client,
        &ai_agent,
        match_ids.get(0).unwrap(),
        MatchResult::TeamA,
    );

    let caller = Address::generate(&env);
    fund(&env, &xlm_token, &caller, FINALIZATION_BOND_STROOPS);
    client.finalize_event(&caller, &event_id);

    env.ledger()
        .set_timestamp(env.ledger().timestamp() + CLAIM_PERIOD_SECONDS + 1);
    assert_eq!(client.clawback_unclaimed(&caller, &event_id), PRIZE);
    let treasury_after_first_sweep = balance(&env, &xlm_token, &treasury);

    // A second sweep finds nothing unclaimed and moves nothing.
    assert_eq!(client.clawback_unclaimed(&caller, &event_id), 0);
    assert_eq!(
        balance(&env, &xlm_token, &treasury),
        treasury_after_first_sweep
    );
}

// ---------------------------------------------------------------------------
// Property test (#1312): claims + clawback == original prize pool
// ---------------------------------------------------------------------------

/// Across randomized winner counts, pool sizes, and claim/no-show subsets,
/// `sum(amounts actually claimed) + amount clawed back` always equals the
/// original prize pool.
///
/// Reward distributions are constructed to sum to exactly 100, and the prize
/// pool is always a multiple of 100, so every rank's `prize_pool * percent /
/// 100` divides evenly — no integer-division dust and no unallocated
/// percentage leaks to the creator. That isolates the invariant to exactly
/// the winners' staged allocations, which is what claim_prize and
/// clawback_unclaimed are responsible for settling.
///
/// Randomness comes from a small deterministic LCG (no proptest dependency
/// needed) so the test is reproducible and doesn't touch the network.
#[test]
fn test_property_claims_plus_clawback_equals_prize_pool() {
    let mut state: u64 = 0x9E37_79B9_7F4A_7C15;
    let mut next_u32 = move || {
        state = state.wrapping_mul(6364136223846793005).wrapping_add(1);
        (state >> 33) as u32
    };

    for iteration in 0..40u32 {
        let num_winners = 1 + (next_u32() % 5); // 1..=5 distinct ranks

        let base = 100 / num_winners;
        let remainder = 100 % num_winners;
        let mut percents: std::vec::Vec<u32> = std::vec::Vec::new();
        for i in 0..num_winners {
            percents.push(if i < remainder { base + 1 } else { base });
        }
        assert_eq!(percents.iter().sum::<u32>(), 100);

        // A multiple of 100 so every percent above divides evenly.
        let k: i128 = 1_000 + (next_u32() % 9_000) as i128;
        let prize_pool = k * 100;

        let (env, client, contract_id, creator, ai_agent, xlm_token, _treasury) = setup();
        let dist = reward_dist(&env, &percents);
        let (event_id, invite_code, match_ids) = create_funded_event(
            &env,
            &contract_id,
            &client,
            &creator,
            &xlm_token,
            prize_pool,
            dist,
            num_winners,
        );

        let mut users: std::vec::Vec<Address> = std::vec::Vec::new();
        for _ in 0..num_winners {
            users.push(Address::generate(&env));
        }

        // user i predicts correctly on the first (num_winners - i) matches →
        // strictly decreasing points → distinct ranks in user order.
        for (i, user) in users.iter().enumerate() {
            client.join_event(user, &invite_code);
            let correct = num_winners - i as u32;
            for (m, match_id) in match_ids.iter().enumerate() {
                if (m as u32) < correct {
                    client.submit_prediction(user, &match_id, &1u32, &0u32);
                } else {
                    client.submit_prediction(user, &match_id, &0u32, &1u32);
                }
            }
        }

        env.ledger().set_timestamp(env.ledger().timestamp() + 7300);
        for match_id in match_ids.iter() {
            submit_result(&client, &ai_agent, match_id, MatchResult::TeamA);
        }

        let caller = Address::generate(&env);
        fund(&env, &xlm_token, &caller, FINALIZATION_BOND_STROOPS);
        let payouts = client.finalize_event(&caller, &event_id);
        assert_eq!(payouts.len(), num_winners);

        // Every rank filled by a 100%-summing distribution over a pool
        // divisible by 100 → no leftover for the creator.
        assert_eq!(balance(&env, &xlm_token, &creator), 0);

        // Randomly pick which winners claim before the deadline; the rest
        // are no-shows swept by clawback_unclaimed.
        let mut claimed_total: i128 = 0;
        for (i, user) in users.iter().enumerate() {
            let (_, amount) = payouts.get(i as u32).unwrap();
            if next_u32() % 2 == 0 {
                let claimed = client.claim_prize(user, &event_id);
                assert_eq!(claimed, amount);
                claimed_total += claimed;
            }
        }

        env.ledger()
            .set_timestamp(env.ledger().timestamp() + CLAIM_PERIOD_SECONDS + 1);
        let swept = client.clawback_unclaimed(&caller, &event_id);

        assert_eq!(
            claimed_total + swept,
            prize_pool,
            "iteration {iteration}: num_winners={num_winners} prize_pool={prize_pool} claimed_total={claimed_total} swept={swept}",
        );

        // Finalization bond remains after every prize allocation is settled.
        assert_eq!(
            balance(&env, &xlm_token, &contract_id),
            FINALIZATION_BOND_STROOPS
        );

        // Repeat clawback is a harmless no-op — invariant still holds.
        assert_eq!(client.clawback_unclaimed(&caller, &event_id), 0);
        assert_eq!(claimed_total + swept, prize_pool);
    }
}
