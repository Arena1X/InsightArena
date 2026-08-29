#![cfg(test)]

use soroban_sdk::{
    testutils::{Address as _, Ledger},
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

fn setup(env: &Env) -> (StakingVaultClient<'static>, Address, Address, TokenClient<'static>, StellarAssetClient<'static>) {
    let contract_id = env.register(StakingVault, ());
    let client = StakingVaultClient::new(env, &contract_id);
    let admin = Address::generate(env);
    let (token_address, token_client, asset_client) = setup_token(env);
    let fee_source = Address::generate(env);

    let unbonding_config = UnbondingConfig {
        cooldown_period: 7 * 86_400, // 7 days
        penalty_bps: 500,             // 5% penalty
    };

    client.initialize(&admin, &token_address, &fee_source, &tiers(env), &unbonding_config);

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

    let unbonding_config = UnbondingConfig {
        cooldown_period: 7 * 86_400,
        penalty_bps: 500,
    };

    let result = client.try_initialize(&admin, &token.address, &fee_source, &tiers(&env), &unbonding_config);
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

// ---------------------------------------------------------------------------
// #1759 — Early-Exit Penalty + Unbonding Cooldown
// ---------------------------------------------------------------------------

#[test]
fn test_invalid_penalty_config_rejected() {
    let env = Env::default();
    env.mock_all_auths();
    
    let contract_id = env.register(StakingVault, ());
    let client = StakingVaultClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let (token_address, _token_client, _asset_client) = setup_token(&env);
    let fee_source = Address::generate(&env);

    // Try to set penalty > 10_000 bps (100%)
    let invalid_config = UnbondingConfig {
        cooldown_period: 7 * 86_400,
        penalty_bps: 10_001, // Invalid: exceeds max
    };

    let result = client.try_initialize(&admin, &token_address, &fee_source, &tiers(&env), &invalid_config);
    assert_eq!(result, Err(Ok(StakingError::InvalidPenaltyConfig)));
}

#[test]
fn test_request_unlock_before_lock_elapsed_fails() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, _fee_source, _token, asset) = setup(&env);

    let staker = Address::generate(&env);
    asset.mint(&staker, &1_000_000);

    client.stake(&staker, &1_000, &(30 * 86_400));

    // Try to request unlock before lock period ends
    let result = client.try_request_unlock(&staker, &1_000);
    assert_eq!(result, Err(Ok(StakingError::LockNotElapsed)));
}

#[test]
fn test_request_unlock_after_lock_elapsed_succeeds() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, _fee_source, _token, asset) = setup(&env);

    let staker = Address::generate(&env);
    asset.mint(&staker, &1_000_000);

    let lock_duration: u64 = 30 * 86_400;
    client.stake(&staker, &1_000, &lock_duration);

    let position = client.get_position(&staker).unwrap();
    
    // Move time to after lock expires
    env.ledger().with_mut(|l| l.timestamp = position.unlock_at);

    // Request unlock should succeed
    client.request_unlock(&staker, &1_000);

    let position_after = client.get_position(&staker).unwrap();
    assert_eq!(position_after.pending_unlock_amount, 1_000);
    assert_eq!(position_after.unlock_requested_at, position.unlock_at);
}

#[test]
fn test_early_withdrawal_applies_penalty() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, _fee_source, token, asset) = setup(&env);

    let staker = Address::generate(&env);
    asset.mint(&staker, &1_000_000);

    let lock_duration: u64 = 30 * 86_400;
    client.stake(&staker, &1_000, &lock_duration);

    let position = client.get_position(&staker).unwrap();
    
    // Move time to after lock expires
    env.ledger().with_mut(|l| l.timestamp = position.unlock_at);

    // Request unlock
    client.request_unlock(&staker, &1_000);

    // Withdraw immediately (before cooldown ends) - should apply 5% penalty
    client.withdraw(&staker);

    // Staker should receive 1_000 - 50 (5% penalty) = 950
    // Original balance: 1_000_000 - 1_000 (staked) = 999_000
    // After withdraw: 999_000 + 950 = 999_950
    assert_eq!(token.balance(&staker), 999_950);

    let position_after = client.get_position(&staker).unwrap();
    assert_eq!(position_after.amount, 0);
    assert_eq!(position_after.shares, 0);
    assert_eq!(position_after.pending_unlock_amount, 0);
}

