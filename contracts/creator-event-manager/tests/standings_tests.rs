//! Tests for reputation-weighted standings with deterministic tie-breakers (#1311).
//!
//! Covers:
//! - Unit tests for the pure weighting function (`weighted_contribution`)
//! - Unit tests for the `StandingEntry` tie-break chain
//!   (weighted score → correct count → earliest achievement → address)
//! - Integration tests over the full event lifecycle: early predictions
//!   outweigh late ones, against-the-crowd picks outweigh consensus picks,
//!   score components are exposed for transparency, and standings are
//!   idempotent across repeated recomputation (including finalize).

use creator_event_manager::storage_types::{
    weighted_contribution, StandingEntry, EARLY_PREDICTION_BONUS_BPS,
    EARLY_PREDICTION_LEAD_SECONDS, FINALIZATION_BOND_STROOPS, UNDERDOG_BONUS_BPS, WEIGHT_BASE_BPS,
};
use creator_event_manager::CreatorEventManagerContractClient;
use soroban_sdk::testutils::Address as _;
use soroban_sdk::testutils::Ledger as _;
use soroban_sdk::token::StellarAssetClient;
use soroban_sdk::{Address, Env, String, Symbol, Vec};

// ===========================================================================
// Unit tests: weighting function
// ===========================================================================

const MATCH_TIME: u64 = 100_000;

#[test]
fn test_weighting_late_consensus_is_base_only() {
    // Placed 100 s before the match, with the crowd: base weight only.
    let (base, timing, underdog) = weighted_contribution(4, MATCH_TIME - 100, MATCH_TIME, false);
    assert_eq!(base, 4 * WEIGHT_BASE_BPS);
    assert_eq!(timing, 0);
    assert_eq!(underdog, 0);
}

#[test]
fn test_weighting_early_prediction_earns_timing_bonus() {
    // Placed exactly at the early-lead threshold: bonus applies (inclusive).
    let (base, timing, underdog) = weighted_contribution(
        4,
        MATCH_TIME - EARLY_PREDICTION_LEAD_SECONDS,
        MATCH_TIME,
        false,
    );
    assert_eq!(base, 4 * WEIGHT_BASE_BPS);
    assert_eq!(timing, 4 * EARLY_PREDICTION_BONUS_BPS);
    assert_eq!(underdog, 0);

    // One second inside the threshold: no bonus.
    let (_, timing_late, _) = weighted_contribution(
        4,
        MATCH_TIME - EARLY_PREDICTION_LEAD_SECONDS + 1,
        MATCH_TIME,
        false,
    );
    assert_eq!(timing_late, 0);
}

#[test]
fn test_weighting_minority_pick_earns_underdog_bonus() {
    let (base, timing, underdog) = weighted_contribution(1, MATCH_TIME - 100, MATCH_TIME, true);
    assert_eq!(base, WEIGHT_BASE_BPS);
    assert_eq!(timing, 0);
    assert_eq!(underdog, UNDERDOG_BONUS_BPS);
}

#[test]
fn test_weighting_zero_points_contributes_nothing() {
    // A wrong prediction earns nothing even if early and against the crowd.
    let contribution = weighted_contribution(0, 0, MATCH_TIME, true);
    assert_eq!(contribution, (0, 0, 0));
}

#[test]
fn test_weighting_early_underdog_strictly_beats_late_consensus() {
    let (b1, t1, u1) = weighted_contribution(4, 0, MATCH_TIME, true);
    let (b2, t2, u2) = weighted_contribution(4, MATCH_TIME - 1, MATCH_TIME, false);
    assert!(b1 + t1 + u1 > b2 + t2 + u2);
    // Each bonus alone is also strictly higher than the plain contribution.
    let (b3, t3, u3) = weighted_contribution(4, 0, MATCH_TIME, false);
    let (b4, t4, u4) = weighted_contribution(4, MATCH_TIME - 1, MATCH_TIME, true);
    assert!(b3 + t3 + u3 > b2 + t2 + u2);
    assert!(b4 + t4 + u4 > b2 + t2 + u2);
}

// ===========================================================================
// Unit tests: StandingEntry tie-break chain
// ===========================================================================

fn entry(user: &Address, weighted: u64, correct: u32, achieved_at: u64) -> StandingEntry {
    StandingEntry {
        user: user.clone(),
        event_id: 1,
        weighted_score: weighted,
        correct_count: correct,
        achieved_at,
        rank: 0,
    }
}

