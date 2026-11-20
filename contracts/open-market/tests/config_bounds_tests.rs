use insightarena_contract::config::{self, *};
use insightarena_contract::storage_types::{VolumeFeeConfig, VolumeFeeEntry};
use insightarena_contract::{InsightArenaContract, InsightArenaContractClient, InsightArenaError};
use soroban_sdk::testutils::Address as _;
use soroban_sdk::{Address, Env, Vec};

fn deploy(env: &Env) -> InsightArenaContractClient<'_> {
    let id = env.register(InsightArenaContract, ());
    InsightArenaContractClient::new(env, &id)
}

fn register_token(env: &Env) -> Address {
    let token_admin = Address::generate(env);
    env.register_stellar_asset_contract_v2(token_admin)
        .address()
}

fn setup(env: &Env) -> (InsightArenaContractClient<'_>, Address, Address) {
    env.mock_all_auths();
    let client = deploy(env);
    let admin = Address::generate(env);
    let oracle = Address::generate(env);
    let token = register_token(env);
    client.initialize(&admin, &oracle, &200_u32, &token);
    (client, admin, oracle)
}

fn tiers(env: &Env, entries: &[(i128, u32)]) -> VolumeFeeConfig {
    let mut tiers: Vec<VolumeFeeEntry> = Vec::new(env);
    for &(volume_threshold, fee_bps) in entries {
        tiers.push_back(VolumeFeeEntry {
            volume_threshold,
            fee_bps,
        });
    }
    VolumeFeeConfig { tiers }
}

// ── 1. Protocol Fee Bounds ───────────────────────────────────────────────────

#[test]
fn protocol_fee_bounds_check() {
    let env = Env::default();
    let (client, _admin, _) = setup(&env);

    // Exact min (0 bps) accepted
    client.update_protocol_fee(&MIN_PROTOCOL_FEE_BPS);
    assert_eq!(client.get_config().protocol_fee_bps, MIN_PROTOCOL_FEE_BPS);

    // In-range typical value accepted
    client.update_protocol_fee(&500_u32);
    assert_eq!(client.get_config().protocol_fee_bps, 500);

    // Exact max (10_000 bps) accepted
    client.update_protocol_fee(&MAX_PROTOCOL_FEE_BPS);
    assert_eq!(client.get_config().protocol_fee_bps, MAX_PROTOCOL_FEE_BPS);

    // Just above max rejected
    let res = client.try_update_protocol_fee(&(MAX_PROTOCOL_FEE_BPS + 1));
    assert!(matches!(res, Err(Ok(InsightArenaError::InvalidFee))));
    assert_eq!(client.get_config().protocol_fee_bps, MAX_PROTOCOL_FEE_BPS);

    // u32::MAX rejected
    let res = client.try_update_protocol_fee(&u32::MAX);
    assert!(matches!(res, Err(Ok(InsightArenaError::InvalidFee))));
    assert_eq!(client.get_config().protocol_fee_bps, MAX_PROTOCOL_FEE_BPS);

    // Governance path bounds
    let gov_res = env.as_contract(&client.address, || {
        config::update_protocol_fee_from_governance(&env, MAX_PROTOCOL_FEE_BPS + 1)
    });
    assert!(matches!(gov_res, Err(InsightArenaError::InvalidFee)));
}

// ── 2. Timelock Delay Bounds ─────────────────────────────────────────────────

#[test]
fn timelock_delay_bounds_check() {
    let env = Env::default();
    let (client, admin, _) = setup(&env);

    let initial_delay = client.get_config().timelock_delay;

    // Just below min (0) rejected
    let res = client.try_set_timelock_delay(&admin, &0_u64);
    assert!(matches!(res, Err(Ok(InsightArenaError::InvalidInput))));
    assert_eq!(client.get_config().timelock_delay, initial_delay);

    // Exact min (1s) accepted
    client.set_timelock_delay(&admin, &MIN_TIMELOCK_DELAY);
    assert_eq!(client.get_config().timelock_delay, MIN_TIMELOCK_DELAY);

    // In-range typical accepted
    client.set_timelock_delay(&admin, &172_800_u64);
    assert_eq!(client.get_config().timelock_delay, 172_800);

    // Exact max (~30 days = 2_592_000s) accepted
    client.set_timelock_delay(&admin, &MAX_TIMELOCK_DELAY);
    assert_eq!(client.get_config().timelock_delay, MAX_TIMELOCK_DELAY);

    // Just above max rejected
    let res = client.try_set_timelock_delay(&admin, &(MAX_TIMELOCK_DELAY + 1));
    assert!(matches!(res, Err(Ok(InsightArenaError::InvalidInput))));
    assert_eq!(client.get_config().timelock_delay, MAX_TIMELOCK_DELAY);

    // u64::MAX rejected
    let res = client.try_set_timelock_delay(&admin, &u64::MAX);
    assert!(matches!(res, Err(Ok(InsightArenaError::InvalidInput))));
    assert_eq!(client.get_config().timelock_delay, MAX_TIMELOCK_DELAY);

    // Unauthorized caller rejected
    let attacker = Address::generate(&env);
    let res = client.try_set_timelock_delay(&attacker, &100_u64);
    assert!(matches!(res, Err(Ok(InsightArenaError::Unauthorized))));
}

// ── 3. Creator Reputation Bounds ─────────────────────────────────────────────

