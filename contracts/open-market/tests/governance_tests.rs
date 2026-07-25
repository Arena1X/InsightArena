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

/// Runs a proposal through voting, queues it (first `execute_proposal` call
/// after voting ends), then fast-forwards past the default timelock so the
/// returned id is immediately executable by a single follow-up call — keeping
/// pre-existing callers of this helper unchanged.
fn pass_proposal(
    env: &Env,
    client: &InsightArenaContractClient,
    action: &ProposalType,
    voters: &Vec<Address>,
) -> u32 {
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

// ── Timelock / veto tests ─────────────────────────────────────────────────────

/// Advances voting to completion and quorum without touching the timelock clock,
/// returning the proposal id right after voting has ended (not yet queued).
fn pass_vote_only(
    env: &Env,
    client: &InsightArenaContractClient,
    action: &ProposalType,
    voters: &Vec<Address>,
) -> u32 {
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