#[test]
fn test_withdrawal_after_cooldown_no_penalty() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, _fee_source, token, asset) = setup(&env);

    let staker = Address::generate(&env);
    asset.mint(&staker, &1_000_000);

    let lock_duration: u64 = 30 * 86_400;
    client.stake(&staker, &1_000, &lock_duration);

    let position = client.get_position(&staker).unwrap();
    
    // Move time to after lock expires
    env.ledger().with_mut(|l| l.timestamp = position.unlock_at);

    // Request unlock
    client.request_unlock(&staker, &1_000);

    let position_unlocked = client.get_position(&staker).unwrap();
    
    // Move time to after cooldown period (7 days)
    let cooldown_period = 7 * 86_400;
    env.ledger().with_mut(|l| l.timestamp = position_unlocked.unlock_requested_at + cooldown_period);

    // Withdraw after cooldown - no penalty
    client.withdraw(&staker);

    // Staker should receive full 1_000 (no penalty)
    assert_eq!(token.balance(&staker), 1_000_000);

    let position_after = client.get_position(&staker).unwrap();
    assert_eq!(position_after.amount, 0);
    assert_eq!(position_after.shares, 0);
}

#[test]
fn test_withdraw_without_unlock_request_fails() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, _fee_source, _token, asset) = setup(&env);

    let staker = Address::generate(&env);
    asset.mint(&staker, &1_000_000);

    client.stake(&staker, &1_000, &(30 * 86_400));

    // Try to withdraw without requesting unlock first
    let result = client.try_withdraw(&staker);
    assert_eq!(result, Err(Ok(StakingError::NoPendingUnlock)));
}

#[test]
fn test_penalty_routes_to_reward_pool() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, fee_source, _token, asset) = setup(&env);

    let staker1 = Address::generate(&env);
    let staker2 = Address::generate(&env);
    
    asset.mint(&staker1, &1_000_000);
    asset.mint(&staker2, &1_000_000);
    asset.mint(&fee_source, &1_000_000);

    // Staker1 stakes and will exit early (penalty)
    client.stake(&staker1, &1_000, &(30 * 86_400));
    
    // Staker2 stays staked
    client.stake(&staker2, &1_000, &(30 * 86_400));

    let position1 = client.get_position(&staker1).unwrap();
    
    // Move time to after lock expires
    env.ledger().with_mut(|l| l.timestamp = position1.unlock_at);

    // Staker1 requests unlock and withdraws early (5% penalty = 50)
    client.request_unlock(&staker1, &1_000);
    client.withdraw(&staker1);

    // The penalty (50) should be distributed to remaining stakers
    // Staker2 should now have pending rewards of 50
    let pending2 = client.pending_rewards(&staker2);
    assert_eq!(pending2, 50);
}

#[test]
fn test_partial_unlock_request() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, _fee_source, token, asset) = setup(&env);

    let staker = Address::generate(&env);
    asset.mint(&staker, &1_000_000);

    let lock_duration: u64 = 30 * 86_400;
    client.stake(&staker, &2_000, &lock_duration);

    let position = client.get_position(&staker).unwrap();
    
    // Move time to after lock expires
    env.ledger().with_mut(|l| l.timestamp = position.unlock_at);

    // Request unlock of only 1_000 out of 2_000
    client.request_unlock(&staker, &1_000);

    let position_after_request = client.get_position(&staker).unwrap();
    assert_eq!(position_after_request.pending_unlock_amount, 1_000);
    assert_eq!(position_after_request.amount, 2_000); // Still shows full amount

    // Wait for cooldown
    let cooldown_period = 7 * 86_400;
    env.ledger().with_mut(|l| l.timestamp = position_after_request.unlock_requested_at + cooldown_period);

    // Withdraw
    client.withdraw(&staker);

    // Staker should have 1_000 remaining staked
    let position_after = client.get_position(&staker).unwrap();
    assert_eq!(position_after.amount, 1_000);
    assert_eq!(position_after.shares, 1_000); // 1.0x boost

    // Balance: 1_000_000 - 2_000 (staked) + 1_000 (withdrawn) = 999_000
    assert_eq!(token.balance(&staker), 999_000);
}

