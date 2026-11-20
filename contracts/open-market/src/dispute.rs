use soroban_sdk::{symbol_short, Address, Env, Symbol, Vec};

use crate::config;
use crate::errors::InsightArenaError;
use crate::escrow;
use crate::market;
use crate::reputation;
use crate::storage_types::{ArbiterAssignment, ArbiterTally, DataKey, Dispute, OracleSubmission, UserProfile};

fn bump_dispute(env: &Env, market_id: u64) {
    // A disputed market is still active (its escrow pool and price
    // accumulator, if any, remain live for stakers), so every dispute write
    // must bump the full hot-key set, not just the market record. See
    // Issue #1516.
    config::extend_active_market_ttl(env, market_id);
    env.storage().persistent().extend_ttl(
        &DataKey::Dispute(market_id),
        config::PERSISTENT_THRESHOLD,
        config::PERSISTENT_BUMP,
    );
}

fn bump_active_dispute_list(env: &Env) {
    env.storage().persistent().extend_ttl(
        &DataKey::ActiveDisputeList,
        config::PERSISTENT_THRESHOLD,
        config::PERSISTENT_BUMP,
    );
}

fn require_admin(env: &Env, admin: &Address) -> Result<(), InsightArenaError> {
    admin.require_auth();
    let cfg = config::get_config(env)?;
    if admin != &cfg.admin {
        return Err(InsightArenaError::Unauthorized);
    }
    Ok(())
}

fn emit_dispute_raised(env: &Env, market_id: u64, disputer: &Address, bond: i128, filed_at: u64) {
    env.events().publish(
        (symbol_short!("dsp"), symbol_short!("raised")),
        (market_id, disputer.clone(), bond, filed_at),
    );
}

fn emit_dispute_resolved(env: &Env, market_id: u64, admin: &Address, uphold: bool) {
    env.events().publish(
        (symbol_short!("dsp"), symbol_short!("reslvd")),
        (market_id, admin.clone(), uphold),
    );
}

fn emit_appeal_filed(env: &Env, market_id: u64, appealer: &Address, bond: i128, tier: u32) {
    env.events().publish(
        (symbol_short!("dsp"), symbol_short!("appld")),
        (market_id, appealer.clone(), bond, tier),
    );
}

fn emit_appeal_resolved(env: &Env, market_id: u64, admin: &Address, uphold: bool, tier: u32) {
    env.events().publish(
        (symbol_short!("dsp"), symbol_short!("appeald")),
        (market_id, admin.clone(), uphold, tier),
    );
}

pub fn get_dispute(env: &Env, market_id: u64) -> Result<Dispute, InsightArenaError> {
    let dispute: Dispute = env
        .storage()
        .persistent()
        .get(&DataKey::Dispute(market_id))
        .ok_or(InsightArenaError::DisputeNotFound)?;
    bump_dispute(env, market_id);
    Ok(dispute)
}

pub fn raise_dispute(
    env: Env,
    disputer: Address,
    market_id: u64,
    bond: i128,
) -> Result<(), InsightArenaError> {
    config::ensure_not_paused(&env)?;

    if bond <= 0 {
        return Err(InsightArenaError::InvalidInput);
    }

    let market = market::get_market(&env, market_id)?;
    if !market.is_resolved {
        return Err(InsightArenaError::MarketNotResolved);
    }

    if env.storage().persistent().has(&DataKey::Dispute(market_id)) {
        return Err(InsightArenaError::DisputeAlreadyFiled);
    }

    let now = env.ledger().timestamp();
    let resolved_at = market
        .resolved_at
        .ok_or(InsightArenaError::MarketNotResolved)?;
    let deadline = resolved_at
        .checked_add(market.dispute_window)
        .ok_or(InsightArenaError::Overflow)?;
    if now > deadline {
        return Err(InsightArenaError::DisputeWindowClosed);
    }

    escrow::lock_stake(&env, &disputer, bond)?;

    let dispute = Dispute::new(&env, disputer.clone(), bond, now);
    env.storage()
        .persistent()
        .set(&DataKey::Dispute(market_id), &dispute);

    // Add market_id to active dispute list
    let mut active_list: Vec<u64> = env
        .storage()
        .persistent()
        .get(&DataKey::ActiveDisputeList)
        .unwrap_or_else(|| Vec::new(&env));
    if !active_list.contains(&market_id) {
        active_list.push_back(market_id);
    }
    env.storage()
        .persistent()
        .set(&DataKey::ActiveDisputeList, &active_list);
    bump_active_dispute_list(&env);

    bump_dispute(&env, market_id);

    // Increment open dispute count
    let current_count = get_open_dispute_count(&env);
    set_open_dispute_count(&env, current_count + 1);

    // Update creator's dispute count and reputation
    reputation::on_dispute_raised(&env, &market.creator);

    emit_dispute_raised(&env, market_id, &disputer, bond, now);

    Ok(())
}

