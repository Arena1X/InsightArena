#![cfg(test)]

use soroban_sdk::{testutils::Address as _, Address, Env, Vec};
use staking_vault::{LockTier, StakingVault, StakingVaultClient};

fn setup(env: &Env) -> (StakingVaultClient, Address, Address) {
    let contract_id = env.register(StakingVault, ());
    let client = StakingVaultClient::new(env, &contract_id);
    let admin = Address::generate(env);
    let token = Address::generate(env);
    (client, admin, token)
}

#[test]
#[ignore = "skeleton: implement initialize first"]
fn test_initialize() {
    let env = Env::default();
    let (client, admin, token) = setup(&env);
    let fee_source = Address::generate(&env);
    let tiers: Vec<LockTier> = Vec::new(&env);

    client.initialize(&admin, &token, &fee_source, &tiers);
    // TODO: assert config stored, double-init reverts.
}

// TODO: test_stake_mints_boosted_shares
// TODO: test_unstake_before_unlock_reverts
// TODO: test_deposit_fees_distributes_pro_rata
// TODO: test_claim_rewards
