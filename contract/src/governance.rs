use soroban_sdk::{contracttype, symbol_short, Address, Env, Symbol, Vec};

use crate::config;
use crate::errors::InsightArenaError;
use crate::storage_types::DataKey;
use crate::{oracle, Config};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ProposalType {
    UpdateProtocolFee(u32),
    UpdateOracle(Address),
    UpdateMinStake(i128),
    AddSupportedCategory(Symbol),
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

pub fn execute_proposal(
    env: &Env,
    executor: Address,
    proposal_id: u32,
) -> Result<(), InsightArenaError> {
    config::ensure_not_paused(env)?;
    executor.require_auth();

    let mut proposal = load_proposal(env, proposal_id)?;
    if proposal.executed || env.ledger().timestamp() < proposal.voting_end {
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

    let summary = match proposal.proposal_type.clone() {
        ProposalType::UpdateProtocolFee(bps) => {
            config::update_protocol_fee_from_governance(env, bps)?;
            symbol_short!("fee")
        }
        ProposalType::UpdateOracle(addr) => {
            oracle::update_oracle_from_governance(env, addr)?;
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
    };

    proposal.executed = true;
    store_proposal(env, &proposal);
    emit_proposal_executed(env, proposal_id, summary);
    Ok(())
}
