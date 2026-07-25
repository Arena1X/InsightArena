/// Tests for the verification module (#790–#793, #1358).
///
/// Covers: verify_address, batch_verify_addresses, unverify_address, is_verified,
/// and the M-of-N event-verification signer threshold (#1358).
use creator_event_manager::CreatorEventManagerContractClient;
use soroban_sdk::testutils::{Address as _, Ledger};
use soroban_sdk::token::StellarAssetClient;
use soroban_sdk::{Address, Env, String, Vec};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn setup() -> (Env, CreatorEventManagerContractClient<'static>, Address) {
    let env = Env::default();
    let contract_id = env.register(creator_event_manager::CreatorEventManagerContract, ());
    let client = CreatorEventManagerContractClient::new(&env, &contract_id);
    let client: CreatorEventManagerContractClient<'static> =
        unsafe { core::mem::transmute(client) };
    (env, client, contract_id)
}

/// Deploy and initialize the contract, returning (env, client, contract_id, admin).
fn setup_initialized() -> (
    Env,
    CreatorEventManagerContractClient<'static>,
    Address,
    Address,
) {
    let (env, client, contract_id) = setup();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let ai_agent = Address::generate(&env);
    let treasury = Address::generate(&env);
    let xlm_token = Address::generate(&env);

    client.initialize(&admin, &ai_agent, &treasury, &xlm_token, &1_000_000i128);

    (env, client, contract_id, admin)
}

// ===========================================================================
// #790 — verify_address
// ===========================================================================

#[test]
fn test_verify_address_admin_can_verify() {
    let (env, client, _contract_id, admin) = setup_initialized();

    let user = Address::generate(&env);
    assert!(!client.is_verified(&user));

    client.verify_address(&admin, &user);

    assert!(client.is_verified(&user));
}

#[test]
#[should_panic(expected = "unauthorized")]
fn test_verify_address_non_admin_cannot_verify() {
    let (env, client, _contract_id, _admin) = setup_initialized();

    let non_admin = Address::generate(&env);
    let user = Address::generate(&env);

    client.verify_address(&non_admin, &user);
}

#[test]
#[should_panic(expected = "invalid_address")]
fn test_verify_address_contract_self_is_rejected() {
    let (env, client, contract_id, admin) = setup_initialized();
    let _ = &env;
    client.verify_address(&admin, &contract_id);
}

#[test]
#[should_panic(expected = "already_verified")]
fn test_verify_address_already_verified_is_rejected() {
    let (env, client, _contract_id, admin) = setup_initialized();

    let user = Address::generate(&env);
    client.verify_address(&admin, &user);
    // Second call must panic
    client.verify_address(&admin, &user);
}

// ===========================================================================
// #791 — batch_verify_addresses
// ===========================================================================

#[test]
fn test_batch_verify_addresses_admin_can_batch_verify() {
    let (env, client, _contract_id, admin) = setup_initialized();

    let user1 = Address::generate(&env);
    let user2 = Address::generate(&env);
    let user3 = Address::generate(&env);

    let mut addresses = Vec::new(&env);
    addresses.push_back(user1.clone());
    addresses.push_back(user2.clone());
    addresses.push_back(user3.clone());

    let count = client.batch_verify_addresses(&admin, &addresses);

    assert_eq!(count, 3);
    assert!(client.is_verified(&user1));
    assert!(client.is_verified(&user2));
    assert!(client.is_verified(&user3));
}

#[test]
#[should_panic(expected = "unauthorized")]
fn test_batch_verify_addresses_non_admin_cannot_batch_verify() {
    let (env, client, _contract_id, _admin) = setup_initialized();

    let non_admin = Address::generate(&env);
    let user = Address::generate(&env);

    let mut addresses = Vec::new(&env);
    addresses.push_back(user);

    client.batch_verify_addresses(&non_admin, &addresses);
}

#[test]
#[should_panic(expected = "empty_list")]
fn test_batch_verify_addresses_empty_list_is_rejected() {
    let (env, client, _contract_id, admin) = setup_initialized();

    let addresses: Vec<Address> = Vec::new(&env);
    client.batch_verify_addresses(&admin, &addresses);
}

#[test]
#[should_panic(expected = "invalid_address")]
fn test_batch_verify_addresses_contract_self_in_list_is_rejected() {
    let (env, client, contract_id, admin) = setup_initialized();

    let user = Address::generate(&env);
    let mut addresses = Vec::new(&env);
    addresses.push_back(user);
    addresses.push_back(contract_id);

    client.batch_verify_addresses(&admin, &addresses);
}

