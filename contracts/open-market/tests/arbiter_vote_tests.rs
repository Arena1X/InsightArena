use insightarena_contract::{
    CreateMarketParams, InsightArenaContract, InsightArenaContractClient, InsightArenaError,
};
use soroban_sdk::testutils::{Address as _, Ledger as _};
use soroban_sdk::token::{Client as TokenClient, StellarAssetClient};
use soroban_sdk::{symbol_short, vec, Address, BytesN, Env, String, Symbol};

fn register_token(env: &Env) -> Address {
    let token_admin = Address::generate(env);
    env.register_stellar_asset_contract_v2(token_admin)
        .address()
}

fn deploy(env: &Env) -> (InsightArenaContractClient<'_>, Address, Address, Address) {
    let id = env.register(InsightArenaContract, ());
    let client = InsightArenaContractClient::new(env, &id);
    let admin = Address::generate(env);
    let oracle = Address::generate(env);
    let xlm_token = register_token(env);
    env.mock_all_auths();
    client.initialize(&admin, &oracle, &200_u32, &xlm_token);
    (client, admin, oracle, xlm_token)
}

fn market_params(env: &Env) -> CreateMarketParams {
    let now = env.ledger().timestamp();
    CreateMarketParams {
        title: String::from_str(env, "Arbiter vote test market"),
        description: String::from_str(env, "For arbiter quorum voting tests"),
        category: Symbol::new(env, "Sports"),
        outcomes: vec![env, symbol_short!("yes"), symbol_short!("no")],
        end_time: now + 10,
        resolution_time: now + 20,
        dispute_window: 86_400,
        creator_fee_bps: 100,
        min_stake: 10_000_000,
        max_stake: 100_000_000,
        is_public: true,
        metadata_hash: BytesN::from_array(env, &[0u8; 32]),
    }
}

/// Creates + resolves a market, then raises a dispute against it. Returns
/// the market id and the disputer's bond amount.
fn setup_disputed_market(
    env: &Env,
    client: &InsightArenaContractClient<'_>,
    oracle: &Address,
    xlm_token: &Address,
) -> (u64, Address, i128) {
    let creator = Address::generate(env);
    let disputer = Address::generate(env);

    let id = client.create_market(&creator, &market_params(env));
    env.ledger().set_timestamp(env.ledger().timestamp() + 20);
    client.resolve_market(oracle, &id, &symbol_short!("yes"));

    let bond = 15_000_000_i128;
    StellarAssetClient::new(env, xlm_token).mint(&disputer, &bond);
    TokenClient::new(env, xlm_token).approve(&disputer, &client.address, &bond, &9999);
    client.raise_dispute(&disputer, &id, &bond);

    (id, disputer, bond)
}

fn fund_and_stake_arbiter(
    env: &Env,
    client: &InsightArenaContractClient<'_>,
    xlm_token: &Address,
    amount: i128,
) -> Address {
    let arbiter = Address::generate(env);
    StellarAssetClient::new(env, xlm_token).mint(&arbiter, &amount);
    TokenClient::new(env, xlm_token).approve(&arbiter, &client.address, &amount, &9999);
    client.stake_as_arbiter(&arbiter, &amount);
    arbiter
}

// ── Staking ────────────────────────────────────────────────────────────────────

#[test]
fn stake_as_arbiter_accumulates_balance() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, _oracle, xlm_token) = deploy(&env);

    let arbiter = Address::generate(&env);
    StellarAssetClient::new(&env, &xlm_token).mint(&arbiter, &50_000_000);
    TokenClient::new(&env, &xlm_token).approve(&arbiter, &client.address, &50_000_000, &9999);

    client.stake_as_arbiter(&arbiter, &20_000_000);
    assert_eq!(client.get_arbiter_stake(&arbiter), 20_000_000);

    client.stake_as_arbiter(&arbiter, &10_000_000);
    assert_eq!(client.get_arbiter_stake(&arbiter), 30_000_000);
}

#[test]
fn stake_as_arbiter_rejects_non_positive_amount() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, _oracle, _xlm_token) = deploy(&env);
    let arbiter = Address::generate(&env);

    let result = client.try_stake_as_arbiter(&arbiter, &0);
    assert!(matches!(result, Err(Ok(InsightArenaError::InvalidInput))));
}

// ── Weighting (snapshot at assignment) ────────────────────────────────────────