#[test]
fn test_tiebreak_weighted_score_is_primary() {
    let env = Env::default();
    let a = Address::generate(&env);
    let b = Address::generate(&env);
    // Lower correct count and later achievement, but higher weighted score wins.
    let high = entry(&a, 20_000, 1, 500);
    let low = entry(&b, 15_000, 3, 100);
    assert!(high.outranks(&low));
    assert!(!low.outranks(&high));
}

#[test]
fn test_tiebreak_correct_count_on_equal_weighted_score() {
    let env = Env::default();
    let a = Address::generate(&env);
    let b = Address::generate(&env);
    let more_correct = entry(&a, 20_000, 2, 500);
    let fewer_correct = entry(&b, 20_000, 1, 100);
    assert!(more_correct.outranks(&fewer_correct));
    assert!(!fewer_correct.outranks(&more_correct));
}

#[test]
fn test_tiebreak_earlier_achievement_on_equal_score_and_count() {
    let env = Env::default();
    let a = Address::generate(&env);
    let b = Address::generate(&env);
    let earlier = entry(&a, 20_000, 2, 100);
    let later = entry(&b, 20_000, 2, 500);
    assert!(earlier.outranks(&later));
    assert!(!later.outranks(&earlier));
}

#[test]
fn test_tiebreak_address_is_final() {
    let env = Env::default();
    let a = Address::generate(&env);
    let b = Address::generate(&env);
    let (smaller, larger) = if a < b { (a, b) } else { (b, a) };
    let s = entry(&smaller, 20_000, 2, 100);
    let l = entry(&larger, 20_000, 2, 100);
    assert!(s.outranks(&l));
    assert!(!l.outranks(&s));
}

// ===========================================================================
// Integration test setup
// ===========================================================================

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
    (env, client, ai_agent, xlm_token, contract_id)
}

fn fund(env: &Env, token: &Address, user: &Address, amount: i128) {
    StellarAssetClient::new(env, token).mint(user, &amount);
}

/// Create an event whose window comfortably contains the given match times,
/// then create one match per entry in `match_times` via the real entry point.
fn create_event_with_matches(
    env: &Env,
    client: &CreatorEventManagerContractClient<'static>,
    xlm_token: &Address,
    match_times: &[u64],
) -> (u64, Symbol, std::vec::Vec<u64>, Address) {
    let creator = Address::generate(env);
    fund(env, xlm_token, &creator, FEE);

    let now = env.ledger().timestamp();
    let start_time = now + 60;
    let end_time = now + 100_000;
    let (event_id, invite_code) = client.create_event(
        &creator,
        &String::from_str(env, "Weighted Standings Event"),
        &String::from_str(env, "Event lifecycle test for issue #1311"),
        &100u32,
        &start_time,
        &end_time,
        &0i128,
        &Vec::new(env),
        &0i128,
    );

    let mut match_ids = std::vec::Vec::new();
    for (i, match_time) in match_times.iter().enumerate() {
        let match_id = client.create_match(
            &creator,
            &event_id,
            &String::from_str(env, &format!("Team A{}", i)),
            &String::from_str(env, &format!("Team B{}", i)),
            match_time,
            &1u32,
        );
        match_ids.push(match_id);
    }

    (event_id, invite_code, match_ids, creator)
}

// ===========================================================================
// Integration tests
// ===========================================================================

