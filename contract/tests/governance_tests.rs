use insightarena_contract::governance::ProposalType;
use insightarena_contract::storage_types::DataKey;
use insightarena_contract::{InsightArenaContract, InsightArenaContractClient, InsightArenaError};
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

fn seed_users(env: &Env, client: &InsightArenaContractClient, count: u32) -> Vec<Address> {
    let mut users = Vec::new(env);
    for _ in 0..count {
        let user = Address::generate(env);
        users.push_back(user);
    }
    users
}

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
    id
}

// ── Tests ──────────────────────────────────────────────────────────────────────

#[test]
fn test_governance_logic() {
    let env = Env::default();
    let (client, _) = deploy(&env);
    let voters = seed_users(&env, &client, 5);

    let id = pass_proposal(&env, &client, &ProposalType::UpdateProtocolFee(500), &voters);

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
    assert!(proposal.executed);
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
    assert!(proposal.executed);
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