#[test]
fn assign_arbiters_snapshots_weight_immune_to_later_stake_changes() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, oracle, xlm_token) = deploy(&env);
    let (market_id, _disputer, _bond) = setup_disputed_market(&env, &client, &oracle, &xlm_token);

    let arbiter = fund_and_stake_arbiter(&env, &client, &xlm_token, 40_000_000);

    client.assign_arbiters(&admin, &market_id, &vec![&env, arbiter.clone()]);

    let tally_before = client.get_arbiter_tally(&market_id);
    let weight_before = tally_before.arbiters.get(0).unwrap().weight;
    // No UserProfile yet => reputation_score 0 => 1.0x multiplier => weight
    // equals the raw staked amount.
    assert_eq!(weight_before, 40_000_000);

    // Increase stake after assignment - the panel's snapshotted weight must
    // not move.
    StellarAssetClient::new(&env, &xlm_token).mint(&arbiter, &1_000_000_000);
    TokenClient::new(&env, &xlm_token).approve(&arbiter, &client.address, &1_000_000_000, &9999);
    client.stake_as_arbiter(&arbiter, &1_000_000_000);

    let tally_after = client.get_arbiter_tally(&market_id);
    let weight_after = tally_after.arbiters.get(0).unwrap().weight;
    assert_eq!(weight_after, weight_before);
}

#[test]
fn assign_arbiters_rejects_zero_stake_candidate() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, oracle, xlm_token) = deploy(&env);
    let (market_id, _disputer, _bond) = setup_disputed_market(&env, &client, &oracle, &xlm_token);

    let unstaked = Address::generate(&env);

    let result = client.try_assign_arbiters(&admin, &market_id, &vec![&env, unstaked]);
    assert!(matches!(result, Err(Ok(InsightArenaError::InvalidInput))));
}

#[test]
fn assign_arbiters_rejects_duplicate_address() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, oracle, xlm_token) = deploy(&env);
    let (market_id, _disputer, _bond) = setup_disputed_market(&env, &client, &oracle, &xlm_token);

    let arbiter = fund_and_stake_arbiter(&env, &client, &xlm_token, 10_000_000);

    let result = client.try_assign_arbiters(
        &admin,
        &market_id,
        &vec![&env, arbiter.clone(), arbiter],
    );
    assert!(matches!(result, Err(Ok(InsightArenaError::InvalidInput))));
}

#[test]
fn assign_arbiters_rejects_second_assignment_to_same_dispute() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, oracle, xlm_token) = deploy(&env);
    let (market_id, _disputer, _bond) = setup_disputed_market(&env, &client, &oracle, &xlm_token);

    let arbiter_a = fund_and_stake_arbiter(&env, &client, &xlm_token, 10_000_000);
    let arbiter_b = fund_and_stake_arbiter(&env, &client, &xlm_token, 10_000_000);

    client.assign_arbiters(&admin, &market_id, &vec![&env, arbiter_a]);

    let result = client.try_assign_arbiters(&admin, &market_id, &vec![&env, arbiter_b]);
    assert!(matches!(
        result,
        Err(Ok(InsightArenaError::DisputeAlreadyFiled))
    ));
}

// ── Quorum gating ──────────────────────────────────────────────────────────────

#[test]
fn cannot_finalize_before_voting_deadline() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, oracle, xlm_token) = deploy(&env);
    let (market_id, _disputer, _bond) = setup_disputed_market(&env, &client, &oracle, &xlm_token);

    let arbiter = fund_and_stake_arbiter(&env, &client, &xlm_token, 10_000_000);
    client.assign_arbiters(&admin, &market_id, &vec![&env, arbiter.clone()]);
    client.cast_arbiter_vote(&arbiter, &market_id, &true);

    // Quorum is met (the only arbiter voted) but the deadline hasn't passed.
    let result = client.try_finalize_arbiter_vote(&admin, &market_id);
    assert!(matches!(
        result,
        Err(Ok(InsightArenaError::TimelockNotElapsed))
    ));
}

#[test]
fn cannot_finalize_when_quorum_not_met_even_after_deadline() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, oracle, xlm_token) = deploy(&env);
    let (market_id, _disputer, _bond) = setup_disputed_market(&env, &client, &oracle, &xlm_token);

    // Two equally-weighted arbiters, quorum defaults to 50%; if neither
    // votes, 0% of weight has voted and quorum is never met.
    let arbiter_a = fund_and_stake_arbiter(&env, &client, &xlm_token, 10_000_000);
    let arbiter_b = fund_and_stake_arbiter(&env, &client, &xlm_token, 10_000_000);
    client.assign_arbiters(&admin, &market_id, &vec![&env, arbiter_a, arbiter_b]);

    let tally = client.get_arbiter_tally(&market_id);
    env.ledger()
        .set_timestamp(tally.voting_deadline + 1);

    let result = client.try_finalize_arbiter_vote(&admin, &market_id);
    assert!(matches!(
        result,
        Err(Ok(InsightArenaError::TimelockNotElapsed))
    ));
}