/// Two users with identical correct counts and identical points: the one who
/// predicted early (≥ 1 h lead) gets a strictly higher weighted score and
/// rank 1, and the transparency view exposes the component breakdown.
#[test]
fn test_early_prediction_outranks_late_with_equal_correct_counts() {
    let (env, client, ai_agent, xlm_token, _) = setup();
    let t0 = env.ledger().timestamp();

    // One match starting two hours out.
    let (event_id, invite_code, match_ids, _) =
        create_event_with_matches(&env, &client, &xlm_token, &[t0 + 7_200]);
    let match_id = match_ids[0];

    let early_user = Address::generate(&env);
    let late_user = Address::generate(&env);

    // Early user predicts immediately: 7 200 s lead ≥ 3 600 s threshold.
    client.join_event(&early_user, &invite_code);
    client.submit_prediction(&early_user, &match_id, &1u32, &0u32);

    // Late user predicts 1 200 s before the match: below the threshold.
    env.ledger().set_timestamp(t0 + 6_000);
    client.join_event(&late_user, &invite_code);
    client.submit_prediction(&late_user, &match_id, &1u32, &0u32);

    // Resolve: 1-0, both predictions exact (4 points each), both consensus.
    env.ledger().set_timestamp(t0 + 7_300);
    client.submit_match_result(&ai_agent, &match_id, &1u32, &0u32);

    let standings = client.get_event_standings(&event_id);
    assert_eq!(standings.len(), 2);

    let first = standings.get(0).unwrap();
    let second = standings.get(1).unwrap();
    assert_eq!(first.user, early_user);
    assert_eq!(first.rank, 1);
    assert_eq!(second.user, late_user);
    assert_eq!(second.rank, 2);

    // Equal correct counts — ordering is purely the weighted score.
    assert_eq!(first.correct_count, 1);
    assert_eq!(second.correct_count, 1);
    assert_eq!(
        first.weighted_score,
        4 * (WEIGHT_BASE_BPS + EARLY_PREDICTION_BONUS_BPS)
    );
    assert_eq!(second.weighted_score, 4 * WEIGHT_BASE_BPS);
    assert!(first.weighted_score > second.weighted_score);

    // Transparency view: components add up to the weighted score.
    let early_score = client.get_participant_score(&event_id, &early_user);
    assert_eq!(early_score.base_component, 4 * WEIGHT_BASE_BPS);
    assert_eq!(early_score.timing_component, 4 * EARLY_PREDICTION_BONUS_BPS);
    assert_eq!(early_score.underdog_component, 0);
    assert_eq!(
        early_score.weighted_score,
        early_score.base_component + early_score.timing_component + early_score.underdog_component
    );
    assert_eq!(early_score.correct_count, 1);
    assert_eq!(early_score.achieved_at, t0 + 7_300);

    let late_score = client.get_participant_score(&event_id, &late_user);
    assert_eq!(late_score.timing_component, 0);
    assert_eq!(late_score.weighted_score, late_score.base_component);
}

/// An against-the-crowd correct pick is worth strictly more than a consensus
/// correct pick with the same raw points.
#[test]
fn test_against_crowd_pick_outranks_consensus_pick() {
    let (env, client, ai_agent, xlm_token, _) = setup();
    let t0 = env.ledger().timestamp();

    // Two matches, both < 1 h out so no timing bonus muddies the comparison.
    let (event_id, invite_code, match_ids, _) =
        create_event_with_matches(&env, &client, &xlm_token, &[t0 + 1_800, t0 + 1_900]);

    let underdog = Address::generate(&env);
    let consensus = Address::generate(&env);
    let crowd = Address::generate(&env);
    for user in [&underdog, &consensus, &crowd] {
        client.join_event(user, &invite_code);
    }

    // Match 1: underdog picks TeamB (1 of 3), the others pick TeamA.
    client.submit_prediction(&underdog, &match_ids[0], &0u32, &1u32);
    client.submit_prediction(&consensus, &match_ids[0], &1u32, &0u32);
    client.submit_prediction(&crowd, &match_ids[0], &1u32, &0u32);

    // Match 2: consensus & crowd pick TeamA (2 of 3), underdog picks TeamB.
    client.submit_prediction(&underdog, &match_ids[1], &0u32, &1u32);
    client.submit_prediction(&consensus, &match_ids[1], &1u32, &0u32);
    client.submit_prediction(&crowd, &match_ids[1], &2u32, &0u32);

    env.ledger().set_timestamp(t0 + 2_000);
    // Match 1 finishes 0-1: only the underdog is right (exact, 4 pts, minority).
    client.submit_match_result(&ai_agent, &match_ids[0], &0u32, &1u32);
    // Match 2 finishes 1-0: consensus is exact (4 pts) with the majority.
    client.submit_match_result(&ai_agent, &match_ids[1], &1u32, &0u32);

    let standings = client.get_event_standings(&event_id);
    assert_eq!(standings.len(), 3);

    let first = standings.get(0).unwrap();
    let second = standings.get(1).unwrap();
    let third = standings.get(2).unwrap();

    // Same points (4) and same correct count (1) — the minority pick wins.
    assert_eq!(first.user, underdog);
    assert_eq!(
        first.weighted_score,
        4 * (WEIGHT_BASE_BPS + UNDERDOG_BONUS_BPS)
    );
    assert_eq!(first.correct_count, 1);

    assert_eq!(second.user, consensus);
    assert_eq!(second.weighted_score, 4 * WEIGHT_BASE_BPS);
    assert_eq!(second.correct_count, 1);
    assert!(first.weighted_score > second.weighted_score);

    // Crowd got match 2's result right (1 pt) but not the exact score.
    assert_eq!(third.user, crowd);
    assert_eq!(third.weighted_score, WEIGHT_BASE_BPS);

    // Component breakdown for the underdog.
    let score = client.get_participant_score(&event_id, &underdog);
    assert_eq!(score.base_component, 4 * WEIGHT_BASE_BPS);
    assert_eq!(score.timing_component, 0);
    assert_eq!(score.underdog_component, 4 * UNDERDOG_BONUS_BPS);
}