pub fn resolve_dispute(
    env: Env,
    admin: Address,
    market_id: u64,
    uphold: bool,
) -> Result<(), InsightArenaError> {
    config::ensure_not_paused(&env)?;
    require_admin(&env, &admin)?;

    let mut dispute: Dispute = env
        .storage()
        .persistent()
        .get(&DataKey::Dispute(market_id))
        .ok_or(InsightArenaError::DisputeNotFound)?;

    // Guard against double-resolution (reuses ZeroShareTransfer)
    if dispute.is_resolved {
        return Err(InsightArenaError::ZeroShareTransfer);
    }

    // Mark as resolved before any state changes
    dispute.is_resolved = true;
    dispute.resolution_upheld = Some(uphold);
    env.storage()
        .persistent()
        .set(&DataKey::Dispute(market_id), &dispute);
    bump_dispute(&env, market_id);

    if uphold {
        // Disputer wins: refund their bond in full, reopen market
        escrow::distribute_slashed_bond(&env, Some(&dispute.disputer), dispute.bond, dispute.bond)?;

        let mut market = market::get_market(&env, market_id)?;
        market.is_resolved = false;
        market.resolved_outcome = None;
        market.resolved_at = None;
        env.storage()
            .persistent()
            .set(&DataKey::Market(market_id), &market);
        config::extend_active_market_ttl(&env, market_id);

        // Reputation impact: market creator gets additional penalty
        reputation::on_dispute_upheld(&env, &market.creator);
    } else {
        // Disputer loses: slash their bond (winner refund = 0, so full amount slashed)
        escrow::distribute_slashed_bond(&env, None, 0, dispute.bond)?;

        // Reputation impact: disputer gets penalty for frivolous dispute
        reputation::on_dispute_rejected(&env, &dispute.disputer);
    }

    // Settle any staked oracle submission for this market now that the
    // dispute has a final outcome: slashed if `uphold` (the oracle's
    // resolution was wrong), refunded plus reward otherwise.
    settle_oracle_submission(&env, market_id, uphold)?;

    // Remove market_id from active dispute list
    let active_list: Vec<u64> = env
        .storage()
        .persistent()
        .get(&DataKey::ActiveDisputeList)
        .unwrap_or_else(|| Vec::new(&env));
    let mut new_list: Vec<u64> = Vec::new(&env);
    for id in active_list.iter() {
        if id != market_id {
            new_list.push_back(id);
        }
    }
    env.storage()
        .persistent()
        .set(&DataKey::ActiveDisputeList, &new_list);
    bump_active_dispute_list(&env);

    env.storage()
        .persistent()
        .remove(&DataKey::Dispute(market_id));

    // Decrement open dispute count
    let current_count = get_open_dispute_count(&env);
    if current_count > 0 {
        set_open_dispute_count(&env, current_count - 1);
    }

    emit_dispute_resolved(&env, market_id, &admin, uphold);

    Ok(())
}

pub fn list_active_disputes(env: &Env) -> Vec<u64> {
    let list: Vec<u64> = env
        .storage()
        .persistent()
        .get(&DataKey::ActiveDisputeList)
        .unwrap_or_else(|| Vec::new(env));
    if env.storage().persistent().has(&DataKey::ActiveDisputeList) {
        bump_active_dispute_list(env);
    }
    list
}

pub fn get_open_dispute_count(env: &Env) -> u32 {
    env.storage()
        .persistent()
        .get(&DataKey::DisputeCount)
        .unwrap_or(0)
}

fn set_open_dispute_count(env: &Env, count: u32) {
    env.storage()
        .persistent()
        .set(&DataKey::DisputeCount, &count);
    env.storage().persistent().extend_ttl(
        &DataKey::DisputeCount,
        config::PERSISTENT_THRESHOLD,
        config::PERSISTENT_BUMP,
    );
}

const MAX_APPEAL_TIERS: u32 = 2;

fn calculate_appeal_bond(base_bond: i128, tier: u32) -> i128 {
    base_bond.saturating_mul((tier as i128) + 1)
}

pub fn appeal_dispute(
    env: Env,
    appealer: Address,
    market_id: u64,
    appeal_bond: i128,
) -> Result<(), InsightArenaError> {
    config::ensure_not_paused(&env)?;

    if appeal_bond <= 0 {
        return Err(InsightArenaError::InvalidInput);
    }

    let mut dispute: Dispute = env
        .storage()
        .persistent()
        .get(&DataKey::Dispute(market_id))
        .ok_or(InsightArenaError::DisputeNotFound)?;

    if dispute.appeal_tier >= MAX_APPEAL_TIERS {
        // Max appeal tiers reached; the appeal window is effectively closed.
        // Reuses DisputeWindowClosed since the error enum is at its 50-case cap.
        return Err(InsightArenaError::DisputeWindowClosed);
    }

    if dispute.appealer.is_some() {
        // A dispute has already been appealed at this tier. Reuses
        // DisputeAlreadyFiled since the error enum is at its 50-case cap.
        return Err(InsightArenaError::DisputeAlreadyFiled);
    }

    let expected_bond = calculate_appeal_bond(dispute.bond, dispute.appeal_tier + 1);
    if appeal_bond < expected_bond {
        return Err(InsightArenaError::InvalidInput);
    }

    escrow::lock_stake(&env, &appealer, appeal_bond)?;

    dispute.appeal_tier += 1;
    dispute.appealer = Some(appealer.clone());
    dispute.appeal_bond = appeal_bond;
    env.storage()
        .persistent()
        .set(&DataKey::Dispute(market_id), &dispute);
    bump_dispute(&env, market_id);

    emit_appeal_filed(&env, market_id, &appealer, appeal_bond, dispute.appeal_tier);

    Ok(())
}

