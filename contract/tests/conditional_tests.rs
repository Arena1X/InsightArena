#![cfg(test)]

use insightarena_contract::market::CreateMarketParams;
use insightarena_contract::storage_types::{ConditionalMarket, DataKey, Market};
use insightarena_contract::{InsightArenaContract, InsightArenaContractClient, InsightArenaError};
use soroban_sdk::testutils::{Address as _, Ledger};
use soroban_sdk::{symbol_short, vec, Address, Env, String, Symbol};

fn register_token(env: &Env) -> Address {
    let token_admin = Address::generate(env);
    env.register_stellar_asset_contract_v2(token_admin)
        .address()
}

fn deploy(env: &Env) -> InsightArenaContractClient<'_> {
    let id = env.register(InsightArenaContract, ());
    let client = InsightArenaContractClient::new(env, &id);
    let admin = Address::generate(env);
    let oracle = Address::generate(env);
    let xlm_token = register_token(env);
    env.mock_all_auths();
    client.initialize(&admin, &oracle, &200_u32, &xlm_token);
    client
}

fn deploy_with_admin_and_oracle(env: &Env) -> (InsightArenaContractClient<'_>, Address, Address) {
    let id = env.register(InsightArenaContract, ());
    let client = InsightArenaContractClient::new(env, &id);
    let admin = Address::generate(env);
    let oracle = Address::generate(env);
    let xlm_token = register_token(env);
    env.mock_all_auths();
    client.initialize(&admin, &oracle, &200_u32, &xlm_token);
    (client, admin, oracle)
}

fn read_market(env: &Env, client: &InsightArenaContractClient<'_>, market_id: u64) -> Market {
    let contract_id = client.address.clone();
    env.as_contract(&contract_id, || {
        env.storage()
            .persistent()
            .get(&DataKey::Market(market_id))
            .unwrap()
    })
}

fn read_conditional(
    env: &Env,
    client: &InsightArenaContractClient<'_>,
    market_id: u64,
) -> ConditionalMarket {
    let contract_id = client.address.clone();
    env.as_contract(&contract_id, || {
        env.storage()
            .persistent()
            .get(&DataKey::ConditionalMarket(market_id))
            .unwrap()
    })
}

fn set_timestamp(env: &Env, timestamp: u64) {
    env.ledger().with_mut(|l| l.timestamp = timestamp);
}

fn deploy_with_oracle(env: &Env) -> (InsightArenaContractClient<'_>, Address) {
    let id = env.register(InsightArenaContract, ());
    let client = InsightArenaContractClient::new(env, &id);
    let admin = Address::generate(env);
    let oracle = Address::generate(env);
    let xlm_token = register_token(env);
    env.mock_all_auths();
    client.initialize(&admin, &oracle, &200_u32, &xlm_token);
    (client, oracle)
}

fn default_params(env: &Env) -> CreateMarketParams {
    let now = env.ledger().timestamp();
    CreateMarketParams {
        title: String::from_str(env, "Will it rain?"),
        description: String::from_str(env, "Daily weather market"),
        category: Symbol::new(env, "Sports"),
        outcomes: vec![env, symbol_short!("yes"), symbol_short!("no")],
        end_time: now + 1000,
        resolution_time: now + 2000,
        dispute_window: 86_400,
        creator_fee_bps: 100,
        min_stake: 10_000_000,
        max_stake: 100_000_000,
        is_public: true,
    }
}

fn conditional_params(
    env: &Env,
    client: &InsightArenaContractClient<'_>,
    parent_market_id: u64,
) -> CreateMarketParams {
    let parent = read_market(env, client, parent_market_id);
    CreateMarketParams {
        title: String::from_str(env, "Conditional market"),
        description: String::from_str(env, "Child market"),
        category: Symbol::new(env, "Sports"),
        outcomes: vec![env, symbol_short!("yes"), symbol_short!("no")],
        end_time: parent.resolution_time + 1000,
        resolution_time: parent.resolution_time + 2000,
        dispute_window: 86_400,
        creator_fee_bps: 100,
        min_stake: 10_000_000,
        max_stake: 100_000_000,
        is_public: true,
    }
}

#[test]
fn test_create_conditional_market_invalid_parent_fails() {
    let env = Env::default();
    env.mock_all_auths();
    let client = deploy(&env);
    let creator = Address::generate(&env);

    let required_outcome = symbol_short!("yes");

    let result = client.try_create_conditional_market(
        &creator,
        &999_u64, // Invalid parent
        &required_outcome,
        &default_params(&env),
    );

    assert!(matches!(result, Err(Ok(InsightArenaError::MarketNotFound))));
}

#[test]
fn test_create_conditional_market_resolved_parent_fails() {
    let env = Env::default();
    env.mock_all_auths();
    let client = deploy(&env);
    let creator = Address::generate(&env);

    // Create parent market
    let parent_id = client.create_market(&creator, &default_params(&env));

    // Force parent market to be resolved
    let contract_id = client.address.clone();
    let mut market: Market = env.as_contract(&contract_id, || {
        env.storage()
            .persistent()
            .get(&DataKey::Market(parent_id))
            .unwrap()
    });
    market.is_resolved = true;
    env.as_contract(&contract_id, || {
        env.storage()
            .persistent()
            .set(&DataKey::Market(parent_id), &market);
    });

    let required_outcome = symbol_short!("yes");

    let result = client.try_create_conditional_market(
        &creator,
        &parent_id,
        &required_outcome,
        &conditional_params(&env, &client, parent_id),
    );

    assert!(matches!(result, Err(Ok(InsightArenaError::MarketExpired))));
}

#[test]
fn test_create_conditional_market_invalid_outcome_fails() {
    let env = Env::default();
    env.mock_all_auths();
    let client = deploy(&env);
    let creator = Address::generate(&env);

    // Create parent market (outcomes are yes, no)
    let parent_id = client.create_market(&creator, &default_params(&env));

    // invalid outcome
    let required_outcome = symbol_short!("maybe");

    let result = client.try_create_conditional_market(
        &creator,
        &parent_id,
        &required_outcome,
        &conditional_params(&env, &client, parent_id),
    );

    assert!(matches!(result, Err(Ok(InsightArenaError::InvalidOutcome))));
}