/// Equal weighted scores and correct counts: the participant who reached the
/// score first (earlier result submission) ranks higher.
#[test]
fn test_tiebreak_earlier_achievement_in_lifecycle() {
    let (env, client, ai_agent, xlm_token, _) = setup();
    let t0 = env.ledger().timestamp();

    // Two matches with identical start times (identical timing weights).
    let (event_id, invite_code, match_ids, _) =
        create_event_with_matches(&env, &client, &xlm_token, &[t0 + 1_800, t0 + 1_800]);

    let user1 = Address::generate(&env);
    let user2 = Address::generate(&env);
    client.join_event(&user1, &invite_code);
    client.join_event(&user2, &invite_code);

    // user1 is exact on match 1 and wrong on match 2; user2 is the mirror
    // image. Each match has one predictor per outcome (1 of 2 picks the
    // winner → 2·1 == 2, not a minority), so weighted scores are equal.
    client.submit_prediction(&user1, &match_ids[0], &1u32, &0u32);
    client.submit_prediction(&user1, &match_ids[1], &0u32, &1u32);
    client.submit_prediction(&user2, &match_ids[0], &0u32, &1u32);
    client.submit_prediction(&user2, &match_ids[1], &1u32, &0u32);

    // Match 1 resolves first (user1 scores), match 2 resolves later (user2).
    env.ledger().set_timestamp(t0 + 2_000);
    client.submit_match_result(&ai_agent, &match_ids[0], &1u32, &0u32);
    env.ledger().set_timestamp(t0 + 2_500);
    client.submit_match_result(&ai_agent, &match_ids[1], &1u32, &0u32);

    let standings = client.get_event_standings(&event_id);
    assert_eq!(standings.len(), 2);

    let first = standings.get(0).unwrap();
    let second = standings.get(1).unwrap();
    assert_eq!(first.weighted_score, second.weighted_score);
    assert_eq!(first.correct_count, second.correct_count);
    assert_eq!(first.user, user1);
    assert_eq!(first.achieved_at, t0 + 2_000);
    assert_eq!(second.user, user2);
    assert_eq!(second.achieved_at, t0 + 2_500);
}

/// Fully identical participants fall back to the address tie-breaker, and the
/// outcome does not depend on join/prediction insertion order.
#[test]
fn test_tiebreak_address_in_lifecycle() {
    let (env, client, ai_agent, xlm_token, _) = setup();
    let t0 = env.ledger().timestamp();

    let (event_id, invite_code, match_ids, _) =
        create_event_with_matches(&env, &client, &xlm_token, &[t0 + 1_800]);

    let a = Address::generate(&env);
    let b = Address::generate(&env);
    let (smaller, larger) = if a < b { (a, b) } else { (b, a) };

    // Larger address joins and predicts FIRST — insertion order must not matter.
    client.join_event(&larger, &invite_code);
    client.join_event(&smaller, &invite_code);
    client.submit_prediction(&larger, &match_ids[0], &1u32, &0u32);
    client.submit_prediction(&smaller, &match_ids[0], &1u32, &0u32);

    env.ledger().set_timestamp(t0 + 2_000);
    client.submit_match_result(&ai_agent, &match_ids[0], &1u32, &0u32);

    let standings = client.get_event_standings(&event_id);
    assert_eq!(standings.len(), 2);
    assert_eq!(standings.get(0).unwrap().user, smaller);
    assert_eq!(standings.get(0).unwrap().rank, 1);
    assert_eq!(standings.get(1).unwrap().user, larger);
    assert_eq!(standings.get(1).unwrap().rank, 2);
}