pub fn resolve_appeal(
    env: Env,
    admin: Address,
    market_id: u64,
    uphold: bool,
) -> Result<(), InsightArenaError> {
    config::ensure_not_paused(&env)?;
    require_admin(&env, &admin)?;

    let mut dispute: Dispute = env
        .storage()
        .persistent()
        .get(&DataKey::Dispute(market_id))
        .ok_or(InsightArenaError::DisputeNotFound)?;

    let appealer = dispute
        .appealer
        .clone()
        .ok_or(InsightArenaError::DisputeNotFound)?;

    let appeal_bond = dispute.appeal_bond;

    // Guard against double-resolution of the same appeal (reuses EscrowEmpty)
    if appeal_bond == 0 {
        return Err(InsightArenaError::EscrowEmpty);
    }

    if uphold {
        // Appealer wins: refund their bond in full, reopen market
        escrow::distribute_slashed_bond(&env, Some(&appealer), appeal_bond, appeal_bond)?;

        let mut market = market::get_market(&env, market_id)?;
        market.is_resolved = false;
        market.resolved_outcome = None;
        market.resolved_at = None;
        env.storage()
            .persistent()
            .set(&DataKey::Market(market_id), &market);
        config::extend_active_market_ttl(&env, market_id);

        // Reputation impact: market creator gets additional penalty for wrong resolution
        reputation::on_dispute_upheld(&env, &market.creator);
    } else {
        // Appealer loses: slash their bond
        escrow::distribute_slashed_bond(&env, None, 0, appeal_bond)?;

        // Reputation impact: appealer gets penalty for frivolous appeal
        reputation::on_dispute_rejected(&env, &appealer);
    }

    dispute.appealer = None;
    dispute.appeal_bond = 0;
    env.storage()
        .persistent()
        .set(&DataKey::Dispute(market_id), &dispute);
    bump_dispute(&env, market_id);

    emit_appeal_resolved(&env, market_id, &admin, uphold, dispute.appeal_tier);

    Ok(())
}

// ── Weighted arbiter quorum voting ────────────────────────────────────────────
//
// A separate, opt-in resolution path alongside the flat admin `resolve_dispute`
// above: an admin assigns a weighted panel of arbiters to a pending dispute,
// each arbiter casts one vote, and once assigned weight meeting quorum has
// voted the panel can be finalized. Arbiters who never vote are slashed and
// the slashed stake is redistributed to those who did. Purely advisory input
// is not supported here — once assigned, a panel is the sole path to
// resolving that dispute (admin's plain `resolve_dispute` no longer applies,
// since the dispute now carries a live arbiter panel).

/// Raw (non-`DataKey`) storage key for an arbiter's staked bond. `DataKey` is
/// a `#[contracttype]` union already at its 50-variant XDR cap (see
/// `reputation::trusted_creator_key` for the established precedent), so this
/// deliberately bypasses it with a plain tuple key instead of adding a
/// variant.
fn arbiter_stake_key(arbiter: &Address) -> (Symbol, Address) {
    (symbol_short!("arbstk"), arbiter.clone())
}

/// Current staked bond (stroops) `arbiter` has deposited via
/// `stake_as_arbiter`. `0` if they have never staked.
pub fn get_arbiter_stake(env: &Env, arbiter: &Address) -> i128 {
    env.storage()
        .persistent()
        .get(&arbiter_stake_key(arbiter))
        .unwrap_or(0)
}

fn set_arbiter_stake(env: &Env, arbiter: &Address, amount: i128) {
    let key = arbiter_stake_key(arbiter);
    env.storage().persistent().set(&key, &amount);
    env.storage()
        .persistent()
        .extend_ttl(&key, config::PERSISTENT_THRESHOLD, config::PERSISTENT_BUMP);
}

/// Deposit `amount` as a bond making `arbiter` eligible for panel assignment
/// via `assign_arbiters`. Cumulative: repeated calls add to the existing
/// balance. There is deliberately no withdrawal path in this iteration —
/// stake only ever moves via this deposit or via slashing/redistribution at
/// `finalize_arbiter_vote`, so a would-be non-voter cannot dodge a slash by
/// withdrawing between assignment and finalization.
pub fn stake_as_arbiter(env: Env, arbiter: Address, amount: i128) -> Result<(), InsightArenaError> {
    config::ensure_not_paused(&env)?;

    if amount <= 0 {
        return Err(InsightArenaError::InvalidInput);
    }

    escrow::lock_stake(&env, &arbiter, amount)?;

    let new_balance = get_arbiter_stake(&env, &arbiter)
        .checked_add(amount)
        .ok_or(InsightArenaError::Overflow)?;
    set_arbiter_stake(&env, &arbiter, new_balance);

    emit_arbiter_staked(&env, &arbiter, amount, new_balance);

    Ok(())
}

