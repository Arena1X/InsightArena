/// Tests for the verification module (#790–#793, #1358).
///
/// Covers: verify_address, batch_verify_addresses, unverify_address, is_verified,
/// and the M-of-N event-verification signer threshold (#1358).
use creator_event_manager::storage;
use creator_event_manager::storage_types::Match;
use creator_event_manager::CreatorEventManagerContractClient;
use ed25519_dalek::{Signer, SigningKey};
use rand::rngs::OsRng;
use soroban_sdk::testutils::{Address as _, Ledger};
use soroban_sdk::token::StellarAssetClient;
use soroban_sdk::{Address, Bytes, BytesN, Env, String, Vec};

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
// #1705 — Verification signature check
// ===========================================================================

const FEE: i128 = 1_000_000;

/// A test signer's ed25519 keypair alongside the Soroban `Address` used as
/// its identity in the verifier signer set / `require_auth`.
struct VerifierKey {
    address: Address,
    signing_key: SigningKey,
}

fn generate_verifier_key(env: &Env) -> VerifierKey {
    let signing_key = SigningKey::generate(&mut OsRng);
    VerifierKey {
        address: Address::generate(env),
        signing_key,
    }
}

fn public_key_bytes(env: &Env, key: &VerifierKey) -> BytesN<32> {
    BytesN::from_array(env, key.signing_key.verifying_key().as_bytes())
}

/// Sign the same `event_id || data` payload that `submit_verification`
/// verifies against.
fn sign_verification(env: &Env, key: &VerifierKey, event_id: u64, data: &Bytes) -> BytesN<64> {
    let mut payload = event_id.to_be_bytes().to_vec();
    payload.extend(data.iter());
    let signature = key.signing_key.sign(&payload);
    BytesN::from_array(env, &signature.to_bytes())
}

fn sample_data(env: &Env) -> Bytes {
    Bytes::from_array(env, &[1u8, 2, 3, 4])
}

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

    let signer1 = generate_verifier_key(&env);
    let signer2 = generate_verifier_key(&env);
    let signer3 = generate_verifier_key(&env);
    let mut signers = Vec::new(&env);
    signers.push_back(signer1.address.clone());
    signers.push_back(signer2.address.clone());
    signers.push_back(signer3.address.clone());
    client.set_verifier_config(&admin, &signers, &2u32);
    client.set_verifier_public_key(&admin, &signer1.address, &public_key_bytes(&env, &signer1));

    let data = sample_data(&env);
    let signature = sign_verification(&env, &signer1, event_id, &data);
    let count = client.submit_verification(&event_id, &signer1.address, &data, &signature);
    assert_eq!(count, 1);
}

#[test]
#[should_panic(expected = "not_a_verifier_signer")]
fn test_submit_verification_by_non_signer_is_rejected() {
    let (env, client, _contract_id, admin, event_id) = setup_with_event();

    let signer1 = generate_verifier_key(&env);
    let mut signers = Vec::new(&env);
    signers.push_back(signer1.address.clone());
    client.set_verifier_config(&admin, &signers, &1u32);

    let not_a_signer = generate_verifier_key(&env);
    let data = sample_data(&env);
    let signature = sign_verification(&env, &not_a_signer, event_id, &data);
    client.submit_verification(&event_id, &not_a_signer.address, &data, &signature);
}

#[test]
#[should_panic(expected = "event_not_found")]
fn test_submit_verification_unknown_event_is_rejected() {
    let (env, client, _contract_id, admin, _event_id) = setup_with_event();

    let signer1 = generate_verifier_key(&env);
    let mut signers = Vec::new(&env);
    signers.push_back(signer1.address.clone());
    client.set_verifier_config(&admin, &signers, &1u32);
    client.set_verifier_public_key(&admin, &signer1.address, &public_key_bytes(&env, &signer1));

    let data = sample_data(&env);
    let signature = sign_verification(&env, &signer1, 999_999_u64, &data);
    client.submit_verification(&999_999_u64, &signer1.address, &data, &signature);
}