/// Full event lifecycle: standings update after each result, participants who
/// never score still appear, and the snapshot is identical across repeated
/// reads and across the finalize path (idempotence).
#[test]
fn test_lifecycle_standings_idempotent_through_finalize() {
    let (env, client, ai_agent, xlm_token, _) = setup();
    let t0 = env.ledger().timestamp();

    let (event_id, invite_code, match_ids, _) =
        create_event_with_matches(&env, &client, &xlm_token, &[t0 + 7_200, t0 + 7_500]);

    let user1 = Address::generate(&env);
    let user2 = Address::generate(&env);
    let idle = Address::generate(&env); // joins but never predicts

    // No results submitted yet → no standings snapshot.
    assert_eq!(client.get_event_standings(&event_id).len(), 0);

    client.join_event(&user1, &invite_code);
    client.join_event(&user2, &invite_code);
    client.join_event(&idle, &invite_code);

    // user1 predicts both matches early; user2 predicts match 2 late.
    client.submit_prediction(&user1, &match_ids[0], &2u32, &0u32);
    client.submit_prediction(&user1, &match_ids[1], &1u32, &1u32);
    env.ledger().set_timestamp(t0 + 6_500);
    client.submit_prediction(&user2, &match_ids[1], &1u32, &1u32);

    // Resolve match 1 (2-0): user1 exact.
    env.ledger().set_timestamp(t0 + 7_300);
    client.submit_match_result(&ai_agent, &match_ids[0], &2u32, &0u32);

    let interim = client.get_event_standings(&event_id);
    assert_eq!(interim.len(), 3);
    assert_eq!(interim.get(0).unwrap().user, user1);
    assert_eq!(interim.get(0).unwrap().correct_count, 1);

    // Resolve match 2 (1-1): both user1 and user2 exact (draw is consensus —
    // both graded predictors picked it).
    env.ledger().set_timestamp(t0 + 7_600);
    client.submit_match_result(&ai_agent, &match_ids[1], &1u32, &1u32);

    let after_results = client.get_event_standings(&event_id);
    assert_eq!(after_results.len(), 3);
    let top = after_results.get(0).unwrap();
    assert_eq!(top.user, user1);
    assert_eq!(top.rank, 1);
    assert_eq!(top.correct_count, 2);
    // user1: match 1 early exact 4×1.25, match 2 early exact 4×1.25.
    assert_eq!(
        top.weighted_score,
        2 * 4 * (WEIGHT_BASE_BPS + EARLY_PREDICTION_BONUS_BPS)
    );
    // user2: match 2 late exact, base only.
    assert_eq!(after_results.get(1).unwrap().user, user2);
    assert_eq!(
        after_results.get(1).unwrap().weighted_score,
        4 * WEIGHT_BASE_BPS
    );
    // Idle participant still appears, with a zero score and last rank.
    assert_eq!(after_results.get(2).unwrap().user, idle);
    assert_eq!(after_results.get(2).unwrap().weighted_score, 0);
    assert_eq!(after_results.get(2).unwrap().rank, 3);

    // Repeated reads return the identical snapshot.
    assert_eq!(client.get_event_standings(&event_id), after_results);

    // Finalize (recomputes standings again) — snapshot must be unchanged.
    env.ledger().set_timestamp(t0 + 200_000);
    let caller = Address::generate(&env);
    fund(&env, &xlm_token, &caller, FINALIZATION_BOND_STROOPS);
    client.finalize_event(&caller, &event_id);
    assert!(client.is_event_finalized(&event_id));

    let after_finalize = client.get_event_standings(&event_id);
    assert_eq!(after_finalize, after_results);

    // Component invariant holds for every participant.
    for user in [&user1, &user2, &idle] {
        let score = client.get_participant_score(&event_id, user);
        assert_eq!(
            score.weighted_score,
            score.base_component + score.timing_component + score.underdog_component
        );
    }
}

/// The transparency read returns a zeroed score for unknown users and panics
/// for unknown events.
#[test]
fn test_participant_score_defaults_and_event_guard() {
    let (env, client, _ai_agent, xlm_token, _) = setup();
    let t0 = env.ledger().timestamp();

    let (event_id, _invite_code, _match_ids, _) =
        create_event_with_matches(&env, &client, &xlm_token, &[t0 + 1_800]);

    let stranger = Address::generate(&env);
    let score = client.get_participant_score(&event_id, &stranger);
    assert_eq!(score.weighted_score, 0);
    assert_eq!(score.correct_count, 0);
    assert_eq!(score.achieved_at, 0);
    assert_eq!(score.user, stranger);
    assert_eq!(score.event_id, event_id);
}

#[test]
#[should_panic(expected = "event_not_found")]
fn test_get_event_standings_unknown_event_panics() {
    let (_env, client, _ai_agent, _xlm_token, _) = setup();
    client.get_event_standings(&9_999u64);
}