#[test]
fn get_arbiter_tally_reports_quorum_progress() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, oracle, xlm_token) = deploy(&env);
    let (market_id, _disputer, _bond) = setup_disputed_market(&env, &client, &oracle, &xlm_token);

    let arbiter_a = fund_and_stake_arbiter(&env, &client, &xlm_token, 10_000_000);
    let arbiter_b = fund_and_stake_arbiter(&env, &client, &xlm_token, 10_000_000);
    client.assign_arbiters(&admin, &market_id, &vec![&env, arbiter_a.clone(), arbiter_b]);

    let before = client.get_arbiter_tally(&market_id);
    assert!(!before.quorum_met);
    assert_eq!(before.voted_weight, 0);

    client.cast_arbiter_vote(&arbiter_a, &market_id, &true);

    let after = client.get_arbiter_tally(&market_id);
    assert!(after.quorum_met); // 50% of weight voted, default quorum is 50%
    assert_eq!(after.voted_weight, after.total_weight / 2);
    assert_eq!(after.uphold_weight, after.total_weight / 2);
}

// ── Voting rules ───────────────────────────────────────────────────────────────

#[test]
fn cast_arbiter_vote_rejects_non_panel_member() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, oracle, xlm_token) = deploy(&env);
    let (market_id, _disputer, _bond) = setup_disputed_market(&env, &client, &oracle, &xlm_token);

    let arbiter = fund_and_stake_arbiter(&env, &client, &xlm_token, 10_000_000);
    client.assign_arbiters(&admin, &market_id, &vec![&env, arbiter]);

    let outsider = Address::generate(&env);
    let result = client.try_cast_arbiter_vote(&outsider, &market_id, &true);
    assert!(matches!(result, Err(Ok(InsightArenaError::Unauthorized))));
}

#[test]
fn cast_arbiter_vote_rejects_double_vote() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, oracle, xlm_token) = deploy(&env);
    let (market_id, _disputer, _bond) = setup_disputed_market(&env, &client, &oracle, &xlm_token);

    let arbiter = fund_and_stake_arbiter(&env, &client, &xlm_token, 10_000_000);
    client.assign_arbiters(&admin, &market_id, &vec![&env, arbiter.clone()]);
    client.cast_arbiter_vote(&arbiter, &market_id, &true);

    let result = client.try_cast_arbiter_vote(&arbiter, &market_id, &false);
    assert!(matches!(
        result,
        Err(Ok(InsightArenaError::AlreadyPredicted))
    ));
}

#[test]
fn cast_arbiter_vote_rejects_after_deadline() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, oracle, xlm_token) = deploy(&env);
    let (market_id, _disputer, _bond) = setup_disputed_market(&env, &client, &oracle, &xlm_token);

    let arbiter = fund_and_stake_arbiter(&env, &client, &xlm_token, 10_000_000);
    client.assign_arbiters(&admin, &market_id, &vec![&env, arbiter.clone()]);

    let tally = client.get_arbiter_tally(&market_id);
    env.ledger().set_timestamp(tally.voting_deadline + 1);

    let result = client.try_cast_arbiter_vote(&arbiter, &market_id, &true);
    assert!(matches!(
        result,
        Err(Ok(InsightArenaError::DisputeWindowClosed))
    ));
}

// ── Finalize: uphold / reject / tie ───────────────────────────────────────────

#[test]
fn finalize_uphold_refunds_bond_and_reopens_market() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, oracle, xlm_token) = deploy(&env);
    let (market_id, disputer, bond) = setup_disputed_market(&env, &client, &oracle, &xlm_token);

    let arbiter_a = fund_and_stake_arbiter(&env, &client, &xlm_token, 10_000_000);
    let arbiter_b = fund_and_stake_arbiter(&env, &client, &xlm_token, 10_000_000);
    let arbiter_c = fund_and_stake_arbiter(&env, &client, &xlm_token, 10_000_000);
    client.assign_arbiters(
        &admin,
        &market_id,
        &vec![&env, arbiter_a.clone(), arbiter_b.clone(), arbiter_c],
    );

    client.cast_arbiter_vote(&arbiter_a, &market_id, &true);
    client.cast_arbiter_vote(&arbiter_b, &market_id, &true);
    // arbiter_c never votes - will be slashed.

    let tally = client.get_arbiter_tally(&market_id);
    env.ledger().set_timestamp(tally.voting_deadline + 1);

    let token = TokenClient::new(&env, &xlm_token);
    let disputer_before = token.balance(&disputer);

    client.finalize_arbiter_vote(&admin, &market_id);

    assert_eq!(token.balance(&disputer), disputer_before + bond);
    let market = client.get_market(&market_id);
    assert!(!market.is_resolved);
    assert_eq!(market.resolved_outcome, None);

    // The dispute record is cleaned up once finalized, mirroring resolve_dispute.
    let result = client.try_get_dispute(&market_id);
    assert!(matches!(
        result,
        Err(Ok(InsightArenaError::DisputeNotFound))
    ));
}

