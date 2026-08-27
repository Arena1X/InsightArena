use insightarena_contract::config;
use insightarena_contract::storage_types::{VolumeFeeConfig, VolumeFeeEntry};
use insightarena_contract::{InsightArenaContract, InsightArenaContractClient, InsightArenaError};
use soroban_sdk::testutils::{Address as _, MockAuth, MockAuthInvoke};
use soroban_sdk::{Address, Env, IntoVal, Vec};

fn deploy(env: &Env) -> InsightArenaContractClient<'_> {
    let id = env.register(InsightArenaContract, ());
    InsightArenaContractClient::new(env, &id)
}

fn register_token(env: &Env) -> Address {
    let token_admin = Address::generate(env);
    env.register_stellar_asset_contract_v2(token_admin)
        .address()
}

#[test]
fn ensure_not_paused_ok_when_running() {
    let env = Env::default();
    env.mock_all_auths();
    let client = deploy(&env);
    let admin = Address::generate(&env);
    let oracle = Address::generate(&env);
    client.initialize(&admin, &oracle, &200_u32, &register_token(&env));
    client.get_config();
}

#[test]
fn ensure_not_paused_err_when_paused() {
    let env = Env::default();
    env.mock_all_auths();
    let client = deploy(&env);
    let admin = Address::generate(&env);
    let oracle = Address::generate(&env);
    client.initialize(&admin, &oracle, &200_u32, &register_token(&env));
    client.set_paused(&true, &1u32);
    let result = client.try_get_config();
    assert!(matches!(result, Err(Ok(InsightArenaError::Paused))));
}

#[test]
fn ensure_not_paused_not_initialized() {
    let env = Env::default();
    env.mock_all_auths();
    let client = deploy(&env);
    let result = client.try_get_config();
    assert!(matches!(result, Err(Ok(InsightArenaError::NotInitialized))));
}

#[test]
fn ensure_not_paused_ok_after_unpause() {
    let env = Env::default();
    env.mock_all_auths();
    let client = deploy(&env);
    let admin = Address::generate(&env);
    let oracle = Address::generate(&env);
    client.initialize(&admin, &oracle, &200_u32, &register_token(&env));
    client.set_paused(&true, &1u32);
    client.set_paused(&false, &0u32);
    client.get_config();
}

#[test]
fn test_config_update_validation() {
    let env = Env::default();
    env.mock_all_auths();
    let client = deploy(&env);
    let admin = Address::generate(&env);
    let oracle = Address::generate(&env);

    client.initialize(&admin, &oracle, &200_u32, &register_token(&env));

    let result = client.try_update_protocol_fee(&10_001_u32);
    assert!(matches!(result, Err(Ok(InsightArenaError::InvalidFee))));

    let config = client.get_config();
    assert_eq!(config.protocol_fee_bps, 200);
}

#[test]
fn test_pause_and_unpause_contract() {
    let env = Env::default();
    env.mock_all_auths();
    let client = deploy(&env);
    let admin = Address::generate(&env);
    let oracle = Address::generate(&env);

    client.initialize(&admin, &oracle, &200_u32, &register_token(&env));

    let result_before = client.try_get_config();
    assert!(result_before.is_ok());

    client.set_paused(&true, &1u32);
    let result_paused = client.try_get_config();
    assert!(matches!(result_paused, Err(Ok(InsightArenaError::Paused))));

    client.set_paused(&false, &0u32);
    let result_after = client.try_get_config();
    assert!(result_after.is_ok());
}

#[test]
fn test_update_platform_fee() {
    let env = Env::default();
    env.mock_all_auths();
    let client = deploy(&env);
    let admin = Address::generate(&env);
    let oracle = Address::generate(&env);

    client.initialize(&admin, &oracle, &200_u32, &register_token(&env));

    let config_before = client.get_config();
    assert_eq!(config_before.protocol_fee_bps, 200);

    let new_fee = 500_u32;
    client.update_protocol_fee(&new_fee);

    let config_after = client.get_config();
    assert_eq!(config_after.protocol_fee_bps, 500);
}

