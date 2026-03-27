use soroban_sdk::{symbol_short, Address, Env};

use crate::config;
use crate::errors::InsightArenaError;
use crate::escrow;
use crate::market;
use crate::storage_types::{DataKey, Dispute};
use crate::ttl;

fn bump_dispute(env: &Env, market_id: u64) {
    ttl::extend_market_ttl(env, market_id);
    env.storage().persistent().extend_ttl(
        &DataKey::Dispute(market_id),
        config::PERSISTENT_THRESHOLD,
        config::PERSISTENT_BUMP,
    );
}

fn require_admin(env: &Env, admin: &Address) -> Result<(), InsightArenaError> {
    admin.require_auth();
    let cfg = config::get_config(env)?;
    if admin != &cfg.admin {
        return Err(InsightArenaError::Unauthorized);
    }
    Ok(())
}

fn emit_dispute_raised(env: &Env, market_id: u64, disputer: &Address, bond: i128, filed_at: u64) {
    env.events().publish(
        (symbol_short!("dsp"), symbol_short!("raised")),
        (market_id, disputer.clone(), bond, filed_at),
    );
}

fn emit_dispute_resolved(env: &Env, market_id: u64, admin: &Address, uphold: bool) {
    env.events().publish(
        (symbol_short!("dsp"), symbol_short!("reslvd")),
        (market_id, admin.clone(), uphold),
    );
}

pub fn raise_dispute(
    env: Env,
    disputer: Address,
    market_id: u64,
    bond: i128,
) -> Result<(), InsightArenaError> {
    config::ensure_not_paused(&env)?;

    if bond <= 0 {
        return Err(InsightArenaError::InvalidInput);
    }

    let market = market::get_market(&env, market_id)?;
    if !market.is_resolved {
        return Err(InsightArenaError::MarketNotResolved);
    }

    if env.storage().persistent().has(&DataKey::Dispute(market_id)) {
        return Err(InsightArenaError::DisputeAlreadyFiled);
    }

    let now = env.ledger().timestamp();
    let resolved_at = market
        .resolved_at
        .ok_or(InsightArenaError::MarketNotResolved)?;
    let deadline = resolved_at
        .checked_add(market.dispute_window)
        .ok_or(InsightArenaError::Overflow)?;
    if now > deadline {
        return Err(InsightArenaError::DisputeWindowClosed);
    }

    escrow::lock_stake(&env, &disputer, bond)?;

    let dispute = Dispute::new(disputer.clone(), bond, now);
    env.storage()
        .persistent()
        .set(&DataKey::Dispute(market_id), &dispute);
    bump_dispute(&env, market_id);

    emit_dispute_raised(&env, market_id, &disputer, bond, now);

    Ok(())
}

