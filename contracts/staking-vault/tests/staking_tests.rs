#![cfg(test)]

use soroban_sdk::{
    testutils::{Address as _, Ledger},
    token::{StellarAssetClient, TokenClient},
    Address, Env, Vec,
};
use staking_vault::{LockTier, StakingError, StakingVault, StakingVaultClient};

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

fn setup(env: &Env) -> (StakingVaultClient<'static>, Address, Address, TokenClient<'static>, StellarAssetClient<'static>) {
    let contract_id = env.register(StakingVault, ());
    let client = StakingVaultClient::new(env, &contract_id);
    let admin = Address::generate(env);
    let (token_address, token_client, asset_client) = setup_token(env);
    let fee_source = Address::generate(env);

    client.initialize(&admin, &token_address, &fee_source, &tiers(env));

    (client, admin, fee_source, token_client, asset_client)
}

// ---------------------------------------------------------------------------
// #1707 — Reward Accumulator Math
// ---------------------------------------------------------------------------

#[test]
fn test_initialize() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, _fee_source, _token, _asset) = setup(&env);

    let pool = client.get_pool();
    assert_eq!(pool.total_shares, 0);
    assert_eq!(pool.acc_reward_per_share, 0);
    assert_eq!(pool.pending_rewards, 0);
}

#[test]
fn test_double_initialize_reverts() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, fee_source, token, _asset) = setup(&env);

    let result = client.try_initialize(&admin, &token.address, &fee_source, &tiers(&env));
    assert_eq!(result, Err(Ok(StakingError::AlreadyInitialized)));
}

#[test]
fn test_two_stakers_accrue_rewards_pro_rata() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, fee_source, token, asset) = setup(&env);

    let staker1 = Address::generate(&env);
    let staker2 = Address::generate(&env);

    asset.mint(&staker1, &1_000_000);
    asset.mint(&staker2, &1_000_000);
    asset.mint(&fee_source, &1_000_000);

    // Both stake the same duration/tier so shares are proportional to amount.
    client.stake(&staker1, &1_000, &(30 * 86_400));
    client.stake(&staker2, &3_000, &(30 * 86_400));

    // Push 1000 units of reward into the pool: staker1 (1/4 of shares) should
    // get 250, staker2 (3/4 of shares) should get 750.
    client.deposit_fees(&fee_source, &1_000);

    let pending1 = client.pending_rewards(&staker1);
    let pending2 = client.pending_rewards(&staker2);

    assert_eq!(pending1, 250);
    assert_eq!(pending2, 750);

    let claimed1 = client.claim_rewards(&staker1);
    assert_eq!(claimed1, 250);
    assert_eq!(client.pending_rewards(&staker1), 0);

    assert_eq!(token.balance(&staker1), 1_000_000 - 1_000 + 250);
}

#[test]
fn test_late_staker_gets_no_back_pay() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, fee_source, _token, asset) = setup(&env);

    let early_staker = Address::generate(&env);
    let late_staker = Address::generate(&env);

    asset.mint(&early_staker, &1_000_000);
    asset.mint(&late_staker, &1_000_000);
    asset.mint(&fee_source, &1_000_000);

    client.stake(&early_staker, &1_000, &(30 * 86_400));

    // Rewards distributed before the late staker joins.
    client.deposit_fees(&fee_source, &500);

    client.stake(&late_staker, &1_000, &(30 * 86_400));

    // The late staker should have accrued nothing from the earlier distribution.
    assert_eq!(client.pending_rewards(&late_staker), 0);
    assert_eq!(client.pending_rewards(&early_staker), 500);

    // A subsequent distribution now splits evenly between the two.
    client.deposit_fees(&fee_source, &1_000);
    assert_eq!(client.pending_rewards(&early_staker), 500 + 500);
    assert_eq!(client.pending_rewards(&late_staker), 500);
}

