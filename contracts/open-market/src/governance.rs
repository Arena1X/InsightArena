use soroban_sdk::{contracttype, symbol_short, Address, Env, Symbol, Vec};

use crate::config;
use crate::errors::InsightArenaError;
use crate::market;
use crate::reputation;
use crate::storage_types::{DataKey, ProposalState};
use crate::Config;

/// Parameter changes a passed governance proposal may apply.
///
/// Notably absent: anything touching `Config::timelock_delay` or
/// `Config::guardian`. Those are intentionally admin-only (see
/// `config::set_timelock_delay` / `config::set_guardian`) so that no
/// proposal can ever vote itself a shorter timelock or a friendlier
/// guardian to bypass the veto safety net.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ProposalType {
    UpdateProtocolFee(u32),
    UpdateOracle(Address),
    UpdateMinStake(i128),
    AddSupportedCategory(Symbol),
    /// Governance-timelocked update of `Config::min_creator_reputation`, the
    /// minimum score required to create a market (0-1000).
    UpdateMinReputation(u32),
    /// Governance-timelocked addition of an address to the trusted-creator
    /// allowlist, exempting it from the minimum-reputation gate.
    AddTrustedCreator(Address),
    /// Governance-timelocked removal of an address from the trusted-creator
    /// allowlist.
    RemoveTrustedCreator(Address),
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Proposal {
    pub proposal_id: u32,
    pub proposer: Address,
    pub proposal_type: ProposalType,
    pub votes_for: u32,
    pub votes_against: u32,
    pub created_at: u64,
    pub voting_end: u64,
    pub executed: bool,
    pub cancelled: bool,
    /// Set once voting has passed quorum/majority: `now + timelock_delay` at
    /// that moment. `None` while still voting (or if it never passed).
    pub ready_at: Option<u64>,
    /// Set by the guardian during the timelock window; blocks execution.
    pub vetoed: bool,
}



fn load_registered_users(env: &Env) -> Vec<Address> {
    env.storage()
        .persistent()
        .get(&DataKey::UserList)
        .unwrap_or_else(|| Vec::new(env))
}

fn load_categories(env: &Env) -> Vec<Symbol> {
    env.storage()
        .instance()
        .get(&DataKey::Categories)
        .unwrap_or_else(|| config::default_categories(env))
}

fn store_categories(env: &Env, categories: &Vec<Symbol>) {
    env.storage()
        .instance()
        .set(&DataKey::Categories, categories);
}

fn load_proposal(env: &Env, proposal_id: u32) -> Result<Proposal, InsightArenaError> {
    env.storage()
        .persistent()
        .get(&DataKey::Proposal(proposal_id))
        .ok_or(InsightArenaError::InvalidInput)
}

fn store_proposal(env: &Env, proposal: &Proposal) {
    env.storage()
        .persistent()
        .set(&DataKey::Proposal(proposal.proposal_id), proposal);
}

fn proposal_quorum(total_users: u32) -> u32 {
    // 10% quorum, rounded up; minimum 1 to avoid auto-pass with zero participation.
    let rounded = total_users.saturating_add(9) / 10;
    if rounded == 0 {
        1
    } else {
        rounded
    }
}

fn emit_proposal_executed(env: &Env, proposal_id: u32, summary: Symbol) {
    env.events().publish(
        (symbol_short!("gov"), symbol_short!("executed")),
        (proposal_id, summary),
    );
}

fn emit_proposal_cancelled(env: &Env, proposal_id: u32) {
    env.events().publish(
        (symbol_short!("gov"), symbol_short!("canceld")),
        proposal_id,
    );
}

fn emit_proposal_queued(env: &Env, proposal_id: u32, ready_at: u64) {
    env.events().publish(
        (symbol_short!("gov"), symbol_short!("queued")),
        (proposal_id, ready_at),
    );
}

fn emit_proposal_vetoed(env: &Env, proposal_id: u32) {
    env.events()
        .publish((symbol_short!("gov"), symbol_short!("vetoed")), proposal_id);
}

pub fn create_proposal(
    env: &Env,
    proposer: Address,
    proposal_type: ProposalType,
    voting_duration: u64,
) -> Result<u32, InsightArenaError> {
    config::ensure_not_paused(env)?;
    proposer.require_auth();

    if voting_duration == 0 {
        return Err(InsightArenaError::InvalidInput);
    }

    let next_id = env
        .storage()
        .persistent()
        .get::<DataKey, u32>(&DataKey::ProposalCount)
        .unwrap_or(0)
        .checked_add(1)
        .ok_or(InsightArenaError::Overflow)?;

    let created_at = env.ledger().timestamp();
    let voting_end = created_at
        .checked_add(voting_duration)
        .ok_or(InsightArenaError::Overflow)?;

    let proposal = Proposal {
        proposal_id: next_id,
        proposer,
        proposal_type,
        votes_for: 0,
        votes_against: 0,
        created_at,
        voting_end,
        executed: false,
        cancelled: false,
        ready_at: None,
        vetoed: false,
    };


    env.storage()
        .persistent()
        .set(&DataKey::ProposalCount, &next_id);
    store_proposal(env, &proposal);
    Ok(next_id)
}