fn emit_arbiter_staked(env: &Env, arbiter: &Address, amount: i128, new_balance: i128) {
    env.events().publish(
        (symbol_short!("arb"), symbol_short!("staked")),
        (arbiter.clone(), amount, new_balance),
    );
}

fn get_reputation_score(env: &Env, address: &Address) -> u32 {
    env.storage()
        .persistent()
        .get::<DataKey, UserProfile>(&DataKey::User(address.clone()))
        .map(|profile| profile.reputation_score)
        .unwrap_or(0)
}

/// Voting weight for an arbiter: their staked bond scaled by a reputation
/// multiplier of `10_000 + reputation_score * 100` bps. `reputation_score` is
/// clamped to `[0, 100]` (see `UserProfile::reputation_score`), so the
/// multiplier ranges from 1.0x at zero reputation up to 2.0x at a perfect
/// score — a bonus for a strong track record, never a penalty that could
/// zero out an otherwise-legitimate stake.
fn compute_arbiter_weight(env: &Env, arbiter: &Address, stake: i128) -> i128 {
    let reputation_score = get_reputation_score(env, arbiter);
    let multiplier_bps: i128 = 10_000_i128.saturating_add((reputation_score as i128).saturating_mul(100));
    stake.saturating_mul(multiplier_bps) / 10_000
}

fn emit_arbiters_assigned(env: &Env, market_id: u64, total_weight: i128, voting_deadline: u64) {
    env.events().publish(
        (symbol_short!("arb"), symbol_short!("assigned")),
        (market_id, total_weight, voting_deadline),
    );
}

/// Assign a weighted arbiter panel to a pending dispute (admin-only). Each
/// address in `arbiters` must have a positive `stake_as_arbiter` balance;
/// their voting weight is computed and snapshotted immediately (see
/// `compute_arbiter_weight`) so it is immune to any later change in their
/// stake or reputation. Can only be called once per dispute — the same
/// dispute record backs both the flat-majority and weighted-quorum paths, so
/// a panel is a one-way commitment for that dispute.
pub fn assign_arbiters(
    env: Env,
    admin: Address,
    market_id: u64,
    arbiters: Vec<Address>,
) -> Result<(), InsightArenaError> {
    config::ensure_not_paused(&env)?;
    require_admin(&env, &admin)?;

    let mut dispute: Dispute = env
        .storage()
        .persistent()
        .get(&DataKey::Dispute(market_id))
        .ok_or(InsightArenaError::DisputeNotFound)?;

    if !dispute.arbiters.is_empty() {
        // A panel has already been assigned to this dispute. Reuses
        // DisputeAlreadyFiled (error enum is at its 50-case cap).
        return Err(InsightArenaError::DisputeAlreadyFiled);
    }

    if arbiters.is_empty() {
        return Err(InsightArenaError::InvalidInput);
    }

    let mut assignments: Vec<ArbiterAssignment> = Vec::new(&env);
    let mut total_weight: i128 = 0;

    for arbiter in arbiters.iter() {
        for existing in assignments.iter() {
            if existing.arbiter == arbiter {
                // Duplicate address in the input list.
                return Err(InsightArenaError::InvalidInput);
            }
        }

        let stake = get_arbiter_stake(&env, &arbiter);
        if stake <= 0 {
            // Not an eligible arbiter - they must stake first.
            return Err(InsightArenaError::InvalidInput);
        }

        let weight = compute_arbiter_weight(&env, &arbiter, stake);
        total_weight = total_weight
            .checked_add(weight)
            .ok_or(InsightArenaError::Overflow)?;

        assignments.push_back(ArbiterAssignment {
            arbiter: arbiter.clone(),
            weight,
            voted: false,
            vote_uphold: false,
        });
    }

    let cfg = config::get_config(&env)?;
    let voting_deadline = env
        .ledger()
        .timestamp()
        .checked_add(cfg.arbiter_voting_period_seconds)
        .ok_or(InsightArenaError::Overflow)?;

    dispute.arbiters = assignments;
    dispute.quorum_bps = cfg.arbiter_quorum_bps;
    dispute.voting_deadline = voting_deadline;
    dispute.arbiters_finalized = false;

    env.storage()
        .persistent()
        .set(&DataKey::Dispute(market_id), &dispute);
    bump_dispute(&env, market_id);

    emit_arbiters_assigned(&env, market_id, total_weight, voting_deadline);

    Ok(())
}