#[test]
fn test_validate_conditional_params_invalid_outcome_fails() {
    let env = Env::default();
    env.mock_all_auths();
    let client = deploy(&env);
    let creator = Address::generate(&env);

    let parent_id = client.create_market(&creator, &default_params(&env));
    let result = client.try_create_conditional_market(
        &creator,
        &parent_id,
        &symbol_short!("maybe"),
        &conditional_params(&env, &client, parent_id),
    );

    assert!(matches!(result, Err(Ok(InsightArenaError::InvalidOutcome))));
}

#[test]
fn test_validate_conditional_params_resolved_parent_fails() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, oracle) = deploy_with_oracle(&env);
    let creator = Address::generate(&env);

    let parent_id = client.create_market(&creator, &default_params(&env));
    set_timestamp(&env, 3000);
    client.resolve_market(&oracle, &parent_id, &symbol_short!("yes"));

    let result = client.try_create_conditional_market(
        &creator,
        &parent_id,
        &symbol_short!("yes"),
        &conditional_params(&env, &client, parent_id),
    );

    assert!(matches!(result, Err(Ok(InsightArenaError::MarketExpired))));
}

#[test]
fn test_validate_conditional_params_valid_passes() {
    let env = Env::default();
    env.mock_all_auths();
    let client = deploy(&env);
    let creator = Address::generate(&env);

    let parent_id = client.create_market(&creator, &default_params(&env));
    let child_id = client.create_conditional_market(
        &creator,
        &parent_id,
        &symbol_short!("yes"),
        &conditional_params(&env, &client, parent_id),
    );

    assert!(child_id > parent_id);
}

#[test]
fn test_no_circular_dependency_direct_loop_rejected() {
    let env = Env::default();
    env.mock_all_auths();
    let client = deploy(&env);
    let creator = Address::generate(&env);

    let parent_id = client.create_market(&creator, &default_params(&env));
    let new_market_id = client.get_market_count() + 1;
    let contract_id = client.address.clone();

    env.as_contract(&contract_id, || {
        env.storage()
            .persistent()
            .set(&DataKey::ConditionalParent(parent_id), &new_market_id);
    });

    let result = client.try_create_conditional_market(
        &creator,
        &parent_id,
        &symbol_short!("yes"),
        &conditional_params(&env, &client, parent_id),
    );

    assert!(matches!(
        result,
        Err(Ok(InsightArenaError::ConditionalDepthExceeded))
    ));
}

#[test]
fn test_no_circular_dependency_indirect_loop_rejected() {
    let env = Env::default();
    env.mock_all_auths();
    let client = deploy(&env);
    let creator = Address::generate(&env);

    let root_id = client.create_market(&creator, &default_params(&env));
    let mid_id = client.create_conditional_market(
        &creator,
        &root_id,
        &symbol_short!("yes"),
        &conditional_params(&env, &client, root_id),
    );

    let new_market_id = client.get_market_count() + 1;
    let contract_id = client.address.clone();

    env.as_contract(&contract_id, || {
        env.storage()
            .persistent()
            .set(&DataKey::ConditionalParent(root_id), &mid_id);
        env.storage()
            .persistent()
            .set(&DataKey::ConditionalParent(mid_id), &new_market_id);
    });

    let result = client.try_create_conditional_market(
        &creator,
        &root_id,
        &symbol_short!("yes"),
        &conditional_params(&env, &client, root_id),
    );

    assert!(matches!(
        result,
        Err(Ok(InsightArenaError::ConditionalDepthExceeded))
    ));
}

#[test]
fn test_no_circular_dependency_valid_chain_passes() {
    let env = Env::default();
    env.mock_all_auths();
    let client = deploy(&env);
    let creator = Address::generate(&env);

    let root_id = client.create_market(&creator, &default_params(&env));
    let child_id = client.create_conditional_market(
        &creator,
        &root_id,
        &symbol_short!("yes"),
        &conditional_params(&env, &client, root_id),
    );

    let result = client.try_create_conditional_market(
        &creator,
        &child_id,
        &symbol_short!("yes"),
        &conditional_params(&env, &client, child_id),
    );

    assert!(result.is_ok());
}

#[test]
fn test_create_conditional_market_exceeds_depth_fails() {
    let env = Env::default();
    env.mock_all_auths();
    let client = deploy(&env);
    let creator = Address::generate(&env);

    let required_outcome = symbol_short!("yes");

    // Create root parent
    let mut parent_id = client.create_market(&creator, &default_params(&env));

    // Depth limits MAX_CONDITIONAL_DEPTH = 5
    // creating 5 nested conditionals should be okay (depths 2, 3, 4, 5, wait, MAX=5, so 4 creations from root)
    // Root is depth 0. The first conditional is depth 1.
    // Wait, the logic sets conditional to `depth = parent_cond.conditional_depth + 1`. If no parent_cond, depth = 1.
    // So root is not a conditional market. The first conditional is depth 1.
    // So 5 nested:
    for _ in 0..5 {
        parent_id = client.create_conditional_market(
            &creator,
            &parent_id,
            &required_outcome,
            &conditional_params(&env, &client, parent_id),
        );
    }

    // Now depth is 5. Another creation should fail with ConditionalDepthExceeded
    let result = client.try_create_conditional_market(
        &creator,
        &parent_id,
        &required_outcome,
        &conditional_params(&env, &client, parent_id),
    );

    assert!(matches!(
        result,
        Err(Ok(InsightArenaError::ConditionalDepthExceeded))
    ));
}

#[test]
fn test_get_conditional_markets_returns_empty_for_no_children() {
    let env = Env::default();
    env.mock_all_auths();
    let client = deploy(&env);
    let creator = Address::generate(&env);

    // Create a parent market with no children
    let parent_id = client.create_market(&creator, &default_params(&env));

    // Query for children - should return empty vector
    let children = client.get_conditional_markets(&parent_id);

    assert_eq!(children.len(), 0);
}

#[test]
fn test_get_conditional_markets_returns_all_children() {
    let env = Env::default();
    env.mock_all_auths();
    let client = deploy(&env);
    let creator = Address::generate(&env);

    // Create a parent market
    let parent_id = client.create_market(&creator, &default_params(&env));

    // Create multiple conditional markets as children
    let child1_id = client.create_conditional_market(
        &creator,
        &parent_id,
        &symbol_short!("yes"),
        &conditional_params(&env, &client, parent_id),
    );

    let child2_id = client.create_conditional_market(
        &creator,
        &parent_id,
        &symbol_short!("no"),
        &conditional_params(&env, &client, parent_id),
    );

    let child3_id = client.create_conditional_market(
        &creator,
        &parent_id,
        &symbol_short!("yes"),
        &conditional_params(&env, &client, parent_id),
    );

    // Query for children
    let children = client.get_conditional_markets(&parent_id);

    // Should return all 3 children
    assert_eq!(children.len(), 3);

    // Verify the market IDs are correct
    let child_ids: Vec<u64> = children.iter().map(|c| c.market_id).collect();
    assert!(child_ids.contains(&child1_id));
    assert!(child_ids.contains(&child2_id));
    assert!(child_ids.contains(&child3_id));

    // Verify all have the correct parent
    for child in children.iter() {
        assert_eq!(child.parent_market_id, parent_id);
    }
}

