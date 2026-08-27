use insightarena_contract::config::DEFAULT_TIMELOCK_DELAY;
use insightarena_contract::governance::ProposalType;

use insightarena_contract::{
    InsightArenaContract, InsightArenaContractClient, InsightArenaError, ProposalState,
};
use soroban_sdk::testutils::{Address as _, Ledger as _};
use soroban_sdk::{Address, Env, Symbol, Vec};

// ── Helpers ────────────────────────────────────────────────────────────────────

fn register_token(env: &Env) -> Address {
    let token_admin = Address::generate(env);
    env.register_stellar_asset_contract_v2(token_admin)
        .address()
}

fn deploy(env: &Env) -> (InsightArenaContractClient<'_>, Address) {
    let id = env.register(InsightArenaContract, ());
    let client = InsightArenaContractClient::new(env, &id);
    let admin = Address::generate(env);
    let oracle = Address::generate(env);
    let xlm_token = register_token(env);
    env.mock_all_auths();
    client.initialize(&admin, &oracle, &200_u32, &xlm_token);
    (client, admin)
}

fn seed_users(env: &Env, _client: &InsightArenaContractClient, count: u32) -> Vec<Address> {
    let mut users = Vec::new(env);
    for _ in 0..count {
        let user = Address::generate(env);
        users.push_back(user);
    }
    users
}

/// Registers `count` synthetic users by generating addresses and recording
/// them in the UserList persistent key so the quorum check can read them.
fn register_users(env: &Env, client: &InsightArenaContractClient, count: u32) -> Vec<Address> {
    use soroban_sdk::Vec as SorobanVec;
    let mut users: SorobanVec<Address> = SorobanVec::new(env);
    for _ in 0..count {
        users.push_back(Address::generate(env));
    }
    // Store the list directly so governance quorum math can read it.
    env.as_contract(&client.address, || {
        env.storage().persistent().set(
            &insightarena_contract::storage_types::DataKey::UserList,
            &users,
        );
    });
    users
}

/// Runs a proposal through voting, queues it (first `execute_proposal` call
/// after voting ends), then fast-forwards past the default timelock so the
/// returned id is immediately executable by a single follow-up call — keeping
/// pre-existing callers of this helper unchanged.
///
/// Registers exactly as many synthetic users in UserList as there are voters,
/// ensuring the default 10% quorum is always met (100% participation).
fn pass_proposal(
    env: &Env,
    client: &InsightArenaContractClient,
    action: &ProposalType,
    voters: &Vec<Address>,
) -> u32 {
    // Seed UserList with exactly the voters so quorum (any % of voter-sized list) is met.
    register_users(env, client, voters.len());

    let proposer = Address::generate(env);
    let duration = 3600;
    let id = client.create_proposal(&proposer, action, &duration);

    for voter in voters.iter() {
        client.vote(&voter, &id, &true);
    }

    env.ledger().with_mut(|l| l.timestamp += duration + 1);

    let queuer = Address::generate(env);
    let _ = client.try_execute_proposal(&queuer, &id);

    env.ledger().with_mut(|l| l.timestamp += DEFAULT_TIMELOCK_DELAY);
    id
}

// ── Tests ──────────────────────────────────────────────────────────────────────

#[test]
fn test_governance_logic() {
    let env = Env::default();
    let (client, _) = deploy(&env);
    let voters = seed_users(&env, &client, 5);

    let id = pass_proposal(
        &env,
        &client,
        &ProposalType::UpdateProtocolFee(500),
        &voters,
    );

    let executor = Address::generate(&env);
    client.execute_proposal(&executor, &id);

    let cfg = client.get_config();
    assert_eq!(cfg.protocol_fee_bps, 500);
}

#[test]
fn test_execute_proposal_updates_oracle() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _) = deploy(&env);
    let voters = seed_users(&env, &client, 5);

    let new_oracle = Address::generate(&env);
    let id = pass_proposal(
        &env,
        &client,
        &ProposalType::UpdateOracle(new_oracle.clone()),
        &voters,
    );

    let executor = Address::generate(&env);
    client.execute_proposal(&executor, &id);

    let cfg = client.get_config();
    assert_eq!(cfg.oracle_address, new_oracle);
}

