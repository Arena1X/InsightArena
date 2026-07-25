#![cfg(test)]

//! Global Circuit Breaker (#1351) tests.
//!
//! Per-entrypoint "reverts while paused" coverage lives alongside each
//! module's own test file (market_tests.rs, invite_tests.rs, season_tests.rs,
//! reputation_tests.rs, liquidity_tests.rs, governance_tests.rs,
//! escrow_tests.rs, conditional_tests.rs, oracle_tests.rs). This file covers
//! the cross-cutting properties: the pause-toggle event carries the actor and
//! reason code, only the admin can toggle the breaker, and genuinely
//! read-only views keep working while paused.

use insightarena_contract::market::CreateMarketParams;
use insightarena_contract::{InsightArenaContract, InsightArenaContractClient};
use soroban_sdk::testutils::{Address as _, Events, MockAuth, MockAuthInvoke};
use soroban_sdk::{symbol_short, vec, Address, Env, IntoVal, String, Symbol, TryIntoVal};

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
    CreateMarketParams {
        title: String::from_str(env, "Will it rain?"),
        description: String::from_str(env, "Daily weather market"),
        category: Symbol::new(env, "Sports"),
        outcomes: vec![env, symbol_short!("yes"), symbol_short!("no")],
        end_time: 1000,
        resolution_time: 2000,
        dispute_window: 86_400,
        creator_fee_bps: 100,
        min_stake: 10_000_000,
        max_stake: 100_000_000,
        is_public: true,
    }
}

#[test]
fn set_paused_emits_event_with_actor_and_reason() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, _oracle) = deploy(&env);

    client.set_paused(&true, &7u32);

    let contract_id = client.address.clone();
    let events = env.events().all();
    let mut found = false;
    for event in events.iter() {
        if event.0 == contract_id && event.1.len() == 2 {
            let topic0: Result<Symbol, _> = event.1.get(0).unwrap().try_into_val(&env);
            let topic1: Result<Symbol, _> = event.1.get(1).unwrap().try_into_val(&env);
            if let (Ok(t0), Ok(t1)) = (topic0, topic1) {
                if t0 == Symbol::new(&env, "cfg") && t1 == Symbol::new(&env, "paused") {
                    let data: Result<(Address, bool, u32), _> = event.2.try_into_val(&env);
                    if let Ok((actor, paused, reason_code)) = data {
                        assert_eq!(actor, admin);
                        assert!(paused);
                        assert_eq!(reason_code, 7u32);
                        found = true;
                    }
                }
            }
        }
    }
    assert!(found, "expected a cfg/paused event with actor and reason code");
}

#[test]
fn resume_event_carries_false_and_its_own_reason() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, _oracle) = deploy(&env);

    client.set_paused(&true, &1u32);
    client.set_paused(&false, &0u32);

    let contract_id = client.address.clone();
    let events = env.events().all();
    let mut found = false;
    for event in events.iter() {
        if event.0 == contract_id && event.1.len() == 2 {
            let topic0: Result<Symbol, _> = event.1.get(0).unwrap().try_into_val(&env);
            let topic1: Result<Symbol, _> = event.1.get(1).unwrap().try_into_val(&env);
            if let (Ok(t0), Ok(t1)) = (topic0, topic1) {
                if t0 == Symbol::new(&env, "cfg") && t1 == Symbol::new(&env, "paused") {
                    let data: Result<(Address, bool, u32), _> = event.2.try_into_val(&env);
                    if let Ok((actor, paused, reason_code)) = data {
                        if actor == admin && !paused && reason_code == 0u32 {
                            found = true;
                        }
                    }
                }
            }
        }
    }
    assert!(found, "expected a resume event with paused=false, reason_code=0");
}

#[test]
fn only_admin_can_toggle_pause() {
    let env = Env::default();
    // `initialize` itself does not require auth, so we can deploy without
    // ever engaging `mock_all_auths` — leaving `set_paused`'s internal
    // `config.admin.require_auth()` as the only thing gating this call.
    let id = env.register(InsightArenaContract, ());
    let client = InsightArenaContractClient::new(&env, &id);
    let admin = Address::generate(&env);
    let oracle = Address::generate(&env);
    let xlm_token = register_token(&env);
    client.initialize(&admin, &oracle, &200_u32, &xlm_token);

    let result = client.try_set_paused(&true, &1u32);
    assert!(result.is_err());
}

#[test]
fn former_admin_cannot_toggle_pause_after_transfer() {
    let env = Env::default();
    let (client, admin, _oracle) = deploy(&env);
    let new_admin = Address::generate(&env);

    env.mock_auths(&[MockAuth {
        address: &admin,
        invoke: &MockAuthInvoke {
            contract: &client.address,
            fn_name: "transfer_admin",
            args: (new_admin.clone(),).into_val(&env),
            sub_invokes: &[],
        },
    }]);
    client.transfer_admin(&new_admin);

    // The old admin still signs the call, but `config.admin` is now
    // `new_admin` — set_paused's internal `config.admin.require_auth()` must
    // reject an authorization from an address that is no longer the admin.
    env.mock_auths(&[MockAuth {
        address: &admin,
        invoke: &MockAuthInvoke {
            contract: &client.address,
            fn_name: "set_paused",
            args: (true, 1u32).into_val(&env),
            sub_invokes: &[],
        },
    }]);
    let result = client.try_set_paused(&true, &1u32);
    assert!(result.is_err());
}

#[test]
fn reads_remain_available_while_paused() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, _oracle) = deploy(&env);

    let creator = Address::generate(&env);
    let market_id = client.create_market(&creator, &default_params(&env));

    client.set_paused(&true, &1u32);

    // Pure read-only views must keep working while paused.
    let market = client.get_market(&market_id);
    assert_eq!(market.market_id, market_id);
    assert_eq!(client.list_markets(&1u64, &10u32).len(), 1);
    assert_eq!(client.get_market_count(), 1);
    assert_eq!(client.list_active_disputes().len(), 0);
    assert_eq!(client.get_treasury_balance(), 0);
    let _ = client.get_platform_stats();
    let _ = client.list_categories();
}