#[test]
fn test_get_conditional_markets_returns_correct_required_outcome() {
    let env = Env::default();
    env.mock_all_auths();
    let client = deploy(&env);
    let creator = Address::generate(&env);

    // Create a parent market
    let parent_id = client.create_market(&creator, &default_params(&env));

    // Create conditional markets with different required outcomes
    let _child1_id = client.create_conditional_market(
        &creator,
        &parent_id,
        &symbol_short!("yes"),
        &conditional_params(&env, &client, parent_id),
    );

    let _child2_id = client.create_conditional_market(
        &creator,
        &parent_id,
        &symbol_short!("no"),
        &conditional_params(&env, &client, parent_id),
    );

    // Query for children
    let children = client.get_conditional_markets(&parent_id);

    assert_eq!(children.len(), 2);

    // Find the child with "yes" outcome
    let yes_child = children
        .iter()
        .find(|c| c.required_outcome == symbol_short!("yes"))
        .expect("Should find child with 'yes' outcome");
    assert_eq!(yes_child.required_outcome, symbol_short!("yes"));
    assert_eq!(yes_child.parent_market_id, parent_id);

    // Find the child with "no" outcome
    let no_child = children
        .iter()
        .find(|c| c.required_outcome == symbol_short!("no"))
        .expect("Should find child with 'no' outcome");
    assert_eq!(no_child.required_outcome, symbol_short!("no"));
    assert_eq!(no_child.parent_market_id, parent_id);
}

// ── Issue #552: Conditional Activation Tests ──────────────────────────────────

#[test]
fn test_conditional_market_activates_on_parent_resolution() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, oracle) = deploy_with_oracle(&env);
    let creator = Address::generate(&env);

    let parent_id = client.create_market(&creator, &default_params(&env));
    let child_id = client.create_conditional_market(
        &creator,
        &parent_id,
        &symbol_short!("yes"),
        &conditional_params(&env, &client, parent_id),
    );

    // Advance past resolution_time (now + 2000)
    env.ledger().with_mut(|l| l.timestamp = 3000);

    client.resolve_market(&oracle, &parent_id, &symbol_short!("yes"));

    let contract_id = client.address.clone();
    let conditional: ConditionalMarket = env.as_contract(&contract_id, || {
        env.storage()
            .persistent()
            .get(&DataKey::ConditionalMarket(child_id))
            .unwrap()
    });

    assert!(conditional.is_activated);
}

#[test]
fn test_conditional_market_does_not_activate_on_wrong_outcome() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, oracle) = deploy_with_oracle(&env);
    let creator = Address::generate(&env);

    let parent_id = client.create_market(&creator, &default_params(&env));
    let child_id = client.create_conditional_market(
        &creator,
        &parent_id,
        &symbol_short!("yes"),
        &conditional_params(&env, &client, parent_id),
    );

    // Advance past resolution_time
    env.ledger().with_mut(|l| l.timestamp = 3000);

    // Resolve parent with "no" — child requires "yes", so it should NOT activate
    client.resolve_market(&oracle, &parent_id, &symbol_short!("no"));

    let contract_id = client.address.clone();
    let conditional: ConditionalMarket = env.as_contract(&contract_id, || {
        env.storage()
            .persistent()
            .get(&DataKey::ConditionalMarket(child_id))
            .unwrap()
    });

    assert!(!conditional.is_activated);
}

#[test]
fn test_conditional_market_activation_time_is_set() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, oracle) = deploy_with_oracle(&env);
    let creator = Address::generate(&env);

    let parent_id = client.create_market(&creator, &default_params(&env));
    let child_id = client.create_conditional_market(
        &creator,
        &parent_id,
        &symbol_short!("yes"),
        &conditional_params(&env, &client, parent_id),
    );

    let resolve_time: u64 = 3000;
    env.ledger().with_mut(|l| l.timestamp = resolve_time);

    client.resolve_market(&oracle, &parent_id, &symbol_short!("yes"));

    let contract_id = client.address.clone();
    let conditional: ConditionalMarket = env.as_contract(&contract_id, || {
        env.storage()
            .persistent()
            .get(&DataKey::ConditionalMarket(child_id))
            .unwrap()
    });

    assert!(conditional.is_activated);
    assert_eq!(conditional.activation_time, Some(resolve_time));
}

// ── Issue #555: get_parent_market ───────────────────────────────────────────

#[test]
fn test_get_parent_market_returns_correct_parent() {
    let env = Env::default();
    env.mock_all_auths();
    let client = deploy(&env);
    let creator = Address::generate(&env);

    let parent_id = client.create_market(&creator, &default_params(&env));
    let child_id = client.create_conditional_market(
        &creator,
        &parent_id,
        &symbol_short!("yes"),
        &conditional_params(&env, &client, parent_id),
    );

    let parent = client.get_parent_market(&child_id);
    assert_eq!(parent.market_id, parent_id);
}

#[test]
fn test_get_parent_market_fails_for_non_conditional_market() {
    let env = Env::default();
    env.mock_all_auths();
    let client = deploy(&env);
    let creator = Address::generate(&env);

    let root_id = client.create_market(&creator, &default_params(&env));
    let result = client.try_get_parent_market(&root_id);

    assert!(matches!(result, Err(Ok(InsightArenaError::MarketNotFound))));
}

#[test]
fn test_get_parent_market_fails_for_unknown_market() {
    let env = Env::default();
    env.mock_all_auths();
    let client = deploy(&env);

    let result = client.try_get_parent_market(&404_u64);
    assert!(matches!(result, Err(Ok(InsightArenaError::MarketNotFound))));
}

// ── Issue #556: get_conditional_chain ───────────────────────────────────────

