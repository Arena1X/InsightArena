use soroban_sdk::{Address, Env, Symbol};

use crate::storage_types::DataKey;

// ~30 days at ~6s/ledger for frequently accessed market state.
pub const LEDGER_BUMP_MARKET: u32 = 432_000;
// ~7 days for prediction records after payout is claimed.
pub const LEDGER_BUMP_PREDICTION_CLAIMED: u32 = 100_800;
// ~90 days for long-lived user profiles.
pub const LEDGER_BUMP_USER: u32 = 1_296_000;
// ~7 days for short-lived invite code records.
pub const LEDGER_BUMP_INVITE: u32 = 100_800;
// ~1 year for global config and season snapshots.
pub const LEDGER_BUMP_PERMANENT: u32 = 5_184_000;

fn threshold(max: u32) -> u32 {
    max.saturating_sub(14_400)
}

pub fn extend_market_ttl(env: &Env, market_id: u64) {
    env.storage().persistent().extend_ttl(
        &DataKey::Market(market_id),
        threshold(LEDGER_BUMP_MARKET),
        LEDGER_BUMP_MARKET,
    );
}

pub fn extend_prediction_ttl(env: &Env, market_id: u64, predictor: &Address) {
    env.storage().persistent().extend_ttl(
        &DataKey::Prediction(market_id, predictor.clone()),
        threshold(LEDGER_BUMP_MARKET),
        LEDGER_BUMP_MARKET,
    );
}

pub fn shorten_prediction_ttl_after_claim(env: &Env, market_id: u64, predictor: &Address) {
    env.storage().temporary().extend_ttl(
        &DataKey::Prediction(market_id, predictor.clone()),
        threshold(LEDGER_BUMP_PREDICTION_CLAIMED),
        LEDGER_BUMP_PREDICTION_CLAIMED,
    );
}

pub fn extend_user_ttl(env: &Env, user: &Address) {
    env.storage().persistent().extend_ttl(
        &DataKey::User(user.clone()),
        threshold(LEDGER_BUMP_USER),
        LEDGER_BUMP_USER,
    );
}

pub fn extend_invite_ttl(env: &Env, code: &Symbol) {
    env.storage().persistent().extend_ttl(
        &DataKey::InviteCode(code.clone()),
        threshold(LEDGER_BUMP_INVITE),
        LEDGER_BUMP_INVITE,
    );
}

pub fn extend_config_ttl(env: &Env) {
    env.storage().persistent().extend_ttl(
        &DataKey::Config,
        threshold(LEDGER_BUMP_PERMANENT),
        LEDGER_BUMP_PERMANENT,
    );
}

pub fn extend_season_ttl(env: &Env, season_id: u32) {
    env.storage().persistent().extend_ttl(
        &DataKey::Season(season_id),
        threshold(LEDGER_BUMP_PERMANENT),
        LEDGER_BUMP_PERMANENT,
    );

    if env
        .storage()
        .persistent()
        .has(&DataKey::Leaderboard(season_id))
    {
        env.storage().persistent().extend_ttl(
            &DataKey::Leaderboard(season_id),
            threshold(LEDGER_BUMP_PERMANENT),
            LEDGER_BUMP_PERMANENT,
        );
    }
}

