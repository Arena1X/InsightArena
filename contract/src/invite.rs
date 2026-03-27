use crate::errors::InsightArenaError;
use crate::market;
use crate::storage_types::{DataKey, InviteCode};
use crate::ttl;
use soroban_sdk::xdr::ToXdr;
use soroban_sdk::{symbol_short, Address, Env, IntoVal, Symbol, Val, Vec};

/// Generate a unique 8-character invite code for a private market.
///
/// Validation:
/// 1. `creator` must be the actual market creator.
/// 2. `max_uses` must be at least 1.
///
/// Algorithm:
/// Hairs = SHA256(market_id + creator + ledger_sequence + timestamp)
/// Take first 8 bytes and convert to hex-like alphanumeric Symbol.
pub fn generate_invite_code(
    env: Env,
    creator: Address,
    market_id: u64,
    max_uses: u32,
    expires_in_seconds: u64,
) -> Result<Symbol, InsightArenaError> {
    creator.require_auth();

    // 1. Fetch market and validate creator
    let market = market::get_market(&env, market_id)?;
    if market.creator != creator {
        return Err(InsightArenaError::Unauthorized);
    }

    // 2. Validate usage constraints
    if max_uses < 1 {
        return Err(InsightArenaError::InvalidInput);
    }

    // 3. Generate collision-resistant 8-character code
    // We use a combination of market_id, creator, ledger sequence, and timestamp
    // to ensure uniqueness.
    let ledger_seq = env.ledger().sequence();
    let timestamp = env.ledger().timestamp();

    // Create a seed for the hash
    let mut salt: soroban_sdk::Vec<Val> = soroban_sdk::vec![&env];
    salt.push_back(market_id.into_val(&env));
    salt.push_back(creator.into_val(&env));
    salt.push_back(ledger_seq.into_val(&env));
    salt.push_back(timestamp.into_val(&env));

    let hash = env.crypto().sha256(&salt.to_xdr(&env));
    let hash_bytes: [u8; 32] = hash.into();

    // Take first 4 bytes (8 hex chars) to create a Symbol
    let mut code_bytes = [0u8; 8];
    for i in 0..4 {
        let byte = hash_bytes[i];
        code_bytes[i * 2] = byte_to_char(byte >> 4);
        code_bytes[i * 2 + 1] = byte_to_char(byte & 0x0F);
    }

    let code_str = unsafe { core::str::from_utf8_unchecked(&code_bytes) };
    let code = Symbol::new(&env, code_str);

    // 4. Store InviteCode
    let expires_at = timestamp + expires_in_seconds;
    let invite_code = InviteCode::new(
        code.clone(),
        market_id,
        creator.clone(),
        max_uses,
        expires_at,
    );

    env.storage()
        .persistent()
        .set(&DataKey::InviteCode(code.clone()), &invite_code);
    ttl::extend_invite_ttl(&env, &code);

    // 5. Emit Event
    env.events().publish(
        (symbol_short!("invite"), symbol_short!("gen")),
        (market_id, code.clone()),
    );

    Ok(code)
}

pub fn redeem_invite_code(
    env: Env,
    invitee: Address,
    code: Symbol,
) -> Result<u64, InsightArenaError> {
    invitee.require_auth();

    let invite_key = DataKey::InviteCode(code.clone());
    let mut invite: InviteCode = env
        .storage()
        .persistent()
        .get(&invite_key)
        .ok_or(InsightArenaError::InvalidInviteCode)?;

    if !invite.is_active {
        return Err(InsightArenaError::InvalidInviteCode);
    }

    let current_time = env.ledger().timestamp();
    if current_time >= invite.expires_at {
        return Err(InsightArenaError::InviteCodeExpired);
    }

    if invite.current_uses >= invite.max_uses {
        return Err(InsightArenaError::InviteCodeMaxUsed);
    }

    let allowlist_key = DataKey::MarketAllowlist(invite.market_id);
    let mut allowlist: Vec<Address> = env
        .storage()
        .persistent()
        .get(&allowlist_key)
        .unwrap_or_else(|| Vec::new(&env));

    if !allowlist.iter().any(|participant| participant == invitee) {
        allowlist.push_back(invitee.clone());
        env.storage().persistent().set(&allowlist_key, &allowlist);
    }

    invite.current_uses = invite
        .current_uses
        .checked_add(1)
        .ok_or(InsightArenaError::Overflow)?;
    env.storage().persistent().set(&invite_key, &invite);
    ttl::extend_invite_ttl(&env, &code);
    ttl::extend_market_ttl(&env, invite.market_id);

    env.events().publish(
        (symbol_short!("invite"), symbol_short!("redeemd")),
        (code.clone(), invite.market_id, invitee),
    );

    Ok(invite.market_id)
}

fn byte_to_char(b: u8) -> u8 {
    match b {
        0..=9 => b'0' + b,
        10..=15 => b'a' + (b - 10),
        _ => b'0',
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::market::CreateMarketParams;
    use crate::InsightArenaContract;
    use crate::InsightArenaContractClient;
    use soroban_sdk::testutils::{Address as _, Ledger as _};
    use soroban_sdk::{vec, String};

    fn setup_test(env: &Env) -> (Address, Address, u64, InsightArenaContractClient<'_>) {
        env.mock_all_auths();
        let admin = Address::generate(env);
        let oracle = Address::generate(env);
        let creator = Address::generate(env);
        let xlm_token = env
            .register_stellar_asset_contract_v2(admin.clone())
            .address();

        // Initialize contract
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
            is_public: false,
            creator_fee_bps: 100,
            min_stake: 10_000_000,
            max_stake: 100_000_000,
        };

        let market_id = client.create_market(&creator, &params);
        (creator, oracle, market_id, client)
    }

    #[test]
    fn test_generate_invite_code_success() {
        let env = Env::default();
        let (creator, _, market_id, client) = setup_test(&env);

        let code = client.generate_invite_code(&creator, &market_id, &10, &3600);

        // Verify the code is not empty.
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

        // Change ledger timestamp to ensure a different hash
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
}