#[test]
fn test_get_conditional_chain_depth_1() {
    let env = Env::default();
    env.mock_all_auths();
    let client = deploy(&env);
    let creator = Address::generate(&env);

    let root_id = client.create_market(&creator, &default_params(&env));
    let child_id = client.create_conditional_market(
        &creator,
        &root_id,
        &symbol_short!("yes"),
        &conditional_params(&env, &client, root_id),
    );

    let chain = client.get_conditional_chain(&child_id);

    assert_eq!(chain.depth, 2);
    assert_eq!(chain.market_ids.len(), 2);
    assert_eq!(chain.market_ids.get(0), Some(child_id));
    assert_eq!(chain.market_ids.get(1), Some(root_id));
}

#[test]
fn test_get_conditional_chain_depth_3() {
    let env = Env::default();
    env.mock_all_auths();
    let client = deploy(&env);
    let creator = Address::generate(&env);

    let root_id = client.create_market(&creator, &default_params(&env));
    let level1_id = client.create_conditional_market(
        &creator,
        &root_id,
        &symbol_short!("yes"),
        &conditional_params(&env, &client, root_id),
    );
    let level2_id = client.create_conditional_market(
        &creator,
        &level1_id,
        &symbol_short!("yes"),
        &conditional_params(&env, &client, level1_id),
    );
    let level3_id = client.create_conditional_market(
        &creator,
        &level2_id,
        &symbol_short!("yes"),
        &conditional_params(&env, &client, level2_id),
    );

    let chain = client.get_conditional_chain(&level3_id);

    assert_eq!(chain.depth, 4);
    assert_eq!(chain.market_ids.len(), 4);
    assert_eq!(chain.market_ids.get(0), Some(level3_id));
    assert_eq!(chain.market_ids.get(1), Some(level2_id));
    assert_eq!(chain.market_ids.get(2), Some(level1_id));
    assert_eq!(chain.market_ids.get(3), Some(root_id));
}

#[test]
fn test_get_conditional_chain_for_root_market_returns_single() {
    let env = Env::default();
    env.mock_all_auths();
    let client = deploy(&env);
    let creator = Address::generate(&env);

    let root_id = client.create_market(&creator, &default_params(&env));
    let chain = client.get_conditional_chain(&root_id);

    assert_eq!(chain.depth, 1);
    assert_eq!(chain.market_ids.len(), 1);
    assert_eq!(chain.market_ids.get(0), Some(root_id));
}

#[test]
fn test_get_conditional_chain_caches_result() {
    let env = Env::default();
    env.mock_all_auths();
    let client = deploy(&env);
    let creator = Address::generate(&env);

    let root_id = client.create_market(&creator, &default_params(&env));
    let child_id = client.create_conditional_market(
        &creator,
        &root_id,
        &symbol_short!("yes"),
        &conditional_params(&env, &client, root_id),
    );

    let first = client.get_conditional_chain(&child_id);
    let second = client.get_conditional_chain(&child_id);

    assert_eq!(first, second);
}

// ── Issue #512: Activation Validation Tests ─────────────────────────────────

#[test]
fn test_check_conditional_activation_invalid_market_fails() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, oracle) = deploy_with_oracle(&env);

    set_timestamp(&env, 10_000);
    let result = client.try_resolve_market(&oracle, &999_u64, &symbol_short!("yes"));

    assert!(matches!(result, Err(Ok(InsightArenaError::MarketNotFound))));
}

#[test]
fn test_check_conditional_activation_parent_cancelled() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, _oracle) = deploy_with_admin_and_oracle(&env);
    let creator = Address::generate(&env);

    let parent_id = client.create_market(&creator, &default_params(&env));
    let child_id = client.create_conditional_market(
        &creator,
        &parent_id,
        &symbol_short!("yes"),
        &conditional_params(&env, &client, parent_id),
    );

    client.cancel_market(&admin, &parent_id);

    let child = read_conditional(&env, &client, child_id);
    assert!(!child.is_activated);
}

#[test]
fn test_check_conditional_activation_multiple_outcomes() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, oracle) = deploy_with_oracle(&env);
    let creator = Address::generate(&env);

    let now = env.ledger().timestamp();
    let parent_params = CreateMarketParams {
        title: String::from_str(&env, "3-way"),
        description: String::from_str(&env, "three outcomes"),
        category: Symbol::new(&env, "Sports"),
        outcomes: vec![
            &env,
            symbol_short!("yes"),
            symbol_short!("no"),
            symbol_short!("draw"),
        ],
        end_time: now + 1000,
        resolution_time: now + 2000,
        dispute_window: 86_400,
        creator_fee_bps: 100,
        min_stake: 10_000_000,
        max_stake: 100_000_000,
        is_public: true,
    };

    let parent_id = client.create_market(&creator, &parent_params);
    let c_yes = client.create_conditional_market(
        &creator,
        &parent_id,
        &symbol_short!("yes"),
        &conditional_params(&env, &client, parent_id),
    );
    let c_no = client.create_conditional_market(
        &creator,
        &parent_id,
        &symbol_short!("no"),
        &conditional_params(&env, &client, parent_id),
    );
    let c_draw = client.create_conditional_market(
        &creator,
        &parent_id,
        &symbol_short!("draw"),
        &conditional_params(&env, &client, parent_id),
    );

    set_timestamp(&env, 10_000);
    client.resolve_market(&oracle, &parent_id, &symbol_short!("draw"));

    assert!(!read_conditional(&env, &client, c_yes).is_activated);
    assert!(!read_conditional(&env, &client, c_no).is_activated);
    assert!(read_conditional(&env, &client, c_draw).is_activated);
}

#[test]
fn test_check_conditional_activation_chain() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, oracle) = deploy_with_oracle(&env);
    let creator = Address::generate(&env);

    let a = client.create_market(&creator, &default_params(&env));
    let b = client.create_conditional_market(
        &creator,
        &a,
        &symbol_short!("yes"),
        &conditional_params(&env, &client, a),
    );
    let c = client.create_conditional_market(
        &creator,
        &b,
        &symbol_short!("yes"),
        &conditional_params(&env, &client, b),
    );

    set_timestamp(&env, 10_000);
    client.resolve_market(&oracle, &a, &symbol_short!("yes"));

    assert!(read_conditional(&env, &client, b).is_activated);
    assert!(!read_conditional(&env, &client, c).is_activated);
}

// ── Additional comprehensive coverage for Issue #520 ────────────────────────