fn emit_arbiter_voted(env: &Env, market_id: u64, arbiter: &Address, uphold: bool) {
    env.events().publish(
        (symbol_short!("arb"), symbol_short!("voted")),
        (market_id, arbiter.clone(), uphold),
    );
}

/// Cast a single vote as an assigned arbiter. Each arbiter gets exactly one
/// vote per dispute, must vote before `voting_deadline`, and cannot change
/// their vote once cast.
pub fn cast_arbiter_vote(
    env: Env,
    arbiter: Address,
    market_id: u64,
    uphold: bool,
) -> Result<(), InsightArenaError> {
    config::ensure_not_paused(&env)?;
    arbiter.require_auth();

    let mut dispute: Dispute = env
        .storage()
        .persistent()
        .get(&DataKey::Dispute(market_id))
        .ok_or(InsightArenaError::DisputeNotFound)?;

    if dispute.arbiters_finalized {
        return Err(InsightArenaError::MarketAlreadyResolved);
    }

    if env.ledger().timestamp() > dispute.voting_deadline {
        return Err(InsightArenaError::DisputeWindowClosed);
    }

    let mut index: Option<u32> = None;
    for i in 0..dispute.arbiters.len() {
        if dispute.arbiters.get(i).unwrap().arbiter == arbiter {
            index = Some(i);
            break;
        }
    }

    // Not a member of this dispute's panel. Reuses Unauthorized, consistent
    // with the role-check-failure convention documented on that variant.
    let i = index.ok_or(InsightArenaError::Unauthorized)?;

    let mut assignment = dispute.arbiters.get(i).unwrap();
    if assignment.voted {
        // Reuses AlreadyPredicted: the arbiter's one allowed vote on this
        // dispute has already been cast (error enum is at its 50-case cap).
        return Err(InsightArenaError::AlreadyPredicted);
    }

    assignment.voted = true;
    assignment.vote_uphold = uphold;
    dispute.arbiters.set(i, assignment);

    env.storage()
        .persistent()
        .set(&DataKey::Dispute(market_id), &dispute);
    bump_dispute(&env, market_id);

    emit_arbiter_voted(&env, market_id, &arbiter, uphold);

    Ok(())
}

fn build_tally(market_id: u64, dispute: &Dispute) -> ArbiterTally {
    let mut total_weight: i128 = 0;
    let mut voted_weight: i128 = 0;
    let mut uphold_weight: i128 = 0;
    let mut reject_weight: i128 = 0;

    for assignment in dispute.arbiters.iter() {
        total_weight = total_weight.saturating_add(assignment.weight);
        if assignment.voted {
            voted_weight = voted_weight.saturating_add(assignment.weight);
            if assignment.vote_uphold {
                uphold_weight = uphold_weight.saturating_add(assignment.weight);
            } else {
                reject_weight = reject_weight.saturating_add(assignment.weight);
            }
        }
    }

    let quorum_met = total_weight > 0
        && voted_weight.saturating_mul(10_000) >= total_weight.saturating_mul(dispute.quorum_bps as i128);

    ArbiterTally {
        market_id,
        total_weight,
        voted_weight,
        uphold_weight,
        reject_weight,
        quorum_bps: dispute.quorum_bps,
        quorum_met,
        voting_deadline: dispute.voting_deadline,
        finalized: dispute.arbiters_finalized,
        arbiters: dispute.arbiters.clone(),
    }
}

/// Read-only view of a dispute's arbiter panel: running tally, quorum
/// progress, and per-arbiter participation. Safe to call at any point after
/// a panel has been assigned, including after finalization (until the
/// dispute record itself is cleaned up, mirroring `get_dispute`).
pub fn get_arbiter_tally(env: Env, market_id: u64) -> Result<ArbiterTally, InsightArenaError> {
    let dispute: Dispute = env
        .storage()
        .persistent()
        .get(&DataKey::Dispute(market_id))
        .ok_or(InsightArenaError::DisputeNotFound)?;
    bump_dispute(&env, market_id);
    Ok(build_tally(market_id, &dispute))
}

fn count_voters(arbiters: &Vec<ArbiterAssignment>) -> i128 {
    let mut n: i128 = 0;
    for assignment in arbiters.iter() {
        if assignment.voted {
            n = n.saturating_add(1);
        }
    }
    n
}