#[test]
fn test_execute_proposal_updates_min_stake() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _) = deploy(&env);
    let voters = seed_users(&env, &client, 5);

    let new_min = 50_000_000_i128;
    let id = pass_proposal(
        &env,
        &client,
        &ProposalType::UpdateMinStake(new_min),
        &voters,
    );

    let executor = Address::generate(&env);
    client.execute_proposal(&executor, &id);

    let cfg = client.get_config();
    assert_eq!(cfg.min_stake_xlm, new_min);
}

#[test]
fn test_execute_proposal_adds_category() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _) = deploy(&env);
    let voters = seed_users(&env, &client, 5);

    let new_cat = Symbol::new(&env, "Gaming");
    let id = pass_proposal(
        &env,
        &client,
        &ProposalType::AddSupportedCategory(new_cat.clone()),
        &voters,
    );

    let executor = Address::generate(&env);
    client.execute_proposal(&executor, &id);

    let categories = client.list_categories();
    assert!(categories.contains(new_cat));
}

#[test]
fn test_execute_proposal_fails_without_quorum() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _) = deploy(&env);

    seed_users(&env, &client, 10);

    let duration = 3_600_u64;
    let proposer = Address::generate(&env);
    let id = client.create_proposal(&proposer, &ProposalType::UpdateProtocolFee(400), &duration);

    env.ledger().with_mut(|l| l.timestamp += duration + 1);

    let executor = Address::generate(&env);
    let result = client.try_execute_proposal(&executor, &id);
    assert!(result.is_err());
}

#[test]
fn test_execute_proposal_fails_before_voting_ends() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _) = deploy(&env);
    let voters = seed_users(&env, &client, 5);

    let duration = 3_600_u64;
    let proposer = Address::generate(&env);
    let id = client.create_proposal(&proposer, &ProposalType::UpdateProtocolFee(400), &duration);
    for voter in voters.iter() {
        client.vote(&voter, &id, &true);
    }

    let executor = Address::generate(&env);
    let result = client.try_execute_proposal(&executor, &id);
    assert!(result.is_err());
}

// ── Issue #570: cancel_proposal tests ─────────────────────────────────────────

#[test]
fn test_cancel_proposal_by_proposer_succeeds() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = deploy(&env);

    let proposer = Address::generate(&env);
    let duration = 3_600_u64;
    let id = client.create_proposal(&proposer, &ProposalType::UpdateProtocolFee(400), &duration);

    client.cancel_proposal(&proposer, &id);

    let proposal = client.get_proposal(&id);
    assert!(proposal.cancelled);
}

#[test]
fn test_cancel_proposal_by_admin_succeeds() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin) = deploy(&env);

    let proposer = Address::generate(&env);
    let duration = 3_600_u64;
    let id = client.create_proposal(&proposer, &ProposalType::UpdateProtocolFee(400), &duration);

    client.cancel_proposal(&admin, &id);

    let proposal = client.get_proposal(&id);
    assert!(proposal.cancelled);
}

#[test]
fn test_cancel_proposal_by_non_proposer_fails() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = deploy(&env);

    let proposer = Address::generate(&env);
    let non_proposer = Address::generate(&env);
    let duration = 3_600_u64;
    let id = client.create_proposal(&proposer, &ProposalType::UpdateProtocolFee(400), &duration);

    let result = client.try_cancel_proposal(&non_proposer, &id);
    assert!(matches!(result, Err(Ok(InsightArenaError::Unauthorized))));
}

#[test]
fn test_cancel_proposal_fails_when_paused() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, proposer) = deploy(&env);

    let duration = 3_600_u64;
    let id = client.create_proposal(&proposer, &ProposalType::UpdateProtocolFee(400), &duration);

    client.set_paused(&true, &1u32);

    let result = client.try_cancel_proposal(&proposer, &id);
    assert!(matches!(result, Err(Ok(InsightArenaError::Paused))));
}

// ── Timelock / veto tests ─────────────────────────────────────────────────────