#[test]
fn test_unlock_request_exceeding_stake_fails() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, _fee_source, _token, asset) = setup(&env);

    let staker = Address::generate(&env);
    asset.mint(&staker, &1_000_000);

    let lock_duration: u64 = 30 * 86_400;
    client.stake(&staker, &1_000, &lock_duration);

    let position = client.get_position(&staker).unwrap();
    
    // Move time to after lock expires
    env.ledger().with_mut(|l| l.timestamp = position.unlock_at);

    // Try to unlock more than staked
    let result = client.try_request_unlock(&staker, &2_000);
    assert_eq!(result, Err(Ok(StakingError::InsufficientStake)));
}

#[test]
fn test_withdrawal_claims_pending_rewards() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, fee_source, token, asset) = setup(&env);

    let staker = Address::generate(&env);
    asset.mint(&staker, &1_000_000);
    asset.mint(&fee_source, &1_000_000);

    client.stake(&staker, &1_000, &(30 * 86_400));

    // Add rewards
    client.deposit_fees(&fee_source, &500);

    let position = client.get_position(&staker).unwrap();
    
    // Move time to after lock expires
    env.ledger().with_mut(|l| l.timestamp = position.unlock_at);

    // Request unlock
    client.request_unlock(&staker, &1_000);

    // Wait for cooldown
    let position_unlocked = client.get_position(&staker).unwrap();
    let cooldown_period = 7 * 86_400;
    env.ledger().with_mut(|l| l.timestamp = position_unlocked.unlock_requested_at + cooldown_period);

    // Withdraw - should include rewards
    client.withdraw(&staker);

    // Balance: 1_000_000 - 1_000 (staked) + 1_000 (principal) + 500 (rewards) = 1_000_500
    assert_eq!(token.balance(&staker), 1_000_500);
}

#[test]
fn test_get_unbonding_config() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, _fee_source, _token, _asset) = setup(&env);

    let config = client.get_unbonding_config();
    assert_eq!(config.cooldown_period, 7 * 86_400);
    assert_eq!(config.penalty_bps, 500);
}

#[test]
fn test_zero_penalty_config_allows_penalty_free_early_withdrawal() {
    let env = Env::default();
    env.mock_all_auths();
    
    let contract_id = env.register(StakingVault, ());
    let client = StakingVaultClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let (token_address, token_client, asset_client) = setup_token(&env);
    let fee_source = Address::generate(&env);

    // Zero penalty config
    let unbonding_config = UnbondingConfig {
        cooldown_period: 7 * 86_400,
        penalty_bps: 0, // No penalty
    };
    client.initialize(&admin, &token_address, &fee_source, &tiers(&env), &unbonding_config);

    let staker = Address::generate(&env);
    asset_client.mint(&staker, &1_000_000);

    client.stake(&staker, &1_000, &(30 * 86_400));

    let position = client.get_position(&staker).unwrap();
    env.ledger().with_mut(|l| l.timestamp = position.unlock_at);

    client.request_unlock(&staker, &1_000);
    
    // Withdraw immediately (before cooldown) - should get full amount with 0 penalty
    client.withdraw(&staker);

    assert_eq!(token_client.balance(&staker), 1_000_000); // Full amount restored
}

