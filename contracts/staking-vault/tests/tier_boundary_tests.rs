#![cfg(test)]

// ---------------------------------------------------------------------------
// #1803 — `tier_for` boundary behavior
//
// Kept in its own file rather than tests/staking_tests.rs: that file also
// exercises unstake/withdraw/deposit_fees/pending_rewards/claim_rewards/
// set_paused, none of which exist on StakingVaultClient in the current
// lib.rs (a separate, much larger pre-existing gap between the contract and
// its own test suite - see the PR description). Splitting these tests out
// lets them compile and run independently of that unrelated breakage.
//
// The issue as filed assumed `tier_for` resolves a tier by comparing
// `duration` against each tier's minimum threshold (i.e. ">="/">" semantics,
// where a duration between two configured tiers falls through to the
// next-lower one). That is not what the current implementation does:
// `lock::tier_for` (contracts/staking-vault/src/lock.rs) matches a tier by
// *exact* equality on `duration` only, with no threshold/fallthrough logic
// at all. A duration that doesn't exactly match one of the configured tiers
// - even by a single second - returns `InvalidLockPeriod` rather than
// resolving to a lower tier. These tests pin down that actual exact-match
// behavior at each configured tier's boundary, so a future refactor can't
// silently turn it into threshold matching (or vice versa) without a test
// failing.
// ---------------------------------------------------------------------------

use soroban_sdk::{
    testutils::Address as _,
    token::{StellarAssetClient, TokenClient},
    Address, Env, Vec,
};
use staking_vault::{LockTier, StakingError, StakingVault, StakingVaultClient, UnbondingConfig};

fn setup_token(env: &Env) -> (Address, TokenClient<'static>, StellarAssetClient<'static>) {
    let admin = Address::generate(env);
    let sac = env.register_stellar_asset_contract_v2(admin);
    let address = sac.address();
    let token_client = TokenClient::new(env, &address);
    let asset_client = StellarAssetClient::new(env, &address);
    (address, token_client, asset_client)
}

fn tiers(env: &Env) -> Vec<LockTier> {
    let mut tiers = Vec::new(env);
    tiers.push_back(LockTier {
        duration: 30 * 86_400,
        boost_bps: 10_000, // 1.0x
    });
    tiers.push_back(LockTier {
        duration: 90 * 86_400,
        boost_bps: 15_000, // 1.5x
    });
    tiers.push_back(LockTier {
        duration: 365 * 86_400,
        boost_bps: 20_000, // 2.0x
    });
    tiers
}

fn setup(
    env: &Env,
) -> (
    StakingVaultClient<'static>,
    Address,
    Address,
    TokenClient<'static>,
    StellarAssetClient<'static>,
) {
    let contract_id = env.register(StakingVault, ());
    let client = StakingVaultClient::new(env, &contract_id);
    let admin = Address::generate(env);
    let (token_address, token_client, asset_client) = setup_token(env);
    let fee_source = Address::generate(env);

    let unbonding_config = UnbondingConfig {
        cooldown_period: 7 * 86_400, // 7 days
        penalty_bps: 500,            // 5% penalty
    };

    client.initialize(
        &admin,
        &token_address,
        &fee_source,
        &tiers(env),
        &unbonding_config,
    );

    (client, admin, fee_source, token_client, asset_client)
}

#[test]
fn test_tier_for_matches_each_configured_duration_exactly() {
    let env = Env::default();
    let tier_list = tiers(&env);

    for tier in tier_list.iter() {
        let resolved = staking_vault::lock::tier_for(&tier_list, tier.duration)
            .expect("configured duration must resolve to its own tier");
        assert_eq!(resolved.duration, tier.duration);
        assert_eq!(resolved.boost_bps, tier.boost_bps);
    }
}

#[test]
fn test_tier_for_one_second_below_a_tier_duration_is_invalid_not_next_lower_tier() {
    let env = Env::default();
    let tier_list = tiers(&env);

    // One second short of the 90-day tier does NOT fall through to the
    // 30-day tier - it is simply not a configured duration.
    let result = staking_vault::lock::tier_for(&tier_list, 90 * 86_400 - 1);
    assert!(matches!(result, Err(StakingError::InvalidLockPeriod)));
}

#[test]
fn test_tier_for_one_second_above_a_tier_duration_is_invalid_not_next_higher_tier() {
    let env = Env::default();
    let tier_list = tiers(&env);

    // One second past the 30-day tier does NOT round up to the 90-day tier.
    let result = staking_vault::lock::tier_for(&tier_list, 30 * 86_400 + 1);
    assert!(matches!(result, Err(StakingError::InvalidLockPeriod)));
}

#[test]
fn test_tier_for_far_above_highest_tier_duration_is_invalid() {
    let env = Env::default();
    let tier_list = tiers(&env);

    // Far above the highest (365-day) tier's duration still does not
    // resolve to the highest tier under exact-match semantics.
    let result = staking_vault::lock::tier_for(&tier_list, 10 * 365 * 86_400);
    assert!(matches!(result, Err(StakingError::InvalidLockPeriod)));
}

#[test]
fn test_stake_at_each_exact_tier_boundary_applies_that_tiers_boost() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, _fee_source, _token, asset) = setup(&env);

    // 30-day tier: 1.0x boost.
    let staker_30 = Address::generate(&env);
    asset.mint(&staker_30, &1_000_000);
    client.stake(&staker_30, &1_000, &(30 * 86_400));
    assert_eq!(client.get_position(&staker_30).unwrap().shares, 1_000);

    // 365-day tier: 2.0x boost.
    let staker_365 = Address::generate(&env);
    asset.mint(&staker_365, &1_000_000);
    client.stake(&staker_365, &1_000, &(365 * 86_400));
    assert_eq!(client.get_position(&staker_365).unwrap().shares, 2_000);
}
