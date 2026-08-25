//! Prize-pool finalization, staged claims, and no-show clawback (#1312).
//!
//! Once an event has ended and every match is resolved, [`finalize_event`]
//! ranks participants and splits the escrowed prize pool according to the
//! event's `reward_distribution` — but instead of transferring winnings
//! immediately, it records a per-winner [`PrizeAllocation`] with a claim
//! deadline. Winners settle their own allocation via [`claim_prize`]; any
//! allocation still unclaimed once the deadline passes may be swept to
//! treasury via [`clawback_unclaimed`]. `finalize_event` remains
//! **permissionless**: anyone may call it once all conditions are met,
//! mirroring the old `verify_event_winners` entry point.

use soroban_sdk::{Address, Env, Symbol, Vec};

use crate::admin;
use crate::event::{self, EventError};
use crate::fee;
use crate::leaderboard;
use crate::storage::{self, TTL_LEDGERS};
use crate::storage_types::{
    CreatorVestingSchedule, DataKey, FinalizationBond, PrizeAllocation, CLAIM_PERIOD_SECONDS,
    FINALIZATION_BOND_STROOPS, FINALIZATION_CHALLENGE_WINDOW_SECONDS,
};
use crate::token::TokenHelper;

// ---------------------------------------------------------------------------
// finalize_event
// ---------------------------------------------------------------------------