#[test]
fn finalize_reject_slashes_disputer_bond() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, oracle, xlm_token) = deploy(&env);
    let (market_id, _disputer, bond) = setup_disputed_market(&env, &client, &oracle, &xlm_token);

    let arbiter_a = fund_and_stake_arbiter(&env, &client, &xlm_token, 10_000_000);
    let arbiter_b = fund_and_stake_arbiter(&env, &client, &xlm_token, 10_000_000);
    client.assign_arbiters(&admin, &market_id, &vec![&env, arbiter_a.clone(), arbiter_b.clone()]);

    client.cast_arbiter_vote(&arbiter_a, &market_id, &false);
    client.cast_arbiter_vote(&arbiter_b, &market_id, &false);

    let tally = client.get_arbiter_tally(&market_id);
    env.ledger().set_timestamp(tally.voting_deadline + 1);

    let treasury_before = client.get_treasury_balance();
    let insurance_before = client.get_insurance_pool_balance();

    client.finalize_arbiter_vote(&admin, &market_id);

    let treasury_after = client.get_treasury_balance();
    let insurance_after = client.get_insurance_pool_balance();
    let insurance_share = bond * 1000 / 10_000; // default 10% insurance split
    let treasury_share = bond - insurance_share;
    assert_eq!(treasury_after, treasury_before + treasury_share);
    assert_eq!(insurance_after, insurance_before + insurance_share);

    let market = client.get_market(&market_id);
    assert!(market.is_resolved);
}

#[test]
fn tie_vote_resolves_to_reject() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, oracle, xlm_token) = deploy(&env);
    let (market_id, disputer, _bond) = setup_disputed_market(&env, &client, &oracle, &xlm_token);

    // Two equally-staked arbiters, one uphold, one reject: a dead-even tie.
    let arbiter_a = fund_and_stake_arbiter(&env, &client, &xlm_token, 10_000_000);
    let arbiter_b = fund_and_stake_arbiter(&env, &client, &xlm_token, 10_000_000);
    client.assign_arbiters(&admin, &market_id, &vec![&env, arbiter_a.clone(), arbiter_b.clone()]);

    client.cast_arbiter_vote(&arbiter_a, &market_id, &true);
    client.cast_arbiter_vote(&arbiter_b, &market_id, &false);

    let tally = client.get_arbiter_tally(&market_id);
    assert_eq!(tally.uphold_weight, tally.reject_weight);

    env.ledger().set_timestamp(tally.voting_deadline + 1);

    let token = TokenClient::new(&env, &xlm_token);
    let disputer_before = token.balance(&disputer);

    client.finalize_arbiter_vote(&admin, &market_id);

    // Ties resolve to reject: no refund, market stays resolved.
    assert_eq!(token.balance(&disputer), disputer_before);
    let market = client.get_market(&market_id);
    assert!(market.is_resolved);
}

// ── Slashing accounting ────────────────────────────────────────────────────────