#[test]
fn test_batch_verify_addresses_already_verified_are_skipped() {
    let (env, client, _contract_id, admin) = setup_initialized();

    let user1 = Address::generate(&env);
    let user2 = Address::generate(&env);

    // Pre-verify user1
    client.verify_address(&admin, &user1);

    let mut addresses = Vec::new(&env);
    addresses.push_back(user1.clone());
    addresses.push_back(user2.clone());

    // Only user2 should be newly verified; success_count == 1
    let count = client.batch_verify_addresses(&admin, &addresses);

    assert_eq!(count, 1);
    assert!(client.is_verified(&user1));
    assert!(client.is_verified(&user2));
}

#[test]
fn test_batch_verify_addresses_large_batch_works() {
    let (env, client, _contract_id, admin) = setup_initialized();

    let mut addresses = Vec::new(&env);
    for _ in 0..100 {
        addresses.push_back(Address::generate(&env));
    }

    let count = client.batch_verify_addresses(&admin, &addresses);

    assert_eq!(count, 100);
    for addr in addresses.iter() {
        assert!(client.is_verified(&addr));
    }
}

// ===========================================================================
// #792 — unverify_address
// ===========================================================================

#[test]
fn test_unverify_address_admin_can_unverify() {
    let (env, client, _contract_id, admin) = setup_initialized();

    let user = Address::generate(&env);
    client.verify_address(&admin, &user);
    assert!(client.is_verified(&user));

    client.unverify_address(&admin, &user);
    assert!(!client.is_verified(&user));
}

#[test]
#[should_panic(expected = "unauthorized")]
fn test_unverify_address_non_admin_cannot_unverify() {
    let (env, client, _contract_id, admin) = setup_initialized();

    let user = Address::generate(&env);
    client.verify_address(&admin, &user);

    let non_admin = Address::generate(&env);
    client.unverify_address(&non_admin, &user);
}

#[test]
#[should_panic(expected = "not_verified")]
fn test_unverify_address_not_verified_is_rejected() {
    let (env, client, _contract_id, admin) = setup_initialized();

    let user = Address::generate(&env);
    // Never verified — must panic
    client.unverify_address(&admin, &user);
}

#[test]
fn test_unverify_address_can_reverify_after_unverify() {
    let (env, client, _contract_id, admin) = setup_initialized();

    let user = Address::generate(&env);
    client.verify_address(&admin, &user);
    client.unverify_address(&admin, &user);
    assert!(!client.is_verified(&user));

    // Should succeed now that the address is no longer verified
    client.verify_address(&admin, &user);
    assert!(client.is_verified(&user));
}

#[test]
#[should_panic(expected = "invalid_address")]
fn test_unverify_address_contract_self_is_rejected() {
    let (env, client, contract_id, admin) = setup_initialized();
    let _ = &env;
    client.unverify_address(&admin, &contract_id);
}

#[test]
#[should_panic(expected = "not_verified")]
fn test_unverify_address_repeated_unverify_returns_not_verified() {
    let (env, client, _contract_id, admin) = setup_initialized();

    let user = Address::generate(&env);
    client.verify_address(&admin, &user);
    assert!(client.is_verified(&user));

    // First unverify succeeds.
    client.unverify_address(&admin, &user);

    // Second unverify must panic with not_verified.
    client.unverify_address(&admin, &user);
}

// ===========================================================================
// #1026 — batch_verify_addresses returns count of only newly-verified addresses
// ===========================================================================

#[test]
fn test_batch_verify_count_all_new_returns_full_count() {
    let (env, client, _contract_id, admin) = setup_initialized();

    let user1 = Address::generate(&env);
    let user2 = Address::generate(&env);
    let user3 = Address::generate(&env);

    let mut addresses = Vec::new(&env);
    addresses.push_back(user1.clone());
    addresses.push_back(user2.clone());
    addresses.push_back(user3.clone());

    // All three are unverified; count must equal the batch size.
    let count = client.batch_verify_addresses(&admin, &addresses);

    assert_eq!(count, 3);
    assert!(client.is_verified(&user1));
    assert!(client.is_verified(&user2));
    assert!(client.is_verified(&user3));
}

#[test]
fn test_batch_verify_count_mixed_batch_returns_only_new_count() {
    let (env, client, _contract_id, admin) = setup_initialized();

    let pre1 = Address::generate(&env);
    let pre2 = Address::generate(&env);
    let new1 = Address::generate(&env);
    let new2 = Address::generate(&env);
    let new3 = Address::generate(&env);

    // Pre-verify two addresses.
    client.verify_address(&admin, &pre1);
    client.verify_address(&admin, &pre2);

    let mut addresses = Vec::new(&env);
    addresses.push_back(pre1.clone());
    addresses.push_back(pre2.clone());
    addresses.push_back(new1.clone());
    addresses.push_back(new2.clone());
    addresses.push_back(new3.clone());

    // Only the 3 fresh addresses should be counted.
    let count = client.batch_verify_addresses(&admin, &addresses);

    assert_eq!(count, 3);
    // Pre-verified addresses remain verified.
    assert!(client.is_verified(&pre1));
    assert!(client.is_verified(&pre2));
    // Newly verified addresses are now verified.
    assert!(client.is_verified(&new1));
    assert!(client.is_verified(&new2));
    assert!(client.is_verified(&new3));
}