pub fn resolve_dispute(
    env: Env,
    admin: Address,
    market_id: u64,
    uphold: bool,
) -> Result<(), InsightArenaError> {
    config::ensure_not_paused(&env)?;
    require_admin(&env, &admin)?;

    let dispute: Dispute = env
        .storage()
        .persistent()
        .get(&DataKey::Dispute(market_id))
        .ok_or(InsightArenaError::DisputeNotFound)?;

    if uphold {
        // Return bond to disputer and reopen market for re-resolution.
        escrow::refund(&env, &dispute.disputer, dispute.bond)?;

        let mut market = market::get_market(&env, market_id)?;
        market.is_resolved = false;
        market.resolved_outcome = None;
        market.resolved_at = None;
        env.storage()
            .persistent()
            .set(&DataKey::Market(market_id), &market);
        ttl::extend_market_ttl(&env, market_id);
    } else {
        // Forfeit bond to treasury (accounting balance) while funds remain in escrow.
        escrow::add_to_treasury_balance(&env, dispute.bond);
    }

    env.storage()
        .persistent()
        .remove(&DataKey::Dispute(market_id));

    emit_dispute_resolved(&env, market_id, &admin, uphold);

    Ok(())
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod dispute_tests {
    use soroban_sdk::testutils::{Address as _, Ledger as _};
    use soroban_sdk::token::{Client as TokenClient, StellarAssetClient};
    use soroban_sdk::{symbol_short, vec, Address, Env, String, Symbol};

    use crate::market::CreateMarketParams;
    use crate::storage_types::DataKey;
    use crate::{InsightArenaContract, InsightArenaContractClient, InsightArenaError};

    fn register_token(env: &Env) -> Address {
        let token_admin = Address::generate(env);
        env.register_stellar_asset_contract_v2(token_admin)
            .address()
    }

    fn deploy(env: &Env) -> (InsightArenaContractClient<'_>, Address, Address, Address) {
        let id = env.register(InsightArenaContract, ());
        let client = InsightArenaContractClient::new(env, &id);
        let admin = Address::generate(env);
        let oracle = Address::generate(env);
        let xlm_token = register_token(env);
        env.mock_all_auths();
        client.initialize(&admin, &oracle, &200_u32, &xlm_token);
        (client, admin, oracle, xlm_token)
    }

    fn params(env: &Env, dispute_window: u64) -> CreateMarketParams {
        let now = env.ledger().timestamp();
        CreateMarketParams {
            title: String::from_str(env, "Dispute market"),
            description: String::from_str(env, "For dispute tests"),
            category: Symbol::new(env, "Sports"),
            outcomes: vec![env, symbol_short!("yes"), symbol_short!("no")],
            end_time: now + 10,
            resolution_time: now + 20,
            dispute_window,
            creator_fee_bps: 100,
            min_stake: 10_000_000,
            max_stake: 100_000_000,
            is_public: true,
        }
    }

    #[test]
    fn raise_dispute_fails_outside_window() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, _admin, oracle, xlm_token) = deploy(&env);
        let creator = Address::generate(&env);
        let disputer = Address::generate(&env);

        let id = client.create_market(&creator, &params(&env, 30));
        env.ledger().set_timestamp(env.ledger().timestamp() + 20);
        client.resolve_market(&oracle, &id, &symbol_short!("yes"));

        // Move beyond resolved_at + dispute_window.
        env.ledger().set_timestamp(env.ledger().timestamp() + 31);

        StellarAssetClient::new(&env, &xlm_token).mint(&disputer, &10_000_000);
        TokenClient::new(&env, &xlm_token).approve(&disputer, &client.address, &10_000_000, &9999);

        let result = client.try_raise_dispute(&disputer, &id, &10_000_000);
        assert!(matches!(
            result,
            Err(Ok(InsightArenaError::DisputeWindowClosed))
        ));
    }

    #[test]
    fn raise_dispute_locks_bond_in_escrow_and_stores_dispute() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, _admin, oracle, xlm_token) = deploy(&env);
        let creator = Address::generate(&env);
        let disputer = Address::generate(&env);

        let id = client.create_market(&creator, &params(&env, 86_400));
        env.ledger().set_timestamp(env.ledger().timestamp() + 20);
        client.resolve_market(&oracle, &id, &symbol_short!("yes"));

        let bond = 15_000_000_i128;
        StellarAssetClient::new(&env, &xlm_token).mint(&disputer, &bond);
        TokenClient::new(&env, &xlm_token).approve(&disputer, &client.address, &bond, &9999);

        let token = TokenClient::new(&env, &xlm_token);
        let contract_before = token.balance(&client.address);
        let disputer_before = token.balance(&disputer);

        client.raise_dispute(&disputer, &id, &bond);

        assert_eq!(token.balance(&disputer), disputer_before - bond);
        assert_eq!(token.balance(&client.address), contract_before + bond);

        // dispute record exists
        let stored = env.as_contract(&client.address, || {
            env.storage()
                .persistent()
                .get::<DataKey, crate::storage_types::Dispute>(&DataKey::Dispute(id))
        });
        assert!(stored.is_some());
    }

    #[test]
    fn resolve_dispute_uphold_returns_bond_and_reopens_market() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, admin, oracle, xlm_token) = deploy(&env);
        let creator = Address::generate(&env);
        let disputer = Address::generate(&env);

        let id = client.create_market(&creator, &params(&env, 86_400));
        env.ledger().set_timestamp(env.ledger().timestamp() + 20);
        client.resolve_market(&oracle, &id, &symbol_short!("yes"));

        let bond = 12_000_000_i128;
        StellarAssetClient::new(&env, &xlm_token).mint(&disputer, &bond);
        TokenClient::new(&env, &xlm_token).approve(&disputer, &client.address, &bond, &9999);
        client.raise_dispute(&disputer, &id, &bond);

        let token = TokenClient::new(&env, &xlm_token);
        let disputer_before = token.balance(&disputer);

        client.resolve_dispute(&admin, &id, &true);

        assert_eq!(token.balance(&disputer), disputer_before + bond);

        let market = client.get_market(&id);
        assert!(!market.is_resolved);
        assert_eq!(market.resolved_outcome, None);
        assert_eq!(market.resolved_at, None);
    }

    #[test]
    fn resolve_dispute_reject_forfeits_bond_to_treasury_balance() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, admin, oracle, xlm_token) = deploy(&env);
        let creator = Address::generate(&env);
        let disputer = Address::generate(&env);

        let id = client.create_market(&creator, &params(&env, 86_400));
        env.ledger().set_timestamp(env.ledger().timestamp() + 20);
        client.resolve_market(&oracle, &id, &symbol_short!("yes"));

        let bond = 9_000_000_i128;
        StellarAssetClient::new(&env, &xlm_token).mint(&disputer, &bond);
        TokenClient::new(&env, &xlm_token).approve(&disputer, &client.address, &bond, &9999);
        client.raise_dispute(&disputer, &id, &bond);

        let treasury_before = client.get_treasury_balance();
        client.resolve_dispute(&admin, &id, &false);
        let treasury_after = client.get_treasury_balance();
        assert_eq!(treasury_after, treasury_before + bond);
    }
}