#[test]
fn creator_reputation_bounds_check() {
    let env = Env::default();
    let (client, admin, _) = setup(&env);

    // Exact min (0) accepted
    client.set_min_creator_reputation(&admin, &MIN_CREATOR_REPUTATION);
    assert_eq!(
        client.get_config().min_creator_reputation,
        MIN_CREATOR_REPUTATION
    );

    // In-range typical accepted
    client.set_min_creator_reputation(&admin, &500_u32);
    assert_eq!(client.get_config().min_creator_reputation, 500);

    // Exact max (1000) accepted
    client.set_min_creator_reputation(&admin, &MAX_CREATOR_REPUTATION);
    assert_eq!(
        client.get_config().min_creator_reputation,
        MAX_CREATOR_REPUTATION
    );

    // Just above max (1001) rejected
    let res = client.try_set_min_creator_reputation(&admin, &(MAX_CREATOR_REPUTATION + 1));
    assert!(matches!(res, Err(Ok(InsightArenaError::InvalidInput))));
    assert_eq!(
        client.get_config().min_creator_reputation,
        MAX_CREATOR_REPUTATION
    );

    // u32::MAX rejected
    let res = client.try_set_min_creator_reputation(&admin, &u32::MAX);
    assert!(matches!(res, Err(Ok(InsightArenaError::InvalidInput))));
    assert_eq!(
        client.get_config().min_creator_reputation,
        MAX_CREATOR_REPUTATION
    );

    // Governance path bounds
    let gov_res = env.as_contract(&client.address, || {
        config::update_min_reputation_from_governance(&env, MAX_CREATOR_REPUTATION + 1)
    });
    assert!(matches!(gov_res, Err(InsightArenaError::InvalidInput)));

    // Unauthorized caller rejected
    let attacker = Address::generate(&env);
    let res = client.try_set_min_creator_reputation(&attacker, &100_u32);
    assert!(matches!(res, Err(Ok(InsightArenaError::Unauthorized))));
}

// ── 4. Reputation Decay Half Life Bounds ─────────────────────────────────────

#[test]
fn reputation_decay_half_life_bounds_check() {
    let env = Env::default();
    let (client, admin, _) = setup(&env);

    let initial = client.get_config().reputation_half_life_seconds;

    // Just below min (0) rejected
    let res = env.as_contract(&client.address, || {
        config::set_reputation_decay_config(
            &env,
            admin.clone(),
            0_u32,
            config::ReputationDecayMode::Exponential,
        )
    });
    assert!(matches!(res, Err(InsightArenaError::InvalidInput)));
    assert_eq!(client.get_config().reputation_half_life_seconds, initial);

    // Exact min (1s) accepted
    let res = env.as_contract(&client.address, || {
        config::set_reputation_decay_config(
            &env,
            admin.clone(),
            MIN_REPUTATION_HALF_LIFE_SECONDS,
            config::ReputationDecayMode::Exponential,
        )
    });
    assert!(res.is_ok());
    assert_eq!(
        client.get_config().reputation_half_life_seconds,
        MIN_REPUTATION_HALF_LIFE_SECONDS
    );

    // In-range typical accepted
    let res = env.as_contract(&client.address, || {
        config::set_reputation_decay_config(
            &env,
            admin.clone(),
            2_592_000_u32,
            config::ReputationDecayMode::Linear,
        )
    });
    assert!(res.is_ok());
    assert_eq!(client.get_config().reputation_half_life_seconds, 2_592_000);

    // Exact max (u32::MAX) accepted (explicitly tested in reputation_tests.rs to disable time decay)
    let res = env.as_contract(&client.address, || {
        config::set_reputation_decay_config(
            &env,
            admin.clone(),
            MAX_REPUTATION_HALF_LIFE_SECONDS,
            config::ReputationDecayMode::Linear,
        )
    });
    assert!(res.is_ok());
    assert_eq!(
        client.get_config().reputation_half_life_seconds,
        MAX_REPUTATION_HALF_LIFE_SECONDS
    );
}

// ── 5. Season Decay Config Bounds ───────────────────────────────────────────

#[test]
fn season_decay_config_bounds_check() {
    let env = Env::default();
    let (client, admin, _) = setup(&env);

    let initial_grace = client.get_config().reputation_season_decay_grace;
    let initial_bps = client.get_config().reputation_season_decay_bps;

    // Grace just above max (101) rejected
    let res = env.as_contract(&client.address, || {
        config::set_season_decay_config(&env, admin.clone(), MAX_SEASON_DECAY_GRACE + 1, 1000_u32)
    });
    assert!(matches!(res, Err(InsightArenaError::InvalidInput)));
    assert_eq!(
        client.get_config().reputation_season_decay_grace,
        initial_grace
    );

    // Grace u32::MAX rejected
    let res = env.as_contract(&client.address, || {
        config::set_season_decay_config(&env, admin.clone(), u32::MAX, 1000_u32)
    });
    assert!(matches!(res, Err(InsightArenaError::InvalidInput)));

    // Decay bps just above max (10_001) rejected
    let res = env.as_contract(&client.address, || {
        config::set_season_decay_config(
            &env,
            admin.clone(),
            MIN_SEASON_DECAY_GRACE,
            MAX_SEASON_DECAY_BPS + 1,
        )
    });
    assert!(matches!(res, Err(InsightArenaError::InvalidInput)));
    assert_eq!(client.get_config().reputation_season_decay_bps, initial_bps);

    // Decay bps u32::MAX rejected
    let res = env.as_contract(&client.address, || {
        config::set_season_decay_config(&env, admin.clone(), MIN_SEASON_DECAY_GRACE, u32::MAX)
    });
    assert!(matches!(res, Err(InsightArenaError::InvalidInput)));

    // Exact min (grace 0, bps 0) accepted
    let res = env.as_contract(&client.address, || {
        config::set_season_decay_config(
            &env,
            admin.clone(),
            MIN_SEASON_DECAY_GRACE,
            MIN_SEASON_DECAY_BPS,
        )
    });
    assert!(res.is_ok());
    assert_eq!(
        client.get_config().reputation_season_decay_grace,
        MIN_SEASON_DECAY_GRACE
    );
    assert_eq!(
        client.get_config().reputation_season_decay_bps,
        MIN_SEASON_DECAY_BPS
    );

    // Exact max (grace 100, bps 10_000) accepted
    let res = env.as_contract(&client.address, || {
        config::set_season_decay_config(
            &env,
            admin.clone(),
            MAX_SEASON_DECAY_GRACE,
            MAX_SEASON_DECAY_BPS,
        )
    });
    assert!(res.is_ok());
    assert_eq!(
        client.get_config().reputation_season_decay_grace,
        MAX_SEASON_DECAY_GRACE
    );
    assert_eq!(
        client.get_config().reputation_season_decay_bps,
        MAX_SEASON_DECAY_BPS
    );
}