/// Advances voting to completion and quorum without touching the timelock clock,
/// returning the proposal id right after voting has ended (not yet queued).
///
/// Registers exactly as many synthetic users in UserList as there are voters,
/// ensuring the default 10% quorum is always met (100% participation).
fn pass_vote_only(
    env: &Env,
    client: &InsightArenaContractClient,
    action: &ProposalType,
    voters: &Vec<Address>,
) -> u32 {
    // Seed UserList with exactly the voters so quorum is always met.
    register_users(env, client, voters.len());

    let proposer = Address::generate(env);
    let duration = 3_600_u64;
    let id = client.create_proposal(&proposer, action, &duration);

    for voter in voters.iter() {
        client.vote(&voter, &id, &true);
    }

    env.ledger().with_mut(|l| l.timestamp += duration + 1);
    id
}

#[test]
fn test_execute_proposal_queues_and_blocks_before_timelock() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = deploy(&env);
    let voters = seed_users(&env, &client, 5);

    let id = pass_vote_only(&env, &client, &ProposalType::UpdateProtocolFee(500), &voters);

    let executor = Address::generate(&env);

    // First call after voting ends just queues the proposal (persists ready_at);
    // it does not execute yet.
    client.execute_proposal(&executor, &id);

    let proposal = client.get_proposal(&id);
    assert!(!proposal.executed);
    assert!(proposal.ready_at.is_some());
    assert_eq!(client.get_proposal_state(&id), ProposalState::Queued);

    // Config must not have changed yet.
    assert_eq!(client.get_config().protocol_fee_bps, 200);

    // A second call before ready_at errors with the typed timelock error.
    let result = client.try_execute_proposal(&executor, &id);
    assert!(matches!(
        result,
        Err(Ok(InsightArenaError::TimelockNotElapsed))
    ));

    // Still too early one second before ready_at.
    let ready_at = proposal.ready_at.unwrap();
    env.ledger().with_mut(|l| l.timestamp = ready_at - 1);
    let result = client.try_execute_proposal(&executor, &id);
    assert!(matches!(
        result,
        Err(Ok(InsightArenaError::TimelockNotElapsed))
    ));
}

#[test]
fn test_execute_proposal_succeeds_at_ready_at_boundary() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = deploy(&env);
    let voters = seed_users(&env, &client, 5);

    let id = pass_vote_only(&env, &client, &ProposalType::UpdateProtocolFee(500), &voters);

    let executor = Address::generate(&env);
    let _ = client.try_execute_proposal(&executor, &id); // queue
    let ready_at = client.get_proposal(&id).ready_at.unwrap();

    // Exactly at ready_at succeeds.
    env.ledger().with_mut(|l| l.timestamp = ready_at);
    client.execute_proposal(&executor, &id);

    let proposal = client.get_proposal(&id);
    assert!(proposal.executed);
    assert_eq!(client.get_proposal_state(&id), ProposalState::Executed);
    assert_eq!(client.get_config().protocol_fee_bps, 500);
}

#[test]
fn test_veto_proposal_cancels_before_execution() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin) = deploy(&env);
    let voters = seed_users(&env, &client, 5);

    let id = pass_vote_only(&env, &client, &ProposalType::UpdateProtocolFee(500), &voters);

    let executor = Address::generate(&env);
    let _ = client.try_execute_proposal(&executor, &id); // queue

    // Default guardian is the admin.
    client.veto_proposal(&admin, &id);

    let proposal = client.get_proposal(&id);
    assert!(proposal.vetoed);
    assert_eq!(client.get_proposal_state(&id), ProposalState::Vetoed);

    // Execution after veto errors even once the timelock has elapsed.
    let ready_at = proposal.ready_at.unwrap();
    env.ledger().with_mut(|l| l.timestamp = ready_at);
    let result = client.try_execute_proposal(&executor, &id);
    assert!(result.is_err());

    // The change never applied.
    assert_eq!(client.get_config().protocol_fee_bps, 200);
}

