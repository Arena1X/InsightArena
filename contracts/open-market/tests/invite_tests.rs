use insightarena_contract::errors::InsightArenaError;
use insightarena_contract::market::CreateMarketParams;
use insightarena_contract::storage_types::{DataKey, InviteCode};
use insightarena_contract::{InsightArenaContract, InsightArenaContractClient};
use soroban_sdk::testutils::{Address as _, Ledger as _};
use soroban_sdk::{vec, Address, Env, String, Symbol, Vec, BytesN};

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
        metadata_hash: BytesN::from_array(env, &[0u8; 32]),
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

#[test]
fn test_invite_code_expiration_blocks_redemption() {
    let env = Env::default();
    let (creator, _, market_id, client) = setup_test(&env);
    let invitee = Address::generate(&env);

    // Create a code that expires in 100 seconds
    let code = client.generate_invite_code(&creator, &market_id, &5, &100);

    // Advance time past expiry
    env.ledger().set_timestamp(env.ledger().timestamp() + 200);

    let result = client.try_redeem_invite_code(&invitee, &code);
    assert!(matches!(
        result,
        Err(Ok(InsightArenaError::InviteCodeExpired))
    ));
}

#[test]
fn test_invite_code_usage_limit_blocks_extra_redemptions() {
    let env = Env::default();
    let (creator, _, market_id, client) = setup_test(&env);

    // Code allows exactly 2 uses
    let code = client.generate_invite_code(&creator, &market_id, &2, &3600);

    let invitee1 = Address::generate(&env);
    let invitee2 = Address::generate(&env);
    let invitee3 = Address::generate(&env);

    client.redeem_invite_code(&invitee1, &code);
    client.redeem_invite_code(&invitee2, &code);

    // Third redemption must fail
    let result = client.try_redeem_invite_code(&invitee3, &code);
    assert!(matches!(
        result,
        Err(Ok(InsightArenaError::InviteCodeMaxUsed))
    ));
}

#[test]
fn test_multiple_invite_codes_per_market() {
    let env = Env::default();
    let (creator, _, market_id, client) = setup_test(&env);

    let code1 = client.generate_invite_code(&creator, &market_id, &5, &3600);

    // Advance time so hash differs
    env.ledger().set_timestamp(env.ledger().timestamp() + 1);

    let code2 = client.generate_invite_code(&creator, &market_id, &3, &7200);

    // Codes must be distinct
    assert_ne!(code1, code2);

    // Both codes are independently redeemable for the same market
    let invitee1 = Address::generate(&env);
    let invitee2 = Address::generate(&env);

    let mid1 = client.redeem_invite_code(&invitee1, &code1);
    let mid2 = client.redeem_invite_code(&invitee2, &code2);

    assert_eq!(mid1, market_id);
    assert_eq!(mid2, market_id);

    // Both invitees are in the allowlist
    let allowlist: Vec<Address> = env.as_contract(&client.address, || {
        env.storage()
            .persistent()
            .get(&DataKey::MarketAllowlist(market_id))
            .unwrap()
    });
    assert!(allowlist.iter().any(|a| a == invitee1));
    assert!(allowlist.iter().any(|a| a == invitee2));
}

#[test]
fn test_generate_invite_code_rejects_public_market() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let oracle = Address::generate(&env);
    let creator = Address::generate(&env);
    let xlm_token = env
        .register_stellar_asset_contract_v2(admin.clone())
        .address();

    let contract_id = env.register(InsightArenaContract, ());
    let client = InsightArenaContractClient::new(&env, &contract_id);
    client.initialize(&admin, &oracle, &200, &xlm_token);

    // Create a PUBLIC market
    let params = CreateMarketParams {
        title: String::from_str(&env, "Public Market"),
        description: String::from_str(&env, "Open to all"),
        category: Symbol::new(&env, "Sports"),
        outcomes: vec![&env, Symbol::new(&env, "TeamA"), Symbol::new(&env, "TeamB")],
        end_time: 200,
        resolution_time: 300,
        dispute_window: 86_400,
        creator_fee_bps: 100,
        min_stake: 10_000_000,
        max_stake: 100_000_000,
        is_public: true,
        metadata_hash: BytesN::from_array(&env, &[0u8; 32]),
    };
    let market_id = client.create_market(&creator, &params);

    let result = client.try_generate_invite_code(&creator, &market_id, &10, &3600);
    assert!(matches!(result, Err(Ok(InsightArenaError::InvalidInput))));
}