// ── 6. Market TTL Extension Bounds ──────────────────────────────────────────

#[test]
fn market_ttl_extension_bounds_check() {
    let env = Env::default();
    let (client, admin, _) = setup(&env);

    let initial = client.get_config().market_ttl_extension;

    // Just below min (0) rejected
    let res = client.try_set_market_ttl_extension(&admin, &0_u32);
    assert!(matches!(res, Err(Ok(InsightArenaError::InvalidInput))));
    assert_eq!(client.get_config().market_ttl_extension, initial);

    // Exact min (1 ledger) accepted
    client.set_market_ttl_extension(&admin, &MIN_MARKET_TTL_EXTENSION);
    assert_eq!(
        client.get_config().market_ttl_extension,
        MIN_MARKET_TTL_EXTENSION
    );

    // In-range typical accepted
    client.set_market_ttl_extension(&admin, &432_000_u32);
    assert_eq!(client.get_config().market_ttl_extension, 432_000);

    // Exact max (5_184_000 ledgers) accepted
    client.set_market_ttl_extension(&admin, &MAX_MARKET_TTL_EXTENSION);
    assert_eq!(
        client.get_config().market_ttl_extension,
        MAX_MARKET_TTL_EXTENSION
    );

    // Just above max rejected
    let res = client.try_set_market_ttl_extension(&admin, &(MAX_MARKET_TTL_EXTENSION + 1));
    assert!(matches!(res, Err(Ok(InsightArenaError::InvalidInput))));
    assert_eq!(
        client.get_config().market_ttl_extension,
        MAX_MARKET_TTL_EXTENSION
    );

    // u32::MAX rejected
    let res = client.try_set_market_ttl_extension(&admin, &u32::MAX);
    assert!(matches!(res, Err(Ok(InsightArenaError::InvalidInput))));
    assert_eq!(
        client.get_config().market_ttl_extension,
        MAX_MARKET_TTL_EXTENSION
    );

    // Unauthorized caller rejected
    let attacker = Address::generate(&env);
    let res = client.try_set_market_ttl_extension(&attacker, &100_000_u32);
    assert!(matches!(res, Err(Ok(InsightArenaError::Unauthorized))));
}

// ── 7. Stake Bounds Check ───────────────────────────────────────────────────

#[test]
fn stake_bounds_check() {
    let env = Env::default();
    let (client, admin, _) = setup(&env);

    let initial_min = client.get_config().min_stake_xlm;
    let _initial_max = client.get_config().max_stake_xlm;

    // 0 min rejected
    let res = client.try_set_stake_bounds(&admin, &0_i128, &100_000_000_i128);
    assert!(matches!(res, Err(Ok(InsightArenaError::InvalidInput))));
    assert_eq!(client.get_config().min_stake_xlm, initial_min);

    // Negative min rejected
    let res = client.try_set_stake_bounds(&admin, &-1_i128, &100_000_000_i128);
    assert!(matches!(res, Err(Ok(InsightArenaError::InvalidInput))));

    // 0 max rejected
    let res = client.try_set_stake_bounds(&admin, &10_i128, &0_i128);
    assert!(matches!(res, Err(Ok(InsightArenaError::InvalidInput))));

    // Cross-parameter violation: min > max rejected
    let res = client.try_set_stake_bounds(&admin, &100_000_000_i128, &50_000_000_i128);
    assert!(matches!(res, Err(Ok(InsightArenaError::InvalidInput))));

    // Max beyond MAX_STAKE_XLM rejected
    let res = client.try_set_stake_bounds(&admin, &10_i128, &(MAX_STAKE_XLM + 1));
    assert!(matches!(res, Err(Ok(InsightArenaError::InvalidInput))));

    // i128::MAX rejected
    let res = client.try_set_stake_bounds(&admin, &10_i128, &i128::MAX);
    assert!(matches!(res, Err(Ok(InsightArenaError::InvalidInput))));

    // Exact min (1 stroop) and in-range max accepted
    client.set_stake_bounds(&admin, &MIN_STAKE_XLM, &100_000_000_i128);
    assert_eq!(client.get_config().min_stake_xlm, MIN_STAKE_XLM);
    assert_eq!(client.get_config().max_stake_xlm, 100_000_000);

    // Exact max accepted
    client.set_stake_bounds(&admin, &MIN_STAKE_XLM, &MAX_STAKE_XLM);
    assert_eq!(client.get_config().max_stake_xlm, MAX_STAKE_XLM);

    // Min == Max boundary condition accepted
    client.set_stake_bounds(&admin, &50_000_000_i128, &50_000_000_i128);
    assert_eq!(client.get_config().min_stake_xlm, 50_000_000);
    assert_eq!(client.get_config().max_stake_xlm, 50_000_000);

    // Governance path bounds
    let gov_res = env.as_contract(&client.address, || {
        config::update_min_stake_from_governance(&env, MAX_STAKE_XLM + 1)
    });
    assert!(matches!(gov_res, Err(InsightArenaError::InvalidInput)));

    // Unauthorized caller rejected
    let attacker = Address::generate(&env);
    let res = client.try_set_stake_bounds(&attacker, &10_000_000_i128, &20_000_000_i128);
    assert!(matches!(res, Err(Ok(InsightArenaError::Unauthorized))));
}