/// Rank participants, split the prize pool, and stage per-winner allocations.
///
/// `caller.require_auth()` is enforced but the call is otherwise permissionless:
/// anyone may finalize an event once its conditions are met. The caller must
/// lock [`FINALIZATION_BOND_STROOPS`]; the bond is held for
/// [`FINALIZATION_CHALLENGE_WINDOW_SECONDS`] and is either returned via
/// [`settle_finalization_bond`] or fully slashed to treasury via
/// [`crate::verification::challenge_finalization`].
///
/// # Checks (in order)
/// 1. Contract not paused ([`EventError::Paused`]).
/// 2. Event exists ([`EventError::EventNotFound`]).
/// 3. Event not cancelled ([`EventError::EventCancelled`]).
/// 4. Event not already finalized ([`EventError::AlreadyFinalized`]).
/// 5. Event has ended — `now >= end_time` ([`EventError::EventNotEnded`]).
/// 6. Every match resolved — each match's `result_submitted == true`
///    ([`EventError::MatchesNotComplete`]).
/// 7. Caller can lock the required finalization bond ([`EventError::BondRequired`]).
///
/// # Payout
/// The leaderboard ([`leaderboard::get_event_leaderboard`]) is fully
/// deterministic (points → exact_scores → earliest prediction → address), so
/// there are **no shared ranks**: every participant has a distinct rank and
/// therefore a distinct (possibly zero) payout. There is intentionally no
/// "split the rank" logic here — determinism is handled upstream.
///
/// For each paid rank `i` in `0..n.min(leaderboard.len())` (where
/// `n = reward_distribution.len()`):
/// `amount = prize_pool * reward_distribution[i] / 100`. Rather than
/// transferring this amount immediately, a [`PrizeAllocation`] is recorded
/// under [`DataKey::PrizeAllocation`] for `leaderboard[i].user` — the winner
/// must call [`claim_prize`] to receive it. This is what enables
/// [`clawback_unclaimed`] to reclaim allocations nobody ever claims.
///
/// Any leftover — the unallocated percentage when there are fewer participants
/// than reward ranks, plus integer-division dust — is sent to `event.creator`
/// immediately, in a single transfer (`prize_pool - total_distributed`). With
/// zero participants the entire prize pool is refunded to the creator. This
/// creator refund is not staged: only winner allocations go through
/// claim/clawback.
///
/// On success the event is marked `is_finalized`, the payout vector is stored
/// under [`DataKey::EventPayouts`] for historical queries, the claim deadline
/// (`now + CLAIM_PERIOD_SECONDS`) is stored under [`DataKey::ClaimDeadline`],
/// a `(event, finalized)` event is emitted with
/// `(event_id, winners_paid, total_distributed)`, and the payout vector
/// (allocated amounts, not yet transferred) is returned.
pub fn finalize_event(
    env: &Env,
    caller: Address,
    event_id: u64,
) -> Result<Vec<(Address, i128)>, EventError> {
    // Permissionless: anyone may trigger payout, but they must authorize.
    caller.require_auth();

    // 1. Not paused.
    if admin::is_paused(env) {
        return Err(EventError::Paused);
    }

    // 2. Event exists.
    let mut event = event::get_event(env, event_id)?;

    // 3. Not cancelled.
    if event.is_cancelled {
        return Err(EventError::EventCancelled);
    }

    // 4. Not already finalized.
    if event.is_finalized {
        return Err(EventError::AlreadyFinalized);
    }

    // 5. Event has ended.
    let now = env.ledger().timestamp();
    if !event.has_ended(now) {
        return Err(EventError::EventNotEnded);
    }

    // 6. Every match resolved.
    let match_ids = storage::get_event_matches(env, event_id);
    for match_id in match_ids.iter() {
        match storage::get_match(env, match_id) {
            Ok(m) => {
                if !m.result_submitted {
                    return Err(EventError::MatchesNotComplete);
                }
            }
            // A missing match record is treated as unresolved.
            Err(_) => return Err(EventError::MatchesNotComplete),
        }
    }

    // 7. Lock the required finalization bond before any payout mutation.
    let xlm_token = admin::get_xlm_token(env).unwrap_or_else(|| panic!("not_initialized"));
    if !TokenHelper::has_sufficient_balance(env, &xlm_token, &caller, FINALIZATION_BOND_STROOPS) {
        return Err(EventError::BondRequired);
    }
    // Direct transfer (caller already authorized above) — same pattern as
    // create_event fee/prize escrow, so no separate allowance is required.
    soroban_sdk::token::Client::new(env, &xlm_token).transfer(
        &caller,
        &env.current_contract_address(),
        &FINALIZATION_BOND_STROOPS,
    );

    storage::set_finalization_bond(
        env,
        &FinalizationBond {
            event_id,
            finalizer: caller.clone(),
            bond: FINALIZATION_BOND_STROOPS,
            finalized_at: now,
            challenged: false,
            settled: false,
        },
    );

    env.events().publish(
        (Symbol::new(env, "event"), Symbol::new(env, "bond_locked")),
        (event_id, caller.clone(), FINALIZATION_BOND_STROOPS),
    );

    // Recompute and persist the final weighted standings snapshot (#1311).
    // Every match is resolved at this point, so this stores the definitive
    // end-of-event standings. Payouts below intentionally remain driven by the
    // points leaderboard.
    leaderboard::recompute_standings(env, event_id).map_err(|_| EventError::EventNotFound)?;

    // Ranked, deterministic leaderboard. The event was already loaded above, so
    // the only residual error path here is an (effectively unreachable) points
    // overflow; collapse it onto EventNotFound to stay within EventError.
    let leaderboard =
        leaderboard::get_event_leaderboard(env, event_id).map_err(|_| EventError::EventNotFound)?;

    let prize_pool = event.prize_pool;
    let n = event.reward_distribution.len();
    let paid_ranks = n.min(leaderboard.len());

    let mut payouts: Vec<(Address, i128)> = Vec::new(env);
    let mut total_distributed: i128 = 0;

    for i in 0..paid_ranks {
        let percent = event.reward_distribution.get(i).unwrap();
        let entry = leaderboard.get(i).unwrap();
        let amount = prize_pool * percent as i128 / 100;

        // Skip zero-value allocations (nothing to claim), but still record
        // the rank so the snapshot reflects every paid position.
        if amount > 0 {
            storage::set_prize_allocation(
                env,
                &PrizeAllocation {
                    winner: entry.user.clone(),
                    event_id,
                    amount,
                    claimed: false,
                },
            );
            total_distributed += amount;
        }

        payouts.push_back((entry.user.clone(), amount));
    }

    // The unallocated percentage + integer-division dust goes to the creator
    // (the full prize pool with zero participants). Per the configured
    // creator-vesting share, a portion is paid immediately and the rest is
    // staged into a linear vesting schedule instead of transferred outright,
    // giving the creator an ongoing stake in the event's dispute outcome.
    let refund_to_creator = prize_pool - total_distributed;
    if refund_to_creator > 0 {
        let vest_share_bps = fee::get_creator_vest_share_bps(env) as i128;
        let vested_amount = refund_to_creator * vest_share_bps / 10_000;
        let immediate_amount = refund_to_creator - vested_amount;

        if immediate_amount > 0 {
            TokenHelper::distribute_winnings(env, &xlm_token, &event.creator, immediate_amount)
                .map_err(|_| EventError::TransferFailed)?;
        }

        if vested_amount > 0 {
            let vesting_period = fee::get_creator_vesting_period_seconds(env);
            let schedule = CreatorVestingSchedule {
                creator: event.creator.clone(),
                event_id,
                total_amount: vested_amount,
                claimed_amount: 0,
                forfeited_amount: 0,
                start_time: now,
                unlock_time: now.saturating_add(vesting_period),
                settled: false,
            };
            storage::set_creator_vesting(env, &schedule);

            env.events().publish(
                (
                    Symbol::new(env, "creator"),
                    Symbol::new(env, "vesting_scheduled"),
                ),
                (
                    event_id,
                    event.creator.clone(),
                    vested_amount,
                    schedule.unlock_time,
                ),
            );
        }
    }

    // Mark finalized and persist.
    event.is_finalized = true;
    storage::set_event(env, event_id, &event);

    // Store the payout snapshot for historical queries.
    let payouts_key = DataKey::EventPayouts(event_id);
    env.storage().persistent().set(&payouts_key, &payouts);
    env.storage()
        .persistent()
        .extend_ttl(&payouts_key, TTL_LEDGERS, TTL_LEDGERS);

    // Winners have from now until this deadline to claim_prize before their
    // allocation becomes eligible for clawback_unclaimed.
    storage::set_claim_deadline(env, event_id, now + CLAIM_PERIOD_SECONDS);

    env.events().publish(
        (Symbol::new(env, "event"), Symbol::new(env, "finalized")),
        (event_id, payouts.len(), total_distributed),
    );

    Ok(payouts)
}