/// Slash every non-voting arbiter's stake by `Config::arbiter_slash_bps` and
/// redistribute the total slashed amount to voting arbiters, proportional to
/// their weight. The last voter (in list order) absorbs the rounding
/// remainder, guaranteeing the redistributed total exactly equals the
/// slashed total.
fn slash_and_redistribute(env: &Env, arbiters: &Vec<ArbiterAssignment>) -> Result<(), InsightArenaError> {
    let cfg = config::get_config(env)?;
    let slash_bps = cfg.arbiter_slash_bps as i128;

    let mut voter_weight_total: i128 = 0;
    for assignment in arbiters.iter() {
        if assignment.voted {
            voter_weight_total = voter_weight_total.saturating_add(assignment.weight);
        }
    }

    // Can only be zero if no one voted, which finalize_arbiter_vote already
    // rules out via its quorum check (quorum_bps > 0 forces voted_weight >
    // 0). Guarded here anyway so this helper is safe to call standalone.
    if voter_weight_total == 0 {
        return Ok(());
    }

    let mut total_slashed: i128 = 0;
    for assignment in arbiters.iter() {
        if !assignment.voted {
            let stake = get_arbiter_stake(env, &assignment.arbiter);
            let slash_amount = stake.saturating_mul(slash_bps) / 10_000;
            if slash_amount > 0 {
                set_arbiter_stake(env, &assignment.arbiter, stake - slash_amount);
                total_slashed = total_slashed.saturating_add(slash_amount);
            }
        }
    }

    if total_slashed == 0 {
        return Ok(());
    }

    let total_voters = count_voters(arbiters);
    let mut voters_seen: i128 = 0;
    let mut distributed: i128 = 0;
    for assignment in arbiters.iter() {
        if !assignment.voted {
            continue;
        }
        voters_seen = voters_seen.saturating_add(1);
        let share = if voters_seen == total_voters {
            total_slashed - distributed
        } else {
            total_slashed.saturating_mul(assignment.weight) / voter_weight_total
        };
        if share > 0 {
            let stake = get_arbiter_stake(env, &assignment.arbiter);
            set_arbiter_stake(env, &assignment.arbiter, stake.saturating_add(share));
            distributed = distributed.saturating_add(share);
        }
    }

    emit_arbiters_slashed(env, total_slashed, distributed);

    Ok(())
}

fn emit_arbiters_slashed(env: &Env, total_slashed: i128, total_redistributed: i128) {
    env.events().publish(
        (symbol_short!("arb"), symbol_short!("slashed")),
        (total_slashed, total_redistributed),
    );
}

fn emit_arbiter_vote_finalized(
    env: &Env,
    market_id: u64,
    caller: &Address,
    uphold: bool,
    total_weight: i128,
    voted_weight: i128,
) {
    env.events().publish(
        (symbol_short!("arb"), symbol_short!("final")),
        (market_id, caller.clone(), uphold, total_weight, voted_weight),
    );
}

/// Finalize a dispute's arbiter panel (admin-only). Requires both:
/// - the voting window to have closed (`now >= voting_deadline`), and
/// - assigned weight meeting or exceeding quorum to have voted.
///
/// Either condition failing reuses `TimelockNotElapsed` (error enum is at
/// its 50-case cap) — both cases mean "the panel isn't ready to settle yet".
///
/// On success: non-voters are slashed and redistributed to voters (see
/// `slash_and_redistribute`), then the dispute is settled exactly like
/// `resolve_dispute` — uphold refunds the disputer's bond and reopens the
/// market, reject slashes the disputer's bond. Ties (`uphold_weight ==
/// reject_weight`) resolve to reject, preserving the original market
/// resolution as the safe default. Reputation deltas are applied to both
/// the disputer and the market creator based on the outcome.
pub fn finalize_arbiter_vote(
    env: Env,
    caller: Address,
    market_id: u64,
) -> Result<(), InsightArenaError> {
    config::ensure_not_paused(&env)?;
    require_admin(&env, &caller)?;

    let mut dispute: Dispute = env
        .storage()
        .persistent()
        .get(&DataKey::Dispute(market_id))
        .ok_or(InsightArenaError::DisputeNotFound)?;

    if dispute.arbiters.is_empty() {
        // No panel was ever assigned to this dispute.
        return Err(InsightArenaError::InvalidInput);
    }

    // Guard against double-resolution (reuses ZeroShareTransfer)
    if dispute.is_resolved {
        return Err(InsightArenaError::ZeroShareTransfer);
    }

    let now = env.ledger().timestamp();
    let tally = build_tally(market_id, &dispute);

    if now < dispute.voting_deadline || !tally.quorum_met {
        return Err(InsightArenaError::TimelockNotElapsed);
    }

    slash_and_redistribute(&env, &dispute.arbiters)?;

    let uphold = tally.uphold_weight > tally.reject_weight;

    // Mark as resolved before any state changes
    dispute.is_resolved = true;
    dispute.resolution_upheld = Some(uphold);
    env.storage()
        .persistent()
        .set(&DataKey::Dispute(market_id), &dispute);
    bump_dispute(&env, market_id);

    if uphold {
        // Disputer wins: refund their bond in full, reopen market
        escrow::distribute_slashed_bond(&env, Some(&dispute.disputer), dispute.bond, dispute.bond)?;

        let mut market = market::get_market(&env, market_id)?;
        market.is_resolved = false;
        market.resolved_outcome = None;
        market.resolved_at = None;
        env.storage()
            .persistent()
            .set(&DataKey::Market(market_id), &market);
        config::extend_active_market_ttl(&env, market_id);

        // Reputation impact: market creator gets additional penalty
        reputation::on_dispute_upheld(&env, &market.creator);
    } else {
        // Disputer loses: slash their bond
        escrow::distribute_slashed_bond(&env, None, 0, dispute.bond)?;

        // Reputation impact: disputer gets penalty for frivolous dispute
        reputation::on_dispute_rejected(&env, &dispute.disputer);
    }

    // Settle any staked oracle submission for this market, mirroring
    // resolve_dispute's handling.
    settle_oracle_submission(&env, market_id, uphold)?;

    // Remove market_id from the active dispute list, mirroring
    // resolve_dispute's cleanup.
    let active_list: Vec<u64> = env
        .storage()
        .persistent()
        .get(&DataKey::ActiveDisputeList)
        .unwrap_or_else(|| Vec::new(&env));
    let mut new_list: Vec<u64> = Vec::new(&env);
    for id in active_list.iter() {
        if id != market_id {
            new_list.push_back(id);
        }
    }
    env.storage()
        .persistent()
        .set(&DataKey::ActiveDisputeList, &new_list);
    bump_active_dispute_list(&env);

    env.storage()
        .persistent()
        .remove(&DataKey::Dispute(market_id));

    let current_count = get_open_dispute_count(&env);
    if current_count > 0 {
        set_open_dispute_count(&env, current_count - 1);
    }

    emit_arbiter_vote_finalized(
        &env,
        market_id,
        &caller,
        uphold,
        tally.total_weight,
        tally.voted_weight,
    );

    Ok(())
}