#[test]
fn test_max_penalty_config_takes_entire_amount() {
    let env = Env::default();
    env.mock_all_auths();
    
    let contract_id = env.register(StakingVault, ());
    let client = StakingVaultClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let (token_address, token_client, asset_client) = setup_token(&env);
    let fee_source = Address::generate(&env);

    // Max penalty config (100%)
    let unbonding_config = UnbondingConfig {
        cooldown_period: 7 * 86_400,
        penalty_bps: 10_000, // 100% penalty
    };
    client.initialize(&admin, &token_address, &fee_source, &tiers(&env), &unbonding_config);

    let staker = Address::generate(&env);
    asset_client.mint(&staker, &1_000_000);

    client.stake(&staker, &1_000, &(30 * 86_400));

    let position = client.get_position(&staker).unwrap();
    env.ledger().with_mut(|l| l.timestamp = position.unlock_at);

    client.request_unlock(&staker, &1_000);
    
    // Withdraw immediately - should get 0 (100% penalty)
    client.withdraw(&staker);

    assert_eq!(token_client.balance(&staker), 999_000); // Only original minus stake
}

#[test]
fn test_multiple_unlock_requests_overwrites_previous() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, _fee_source, _token, asset) = setup(&env);

    let staker = Address::generate(&env);
    asset.mint(&staker, &1_000_000);

    client.stake(&staker, &2_000, &(30 * 86_400));

    let position = client.get_position(&staker).unwrap();
    env.ledger().with_mut(|l| l.timestamp = position.unlock_at);

    // First unlock request
    client.request_unlock(&staker, &500);
    let position_after_first = client.get_position(&staker).unwrap();
    assert_eq!(position_after_first.pending_unlock_amount, 500);

    // Second unlock request overwrites
    client.request_unlock(&staker, &1_000);
    let position_after_second = client.get_position(&staker).unwrap();
    assert_eq!(position_after_second.pending_unlock_amount, 1_000);
}

#[test]
fn test_withdrawal_with_boosted_shares() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, _fee_source, token, asset) = setup(&env);

    let staker = Address::generate(&env);
    asset.mint(&staker, &1_000_000);

    // Stake with 90-day tier (1.5x boost)
    client.stake(&staker, &1_000, &(90 * 86_400));

    let position = client.get_position(&staker).unwrap();
    assert_eq!(position.shares, 1_500); // 1.5x boost
    
    env.ledger().with_mut(|l| l.timestamp = position.unlock_at);

    client.request_unlock(&staker, &1_000);
    
    // Wait for cooldown
    let position_unlocked = client.get_position(&staker).unwrap();
    env.ledger().with_mut(|l| l.timestamp = position_unlocked.unlock_requested_at + 7 * 86_400);

    client.withdraw(&staker);

    // Should withdraw full amount
    assert_eq!(token.balance(&staker), 1_000_000);
    
    let position_after = client.get_position(&staker).unwrap();
    assert_eq!(position_after.shares, 0);
    assert_eq!(position_after.amount, 0);
}

#[test]
fn test_partial_withdrawal_maintains_correct_share_ratio() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, _fee_source, _token, asset) = setup(&env);

    let staker = Address::generate(&env);
    asset.mint(&staker, &1_000_000);

    // Stake with 365-day tier (2.0x boost)
    client.stake(&staker, &2_000, &(365 * 86_400));

    let position = client.get_position(&staker).unwrap();
    assert_eq!(position.shares, 4_000); // 2.0x boost
    
    env.ledger().with_mut(|l| l.timestamp = position.unlock_at);

    // Unlock half
    client.request_unlock(&staker, &1_000);
    
    let position_unlocked = client.get_position(&staker).unwrap();
    env.ledger().with_mut(|l| l.timestamp = position_unlocked.unlock_requested_at + 7 * 86_400);

    client.withdraw(&staker);

    // Should have half amount and half shares remaining
    let position_after = client.get_position(&staker).unwrap();
    assert_eq!(position_after.amount, 1_000);
    assert_eq!(position_after.shares, 2_000); // Maintains 2.0x ratio
}