#[test]
#[should_panic(expected = "Unauthorized function call")]
fn test_config_update_unauthorized() {
    let env = Env::default();
    let client = deploy(&env);
    let admin = Address::generate(&env);
    let oracle = Address::generate(&env);

    client.initialize(&admin, &oracle, &200_u32, &register_token(&env));

    let _ = env.as_contract(&client.address, || config::set_paused(&env, true, 1u32));
}

#[test]
fn transfer_admin_revokes_old_admin_privileges() {
    let env = Env::default();
    let client = deploy(&env);
    let admin_a = Address::generate(&env);
    let admin_b = Address::generate(&env);
    let oracle = Address::generate(&env);

    client.initialize(&admin_a, &oracle, &200_u32, &register_token(&env));

    env.mock_auths(&[MockAuth {
        address: &admin_a,
        invoke: &MockAuthInvoke {
            contract: &client.address,
            fn_name: "transfer_admin",
            args: (admin_b.clone(),).into_val(&env),
            sub_invokes: &[],
        },
    }]);
    client.transfer_admin(&admin_b);
    assert_eq!(client.get_config().admin, admin_b);

    env.mock_auths(&[MockAuth {
        address: &admin_a,
        invoke: &MockAuthInvoke {
            contract: &client.address,
            fn_name: "update_protocol_fee",
            args: (300_u32,).into_val(&env),
            sub_invokes: &[],
        },
    }]);
    assert!(client.try_update_protocol_fee(&300_u32).is_err());

    env.mock_auths(&[MockAuth {
        address: &admin_b,
        invoke: &MockAuthInvoke {
            contract: &client.address,
            fn_name: "update_protocol_fee",
            args: (300_u32,).into_val(&env),
            sub_invokes: &[],
        },
    }]);
    client.update_protocol_fee(&300_u32);
    assert_eq!(client.get_config().protocol_fee_bps, 300);

    env.mock_auths(&[MockAuth {
        address: &admin_a,
        invoke: &MockAuthInvoke {
            contract: &client.address,
            fn_name: "transfer_admin",
            args: (admin_a.clone(),).into_val(&env),
            sub_invokes: &[],
        },
    }]);
    assert!(client.try_transfer_admin(&admin_a).is_err());
    assert_eq!(client.get_config().admin, admin_b);
}

// ── Stake bounds (#1345) ──────────────────────────────────────────────────────

#[test]
fn set_stake_bounds_updates_config() {
    let env = Env::default();
    env.mock_all_auths();
    let client = deploy(&env);
    let admin = Address::generate(&env);
    let oracle = Address::generate(&env);
    client.initialize(&admin, &oracle, &200_u32, &register_token(&env));

    let cfg_before = client.get_config();
    assert_eq!(cfg_before.min_stake_xlm, 10_000_000);
    assert_eq!(cfg_before.max_stake_xlm, 1_000_000_000_000);

    client.set_stake_bounds(&admin, &5_000_000_i128, &50_000_000_i128);

    let cfg = client.get_config();
    assert_eq!(cfg.min_stake_xlm, 5_000_000);
    assert_eq!(cfg.max_stake_xlm, 50_000_000);
}

#[test]
fn set_stake_bounds_rejects_min_greater_than_max() {
    let env = Env::default();
    env.mock_all_auths();
    let client = deploy(&env);
    let admin = Address::generate(&env);
    let oracle = Address::generate(&env);
    client.initialize(&admin, &oracle, &200_u32, &register_token(&env));

    let result = client.try_set_stake_bounds(&admin, &100_i128, &50_i128);
    assert!(matches!(result, Err(Ok(InsightArenaError::InvalidInput))));

    let cfg = client.get_config();
    assert_eq!(cfg.min_stake_xlm, 10_000_000);
    assert_eq!(cfg.max_stake_xlm, 1_000_000_000_000);
}

