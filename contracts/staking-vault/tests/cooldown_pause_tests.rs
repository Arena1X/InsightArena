#![cfg(test)]

// ---------------------------------------------------------------------------
// #2198 — Unstake cooldown
// #2200 — Emergency pause
// ---------------------------------------------------------------------------

use soroban_sdk::{
    testutils::{Address as _, Events, Ledger, MockAuth, MockAuthInvoke},
    token::{StellarAssetClient, TokenClient},
    Address, Env, Symbol, TryIntoVal, Val, Vec,
};
use staking_vault::{LockTier, StakingError, StakingVault, StakingVaultClient, UnbondingConfig};

const LOCK: u64 = 30 * 86_400;
const COOLDOWN: u64 = 3 * 86_400;

struct Setup {
    env: Env,
    client: StakingVaultClient<'static>,
    admin: Address,
    token: TokenClient<'static>,
    asset: StellarAssetClient<'static>,
}

fn setup() -> Setup {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(StakingVault, ());
    let client = StakingVaultClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let fee_source = Address::generate(&env);

    let sac = env.register_stellar_asset_contract_v2(Address::generate(&env));
    let token = TokenClient::new(&env, &sac.address());
    let asset = StellarAssetClient::new(&env, &sac.address());

    let mut tiers = Vec::new(&env);
    tiers.push_back(LockTier {
        duration: LOCK,
        boost_bps: 10_000,
    });

    client.initialize(
        &admin,
        &sac.address(),
        &fee_source,
        &tiers,
        &UnbondingConfig {
            cooldown_period: 7 * 86_400,
            penalty_bps: 500,
        },
    );

    Setup {
        env,
        client,
        admin,
        token,
        asset,
    }
}

/// Stake `amount` for a fresh staker and move the ledger past the lock.
fn staked(s: &Setup, amount: i128) -> Address {
    let staker = Address::generate(&s.env);
    s.asset.mint(&staker, &amount);
    s.client.stake(&staker, &amount, &LOCK);
    let now = s.env.ledger().timestamp();
    s.env.ledger().with_mut(|l| l.timestamp = now + LOCK);
    staker
}

fn has_event(s: &Setup, t0: &str, t1: &str) -> bool {
    s.env.events().all().iter().any(|event| {
        if event.0 != s.client.address || event.1.len() != 2 {
            return false;
        }
        let a: Result<Symbol, _> = event.1.get(0).unwrap().try_into_val(&s.env);
        let b: Result<Symbol, _> = event.1.get(1).unwrap().try_into_val(&s.env);
        matches!((a, b), (Ok(a), Ok(b))
            if a == Symbol::new(&s.env, t0) && b == Symbol::new(&s.env, t1))
    })
}

// ── #2198 ────────────────────────────────────────────────────────────────────

#[test]
fn cooldown_defaults_to_zero_and_is_configurable() {
    let s = setup();
    assert_eq!(s.client.get_unstake_cooldown(), 0);

    s.client.set_unstake_cooldown(&COOLDOWN);
    assert_eq!(s.client.get_unstake_cooldown(), COOLDOWN);
}

#[test]
fn cooldown_above_maximum_is_rejected() {
    let s = setup();
    let result = s
        .client
        .try_set_unstake_cooldown(&(staking_vault::config::MAX_UNSTAKE_COOLDOWN + 1));
    assert_eq!(result, Err(Ok(StakingError::InvalidCooldown)));
}

#[test]
fn withdrawal_before_cooldown_is_rejected() {
    let s = setup();
    s.client.set_unstake_cooldown(&COOLDOWN);
    let staker = staked(&s, 1_000);

    let available_at = s.client.request_unstake(&staker, &1_000);
    assert_eq!(available_at, s.env.ledger().timestamp() + COOLDOWN);

    let result = s.client.try_complete_unstake(&staker);
    assert_eq!(result, Err(Ok(StakingError::WithdrawalLocked)));

    s.env.ledger().with_mut(|l| l.timestamp = available_at - 1);
    let result = s.client.try_complete_unstake(&staker);
    assert_eq!(result, Err(Ok(StakingError::WithdrawalLocked)));

    assert_eq!(s.token.balance(&staker), 0);
    assert!(s.client.get_unstake_request(&staker).is_some());
}

#[test]
fn withdrawal_after_cooldown_succeeds() {
    let s = setup();
    s.client.set_unstake_cooldown(&COOLDOWN);
    let staker = staked(&s, 1_000);

    let available_at = s.client.request_unstake(&staker, &400);

    // The requested amount leaves the position (and stops earning) at once.
    let position = s.client.get_position(&staker).unwrap();
    assert_eq!(position.amount, 600);
    assert_eq!(s.client.get_pool().total_shares, 600);

    s.env.ledger().with_mut(|l| l.timestamp = available_at);
    assert_eq!(s.client.complete_unstake(&staker), 400);
    assert_eq!(s.token.balance(&staker), 400);
    assert!(s.client.get_unstake_request(&staker).is_none());

    // A completed request cannot be paid twice.
    let result = s.client.try_complete_unstake(&staker);
    assert_eq!(result, Err(Ok(StakingError::NoPendingUnlock)));
}