#[test]
fn test_veto_proposal_after_execution_fails() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin) = deploy(&env);
    let voters = seed_users(&env, &client, 5);

    let id = pass_proposal(&env, &client, &ProposalType::UpdateProtocolFee(500), &voters);
    let executor = Address::generate(&env);
    client.execute_proposal(&executor, &id);

    let result = client.try_veto_proposal(&admin, &id);
    assert!(matches!(result, Err(Ok(InsightArenaError::InvalidInput))));
}

#[test]
fn test_veto_proposal_before_queued_fails() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin) = deploy(&env);

    let proposer = Address::generate(&env);
    let duration = 3_600_u64;
    let id = client.create_proposal(&proposer, &ProposalType::UpdateProtocolFee(500), &duration);

    // Still in the voting window — never queued.
    let result = client.try_veto_proposal(&admin, &id);
    assert!(matches!(result, Err(Ok(InsightArenaError::InvalidInput))));
}

#[test]
fn test_veto_proposal_unauthorized_fails() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = deploy(&env);
    let voters = seed_users(&env, &client, 5);

    let id = pass_vote_only(&env, &client, &ProposalType::UpdateProtocolFee(500), &voters);
    let executor = Address::generate(&env);
    let _ = client.try_execute_proposal(&executor, &id); // queue

    let not_guardian = Address::generate(&env);
    let result = client.try_veto_proposal(&not_guardian, &id);
    assert!(matches!(result, Err(Ok(InsightArenaError::Unauthorized))));
}

#[test]
fn test_set_guardian_allows_new_guardian_to_veto() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin) = deploy(&env);
    let voters = seed_users(&env, &client, 5);

    let new_guardian = Address::generate(&env);
    client.set_guardian(&admin, &new_guardian);

    let id = pass_vote_only(&env, &client, &ProposalType::UpdateProtocolFee(500), &voters);
    let executor = Address::generate(&env);
    let _ = client.try_execute_proposal(&executor, &id); // queue

    // The old admin/guardian can no longer veto.
    let result = client.try_veto_proposal(&admin, &id);
    assert!(matches!(result, Err(Ok(InsightArenaError::Unauthorized))));

    client.veto_proposal(&new_guardian, &id);
    assert!(client.get_proposal(&id).vetoed);
}

#[test]
fn test_set_timelock_delay_changes_ready_at() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin) = deploy(&env);
    let voters = seed_users(&env, &client, 5);

    let short_delay = 10_u64;
    client.set_timelock_delay(&admin, &short_delay);

    let id = pass_vote_only(&env, &client, &ProposalType::UpdateProtocolFee(500), &voters);
    let queued_at = env.ledger().timestamp();
    let executor = Address::generate(&env);
    let _ = client.try_execute_proposal(&executor, &id); // queue

    let proposal = client.get_proposal(&id);
    assert_eq!(proposal.ready_at, Some(queued_at + short_delay));
}

#[test]
fn test_set_timelock_delay_requires_admin() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = deploy(&env);

    let not_admin = Address::generate(&env);
    let result = client.try_set_timelock_delay(&not_admin, &10_u64);
    assert!(matches!(result, Err(Ok(InsightArenaError::Unauthorized))));
}

#[test]
fn test_set_guardian_requires_admin() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = deploy(&env);

    let not_admin = Address::generate(&env);
    let new_guardian = Address::generate(&env);
    let result = client.try_set_guardian(&not_admin, &new_guardian);
    assert!(matches!(result, Err(Ok(InsightArenaError::Unauthorized))));
}

// ── Issue #1331: Quorum & Timelock tests ──────────────────────────────────────

// ── AC1: Proposals below quorum cannot pass ───────────────────────────────────

#[test]
fn test_quorum_failure_returns_invalid_input() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = deploy(&env);

    // Register 20 users — default quorum is 10% = 2 needed votes.
    register_users(&env, &client, 20);

    let duration = 3_600_u64;
    let proposer = Address::generate(&env);
    let id = client.create_proposal(&proposer, &ProposalType::UpdateProtocolFee(400), &duration);

    // Cast only 1 vote (below 10% of 20 = 2).
    let lone_voter = Address::generate(&env);
    client.vote(&lone_voter, &id, &true);

    env.ledger().with_mut(|l| l.timestamp += duration + 1);

    let executor = Address::generate(&env);
    let result = client.try_execute_proposal(&executor, &id);
    // Issue #1678: a quorum failure is distinguished from a majority failure
    // via a distinct error code (InvalidInput vs. Unauthorized) rather than
    // proposal state, since a call returning Err reverts every write it made.
    assert!(
        matches!(result, Err(Ok(InsightArenaError::InvalidInput))),
        "expected InvalidInput when votes < quorum, got {:?}",
        result
    );
}