#[test]
fn set_stake_bounds_rejects_non_positive() {
    let env = Env::default();
    env.mock_all_auths();
    let client = deploy(&env);
    let admin = Address::generate(&env);
    let oracle = Address::generate(&env);
    client.initialize(&admin, &oracle, &200_u32, &register_token(&env));

    let result = client.try_set_stake_bounds(&admin, &0_i128, &50_i128);
    assert!(matches!(result, Err(Ok(InsightArenaError::InvalidInput))));

    let result = client.try_set_stake_bounds(&admin, &10_i128, &0_i128);
    assert!(matches!(result, Err(Ok(InsightArenaError::InvalidInput))));
}

// ── Protocol Treasury Fee Split (#1336) ───────────────────────────────────────

#[test]
fn treasury_split_defaults_on_initialize() {
    let env = Env::default();
    env.mock_all_auths();
    let client = deploy(&env);
    let admin = Address::generate(&env);
    let oracle = Address::generate(&env);
    client.initialize(&admin, &oracle, &200_u32, &register_token(&env));

    let cfg = client.get_config();
    // Defaults preserve the pre-existing behaviour: the whole protocol fee
    // share keeps flowing to the treasury (now the admin address) and none
    // is redirected to liquidity providers, until an admin opts in.
    assert_eq!(cfg.treasury_address, admin);
    assert_eq!(cfg.treasury_split_bps, 10_000);
    assert_eq!(cfg.lp_split_bps, 0);
}

#[test]
fn set_treasury_split_updates_config() {
    let env = Env::default();
    env.mock_all_auths();
    let client = deploy(&env);
    let admin = Address::generate(&env);
    let oracle = Address::generate(&env);
    client.initialize(&admin, &oracle, &200_u32, &register_token(&env));

    let new_treasury = Address::generate(&env);
    client.set_treasury_split(&admin, &new_treasury, &7_000_u32, &3_000_u32);

    let cfg = client.get_config();
    assert_eq!(cfg.treasury_address, new_treasury);
    assert_eq!(cfg.treasury_split_bps, 7_000);
    assert_eq!(cfg.lp_split_bps, 3_000);
}

#[test]
fn set_treasury_split_accepts_uneven_ratio_that_still_sums_to_10000() {
    let env = Env::default();
    env.mock_all_auths();
    let client = deploy(&env);
    let admin = Address::generate(&env);
    let oracle = Address::generate(&env);
    client.initialize(&admin, &oracle, &200_u32, &register_token(&env));

    let new_treasury = Address::generate(&env);
    // 33.33% / 66.67% — an uneven split that only sums to exactly 10_000
    // because the two bps values are complementary, not because either is a
    // "round" number.
    client.set_treasury_split(&admin, &new_treasury, &3_333_u32, &6_667_u32);

    let cfg = client.get_config();
    assert_eq!(cfg.treasury_split_bps, 3_333);
    assert_eq!(cfg.lp_split_bps, 6_667);
}

#[test]
fn set_treasury_split_rejects_bps_summing_below_10000() {
    let env = Env::default();
    env.mock_all_auths();
    let client = deploy(&env);
    let admin = Address::generate(&env);
    let oracle = Address::generate(&env);
    client.initialize(&admin, &oracle, &200_u32, &register_token(&env));

    let new_treasury = Address::generate(&env);
    let result = client.try_set_treasury_split(&admin, &new_treasury, &4_000_u32, &4_000_u32);
    assert!(matches!(result, Err(Ok(InsightArenaError::InvalidFee))));

    // Config is untouched on rejection.
    let cfg = client.get_config();
    assert_eq!(cfg.treasury_split_bps, 10_000);
    assert_eq!(cfg.lp_split_bps, 0);
}

#[test]
fn set_treasury_split_rejects_bps_summing_above_10000() {
    let env = Env::default();
    env.mock_all_auths();
    let client = deploy(&env);
    let admin = Address::generate(&env);
    let oracle = Address::generate(&env);
    client.initialize(&admin, &oracle, &200_u32, &register_token(&env));

    let new_treasury = Address::generate(&env);
    let result = client.try_set_treasury_split(&admin, &new_treasury, &6_000_u32, &6_000_u32);
    assert!(matches!(result, Err(Ok(InsightArenaError::InvalidFee))));
}