pub fn vote(
    env: &Env,
    voter: Address,
    proposal_id: u32,
    vote_for: bool,
) -> Result<(), InsightArenaError> {
    config::ensure_not_paused(env)?;
    voter.require_auth();

    let mut proposal = load_proposal(env, proposal_id)?;
    if proposal.executed || env.ledger().timestamp() > proposal.voting_end {
        return Err(InsightArenaError::InvalidInput);
    }



    let vote_key = DataKey::ProposalVote(proposal_id, voter.clone());
    if env.storage().persistent().has(&vote_key) {
        return Err(InsightArenaError::InvalidInput);
    }

    if vote_for {
        proposal.votes_for = proposal
            .votes_for
            .checked_add(1)
            .ok_or(InsightArenaError::Overflow)?;
    } else {
        proposal.votes_against = proposal
            .votes_against
            .checked_add(1)
            .ok_or(InsightArenaError::Overflow)?;
    }

    env.storage().persistent().set(&vote_key, &true);
    store_proposal(env, &proposal);
    Ok(())
}

/// Execute a passed proposal, subject to the governance timelock.
///
/// A contract call that returns `Err` reverts every write it made, so
/// "queue" and "execute" cannot share one call the way a single fallthrough
/// function would suggest: this needs two separate calls to `execute_proposal`.
/// The first call after voting ends does the "queueing": if quorum and
/// majority were met, it records `ready_at = now + timelock_delay` and
/// returns `Ok(())`, persisting the queued state. Any call made before
/// `ready_at` (including a queued proposal's own queuing check re-run) then
/// returns `TimelockNotElapsed`. Once `ready_at` is reached, a further call
/// actually applies the effect.
pub fn execute_proposal(
    env: &Env,
    executor: Address,
    proposal_id: u32,
) -> Result<(), InsightArenaError> {
    config::ensure_not_paused(env)?;
    executor.require_auth();

    let mut proposal = load_proposal(env, proposal_id)?;

    if proposal.executed || proposal.cancelled || proposal.vetoed {
        return Err(InsightArenaError::InvalidInput);
    }

    let now = env.ledger().timestamp();

    if proposal.ready_at.is_none() {
        if now < proposal.voting_end {
            return Err(InsightArenaError::InvalidInput);
        }

        let users = load_registered_users(env);
        let total_users = users.len();
        let total_votes = proposal
            .votes_for
            .checked_add(proposal.votes_against)
            .ok_or(InsightArenaError::Overflow)?;

        let quorum = proposal_quorum(total_users);
        if total_votes < quorum || proposal.votes_for <= proposal.votes_against {
            return Err(InsightArenaError::Unauthorized);
        }

        let cfg = config::get_config(env)?;
        let ready_at = now
            .checked_add(cfg.timelock_delay)
            .ok_or(InsightArenaError::Overflow)?;
        proposal.ready_at = Some(ready_at);
        store_proposal(env, &proposal);
        emit_proposal_queued(env, proposal_id, ready_at);

        // Persist the queued state now — a subsequent call re-checks readiness.
        return Ok(());
    }

    let ready_at = proposal.ready_at.unwrap();
    if now < ready_at {
        return Err(InsightArenaError::TimelockNotElapsed);
    }

    let summary = match proposal.proposal_type.clone() {
        ProposalType::UpdateProtocolFee(bps) => {
            config::update_protocol_fee_from_governance(env, bps)?;
            symbol_short!("fee")
        }
        ProposalType::UpdateOracle(addr) => {
            market::update_oracle_from_governance(env, addr)?;
            symbol_short!("oracle")
        }
        ProposalType::UpdateMinStake(amount) => {
            if amount <= 0 {
                return Err(InsightArenaError::InvalidInput);
            }
            let mut cfg: Config = env
                .storage()
                .persistent()
                .get(&DataKey::Config)
                .ok_or(InsightArenaError::NotInitialized)?;
            cfg.min_stake_xlm = amount;
            env.storage().persistent().set(&DataKey::Config, &cfg);
            symbol_short!("minstk")
        }
        ProposalType::AddSupportedCategory(sym) => {
            let mut categories = load_categories(env);
            if !categories.contains(sym.clone()) {
                categories.push_back(sym);
                store_categories(env, &categories);
            }
            symbol_short!("cat")
        }
        ProposalType::UpdateMinReputation(threshold) => {
            config::update_min_reputation_from_governance(env, threshold)?;
            symbol_short!("minrep")
        }
        ProposalType::AddTrustedCreator(addr) => {
            reputation::add_trusted_creator_from_governance(env, addr)?;
            symbol_short!("trstadd")
        }
        ProposalType::RemoveTrustedCreator(addr) => {
            reputation::remove_trusted_creator_from_governance(env, addr)?;
            symbol_short!("trstrem")
        }
    };

    proposal.executed = true;
    store_proposal(env, &proposal);
    emit_proposal_executed(env, proposal_id, summary);
    Ok(())
}