#[test]
fn test_zero_votes_with_registered_users_fails_quorum() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = deploy(&env);

    // Register 10 users but cast zero votes.
    register_users(&env, &client, 10);

    let duration = 3_600_u64;
    let proposer = Address::generate(&env);
    let id = client.create_proposal(&proposer, &ProposalType::UpdateProtocolFee(400), &duration);

    env.ledger().with_mut(|l| l.timestamp += duration + 1);

    let executor = Address::generate(&env);
    let result = client.try_execute_proposal(&executor, &id);
    assert!(
        matches!(result, Err(Ok(InsightArenaError::InvalidInput))),
        "expected InvalidInput when no votes cast, got {:?}",
        result
    );
}

#[test]
fn test_majority_without_quorum_fails() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = deploy(&env);

    // Register 100 users. Quorum requires 10% = 10 votes.
    register_users(&env, &client, 100);

    let duration = 3_600_u64;
    let proposer = Address::generate(&env);
    let id = client.create_proposal(&proposer, &ProposalType::UpdateProtocolFee(400), &duration);

    // Cast only 5 "yes" votes (majority but below quorum).
    for _ in 0..5 {
        let voter = Address::generate(&env);
        client.vote(&voter, &id, &true);
    }

    env.ledger().with_mut(|l| l.timestamp += duration + 1);

    let executor = Address::generate(&env);
    let result = client.try_execute_proposal(&executor, &id);
    // Turnout (5%) is below the 10% quorum, so this fails as a quorum
    // failure (InvalidInput), not a majority failure — the majority-yes
    // vote never gets evaluated because quorum is checked first.
    assert!(
        matches!(result, Err(Ok(InsightArenaError::InvalidInput))),
        "majority alone (without quorum) must not pass"
    );
}

// ── AC2: Execution reverts before timelock elapses ────────────────────────────

#[test]
fn test_timelock_blocks_execution_until_ready_at() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin) = deploy(&env);

    // Set quorum to 0 so any vote count passes quorum, independent of UserList.
    client.set_governance_quorum_bps(&admin, &0_u32);

    let voters = seed_users(&env, &client, 5);
    let id = pass_vote_only(&env, &client, &ProposalType::UpdateProtocolFee(500), &voters);

    let executor = Address::generate(&env);
    // Queue the proposal (first call after voting ends).
    client.execute_proposal(&executor, &id);

    let proposal = client.get_proposal(&id);
    let ready_at = proposal.ready_at.expect("ready_at must be set after queuing");
    assert_eq!(
        client.get_proposal_state(&id),
        ProposalState::Queued,
        "state must be Queued after first execute call"
    );

    // One second before ready — must still block.
    env.ledger().with_mut(|l| l.timestamp = ready_at - 1);
    let result = client.try_execute_proposal(&executor, &id);
    assert!(
        matches!(result, Err(Ok(InsightArenaError::TimelockNotElapsed))),
        "expected TimelockNotElapsed one second before ready_at"
    );

    // Exactly at ready_at — must succeed.
    env.ledger().with_mut(|l| l.timestamp = ready_at);
    client.execute_proposal(&executor, &id);
    assert!(client.get_proposal(&id).executed, "must be executed at ready_at");
}

// ── AC3: Quorum and timelock are governance-configurable and validated ─────────

#[test]
fn test_admin_set_quorum_bps_persists() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin) = deploy(&env);

    // Default should be 1000 (10%).
    assert_eq!(client.get_config().governance_quorum_bps, 1000);

    client.set_governance_quorum_bps(&admin, &2000_u32);
    assert_eq!(client.get_config().governance_quorum_bps, 2000);
}

