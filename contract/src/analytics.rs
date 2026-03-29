use soroban_sdk::{Address, Env, Symbol, Vec};

use crate::config::{PERSISTENT_BUMP, PERSISTENT_THRESHOLD};
use crate::errors::InsightArenaError;
use crate::storage_types::{DataKey, Market, MarketStats, PlatformStats, Prediction, UserProfile};

// ── Volume tracking ───────────────────────────────────────────────────────────

/// Increment the cumulative platform volume by `amount`. Called on every stake.
pub fn add_volume(env: &Env, amount: i128) {
    let key = DataKey::PlatformVolume;
    let current: i128 = env.storage().persistent().get(&key).unwrap_or(0);
    let updated = current.saturating_add(amount);
    env.storage().persistent().set(&key, &updated);
    env.storage()
        .persistent()
        .extend_ttl(&key, PERSISTENT_THRESHOLD, PERSISTENT_BUMP);
}

// ── Shared helper ─────────────────────────────────────────────────────────────

/// Accumulate per-outcome stake pools by iterating the predictor list.
/// Returns parallel vecs: `(outcome_symbols, outcome_pools)`.
fn accumulate_outcome_pools(env: &Env, market_id: u64) -> (Vec<Symbol>, Vec<i128>) {
    let predictors: Vec<Address> = env
        .storage()
        .persistent()
        .get(&DataKey::PredictorList(market_id))
        .unwrap_or_else(|| Vec::new(env));

    let mut outcome_symbols: Vec<Symbol> = Vec::new(env);
    let mut outcome_pools: Vec<i128> = Vec::new(env);

    for predictor in predictors.iter() {
        if let Some(pred) = env
            .storage()
            .persistent()
            .get::<DataKey, Prediction>(&DataKey::Prediction(market_id, predictor))
        {
            let mut found = false;
            for (idx, sym) in (0_u32..).zip(outcome_symbols.iter()) {
                if sym == pred.chosen_outcome {
                    let current = outcome_pools.get(idx).unwrap_or(0);
                    outcome_pools.set(idx, current.saturating_add(pred.stake_amount));
                    found = true;
                    break;
                }
            }
            if !found {
                outcome_symbols.push_back(pred.chosen_outcome.clone());
                outcome_pools.push_back(pred.stake_amount);
            }
        }
    }

    (outcome_symbols, outcome_pools)
}

// ── View functions ────────────────────────────────────────────────────────────

/// Aggregate stats for a single market from stored market + prediction data.
pub fn get_market_stats(env: Env, market_id: u64) -> Result<MarketStats, InsightArenaError> {
    let market: Market = env
        .storage()
        .persistent()
        .get(&DataKey::Market(market_id))
        .ok_or(InsightArenaError::MarketNotFound)?;

    let (outcome_symbols, outcome_pools) = accumulate_outcome_pools(&env, market_id);

    let mut leading_outcome = Symbol::new(&env, "");
    let mut leading_pool: i128 = 0;
    for i in 0..outcome_symbols.len() {
        let pool = outcome_pools.get(i).unwrap_or(0);
        if pool > leading_pool {
            leading_pool = pool;
            leading_outcome = outcome_symbols.get(i).unwrap();
        }
    }

    Ok(MarketStats {
        total_pool: market.total_pool,
        participant_count: market.participant_count,
        leading_outcome,
        leading_outcome_pool: leading_pool,
    })
}

/// Return per-outcome stake totals, sorted descending by stake.
pub fn get_outcome_distribution(
    env: Env,
    market_id: u64,
) -> Result<Vec<(Symbol, i128)>, InsightArenaError> {
    if !env.storage().persistent().has(&DataKey::Market(market_id)) {
        return Err(InsightArenaError::MarketNotFound);
    }

    let (mut outcome_symbols, mut outcome_pools) = accumulate_outcome_pools(&env, market_id);

    // Insertion-sort descending by pool (outcome count is always small)
    let n = outcome_symbols.len();
    for i in 1..n {
        let mut j = i;
        while j > 0 {
            let a = outcome_pools.get(j).unwrap_or(0);
            let b = outcome_pools.get(j - 1).unwrap_or(0);
            if a > b {
                outcome_pools.set(j, b);
                outcome_pools.set(j - 1, a);
                let sym_a = outcome_symbols.get(j).unwrap();
                let sym_b = outcome_symbols.get(j - 1).unwrap();
                outcome_symbols.set(j, sym_b);
                outcome_symbols.set(j - 1, sym_a);
                j -= 1;
            } else {
                break;
            }
        }
    }

    let mut result: Vec<(Symbol, i128)> = Vec::new(&env);
    for i in 0..n {
        result.push_back((
            outcome_symbols.get(i).unwrap(),
            outcome_pools.get(i).unwrap_or(0),
        ));
    }

    Ok(result)
}