#[test]
fn test_penalty_calculation_with_different_amounts() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, _fee_source, token, asset) = setup(&env);

    let staker1 = Address::generate(&env);
    let staker2 = Address::generate(&env);
    
    asset.mint(&staker1, &1_000_000);
    asset.mint(&staker2, &1_000_000);

    // Staker1: 1000 tokens
    client.stake(&staker1, &1_000, &(30 * 86_400));
    
    // Staker2: 10000 tokens
    client.stake(&staker2, &10_000, &(30 * 86_400));

    let position1 = client.get_position(&staker1).unwrap();
    let position2 = client.get_position(&staker2).unwrap();
    
    env.ledger().with_mut(|l| l.timestamp = position1.unlock_at);

    // Staker1 requests unlock and withdraws early
    client.request_unlock(&staker1, &1_000);
    client.withdraw(&staker1);

    // Staker1: 1000 - 50 (5%) = 950
    // But staker1's penalty (50) gets distributed to staker2
    // Staker1 has 0 shares now, so doesn't get any of the penalty back
    assert_eq!(token.balance(&staker1), 999_950);
    
    // Now staker2 withdraws (after waiting for cooldown to avoid getting penalty)
    client.request_unlock(&staker2, &10_000);
    let position2_unlocked = client.get_position(&staker2).unwrap();
    env.ledger().with_mut(|l| l.timestamp = position2_unlocked.unlock_requested_at + 7 * 86_400);
    client.withdraw(&staker2);

    // Staker2: 10000 + 50 (from staker1's penalty) = 10050
    // Original balance: 1_000_000 - 10_000 = 990_000
    // After withdraw: 990_000 + 10_050 = 1_000_050
    assert_eq!(token.balance(&staker2), 1_000_050);
}

#[test]
fn test_cooldown_exactly_at_boundary() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, _fee_source, token, asset) = setup(&env);

    let staker = Address::generate(&env);
    asset.mint(&staker, &1_000_000);

    client.stake(&staker, &1_000, &(30 * 86_400));

    let position = client.get_position(&staker).unwrap();
    env.ledger().with_mut(|l| l.timestamp = position.unlock_at);

    client.request_unlock(&staker, &1_000);

    let position_unlocked = client.get_position(&staker).unwrap();
    let cooldown_end = position_unlocked.unlock_requested_at + 7 * 86_400;
    
    // Exactly at cooldown end (should be penalty-free)
    env.ledger().with_mut(|l| l.timestamp = cooldown_end);

    client.withdraw(&staker);

    // Should get full amount (no penalty)
    assert_eq!(token.balance(&staker), 1_000_000);
}

#[test]
fn test_cooldown_one_second_before_boundary() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, _fee_source, token, asset) = setup(&env);

    let staker = Address::generate(&env);
    asset.mint(&staker, &1_000_000);

    client.stake(&staker, &1_000, &(30 * 86_400));

    let position = client.get_position(&staker).unwrap();
    env.ledger().with_mut(|l| l.timestamp = position.unlock_at);

    client.request_unlock(&staker, &1_000);

    let position_unlocked = client.get_position(&staker).unwrap();
    let cooldown_end = position_unlocked.unlock_requested_at + 7 * 86_400;
    
    // One second before cooldown end (should have penalty)
    env.ledger().with_mut(|l| l.timestamp = cooldown_end - 1);

    client.withdraw(&staker);

    // Should have penalty (950)
    assert_eq!(token.balance(&staker), 999_950);
}

#[test]
fn test_unstake_legacy_bypasses_unbonding() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, _fee_source, token, asset) = setup(&env);

    let staker = Address::generate(&env);
    asset.mint(&staker, &1_000_000);

    client.stake(&staker, &1_000, &(30 * 86_400));

    let position = client.get_position(&staker).unwrap();
    env.ledger().with_mut(|l| l.timestamp = position.unlock_at);

    // Use legacy unstake (should bypass unbonding entirely)
    client.unstake(&staker, &1_000);

    // Should get full amount immediately (no cooldown, no penalty)
    assert_eq!(token.balance(&staker), 1_000_000);
    
    let position_after = client.get_position(&staker).unwrap();
    assert_eq!(position_after.amount, 0);
    assert_eq!(position_after.pending_unlock_amount, 0); // Never set
}