#[test]
fn test_set_quorum_bps_requires_admin() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = deploy(&env);

    let not_admin = Address::generate(&env);
    let result = client.try_set_governance_quorum_bps(&not_admin, &500_u32);
    assert!(
        matches!(result, Err(Ok(InsightArenaError::Unauthorized))),
        "non-admin must not set governance quorum"
    );
}

#[test]
fn test_set_quorum_bps_rejects_over_10000() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin) = deploy(&env);

    let result = client.try_set_governance_quorum_bps(&admin, &10_001_u32);
    assert!(
        matches!(result, Err(Ok(InsightArenaError::InvalidInput))),
        "quorum > 10000 bps must be rejected"
    );
}

#[test]
fn test_set_quorum_bps_zero_allows_always_pass() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin) = deploy(&env);

    // Set quorum to 0 — even zero votes satisfies quorum.
    client.set_governance_quorum_bps(&admin, &0_u32);
    assert_eq!(client.get_config().governance_quorum_bps, 0);

    // Use a single voter; since quorum=0, any positive vote count passes.
    let voters = seed_users(&env, &client, 1);
    let id = pass_vote_only(&env, &client, &ProposalType::UpdateProtocolFee(300), &voters);

    let executor = Address::generate(&env);
    // Queue — should succeed since quorum=0 is always met.
    client.execute_proposal(&executor, &id);
    assert!(
        client.get_proposal(&id).ready_at.is_some(),
        "proposal must be queued when quorum_bps=0"
    );
}

#[test]
fn test_higher_quorum_bps_rejects_borderline_participation() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin) = deploy(&env);

    // Raise quorum to 50%.
    client.set_governance_quorum_bps(&admin, &5000_u32);

    // Register 10 users, cast only 4 votes (40% < 50%).
    register_users(&env, &client, 10);

    let duration = 3_600_u64;
    let proposer = Address::generate(&env);
    let id = client.create_proposal(&proposer, &ProposalType::UpdateProtocolFee(400), &duration);

    for _ in 0..4 {
        let voter = Address::generate(&env);
        client.vote(&voter, &id, &true);
    }

    env.ledger().with_mut(|l| l.timestamp += duration + 1);

    let executor = Address::generate(&env);
    let result = client.try_execute_proposal(&executor, &id);
    assert!(
        matches!(result, Err(Ok(InsightArenaError::InvalidInput))),
        "40% participation should fail a 50% quorum requirement"
    );
}

#[test]
fn test_higher_quorum_bps_accepts_sufficient_participation() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin) = deploy(&env);

    // Raise quorum to 50%.
    client.set_governance_quorum_bps(&admin, &5000_u32);

    // Register 10 users, cast 5 yes votes (exactly 50% = meets quorum).
    register_users(&env, &client, 10);

    let duration = 3_600_u64;
    let proposer = Address::generate(&env);
    let id = client.create_proposal(&proposer, &ProposalType::UpdateProtocolFee(400), &duration);

    for _ in 0..5 {
        let voter = Address::generate(&env);
        client.vote(&voter, &id, &true);
    }

    env.ledger().with_mut(|l| l.timestamp += duration + 1);

    let executor = Address::generate(&env);
    // Queue (first call) — must succeed since 50% participation meets 50% quorum.
    client.execute_proposal(&executor, &id);
    assert!(
        client.get_proposal(&id).ready_at.is_some(),
        "exactly 50% participation must pass a 50% quorum threshold"
    );
}

// ── AC3: UpdateQuorum governance proposal ─────────────────────────────────────

#[test]
fn test_update_quorum_proposal_changes_config() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin) = deploy(&env);

    // Start with quorum=0 so the proposal itself can pass with any vote count.
    client.set_governance_quorum_bps(&admin, &0_u32);

    let voters = seed_users(&env, &client, 3);
    let new_quorum: u32 = 2500; // raise to 25%
    let id = pass_proposal(
        &env,
        &client,
        &ProposalType::UpdateQuorum(new_quorum),
        &voters,
    );

    let executor = Address::generate(&env);
    client.execute_proposal(&executor, &id);

    assert_eq!(
        client.get_config().governance_quorum_bps,
        new_quorum,
        "UpdateQuorum proposal must update Config::governance_quorum_bps"
    );
}