/// Cancel a proposal before it is executed.
///
/// Only the original proposer or the platform admin may cancel. Proposals that
/// have already been executed, vetoed, or cancelled cannot be cancelled again.
pub fn cancel_proposal(
    env: &Env,
    caller: Address,
    proposal_id: u32,
) -> Result<(), InsightArenaError> {
    caller.require_auth();

    let mut proposal = load_proposal(env, proposal_id)?;

    if proposal.executed || proposal.cancelled || proposal.vetoed {
        return Err(InsightArenaError::InvalidInput);
    }


    let cfg = config::get_config(env)?;
    if caller != proposal.proposer && caller != cfg.admin {
        return Err(InsightArenaError::Unauthorized);
    }

    proposal.cancelled = true;
    store_proposal(env, &proposal);

    emit_proposal_cancelled(env, proposal_id);


    Ok(())
}

/// Guardian-only veto of a queued proposal, valid any time between it entering
/// the queue (`ready_at` set) and it actually being executed. Once executed,
/// cancelled, or already vetoed, this errors rather than re-applying the veto.
pub fn veto_proposal(
    env: &Env,
    guardian: Address,
    proposal_id: u32,
) -> Result<(), InsightArenaError> {
    config::ensure_not_paused(env)?;
    guardian.require_auth();

    let cfg = config::get_config(env)?;
    if guardian != cfg.guardian {
        return Err(InsightArenaError::Unauthorized);
    }

    let mut proposal = load_proposal(env, proposal_id)?;

    if proposal.executed || proposal.cancelled || proposal.vetoed {
        return Err(InsightArenaError::InvalidInput);
    }

    // Nothing queued yet — vetoing only applies to the timelock window.
    if proposal.ready_at.is_none() {
        return Err(InsightArenaError::InvalidInput);
    }

    proposal.vetoed = true;
    store_proposal(env, &proposal);

    emit_proposal_vetoed(env, proposal_id);

    Ok(())
}

/// Derive the current lifecycle state of a proposal from its stored flags and
/// the ledger clock. See [`ProposalState`] for the full transition diagram.
pub fn get_proposal_state(
    env: &Env,
    proposal_id: u32,
) -> Result<ProposalState, InsightArenaError> {
    let proposal = load_proposal(env, proposal_id)?;

    if proposal.executed {
        return Ok(ProposalState::Executed);
    }
    if proposal.vetoed {
        return Ok(ProposalState::Vetoed);
    }
    if proposal.cancelled {
        return Ok(ProposalState::Cancelled);
    }

    Ok(match proposal.ready_at {
        Some(ready_at) if env.ledger().timestamp() >= ready_at => ProposalState::Executable,
        Some(_) => ProposalState::Queued,
        None => ProposalState::Voting,
    })
}

/// Return a single proposal by ID, extending its TTL on read.
pub fn get_proposal(env: &Env, proposal_id: u32) -> Result<Proposal, InsightArenaError> {
    let proposal = load_proposal(env, proposal_id)?;
    env.storage().persistent().extend_ttl(
        &DataKey::Proposal(proposal_id),
        crate::config::PERSISTENT_THRESHOLD,
        crate::config::PERSISTENT_BUMP,
    );
    Ok(proposal)
}

/// Return a paginated slice of proposals in creation order.
///
/// - `start` is the 1-based proposal ID to begin from (inclusive).
/// - `limit` is capped at 50 to bound simulation cost.
/// - Proposals missing from storage are silently skipped.
/// - Returns an empty `Vec` when no proposals exist or `start` exceeds the count.
pub fn list_proposals(env: &Env, start: u32, limit: u32) -> Vec<Proposal> {
    const MAX_LIMIT: u32 = 50;
    let effective_limit = if limit > MAX_LIMIT { MAX_LIMIT } else { limit };

    let total: u32 = env
        .storage()
        .persistent()
        .get::<DataKey, u32>(&DataKey::ProposalCount)
        .unwrap_or(0);

    let mut result: Vec<Proposal> = Vec::new(env);

    if start == 0 || start > total || effective_limit == 0 {
        return result;
    }

    let end = total.min(start.saturating_add(effective_limit).saturating_sub(1));
    let mut id = start;

    while id <= end {
        if let Some(proposal) = env
            .storage()
            .persistent()
            .get::<DataKey, Proposal>(&DataKey::Proposal(id))
        {
            result.push_back(proposal);
        }
        id += 1;
    }

    result
}
