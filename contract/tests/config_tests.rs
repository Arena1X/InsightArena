use insightarena_contract::{InsightArenaContract, InsightArenaContractClient, InsightArenaError};
use soroban_sdk::testutils::Address as _;
use soroban_sdk::{Address, Env};

fn deploy(env: &Env) -> InsightArenaContractClient<'_> {
    let id = env.register(InsightArenaContract, ());
    InsightArenaContractClient::new(env, &id)
}

fn register_token(env: &Env) -> Address {
    let token_admin = Address::generate(env);
    env.register_stellar_asset_contract_v2(token_admin)
        .address()
}

#[test]
fn ensure_not_paused_ok_when_running() {
    let env = Env::default();
    env.mock_all_auths();
    let client = deploy(&env);
    let admin = Address::generate(&env);
    let oracle = Address::generate(&env);
    client.initialize(&admin, &oracle, &200_u32, &register_token(&env));
    client.get_config();
}

#[test]
fn ensure_not_paused_err_when_paused() {
    let env = Env::default();
    env.mock_all_auths();
    let client = deploy(&env);
    let admin = Address::generate(&env);
    let oracle = Address::generate(&env);
    client.initialize(&admin, &oracle, &200_u32, &register_token(&env));
    client.set_paused(&true);
    let result = client.try_get_config();
    assert!(matches!(result, Err(Ok(InsightArenaError::Paused))));
}

#[test]
fn ensure_not_paused_not_initialized() {
    let env = Env::default();
    env.mock_all_auths();
    let client = deploy(&env);
    let result = client.try_get_config();
    assert!(matches!(result, Err(Ok(InsightArenaError::NotInitialized))));
}

#[test]
fn ensure_not_paused_ok_after_unpause() {
    let env = Env::default();
    env.mock_all_auths();
    let client = deploy(&env);
    let admin = Address::generate(&env);
    let oracle = Address::generate(&env);
    client.initialize(&admin, &oracle, &200_u32, &register_token(&env));
    client.set_paused(&true);
    client.set_paused(&false);
    client.get_config();
}

#[test]
fn test_config_update_validation() {
    let env = Env::default();
    env.mock_all_auths();
    let client = deploy(&env);
    let admin = Address::generate(&env);
    let oracle = Address::generate(&env);

    client.initialize(&admin, &oracle, &200_u32, &register_token(&env));

    let result = client.try_update_protocol_fee(&10_001_u32);
    assert!(matches!(result, Err(Ok(InsightArenaError::InvalidFee))));

    let config = client.get_config();
    assert_eq!(config.protocol_fee_bps, 200);
}