#[test]
fn set_treasury_split_rejects_unauthorized_caller() {
    let env = Env::default();
    env.mock_all_auths();
    let client = deploy(&env);
    let admin = Address::generate(&env);
    let oracle = Address::generate(&env);
    client.initialize(&admin, &oracle, &200_u32, &register_token(&env));

    let not_admin = Address::generate(&env);
    let new_treasury = Address::generate(&env);
    let result = client.try_set_treasury_split(&not_admin, &new_treasury, &5_000_u32, &5_000_u32);
    assert!(matches!(result, Err(Ok(InsightArenaError::Unauthorized))));
}

// ── Emergency pause coverage: every admin mutator must respect the pause flag ──

fn deploy_initialized(env: &Env) -> (InsightArenaContractClient<'_>, Address, Address) {
    env.mock_all_auths();
    let client = deploy(env);
    let admin = Address::generate(env);
    let oracle = Address::generate(env);
    client.initialize(&admin, &oracle, &200_u32, &register_token(env));
    (client, admin, oracle)
}

#[test]
fn update_protocol_fee_fails_when_paused() {
    let env = Env::default();
    let (client, _admin, _oracle) = deploy_initialized(&env);
    client.set_paused(&true, &1u32);
    let result = client.try_update_protocol_fee(&300_u32);
    assert!(matches!(result, Err(Ok(InsightArenaError::Paused))));
}

#[test]
fn transfer_admin_fails_when_paused() {
    let env = Env::default();
    let (client, _admin, _oracle) = deploy_initialized(&env);
    let new_admin = Address::generate(&env);
    client.set_paused(&true, &1u32);
    let result = client.try_transfer_admin(&new_admin);
    assert!(matches!(result, Err(Ok(InsightArenaError::Paused))));
}

#[test]
fn update_oracle_fails_when_paused() {
    let env = Env::default();
    let (client, admin, _oracle) = deploy_initialized(&env);
    let new_oracle = Address::generate(&env);
    client.set_paused(&true, &1u32);
    let result = client.try_update_oracle(&admin, &new_oracle);
    assert!(matches!(result, Err(Ok(InsightArenaError::Paused))));
}

#[test]
fn set_timelock_delay_fails_when_paused() {
    let env = Env::default();
    let (client, admin, _oracle) = deploy_initialized(&env);
    client.set_paused(&true, &1u32);
    let result = client.try_set_timelock_delay(&admin, &1_000_u64);
    assert!(matches!(result, Err(Ok(InsightArenaError::Paused))));
}

#[test]
fn set_guardian_fails_when_paused() {
    let env = Env::default();
    let (client, admin, _oracle) = deploy_initialized(&env);
    let new_guardian = Address::generate(&env);
    client.set_paused(&true, &1u32);
    let result = client.try_set_guardian(&admin, &new_guardian);
    assert!(matches!(result, Err(Ok(InsightArenaError::Paused))));
}

#[test]
fn set_min_creator_reputation_fails_when_paused() {
    let env = Env::default();
    let (client, admin, _oracle) = deploy_initialized(&env);
    client.set_paused(&true, &1u32);
    let result = client.try_set_min_creator_reputation(&admin, &500_u32);
    assert!(matches!(result, Err(Ok(InsightArenaError::Paused))));
}

#[test]
fn set_reputation_decay_config_fails_when_paused() {
    // Not exposed on the public contract ABI (no lib.rs wrapper), so this
    // exercises the module function directly, same as escrow_tests.rs does
    // for its internal-only helpers.
    let env = Env::default();
    let (client, admin, _oracle) = deploy_initialized(&env);
    client.set_paused(&true, &1u32);
    let result = env.as_contract(&client.address, || {
        config::set_reputation_decay_config(
            &env,
            admin.clone(),
            1_000_000_u32,
            config::ReputationDecayMode::Linear,
        )
    });
    assert!(matches!(result, Err(InsightArenaError::Paused)));
}

#[test]
fn set_market_ttl_extension_fails_when_paused() {
    let env = Env::default();
    let (client, admin, _oracle) = deploy_initialized(&env);
    client.set_paused(&true, &1u32);
    let result = client.try_set_market_ttl_extension(&admin, &1_000_u32);
    assert!(matches!(result, Err(Ok(InsightArenaError::Paused))));
}