#[test]
fn test_create_conditional_market_sets_parent_link_storage() {
    let env = Env::default();
    env.mock_all_auths();
    let client = deploy(&env);
    let creator = Address::generate(&env);

    let parent_id = client.create_market(&creator, &default_params(&env));
    let child_id = client.create_conditional_market(
        &creator,
        &parent_id,
        &symbol_short!("yes"),
        &conditional_params(&env, &client, parent_id),
    );

    let contract_id = client.address.clone();
    let stored_parent: u64 = env.as_contract(&contract_id, || {
        env.storage()
            .persistent()
            .get(&DataKey::ConditionalParent(child_id))
            .unwrap()
    });

    assert_eq!(stored_parent, parent_id);
}

#[test]
fn test_create_conditional_market_sets_depth_to_1_for_root_parent() {
    let env = Env::default();
    env.mock_all_auths();
    let client = deploy(&env);
    let creator = Address::generate(&env);

    let parent_id = client.create_market(&creator, &default_params(&env));
    let child_id = client.create_conditional_market(
        &creator,
        &parent_id,
        &symbol_short!("yes"),
        &conditional_params(&env, &client, parent_id),
    );

    let child = read_conditional(&env, &client, child_id);
    assert_eq!(child.conditional_depth, 1);
}

#[test]
fn test_create_conditional_market_increments_depth_for_nested_children() {
    let env = Env::default();
    env.mock_all_auths();
    let client = deploy(&env);
    let creator = Address::generate(&env);

    let root = client.create_market(&creator, &default_params(&env));
    let c1 = client.create_conditional_market(
        &creator,
        &root,
        &symbol_short!("yes"),
        &conditional_params(&env, &client, root),
    );
    let c2 = client.create_conditional_market(
        &creator,
        &c1,
        &symbol_short!("yes"),
        &conditional_params(&env, &client, c1),
    );

    assert_eq!(read_conditional(&env, &client, c1).conditional_depth, 1);
    assert_eq!(read_conditional(&env, &client, c2).conditional_depth, 2);
}

#[test]
fn test_get_conditional_markets_returns_only_direct_children() {
    let env = Env::default();
    env.mock_all_auths();
    let client = deploy(&env);
    let creator = Address::generate(&env);

    let root = client.create_market(&creator, &default_params(&env));
    let direct = client.create_conditional_market(
        &creator,
        &root,
        &symbol_short!("yes"),
        &conditional_params(&env, &client, root),
    );
    let _nested = client.create_conditional_market(
        &creator,
        &direct,
        &symbol_short!("yes"),
        &conditional_params(&env, &client, direct),
    );

    let root_children = client.get_conditional_markets(&root);
    assert_eq!(root_children.len(), 1);
    assert_eq!(root_children.get(0).unwrap().market_id, direct);
}

#[test]
fn test_activation_sets_activation_timestamp_to_ledger_time() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, oracle) = deploy_with_oracle(&env);
    let creator = Address::generate(&env);

    let parent_id = client.create_market(&creator, &default_params(&env));
    let child_id = client.create_conditional_market(
        &creator,
        &parent_id,
        &symbol_short!("yes"),
        &conditional_params(&env, &client, parent_id),
    );

    set_timestamp(&env, 6_000);
    client.resolve_market(&oracle, &parent_id, &symbol_short!("yes"));

    let child = read_conditional(&env, &client, child_id);
    assert_eq!(child.activation_time, Some(6_000));
}

#[test]
fn test_non_matching_outcome_never_sets_activation_time() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, oracle) = deploy_with_oracle(&env);
    let creator = Address::generate(&env);

    let parent_id = client.create_market(&creator, &default_params(&env));
    let child_id = client.create_conditional_market(
        &creator,
        &parent_id,
        &symbol_short!("yes"),
        &conditional_params(&env, &client, parent_id),
    );

    set_timestamp(&env, 7_000);
    client.resolve_market(&oracle, &parent_id, &symbol_short!("no"));

    let child = read_conditional(&env, &client, child_id);
    assert_eq!(child.activation_time, None);
}

#[test]
fn test_conditional_chain_for_unknown_market_fails() {
    let env = Env::default();
    env.mock_all_auths();
    let client = deploy(&env);

    let result = client.try_get_conditional_chain(&808_u64);
    assert!(matches!(result, Err(Ok(InsightArenaError::MarketNotFound))));
}

#[test]
fn test_get_parent_market_returns_immediate_parent_not_root() {
    let env = Env::default();
    env.mock_all_auths();
    let client = deploy(&env);
    let creator = Address::generate(&env);

    let root = client.create_market(&creator, &default_params(&env));
    let child = client.create_conditional_market(
        &creator,
        &root,
        &symbol_short!("yes"),
        &conditional_params(&env, &client, root),
    );
    let grandchild = client.create_conditional_market(
        &creator,
        &child,
        &symbol_short!("yes"),
        &conditional_params(&env, &client, child),
    );

    let parent = client.get_parent_market(&grandchild);
    assert_eq!(parent.market_id, child);
}

#[test]
fn test_chain_order_is_leaf_to_root() {
    let env = Env::default();
    env.mock_all_auths();
    let client = deploy(&env);
    let creator = Address::generate(&env);

    let root = client.create_market(&creator, &default_params(&env));
    let child = client.create_conditional_market(
        &creator,
        &root,
        &symbol_short!("yes"),
        &conditional_params(&env, &client, root),
    );
    let grandchild = client.create_conditional_market(
        &creator,
        &child,
        &symbol_short!("yes"),
        &conditional_params(&env, &client, child),
    );

    let chain = client.get_conditional_chain(&grandchild);
    assert_eq!(chain.market_ids.get(0), Some(grandchild));
    assert_eq!(chain.market_ids.get(1), Some(child));
    assert_eq!(chain.market_ids.get(2), Some(root));
}

#[test]
fn test_cancel_parent_sets_market_cancelled_flag() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, _oracle) = deploy_with_admin_and_oracle(&env);
    let creator = Address::generate(&env);

    let parent = client.create_market(&creator, &default_params(&env));
    client.cancel_market(&admin, &parent);

    let market = read_market(&env, &client, parent);
    assert!(market.is_cancelled);
}