// ---------------------------------------------------------------------------
// claim_prize (#1312)
// ---------------------------------------------------------------------------

/// Claim a winner's staged prize allocation from a finalized event.
///
/// Transfers the winner's [`PrizeAllocation::amount`] to `winner` exactly
/// once. Requires `winner.require_auth()` — only the allocated winner may
/// claim their own allocation.
///
/// # Checks (in order)
/// 1. Contract not paused ([`EventError::Paused`]).
/// 2. Event exists ([`EventError::EventNotFound`]).
/// 3. Event is finalized ([`EventError::EventNotFinalized`]).
/// 4. `winner` has a recorded allocation ([`EventError::NoAllocation`]).
/// 5. The allocation has not already been settled — by an earlier
///    `claim_prize` call or by `clawback_unclaimed`
///    ([`EventError::AlreadyClaimed`]).
///
/// On success, marks the allocation `claimed`, transfers the funds, emits a
/// `(prize, claimed)` event with `(event_id, winner, amount)`, and returns
/// the claimed amount.
pub fn claim_prize(env: &Env, winner: Address, event_id: u64) -> Result<i128, EventError> {
    winner.require_auth();

    if admin::is_paused(env) {
        return Err(EventError::Paused);
    }

    let event = event::get_event(env, event_id)?;
    if !event.is_finalized {
        return Err(EventError::EventNotFinalized);
    }

    let mut allocation =
        storage::get_prize_allocation(env, event_id, &winner).ok_or(EventError::NoAllocation)?;

    if allocation.claimed {
        return Err(EventError::AlreadyClaimed);
    }

    if allocation.amount <= 0 {
        return Err(EventError::NoAllocation);
    }

    // Mark as claimed in storage before external interaction (Checks-Effects-Interactions pattern)
    allocation.claimed = true;
    storage::set_prize_allocation(env, &allocation);

    let xlm_token = admin::get_xlm_token(env).unwrap_or_else(|| panic!("not_initialized"));
    TokenHelper::distribute_winnings(env, &xlm_token, &winner, allocation.amount)
        .map_err(|_| EventError::TransferFailed)?;

    env.events().publish(
        (Symbol::new(env, "prize"), Symbol::new(env, "claimed")),
        (event_id, winner, allocation.amount),
    );

    Ok(allocation.amount)
}

// ---------------------------------------------------------------------------
// clawback_unclaimed (#1312)
// ---------------------------------------------------------------------------

