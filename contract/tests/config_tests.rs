use insightarena_contract::config;
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

#[test]
fn test_pause_and_unpause_contract() {
    let env = Env::default();
    env.mock_all_auths();
    let client = deploy(&env);
    let admin = Address::generate(&env);
    let oracle = Address::generate(&env);

    client.initialize(&admin, &oracle, &200_u32, &register_token(&env));

    let result_before = client.try_get_config();
    assert!(result_before.is_ok());

    client.set_paused(&true);
    let result_paused = client.try_get_config();
    assert!(matches!(result_paused, Err(Ok(InsightArenaError::Paused))));

    client.set_paused(&false);
    let result_after = client.try_get_config();
    assert!(result_after.is_ok());
}

#[test]
fn test_update_platform_fee() {
    let env = Env::default();
    env.mock_all_auths();
    let client = deploy(&env);
    let admin = Address::generate(&env);
    let oracle = Address::generate(&env);

    client.initialize(&admin, &oracle, &200_u32, &register_token(&env));

    let config_before = client.get_config();
    assert_eq!(config_before.protocol_fee_bps, 200);

    let new_fee = 500_u32;
    client.update_protocol_fee(&new_fee);

    let config_after = client.get_config();
    assert_eq!(config_after.protocol_fee_bps, 500);
}

#[test]
#[should_panic(expected = "Unauthorized function call")]
fn test_config_update_unauthorized() {
    let env = Env::default();
    let client = deploy(&env);
    let admin = Address::generate(&env);
    let oracle = Address::generate(&env);

    client.initialize(&admin, &oracle, &200_u32, &register_token(&env));

    let _ = env.as_contract(&client.address, || {
        config::set_paused(&env, true)
    });
}
