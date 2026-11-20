//! Integration tests for Issue #2020:
//! Storage TTL Extension on Access for Creator Events.
//!
//! Verifies:
//! 1. Accessing active-event state extends its TTL.
//! 2. Finalized/old state is allowed to expire per policy (not extended).
//! 3. A long-running event's state survives to finalization when accessed periodically.

use creator_event_manager::storage::{self, TTL_BUMP, TTL_THRESHOLD};
use creator_event_manager::storage_types::{
    DataKey, Match, MatchResult, FINALIZATION_BOND_STROOPS,
};
use creator_event_manager::CreatorEventManagerContractClient;
use soroban_sdk::testutils::{
    storage::Persistent as _,
    Address as _, Ledger as _,
};
use soroban_sdk::token::StellarAssetClient;
use soroban_sdk::{Address, Env, String, Symbol, Vec};

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

    env.ledger().with_mut(|li| {
        li.timestamp = 1_700_000_000;
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
    env.as_contract(&contract_id, || {
        env.storage().instance().extend_ttl(TTL_THRESHOLD, TTL_BUMP);
    });
    env.as_contract(&xlm_token, || {
        env.storage().instance().extend_ttl(TTL_THRESHOLD, TTL_BUMP);
    });
    (env, client, contract_id, admin, ai_agent, xlm_token)
}

fn fund(env: &Env, token: &Address, user: &Address, amount: i128) {
    StellarAssetClient::new(env, token).mint(user, &amount);
}

fn title(env: &Env) -> String {
    String::from_str(env, "Championship 2026")
}

fn desc(env: &Env) -> String {
    String::from_str(env, "Predictions for Championship 2026")
}

fn reward_dist(env: &Env, percents: &[u32]) -> Vec<u32> {
    let mut v = Vec::new(env);
    for p in percents {
        v.push_back(*p);
    }
    v
}

fn create_event_and_match(
    env: &Env,
    contract_id: &Address,
    client: &CreatorEventManagerContractClient<'static>,
    creator: &Address,
    xlm_token: &Address,
    duration_seconds: u64,
) -> (u64, Symbol, u64) {
    fund(env, xlm_token, creator, FEE);
    let start_time = env.ledger().timestamp() + 3600;
    let end_time = env.ledger().timestamp() + duration_seconds;
    let (event_id, invite_code) = client.create_event(
        creator,
        &title(env),
        &desc(env),
        &50u32,
        &start_time,
        &end_time,
        &0i128,
        &reward_dist(env, &[]),
        &0i128,
    );

    let match_id = env.as_contract(contract_id, || {
        let m_id = storage::next_match_id(env);
        let match_record = Match::new(
            m_id,
            event_id,
            String::from_str(env, "Team Alpha"),
            String::from_str(env, "Team Beta"),
            start_time + 600,
            1u32,
            0,
        );
        storage::set_match(env, m_id, &match_record);
        storage::add_event_match(env, event_id, m_id);

        let mut event = storage::get_event(env, event_id).expect("event exists");
        event.add_match();
        storage::set_event(env, event_id, &event);
        m_id
    });

    (event_id, invite_code, match_id)
}

fn submit_match_result(
    client: &CreatorEventManagerContractClient<'static>,
    ai_agent: &Address,
    match_id: u64,
    result: MatchResult,
) {
    let (home, away) = match result {
        MatchResult::TeamA => (2u32, 1u32),
        MatchResult::TeamB => (0u32, 1u32),
        MatchResult::Draw => (1u32, 1u32),
    };
    client.submit_match_result(ai_agent, &match_id, &home, &away);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

/// Test 1: Accessing active-event state extends its TTL.
#[test]
fn test_accessing_active_event_state_extends_ttl() {
    let (env, client, contract_id, _admin, _ai_agent, xlm_token) = setup();
    let creator = Address::generate(&env);
    let participant = Address::generate(&env);

    let (event_id, invite_code, match_id) =
        create_event_and_match(&env, &contract_id, &client, &creator, &xlm_token, 86_400);

    // Join the event to populate EventParticipants
    client.join_event(&participant, &invite_code);

    let event_key = DataKey::Event(event_id);
    let match_key = DataKey::Match(match_id);
    let matches_key = DataKey::EventMatches(event_id);
    let participants_key = DataKey::EventParticipants(event_id);

    let initial_event_ttl = env.as_contract(&contract_id, || {
        env.storage().persistent().get_ttl(&event_key)
    });
    let initial_match_ttl = env.as_contract(&contract_id, || {
        env.storage().persistent().get_ttl(&match_key)
    });

    assert!(initial_event_ttl > 0);
    assert!(initial_match_ttl > 0);

    // Advance sequence number so TTL decays without touching the event
    let elapsed = 100_000_u32;
    env.ledger().with_mut(|l| {
        l.sequence_number += elapsed;
    });

    let decayed_event_ttl = env.as_contract(&contract_id, || {
        env.storage().persistent().get_ttl(&event_key)
    });
    let decayed_match_ttl = env.as_contract(&contract_id, || {
        env.storage().persistent().get_ttl(&match_key)
    });

    assert_eq!(decayed_event_ttl, initial_event_ttl - elapsed);
    assert_eq!(decayed_match_ttl, initial_match_ttl - elapsed);

    // Read active-event state via contract client getters
    let _ev = client.get_event(&event_id);
    let _m = client.get_match(&match_id);
    let _ev_matches = env.as_contract(&contract_id, || {
        storage::get_event_matches(&env, event_id)
    });
    let _ev_participants = client.get_event_participants(&event_id);

    // Assert that accessing active-event state extended TTL back to TTL_BUMP
    let bumped_event_ttl = env.as_contract(&contract_id, || {
        env.storage().persistent().get_ttl(&event_key)
    });
    let bumped_match_ttl = env.as_contract(&contract_id, || {
        env.storage().persistent().get_ttl(&match_key)
    });
    let bumped_matches_ttl = env.as_contract(&contract_id, || {
        env.storage().persistent().get_ttl(&matches_key)
    });
    let bumped_participants_ttl = env.as_contract(&contract_id, || {
        env.storage().persistent().get_ttl(&participants_key)
    });

    assert!(
        bumped_event_ttl >= TTL_BUMP - 10,
        "Event TTL not bumped: {}",
        bumped_event_ttl
    );
    assert!(
        bumped_match_ttl >= TTL_BUMP - 10,
        "Match TTL not bumped: {}",
        bumped_match_ttl
    );
    assert!(
        bumped_matches_ttl >= TTL_BUMP - 10,
        "EventMatches TTL not bumped: {}",
        bumped_matches_ttl
    );
    assert!(
        bumped_participants_ttl >= TTL_BUMP - 10,
        "EventParticipants TTL not bumped: {}",
        bumped_participants_ttl
    );
    assert!(bumped_event_ttl > decayed_event_ttl);
    assert!(bumped_match_ttl > decayed_match_ttl);
}

/// Test 2: Finalized/old state is allowed to expire per policy (not extended on access).
#[test]
fn test_finalized_state_not_extended_allowed_to_expire() {
    let (env, client, contract_id, _admin, ai_agent, xlm_token) = setup();
    let creator = Address::generate(&env);
    let finalizer = Address::generate(&env);

    let (event_id, _invite_code, match_id) =
        create_event_and_match(&env, &contract_id, &client, &creator, &xlm_token, 7200);

    // Advance time past match start and submit match result (match_time is start + 600 = +4200)
    env.ledger().with_mut(|l| {
        l.timestamp += 5000;
    });
    submit_match_result(&client, &ai_agent, match_id, MatchResult::TeamA);

    // Advance time past event end time to finalize (duration is 7200)
    env.ledger().with_mut(|l| {
        l.timestamp += 5000;
    });
    fund(&env, &xlm_token, &finalizer, FINALIZATION_BOND_STROOPS);
    client.finalize_event(&finalizer, &event_id);

    // Event is now finalized. Verify event.is_finalized == true
    let ev = client.get_event(&event_id);
    assert!(ev.is_finalized);

    let event_key = DataKey::Event(event_id);
    let match_key = DataKey::Match(match_id);
    let matches_key = DataKey::EventMatches(event_id);

    // Advance sequence number so TTL decays
    let elapsed = 200_000_u32;
    env.ledger().with_mut(|l| {
        l.sequence_number += elapsed;
    });

    let decayed_event_ttl = env.as_contract(&contract_id, || {
        env.storage().persistent().get_ttl(&event_key)
    });
    let decayed_match_ttl = env.as_contract(&contract_id, || {
        env.storage().persistent().get_ttl(&match_key)
    });
    let decayed_matches_ttl = env.as_contract(&contract_id, || {
        env.storage().persistent().get_ttl(&matches_key)
    });

    // Access the finalized event state
    let _ev_read = client.get_event(&event_id);
    let _m_read = client.get_match(&match_id);
    let _matches_read = env.as_contract(&contract_id, || {
        storage::get_event_matches(&env, event_id)
    });

    // Assert TTL was NOT extended and remains decayed
    let ttl_after_read = env.as_contract(&contract_id, || {
        env.storage().persistent().get_ttl(&event_key)
    });
    let match_ttl_after = env.as_contract(&contract_id, || {
        env.storage().persistent().get_ttl(&match_key)
    });
    let matches_ttl_after = env.as_contract(&contract_id, || {
        env.storage().persistent().get_ttl(&matches_key)
    });

    assert_eq!(
        ttl_after_read, decayed_event_ttl,
        "Finalized event TTL must not be extended"
    );
    assert_eq!(
        match_ttl_after, decayed_match_ttl,
        "Finalized match TTL must not be extended"
    );
    assert_eq!(
        matches_ttl_after, decayed_matches_ttl,
        "Finalized matches TTL must not be extended"
    );
}

/// Test 3: A long-running event's state survives until finalization.
///
/// Advance ledger sequence_number in steps past the default TTL horizon,
/// accessing state periodically. State must survive and finalization must succeed.
#[test]
fn test_long_running_event_survives_to_finalization() {
    let (env, client, contract_id, _admin, ai_agent, xlm_token) = setup();
    let creator = Address::generate(&env);
    let participant = Address::generate(&env);
    let finalizer = Address::generate(&env);

    // Duration of 60 days
    let event_duration = 60 * 86_400;
    let (event_id, invite_code, match_id) = create_event_and_match(
        &env,
        &contract_id,
        &client,
        &creator,
        &xlm_token,
        event_duration,
    );

    client.join_event(&participant, &invite_code);

    let event_key = DataKey::Event(event_id);
    let _match_key = DataKey::Match(match_id);

    // TTL_BUMP is 6_307_200 ledgers (~1 year).
    // We advance the sequence number in 3 steps of 2_500_000 ledgers (total 7_500_000 ledgers).
    // Total elapsed sequence (7_500_000) strictly exceeds the initial TTL (6_307_200).
    // Without TTL extension on access, persistent entries would be archived/expired.
    let step = 2_500_000_u32;
    for i in 0..3 {
        env.ledger().with_mut(|l| {
            l.sequence_number += step;
            l.timestamp += 10_000;
        });
        env.as_contract(&contract_id, || {
            env.storage().instance().extend_ttl(TTL_THRESHOLD, TTL_BUMP);
            env.storage().persistent().extend_ttl(&DataKey::Paused(false), TTL_THRESHOLD, TTL_BUMP);
            env.storage().persistent().extend_ttl(&DataKey::Initialized, TTL_THRESHOLD, TTL_BUMP);
            env.storage().persistent().extend_ttl(&DataKey::CurrentAdmin, TTL_THRESHOLD, TTL_BUMP);
            env.storage().persistent().extend_ttl(&DataKey::CurrentAIAgent, TTL_THRESHOLD, TTL_BUMP);
            env.storage().persistent().extend_ttl(&DataKey::CurrentTreasury, TTL_THRESHOLD, TTL_BUMP);
            env.storage().persistent().extend_ttl(&DataKey::CurrentXLMToken, TTL_THRESHOLD, TTL_BUMP);
            env.storage().persistent().extend_ttl(&DataKey::CreationFee(0), TTL_THRESHOLD, TTL_BUMP);
        });
        env.as_contract(&xlm_token, || {
            env.storage().instance().extend_ttl(TTL_THRESHOLD, TTL_BUMP);
        });

        // Periodic access extends active event state TTL
        let ev = client.get_event(&event_id);
        assert_eq!(ev.event_id, event_id);

        let m = client.get_match(&match_id);
        assert_eq!(m.match_id, match_id);

        let matches = env.as_contract(&contract_id, || {
            storage::get_event_matches(&env, event_id)
        });
        assert_eq!(matches.len(), 1);

        let participants = client.get_event_participants(&event_id);
        assert_eq!(participants.len(), 1);

        // Verify TTL is still alive and topped up
        let cur_ttl = env.as_contract(&contract_id, || {
            env.storage().persistent().get_ttl(&event_key)
        });
        assert!(
            cur_ttl >= TTL_BUMP - 10,
            "Step {} failed: TTL not extended to bump: {}",
            i,
            cur_ttl
        );
    }

    // Now advance timestamp past event end time to allow finalization
    env.ledger().with_mut(|l| {
        l.timestamp += event_duration + 10_000;
    });

    // Submit match result
    submit_match_result(&client, &ai_agent, match_id, MatchResult::TeamA);

    // Finalize event
    fund(&env, &xlm_token, &finalizer, FINALIZATION_BOND_STROOPS);
    let payouts = client.finalize_event(&finalizer, &event_id);
    assert_eq!(payouts.len(), 0); // Fun event (0 prize pool)

    // Verify event is finalized and its state survived
    let finalized_event = client.get_event(&event_id);
    assert!(finalized_event.is_finalized);

    let match_after = client.get_match(&match_id);
    assert!(match_after.result_submitted);
}