#[test]
fn test_resolving_parent_with_wrong_outcome_keeps_all_children_inactive() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, oracle) = deploy_with_oracle(&env);
    let creator = Address::generate(&env);

    let parent = client.create_market(&creator, &default_params(&env));
    let c1 = client.create_conditional_market(
        &creator,
        &parent,
        &symbol_short!("yes"),
        &conditional_params(&env, &client, parent),
    );
    let c2 = client.create_conditional_market(
        &creator,
        &parent,
        &symbol_short!("yes"),
        &conditional_params(&env, &client, parent),
    );

    set_timestamp(&env, 9_000);
    client.resolve_market(&oracle, &parent, &symbol_short!("no"));

    assert!(!read_conditional(&env, &client, c1).is_activated);
    assert!(!read_conditional(&env, &client, c2).is_activated);
}

#[test]
fn test_creation_child_market_is_persisted() {
    let env = Env::default();
    env.mock_all_auths();
    let client = deploy(&env);
    let creator = Address::generate(&env);

    let parent = client.create_market(&creator, &default_params(&env));
    let child = client.create_conditional_market(
        &creator,
        &parent,
        &symbol_short!("yes"),
        &conditional_params(&env, &client, parent),
    );

    let market = read_market(&env, &client, child);
    assert_eq!(market.market_id, child);
}

#[test]
fn test_creation_multiple_children_have_unique_ids() {
    let env = Env::default();
    env.mock_all_auths();
    let client = deploy(&env);
    let creator = Address::generate(&env);

    let parent = client.create_market(&creator, &default_params(&env));
    let c1 = client.create_conditional_market(
        &creator,
        &parent,
        &symbol_short!("yes"),
        &conditional_params(&env, &client, parent),
    );
    let c2 = client.create_conditional_market(
        &creator,
        &parent,
        &symbol_short!("no"),
        &conditional_params(&env, &client, parent),
    );
    assert_ne!(c1, c2);
}

#[test]
fn test_creation_children_list_length_increases() {
    let env = Env::default();
    env.mock_all_auths();
    let client = deploy(&env);
    let creator = Address::generate(&env);

    let parent = client.create_market(&creator, &default_params(&env));
    assert_eq!(client.get_conditional_markets(&parent).len(), 0);
    client.create_conditional_market(
        &creator,
        &parent,
        &symbol_short!("yes"),
        &conditional_params(&env, &client, parent),
    );
    assert_eq!(client.get_conditional_markets(&parent).len(), 1);
    client.create_conditional_market(
        &creator,
        &parent,
        &symbol_short!("no"),
        &conditional_params(&env, &client, parent),
    );
    assert_eq!(client.get_conditional_markets(&parent).len(), 2);
}

#[test]
fn test_creation_required_outcome_is_persisted() {
    let env = Env::default();
    env.mock_all_auths();
    let client = deploy(&env);
    let creator = Address::generate(&env);

    let parent = client.create_market(&creator, &default_params(&env));
    let child = client.create_conditional_market(
        &creator,
        &parent,
        &symbol_short!("no"),
        &conditional_params(&env, &client, parent),
    );

    let conditional = read_conditional(&env, &client, child);
    assert_eq!(conditional.required_outcome, symbol_short!("no"));
}

#[test]
fn test_creation_new_conditional_starts_inactive() {
    let env = Env::default();
    env.mock_all_auths();
    let client = deploy(&env);
    let creator = Address::generate(&env);

    let parent = client.create_market(&creator, &default_params(&env));
    let child = client.create_conditional_market(
        &creator,
        &parent,
        &symbol_short!("yes"),
        &conditional_params(&env, &client, parent),
    );

    assert!(!read_conditional(&env, &client, child).is_activated);
}

#[test]
fn test_creation_activation_time_none_initially() {
    let env = Env::default();
    env.mock_all_auths();
    let client = deploy(&env);
    let creator = Address::generate(&env);

    let parent = client.create_market(&creator, &default_params(&env));
    let child = client.create_conditional_market(
        &creator,
        &parent,
        &symbol_short!("yes"),
        &conditional_params(&env, &client, parent),
    );

    assert_eq!(read_conditional(&env, &client, child).activation_time, None);
}

#[test]
fn test_creation_nested_parent_link_points_to_immediate_parent() {
    let env = Env::default();
    env.mock_all_auths();
    let client = deploy(&env);
    let creator = Address::generate(&env);

    let root = client.create_market(&creator, &default_params(&env));
    let child = client.create_conditional_market(
        &creator,
        &root,
        &symbol_short!("yes"),
        &conditional_params(&env, &client, root),
    );
    let grandchild = client.create_conditional_market(
        &creator,
        &child,
        &symbol_short!("yes"),
        &conditional_params(&env, &client, child),
    );

    let parent = client.get_parent_market(&grandchild);
    assert_eq!(parent.market_id, child);
}

#[test]
fn test_creation_child_market_can_be_fetched_with_get_market() {
    let env = Env::default();
    env.mock_all_auths();
    let client = deploy(&env);
    let creator = Address::generate(&env);

    let root = client.create_market(&creator, &default_params(&env));
    let child = client.create_conditional_market(
        &creator,
        &root,
        &symbol_short!("yes"),
        &conditional_params(&env, &client, root),
    );
    let loaded = client.get_market(&child);
    assert_eq!(loaded.market_id, child);
}

#[test]
fn test_creation_depth_three_levels_values() {
    let env = Env::default();
    env.mock_all_auths();
    let client = deploy(&env);
    let creator = Address::generate(&env);

    let root = client.create_market(&creator, &default_params(&env));
    let c1 = client.create_conditional_market(
        &creator,
        &root,
        &symbol_short!("yes"),
        &conditional_params(&env, &client, root),
    );
    let c2 = client.create_conditional_market(
        &creator,
        &c1,
        &symbol_short!("yes"),
        &conditional_params(&env, &client, c1),
    );
    let c3 = client.create_conditional_market(
        &creator,
        &c2,
        &symbol_short!("yes"),
        &conditional_params(&env, &client, c2),
    );

    assert_eq!(read_conditional(&env, &client, c1).conditional_depth, 1);
    assert_eq!(read_conditional(&env, &client, c2).conditional_depth, 2);
    assert_eq!(read_conditional(&env, &client, c3).conditional_depth, 3);
}

#[test]
fn test_creation_limit_allows_depth_five() {
    let env = Env::default();
    env.mock_all_auths();
    let client = deploy(&env);
    let creator = Address::generate(&env);

    let mut parent = client.create_market(&creator, &default_params(&env));
    for _ in 0..5 {
        parent = client.create_conditional_market(
            &creator,
            &parent,
            &symbol_short!("yes"),
            &conditional_params(&env, &client, parent),
        );
    }

    assert_eq!(read_conditional(&env, &client, parent).conditional_depth, 5);
}

