use insightarena_contract::config::{
    LEDGER_BUMP_ACCUMULATOR, LEDGER_BUMP_ESCROW, LEDGER_BUMP_MARKET, LEDGER_BUMP_PREDICTION_CLAIMED,
};
use insightarena_contract::errors::InsightArenaError;
use insightarena_contract::storage_types::DataKey;
use insightarena_contract::{InsightArenaContract, InsightArenaContractClient};
use soroban_sdk::testutils::{
    storage::{Persistent as _, Temporary as _},
    Address as _, Ledger as _,
};
use soroban_sdk::token::{StellarAssetClient, TokenClient};
use soroban_sdk::{symbol_short, vec, Address, Env, String, Symbol, BytesN};

use insightarena_contract::market::CreateMarketParams;

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

fn fund(env: &Env, token: &Address, recipient: &Address, amount: i128) {
    StellarAssetClient::new(env, token).mint(recipient, &amount);
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
        dispute_window: 86_400,
        creator_fee_bps: 100,
        min_stake: 10_000_000,
        max_stake: 100_000_000,
        is_public: true,
        metadata_hash: BytesN::from_array(&env, &[0u8; 32]),
    };

    let market_id = client.create_market(&creator, &params);
    client.get_market(&market_id);

    let ttl = env.as_contract(&client.address, || {
        env.storage()
            .persistent()
            .get_ttl(&DataKey::Market(market_id))
    });

    assert!(ttl >= LEDGER_BUMP_MARKET - 14_400);
}

#[test]
fn prediction_ttl_extends_before_claim_and_shortens_after_claim() {
    let env = Env::default();
    env.mock_all_auths();
    let client = deploy(&env);
    let creator = Address::generate(&env);
    let winner = Address::generate(&env);
    let loser = Address::generate(&env);
    let token = client.get_config().xlm_token;

    let params = CreateMarketParams {
        title: String::from_str(&env, "TTL Pred Test"),
        description: String::from_str(&env, "Prediction TTL lifecycle"),
        category: Symbol::new(&env, "Sports"),
        outcomes: vec![&env, symbol_short!("yes"), symbol_short!("no")],
        end_time: env.ledger().timestamp() + 1000,
        resolution_time: env.ledger().timestamp() + 2000,
        dispute_window: 86_400,
        creator_fee_bps: 100,
        min_stake: 10_000_000,
        max_stake: 100_000_000,
        is_public: true,
        metadata_hash: BytesN::from_array(&env, &[0u8; 32]),
    };

    let market_id = client.create_market(&creator, &params);
    fund(&env, &token, &winner, 30_000_000);
    fund(&env, &token, &loser, 30_000_000);
    client.submit_prediction(&winner, &market_id, &symbol_short!("yes"), &20_000_000);
    client.submit_prediction(&loser, &market_id, &symbol_short!("no"), &20_000_000);

    client.get_prediction(&market_id, &winner);
    let full_ttl = env.as_contract(&client.address, || {
        env.storage()
            .persistent()
            .get_ttl(&DataKey::Prediction(market_id, winner.clone()))
    });
    assert!(full_ttl >= LEDGER_BUMP_MARKET - 14_400);

    env.ledger().set_timestamp(env.ledger().timestamp() + 2_000);
    let oracle = client.get_config().oracle_address;
    client.resolve_market(&oracle, &market_id, &symbol_short!("yes"));
    client.claim_payout(&winner, &market_id);

    let claimed_ttl = env.as_contract(&client.address, || {
        env.storage()
            .temporary()
            .get_ttl(&DataKey::Prediction(market_id, winner.clone()))
    });
    assert!(claimed_ttl >= LEDGER_BUMP_PREDICTION_CLAIMED - 14_400);
    assert!(claimed_ttl < LEDGER_BUMP_MARKET - 14_400);
}