#[test]
fn test_generate_invite_code_succeeds_for_private_market() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let oracle = Address::generate(&env);
    let creator = Address::generate(&env);
    let xlm_token = env
        .register_stellar_asset_contract_v2(admin.clone())
        .address();

    let contract_id = env.register(InsightArenaContract, ());
    let client = InsightArenaContractClient::new(&env, &contract_id);
    client.initialize(&admin, &oracle, &200, &xlm_token);

    // Create a PRIVATE market
    let params = CreateMarketParams {
        title: String::from_str(&env, "Private Market"),
        description: String::from_str(&env, "Invite only"),
        category: Symbol::new(&env, "Sports"),
        outcomes: vec![&env, Symbol::new(&env, "TeamA"), Symbol::new(&env, "TeamB")],
        end_time: 200,
        resolution_time: 300,
        dispute_window: 86_400,
        creator_fee_bps: 100,
        min_stake: 10_000_000,
        max_stake: 100_000_000,
        is_public: false,
        metadata_hash: BytesN::from_array(&env, &[0u8; 32]),
    };
    let market_id = client.create_market(&creator, &params);

    let result = client.try_generate_invite_code(&creator, &market_id, &10, &3600);
    assert!(result.is_ok());
}

#[test]
fn test_generate_invite_code_fails_when_paused() {
    let env = Env::default();
    let (creator, _, market_id, client) = setup_test(&env);

    client.set_paused(&true, &1u32);

    let result = client.try_generate_invite_code(&creator, &market_id, &10, &3600);
    assert!(matches!(result, Err(Ok(InsightArenaError::Paused))));
}

#[test]
fn test_redeem_invite_code_fails_when_paused() {
    let env = Env::default();
    let (creator, _, market_id, client) = setup_test(&env);
    let invitee = Address::generate(&env);

    let code = client.generate_invite_code(&creator, &market_id, &2, &3600);

    client.set_paused(&true, &1u32);

    let result = client.try_redeem_invite_code(&invitee, &code);
    assert!(matches!(result, Err(Ok(InsightArenaError::Paused))));
}

#[test]
fn test_revoke_invite_code_fails_when_paused() {
    let env = Env::default();
    let (creator, _, market_id, client) = setup_test(&env);

    let code = client.generate_invite_code(&creator, &market_id, &2, &3600);

    client.set_paused(&true, &1u32);

    let result = client.try_revoke_invite_code(&creator, &code);
    assert!(matches!(result, Err(Ok(InsightArenaError::Paused))));
}

fn setup_test_with_token(
    env: &Env,
) -> (Address, Address, Address, u64, InsightArenaContractClient<'_>) {
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
        metadata_hash: BytesN::from_array(env, &[0u8; 32]),
    };

    let market_id = client.create_market(&creator, &params);
    (creator, oracle, xlm_token, market_id, client)
}

fn fund(env: &Env, token: &Address, to: &Address, amount: i128) {
    let client = soroban_sdk::token::StellarAssetClient::new(env, token);
    client.mint(to, &amount);
}

#[test]
fn test_non_invited_address_cannot_participate_in_private_market() {
    let env = Env::default();
    let (_creator, _oracle, xlm_token, market_id, client) = setup_test_with_token(&env);

    let non_invited = Address::generate(&env);
    let stake = 20_000_000_i128;
    fund(&env, &xlm_token, &non_invited, stake);

    // 1. Participant authorization query should report false
    assert!(!client.is_participant_authorized(&market_id, &non_invited));

    // 2. Direct market access check must revert with Unauthorized
    let access_result = client.try_check_market_access(&market_id, &non_invited);
    assert!(matches!(
        access_result,
        Err(Ok(InsightArenaError::Unauthorized))
    ));

    // 3. Submitting prediction must be rejected with Unauthorized
    let pred_result = client.try_submit_prediction(
        &non_invited,
        &market_id,
        &Symbol::new(&env, "TeamA"),
        &stake,
    );
    assert!(matches!(
        pred_result,
        Err(Ok(InsightArenaError::Unauthorized))
    ));

    // 4. Verify no prediction record exists
    assert!(!client.has_predicted(&market_id, &non_invited));
}

