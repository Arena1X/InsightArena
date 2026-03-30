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