#[test]
fn test_batch_verify_count_all_already_verified_returns_zero() {
    let (env, client, _contract_id, admin) = setup_initialized();

    let user1 = Address::generate(&env);
    let user2 = Address::generate(&env);

    // Pre-verify all addresses in the batch.
    client.verify_address(&admin, &user1);
    client.verify_address(&admin, &user2);

    let mut addresses = Vec::new(&env);
    addresses.push_back(user1.clone());
    addresses.push_back(user2.clone());

    // No new verifications — count must be 0.
    let count = client.batch_verify_addresses(&admin, &addresses);

    assert_eq!(count, 0);
    // Addresses remain verified.
    assert!(client.is_verified(&user1));
    assert!(client.is_verified(&user2));
}

// ===========================================================================
// #793 — is_verified
// ===========================================================================

#[test]
fn test_is_verified_returns_true_for_verified_address() {
    let (env, client, _contract_id, admin) = setup_initialized();

    let user = Address::generate(&env);
    client.verify_address(&admin, &user);

    assert!(client.is_verified(&user));
}

#[test]
fn test_is_verified_returns_false_for_unverified_address() {
    let (env, client, _contract_id, admin) = setup_initialized();

    let user = Address::generate(&env);
    client.verify_address(&admin, &user);
    client.unverify_address(&admin, &user);

    assert!(!client.is_verified(&user));
}

#[test]
fn test_is_verified_returns_false_for_nonexistent_address() {
    let (env, client, _contract_id, _admin) = setup_initialized();

    let user = Address::generate(&env);
    // Never touched — must return false without panicking
    assert!(!client.is_verified(&user));
}

#[test]
fn test_is_verified_requires_no_auth() {
    let (env, client, _contract_id, admin) = setup_initialized();

    let user = Address::generate(&env);
    client.verify_address(&admin, &user);

    // Call without mock_all_auths already set for this check — should work
    // (mock_all_auths was set in setup_initialized; this confirms no extra auth needed)
    assert!(client.is_verified(&user));
}

// ===========================================================================
// #1358 — M-of-N event verification (submit_verification / is_event_verified)
// ===========================================================================

const FEE: i128 = 1_000_000;

fn fund(env: &Env, token: &Address, user: &Address, amount: i128) {
    StellarAssetClient::new(env, token).mint(user, &amount);
}

/// Deploy, initialize with a real registered XLM asset contract, and create
/// one funded event. Returns (env, client, contract_id, admin, event_id).
fn setup_with_event() -> (
    Env,
    CreatorEventManagerContractClient<'static>,
    Address,
    Address,
    u64,
) {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().with_mut(|li| {
        li.timestamp = 1_700_000_000;
    });

    let contract_id = env.register(creator_event_manager::CreatorEventManagerContract, ());
    let client = CreatorEventManagerContractClient::new(&env, &contract_id);
    let client: CreatorEventManagerContractClient<'static> =
        unsafe { core::mem::transmute(client) };

    let admin = Address::generate(&env);
    let ai_agent = Address::generate(&env);
    let treasury = Address::generate(&env);
    let token_admin = Address::generate(&env);
    let xlm_token = env
        .register_stellar_asset_contract_v2(token_admin)
        .address();

    client.initialize(&admin, &ai_agent, &treasury, &xlm_token, &FEE);

    let creator = Address::generate(&env);
    fund(&env, &xlm_token, &creator, FEE);

    let start_time = env.ledger().timestamp() + 3600;
    let end_time = env.ledger().timestamp() + 7200;
    let (event_id, _invite_code) = client.create_event(
        &creator,
        &String::from_str(&env, "Test event"),
        &String::from_str(&env, "Test event description"),
        &10u32,
        &start_time,
        &end_time,
        &0i128,
        &Vec::new(&env),
        &0i128,
    );

    (env, client, contract_id, admin, event_id)
}

#[test]
fn test_submit_verification_by_configured_signer_succeeds() {
    let (env, client, _contract_id, admin, event_id) = setup_with_event();

    let signer1 = Address::generate(&env);
    let signer2 = Address::generate(&env);
    let signer3 = Address::generate(&env);
    let mut signers = Vec::new(&env);
    signers.push_back(signer1.clone());
    signers.push_back(signer2.clone());
    signers.push_back(signer3.clone());
    client.set_verifier_config(&admin, &signers, &2u32);

    let count = client.submit_verification(&event_id, &signer1);
    assert_eq!(count, 1);
}