#[test]
fn test_activation_only_matching_child_activates_among_many() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, oracle) = deploy_with_oracle(&env);
    let creator = Address::generate(&env);

    let parent = client.create_market(&creator, &default_params(&env));
    let c1 = client.create_conditional_market(
        &creator,
        &parent,
        &symbol_short!("yes"),
        &conditional_params(&env, &client, parent),
    );
    let c2 = client.create_conditional_market(
        &creator,
        &parent,
        &symbol_short!("no"),
        &conditional_params(&env, &client, parent),
    );
    let c3 = client.create_conditional_market(
        &creator,
        &parent,
        &symbol_short!("yes"),
        &conditional_params(&env, &client, parent),
    );

    set_timestamp(&env, 11_000);
    client.resolve_market(&oracle, &parent, &symbol_short!("yes"));

    assert!(read_conditional(&env, &client, c1).is_activated);
    assert!(!read_conditional(&env, &client, c2).is_activated);
    assert!(read_conditional(&env, &client, c3).is_activated);
}

#[test]
fn test_activation_children_with_other_outcomes_remain_inactive() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, oracle) = deploy_with_oracle(&env);
    let creator = Address::generate(&env);

    let parent = client.create_market(&creator, &default_params(&env));
    let c1 = client.create_conditional_market(
        &creator,
        &parent,
        &symbol_short!("no"),
        &conditional_params(&env, &client, parent),
    );

    set_timestamp(&env, 12_000);
    client.resolve_market(&oracle, &parent, &symbol_short!("yes"));

    assert!(!read_conditional(&env, &client, c1).is_activated);
}

#[test]
fn test_activation_with_multiple_levels_only_first_level() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, oracle) = deploy_with_oracle(&env);
    let creator = Address::generate(&env);

    let root = client.create_market(&creator, &default_params(&env));
    let c1 = client.create_conditional_market(
        &creator,
        &root,
        &symbol_short!("yes"),
        &conditional_params(&env, &client, root),
    );
    let c2 = client.create_conditional_market(
        &creator,
        &c1,
        &symbol_short!("yes"),
        &conditional_params(&env, &client, c1),
    );

    set_timestamp(&env, 13_000);
    client.resolve_market(&oracle, &root, &symbol_short!("yes"));

    assert!(read_conditional(&env, &client, c1).is_activated);
    assert!(!read_conditional(&env, &client, c2).is_activated);
}

#[test]
fn test_activation_after_parent_resolution_stores_timestamp() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, oracle) = deploy_with_oracle(&env);
    let creator = Address::generate(&env);

    let parent = client.create_market(&creator, &default_params(&env));
    let child = client.create_conditional_market(
        &creator,
        &parent,
        &symbol_short!("yes"),
        &conditional_params(&env, &client, parent),
    );

    set_timestamp(&env, 14_000);
    client.resolve_market(&oracle, &parent, &symbol_short!("yes"));
    assert_eq!(
        read_conditional(&env, &client, child).activation_time,
        Some(14_000)
    );
}

#[test]
fn test_activation_parent_resolve_wrong_outcome_keeps_timestamp_none() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, oracle) = deploy_with_oracle(&env);
    let creator = Address::generate(&env);

    let parent = client.create_market(&creator, &default_params(&env));
    let child = client.create_conditional_market(
        &creator,
        &parent,
        &symbol_short!("yes"),
        &conditional_params(&env, &client, parent),
    );

    set_timestamp(&env, 15_000);
    client.resolve_market(&oracle, &parent, &symbol_short!("no"));
    assert_eq!(read_conditional(&env, &client, child).activation_time, None);
}

#[test]
fn test_activation_resolving_parent_twice_fails() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, oracle) = deploy_with_oracle(&env);
    let creator = Address::generate(&env);

    let parent = client.create_market(&creator, &default_params(&env));
    set_timestamp(&env, 16_000);
    client.resolve_market(&oracle, &parent, &symbol_short!("yes"));

    let result = client.try_resolve_market(&oracle, &parent, &symbol_short!("yes"));
    assert!(matches!(
        result,
        Err(Ok(InsightArenaError::MarketAlreadyResolved))
    ));
}

#[test]
fn test_activation_unrelated_market_resolution_does_not_affect_child() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, oracle) = deploy_with_oracle(&env);
    let creator = Address::generate(&env);

    let parent_a = client.create_market(&creator, &default_params(&env));
    let parent_b = client.create_market(&creator, &default_params(&env));
    let child_a = client.create_conditional_market(
        &creator,
        &parent_a,
        &symbol_short!("yes"),
        &conditional_params(&env, &client, parent_a),
    );

    set_timestamp(&env, 17_000);
    client.resolve_market(&oracle, &parent_b, &symbol_short!("yes"));

    assert!(!read_conditional(&env, &client, child_a).is_activated);
}

#[test]
fn test_activation_non_matching_in_nested_structure() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, oracle) = deploy_with_oracle(&env);
    let creator = Address::generate(&env);

    let root = client.create_market(&creator, &default_params(&env));
    let child = client.create_conditional_market(
        &creator,
        &root,
        &symbol_short!("no"),
        &conditional_params(&env, &client, root),
    );
    let grandchild = client.create_conditional_market(
        &creator,
        &child,
        &symbol_short!("yes"),
        &conditional_params(&env, &client, child),
    );

    set_timestamp(&env, 18_000);
    client.resolve_market(&oracle, &root, &symbol_short!("yes"));

    assert!(!read_conditional(&env, &client, child).is_activated);
    assert!(!read_conditional(&env, &client, grandchild).is_activated);
}

#[test]
fn test_query_get_parent_market_for_second_level() {
    let env = Env::default();
    env.mock_all_auths();
    let client = deploy(&env);
    let creator = Address::generate(&env);

    let root = client.create_market(&creator, &default_params(&env));
    let child = client.create_conditional_market(
        &creator,
        &root,
        &symbol_short!("yes"),
        &conditional_params(&env, &client, root),
    );
    let grandchild = client.create_conditional_market(
        &creator,
        &child,
        &symbol_short!("yes"),
        &conditional_params(&env, &client, child),
    );

    let parent = client.get_parent_market(&grandchild);
    assert_eq!(parent.market_id, child);
}