// ── Oracle Submission Staking ─────────────────────────────────────────────────
//
// An oracle bonds a stake when it submits a market resolution. The stake is
// held through the market's post-resolution dispute window and settled
// exactly once:
// - if a dispute is raised and ultimately upholds (the resolution was wrong),
//   the stake is slashed via `settle_oracle_submission`, called from the two
//   terminal dispute-settlement paths (`resolve_dispute`, `finalize_arbiter_vote`);
// - otherwise (no dispute is ever raised, or one is raised and rejected) the
//   stake is returned to the oracle plus a reward, either via those same
//   settlement paths or, if no dispute was ever filed, via `claim_oracle_stake`
//   once the dispute window has elapsed.
//
// Keyed by a raw `(Symbol, u64)` tuple rather than a `DataKey` variant, since
// `DataKey` is already at its 50-variant XDR cap (see
// `reputation::trusted_creator_key` for the established precedent).

fn oracle_submission_key(market_id: u64) -> (Symbol, u64) {
    (symbol_short!("oracsub"), market_id)
}

fn get_oracle_submission(env: &Env, market_id: u64) -> Option<OracleSubmission> {
    env.storage().persistent().get(&oracle_submission_key(market_id))
}

fn store_oracle_submission(env: &Env, submission: &OracleSubmission) {
    let key = oracle_submission_key(submission.market_id);
    env.storage().persistent().set(&key, submission);
    env.storage()
        .persistent()
        .extend_ttl(&key, config::PERSISTENT_THRESHOLD, config::PERSISTENT_BUMP);
}

fn emit_oracle_submission_staked(env: &Env, market_id: u64, oracle: &Address, stake_amount: i128) {
    env.events().publish(
        (symbol_short!("orac"), symbol_short!("staked")),
        (market_id, oracle.clone(), stake_amount),
    );
}

fn emit_oracle_stake_slashed(env: &Env, market_id: u64, oracle: &Address, stake_amount: i128) {
    env.events().publish(
        (symbol_short!("orac"), symbol_short!("slashed")),
        (market_id, oracle.clone(), stake_amount),
    );
}

fn emit_oracle_stake_returned(
    env: &Env,
    market_id: u64,
    oracle: &Address,
    stake_amount: i128,
    reward: i128,
) {
    env.events().publish(
        (symbol_short!("orac"), symbol_short!("returned")),
        (market_id, oracle.clone(), stake_amount, reward),
    );
}

