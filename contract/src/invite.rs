use crate::config;
use crate::errors::InsightArenaError;
use crate::market;
use crate::storage_types::{DataKey, InviteCode};

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
    config::extend_invite_ttl(&env, &code);

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
    config::extend_invite_ttl(&env, &code);
    config::extend_market_ttl(&env, invite.market_id);

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

/// Revoke an invite code, deactivating it for future redemptions.
/// Only the code's creator can revoke.
///
/// On success:
/// - `invite.is_active = false`
/// - Updated `InviteCode` persisted with TTL bump
/// - `InviteCodeRevoked` event emitted
///
/// Does NOT affect users already in MarketAllowlist.
pub fn revoke_invite_code(
    env: Env,
    creator: Address,
    code: Symbol,
) -> Result<(), InsightArenaError> {
    creator.require_auth();

    let invite_key = DataKey::InviteCode(code.clone());
    let mut invite: InviteCode = env
        .storage()
        .persistent()
        .get(&invite_key)
        .ok_or(InsightArenaError::InvalidInviteCode)?;

    if invite.creator != creator {
        return Err(InsightArenaError::Unauthorized);
    }

    invite.is_active = false;
    env.storage().persistent().set(&invite_key, &invite);
    config::extend_invite_ttl(&env, &code);

    env.events().publish(
        (symbol_short!("invite"), symbol_short!("revoked")),
        (code.clone(), creator.clone()),
    );

    Ok(())
}