#[test]
fn non_voter_slashed_amount_exactly_equals_amount_redistributed_to_voters() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, oracle, xlm_token) = deploy(&env);
    let (market_id, _disputer, _bond) = setup_disputed_market(&env, &client, &oracle, &xlm_token);

    let stake_amount = 10_000_000_i128;
    let arbiter_a = fund_and_stake_arbiter(&env, &client, &xlm_token, stake_amount);
    let arbiter_b = fund_and_stake_arbiter(&env, &client, &xlm_token, stake_amount);
    let arbiter_c = fund_and_stake_arbiter(&env, &client, &xlm_token, stake_amount);
    client.assign_arbiters(
        &admin,
        &market_id,
        &vec![&env, arbiter_a.clone(), arbiter_b.clone(), arbiter_c.clone()],
    );

    let total_stake_before = client.get_arbiter_stake(&arbiter_a)
        + client.get_arbiter_stake(&arbiter_b)
        + client.get_arbiter_stake(&arbiter_c);

    client.cast_arbiter_vote(&arbiter_a, &market_id, &true);
    client.cast_arbiter_vote(&arbiter_b, &market_id, &true);
    // arbiter_c does not vote and will be slashed 10% (default arbiter_slash_bps).

    let tally = client.get_arbiter_tally(&market_id);
    env.ledger().set_timestamp(tally.voting_deadline + 1);

    client.finalize_arbiter_vote(&admin, &market_id);

    let expected_slash = stake_amount * 1000 / 10_000; // 10%
    assert_eq!(client.get_arbiter_stake(&arbiter_c), stake_amount - expected_slash);

    // The arbiter-stake ledger is a closed system: slashing only moves
    // stake between arbiters, so the total across all three must be
    // unchanged (slashed amount == redistributed amount, exactly).
    let total_stake_after = client.get_arbiter_stake(&arbiter_a)
        + client.get_arbiter_stake(&arbiter_b)
        + client.get_arbiter_stake(&arbiter_c);
    assert_eq!(total_stake_after, total_stake_before);

    // Both voters received a strictly positive share of the slash.
    assert!(client.get_arbiter_stake(&arbiter_a) > stake_amount);
    assert!(client.get_arbiter_stake(&arbiter_b) > stake_amount);
}

// ── Double-settle guard (#1677) ───────────────────────────────────────────────

#[test]
fn finalize_arbiter_vote_cannot_be_called_twice() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, oracle, xlm_token) = deploy(&env);
    let (market_id, disputer, _bond) = setup_disputed_market(&env, &client, &oracle, &xlm_token);

    let arbiter_a = fund_and_stake_arbiter(&env, &client, &xlm_token, 10_000_000);
    let arbiter_b = fund_and_stake_arbiter(&env, &client, &xlm_token, 10_000_000);
    client.assign_arbiters(&admin, &market_id, &vec![&env, arbiter_a.clone(), arbiter_b.clone()]);
    client.cast_arbiter_vote(&arbiter_a, &market_id, &true);
    client.cast_arbiter_vote(&arbiter_b, &market_id, &true);

    let tally = client.get_arbiter_tally(&market_id);
    env.ledger().set_timestamp(tally.voting_deadline + 1);

    client.finalize_arbiter_vote(&admin, &market_id);

    let token = TokenClient::new(&env, &xlm_token);
    let disputer_balance_after_first = token.balance(&disputer);

    let result = client.try_finalize_arbiter_vote(&admin, &market_id);
    assert!(matches!(
        result,
        Err(Ok(InsightArenaError::DisputeNotFound))
    ));
    assert_eq!(token.balance(&disputer), disputer_balance_after_first);
}

// ── Admin gating ────────────────────────────────────────────────────────────────

#[test]
fn assign_arbiters_requires_admin() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, oracle, xlm_token) = deploy(&env);
    let (market_id, _disputer, _bond) = setup_disputed_market(&env, &client, &oracle, &xlm_token);

    let arbiter = fund_and_stake_arbiter(&env, &client, &xlm_token, 10_000_000);
    let not_admin = Address::generate(&env);

    let result = client.try_assign_arbiters(&not_admin, &market_id, &vec![&env, arbiter]);
    assert!(matches!(result, Err(Ok(InsightArenaError::Unauthorized))));
}

// ── Config ──────────────────────────────────────────────────────────────────────

#[test]
fn set_arbiter_config_updates_values_used_by_new_panels() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, oracle, xlm_token) = deploy(&env);
    let (market_id, _disputer, _bond) = setup_disputed_market(&env, &client, &oracle, &xlm_token);

    client.set_arbiter_config(&admin, &7000_u32, &2000_u32, &3600_u64);

    let arbiter = fund_and_stake_arbiter(&env, &client, &xlm_token, 10_000_000);
    client.assign_arbiters(&admin, &market_id, &vec![&env, arbiter]);

    let tally = client.get_arbiter_tally(&market_id);
    assert_eq!(tally.quorum_bps, 7000);
}

#[test]
fn set_arbiter_config_rejects_invalid_bps() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, _oracle, _xlm_token) = deploy(&env);

    let result = client.try_set_arbiter_config(&admin, &0_u32, &1000_u32, &3600_u64);
    assert!(matches!(result, Err(Ok(InsightArenaError::InvalidInput))));

    let result = client.try_set_arbiter_config(&admin, &5000_u32, &10_001_u32, &3600_u64);
    assert!(matches!(result, Err(Ok(InsightArenaError::InvalidInput))));
}