#[test]
fn test_query_chain_root_depth_is_one() {
    let env = Env::default();
    env.mock_all_auths();
    let client = deploy(&env);
    let creator = Address::generate(&env);

    let root = client.create_market(&creator, &default_params(&env));
    let chain = client.get_conditional_chain(&root);
    assert_eq!(chain.depth, 1);
}

#[test]
fn test_query_chain_second_level_depth_is_three() {
    let env = Env::default();
    env.mock_all_auths();
    let client = deploy(&env);
    let creator = Address::generate(&env);

    let root = client.create_market(&creator, &default_params(&env));
    let child = client.create_conditional_market(
        &creator,
        &root,
        &symbol_short!("yes"),
        &conditional_params(&env, &client, root),
    );
    let grandchild = client.create_conditional_market(
        &creator,
        &child,
        &symbol_short!("yes"),
        &conditional_params(&env, &client, child),
    );

    let chain = client.get_conditional_chain(&grandchild);
    assert_eq!(chain.depth, 3);
}

#[test]
fn test_query_chain_cached_after_first_call_storage_exists() {
    let env = Env::default();
    env.mock_all_auths();
    let client = deploy(&env);
    let creator = Address::generate(&env);

    let root = client.create_market(&creator, &default_params(&env));
    let child = client.create_conditional_market(
        &creator,
        &root,
        &symbol_short!("yes"),
        &conditional_params(&env, &client, root),
    );
    let _ = client.get_conditional_chain(&child);

    let contract_id = client.address.clone();
    let cached = env.as_contract(&contract_id, || {
        env.storage()
            .persistent()
            .has(&DataKey::ConditionalChain(child))
    });
    assert!(cached);
}

#[test]
fn test_query_conditional_markets_returns_struct_fields() {
    let env = Env::default();
    env.mock_all_auths();
    let client = deploy(&env);
    let creator = Address::generate(&env);

    let root = client.create_market(&creator, &default_params(&env));
    let child = client.create_conditional_market(
        &creator,
        &root,
        &symbol_short!("yes"),
        &conditional_params(&env, &client, root),
    );
    let items = client.get_conditional_markets(&root);
    let first = items.get(0).unwrap();

    assert_eq!(first.market_id, child);
    assert_eq!(first.parent_market_id, root);
    assert_eq!(first.required_outcome, symbol_short!("yes"));
}

#[test]
fn test_query_conditional_markets_empty_for_unknown_parent() {
    let env = Env::default();
    env.mock_all_auths();
    let client = deploy(&env);

    let items = client.get_conditional_markets(&1_000_000_u64);
    assert_eq!(items.len(), 0);
}

#[test]
fn test_integration_market_lifecycle_parent_then_child_resolution() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, oracle) = deploy_with_oracle(&env);
    let creator = Address::generate(&env);

    let parent = client.create_market(&creator, &default_params(&env));
    let child = client.create_conditional_market(
        &creator,
        &parent,
        &symbol_short!("yes"),
        &conditional_params(&env, &client, parent),
    );

    set_timestamp(&env, 20_000);
    client.resolve_market(&oracle, &parent, &symbol_short!("yes"));
    client.resolve_market(&oracle, &child, &symbol_short!("yes"));

    assert!(read_market(&env, &client, parent).is_resolved);
    assert!(read_market(&env, &client, child).is_resolved);
}

#[test]
fn test_integration_resolution_chain_progression_requires_each_parent_resolution() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, oracle) = deploy_with_oracle(&env);
    let creator = Address::generate(&env);

    let a = client.create_market(&creator, &default_params(&env));
    let b = client.create_conditional_market(
        &creator,
        &a,
        &symbol_short!("yes"),
        &conditional_params(&env, &client, a),
    );
    let c = client.create_conditional_market(
        &creator,
        &b,
        &symbol_short!("yes"),
        &conditional_params(&env, &client, b),
    );

    set_timestamp(&env, 21_000);
    client.resolve_market(&oracle, &a, &symbol_short!("yes"));
    assert!(read_conditional(&env, &client, b).is_activated);
    assert!(!read_conditional(&env, &client, c).is_activated);

    client.resolve_market(&oracle, &b, &symbol_short!("yes"));
    assert!(read_conditional(&env, &client, c).is_activated);
}

#[test]
fn test_edge_invalid_parent_id_large_value() {
    let env = Env::default();
    env.mock_all_auths();
    let client = deploy(&env);
    let creator = Address::generate(&env);

    let result = client.try_create_conditional_market(
        &creator,
        &u64::MAX,
        &symbol_short!("yes"),
        &default_params(&env),
    );
    assert!(matches!(result, Err(Ok(InsightArenaError::MarketNotFound))));
}

#[test]
fn test_edge_max_depth_boundary() {
    let env = Env::default();
    env.mock_all_auths();
    let client = deploy(&env);
    let creator = Address::generate(&env);

    let mut parent = client.create_market(&creator, &default_params(&env));
    for _ in 0..5 {
        parent = client.create_conditional_market(
            &creator,
            &parent,
            &symbol_short!("yes"),
            &conditional_params(&env, &client, parent),
        );
    }

    let fail = client.try_create_conditional_market(
        &creator,
        &parent,
        &symbol_short!("yes"),
        &conditional_params(&env, &client, parent),
    );
    assert!(matches!(
        fail,
        Err(Ok(InsightArenaError::ConditionalDepthExceeded))
    ));
}

#[test]
fn test_security_unauthorized_resolve_parent_fails() {
    let env = Env::default();
    env.mock_all_auths();
    let client = deploy(&env);
    let creator = Address::generate(&env);
    let attacker_oracle = Address::generate(&env);

    let parent = client.create_market(&creator, &default_params(&env));
    set_timestamp(&env, 30_000);
    let res = client.try_resolve_market(&attacker_oracle, &parent, &symbol_short!("yes"));
    assert!(matches!(res, Err(Ok(InsightArenaError::Unauthorized))));
}

#[test]
fn test_security_get_parent_unknown_id_not_found() {
    let env = Env::default();
    env.mock_all_auths();
    let client = deploy(&env);

    let res = client.try_get_parent_market(&77_777_u64);
    assert!(matches!(res, Err(Ok(InsightArenaError::MarketNotFound))));
}

#[test]
fn test_security_conditional_chain_unknown_id_not_found() {
    let env = Env::default();
    env.mock_all_auths();
    let client = deploy(&env);

    let res = client.try_get_conditional_chain(&88_888_u64);
    assert!(matches!(res, Err(Ok(InsightArenaError::MarketNotFound))));
}