/// Sweep every still-unclaimed prize allocation for a finalized event to
/// treasury, once the event's claim deadline has passed.
///
/// Permissionless — like `finalize_event`, anyone may trigger the sweep, but
/// they must authorize the call. Only allocations with `claimed == false` are
/// swept; allocations already claimed by their winner are left untouched.
/// Calling this again after a full sweep is a harmless no-op (every
/// allocation is already `claimed`, so nothing more moves).
///
/// # Checks (in order)
/// 1. Contract not paused ([`EventError::Paused`]).
/// 2. Event exists ([`EventError::EventNotFound`]).
/// 3. Event is finalized ([`EventError::EventNotFinalized`]).
/// 4. The claim deadline has passed — `now >= claim_deadline`
///    ([`EventError::ClaimPeriodNotExpired`]).
///
/// Returns the total amount swept to treasury (`0` if nothing was
/// unclaimed).
pub fn clawback_unclaimed(env: &Env, caller: Address, event_id: u64) -> Result<i128, EventError> {
    caller.require_auth();

    if admin::is_paused(env) {
        return Err(EventError::Paused);
    }

    let event = event::get_event(env, event_id)?;
    if !event.is_finalized {
        return Err(EventError::EventNotFinalized);
    }

    let deadline = storage::get_claim_deadline(env, event_id).unwrap_or(u64::MAX);
    let now = env.ledger().timestamp();
    if now < deadline {
        return Err(EventError::ClaimPeriodNotExpired);
    }

    let treasury = admin::get_treasury(env).unwrap_or_else(|| panic!("not_initialized"));
    let xlm_token = admin::get_xlm_token(env).unwrap_or_else(|| panic!("not_initialized"));

    let payouts = get_event_payouts(env, event_id);
    let mut swept: i128 = 0;

    for (winner, amount) in payouts.iter() {
        if amount <= 0 {
            continue;
        }
        let mut allocation = match storage::get_prize_allocation(env, event_id, &winner) {
            Some(a) => a,
            None => continue,
        };
        if allocation.claimed {
            continue;
        }
        allocation.claimed = true;
        storage::set_prize_allocation(env, &allocation);
        swept += allocation.amount;
    }

    if swept > 0 {
        TokenHelper::distribute_winnings(env, &xlm_token, &treasury, swept)
            .map_err(|_| EventError::TransferFailed)?;
    }

    env.events().publish(
        (Symbol::new(env, "prize"), Symbol::new(env, "clawed_back")),
        (event_id, swept),
    );

    Ok(swept)
}

// ---------------------------------------------------------------------------
// get_event_payouts
// ---------------------------------------------------------------------------

/// Return the stored payout snapshot for an event.
///
/// Returns the `Vec<(Address, i128)>` recorded by [`finalize_event`], or an
/// empty vector when the event has not been finalized (or does not exist).
pub fn get_event_payouts(env: &Env, event_id: u64) -> Vec<(Address, i128)> {
    let key = DataKey::EventPayouts(event_id);
    match env
        .storage()
        .persistent()
        .get::<DataKey, Vec<(Address, i128)>>(&key)
    {
        Some(payouts) => {
            env.storage()
                .persistent()
                .extend_ttl(&key, TTL_LEDGERS, TTL_LEDGERS);
            payouts
        }
        None => Vec::new(env),
    }
}

// ---------------------------------------------------------------------------
// Finalization bond settlement (#1344)
// ---------------------------------------------------------------------------

/// Return the finalizer's bond after the challenge window closes unchallenged.
///
/// Permissionless once the window has elapsed: anyone may trigger settlement,
/// but the bond is always returned to the recorded `finalizer`.
///
/// # Checks
/// 1. Bond record exists ([`EventError::BondNotFound`]).
/// 2. Bond not already settled / challenged ([`EventError::BondAlreadySettled`]).
/// 3. Challenge window has closed ([`EventError::ChallengeWindowOpen`]).
///
/// Returns the returned bond amount.
pub fn settle_finalization_bond(
    env: &Env,
    caller: Address,
    event_id: u64,
) -> Result<i128, EventError> {
    caller.require_auth();

    let mut bond = storage::get_finalization_bond(env, event_id).ok_or(EventError::BondNotFound)?;

    if bond.settled || bond.challenged {
        return Err(EventError::BondAlreadySettled);
    }

    let now = env.ledger().timestamp();
    let window_end = bond
        .finalized_at
        .saturating_add(FINALIZATION_CHALLENGE_WINDOW_SECONDS);
    if now < window_end {
        return Err(EventError::ChallengeWindowOpen);
    }

    let xlm_token = admin::get_xlm_token(env).unwrap_or_else(|| panic!("not_initialized"));
    TokenHelper::distribute_winnings(env, &xlm_token, &bond.finalizer, bond.bond)
        .map_err(|_| EventError::TransferFailed)?;

    bond.settled = true;
    storage::set_finalization_bond(env, &bond);

    env.events().publish(
        (Symbol::new(env, "event"), Symbol::new(env, "bond_returned")),
        (event_id, bond.finalizer.clone(), bond.bond),
    );

    Ok(bond.bond)
}

/// Read the finalization bond record for an event, if present.
pub fn get_finalization_bond(env: &Env, event_id: u64) -> Option<FinalizationBond> {
    storage::get_finalization_bond(env, event_id)
}