#[test]
fn test_ttl_multiple_extensions() {
    // Test that multiple TTL extensions work correctly across different storage keys
    let env = Env::default();
    env.mock_all_auths();
    let client = deploy(&env);
    let creator = Address::generate(&env);

    let params = CreateMarketParams {
        title: String::from_str(&env, "Multi TTL Test"),
        description: String::from_str(&env, "Multiple TTL extension test"),
        category: Symbol::new(&env, "Sports"),
        outcomes: vec![&env, symbol_short!("yes"), symbol_short!("no")],
        end_time: env.ledger().timestamp() + 1_000,
        resolution_time: env.ledger().timestamp() + 2_000,
        dispute_window: 86_400,
        creator_fee_bps: 100,
        min_stake: 10_000_000,
        max_stake: 100_000_000,
        is_public: true,
        metadata_hash: BytesN::from_array(&env, &[0u8; 32]),
    };

    let market_id = client.create_market(&creator, &params);

    // Extend TTL multiple times by reading the market repeatedly
    for _ in 0..3 {
        client.get_market(&market_id);
    }

    // TTL should still be at the bumped value after multiple extensions
    let ttl = env.as_contract(&client.address, || {
        env.storage()
            .persistent()
            .get_ttl(&DataKey::Market(market_id))
    });

    assert!(ttl >= LEDGER_BUMP_MARKET - 14_400);
}

#[test]
fn test_ttl_after_prediction_submission() {
    // Test that TTL is properly set when a prediction is first submitted
    let env = Env::default();
    env.mock_all_auths();
    let client = deploy(&env);
    let creator = Address::generate(&env);
    let predictor = Address::generate(&env);
    let token = client.get_config().xlm_token;

    let params = CreateMarketParams {
        title: String::from_str(&env, "Prediction TTL Test"),
        description: String::from_str(&env, "Test TTL on prediction submission"),
        category: Symbol::new(&env, "Sports"),
        outcomes: vec![&env, symbol_short!("yes"), symbol_short!("no")],
        end_time: env.ledger().timestamp() + 1_000,
        resolution_time: env.ledger().timestamp() + 2_000,
        dispute_window: 86_400,
        creator_fee_bps: 100,
        min_stake: 10_000_000,
        max_stake: 100_000_000,
        is_public: true,
        metadata_hash: BytesN::from_array(&env, &[0u8; 32]),
    };

    let market_id = client.create_market(&creator, &params);
    fund(&env, &token, &predictor, 30_000_000);
    client.submit_prediction(&predictor, &market_id, &symbol_short!("yes"), &20_000_000);

    // Verify TTL is set for the prediction
    let ttl = env.as_contract(&client.address, || {
        env.storage()
            .persistent()
            .get_ttl(&DataKey::Prediction(market_id, predictor.clone()))
    });

    assert!(ttl >= LEDGER_BUMP_MARKET - 14_400);
}

// ── bump_market_ttl maintenance (Issue #1516) ─────────────────────────────────

/// Read the current persistent TTL (remaining ledgers) for a key.
fn persistent_ttl(env: &Env, client: &InsightArenaContractClient<'_>, key: DataKey) -> u32 {
    env.as_contract(&client.address, || env.storage().persistent().get_ttl(&key))
}

/// Create a market and give it a live AMM pool plus a recorded swap, so that the
/// escrow (`LiquidityPool`) and price-accumulator (`VolatilityState`) hot keys
/// both exist. Returns the market id.
fn market_with_pool_and_swap(env: &Env, client: &InsightArenaContractClient<'_>) -> u64 {
    let token = client.get_config().xlm_token;
    let creator = Address::generate(env);
    let provider = Address::generate(env);
    let trader = Address::generate(env);

    let params = CreateMarketParams {
        title: String::from_str(env, "Hot Keys"),
        description: String::from_str(env, "market + escrow + accumulator"),
        category: Symbol::new(env, "Sports"),
        outcomes: vec![env, symbol_short!("yes"), symbol_short!("no")],
        end_time: env.ledger().timestamp() + 1_000_000,
        resolution_time: env.ledger().timestamp() + 2_000_000,
        dispute_window: 86_400,
        creator_fee_bps: 0,
        min_stake: 10_000_000,
        max_stake: 1_000_000_000,
        is_public: true,
        metadata_hash: BytesN::from_array(env, &[0u8; 32]),
    };
    let market_id = client.create_market(&creator, &params);

    let sa = StellarAssetClient::new(env, &token);
    let tk = TokenClient::new(env, &token);

    let liquidity = 100_000_i128;
    sa.mint(&provider, &liquidity);
    tk.approve(&provider, &client.address, &liquidity, &500_000);
    client.add_liquidity(&provider, &market_id, &liquidity);

    let swap_amount = 10_000_i128;
    sa.mint(&trader, &swap_amount);
    tk.approve(&trader, &client.address, &swap_amount, &500_000);
    client.swap_outcome(
        &trader,
        &market_id,
        &symbol_short!("yes"),
        &symbol_short!("no"),
        &swap_amount,
        &0_i128,
    );

    market_id
}