#[test]
fn test_update_quorum_proposal_rejects_invalid_bps() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin) = deploy(&env);

    // Set quorum=0 so the proposal can pass with minimal votes.
    client.set_governance_quorum_bps(&admin, &0_u32);

    let voters = seed_users(&env, &client, 3);
    // 10_001 bps > 10_000 is invalid.
    let id = pass_proposal(
        &env,
        &client,
        &ProposalType::UpdateQuorum(10_001),
        &voters,
    );

    let executor = Address::generate(&env);
    let result = client.try_execute_proposal(&executor, &id);
    assert!(
        result.is_err(),
        "UpdateQuorum(10_001) must fail with InvalidInput at execution time"
    );
    // Quorum must remain unchanged.
    assert_eq!(client.get_config().governance_quorum_bps, 0);
}

// ── AC4: Executable state and executed events ─────────────────────────────────

#[test]
fn test_proposal_state_transitions_voting_queued_executable_executed() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin) = deploy(&env);
    client.set_governance_quorum_bps(&admin, &0_u32);

    let voters = seed_users(&env, &client, 3);
    let id = pass_vote_only(&env, &client, &ProposalType::UpdateProtocolFee(400), &voters);

    // Voting state.
    // Note: pass_vote_only already advances past voting_end, so state is no longer "Voting"
    // immediately after — but we can verify intermediate by checking before the timestamp advance.
    // Instead verify post-advance but pre-queue:
    let state = client.get_proposal_state(&id);
    // After voting_end, before queuing, it's still "Voting" enum value but time is past.
    // The contract uses ready_at to determine Queued; at this point ready_at = None.
    // Per get_proposal_state: None ready_at → Voting.
    assert_eq!(state, ProposalState::Voting, "before first execute call, state is Voting");

    let executor = Address::generate(&env);
    // First execute call: queue.
    client.execute_proposal(&executor, &id);
    assert_eq!(client.get_proposal_state(&id), ProposalState::Queued);

    let ready_at = client.get_proposal(&id).ready_at.unwrap();

    // One second before: still Queued.
    env.ledger().with_mut(|l| l.timestamp = ready_at - 1);
    assert_eq!(client.get_proposal_state(&id), ProposalState::Queued);

    // Exactly at ready_at: Executable.
    env.ledger().with_mut(|l| l.timestamp = ready_at);
    assert_eq!(client.get_proposal_state(&id), ProposalState::Executable);

    // Execute: Executed.
    client.execute_proposal(&executor, &id);
    assert_eq!(client.get_proposal_state(&id), ProposalState::Executed);
    assert!(client.get_proposal(&id).executed);
}

// ── AC5: Full end-to-end successful execution ─────────────────────────────────

#[test]
fn test_full_governance_lifecycle_quorum_timelock_execute() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin) = deploy(&env);

    // Set quorum to 20% — we will register 10 users and cast 3 votes (30% > 20%).
    client.set_governance_quorum_bps(&admin, &2000_u32);
    register_users(&env, &client, 10);

    let duration = 3_600_u64;
    let proposer = Address::generate(&env);
    let id = client.create_proposal(&proposer, &ProposalType::UpdateProtocolFee(350), &duration);

    // Cast 3 yes votes (30% of 10 registered users ≥ 20% quorum).
    for _ in 0..3 {
        let voter = Address::generate(&env);
        client.vote(&voter, &id, &true);
    }

    // Advance past voting window.
    env.ledger().with_mut(|l| l.timestamp += duration + 1);

    let executor = Address::generate(&env);

    // Step 1: Queue.
    client.execute_proposal(&executor, &id);
    assert_eq!(client.get_proposal_state(&id), ProposalState::Queued);
    assert_eq!(client.get_config().protocol_fee_bps, 200, "must not apply yet");

    // Step 2: Try before timelock (must fail).
    let result = client.try_execute_proposal(&executor, &id);
    assert!(
        matches!(result, Err(Ok(InsightArenaError::TimelockNotElapsed))),
        "must block before timelock"
    );

    // Step 3: Fast-forward past timelock.
    let ready_at = client.get_proposal(&id).ready_at.unwrap();
    env.ledger().with_mut(|l| l.timestamp = ready_at);
    assert_eq!(client.get_proposal_state(&id), ProposalState::Executable);

    // Step 4: Execute.
    client.execute_proposal(&executor, &id);
    assert_eq!(client.get_proposal_state(&id), ProposalState::Executed);
    assert_eq!(
        client.get_config().protocol_fee_bps,
        350,
        "fee must be updated after execution"
    );
}