#[test]
fn test_multiple_stakers_penalties_distributed_correctly() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, fee_source, _token, asset) = setup(&env);

    let staker1 = Address::generate(&env);
    let staker2 = Address::generate(&env);
    let staker3 = Address::generate(&env);
    
    asset.mint(&staker1, &1_000_000);
    asset.mint(&staker2, &1_000_000);
    asset.mint(&staker3, &1_000_000);

    // All stake equal amounts
    client.stake(&staker1, &1_000, &(30 * 86_400));
    client.stake(&staker2, &1_000, &(30 * 86_400));
    client.stake(&staker3, &1_000, &(30 * 86_400));

    let position1 = client.get_position(&staker1).unwrap();
    env.ledger().with_mut(|l| l.timestamp = position1.unlock_at);

    // Staker1 exits early (50 penalty) -> distributed to staker2 and staker3
    client.request_unlock(&staker1, &1_000);
    client.withdraw(&staker1);

    // Penalty of 50 distributed equally: 25 each to staker2 and staker3
    let pending2 = client.pending_rewards(&staker2);
    let pending3 = client.pending_rewards(&staker3);
    
    assert_eq!(pending2, 25);
    assert_eq!(pending3, 25);
}

#[test]
fn test_staking_after_withdrawal_resets_unlock_state() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, _fee_source, _token, asset) = setup(&env);

    let staker = Address::generate(&env);
    asset.mint(&staker, &2_000_000);

    // First stake cycle
    client.stake(&staker, &1_000, &(30 * 86_400));

    let position = client.get_position(&staker).unwrap();
    env.ledger().with_mut(|l| l.timestamp = position.unlock_at);

    client.request_unlock(&staker, &1_000);
    let position_unlocked = client.get_position(&staker).unwrap();
    env.ledger().with_mut(|l| l.timestamp = position_unlocked.unlock_requested_at + 7 * 86_400);
    
    client.withdraw(&staker);

    // Second stake cycle
    client.stake(&staker, &1_000, &(30 * 86_400));

    let position_after_restake = client.get_position(&staker).unwrap();
    assert_eq!(position_after_restake.pending_unlock_amount, 0);
    assert_eq!(position_after_restake.unlock_requested_at, 0);
    assert_eq!(position_after_restake.amount, 1_000);
}

#[test]
fn test_withdrawal_with_accumulated_rewards_over_time() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, fee_source, token, asset) = setup(&env);

    let staker = Address::generate(&env);
    asset.mint(&staker, &1_000_000);
    asset.mint(&fee_source, &1_000_000);

    client.stake(&staker, &1_000, &(30 * 86_400));

    // Add rewards multiple times
    client.deposit_fees(&fee_source, &100);
    client.deposit_fees(&fee_source, &200);
    client.deposit_fees(&fee_source, &300);

    // Total rewards: 600
    let pending = client.pending_rewards(&staker);
    assert_eq!(pending, 600);

    let position = client.get_position(&staker).unwrap();
    env.ledger().with_mut(|l| l.timestamp = position.unlock_at);

    client.request_unlock(&staker, &1_000);
    let position_unlocked = client.get_position(&staker).unwrap();
    env.ledger().with_mut(|l| l.timestamp = position_unlocked.unlock_requested_at + 7 * 86_400);

    client.withdraw(&staker);

    // Should get principal (1000) + all rewards (600)
    assert_eq!(token.balance(&staker), 1_000_600);
}

#[test]
fn test_early_withdrawal_with_rewards_applies_penalty_only_to_principal() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, fee_source, token, asset) = setup(&env);

    let staker = Address::generate(&env);
    asset.mint(&staker, &1_000_000);
    asset.mint(&fee_source, &1_000_000);

    client.stake(&staker, &1_000, &(30 * 86_400));

    // Add rewards
    client.deposit_fees(&fee_source, &500);

    let position = client.get_position(&staker).unwrap();
    env.ledger().with_mut(|l| l.timestamp = position.unlock_at);

    client.request_unlock(&staker, &1_000);
    
    // Withdraw early (penalty on principal only)
    client.withdraw(&staker);

    // Principal: 1000 - 50 (5% penalty) = 950
    // Rewards: 500 (no penalty)
    // Total: 950 + 500 = 1450
    // Original balance: 1_000_000 - 1_000 = 999_000
    // Final: 999_000 + 1_450 = 1_000_450
    assert_eq!(token.balance(&staker), 1_000_450);
}