// ── 8. Insurance Pool Share Bounds ──────────────────────────────────────────

#[test]
fn insurance_pool_share_bounds_check() {
    let env = Env::default();
    let (client, admin, _) = setup(&env);

    // Exact min (0 bps) accepted
    client.set_insurance_pool_share_bps(&admin, &MIN_INSURANCE_POOL_SHARE_BPS);
    assert_eq!(
        client.get_config().insurance_pool_share_bps,
        MIN_INSURANCE_POOL_SHARE_BPS
    );

    // In-range typical accepted
    client.set_insurance_pool_share_bps(&admin, &1000_u32);
    assert_eq!(client.get_config().insurance_pool_share_bps, 1000);

    // Exact max (10_000 bps) accepted
    client.set_insurance_pool_share_bps(&admin, &MAX_INSURANCE_POOL_SHARE_BPS);
    assert_eq!(
        client.get_config().insurance_pool_share_bps,
        MAX_INSURANCE_POOL_SHARE_BPS
    );

    // Just above max rejected
    let res = client.try_set_insurance_pool_share_bps(&admin, &(MAX_INSURANCE_POOL_SHARE_BPS + 1));
    assert!(matches!(res, Err(Ok(InsightArenaError::InvalidFee))));
    assert_eq!(
        client.get_config().insurance_pool_share_bps,
        MAX_INSURANCE_POOL_SHARE_BPS
    );

    // u32::MAX rejected
    let res = client.try_set_insurance_pool_share_bps(&admin, &u32::MAX);
    assert!(matches!(res, Err(Ok(InsightArenaError::InvalidFee))));
    assert_eq!(
        client.get_config().insurance_pool_share_bps,
        MAX_INSURANCE_POOL_SHARE_BPS
    );

    // Unauthorized caller rejected
    let attacker = Address::generate(&env);
    let res = client.try_set_insurance_pool_share_bps(&attacker, &500_u32);
    assert!(matches!(res, Err(Ok(InsightArenaError::Unauthorized))));
}

// ── 9. Max Liquidity Per Outcome Bounds ──────────────────────────────────────

#[test]
fn max_liquidity_per_outcome_bounds_check() {
    let env = Env::default();
    let (client, admin, _) = setup(&env);

    let initial = client.get_config().max_liquidity_per_outcome;

    // Negative rejected
    let res = client.try_set_max_liquidity_per_outcome(&admin, &-1_i128);
    assert!(matches!(res, Err(Ok(InsightArenaError::InvalidInput))));
    assert_eq!(client.get_config().max_liquidity_per_outcome, initial);

    // Exact min (0 = unlimited) accepted
    client.set_max_liquidity_per_outcome(&admin, &MIN_MAX_LIQUIDITY_PER_OUTCOME);
    assert_eq!(
        client.get_config().max_liquidity_per_outcome,
        MIN_MAX_LIQUIDITY_PER_OUTCOME
    );

    // In-range typical accepted
    client.set_max_liquidity_per_outcome(&admin, &1_000_000_000_i128);
    assert_eq!(client.get_config().max_liquidity_per_outcome, 1_000_000_000);

    // Exact max accepted
    client.set_max_liquidity_per_outcome(&admin, &MAX_MAX_LIQUIDITY_PER_OUTCOME);
    assert_eq!(
        client.get_config().max_liquidity_per_outcome,
        MAX_MAX_LIQUIDITY_PER_OUTCOME
    );

    // Just above max rejected
    let res =
        client.try_set_max_liquidity_per_outcome(&admin, &(MAX_MAX_LIQUIDITY_PER_OUTCOME + 1));
    assert!(matches!(res, Err(Ok(InsightArenaError::InvalidInput))));
    assert_eq!(
        client.get_config().max_liquidity_per_outcome,
        MAX_MAX_LIQUIDITY_PER_OUTCOME
    );

    // i128::MAX rejected
    let res = client.try_set_max_liquidity_per_outcome(&admin, &i128::MAX);
    assert!(matches!(res, Err(Ok(InsightArenaError::InvalidInput))));
    assert_eq!(
        client.get_config().max_liquidity_per_outcome,
        MAX_MAX_LIQUIDITY_PER_OUTCOME
    );

    // Unauthorized caller rejected
    let attacker = Address::generate(&env);
    let res = client.try_set_max_liquidity_per_outcome(&attacker, &100_i128);
    assert!(matches!(res, Err(Ok(InsightArenaError::Unauthorized))));
}

// ── 10. Treasury Split Bounds & Sum Validation ───────────────────────────────