#[test]
fn test_invited_address_can_participate_in_private_market() {
    let env = Env::default();
    let (creator, _oracle, xlm_token, market_id, client) = setup_test_with_token(&env);

    let invited = Address::generate(&env);
    let stake = 20_000_000_i128;
    fund(&env, &xlm_token, &invited, stake);

    // Before redeeming invite, cannot participate
    assert!(!client.is_participant_authorized(&market_id, &invited));

    // Generate and redeem invite code
    let code = client.generate_invite_code(&creator, &market_id, &5, &3600);
    let redeemed_market_id = client.redeem_invite_code(&invited, &code);
    assert_eq!(redeemed_market_id, market_id);

    // After redeeming invite, participant is authorized
    assert!(client.is_participant_authorized(&market_id, &invited));

    let access_result = client.try_check_market_access(&market_id, &invited);
    assert!(matches!(access_result, Ok(Ok(()))));

    // Submit prediction succeeds
    client.submit_prediction(&invited, &market_id, &Symbol::new(&env, "TeamA"), &stake);
    assert!(client.has_predicted(&market_id, &invited));
}

#[test]
fn test_public_market_ignores_invite_gating() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let oracle = Address::generate(&env);
    let creator = Address::generate(&env);
    let xlm_token = env
        .register_stellar_asset_contract_v2(admin.clone())
        .address();

    let contract_id = env.register(InsightArenaContract, ());
    let client = InsightArenaContractClient::new(&env, &contract_id);
    client.initialize(&admin, &oracle, &200, &xlm_token);

    // Create a PUBLIC market
    let params = CreateMarketParams {
        title: String::from_str(&env, "Public Market"),
        description: String::from_str(&env, "Anyone can join"),
        category: Symbol::new(&env, "Sports"),
        outcomes: vec![&env, Symbol::new(&env, "TeamA"), Symbol::new(&env, "TeamB")],
        end_time: 200,
        resolution_time: 300,
        dispute_window: 86_400,
        creator_fee_bps: 100,
        min_stake: 10_000_000,
        max_stake: 100_000_000,
        is_public: true,
        metadata_hash: BytesN::from_array(&env, &[0u8; 32]),
    };
    let market_id = client.create_market(&creator, &params);

    // Any arbitrary address with NO invite code
    let any_predictor = Address::generate(&env);
    let stake = 20_000_000_i128;
    fund(&env, &xlm_token, &any_predictor, stake);

    // Public market authorizes any participant
    assert!(client.is_participant_authorized(&market_id, &any_predictor));
    let access_result = client.try_check_market_access(&market_id, &any_predictor);
    assert!(matches!(access_result, Ok(Ok(()))));

    // Prediction succeeds without any invite
    client.submit_prediction(
        &any_predictor,
        &market_id,
        &Symbol::new(&env, "TeamA"),
        &stake,
    );
    assert!(client.has_predicted(&market_id, &any_predictor));
}

#[test]
fn test_commit_prediction_private_market_access_gating() {
    let env = Env::default();
    let (creator, _oracle, _xlm_token, market_id, client) = setup_test_with_token(&env);

    let uninvited = Address::generate(&env);
    let invited = Address::generate(&env);
    let hash = BytesN::from_array(&env, &[1u8; 32]);

    // Uninvited cannot commit prediction
    let uninvited_commit = client.try_commit_prediction(&uninvited, &market_id, &hash, &60);
    assert!(matches!(
        uninvited_commit,
        Err(Ok(InsightArenaError::Unauthorized))
    ));

    // Invited user redeems code and can commit prediction
    let code = client.generate_invite_code(&creator, &market_id, &5, &3600);
    client.redeem_invite_code(&invited, &code);

    let invited_commit = client.try_commit_prediction(&invited, &market_id, &hash, &60);
    assert!(invited_commit.is_ok());
}