/// Submit a market resolution backed by a locked oracle stake.
///
/// Wraps `market::resolve_market` with a mandatory bond: the configured
/// `Config::oracle_stake_amount` is transferred from the oracle into escrow
/// before the resolution is recorded. If the oracle cannot cover that
/// transfer, the whole call reverts (the `Submission reverts without the
/// required stake` acceptance criterion) — no separate balance check is
/// needed since `escrow::lock_stake` fails the transaction directly.
///
/// # Errors
/// - `Unauthorized` if `oracle` is not the configured oracle address.
/// - `DisputeAlreadyFiled` — reused to mean a staked submission already
///   exists for this market (error enum is at its 50-case cap).
/// - `InvalidInput` if `Config::oracle_stake_amount` is non-positive.
/// - Propagates any error from `escrow::lock_stake` or `market::resolve_market`.
pub fn submit_resolution_with_stake(
    env: Env,
    oracle: Address,
    market_id: u64,
    resolved_outcome: Symbol,
) -> Result<(), InsightArenaError> {
    config::ensure_not_paused(&env)?;
    oracle.require_auth();

    let cfg = config::get_config(&env)?;
    if oracle != cfg.oracle_address {
        return Err(InsightArenaError::Unauthorized);
    }

    // Block only while a submission is still pending settlement. A settled
    // record means either the prior submission was slashed and the dispute
    // reopened this market (`resolve_dispute` / `finalize_arbiter_vote` with
    // `uphold = true`) — in which case a fresh resolution with a fresh stake
    // must be submittable — or it already paid out, in which case
    // `market::resolve_market`'s own `MarketAlreadyResolved` guard below
    // handles rejection.
    if let Some(existing) = get_oracle_submission(&env, market_id) {
        if !existing.settled {
            return Err(InsightArenaError::DisputeAlreadyFiled);
        }
    }

    if cfg.oracle_stake_amount <= 0 {
        return Err(InsightArenaError::InvalidInput);
    }

    escrow::lock_stake(&env, &oracle, cfg.oracle_stake_amount)?;

    market::resolve_market(env.clone(), oracle.clone(), market_id, resolved_outcome)?;

    let now = env.ledger().timestamp();
    store_oracle_submission(
        &env,
        &OracleSubmission {
            market_id,
            oracle: oracle.clone(),
            stake_amount: cfg.oracle_stake_amount,
            submitted_at: now,
            settled: false,
        },
    );

    emit_oracle_submission_staked(&env, market_id, &oracle, cfg.oracle_stake_amount);

    Ok(())
}

/// Settle a market's staked oracle submission exactly once: slash it if
/// `uphold` is true (the dispute overturned the resolution), otherwise
/// refund the stake plus a reward capped at the live treasury balance. A
/// no-op if this market never had a staked submission, or it was already
/// settled — safe to call unconditionally from every terminal dispute path.
fn settle_oracle_submission(env: &Env, market_id: u64, uphold: bool) -> Result<(), InsightArenaError> {
    let Some(mut submission) = get_oracle_submission(env, market_id) else {
        return Ok(());
    };
    if submission.settled {
        return Ok(());
    }

    if uphold {
        escrow::slash_funds(env, submission.stake_amount)?;
        emit_oracle_stake_slashed(env, market_id, &submission.oracle, submission.stake_amount);
    } else {
        escrow::refund(env, &submission.oracle, submission.stake_amount)?;

        let cfg = config::get_config(env)?;
        let treasury_balance = escrow::get_treasury_balance(env);
        let reward = submission
            .stake_amount
            .saturating_mul(cfg.oracle_reward_bps as i128)
            / 10_000;
        let reward = reward.min(treasury_balance).max(0);
        if reward > 0 {
            escrow::pay_oracle_reward(env, &submission.oracle, reward)?;
        }

        emit_oracle_stake_returned(env, market_id, &submission.oracle, submission.stake_amount, reward);
    }

    submission.settled = true;
    store_oracle_submission(env, &submission);

    Ok(())
}

/// Claim a staked oracle submission's stake plus reward when no dispute was
/// ever filed and the market's dispute window has elapsed. Callable by
/// anyone (the payout always goes to the recorded oracle address, not the
/// caller), mirroring the permissionless style of `market::extend_market_ttl`.
///
/// For markets that *were* disputed, settlement happens automatically inside
/// `resolve_dispute` / `finalize_arbiter_vote` instead — this entrypoint
/// exists only for the undisputed path.
///
/// # Errors
/// - `DisputeNotFound` — reused to mean no staked submission exists for this
///   market (error enum is at its 50-case cap).
/// - `RefundAlreadyClaimed` — reused to mean this submission was already
///   settled.
/// - `DisputeAlreadyFiled` — reused to mean an active dispute still exists
///   for this market; it must resolve first via `resolve_dispute` /
///   `finalize_arbiter_vote`, which settles the stake automatically.
/// - `TimelockNotElapsed` if the dispute window has not yet closed.
pub fn claim_oracle_stake(env: Env, market_id: u64) -> Result<(), InsightArenaError> {
    config::ensure_not_paused(&env)?;

    let submission = get_oracle_submission(&env, market_id).ok_or(InsightArenaError::DisputeNotFound)?;
    if submission.settled {
        return Err(InsightArenaError::RefundAlreadyClaimed);
    }

    if env.storage().persistent().has(&DataKey::Dispute(market_id)) {
        return Err(InsightArenaError::DisputeAlreadyFiled);
    }

    let market = market::get_market(&env, market_id)?;
    let resolved_at = market
        .resolved_at
        .ok_or(InsightArenaError::MarketNotResolved)?;
    let deadline = resolved_at
        .checked_add(market.dispute_window)
        .ok_or(InsightArenaError::Overflow)?;
    if env.ledger().timestamp() <= deadline {
        return Err(InsightArenaError::TimelockNotElapsed);
    }

    settle_oracle_submission(&env, market_id, false)
}

/// Read-only lookup of a market's staked oracle submission, if any.
pub fn get_oracle_submission_info(env: Env, market_id: u64) -> Option<OracleSubmission> {
    get_oracle_submission(&env, market_id)
}
