use insightarena_contract::errors::InsightArenaError;
use insightarena_contract::market::CreateMarketParams;
use insightarena_contract::storage_types::{DataKey, InviteCode};
use insightarena_contract::{InsightArenaContract, InsightArenaContractClient};
use soroban_sdk::testutils::{Address as _, Ledger as _};
use soroban_sdk::{vec, Address, Env, String, Symbol, Vec};

fn setup_test(env: &Env) -> (Address, Address, u64, InsightArenaContractClient<'_>) {
    env.mock_all_auths();
    let admin = Address::generate(env);
    let oracle = Address::generate(env);
    let creator = Address::generate(env);
    let xlm_token = env
        .register_stellar_asset_contract_v2(admin.clone())
        .address();

    let contract_id = env.register(InsightArenaContract, ());
    let client = InsightArenaContractClient::new(env, &contract_id);
    client.initialize(&admin, &oracle, &200, &xlm_token);

    let params = CreateMarketParams {
        title: String::from_str(env, "Market 1"),
        description: String::from_str(env, "Description 1"),
        category: Symbol::new(env, "Sports"),
        outcomes: vec![env, Symbol::new(env, "TeamA"), Symbol::new(env, "TeamB")],
        end_time: 200,
        resolution_time: 300,
        dispute_window: 86_400,
        creator_fee_bps: 100,
        min_stake: 10_000_000,
        max_stake: 100_000_000,
        is_public: false,
    };

    let market_id = client.create_market(&creator, &params);
    (creator, oracle, market_id, client)
}

#[test]
fn test_generate_invite_code_success() {
    let env = Env::default();
    let (creator, _, market_id, client) = setup_test(&env);

    let code = client.generate_invite_code(&creator, &market_id, &10, &3600);

    assert!(code.to_val().get_payload() != 0);

    let stored: InviteCode = env.as_contract(&client.address, || {
        env.storage()
            .persistent()
            .get(&DataKey::InviteCode(code.clone()))
            .unwrap()
    });
    assert_eq!(stored.code, code);
    assert_eq!(stored.market_id, market_id);
    assert_eq!(stored.max_uses, 10);
    assert_eq!(stored.current_uses, 0);
    assert!(stored.is_active);
}

#[test]
fn test_generate_invite_code_unauthorized() {
    let env = Env::default();
    let (_, _, market_id, client) = setup_test(&env);
    let non_creator = Address::generate(&env);
    env.mock_all_auths();

    let result = client.try_generate_invite_code(&non_creator, &market_id, &10, &3600);
    assert!(matches!(result, Err(Ok(InsightArenaError::Unauthorized))));
}

#[test]
fn test_generate_invite_code_invalid_uses() {
    let env = Env::default();
    let (creator, _, market_id, client) = setup_test(&env);

    let result = client.try_generate_invite_code(&creator, &market_id, &0, &3600);
    assert!(matches!(result, Err(Ok(InsightArenaError::InvalidInput))));
}

#[test]
fn test_generate_invite_code_uniqueness() {
    let env = Env::default();
    let (creator, _, market_id, client) = setup_test(&env);

    let code1 = client.generate_invite_code(&creator, &market_id, &10, &3600);

    env.ledger().set_timestamp(env.ledger().timestamp() + 1);

    let code2 = client.generate_invite_code(&creator, &market_id, &10, &3600);

    assert_ne!(code1, code2);
}

#[test]
fn test_redeem_invite_code_success() {
    let env = Env::default();
    let (creator, _, market_id, client) = setup_test(&env);
    let invitee = Address::generate(&env);

    let code = client.generate_invite_code(&creator, &market_id, &2, &3600);
    let returned_market_id = client.redeem_invite_code(&invitee, &code);

    assert_eq!(returned_market_id, market_id);

    let stored_invite: InviteCode = env.as_contract(&client.address, || {
        env.storage()
            .persistent()
            .get(&DataKey::InviteCode(code.clone()))
            .unwrap()
    });
    assert_eq!(stored_invite.current_uses, 1);

    let allowlist: Vec<Address> = env.as_contract(&client.address, || {
        env.storage()
            .persistent()
            .get(&DataKey::MarketAllowlist(market_id))
            .unwrap()
    });
    assert!(allowlist.iter().any(|address| address == invitee));
}

#[test]
fn test_redeem_invite_code_invalid_code() {
    let env = Env::default();
    let (_, _, _, client) = setup_test(&env);
    let invitee = Address::generate(&env);

    let result = client.try_redeem_invite_code(&invitee, &Symbol::new(&env, "deadbeef"));
    assert!(matches!(
        result,
        Err(Ok(InsightArenaError::InvalidInviteCode))
    ));
}

#[test]
fn test_redeem_invite_code_deactivated() {
    let env = Env::default();
    let (creator, _, market_id, client) = setup_test(&env);
    let invitee = Address::generate(&env);

    let code = client.generate_invite_code(&creator, &market_id, &2, &3600);
    env.as_contract(&client.address, || {
        let mut invite: InviteCode = env
            .storage()
            .persistent()
            .get(&DataKey::InviteCode(code.clone()))
            .unwrap();
        invite.is_active = false;
        env.storage()
            .persistent()
            .set(&DataKey::InviteCode(code.clone()), &invite);
    });

    let result = client.try_redeem_invite_code(&invitee, &code);
    assert!(matches!(
        result,
        Err(Ok(InsightArenaError::InvalidInviteCode))
    ));
}

#[test]
fn test_redeem_invite_code_expired() {
    let env = Env::default();
    let (creator, _, market_id, client) = setup_test(&env);
    let invitee = Address::generate(&env);

    let code = client.generate_invite_code(&creator, &market_id, &2, &1);
    env.ledger().set_timestamp(env.ledger().timestamp() + 10);

    let result = client.try_redeem_invite_code(&invitee, &code);
    assert!(matches!(
        result,
        Err(Ok(InsightArenaError::InviteCodeExpired))
    ));
}

#[test]
fn test_redeem_invite_code_max_used() {
    let env = Env::default();
    let (creator, _, market_id, client) = setup_test(&env);
    let invitee1 = Address::generate(&env);
    let invitee2 = Address::generate(&env);

    let code = client.generate_invite_code(&creator, &market_id, &1, &3600);
    client.redeem_invite_code(&invitee1, &code);

    let result = client.try_redeem_invite_code(&invitee2, &code);
    assert!(matches!(
        result,
        Err(Ok(InsightArenaError::InviteCodeMaxUsed))
    ));
}

#[test]
fn test_redeem_invite_code_duplicate_redemption() {
    // Test that the same user cannot redeem the same code twice (already in allowlist)
    let env = Env::default();
    let (creator, _, market_id, client) = setup_test(&env);
    let invitee = Address::generate(&env);

    let code = client.generate_invite_code(&creator, &market_id, &5, &3600);
    client.redeem_invite_code(&invitee, &code);

    // Second redemption by the same user — use count increments but allowlist stays unchanged
    let result = client.try_redeem_invite_code(&invitee, &code);
    // Should succeed (not an error) since the code is still valid and has uses remaining
    assert!(result.is_ok());

    // Verify the invitee appears exactly once in the allowlist
    let allowlist: Vec<Address> = env.as_contract(&client.address, || {
        env.storage()
            .persistent()
            .get(&DataKey::MarketAllowlist(market_id))
            .unwrap()
    });
    let count = allowlist.iter().filter(|a| *a == invitee).count();
    assert_eq!(count, 1, "invitee should appear exactly once in allowlist");
}