#[test]
fn set_stake_bounds_fails_when_paused() {
    let env = Env::default();
    let (client, admin, _oracle) = deploy_initialized(&env);
    client.set_paused(&true, &1u32);
    let result = client.try_set_stake_bounds(&admin, &5_000_000_i128, &50_000_000_i128);
    assert!(matches!(result, Err(Ok(InsightArenaError::Paused))));
}

#[test]
fn set_insurance_pool_share_bps_fails_when_paused() {
    let env = Env::default();
    let (client, admin, _oracle) = deploy_initialized(&env);
    client.set_paused(&true, &1u32);
    let result = client.try_set_insurance_pool_share_bps(&admin, &2_000_u32);
    assert!(matches!(result, Err(Ok(InsightArenaError::Paused))));
}

#[test]
fn set_max_liquidity_per_outcome_fails_when_paused() {
    let env = Env::default();
    let (client, admin, _oracle) = deploy_initialized(&env);
    client.set_paused(&true, &1u32);
    let result = client.try_set_max_liquidity_per_outcome(&admin, &1_000_000_i128);
    assert!(matches!(result, Err(Ok(InsightArenaError::Paused))));
}

#[test]
fn set_treasury_split_fails_when_paused() {
    let env = Env::default();
    let (client, admin, _oracle) = deploy_initialized(&env);
    let new_treasury = Address::generate(&env);
    client.set_paused(&true, &1u32);
    let result = client.try_set_treasury_split(&admin, &new_treasury, &7_000_u32, &3_000_u32);
    assert!(matches!(result, Err(Ok(InsightArenaError::Paused))));
}

#[test]
fn set_arbiter_config_fails_when_paused() {
    let env = Env::default();
    let (client, admin, _oracle) = deploy_initialized(&env);
    client.set_paused(&true, &1u32);
    let result = client.try_set_arbiter_config(&admin, &5_000_u32, &1_000_u32, &172_800_u64);
    assert!(matches!(result, Err(Ok(InsightArenaError::Paused))));
}

#[test]
fn set_governance_quorum_bps_fails_when_paused() {
    let env = Env::default();
    let (client, admin, _oracle) = deploy_initialized(&env);
    client.set_paused(&true, &1u32);
    let result = client.try_set_governance_quorum_bps(&admin, &1_500_u32);
    assert!(matches!(result, Err(Ok(InsightArenaError::Paused))));
}

#[test]
fn set_max_outcomes_fails_when_paused() {
    let env = Env::default();
    let (client, admin, _oracle) = deploy_initialized(&env);
    client.set_paused(&true, &1u32);
    let result = client.try_set_max_outcomes(&admin, &5_u32);
    assert!(matches!(result, Err(Ok(InsightArenaError::Paused))));
}

#[test]
fn set_oracle_stake_config_fails_when_paused() {
    let env = Env::default();
    let (client, admin, _oracle) = deploy_initialized(&env);
    client.set_paused(&true, &1u32);
    let result = client.try_set_oracle_stake_config(&admin, &200_000_000_i128, &500_u32);
    assert!(matches!(result, Err(Ok(InsightArenaError::Paused))));
}

#[test]
fn set_vesting_config_fails_when_paused() {
    let env = Env::default();
    let (client, admin, _oracle) = deploy_initialized(&env);
    client.set_paused(&true, &1u32);
    let result = client.try_set_vesting_config(&admin, &6_u32, &1_000_000_u64);
    assert!(matches!(result, Err(Ok(InsightArenaError::Paused))));
}

#[test]
fn set_bond_amount_fails_when_paused() {
    let env = Env::default();
    let (client, admin, _oracle) = deploy_initialized(&env);
    client.set_paused(&true, &1u32);
    let result = client.try_set_bond_amount(&admin, &10_000_000_i128);
    assert!(matches!(result, Err(Ok(InsightArenaError::Paused))));
}

