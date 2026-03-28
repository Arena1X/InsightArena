use soroban_sdk::{Address, Env, Symbol};

use crate::config;
use crate::errors::InsightArenaError;
use crate::market;
use crate::reputation;
use crate::storage_types::DataKey;

/// Transition a market into the "resolved" state by recording the winning outcome.
///
/// Validation order:
/// 1. `oracle` address must provide valid cryptographic authorisation.
/// 2. `oracle` must match the `oracle_address` stored in global configuration.
/// 3. Market must exist in persistent storage.
/// 4. `current_time >= market.resolution_time` — resolution window must be open.
/// 5. `market.is_resolved == false` — prevents double-resolution.
/// 6. `resolved_outcome` must be one of the symbols in `market.outcome_options`.
///
/// On success:
/// - `market.is_resolved` is set to `true`.
/// - `market.resolved_outcome` stores the winning `Symbol`.
/// - The updated record is saved to storage and its TTL is extended.
/// - A `MarketResolved` event is emitted.
pub fn resolve_market(
    env: Env,
    oracle: Address,
    market_id: u64,
    resolved_outcome: Symbol,
) -> Result<(), InsightArenaError> {
    // ── Guard 1: Oracle authorisation ─────────────────────────────────────────
    oracle.require_auth();

    // ── Guard 2: Verify trusted oracle address ───────────────────────────────
    let cfg = config::get_config(&env)?;
    if oracle != cfg.oracle_address {
        return Err(InsightArenaError::Unauthorized);
    }

    // ── Guard 3: Market must exist ────────────────────────────────────────────
    let mut market = market::get_market(&env, market_id)?;

    // ── Guard 4: Resolution window must be open ──────────────────────────────
    let now = env.ledger().timestamp();
    if now < market.resolution_time {
        return Err(InsightArenaError::MarketStillOpen);
    }

    // ── Guard 5: Market must not already be resolved ──────────────────────────
    if market.is_resolved {
        return Err(InsightArenaError::MarketAlreadyResolved);
    }

    // ── Guard 6: Outcome must be valid for this market ────────────────────────
    if !market.outcome_options.contains(resolved_outcome.clone()) {
        return Err(InsightArenaError::InvalidOutcome);
    }

    // ── Update status and persist ─────────────────────────────────────────────
    market.is_resolved = true;
    market.resolved_outcome = Some(resolved_outcome.clone());
    market.resolved_at = Some(now);

    env.storage()
        .persistent()
        .set(&DataKey::Market(market_id), &market);

    // Extend TTL using the same logic as market creation/lookup
    env.storage().persistent().extend_ttl(
        &DataKey::Market(market_id),
        config::PERSISTENT_THRESHOLD,
        config::PERSISTENT_BUMP,
    );

    // ── Emit MarketResolved event ─────────────────────────────────────────────
    market::emit_market_resolved(&env, market_id, resolved_outcome);

    // ── Update creator reputation stats ──────────────────────────────────────
    reputation::on_market_resolved(&env, &market.creator, market.participant_count);

    Ok(())
}

pub fn update_oracle_from_governance(
    env: &Env,
    new_oracle: Address,
) -> Result<(), InsightArenaError> {
    let mut cfg = config::get_config(env)?;
    cfg.oracle_address = new_oracle;
    env.storage().persistent().set(&DataKey::Config, &cfg);
    Ok(())
}

#[cfg(test)]
mod resolve_tests {
    use soroban_sdk::testutils::{Address as _, Ledger as _};
    use soroban_sdk::{symbol_short, vec, Address, Env, String, Symbol};