#[test]
fn test_deposit_fees_with_zero_shares_parks_in_pending_rewards() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, fee_source, _token, asset) = setup(&env);

    asset.mint(&fee_source, &1_000_000);

    client.deposit_fees(&fee_source, &777);

    let pool = client.get_pool();
    assert_eq!(pool.pending_rewards, 777);
    assert_eq!(pool.acc_reward_per_share, 0);

    // Once a staker joins and a new distribution comes in, the parked amount
    // plus the new amount are folded in together.
    let staker = Address::generate(&env);
    asset.mint(&staker, &1_000_000);
    client.stake(&staker, &1_000, &(30 * 86_400));

    client.deposit_fees(&fee_source, &223);

    let pool = client.get_pool();
    assert_eq!(pool.pending_rewards, 0);
    assert_eq!(client.pending_rewards(&staker), 777 + 223);
}

#[test]
fn test_deposit_fees_by_non_fee_source_reverts() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, _fee_source, _token, asset) = setup(&env);

    let not_fee_source = Address::generate(&env);
    asset.mint(&not_fee_source, &1_000_000);

    let result = client.try_deposit_fees(&not_fee_source, &100);
    assert_eq!(result, Err(Ok(StakingError::Unauthorized)));
}

// ---------------------------------------------------------------------------
// #1708 — Lock-Tier Boost and Unlock Enforcement
// ---------------------------------------------------------------------------

#[test]
fn test_stake_applies_tier_boost() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, _fee_source, _token, asset) = setup(&env);

    let staker = Address::generate(&env);
    asset.mint(&staker, &1_000_000);

    // 90-day tier has a 1.5x boost.
    client.stake(&staker, &1_000, &(90 * 86_400));

    let position = client.get_position(&staker).unwrap();
    assert_eq!(position.amount, 1_000);
    assert_eq!(position.shares, 1_500);
}

#[test]
fn test_stake_with_invalid_lock_period_reverts() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, _fee_source, _token, asset) = setup(&env);

    let staker = Address::generate(&env);
    asset.mint(&staker, &1_000_000);

    let result = client.try_stake(&staker, &1_000, &(42 * 86_400));
    assert_eq!(result, Err(Ok(StakingError::InvalidLockPeriod)));
}

#[test]
fn test_unstake_before_unlock_reverts() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, _fee_source, _token, asset) = setup(&env);

    let staker = Address::generate(&env);
    asset.mint(&staker, &1_000_000);

    client.stake(&staker, &1_000, &(30 * 86_400));

    let result = client.try_unstake(&staker, &1_000);
    assert_eq!(result, Err(Ok(StakingError::LockNotElapsed)));
}

#[test]
fn test_unstake_at_and_after_unlock_succeeds() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, _fee_source, token, asset) = setup(&env);

    let staker = Address::generate(&env);
    asset.mint(&staker, &1_000_000);

    let lock_duration: u64 = 30 * 86_400;
    client.stake(&staker, &1_000, &lock_duration);

    let position = client.get_position(&staker).unwrap();

    // Exactly at unlock_at succeeds.
    env.ledger().with_mut(|l| l.timestamp = position.unlock_at);
    client.unstake(&staker, &1_000);

    assert_eq!(token.balance(&staker), 1_000_000);
    let position_after = client.get_position(&staker).unwrap();
    assert_eq!(position_after.amount, 0);
    assert_eq!(position_after.shares, 0);
}

#[test]
fn test_unstake_after_unlock_succeeds() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, _fee_source, token, asset) = setup(&env);

    let staker = Address::generate(&env);
    asset.mint(&staker, &1_000_000);

    let lock_duration: u64 = 30 * 86_400;
    client.stake(&staker, &1_000, &lock_duration);

    let position = client.get_position(&staker).unwrap();
    env.ledger()
        .with_mut(|l| l.timestamp = position.unlock_at + 1);

    client.unstake(&staker, &1_000);
    assert_eq!(token.balance(&staker), 1_000_000);
}

#[test]
fn test_set_paused_blocks_stake() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, _fee_source, _token, asset) = setup(&env);

    client.set_paused(&true);

    let staker = Address::generate(&env);
    asset.mint(&staker, &1_000_000);

    let result = client.try_stake(&staker, &1_000, &(30 * 86_400));
    assert_eq!(result, Err(Ok(StakingError::Paused)));
}