#[test]
fn treasury_split_bounds_check() {
    let env = Env::default();
    let (client, admin, _) = setup(&env);
    let treasury = Address::generate(&env);

    let initial_treasury_bps = client.get_config().treasury_split_bps;
    let initial_lp_bps = client.get_config().lp_split_bps;

    // Cross-parameter violation: sum < 10_000 rejected
    let res = client.try_set_treasury_split(&admin, &treasury, &5_000_u32, &4_999_u32);
    assert!(matches!(res, Err(Ok(InsightArenaError::InvalidFee))));
    assert_eq!(client.get_config().treasury_split_bps, initial_treasury_bps);
    assert_eq!(client.get_config().lp_split_bps, initial_lp_bps);

    // Cross-parameter violation: sum > 10_000 rejected
    let res = client.try_set_treasury_split(&admin, &treasury, &5_000_u32, &5_001_u32);
    assert!(matches!(res, Err(Ok(InsightArenaError::InvalidFee))));

    // Component > 10_000 rejected even with potential overflow wrap
    let res = client.try_set_treasury_split(&admin, &treasury, &10_001_u32, &0_u32);
    assert!(matches!(res, Err(Ok(InsightArenaError::InvalidFee))));

    let res = client.try_set_treasury_split(&admin, &treasury, &u32::MAX, &10_000_u32);
    assert!(matches!(res, Err(Ok(InsightArenaError::InvalidFee))));

    // Exact boundaries (10_000 / 0) accepted
    client.set_treasury_split(&admin, &treasury, &10_000_u32, &0_u32);
    assert_eq!(client.get_config().treasury_split_bps, 10_000);
    assert_eq!(client.get_config().lp_split_bps, 0);

    // Exact boundaries (0 / 10_000) accepted
    client.set_treasury_split(&admin, &treasury, &0_u32, &10_000_u32);
    assert_eq!(client.get_config().treasury_split_bps, 0);
    assert_eq!(client.get_config().lp_split_bps, 10_000);

    // In-range 50/50 accepted
    client.set_treasury_split(&admin, &treasury, &5_000_u32, &5_000_u32);
    assert_eq!(client.get_config().treasury_split_bps, 5_000);
    assert_eq!(client.get_config().lp_split_bps, 5_000);

    // Unauthorized caller rejected
    let attacker = Address::generate(&env);
    let res = client.try_set_treasury_split(&attacker, &treasury, &5_000_u32, &5_000_u32);
    assert!(matches!(res, Err(Ok(InsightArenaError::Unauthorized))));
}

// ── 11. Arbiter Config Bounds ───────────────────────────────────────────────

#[test]
fn arbiter_config_bounds_check() {
    let env = Env::default();
    let (client, admin, _) = setup(&env);

    let initial_q = client.get_config().arbiter_quorum_bps;
    let _initial_s = client.get_config().arbiter_slash_bps;
    let _initial_p = client.get_config().arbiter_voting_period_seconds;

    // Quorum 0 rejected
    let res = client.try_set_arbiter_config(&admin, &0_u32, &1000_u32, &172_800_u64);
    assert!(matches!(res, Err(Ok(InsightArenaError::InvalidInput))));
    assert_eq!(client.get_config().arbiter_quorum_bps, initial_q);

    // Quorum > 10_000 rejected
    let res = client.try_set_arbiter_config(&admin, &10_001_u32, &1000_u32, &172_800_u64);
    assert!(matches!(res, Err(Ok(InsightArenaError::InvalidInput))));

    // Slash > 10_000 rejected
    let res = client.try_set_arbiter_config(&admin, &5000_u32, &10_001_u32, &172_800_u64);
    assert!(matches!(res, Err(Ok(InsightArenaError::InvalidInput))));

    // Slash u32::MAX rejected
    let res = client.try_set_arbiter_config(&admin, &5000_u32, &u32::MAX, &172_800_u64);
    assert!(matches!(res, Err(Ok(InsightArenaError::InvalidInput))));

    // Voting period 0 rejected
    let res = client.try_set_arbiter_config(&admin, &5000_u32, &1000_u32, &0_u64);
    assert!(matches!(res, Err(Ok(InsightArenaError::InvalidInput))));

    // Voting period > 2_592_000 rejected
    let res = client.try_set_arbiter_config(
        &admin,
        &5000_u32,
        &1000_u32,
        &(MAX_ARBITER_VOTING_PERIOD_SECONDS + 1),
    );
    assert!(matches!(res, Err(Ok(InsightArenaError::InvalidInput))));

    // Voting period u64::MAX rejected
    let res = client.try_set_arbiter_config(&admin, &5000_u32, &1000_u32, &u64::MAX);
    assert!(matches!(res, Err(Ok(InsightArenaError::InvalidInput))));

    // Exact min boundary accepted
    client.set_arbiter_config(
        &admin,
        &MIN_ARBITER_QUORUM_BPS,
        &MIN_ARBITER_SLASH_BPS,
        &MIN_ARBITER_VOTING_PERIOD_SECONDS,
    );
    assert_eq!(
        client.get_config().arbiter_quorum_bps,
        MIN_ARBITER_QUORUM_BPS
    );
    assert_eq!(client.get_config().arbiter_slash_bps, MIN_ARBITER_SLASH_BPS);
    assert_eq!(
        client.get_config().arbiter_voting_period_seconds,
        MIN_ARBITER_VOTING_PERIOD_SECONDS
    );

    // Exact max boundary accepted
    client.set_arbiter_config(
        &admin,
        &MAX_ARBITER_QUORUM_BPS,
        &MAX_ARBITER_SLASH_BPS,
        &MAX_ARBITER_VOTING_PERIOD_SECONDS,
    );
    assert_eq!(
        client.get_config().arbiter_quorum_bps,
        MAX_ARBITER_QUORUM_BPS
    );
    assert_eq!(client.get_config().arbiter_slash_bps, MAX_ARBITER_SLASH_BPS);
    assert_eq!(
        client.get_config().arbiter_voting_period_seconds,
        MAX_ARBITER_VOTING_PERIOD_SECONDS
    );

    // Unauthorized caller rejected
    let attacker = Address::generate(&env);
    let res = client.try_set_arbiter_config(&attacker, &5000_u32, &1000_u32, &172_800_u64);
    assert!(matches!(res, Err(Ok(InsightArenaError::Unauthorized))));
}

// ── 12. Governance Quorum Bounds ─────────────────────────────────────────────