#[test]
fn request_and_completion_emit_events() {
    let s = setup();
    s.client.set_unstake_cooldown(&COOLDOWN);
    let staker = staked(&s, 1_000);

    let available_at = s.client.request_unstake(&staker, &1_000);
    assert!(has_event(&s, "unstake", "requested"));

    s.env.ledger().with_mut(|l| l.timestamp = available_at);
    s.client.complete_unstake(&staker);
    assert!(has_event(&s, "unstake", "completed"));
}

#[test]
fn immediate_unstake_is_blocked_while_cooldown_is_configured() {
    let s = setup();
    s.client.set_unstake_cooldown(&COOLDOWN);
    let staker = staked(&s, 1_000);

    let result = s.client.try_unstake(&staker, &1_000);
    assert_eq!(result, Err(Ok(StakingError::CooldownRequired)));
}

#[test]
fn second_request_while_one_is_pending_is_rejected() {
    let s = setup();
    s.client.set_unstake_cooldown(&COOLDOWN);
    let staker = staked(&s, 1_000);

    s.client.request_unstake(&staker, &500);
    let result = s.client.try_request_unstake(&staker, &500);
    assert_eq!(result, Err(Ok(StakingError::UnstakeRequestPending)));
}

#[test]
fn request_unstake_before_lock_elapsed_is_rejected() {
    let s = setup();
    s.client.set_unstake_cooldown(&COOLDOWN);
    let staker = Address::generate(&s.env);
    s.asset.mint(&staker, &1_000);
    s.client.stake(&staker, &1_000, &LOCK);

    let result = s.client.try_request_unstake(&staker, &1_000);
    assert_eq!(result, Err(Ok(StakingError::LockNotElapsed)));
}

// ── #2200 ────────────────────────────────────────────────────────────────────

#[test]
fn paused_vault_rejects_stake_and_unstake() {
    let s = setup();
    let staker = staked(&s, 1_000);

    s.client.pause();
    assert!(has_event(&s, "vault", "paused"));
    assert!(s.client.is_paused());

    let newcomer = Address::generate(&s.env);
    s.asset.mint(&newcomer, &1_000);
    assert_eq!(
        s.client.try_stake(&newcomer, &1_000, &LOCK),
        Err(Ok(StakingError::Paused))
    );
    assert_eq!(
        s.client.try_unstake(&staker, &1_000),
        Err(Ok(StakingError::Paused))
    );
    assert_eq!(
        s.client.try_request_unstake(&staker, &1_000),
        Err(Ok(StakingError::Paused))
    );
    assert_eq!(
        s.client.try_request_unlock(&staker, &1_000),
        Err(Ok(StakingError::Paused))
    );
}

#[test]
fn paused_vault_blocks_completing_a_pending_unstake() {
    let s = setup();
    s.client.set_unstake_cooldown(&COOLDOWN);
    let staker = staked(&s, 1_000);
    let available_at = s.client.request_unstake(&staker, &1_000);
    s.env.ledger().with_mut(|l| l.timestamp = available_at);

    s.client.pause();
    assert_eq!(
        s.client.try_complete_unstake(&staker),
        Err(Ok(StakingError::Paused))
    );

    // Funds stay in the vault and are released once unpaused.
    s.client.unpause();
    assert_eq!(s.client.complete_unstake(&staker), 1_000);
}

#[test]
fn only_admin_can_pause_and_unpause() {
    let s = setup();
    let attacker = Address::generate(&s.env);

    s.env.mock_auths(&[MockAuth {
        address: &attacker,
        invoke: &MockAuthInvoke {
            contract: &s.client.address,
            fn_name: "pause",
            args: Vec::<Val>::new(&s.env),
            sub_invokes: &[],
        },
    }]);
    assert!(s.client.try_pause().is_err());
    assert!(!s.client.is_paused());

    s.env.mock_auths(&[MockAuth {
        address: &s.admin,
        invoke: &MockAuthInvoke {
            contract: &s.client.address,
            fn_name: "pause",
            args: Vec::<Val>::new(&s.env),
            sub_invokes: &[],
        },
    }]);
    s.client.pause();
    assert!(s.client.is_paused());

    s.env.mock_auths(&[MockAuth {
        address: &attacker,
        invoke: &MockAuthInvoke {
            contract: &s.client.address,
            fn_name: "unpause",
            args: Vec::<Val>::new(&s.env),
            sub_invokes: &[],
        },
    }]);
    assert!(s.client.try_unpause().is_err());
    assert!(s.client.is_paused());

    s.env.mock_auths(&[MockAuth {
        address: &s.admin,
        invoke: &MockAuthInvoke {
            contract: &s.client.address,
            fn_name: "unpause",
            args: Vec::<Val>::new(&s.env),
            sub_invokes: &[],
        },
    }]);
    s.client.unpause();
    assert!(!s.client.is_paused());
}

#[test]
fn unpausing_restores_normal_operation() {
    let s = setup();
    let staker = staked(&s, 1_000);

    s.client.pause();
    s.client.unpause();
    assert!(has_event(&s, "vault", "unpaused"));

    let newcomer = Address::generate(&s.env);
    s.asset.mint(&newcomer, &1_000);
    s.client.stake(&newcomer, &1_000, &LOCK);
    assert_eq!(s.client.get_position(&newcomer).unwrap().amount, 1_000);

    s.client.unstake(&staker, &1_000);
    assert_eq!(s.token.balance(&staker), 1_000);
}
