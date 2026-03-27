use soroban_sdk::{Address, Env, Symbol};

use crate::storage_types::DataKey;

// ~30 days at ~6s/ledger for frequently accessed market state.
pub const LEDGER_BUMP_MARKET: u32 = 432_000;
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

#[cfg(test)]
mod tests {
    use soroban_sdk::testutils::{storage::Persistent as _, Address as _};
    use soroban_sdk::{symbol_short, vec, Address, Env, String, Symbol};

    use crate::market::CreateMarketParams;
    use crate::storage_types::DataKey;
    use crate::{InsightArenaContract, InsightArenaContractClient};

    fn register_token(env: &Env) -> Address {
        let token_admin = Address::generate(env);
        env.register_stellar_asset_contract_v2(token_admin)
            .address()
    }

    fn deploy(env: &Env) -> InsightArenaContractClient<'_> {
        let id = env.register(InsightArenaContract, ());
        let client = InsightArenaContractClient::new(env, &id);
        let admin = Address::generate(env);
        let oracle = Address::generate(env);
        env.mock_all_auths();
        client.initialize(&admin, &oracle, &200_u32, &register_token(env));
        client
    }

    #[test]
    fn market_ttl_is_extended_after_market_read() {
        let env = Env::default();
        env.mock_all_auths();
        let client = deploy(&env);
        let creator = Address::generate(&env);

        let params = CreateMarketParams {
            title: String::from_str(&env, "TTL Test"),
            description: String::from_str(&env, "TTL Test Description"),
            category: Symbol::new(&env, "Sports"),
            outcomes: vec![&env, symbol_short!("yes"), symbol_short!("no")],
            end_time: env.ledger().timestamp() + 1_000,
            resolution_time: env.ledger().timestamp() + 2_000,
            creator_fee_bps: 100,
            min_stake: 10_000_000,
            max_stake: 100_000_000,
            is_public: true,
        };

        let market_id = client.create_market(&creator, &params);

        client.get_market(&market_id);

        let ttl = env.as_contract(&client.address, || {
            env.storage()
                .persistent()
                .get_ttl(&DataKey::Market(market_id))
        });

        assert!(ttl >= super::LEDGER_BUMP_MARKET - 14_400);
    }
}