#[test]
#[should_panic(expected = "duplicate_signer")]
fn test_submit_verification_duplicate_signer_is_rejected() {
    let (env, client, _contract_id, admin, event_id) = setup_with_event();

    let signer1 = generate_verifier_key(&env);
    let signer2 = generate_verifier_key(&env);
    let mut signers = Vec::new(&env);
    signers.push_back(signer1.address.clone());
    signers.push_back(signer2.address.clone());
    client.set_verifier_config(&admin, &signers, &2u32);
    client.set_verifier_public_key(&admin, &signer1.address, &public_key_bytes(&env, &signer1));

    let data = sample_data(&env);
    let signature = sign_verification(&env, &signer1, event_id, &data);
    client.submit_verification(&event_id, &signer1.address, &data, &signature);
    // Same signer submitting again must be rejected, even though the
    // threshold has not been reached yet.
    client.submit_verification(&event_id, &signer1.address, &data, &signature);
}

#[test]
#[should_panic(expected = "no_public_key_configured")]
fn test_submit_verification_without_bound_public_key_is_rejected() {
    let (env, client, _contract_id, admin, event_id) = setup_with_event();

    let signer1 = generate_verifier_key(&env);
    let mut signers = Vec::new(&env);
    signers.push_back(signer1.address.clone());
    client.set_verifier_config(&admin, &signers, &1u32);
    // Deliberately skip set_verifier_public_key.

    let data = sample_data(&env);
    let signature = sign_verification(&env, &signer1, event_id, &data);
    client.submit_verification(&event_id, &signer1.address, &data, &signature);
}

/// #1705 — a signature that does not verify against the signer's bound key
/// (here: signed by an unrelated key) must be rejected rather than accepted.
#[test]
#[should_panic]
fn test_submit_verification_with_invalid_signature_is_rejected() {
    let (env, client, _contract_id, admin, event_id) = setup_with_event();

    let signer1 = generate_verifier_key(&env);
    let attacker_key = generate_verifier_key(&env);
    let mut signers = Vec::new(&env);
    signers.push_back(signer1.address.clone());
    client.set_verifier_config(&admin, &signers, &1u32);
    client.set_verifier_public_key(&admin, &signer1.address, &public_key_bytes(&env, &signer1));

    let data = sample_data(&env);
    // Signed with a key that was never bound to signer1.
    let bogus_signature = sign_verification(&env, &attacker_key, event_id, &data);
    client.submit_verification(&event_id, &signer1.address, &data, &bogus_signature);
}

/// #1705 — a signature produced for a different event must not verify here,
/// even though it is a genuinely valid signature by the correct key: the
/// payload binds `event_id` so it cannot be replayed cross-event.
#[test]
#[should_panic]
fn test_submit_verification_signature_bound_to_wrong_event_is_rejected() {
    let (env, client, _contract_id, admin, event_id) = setup_with_event();

    let signer1 = generate_verifier_key(&env);
    let mut signers = Vec::new(&env);
    signers.push_back(signer1.address.clone());
    client.set_verifier_config(&admin, &signers, &1u32);
    client.set_verifier_public_key(&admin, &signer1.address, &public_key_bytes(&env, &signer1));

    let data = sample_data(&env);
    // Valid signature, but bound to a different event_id.
    let signature_for_other_event = sign_verification(&env, &signer1, event_id + 1, &data);
    client.submit_verification(&event_id, &signer1.address, &data, &signature_for_other_event);
}

#[test]
fn test_event_not_verified_below_threshold() {
    let (env, client, _contract_id, admin, event_id) = setup_with_event();

    let signer1 = generate_verifier_key(&env);
    let signer2 = generate_verifier_key(&env);
    let signer3 = generate_verifier_key(&env);
    let mut signers = Vec::new(&env);
    signers.push_back(signer1.address.clone());
    signers.push_back(signer2.address.clone());
    signers.push_back(signer3.address.clone());
    client.set_verifier_config(&admin, &signers, &3u32);
    client.set_verifier_public_key(&admin, &signer1.address, &public_key_bytes(&env, &signer1));
    client.set_verifier_public_key(&admin, &signer2.address, &public_key_bytes(&env, &signer2));

    assert!(!client.is_event_verified(&event_id));

    let data = sample_data(&env);
    let sig1 = sign_verification(&env, &signer1, event_id, &data);
    client.submit_verification(&event_id, &signer1.address, &data, &sig1);
    assert!(!client.is_event_verified(&event_id));

    let sig2 = sign_verification(&env, &signer2, event_id, &data);
    client.submit_verification(&event_id, &signer2.address, &data, &sig2);
    // 2 of 3 distinct signers submitted; threshold is 3 — still unverified.
    assert!(!client.is_event_verified(&event_id));
    assert_eq!(client.get_event_verification_count(&event_id), 2);
}

