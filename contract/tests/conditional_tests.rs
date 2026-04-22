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
        &default_params(&env),
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
        &default_params(&env),
    );

    assert!(matches!(result, Err(Ok(InsightArenaError::InvalidOutcome))));
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
            &default_params(&env),
        );
    }

    // Now depth is 5. Another creation should fail with ConditionalDepthExceeded
    let result = client.try_create_conditional_market(
        &creator,
        &parent_id,
        &required_outcome,
        &default_params(&env),
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
        &default_params(&env),
    );

    let child2_id = client.create_conditional_market(
        &creator,
        &parent_id,
        &symbol_short!("no"),
        &default_params(&env),
    );

    let child3_id = client.create_conditional_market(
        &creator,
        &parent_id,
        &symbol_short!("yes"),
        &default_params(&env),
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
        &default_params(&env),
    );

    let _child2_id = client.create_conditional_market(
        &creator,
        &parent_id,
        &symbol_short!("no"),
        &default_params(&env),
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
        &default_params(&env),
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
        &default_params(&env),
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
        &default_params(&env),
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