/// Return the stored `UserProfile` for a given address.
pub fn get_user_stats(env: Env, user: Address) -> Result<UserProfile, InsightArenaError> {
    env.storage()
        .persistent()
        .get(&DataKey::User(user))
        .ok_or(InsightArenaError::UserNotFound)
}

/// Return platform-wide aggregated stats using cached counters (O(1)).
pub fn get_platform_stats(env: Env) -> PlatformStats {
    let total_markets: u64 = env
        .storage()
        .persistent()
        .get(&DataKey::MarketCount)
        .unwrap_or(0);

    let total_volume_xlm: i128 = env
        .storage()
        .persistent()
        .get(&DataKey::PlatformVolume)
        .unwrap_or(0);

    let active_users: u32 = env
        .storage()
        .persistent()
        .get::<DataKey, Vec<Address>>(&DataKey::UserList)
        .map(|v| v.len())
        .unwrap_or(0);

    let treasury_balance: i128 = env
        .storage()
        .persistent()
        .get(&DataKey::Treasury)
        .unwrap_or(0);

    PlatformStats {
        total_markets,
        total_volume_xlm,
        active_users,
        treasury_balance,
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod analytics_tests {
    use soroban_sdk::testutils::Address as _;
    use soroban_sdk::token::StellarAssetClient;
    use soroban_sdk::{symbol_short, vec, Address, Env, String, Symbol};

    use crate::market::CreateMarketParams;
    use crate::{InsightArenaContract, InsightArenaContractClient, InsightArenaError};

    fn register_token(env: &Env) -> Address {
        let token_admin = Address::generate(env);
        env.register_stellar_asset_contract_v2(token_admin)
            .address()
    }

    fn deploy(env: &Env) -> (InsightArenaContractClient<'_>, Address) {
        let id = env.register(InsightArenaContract, ());
        let client = InsightArenaContractClient::new(env, &id);
        let admin = Address::generate(env);
        let oracle = Address::generate(env);
        let xlm_token = register_token(env);
        env.mock_all_auths();
        client.initialize(&admin, &oracle, &200_u32, &xlm_token);
        (client, xlm_token)
    }

    fn default_params(env: &Env) -> CreateMarketParams {
        let now = env.ledger().timestamp();
        CreateMarketParams {
            title: String::from_str(env, "Test market"),
            description: String::from_str(env, "desc"),
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

    fn fund(env: &Env, token: &Address, user: &Address, amount: i128) {
        StellarAssetClient::new(env, token).mint(user, &amount);
    }

    // ── get_market_stats ──────────────────────────────────────────────────────

    #[test]
    fn get_market_stats_not_found() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, _) = deploy(&env);
        let result = client.try_get_market_stats(&99);
        assert!(matches!(result, Err(Ok(InsightArenaError::MarketNotFound))));
    }

    #[test]
    fn get_market_stats_empty_market() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, _) = deploy(&env);
        let creator = Address::generate(&env);
        let id = client.create_market(&creator, &default_params(&env));

        let stats = client.get_market_stats(&id);
        assert_eq!(stats.total_pool, 0);
        assert_eq!(stats.participant_count, 0);
        assert_eq!(stats.leading_outcome_pool, 0);
    }

    #[test]
    fn get_market_stats_correct_aggregation() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, xlm) = deploy(&env);
        let creator = Address::generate(&env);
        let id = client.create_market(&creator, &default_params(&env));

        let u1 = Address::generate(&env);
        let u2 = Address::generate(&env);
        let u3 = Address::generate(&env);
        fund(&env, &xlm, &u1, 50_000_000);
        fund(&env, &xlm, &u2, 30_000_000);
        fund(&env, &xlm, &u3, 20_000_000);

        client.submit_prediction(&u1, &id, &symbol_short!("yes"), &50_000_000);
        client.submit_prediction(&u2, &id, &symbol_short!("yes"), &30_000_000);
        client.submit_prediction(&u3, &id, &symbol_short!("no"), &20_000_000);

        let stats = client.get_market_stats(&id);
        assert_eq!(stats.total_pool, 100_000_000);
        assert_eq!(stats.participant_count, 3);
        assert_eq!(stats.leading_outcome, symbol_short!("yes"));
        assert_eq!(stats.leading_outcome_pool, 80_000_000);
    }

    // ── get_outcome_distribution ──────────────────────────────────────────────

    #[test]
    fn get_outcome_distribution_not_found() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, _) = deploy(&env);
        let result = client.try_get_outcome_distribution(&99);
        assert!(matches!(result, Err(Ok(InsightArenaError::MarketNotFound))));
    }

    #[test]
    fn get_outcome_distribution_empty() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, _) = deploy(&env);
        let creator = Address::generate(&env);
        let id = client.create_market(&creator, &default_params(&env));

        let dist = client.get_outcome_distribution(&id);
        assert_eq!(dist.len(), 0);
    }

    #[test]
    fn get_outcome_distribution_sorted_descending() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, xlm) = deploy(&env);
        let creator = Address::generate(&env);
        let id = client.create_market(&creator, &default_params(&env));

        let u1 = Address::generate(&env);
        let u2 = Address::generate(&env);
        let u3 = Address::generate(&env);
        fund(&env, &xlm, &u1, 20_000_000);
        fund(&env, &xlm, &u2, 50_000_000);
        fund(&env, &xlm, &u3, 30_000_000);

        client.submit_prediction(&u1, &id, &symbol_short!("no"), &20_000_000);
        client.submit_prediction(&u2, &id, &symbol_short!("yes"), &50_000_000);
        client.submit_prediction(&u3, &id, &symbol_short!("no"), &30_000_000);

        let dist = client.get_outcome_distribution(&id);
        assert_eq!(dist.len(), 2);
        let (_, first_pool) = dist.get(0).unwrap();
        let (_, second_pool) = dist.get(1).unwrap();
        assert!(first_pool >= second_pool);
    }

    #[test]
    fn get_outcome_distribution_correct_sums() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, xlm) = deploy(&env);
        let creator = Address::generate(&env);
        let id = client.create_market(&creator, &default_params(&env));

        let u1 = Address::generate(&env);
        let u2 = Address::generate(&env);
        let u3 = Address::generate(&env);
        fund(&env, &xlm, &u1, 10_000_000);
        fund(&env, &xlm, &u2, 60_000_000);
        fund(&env, &xlm, &u3, 30_000_000);

        client.submit_prediction(&u1, &id, &symbol_short!("no"), &10_000_000);
        client.submit_prediction(&u2, &id, &symbol_short!("yes"), &60_000_000);
        client.submit_prediction(&u3, &id, &symbol_short!("yes"), &30_000_000);

        let dist = client.get_outcome_distribution(&id);
        assert_eq!(dist.len(), 2);
        let (sym0, pool0) = dist.get(0).unwrap();
        let (sym1, pool1) = dist.get(1).unwrap();
        assert_eq!(sym0, symbol_short!("yes"));
        assert_eq!(pool0, 90_000_000);
        assert_eq!(sym1, symbol_short!("no"));
        assert_eq!(pool1, 10_000_000);
    }

    // ── get_user_stats ────────────────────────────────────────────────────────

    #[test]
    fn get_user_stats_not_found() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, _) = deploy(&env);
        let unknown = Address::generate(&env);
        let result = client.try_get_user_stats(&unknown);
        assert!(matches!(result, Err(Ok(InsightArenaError::UserNotFound))));
    }

    #[test]
    fn get_user_stats_after_prediction() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, xlm) = deploy(&env);
        let creator = Address::generate(&env);
        let id = client.create_market(&creator, &default_params(&env));

        let user = Address::generate(&env);
        fund(&env, &xlm, &user, 20_000_000);
        client.submit_prediction(&user, &id, &symbol_short!("yes"), &20_000_000);

        let profile = client.get_user_stats(&user);
        assert_eq!(profile.total_predictions, 1);
        assert_eq!(profile.total_staked, 20_000_000);
    }

    // ── get_platform_stats ────────────────────────────────────────────────────

    #[test]
    fn get_platform_stats_initial_state() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, _) = deploy(&env);

        let stats = client.get_platform_stats();
        assert_eq!(stats.total_markets, 0);
        assert_eq!(stats.total_volume_xlm, 0);
        assert_eq!(stats.active_users, 0);
        assert_eq!(stats.treasury_balance, 0);
    }

    #[test]
    fn get_platform_stats_after_activity() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, xlm) = deploy(&env);
        let creator = Address::generate(&env);
        let id = client.create_market(&creator, &default_params(&env));

        let u1 = Address::generate(&env);
        let u2 = Address::generate(&env);
        fund(&env, &xlm, &u1, 20_000_000);
        fund(&env, &xlm, &u2, 30_000_000);
        client.submit_prediction(&u1, &id, &symbol_short!("yes"), &20_000_000);
        client.submit_prediction(&u2, &id, &symbol_short!("no"), &30_000_000);

        let stats = client.get_platform_stats();
        assert_eq!(stats.total_markets, 1);
        assert_eq!(stats.total_volume_xlm, 50_000_000);
        assert_eq!(stats.active_users, 2);
    }

    #[test]
    fn platform_volume_accumulates_across_markets() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, xlm) = deploy(&env);
        let creator = Address::generate(&env);

        let id1 = client.create_market(&creator, &default_params(&env));
        let id2 = client.create_market(&creator, &default_params(&env));

        let u1 = Address::generate(&env);
        let u2 = Address::generate(&env);
        fund(&env, &xlm, &u1, 100_000_000);
        fund(&env, &xlm, &u2, 100_000_000);

        client.submit_prediction(&u1, &id1, &symbol_short!("yes"), &40_000_000);
        client.submit_prediction(&u2, &id2, &symbol_short!("no"), &60_000_000);

        let stats = client.get_platform_stats();
        assert_eq!(stats.total_volume_xlm, 100_000_000);
        assert_eq!(stats.total_markets, 2);
    }
}