#[test]
fn governance_quorum_bounds_check() {
    let env = Env::default();
    let (client, admin, _) = setup(&env);

    // Exact min (0 bps) accepted
    client.set_governance_quorum_bps(&admin, &MIN_GOVERNANCE_QUORUM_BPS);
    assert_eq!(
        client.get_config().governance_quorum_bps,
        MIN_GOVERNANCE_QUORUM_BPS
    );

    // In-range accepted
    client.set_governance_quorum_bps(&admin, &1000_u32);
    assert_eq!(client.get_config().governance_quorum_bps, 1000);

    // Exact max (10_000 bps) accepted
    client.set_governance_quorum_bps(&admin, &MAX_GOVERNANCE_QUORUM_BPS);
    assert_eq!(
        client.get_config().governance_quorum_bps,
        MAX_GOVERNANCE_QUORUM_BPS
    );

    // Just above max rejected
    let res = client.try_set_governance_quorum_bps(&admin, &(MAX_GOVERNANCE_QUORUM_BPS + 1));
    assert!(matches!(res, Err(Ok(InsightArenaError::InvalidInput))));
    assert_eq!(
        client.get_config().governance_quorum_bps,
        MAX_GOVERNANCE_QUORUM_BPS
    );

    // u32::MAX rejected
    let res = client.try_set_governance_quorum_bps(&admin, &u32::MAX);
    assert!(matches!(res, Err(Ok(InsightArenaError::InvalidInput))));
    assert_eq!(
        client.get_config().governance_quorum_bps,
        MAX_GOVERNANCE_QUORUM_BPS
    );

    // Governance path bounds
    let gov_res = env.as_contract(&client.address, || {
        config::update_governance_quorum_from_governance(&env, MAX_GOVERNANCE_QUORUM_BPS + 1)
    });
    assert!(matches!(gov_res, Err(InsightArenaError::InvalidInput)));

    // Unauthorized caller rejected
    let attacker = Address::generate(&env);
    let res = client.try_set_governance_quorum_bps(&attacker, &1000_u32);
    assert!(matches!(res, Err(Ok(InsightArenaError::Unauthorized))));
}

// ── 13. Max Outcomes Bounds ──────────────────────────────────────────────────

#[test]
fn max_outcomes_bounds_check() {
    let env = Env::default();
    let (client, admin, _) = setup(&env);

    let initial = client.get_config().max_outcomes;

    // 0 rejected
    let res = client.try_set_max_outcomes(&admin, &0_u32);
    assert!(matches!(res, Err(Ok(InsightArenaError::InvalidInput))));
    assert_eq!(client.get_config().max_outcomes, initial);

    // Just below min (1) rejected
    let res = client.try_set_max_outcomes(&admin, &1_u32);
    assert!(matches!(res, Err(Ok(InsightArenaError::InvalidInput))));
    assert_eq!(client.get_config().max_outcomes, initial);

    // Exact min (2) accepted
    client.set_max_outcomes(&admin, &MIN_MAX_OUTCOMES);
    assert_eq!(client.get_config().max_outcomes, MIN_MAX_OUTCOMES);

    // In-range typical accepted
    client.set_max_outcomes(&admin, &10_u32);
    assert_eq!(client.get_config().max_outcomes, 10);

    // Exact max (50) accepted
    client.set_max_outcomes(&admin, &MAX_MAX_OUTCOMES);
    assert_eq!(client.get_config().max_outcomes, MAX_MAX_OUTCOMES);

    // Just above max (51) rejected
    let res = client.try_set_max_outcomes(&admin, &(MAX_MAX_OUTCOMES + 1));
    assert!(matches!(res, Err(Ok(InsightArenaError::InvalidInput))));
    assert_eq!(client.get_config().max_outcomes, MAX_MAX_OUTCOMES);

    // u32::MAX rejected
    let res = client.try_set_max_outcomes(&admin, &u32::MAX);
    assert!(matches!(res, Err(Ok(InsightArenaError::InvalidInput))));
    assert_eq!(client.get_config().max_outcomes, MAX_MAX_OUTCOMES);

    // Unauthorized caller rejected
    let attacker = Address::generate(&env);
    let res = client.try_set_max_outcomes(&attacker, &10_u32);
    assert!(matches!(res, Err(Ok(InsightArenaError::Unauthorized))));
}

// ── 14. Volume Fee Config Bounds ────────────────────────────────────────────

#[test]
fn volume_fee_config_bounds_check() {
    let env = Env::default();
    let (client, admin, _) = setup(&env);

    // Empty tiers rejected
    let empty = VolumeFeeConfig {
        tiers: Vec::new(&env),
    };
    let res = client.try_update_volume_fee_config(&admin, &empty);
    assert!(matches!(res, Err(Ok(InsightArenaError::InvalidInput))));

    // Tier 0 threshold > 0 rejected
    let nonzero_first = tiers(&env, &[(10, 30)]);
    let res = client.try_update_volume_fee_config(&admin, &nonzero_first);
    assert!(matches!(res, Err(Ok(InsightArenaError::InvalidInput))));

    // Single tier (MIN_VOLUME_FEE_TIERS = 1) accepted
    let single = tiers(&env, &[(0, 30)]);
    client.update_volume_fee_config(&admin, &single);
    assert_eq!(client.get_volume_fee_config().tiers.len(), 1);

    // Fee bps > 10_000 rejected
    let fee_too_high = tiers(&env, &[(0, 10_001)]);
    let res = client.try_update_volume_fee_config(&admin, &fee_too_high);
    assert!(matches!(res, Err(Ok(InsightArenaError::InvalidFee))));

    // Max tiers (50) accepted
    let mut entries = [(0_i128, 30_u32); 50];
    for i in 0..50 {
        entries[i] = (i as i128 * 1_000, 30);
    }
    let max_schedule = tiers(&env, &entries);
    client.update_volume_fee_config(&admin, &max_schedule);
    assert_eq!(client.get_volume_fee_config().tiers.len(), 50);

    // Tiers > 50 rejected
    let mut too_many_entries = [(0_i128, 30_u32); 51];
    for i in 0..51 {
        too_many_entries[i] = (i as i128 * 1_000, 30);
    }
    let too_many = tiers(&env, &too_many_entries);
    let res = client.try_update_volume_fee_config(&admin, &too_many);
    assert!(matches!(res, Err(Ok(InsightArenaError::InvalidInput))));
    assert_eq!(client.get_volume_fee_config().tiers.len(), 50);

    // Unauthorized caller rejected
    let attacker = Address::generate(&env);
    let res = client.try_update_volume_fee_config(&attacker, &single);
    assert!(matches!(res, Err(Ok(InsightArenaError::Unauthorized))));
}