#[test]
fn test_request_unlock_with_invalid_amount_zero() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, _fee_source, _token, asset) = setup(&env);

    let staker = Address::generate(&env);
    asset.mint(&staker, &1_000_000);

    client.stake(&staker, &1_000, &(30 * 86_400));

    let position = client.get_position(&staker).unwrap();
    env.ledger().with_mut(|l| l.timestamp = position.unlock_at);

    // Try to unlock zero amount
    let result = client.try_request_unlock(&staker, &0);
    assert_eq!(result, Err(Ok(StakingError::InvalidAmount)));
}

#[test]
fn test_request_unlock_with_negative_amount() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, _fee_source, _token, asset) = setup(&env);

    let staker = Address::generate(&env);
    asset.mint(&staker, &1_000_000);

    client.stake(&staker, &1_000, &(30 * 86_400));

    let position = client.get_position(&staker).unwrap();
    env.ledger().with_mut(|l| l.timestamp = position.unlock_at);

    // Try to unlock negative amount
    let result = client.try_request_unlock(&staker, &-100);
    assert_eq!(result, Err(Ok(StakingError::InvalidAmount)));
}

#[test]
fn test_position_not_found_for_unlock_request() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, _fee_source, _token, _asset) = setup(&env);

    let non_staker = Address::generate(&env);

    // Try to unlock when no position exists
    let result = client.try_request_unlock(&non_staker, &1_000);
    assert_eq!(result, Err(Ok(StakingError::PositionNotFound)));
}

#[test]
fn test_position_not_found_for_withdrawal() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, _fee_source, _token, _asset) = setup(&env);

    let non_staker = Address::generate(&env);

    // Try to withdraw when no position exists
    let result = client.try_withdraw(&non_staker);
    assert_eq!(result, Err(Ok(StakingError::PositionNotFound)));
}

#[test]
fn test_paused_blocks_request_unlock() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, _fee_source, _token, asset) = setup(&env);

    let staker = Address::generate(&env);
    asset.mint(&staker, &1_000_000);

    client.stake(&staker, &1_000, &(30 * 86_400));

    let position = client.get_position(&staker).unwrap();
    env.ledger().with_mut(|l| l.timestamp = position.unlock_at);

    // Pause contract
    client.set_paused(&true);

    // Try to request unlock while paused
    let result = client.try_request_unlock(&staker, &1_000);
    assert_eq!(result, Err(Ok(StakingError::Paused)));
}

#[test]
fn test_paused_blocks_withdrawal() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, _fee_source, _token, asset) = setup(&env);

    let staker = Address::generate(&env);
    asset.mint(&staker, &1_000_000);

    client.stake(&staker, &1_000, &(30 * 86_400));

    let position = client.get_position(&staker).unwrap();
    env.ledger().with_mut(|l| l.timestamp = position.unlock_at);

    client.request_unlock(&staker, &1_000);

    // Pause contract
    client.set_paused(&true);

    // Try to withdraw while paused
    let result = client.try_withdraw(&staker);
    assert_eq!(result, Err(Ok(StakingError::Paused)));
}

#[test]
fn test_large_amounts_no_overflow() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, _fee_source, token, asset) = setup(&env);

    let staker = Address::generate(&env);
    let large_amount = 1_000_000_000_000_i128; // 1 trillion
    asset.mint(&staker, &(large_amount + 1_000_000));

    client.stake(&staker, &large_amount, &(30 * 86_400));

    let position = client.get_position(&staker).unwrap();
    env.ledger().with_mut(|l| l.timestamp = position.unlock_at);

    client.request_unlock(&staker, &large_amount);
    
    let position_unlocked = client.get_position(&staker).unwrap();
    env.ledger().with_mut(|l| l.timestamp = position_unlocked.unlock_requested_at + 7 * 86_400);

    // Should handle large amounts without overflow
    client.withdraw(&staker);

    let balance = token.balance(&staker);
    assert_eq!(balance, large_amount + 1_000_000);
}