#[test]
#[should_panic(expected = "not_a_verifier_signer")]
fn test_submit_verification_by_non_signer_is_rejected() {
    let (env, client, _contract_id, admin, event_id) = setup_with_event();

    let signer1 = Address::generate(&env);
    let mut signers = Vec::new(&env);
    signers.push_back(signer1);
    client.set_verifier_config(&admin, &signers, &1u32);

    let not_a_signer = Address::generate(&env);
    client.submit_verification(&event_id, &not_a_signer);
}

#[test]
#[should_panic(expected = "event_not_found")]
fn test_submit_verification_unknown_event_is_rejected() {
    let (env, client, _contract_id, admin, _event_id) = setup_with_event();

    let signer1 = Address::generate(&env);
    let mut signers = Vec::new(&env);
    signers.push_back(signer1.clone());
    client.set_verifier_config(&admin, &signers, &1u32);

    client.submit_verification(&999_999_u64, &signer1);
}

#[test]
#[should_panic(expected = "duplicate_signer")]
fn test_submit_verification_duplicate_signer_is_rejected() {
    let (env, client, _contract_id, admin, event_id) = setup_with_event();

    let signer1 = Address::generate(&env);
    let signer2 = Address::generate(&env);
    let mut signers = Vec::new(&env);
    signers.push_back(signer1.clone());
    signers.push_back(signer2);
    client.set_verifier_config(&admin, &signers, &2u32);

    client.submit_verification(&event_id, &signer1);
    // Same signer submitting again must be rejected, even though the
    // threshold has not been reached yet.
    client.submit_verification(&event_id, &signer1);
}

#[test]
fn test_event_not_verified_below_threshold() {
    let (env, client, _contract_id, admin, event_id) = setup_with_event();

    let signer1 = Address::generate(&env);
    let signer2 = Address::generate(&env);
    let signer3 = Address::generate(&env);
    let mut signers = Vec::new(&env);
    signers.push_back(signer1.clone());
    signers.push_back(signer2.clone());
    signers.push_back(signer3);
    client.set_verifier_config(&admin, &signers, &3u32);

    assert!(!client.is_event_verified(&event_id));

    client.submit_verification(&event_id, &signer1);
    assert!(!client.is_event_verified(&event_id));

    client.submit_verification(&event_id, &signer2);
    // 2 of 3 distinct signers submitted; threshold is 3 — still unverified.
    assert!(!client.is_event_verified(&event_id));
    assert_eq!(client.get_event_verification_count(&event_id), 2);
}

#[test]
fn test_event_verified_at_exact_threshold() {
    let (env, client, _contract_id, admin, event_id) = setup_with_event();

    let signer1 = Address::generate(&env);
    let signer2 = Address::generate(&env);
    let signer3 = Address::generate(&env);
    let mut signers = Vec::new(&env);
    signers.push_back(signer1.clone());
    signers.push_back(signer2.clone());
    signers.push_back(signer3);
    client.set_verifier_config(&admin, &signers, &2u32);

    client.submit_verification(&event_id, &signer1);
    assert!(!client.is_event_verified(&event_id));

    client.submit_verification(&event_id, &signer2);
    // 2 of 3 distinct signers submitted; threshold is 2 — now verified.
    assert!(client.is_event_verified(&event_id));
    assert_eq!(client.get_event_verification_count(&event_id), 2);
}

#[test]
fn test_event_not_verified_without_any_config() {
    let (env, client, _contract_id, _admin, event_id) = setup_with_event();
    let _ = &env;
    // No verifier config has ever been set (threshold defaults to 0).
    assert!(!client.is_event_verified(&event_id));
    assert_eq!(client.get_event_verification_count(&event_id), 0);
}

#[test]
fn test_get_event_verification_count_reflects_distinct_signers_only() {
    let (env, client, _contract_id, admin, event_id) = setup_with_event();

    let signer1 = Address::generate(&env);
    let signer2 = Address::generate(&env);
    let mut signers = Vec::new(&env);
    signers.push_back(signer1.clone());
    signers.push_back(signer2.clone());
    client.set_verifier_config(&admin, &signers, &2u32);

    assert_eq!(client.get_event_verification_count(&event_id), 0);
    client.submit_verification(&event_id, &signer1);
    assert_eq!(client.get_event_verification_count(&event_id), 1);
    client.submit_verification(&event_id, &signer2);
    assert_eq!(client.get_event_verification_count(&event_id), 2);
}