/// Core acceptance criterion: a market that would otherwise be archived after the
/// default market TTL stays alive when `bump_market_ttl` is called mid-lifecycle.
///
/// We let the ledger advance further than `LEDGER_BUMP_MARKET` in total, topping
/// the TTL up once in between. Because a persistent entry is archived once the
/// cumulative elapsed ledgers exceed its live-until horizon, the market would be
/// gone at the end without the intervening bump — the successful read proves the
/// bump kept it alive past the default TTL.
#[test]
fn bump_market_ttl_keeps_market_alive_past_default_ttl() {
    let env = Env::default();
    env.mock_all_auths();
    let client = deploy(&env);
    let creator = Address::generate(&env);

    let params = CreateMarketParams {
        title: String::from_str(&env, "Long Lived"),
        description: String::from_str(&env, "survives past default TTL when bumped"),
        category: Symbol::new(&env, "Sports"),
        outcomes: vec![&env, symbol_short!("yes"), symbol_short!("no")],
        end_time: env.ledger().timestamp() + 10_000_000,
        resolution_time: env.ledger().timestamp() + 20_000_000,
        dispute_window: 86_400,
        creator_fee_bps: 100,
        min_stake: 10_000_000,
        max_stake: 100_000_000,
        is_public: true,
        metadata_hash: BytesN::from_array(&env, &[0u8; 32]),
    };
    let market_id = client.create_market(&creator, &params);
    let start_seq = env.ledger().sequence();

    // Hop 1: advance past the halfway point of the default horizon (still alive),
    // then bump so the market's live-until ledger is pushed a full
    // `LEDGER_BUMP_MARKET` further into the future.
    //
    // `step` is chosen so the cumulative advance (2 * step) clears the default
    // market TTL — proving the bump kept it alive past that horizon — while
    // staying under the contract *instance* TTL, which is a separate entry we do
    // not exercise here (in production every contract call keeps it live).
    let step = (LEDGER_BUMP_MARKET / 2) + 15_000; // 2 * step > LEDGER_BUMP_MARKET
    env.ledger().set_sequence_number(start_seq + step);
    client.bump_market_ttl(&market_id);

    // Hop 2: total elapsed since creation is now 2 * step, past the original
    // default TTL. Without the hop-1 bump the market entry would be archived.
    env.ledger().set_sequence_number(start_seq + 2 * step);

    let market = client.get_market(&market_id);
    assert_eq!(market.market_id, market_id);

    let ttl = persistent_ttl(&env, &client, DataKey::Market(market_id));
    assert!(ttl >= LEDGER_BUMP_MARKET - 14_400);
}

/// `bump_market_ttl` must extend the escrow pool and price-accumulator hot keys,
/// not just the market record.
#[test]
fn bump_market_ttl_extends_escrow_and_accumulator_keys() {
    let env = Env::default();
    env.mock_all_auths();
    let client = deploy(&env);

    let market_id = market_with_pool_and_swap(&env, &client);

    // Let a chunk of the TTL decay so the bump has visible work to do, while all
    // three hot keys are still comfortably alive.
    let start_seq = env.ledger().sequence();
    env.ledger().set_sequence_number(start_seq + 200_000);

    client.bump_market_ttl(&market_id);

    let market_ttl = persistent_ttl(&env, &client, DataKey::Market(market_id));
    let escrow_ttl = persistent_ttl(&env, &client, DataKey::LiquidityPool(market_id));
    let accumulator_ttl = persistent_ttl(&env, &client, DataKey::VolatilityState(market_id));

    assert!(market_ttl >= LEDGER_BUMP_MARKET - 14_400);
    assert!(escrow_ttl >= LEDGER_BUMP_ESCROW - 14_400);
    assert!(accumulator_ttl >= LEDGER_BUMP_ACCUMULATOR - 14_400);
}