#[test]
fn set_early_exit_fee_bps_fails_when_paused() {
    let env = Env::default();
    let (client, admin, _oracle) = deploy_initialized(&env);
    client.set_paused(&true, &1u32);
    let result = client.try_set_early_exit_fee_bps(&admin, &1_000_u32);
    assert!(matches!(result, Err(Ok(InsightArenaError::Paused))));
}

// ── Volume fee tier config validation (#1694) ─────────────────────────────────

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

#[test]
fn set_volume_fee_config_accepts_valid_schedule() {
    let env = Env::default();
    let (client, admin, _oracle) = deploy_initialized(&env);

    let new_config = tiers(&env, &[(0, 30), (1_000, 20), (10_000, 10)]);
    client.update_volume_fee_config(&admin, &new_config);

    let stored = client.get_volume_fee_config();
    assert_eq!(stored.tiers.len(), 3);
    assert_eq!(stored.tiers.get(1).unwrap().fee_bps, 20);
}

#[test]
fn set_volume_fee_config_rejects_nonzero_tier_zero_threshold() {
    let env = Env::default();
    let (client, admin, _oracle) = deploy_initialized(&env);

    let bad_config = tiers(&env, &[(1, 30)]);
    let result = client.try_update_volume_fee_config(&admin, &bad_config);
    assert!(matches!(result, Err(Ok(InsightArenaError::InvalidInput))));
}

#[test]
fn set_volume_fee_config_rejects_non_monotonic_thresholds() {
    let env = Env::default();
    let (client, admin, _oracle) = deploy_initialized(&env);

    // Tier 2's threshold (50) is not strictly greater than tier 1's (100) —
    // overlapping/out-of-order tiers must be rejected.
    let bad_config = tiers(&env, &[(0, 30), (100, 20), (50, 10)]);
    let result = client.try_update_volume_fee_config(&admin, &bad_config);
    assert!(matches!(result, Err(Ok(InsightArenaError::InvalidInput))));
}

#[test]
fn set_volume_fee_config_rejects_duplicate_threshold() {
    let env = Env::default();
    let (client, admin, _oracle) = deploy_initialized(&env);

    // Equal (non-strictly-increasing) thresholds are also rejected.
    let bad_config = tiers(&env, &[(0, 30), (100, 20), (100, 10)]);
    let result = client.try_update_volume_fee_config(&admin, &bad_config);
    assert!(matches!(result, Err(Ok(InsightArenaError::InvalidInput))));
}

#[test]
fn set_volume_fee_config_rejects_fee_bps_over_10000() {
    let env = Env::default();
    let (client, admin, _oracle) = deploy_initialized(&env);

    let bad_config = tiers(&env, &[(0, 10_001)]);
    let result = client.try_update_volume_fee_config(&admin, &bad_config);
    assert!(matches!(result, Err(Ok(InsightArenaError::InvalidFee))));
}

#[test]
fn set_volume_fee_config_rejects_empty_tiers() {
    let env = Env::default();
    let (client, admin, _oracle) = deploy_initialized(&env);

    let bad_config = tiers(&env, &[]);
    let result = client.try_update_volume_fee_config(&admin, &bad_config);
    assert!(matches!(result, Err(Ok(InsightArenaError::InvalidInput))));
}

#[test]
fn set_volume_fee_config_rejects_unauthorized_caller() {
    let env = Env::default();
    let (client, _admin, _oracle) = deploy_initialized(&env);
    let not_admin = Address::generate(&env);

    let new_config = tiers(&env, &[(0, 30)]);
    let result = client.try_update_volume_fee_config(&not_admin, &new_config);
    assert!(matches!(result, Err(Ok(InsightArenaError::Unauthorized))));
}

#[test]
fn set_volume_fee_config_fails_when_paused() {
    let env = Env::default();
    let (client, admin, _oracle) = deploy_initialized(&env);
    let current = client.get_volume_fee_config();
    client.set_paused(&true, &1u32);
    let result = client.try_update_volume_fee_config(&admin, &current);
    assert!(matches!(result, Err(Ok(InsightArenaError::Paused))));
}