// ── 15. Oracle Stake Config Bounds ──────────────────────────────────────────

#[test]
fn oracle_stake_config_bounds_check() {
    let env = Env::default();
    let (client, admin, _) = setup(&env);

    let initial_stake = client.get_config().oracle_stake_amount;
    let initial_reward = client.get_config().oracle_reward_bps;

    // Stake 0 rejected
    let res = client.try_set_oracle_stake_config(&admin, &0_i128, &500_u32);
    assert!(matches!(res, Err(Ok(InsightArenaError::InvalidInput))));
    assert_eq!(client.get_config().oracle_stake_amount, initial_stake);

    // Stake negative rejected
    let res = client.try_set_oracle_stake_config(&admin, &-1_i128, &500_u32);
    assert!(matches!(res, Err(Ok(InsightArenaError::InvalidInput))));

    // Stake > MAX_ORACLE_STAKE_AMOUNT rejected
    let res = client.try_set_oracle_stake_config(&admin, &(MAX_ORACLE_STAKE_AMOUNT + 1), &500_u32);
    assert!(matches!(res, Err(Ok(InsightArenaError::InvalidInput))));

    // Stake i128::MAX rejected
    let res = client.try_set_oracle_stake_config(&admin, &i128::MAX, &500_u32);
    assert!(matches!(res, Err(Ok(InsightArenaError::InvalidInput))));

    // Reward > 10_000 rejected
    let res =
        client.try_set_oracle_stake_config(&admin, &100_000_000_i128, &(MAX_ORACLE_REWARD_BPS + 1));
    assert!(matches!(res, Err(Ok(InsightArenaError::InvalidFee))));
    assert_eq!(client.get_config().oracle_reward_bps, initial_reward);

    // Reward u32::MAX rejected
    let res = client.try_set_oracle_stake_config(&admin, &100_000_000_i128, &u32::MAX);
    assert!(matches!(res, Err(Ok(InsightArenaError::InvalidFee))));

    // Exact min (stake 1 stroop, reward 0 bps) accepted
    client.set_oracle_stake_config(&admin, &MIN_ORACLE_STAKE_AMOUNT, &MIN_ORACLE_REWARD_BPS);
    assert_eq!(
        client.get_config().oracle_stake_amount,
        MIN_ORACLE_STAKE_AMOUNT
    );
    assert_eq!(client.get_config().oracle_reward_bps, MIN_ORACLE_REWARD_BPS);

    // Exact max accepted
    client.set_oracle_stake_config(&admin, &MAX_ORACLE_STAKE_AMOUNT, &MAX_ORACLE_REWARD_BPS);
    assert_eq!(
        client.get_config().oracle_stake_amount,
        MAX_ORACLE_STAKE_AMOUNT
    );
    assert_eq!(client.get_config().oracle_reward_bps, MAX_ORACLE_REWARD_BPS);

    // Unauthorized caller rejected
    let attacker = Address::generate(&env);
    let res = client.try_set_oracle_stake_config(&attacker, &100_000_000_i128, &500_u32);
    assert!(matches!(res, Err(Ok(InsightArenaError::Unauthorized))));
}

// ── 16. Vesting Config Bounds ───────────────────────────────────────────────