    use crate::market::CreateMarketParams;
    use crate::{InsightArenaContract, InsightArenaContractClient, InsightArenaError};

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
            title: String::from_str(env, "Will it rain?"),
            description: String::from_str(env, "Daily weather market"),
            category: Symbol::new(env, "Sports"),
            outcomes: vec![env, symbol_short!("yes"), symbol_short!("no")],
            end_time: now + 1000,
            resolution_time: now + 2000,
            dispute_window: 86_400,
            creator_fee_bps: 100,
            min_stake: 10_000_000,
            max_stake: 100_000_000,
            is_public: true,
        }
    }

    #[test]
    fn resolve_market_success() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, _admin, oracle) = deploy(&env);
        let creator = Address::generate(&env);

        let id = client.create_market(&creator, &default_params(&env));

        // Advance time to resolution_time (now + 2000)
        env.ledger().set_timestamp(env.ledger().timestamp() + 2000);

        client.resolve_market(&oracle, &id, &symbol_short!("yes"));

        let market = client.get_market(&id);
        assert!(market.is_resolved);
        assert_eq!(market.resolved_outcome, Some(symbol_short!("yes")));
        assert_eq!(market.resolved_at, Some(env.ledger().timestamp()));
    }

    #[test]
    fn resolve_market_unauthorized() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, _admin, _oracle) = deploy(&env);
        let creator = Address::generate(&env);
        let random = Address::generate(&env);

        let id = client.create_market(&creator, &default_params(&env));
        env.ledger().set_timestamp(env.ledger().timestamp() + 2000);

        let result = client.try_resolve_market(&random, &id, &symbol_short!("yes"));
        assert!(matches!(result, Err(Ok(InsightArenaError::Unauthorized))));
    }

    #[test]
    fn resolve_market_too_early() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, _admin, oracle) = deploy(&env);
        let creator = Address::generate(&env);

        let id = client.create_market(&creator, &default_params(&env));

        // Only advance half-way to resolution_time
        env.ledger().set_timestamp(env.ledger().timestamp() + 1000);

        let result = client.try_resolve_market(&oracle, &id, &symbol_short!("yes"));
        assert!(matches!(
            result,
            Err(Ok(InsightArenaError::MarketStillOpen))
        ));
    }

    #[test]
    fn resolve_market_already_resolved() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, _admin, oracle) = deploy(&env);
        let creator = Address::generate(&env);

        let id = client.create_market(&creator, &default_params(&env));
        env.ledger().set_timestamp(env.ledger().timestamp() + 2000);

        client.resolve_market(&oracle, &id, &symbol_short!("yes"));

        // Second attempt
        let result = client.try_resolve_market(&oracle, &id, &symbol_short!("yes"));
        assert!(matches!(
            result,
            Err(Ok(InsightArenaError::MarketAlreadyResolved))
        ));
    }

    #[test]
    fn resolve_market_invalid_outcome() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, _admin, oracle) = deploy(&env);
        let creator = Address::generate(&env);

        let id = client.create_market(&creator, &default_params(&env));
        env.ledger().set_timestamp(env.ledger().timestamp() + 2000);

        let result = client.try_resolve_market(&oracle, &id, &symbol_short!("maybe"));
        assert!(matches!(result, Err(Ok(InsightArenaError::InvalidOutcome))));
    }

    #[test]
    fn update_oracle_and_resolve() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, admin, old_oracle) = deploy(&env);
        let creator = Address::generate(&env);
        let new_oracle = Address::generate(&env);

        let id = client.create_market(&creator, &default_params(&env));

        // Update oracle
        client.update_oracle(&admin, &new_oracle);

        // Advance time
        env.ledger().set_timestamp(env.ledger().timestamp() + 2000);

        // Old oracle cannot resolve
        let result = client.try_resolve_market(&old_oracle, &id, &symbol_short!("yes"));
        assert!(matches!(result, Err(Ok(InsightArenaError::Unauthorized))));

        // New oracle can resolve
        client.resolve_market(&new_oracle, &id, &symbol_short!("yes"));

        let market = client.get_market(&id);
        assert!(market.is_resolved);
    }

    #[test]
    fn update_oracle_unauthorized() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, _admin, _old_oracle) = deploy(&env);
        let random = Address::generate(&env);
        let new_oracle = Address::generate(&env);

        let result = client.try_update_oracle(&random, &new_oracle);
        assert!(matches!(result, Err(Ok(InsightArenaError::Unauthorized))));
    }
}
