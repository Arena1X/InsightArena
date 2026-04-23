use soroban_sdk::testutils::{Address as _, Ledger as _};
use soroban_sdk::{symbol_short, vec, Address, Env, String};
use insightarena_contract::{InsightArenaContract, InsightArenaContractClient, CreateMarketParams, InsightArenaError};

fn register_token(env: &Env) -> Address {
    let token_admin = Address::generate(env);
    env.register_stellar_asset_contract_v2(token_admin)
        .address()
}

fn deploy(env: &Env) -> (InsightArenaContractClient<'_>, Address, Address) {
    let id = env.register(InsightArenaContract, ());
    let client = InsightArenaContractClient::new(env, &id);
    let admin = Address::generate(env);
    let oracle = Address::generate(env);
    let xlm_token = register_token(env);
    env.mock_all_auths();
    client.initialize(&admin, &oracle, &200_u32, &xlm_token);
    (client, admin, oracle)
}

fn default_params(env: &Env) -> CreateMarketParams {
    let now = env.ledger().timestamp();
    CreateMarketParams {
        title: String::from_str(env, "Market"),
        description: String::from_str(env, "Description"),
        category: symbol_short!("test"),
        outcomes: vec![env, symbol_short!("yes"), symbol_short!("no")],
        end_time: now + 1000,
        resolution_time: now + 2000,
        creator_fee_bps: 100,
        min_stake: 10_000_000,
        max_stake: 100_000_000,
        is_public: true,
    }
}

#[test]
fn test_resolve_parent_activates_matching_conditional() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, oracle) = deploy(&env);
    let creator = Address::generate(&env);

    let parent_id = client.create_market(&creator, &default_params(&env));
    let child_id = client.create_market(&creator, &default_params(&env));

    // Link them: child requires parent to be "yes"
    client.set_conditional_config(&child_id, &parent_id, &symbol_short!("yes"));

    // Verify child is NOT active yet
    let predictor = Address::generate(&env);
    let result = client.try_submit_prediction(&predictor, &child_id, &symbol_short!("yes"), &20_000_000);
    assert!(result.is_err()); 

    // Resolve parent to "yes"
    env.ledger().set_timestamp(env.ledger().timestamp() + 2000);
    client.resolve_market(&oracle, &parent_id, &symbol_short!("yes"));

    // Verify child is now active (passes the activation guard)
    let result = client.try_submit_prediction(&predictor, &child_id, &symbol_short!("yes"), &20_000_000);
    if let Err(Ok(err)) = result {
        assert_ne!(err, InsightArenaError::Unauthorized); 
    }
}

#[test]
fn test_resolve_parent_does_not_activate_non_matching() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, oracle) = deploy(&env);
    let creator = Address::generate(&env);

    let parent_id = client.create_market(&creator, &default_params(&env));
    let child_id = client.create_market(&creator, &default_params(&env));

    client.set_conditional_config(&child_id, &parent_id, &symbol_short!("yes"));

    // Resolve parent to "no"
    env.ledger().set_timestamp(env.ledger().timestamp() + 2000);
    client.resolve_market(&oracle, &parent_id, &symbol_short!("no"));

    // Verify child is STILL NOT active
    let predictor = Address::generate(&env);
    let result = client.try_submit_prediction(&predictor, &child_id, &symbol_short!("yes"), &20_000_000);
    assert!(matches!(result, Err(Ok(InsightArenaError::Unauthorized))));
}

#[test]
fn test_resolve_parent_activates_multiple_conditionals() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, oracle) = deploy(&env);
    let creator = Address::generate(&env);

    let parent_id = client.create_market(&creator, &default_params(&env));
    let child1 = client.create_market(&creator, &default_params(&env));
    let child2 = client.create_market(&creator, &default_params(&env));
    let child3 = client.create_market(&creator, &default_params(&env));

    client.set_conditional_config(&child1, &parent_id, &symbol_short!("yes"));
    client.set_conditional_config(&child2, &parent_id, &symbol_short!("yes"));
    client.set_conditional_config(&child3, &parent_id, &symbol_short!("yes"));

    // Resolve parent to "yes"
    env.ledger().set_timestamp(env.ledger().timestamp() + 2000);
    client.resolve_market(&oracle, &parent_id, &symbol_short!("yes"));

    // Verify all children are active
    let predictor = Address::generate(&env);
    for cid in [child1, child2, child3] {
        let result = client.try_submit_prediction(&predictor, &cid, &symbol_short!("yes"), &20_000_000);
        if let Err(Ok(err)) = result {
            assert_ne!(err, InsightArenaError::Unauthorized);
        }
    }
}

#[test]
fn test_resolve_parent_selective_activation() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, oracle) = deploy(&env);
    let creator = Address::generate(&env);

    let parent_id = client.create_market(&creator, &default_params(&env));
    let child_yes = client.create_market(&creator, &default_params(&env));
    let child_no = client.create_market(&creator, &default_params(&env));

    client.set_conditional_config(&child_yes, &parent_id, &symbol_short!("yes"));
    client.set_conditional_config(&child_no, &parent_id, &symbol_short!("no"));

    // Resolve parent to "yes"
    env.ledger().set_timestamp(env.ledger().timestamp() + 2000);
    client.resolve_market(&oracle, &parent_id, &symbol_short!("yes"));

    let predictor = Address::generate(&env);
    
    // child_yes should be active
    let res_yes = client.try_submit_prediction(&predictor, &child_yes, &symbol_short!("yes"), &20_000_000);
    if let Err(Ok(err)) = res_yes {
        assert_ne!(err, InsightArenaError::Unauthorized);
    }

    // child_no should NOT be active
    let res_no = client.try_submit_prediction(&predictor, &child_no, &symbol_short!("yes"), &20_000_000);
    assert!(matches!(res_no, Err(Ok(InsightArenaError::Unauthorized))));
}