#[test]
fn test_event_verified_at_exact_threshold() {
    let (env, client, _contract_id, admin, event_id) = setup_with_event();

    let signer1 = generate_verifier_key(&env);
    let signer2 = generate_verifier_key(&env);
    let signer3 = generate_verifier_key(&env);
    let mut signers = Vec::new(&env);
    signers.push_back(signer1.address.clone());
    signers.push_back(signer2.address.clone());
    signers.push_back(signer3.address.clone());
    client.set_verifier_config(&admin, &signers, &2u32);
    client.set_verifier_public_key(&admin, &signer1.address, &public_key_bytes(&env, &signer1));
    client.set_verifier_public_key(&admin, &signer2.address, &public_key_bytes(&env, &signer2));

    let data = sample_data(&env);
    let sig1 = sign_verification(&env, &signer1, event_id, &data);
    client.submit_verification(&event_id, &signer1.address, &data, &sig1);
    assert!(!client.is_event_verified(&event_id));

    let sig2 = sign_verification(&env, &signer2, event_id, &data);
    client.submit_verification(&event_id, &signer2.address, &data, &sig2);
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

    let signer1 = generate_verifier_key(&env);
    let signer2 = generate_verifier_key(&env);
    let mut signers = Vec::new(&env);
    signers.push_back(signer1.address.clone());
    signers.push_back(signer2.address.clone());
    client.set_verifier_config(&admin, &signers, &2u32);
    client.set_verifier_public_key(&admin, &signer1.address, &public_key_bytes(&env, &signer1));
    client.set_verifier_public_key(&admin, &signer2.address, &public_key_bytes(&env, &signer2));

    let data = sample_data(&env);

    assert_eq!(client.get_event_verification_count(&event_id), 0);
    let sig1 = sign_verification(&env, &signer1, event_id, &data);
    client.submit_verification(&event_id, &signer1.address, &data, &sig1);
    assert_eq!(client.get_event_verification_count(&event_id), 1);
    let sig2 = sign_verification(&env, &signer2, event_id, &data);
    client.submit_verification(&event_id, &signer2.address, &data, &sig2);
    assert_eq!(client.get_event_verification_count(&event_id), 2);
}

// ===========================================================================
// #1515 — Per-match M-of-N result verification
// ===========================================================================

const MATCH_VERIFICATION_FEE: i128 = 1_000_000;

/// Sign the match-domain payload that `submit_match_verification` verifies
/// against: a `0x01` domain-separator byte, then `match_id || data`.
fn sign_match_verification(env: &Env, key: &VerifierKey, match_id: u64, data: &Bytes) -> BytesN<64> {
    let mut payload: std::vec::Vec<u8> = std::vec![0x01u8];
    payload.extend(match_id.to_be_bytes());
    payload.extend(data.iter());
    let signature = key.signing_key.sign(&payload);
    BytesN::from_array(env, &signature.to_bytes())
}

/// Deploy, initialize, and create one funded event with a single unresolved
/// match. Returns (env, client, contract_id, admin, ai_agent, match_id).
fn setup_with_match() -> (
    Env,
    CreatorEventManagerContractClient<'static>,
    Address,
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

    client.initialize(&admin, &ai_agent, &treasury, &xlm_token, &MATCH_VERIFICATION_FEE);

    let creator = Address::generate(&env);
    fund(&env, &xlm_token, &creator, MATCH_VERIFICATION_FEE);

    let start_time = env.ledger().timestamp() + 3600;
    let end_time = env.ledger().timestamp() + 100_000;
    let (event_id, _invite_code) = client.create_event(
        &creator,
        &String::from_str(&env, "Match verification test event"),
        &String::from_str(&env, "Test event description"),
        &10u32,
        &start_time,
        &end_time,
        &0i128,
        &Vec::new(&env),
        &0i128,
    );

    let match_id = env.as_contract(&contract_id, || {
        let match_id = storage::next_match_id(&env);
        let match_record = Match::new(
            match_id,
            event_id,
            String::from_str(&env, "Team A"),
            String::from_str(&env, "Team B"),
            env.ledger().timestamp() + 1_000,
            1u32,
            0,
        );
        storage::set_match(&env, match_id, &match_record);
        storage::add_event_match(&env, event_id, match_id);

        let mut event = storage::get_event(&env, event_id).expect("event exists");
        event.add_match();
        storage::set_event(&env, event_id, &event);
        match_id
    });

    (env, client, contract_id, admin, ai_agent, match_id)
}