// ── Issue #1678: Distinguish quorum-fail from vote-fail ───────────────────────
//
// `execute_proposal` cannot record which failure occurred in `Proposal` state:
// a Soroban call that returns `Err` reverts every write it made, so nothing
// persisted on the failing path would survive. The distinction is therefore
// made via the returned error instead (see `governance::execute_proposal`'s
// doc comment): `InvalidInput` for a quorum failure, `Unauthorized` for a
// majority failure once quorum is met.

#[test]
fn test_majority_failure_returns_unauthorized_when_quorum_met() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin) = deploy(&env);

    // Quorum set to 0 so only the majority check can fail.
    client.set_governance_quorum_bps(&admin, &0_u32);

    let duration = 3_600_u64;
    let proposer = Address::generate(&env);
    let id = client.create_proposal(&proposer, &ProposalType::UpdateProtocolFee(400), &duration);

    let voter_for = Address::generate(&env);
    let voter_against = Address::generate(&env);
    client.vote(&voter_for, &id, &true);
    client.vote(&voter_against, &id, &false);
    // Tie: votes_for (1) <= votes_against (1) fails majority, though quorum
    // (0 bps) is trivially met.

    env.ledger().with_mut(|l| l.timestamp += duration + 1);

    let executor = Address::generate(&env);
    let result = client.try_execute_proposal(&executor, &id);
    assert!(
        matches!(result, Err(Ok(InsightArenaError::Unauthorized))),
        "a majority failure with quorum met must return Unauthorized, got {:?}",
        result
    );
}

#[test]
fn test_quorum_fail_and_majority_fail_return_different_errors() {
    let env = Env::default();
    env.mock_all_auths();
    let duration = 3_600_u64;

    // Below-quorum proposal: 1 vote cast against 20 registered users (10%
    // quorum requires 2).
    let (client_a, _admin_a) = deploy(&env);
    register_users(&env, &client_a, 20);
    let proposer_a = Address::generate(&env);
    let id_a =
        client_a.create_proposal(&proposer_a, &ProposalType::UpdateProtocolFee(400), &duration);
    let lone_voter = Address::generate(&env);
    client_a.vote(&lone_voter, &id_a, &true);
    env.ledger().with_mut(|l| l.timestamp += duration + 1);
    let executor_a = Address::generate(&env);
    let result_a = client_a.try_execute_proposal(&executor_a, &id_a);

    // Quorum met (0 bps), but the vote itself is a tie.
    let (client_b, admin_b) = deploy(&env);
    client_b.set_governance_quorum_bps(&admin_b, &0_u32);
    let proposer_b = Address::generate(&env);
    let id_b =
        client_b.create_proposal(&proposer_b, &ProposalType::UpdateProtocolFee(400), &duration);
    let voter_for = Address::generate(&env);
    let voter_against = Address::generate(&env);
    client_b.vote(&voter_for, &id_b, &true);
    client_b.vote(&voter_against, &id_b, &false);
    env.ledger().with_mut(|l| l.timestamp += duration + 1);
    let executor_b = Address::generate(&env);
    let result_b = client_b.try_execute_proposal(&executor_b, &id_b);

    assert!(matches!(result_a, Err(Ok(InsightArenaError::InvalidInput))));
    assert!(matches!(result_b, Err(Ok(InsightArenaError::Unauthorized))));
    assert_ne!(
        result_a, result_b,
        "quorum failure and majority failure must be distinguishable errors"
    );
}