#[test]
fn vesting_config_bounds_check() {
    let env = Env::default();
    let (client, admin, _) = setup(&env);

    let initial_tranches = client.get_config().vesting_tranche_count;
    let initial_interval = client.get_config().vesting_interval_seconds;

    // Tranches 0 rejected
    let res = client.try_set_vesting_config(&admin, &0_u32, &2_592_000_u64);
    assert!(matches!(res, Err(Ok(InsightArenaError::InvalidInput))));
    assert_eq!(client.get_config().vesting_tranche_count, initial_tranches);

    // Tranches > 100 rejected
    let res =
        client.try_set_vesting_config(&admin, &(MAX_VESTING_TRANCHE_COUNT + 1), &2_592_000_u64);
    assert!(matches!(res, Err(Ok(InsightArenaError::InvalidInput))));

    // Tranches u32::MAX rejected
    let res = client.try_set_vesting_config(&admin, &u32::MAX, &2_592_000_u64);
    assert!(matches!(res, Err(Ok(InsightArenaError::InvalidInput))));

    // Interval 0 rejected
    let res = client.try_set_vesting_config(&admin, &4_u32, &0_u64);
    assert!(matches!(res, Err(Ok(InsightArenaError::InvalidInput))));
    assert_eq!(
        client.get_config().vesting_interval_seconds,
        initial_interval
    );

    // Interval > 1 year rejected
    let res = client.try_set_vesting_config(&admin, &4_u32, &(MAX_VESTING_INTERVAL_SECONDS + 1));
    assert!(matches!(res, Err(Ok(InsightArenaError::InvalidInput))));

    // Interval u64::MAX rejected
    let res = client.try_set_vesting_config(&admin, &4_u32, &u64::MAX);
    assert!(matches!(res, Err(Ok(InsightArenaError::InvalidInput))));

    // Exact min (1 tranche, 1s interval) accepted
    client.set_vesting_config(
        &admin,
        &MIN_VESTING_TRANCHE_COUNT,
        &MIN_VESTING_INTERVAL_SECONDS,
    );
    assert_eq!(
        client.get_config().vesting_tranche_count,
        MIN_VESTING_TRANCHE_COUNT
    );
    assert_eq!(
        client.get_config().vesting_interval_seconds,
        MIN_VESTING_INTERVAL_SECONDS
    );

    // Exact max (100 tranches, 31_536_000s interval) accepted
    client.set_vesting_config(
        &admin,
        &MAX_VESTING_TRANCHE_COUNT,
        &MAX_VESTING_INTERVAL_SECONDS,
    );
    assert_eq!(
        client.get_config().vesting_tranche_count,
        MAX_VESTING_TRANCHE_COUNT
    );
    assert_eq!(
        client.get_config().vesting_interval_seconds,
        MAX_VESTING_INTERVAL_SECONDS
    );

    // Unauthorized caller rejected
    let attacker = Address::generate(&env);
    let res = client.try_set_vesting_config(&attacker, &4_u32, &2_592_000_u64);
    assert!(matches!(res, Err(Ok(InsightArenaError::Unauthorized))));
}

// ── 17. Bond Amount Bounds ──────────────────────────────────────────────────

#[test]
fn bond_amount_bounds_check() {
    let env = Env::default();
    let (client, admin, _) = setup(&env);

    let initial = client.get_config().bond_amount;

    // Negative rejected
    let res = client.try_set_bond_amount(&admin, &-1_i128);
    assert!(matches!(res, Err(Ok(InsightArenaError::InvalidInput))));
    assert_eq!(client.get_config().bond_amount, initial);

    // Exact min (0 = disabled) accepted
    client.set_bond_amount(&admin, &MIN_BOND_AMOUNT);
    assert_eq!(client.get_config().bond_amount, MIN_BOND_AMOUNT);

    // In-range typical accepted
    client.set_bond_amount(&admin, &10_000_000_i128);
    assert_eq!(client.get_config().bond_amount, 10_000_000);

    // Exact max accepted
    client.set_bond_amount(&admin, &MAX_BOND_AMOUNT);
    assert_eq!(client.get_config().bond_amount, MAX_BOND_AMOUNT);

    // Just above max rejected
    let res = client.try_set_bond_amount(&admin, &(MAX_BOND_AMOUNT + 1));
    assert!(matches!(res, Err(Ok(InsightArenaError::InvalidInput))));
    assert_eq!(client.get_config().bond_amount, MAX_BOND_AMOUNT);

    // i128::MAX rejected
    let res = client.try_set_bond_amount(&admin, &i128::MAX);
    assert!(matches!(res, Err(Ok(InsightArenaError::InvalidInput))));
    assert_eq!(client.get_config().bond_amount, MAX_BOND_AMOUNT);

    // Governance path bounds
    let gov_res = env.as_contract(&client.address, || {
        config::update_bond_amount_from_governance(&env, MAX_BOND_AMOUNT + 1)
    });
    assert!(matches!(gov_res, Err(InsightArenaError::InvalidInput)));

    // Unauthorized caller rejected
    let attacker = Address::generate(&env);
    let res = client.try_set_bond_amount(&attacker, &10_000_000_i128);
    assert!(matches!(res, Err(Ok(InsightArenaError::Unauthorized))));
}

// ── 18. Early Exit Fee Bounds ────────────────────────────────────────────────

#[test]
fn early_exit_fee_bounds_check() {
    let env = Env::default();
    let (client, admin, _) = setup(&env);

    // Exact min (0 bps) accepted
    client.set_early_exit_fee_bps(&admin, &MIN_EARLY_EXIT_FEE_BPS);
    assert_eq!(
        client.get_config().early_exit_fee_bps,
        MIN_EARLY_EXIT_FEE_BPS
    );

    // In-range accepted
    client.set_early_exit_fee_bps(&admin, &500_u32);
    assert_eq!(client.get_config().early_exit_fee_bps, 500);

    // Exact max (10_000 bps) accepted
    client.set_early_exit_fee_bps(&admin, &MAX_EARLY_EXIT_FEE_BPS);
    assert_eq!(
        client.get_config().early_exit_fee_bps,
        MAX_EARLY_EXIT_FEE_BPS
    );

    // Just above max rejected
    let res = client.try_set_early_exit_fee_bps(&admin, &(MAX_EARLY_EXIT_FEE_BPS + 1));
    assert!(matches!(res, Err(Ok(InsightArenaError::InvalidFee))));
    assert_eq!(
        client.get_config().early_exit_fee_bps,
        MAX_EARLY_EXIT_FEE_BPS
    );

    // u32::MAX rejected
    let res = client.try_set_early_exit_fee_bps(&admin, &u32::MAX);
    assert!(matches!(res, Err(Ok(InsightArenaError::InvalidFee))));
    assert_eq!(
        client.get_config().early_exit_fee_bps,
        MAX_EARLY_EXIT_FEE_BPS
    );

    // Unauthorized caller rejected
    let attacker = Address::generate(&env);
    let res = client.try_set_early_exit_fee_bps(&attacker, &500_u32);
    assert!(matches!(res, Err(Ok(InsightArenaError::Unauthorized))));
}