/// The maintenance call is permissionless: it succeeds even with no signed auths
/// in the transaction, so any keeper can keep a live market alive.
#[test]
fn bump_market_ttl_requires_no_authorization() {
    let env = Env::default();
    env.mock_all_auths();
    let client = deploy(&env);
    let creator = Address::generate(&env);

    let params = CreateMarketParams {
        title: String::from_str(&env, "Permissionless"),
        description: String::from_str(&env, "no auth required"),
        category: Symbol::new(&env, "Sports"),
        outcomes: vec![&env, symbol_short!("yes"), symbol_short!("no")],
        end_time: env.ledger().timestamp() + 1_000,
        resolution_time: env.ledger().timestamp() + 2_000,
        dispute_window: 86_400,
        creator_fee_bps: 100,
        min_stake: 10_000_000,
        max_stake: 100_000_000,
        is_public: true,
        metadata_hash: BytesN::from_array(&env, &[0u8; 32]),
    };
    let market_id = client.create_market(&creator, &params);

    // Drop all mocked authorizations: a call that required auth would now trap.
    env.set_auths(&[]);
    client.bump_market_ttl(&market_id);

    let ttl = persistent_ttl(&env, &client, DataKey::Market(market_id));
    assert!(ttl >= LEDGER_BUMP_MARKET - 14_400);
}

/// Bumping a non-existent market returns `MarketNotFound` rather than trapping.
#[test]
fn bump_market_ttl_unknown_market_returns_not_found() {
    let env = Env::default();
    env.mock_all_auths();
    let client = deploy(&env);

    let result = client.try_bump_market_ttl(&999_u64);
    assert!(matches!(
        result,
        Err(Ok(InsightArenaError::MarketNotFound))
    ));
}

/// Documents the expired-without-bump path: absent any TTL extension, an active
/// market's hot key marches steadily toward archival as the ledger advances.
///
/// This is the negative counterpart to
/// `bump_market_ttl_keeps_market_alive_past_default_ttl`. We do not read the
/// entry past its live-until ledger (the host traps on an archived key); instead
/// we advance partway and assert the remaining TTL has decreased by exactly the
/// elapsed ledgers — demonstrating that, left unbumped, it reaches zero and the
/// market is archived out from under stakers.
#[test]
fn market_ttl_decays_toward_archival_without_bump() {
    let env = Env::default();
    env.mock_all_auths();
    let client = deploy(&env);
    let creator = Address::generate(&env);

    let params = CreateMarketParams {
        title: String::from_str(&env, "Decays"),
        description: String::from_str(&env, "expires without a bump"),
        category: Symbol::new(&env, "Sports"),
        outcomes: vec![&env, symbol_short!("yes"), symbol_short!("no")],
        end_time: env.ledger().timestamp() + 10_000_000,
        resolution_time: env.ledger().timestamp() + 20_000_000,
        dispute_window: 86_400,
        creator_fee_bps: 100,
        min_stake: 10_000_000,
        max_stake: 100_000_000,
        is_public: true,
        metadata_hash: BytesN::from_array(&env, &[0u8; 32]),
    };
    let market_id = client.create_market(&creator, &params);

    let ttl_before = persistent_ttl(&env, &client, DataKey::Market(market_id));

    // Advance the ledger without touching the market: no write, no bump.
    let elapsed = 100_000_u32;
    let start_seq = env.ledger().sequence();
    env.ledger().set_sequence_number(start_seq + elapsed);

    let ttl_after = persistent_ttl(&env, &client, DataKey::Market(market_id));

    // The remaining TTL shrank by exactly the elapsed ledgers; extrapolated, it
    // hits zero and the entry is archived unless something bumps it first.
    assert_eq!(ttl_after, ttl_before - elapsed);
    assert!(ttl_after < ttl_before);
}