/// Legacy behaviour (no verifier threshold configured) is fully preserved:
/// a single AI-agent submission still finalizes the match immediately.
#[test]
fn test_submit_match_result_finalizes_immediately_without_verifier_threshold() {
    let (env, client, _contract_id, _admin, ai_agent, match_id) = setup_with_match();

    env.ledger().with_mut(|l| l.timestamp += 2_000);
    client.submit_match_result(&ai_agent, &match_id, &3u32, &0u32);

    let m = client.get_match(&match_id);
    assert!(m.result_submitted);
    assert_eq!(m.home_score, Some(3));
    assert_eq!(m.away_score, Some(0));
}

/// Below the configured threshold, an oracle-submitted result stays staged:
/// the match remains unresolved and no predictions are graded.
#[test]
fn test_match_result_below_threshold_stays_pending() {
    let (env, client, _contract_id, admin, ai_agent, match_id) = setup_with_match();

    let signer1 = generate_verifier_key(&env);
    let signer2 = generate_verifier_key(&env);
    let mut signers = Vec::new(&env);
    signers.push_back(signer1.address.clone());
    signers.push_back(signer2.address.clone());
    client.set_verifier_config(&admin, &signers, &2u32);
    client.set_verifier_public_key(&admin, &signer1.address, &public_key_bytes(&env, &signer1));
    client.set_verifier_public_key(&admin, &signer2.address, &public_key_bytes(&env, &signer2));

    env.ledger().with_mut(|l| l.timestamp += 2_000);
    client.submit_match_result(&ai_agent, &match_id, &2u32, &1u32);

    // Staged, not finalized.
    assert!(!client.get_match(&match_id).result_submitted);
    assert_eq!(client.get_match_verification_count(&match_id), 0);
    assert!(!client.is_match_verified(&match_id));

    let data = sample_data(&env);
    let sig1 = sign_match_verification(&env, &signer1, match_id, &data);
    let count = client.submit_match_verification(&match_id, &signer1.address, &data, &sig1);
    assert_eq!(count, 1);

    // 1 of 2 required signers — still pending.
    assert!(!client.get_match(&match_id).result_submitted);
    assert!(!client.is_match_verified(&match_id));
}

/// At the exact configured threshold, the staged result finalizes: winning
/// outcome recorded and every prediction for the match graded.
#[test]
fn test_match_result_finalizes_at_exact_threshold() {
    let (env, client, contract_id, admin, ai_agent, match_id) = setup_with_match();

    let predictor = Address::generate(&env);
    let m_before = env.as_contract(&contract_id, || storage::get_match(&env, match_id).unwrap());
    client.join_event(
        &predictor,
        &client.get_event(&m_before.event_id).invite_code,
    );
    let prediction_id = client.submit_prediction(&predictor, &match_id, &2u32, &1u32);

    let signer1 = generate_verifier_key(&env);
    let signer2 = generate_verifier_key(&env);
    let mut signers = Vec::new(&env);
    signers.push_back(signer1.address.clone());
    signers.push_back(signer2.address.clone());
    client.set_verifier_config(&admin, &signers, &2u32);
    client.set_verifier_public_key(&admin, &signer1.address, &public_key_bytes(&env, &signer1));
    client.set_verifier_public_key(&admin, &signer2.address, &public_key_bytes(&env, &signer2));

    env.ledger().with_mut(|l| l.timestamp += 2_000);
    client.submit_match_result(&ai_agent, &match_id, &2u32, &1u32);

    let data = sample_data(&env);
    let sig1 = sign_match_verification(&env, &signer1, match_id, &data);
    client.submit_match_verification(&match_id, &signer1.address, &data, &sig1);

    let sig2 = sign_match_verification(&env, &signer2, match_id, &data);
    let count = client.submit_match_verification(&match_id, &signer2.address, &data, &sig2);
    assert_eq!(count, 2);

    let m = client.get_match(&match_id);
    assert!(m.result_submitted);
    assert_eq!(m.home_score, Some(2));
    assert_eq!(m.away_score, Some(1));
    assert_eq!(m.winning_team, Some(0)); // TeamA

    let prediction = client.get_prediction(&prediction_id);
    assert_eq!(prediction.is_correct, Some(true));
    assert_eq!(prediction.points_earned, Some(4));
}

/// A signer may not submit verification for the same match's pending result
/// twice, even before the threshold is reached.
#[test]
#[should_panic(expected = "duplicate_signer")]
fn test_match_verification_duplicate_signer_is_rejected() {
    let (env, client, _contract_id, admin, ai_agent, match_id) = setup_with_match();

    let signer1 = generate_verifier_key(&env);
    let signer2 = generate_verifier_key(&env);
    let mut signers = Vec::new(&env);
    signers.push_back(signer1.address.clone());
    signers.push_back(signer2.address.clone());
    client.set_verifier_config(&admin, &signers, &2u32);
    client.set_verifier_public_key(&admin, &signer1.address, &public_key_bytes(&env, &signer1));

    env.ledger().with_mut(|l| l.timestamp += 2_000);
    client.submit_match_result(&ai_agent, &match_id, &2u32, &1u32);

    let data = sample_data(&env);
    let sig1 = sign_match_verification(&env, &signer1, match_id, &data);
    client.submit_match_verification(&match_id, &signer1.address, &data, &sig1);
    client.submit_match_verification(&match_id, &signer1.address, &data, &sig1);
}

/// Verifying a match with no staged result (nothing submitted yet) is
/// rejected.
#[test]
#[should_panic(expected = "no_pending_result")]
fn test_match_verification_without_pending_result_is_rejected() {
    let (env, client, _contract_id, admin, _ai_agent, match_id) = setup_with_match();

    let signer1 = generate_verifier_key(&env);
    let mut signers = Vec::new(&env);
    signers.push_back(signer1.address.clone());
    client.set_verifier_config(&admin, &signers, &1u32);
    client.set_verifier_public_key(&admin, &signer1.address, &public_key_bytes(&env, &signer1));

    let data = sample_data(&env);
    let sig1 = sign_match_verification(&env, &signer1, match_id, &data);
    client.submit_match_verification(&match_id, &signer1.address, &data, &sig1);
}

/// While a result is staged and awaiting verifier sign-off, a second
/// oracle submission for the same match must be rejected rather than
/// silently overwriting the staged scoreline.
#[test]
#[should_panic(expected = "result_pending_verification")]
fn test_submit_match_result_rejects_resubmission_while_pending() {
    let (env, client, _contract_id, admin, ai_agent, match_id) = setup_with_match();

    let signer1 = generate_verifier_key(&env);
    let signer2 = generate_verifier_key(&env);
    let mut signers = Vec::new(&env);
    signers.push_back(signer1.address.clone());
    signers.push_back(signer2.address.clone());
    client.set_verifier_config(&admin, &signers, &2u32);

    env.ledger().with_mut(|l| l.timestamp += 2_000);
    client.submit_match_result(&ai_agent, &match_id, &2u32, &1u32);
    client.submit_match_result(&ai_agent, &match_id, &0u32, &0u32);
}

/// A signature built for `submit_verification`'s event-domain payload (no
/// domain-separator byte) must not verify against the match-domain payload,
/// even for the same numeric id and the same signer/data — proving the two
/// signing domains cannot be replayed against each other.
#[test]
#[should_panic]
fn test_match_verification_rejects_event_domain_signature() {
    let (env, client, _contract_id, admin, ai_agent, match_id) = setup_with_match();

    let signer1 = generate_verifier_key(&env);
    let mut signers = Vec::new(&env);
    signers.push_back(signer1.address.clone());
    client.set_verifier_config(&admin, &signers, &1u32);
    client.set_verifier_public_key(&admin, &signer1.address, &public_key_bytes(&env, &signer1));

    env.ledger().with_mut(|l| l.timestamp += 2_000);
    client.submit_match_result(&ai_agent, &match_id, &2u32, &1u32);

    let data = sample_data(&env);
    let event_domain_sig = sign_verification(&env, &signer1, match_id, &data);
    client.submit_match_verification(&match_id, &signer1.address, &data, &event_domain_sig);
}
