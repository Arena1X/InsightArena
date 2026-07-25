use soroban_sdk::{symbol_short, Address, Env, Map, Symbol, Vec};

use crate::config::{self, PERSISTENT_BUMP, PERSISTENT_THRESHOLD};
use crate::errors::InsightArenaError;
use crate::escrow;
use crate::market;
use crate::season;
use crate::storage_types::{DataKey, Market, Prediction, UserProfile, BatchPredictionRequest};

// ── TTL helpers ───────────────────────────────────────────────────────────────

fn bump_prediction(env: &Env, market_id: u64, predictor: &Address) {
    config::extend_prediction_ttl(env, market_id, predictor);
}

fn bump_market(env: &Env, market_id: u64) {
    config::extend_market_ttl(env, market_id);
}

fn bump_predictor_list(env: &Env, market_id: u64) {
    env.storage().persistent().extend_ttl(
        &DataKey::PredictorList(market_id),
        PERSISTENT_THRESHOLD,
        PERSISTENT_BUMP,
    );
}

fn bump_user_markets(env: &Env, user: &Address) {
    env.storage().persistent().extend_ttl(
        &DataKey::UserMarkets(user.clone()),
        PERSISTENT_THRESHOLD,
        PERSISTENT_BUMP,
    );
}

fn bump_user(env: &Env, address: &Address) {
    config::extend_user_ttl(env, address);
}

// ── PredictorList / UserMarkets index helpers (used by transfer_prediction) ───

fn add_predictor_to_list(env: &Env, market_id: u64, predictor: &Address) {
    let list_key = DataKey::PredictorList(market_id);
    let mut predictors: Vec<Address> = env
        .storage()
        .persistent()
        .get(&list_key)
        .unwrap_or_else(|| Vec::new(env));
    predictors.push_back(predictor.clone());
    env.storage().persistent().set(&list_key, &predictors);
    bump_predictor_list(env, market_id);
}

fn remove_predictor_from_list(env: &Env, market_id: u64, predictor: &Address) {
    let list_key = DataKey::PredictorList(market_id);
    let mut predictors: Vec<Address> = env
        .storage()
        .persistent()
        .get(&list_key)
        .unwrap_or_else(|| Vec::new(env));

    let mut index: u32 = 0;
    while index < predictors.len() {
        if predictors.get(index) == Some(predictor.clone()) {
            predictors.remove(index);
            break;
        }
        index += 1;
    }

    env.storage().persistent().set(&list_key, &predictors);
    bump_predictor_list(env, market_id);
}

fn add_user_market(env: &Env, user: &Address, market_id: u64) {
    let key = DataKey::UserMarkets(user.clone());
    let mut markets: Vec<u64> = env
        .storage()
        .persistent()
        .get(&key)
        .unwrap_or_else(|| Vec::new(env));
    if !markets.contains(market_id) {
        markets.push_back(market_id);
        env.storage().persistent().set(&key, &markets);
    }
    bump_user_markets(env, user);
}

fn remove_user_market(env: &Env, user: &Address, market_id: u64) {
    let key = DataKey::UserMarkets(user.clone());
    let mut markets: Vec<u64> = env
        .storage()
        .persistent()
        .get(&key)
        .unwrap_or_else(|| Vec::new(env));

    let mut index: u32 = 0;
    while index < markets.len() {
        if markets.get(index) == Some(market_id) {
            markets.remove(index);
            break;
        }
        index += 1;
    }

    env.storage().persistent().set(&key, &markets);
    bump_user_markets(env, user);
}

fn decrease_user_stake(env: &Env, user: &Address, amount: i128) -> Result<(), InsightArenaError> {
    let user_key = DataKey::User(user.clone());
    let mut profile: UserProfile = env
        .storage()
        .persistent()
        .get(&user_key)
        .unwrap_or_else(|| UserProfile::new(user.clone(), env.ledger().timestamp()));

    profile.total_staked = profile
        .total_staked
        .checked_sub(amount)
        .ok_or(InsightArenaError::Overflow)?;

    env.storage().persistent().set(&user_key, &profile);
    bump_user(env, user);
    Ok(())
}

fn increase_user_stake(env: &Env, user: &Address, amount: i128) -> Result<(), InsightArenaError> {
    let user_key = DataKey::User(user.clone());
    let mut profile: UserProfile = env
        .storage()
        .persistent()
        .get(&user_key)
        .unwrap_or_else(|| UserProfile::new(user.clone(), env.ledger().timestamp()));

    profile.total_staked = profile
        .total_staked
        .checked_add(amount)
        .ok_or(InsightArenaError::Overflow)?;

    env.storage().persistent().set(&user_key, &profile);
    bump_user(env, user);
    season::track_user_profile(env, user);
    Ok(())
}

// ── Event emission ────────────────────────────────────────────────────────────

fn emit_prediction_submitted(
    env: &Env,
    market_id: u64,
    predictor: &Address,
    outcome: &Symbol,
    amount: i128,
) {
    env.events().publish(
        (symbol_short!("pred"), symbol_short!("submitd")),
        (market_id, predictor.clone(), outcome.clone(), amount),
    );
}

fn emit_payout_claimed(
    env: &Env,
    market_id: u64,
    predictor: &Address,
    net_payout: i128,
    protocol_fee: i128,
    creator_fee: i128,
) {
    env.events().publish(
        (symbol_short!("pred"), symbol_short!("payclmd")),
        (
            market_id,
            predictor.clone(),
            net_payout,
            protocol_fee,
            creator_fee,
        ),
    );
}

fn emit_prediction_transferred(
    env: &Env,
    market_id: u64,
    from: &Address,
    to: &Address,
    shares: i128,
) {
    env.events().publish(
        (symbol_short!("pred"), symbol_short!("transfr")),
        (market_id, from.clone(), to.clone(), shares),
    );
}

fn emit_batch_payout_complete(env: &Env, market_id: u64, caller: &Address, processed: u32) {
    env.events().publish(
        (symbol_short!("pred"), symbol_short!("batchpay")),
        (market_id, caller.clone(), processed),
    );
}

fn compute_payout_breakdown(
    stake_amount: i128,
    winning_pool: i128,
    loser_pool: i128,
    protocol_fee_bps: u32,
    creator_fee_bps: u32,
) -> Result<(i128, i128, i128), InsightArenaError> {
    let winner_share = stake_amount
        .checked_mul(loser_pool)
        .ok_or(InsightArenaError::Overflow)?
        .checked_div(winning_pool)
        .ok_or(InsightArenaError::Overflow)?;

    let gross_payout = stake_amount
        .checked_add(winner_share)
        .ok_or(InsightArenaError::Overflow)?;

    let protocol_fee = gross_payout
        .checked_mul(protocol_fee_bps as i128)
        .ok_or(InsightArenaError::Overflow)?
        .checked_div(10_000)
        .ok_or(InsightArenaError::Overflow)?;

    let creator_fee = gross_payout
        .checked_mul(creator_fee_bps as i128)
        .ok_or(InsightArenaError::Overflow)?
        .checked_div(10_000)
        .ok_or(InsightArenaError::Overflow)?;

    let net_payout = gross_payout
        .checked_sub(protocol_fee)
        .ok_or(InsightArenaError::Overflow)?
        .checked_sub(creator_fee)
        .ok_or(InsightArenaError::Overflow)?;

    Ok((net_payout, protocol_fee, creator_fee))
}

fn apply_winner_payout(
    env: &Env,
    predictor: &Address,
    net_payout: i128,
    stake_amount: i128,
) -> Result<(), InsightArenaError> {
    let user_key = DataKey::User(predictor.clone());
    let mut profile: UserProfile = env
        .storage()
        .persistent()
        .get(&user_key)
        .unwrap_or_else(|| UserProfile::new(predictor.clone(), env.ledger().timestamp()));

    profile.total_winnings = profile
        .total_winnings
        .checked_add(net_payout)
        .ok_or(InsightArenaError::Overflow)?;

    profile.correct_predictions = profile
        .correct_predictions
        .checked_add(1)
        .ok_or(InsightArenaError::Overflow)?;

    let points = season::calculate_points(
        stake_amount,
        profile.correct_predictions,
        profile.total_predictions,
    );
    profile.season_points = profile
        .season_points
        .checked_add(points)
        .ok_or(InsightArenaError::Overflow)?;

    env.storage().persistent().set(&user_key, &profile);
    bump_user(env, predictor);
    season::track_user_profile(env, predictor);
    Ok(())
}

// ── Entry-point logic ─────────────────────────────────────────────────────────

pub const MAX_PREDICTION_BATCH_SIZE: u32 = 10;

/// Submit a batch of predictions atomically.
/// Enforces a maximum batch size and reverts the entire transaction if any prediction fails.
pub fn submit_predictions_batch(
    env: &Env,
    predictor: Address,
    requests: Vec<BatchPredictionRequest>,
) -> Result<Vec<()>, InsightArenaError> {
    if requests.len() > MAX_PREDICTION_BATCH_SIZE {
        return Err(InsightArenaError::BatchSizeExceeded);
    }

    let mut total_stake: i128 = 0;
    for request in requests.iter() {
        total_stake = total_stake
            .checked_add(request.stake_amount)
            .ok_or(InsightArenaError::Overflow)?;
    }

    if total_stake > 0 {
        escrow::lock_stake(env, &predictor, total_stake)?;
    }

    let mut results = Vec::new(env);
    for request in requests.iter() {
        do_submit_prediction(
            env,
            predictor.clone(),
            request.market_id,
            request.chosen_outcome,
            request.stake_amount,
            true,
        )?;
        results.push_back(());
    }

    Ok(results)
}

/// Submit a prediction for an open market by staking XLM on a chosen outcome.
///
/// Validation order:
/// 1. Platform not paused
/// 2. Market exists (else `MarketNotFound`)
/// 3. `current_time < market.end_time` (else `MarketExpired`)
/// 4. `chosen_outcome` is present in `market.outcome_options` (else `InvalidOutcome`)
/// 5. `stake_amount >= market.min_stake` (else `StakeTooLow`)
/// 6. `stake_amount <= market.max_stake` (else `StakeTooHigh`)
/// 7. Predictor has not already submitted a prediction for this market (else `AlreadyPredicted`)
///
/// On success:
/// - XLM is locked in escrow via `escrow::lock_stake`.
/// - A `Prediction` record is written to `DataKey::Prediction(market_id, predictor)`.
/// - `PredictorList(market_id)` is appended with the predictor address.
/// - `market.total_pool` and `market.participant_count` are updated atomically.
/// - The predictor's `UserProfile` stats are updated (or created on first prediction).
/// - A `PredictionSubmitted` event is emitted.
pub fn submit_prediction(
    env: &Env,
    predictor: Address,
    market_id: u64,
    chosen_outcome: Symbol,
    stake_amount: i128,
) -> Result<(), InsightArenaError> {
    do_submit_prediction(env, predictor, market_id, chosen_outcome, stake_amount, false)
}

fn do_submit_prediction(
    env: &Env,
    predictor: Address,
    market_id: u64,
    chosen_outcome: Symbol,
    stake_amount: i128,
    skip_lock: bool,
) -> Result<(), InsightArenaError> {
    // ── Guard 1: platform not paused ─────────────────────────────────────────
    config::ensure_not_paused(env)?;

    // ── Guard 2: market must exist ────────────────────────────────────────────
    let mut market: Market = env
        .storage()
        .persistent()
        .get(&DataKey::Market(market_id))
        .ok_or(InsightArenaError::MarketNotFound)?;

    // ── Guard 3a: market must not be cancelled ────────────────────────────────
    if market.is_cancelled {
        return Err(InsightArenaError::MarketAlreadyCancelled);
    }

    // ── Guard 3b: market must not be expired ─────────────────────────────────
    let now = env.ledger().timestamp();
    if now >= market.end_time {
        return Err(InsightArenaError::MarketExpired);
    }

    // ── Guard 4: chosen_outcome must be in outcome_options ───────────────────
    let outcome_valid = market.outcome_options.iter().any(|o| o == chosen_outcome);
    if !outcome_valid {
        return Err(InsightArenaError::InvalidOutcome);
    }

    if !market.is_public {
        let allowlist: Vec<Address> = env
            .storage()
            .persistent()
            .get(&DataKey::MarketAllowlist(market_id))
            .unwrap_or_else(|| Vec::new(env));

        if !allowlist.iter().any(|entry| entry == predictor) {
            return Err(InsightArenaError::Unauthorized);
        }

        env.storage().persistent().extend_ttl(
            &DataKey::MarketAllowlist(market_id),
            PERSISTENT_THRESHOLD,
            PERSISTENT_BUMP,
        );
    }

    // ── Guard 5 & 6: stake_amount must be within [min_stake, max_stake] ───────
    if stake_amount < market.min_stake {
        return Err(InsightArenaError::StakeTooLow);
    }
    if stake_amount > market.max_stake {
        return Err(InsightArenaError::StakeTooHigh);
    }

    // ── Guard 7: user has not already predicted on this market ────────────────
    let prediction_key = DataKey::Prediction(market_id, predictor.clone());
    if env.storage().persistent().has(&prediction_key) {
        return Err(InsightArenaError::AlreadyPredicted);
    }

    // ── Lock stake in escrow (transfer XLM from predictor to contract) ────────
    if !skip_lock {
        escrow::lock_stake(env, &predictor, stake_amount)?;
    }

    // ── Track cumulative platform volume ──────────────────────────────────────
    market::add_volume(env, stake_amount);

    // ── Store Prediction record ───────────────────────────────────────────────
    let prediction = Prediction::new(
        market_id,
        predictor.clone(),
        chosen_outcome.clone(),
        stake_amount,
        now,
    );
    env.storage().persistent().set(&prediction_key, &prediction);
    bump_prediction(env, market_id, &predictor);

    // ── Append predictor to PredictorList ────────────────────────────────────
    let list_key = DataKey::PredictorList(market_id);
    let mut predictors: Vec<Address> = env
        .storage()
        .persistent()
        .get(&list_key)
        .unwrap_or_else(|| Vec::new(env));
    predictors.push_back(predictor.clone());
    env.storage().persistent().set(&list_key, &predictors);
    bump_predictor_list(env, market_id);

    // ── Append market to reverse user index ──────────────────────────────────
    let user_markets_key = DataKey::UserMarkets(predictor.clone());
    let mut user_markets: Vec<u64> = env
        .storage()
        .persistent()
        .get(&user_markets_key)
        .unwrap_or_else(|| Vec::new(env));
    if !user_markets.contains(market_id) {
        user_markets.push_back(market_id);
        env.storage()
            .persistent()
            .set(&user_markets_key, &user_markets);
    }
    bump_user_markets(env, &predictor);

    // ── Update market total_pool and participant_count atomically ─────────────
    market.total_pool = market
        .total_pool
        .checked_add(stake_amount)
        .ok_or(InsightArenaError::Overflow)?;
    market.participant_count = market
        .participant_count
        .checked_add(1)
        .ok_or(InsightArenaError::Overflow)?;
    env.storage()
        .persistent()
        .set(&DataKey::Market(market_id), &market);
    bump_market(env, market_id);

    // ── Update UserProfile stats (create profile on first prediction) ─────────
    let user_key = DataKey::User(predictor.clone());
    let mut profile: UserProfile = env
        .storage()
        .persistent()
        .get(&user_key)
        .unwrap_or_else(|| UserProfile::new(predictor.clone(), now));

    profile.total_predictions = profile
        .total_predictions
        .checked_add(1)
        .ok_or(InsightArenaError::Overflow)?;
    profile.total_staked = profile
        .total_staked
        .checked_add(stake_amount)
        .ok_or(InsightArenaError::Overflow)?;

    env.storage().persistent().set(&user_key, &profile);
    bump_user(env, &predictor);
    season::track_user_profile(env, &predictor);

    // ── Emit PredictionSubmitted event ────────────────────────────────────────
    emit_prediction_submitted(env, market_id, &predictor, &chosen_outcome, stake_amount);

    Ok(())
}

/// Transfer part or all of a prediction position from `from` to `to` while the
/// market is still open — a secondary-transfer primitive letting a predictor
/// exit or offload risk before resolution.
///
/// This is a pure accounting move: the staked XLM never leaves contract
/// escrow, so no token transfer occurs. Only the `Prediction` record(s) and
/// the `PredictorList`/`UserMarkets` indexes change ownership.
///
/// Validation order:
/// 1. Platform not paused
/// 2. `from` authorisation via `require_auth()`
/// 3. `from != to` (else `SelfTransfer`)
/// 4. `shares > 0` (else `ZeroShareTransfer`)
/// 5. Market exists (else `MarketNotFound`)
/// 6. Market has not been resolved (else `MarketAlreadyResolved`), cancelled
///    (else `MarketAlreadyCancelled`), or passed `end_time` — i.e. entered its
///    resolution window (else `MarketExpired`)
/// 7. `from` holds a prediction on this market (else `PredictionNotFound`)
/// 8. `shares <= from`'s current `stake_amount` (else `InvalidInput`)
/// 9. If `to` already holds a prediction on this market, its `chosen_outcome`
///    must match `from`'s, or the two positions could not be merged into one
///    consistent record (else `AlreadyPredicted`)
///
/// On success:
/// - `from`'s position shrinks by `shares`. If that leaves zero, the
///   `Prediction` record is deleted and `from` is dropped from
///   `PredictorList(market_id)` and `UserMarkets(from)`.
/// - `to` gains `shares`, merged into an existing same-outcome position or
///   written as a new `Prediction` record (adding `to` to `PredictorList` and
///   `UserMarkets` in the latter case).
/// - `market.participant_count` is adjusted for any net change in unique
///   holders; `market.total_pool` is left untouched, since no stake enters or
///   leaves escrow — only its owner changes.
/// - Both parties' `UserProfile.total_staked` move by exactly `shares` in
///   opposite directions, so the sum staked across all users is conserved.
/// - A `PredictionTransferred` event is emitted.
pub fn transfer_prediction(
    env: &Env,
    market_id: u64,
    from: Address,
    to: Address,
    shares: i128,
) -> Result<(), InsightArenaError> {
    // ── Guard 1: platform not paused ─────────────────────────────────────────
    config::ensure_not_paused(env)?;

    // ── Guard 2: sender authorisation ────────────────────────────────────────
    from.require_auth();

    // ── Guard 3: no self-transfer ─────────────────────────────────────────────
    if from == to {
        return Err(InsightArenaError::SelfTransfer);
    }

    // ── Guard 4: shares must be strictly positive ─────────────────────────────
    if shares <= 0 {
        return Err(InsightArenaError::ZeroShareTransfer);
    }

    // ── Guard 5: market must exist ────────────────────────────────────────────
    let mut market: Market = env
        .storage()
        .persistent()
        .get(&DataKey::Market(market_id))
        .ok_or(InsightArenaError::MarketNotFound)?;

    // ── Guard 6: market must still be open (not resolved/cancelled/expired) ───
    if market.is_resolved {
        return Err(InsightArenaError::MarketAlreadyResolved);
    }
    if market.is_cancelled {
        return Err(InsightArenaError::MarketAlreadyCancelled);
    }
    let now = env.ledger().timestamp();
    if now >= market.end_time {
        return Err(InsightArenaError::MarketExpired);
    }

    // ── Guard 7: sender must hold a position on this market ──────────────────
    let from_key = DataKey::Prediction(market_id, from.clone());
    let mut from_prediction: Prediction = env
        .storage()
        .persistent()
        .get(&from_key)
        .ok_or(InsightArenaError::PredictionNotFound)?;

    // ── Guard 8: cannot transfer more than the sender holds ───────────────────
    if shares > from_prediction.stake_amount {
        return Err(InsightArenaError::InvalidInput);
    }

    // ── Guard 9: recipient's existing position (if any) must be compatible ────
    let to_key = DataKey::Prediction(market_id, to.clone());
    let existing_to: Option<Prediction> = env.storage().persistent().get(&to_key);
    if let Some(existing) = &existing_to {
        if existing.chosen_outcome != from_prediction.chosen_outcome {
            return Err(InsightArenaError::AlreadyPredicted);
        }
    }
    let to_is_new_participant = existing_to.is_none();

    let remaining = from_prediction
        .stake_amount
        .checked_sub(shares)
        .ok_or(InsightArenaError::Overflow)?;
    let from_fully_exited = remaining == 0;

    // ── Shrink or delete the sender's position ────────────────────────────────
    if from_fully_exited {
        env.storage().persistent().remove(&from_key);
        remove_predictor_from_list(env, market_id, &from);
        remove_user_market(env, &from, market_id);
    } else {
        from_prediction.stake_amount = remaining;
        env.storage().persistent().set(&from_key, &from_prediction);
        bump_prediction(env, market_id, &from);
    }

    // ── Grow or create the recipient's position ───────────────────────────────
    match existing_to {
        Some(mut to_prediction) => {
            to_prediction.stake_amount = to_prediction
                .stake_amount
                .checked_add(shares)
                .ok_or(InsightArenaError::Overflow)?;
            env.storage().persistent().set(&to_key, &to_prediction);
            bump_prediction(env, market_id, &to);
        }
        None => {
            let to_prediction = Prediction::new(
                market_id,
                to.clone(),
                from_prediction.chosen_outcome.clone(),
                shares,
                now,
            );
            env.storage().persistent().set(&to_key, &to_prediction);
            bump_prediction(env, market_id, &to);
            add_predictor_to_list(env, market_id, &to);
            add_user_market(env, &to, market_id);
        }
    }

    // ── Adjust market.participant_count; total_pool is unchanged ─────────────
    if to_is_new_participant {
        market.participant_count = market
            .participant_count
            .checked_add(1)
            .ok_or(InsightArenaError::Overflow)?;
    }
    if from_fully_exited {
        market.participant_count = market
            .participant_count
            .checked_sub(1)
            .ok_or(InsightArenaError::Overflow)?;
    }
    env.storage()
        .persistent()
        .set(&DataKey::Market(market_id), &market);
    bump_market(env, market_id);

    // ── Move the staked amount between the two UserProfiles ──────────────────
    decrease_user_stake(env, &from, shares)?;
    increase_user_stake(env, &to, shares)?;

    emit_prediction_transferred(env, market_id, &from, &to, shares);

    Ok(())
}

/// Return the stored [`Prediction`] for a given `(market_id, predictor)` pair.
///
/// This is a read-only query — no state is mutated. The TTL of the prediction
/// record is extended on every successful read so it remains live while clients
/// are actively querying it.
///
/// # Errors
/// - `PredictionNotFound` — no prediction exists for the supplied key.
pub fn get_prediction(
    env: &Env,
    market_id: u64,
    predictor: Address,
) -> Result<Prediction, InsightArenaError> {
    let key = DataKey::Prediction(market_id, predictor.clone());

    let prediction: Prediction = env
        .storage()
        .persistent()
        .get(&key)
        .or_else(|| env.storage().temporary().get(&key))
        .ok_or(InsightArenaError::PredictionNotFound)?;

    if env.storage().persistent().has(&key) {
        // Before claim, keep full market-lifetime TTL.
        bump_prediction(env, market_id, &predictor);
    } else if env.storage().temporary().has(&key) {
        // After claim, keep short-lived cleanup TTL.
        config::shorten_prediction_ttl_after_claim(env, market_id, &predictor);
    }

    Ok(prediction)
}

/// Check whether `predictor` has already submitted a prediction on
/// `market_id`.
///
/// This is a lightweight boolean check that does **not** load the full
/// `Prediction` struct — it only tests key existence in persistent storage.
/// No state mutations occur.
///
/// # Arguments
/// * `market_id`  — The market to query.
/// * `predictor`  — The address to check.
///
/// # Returns
/// `true` if a prediction exists, `false` otherwise. Never panics.
pub fn has_predicted(env: &Env, market_id: u64, predictor: Address) -> bool {
    env.storage()
        .persistent()
        .has(&DataKey::Prediction(market_id, predictor.clone()))
        || env
            .storage()
            .temporary()
            .has(&DataKey::Prediction(market_id, predictor))
}

/// Return all [`Prediction`] records for a given market.
///
/// Loads the `PredictorList(market_id)` (a `Vec<Address>` of every address
/// that called `submit_prediction` on this market), then fetches each
/// individual `Prediction` record. TTLs are extended for the predictor
/// list and every prediction accessed.
///
/// Returns an empty `Vec` if the market has no predictions or does not
/// exist.
///
/// # Arguments
/// * `market_id` — The market whose predictions to list.
pub fn list_market_predictions(env: &Env, market_id: u64) -> Vec<Prediction> {
    let list_key = DataKey::PredictorList(market_id);

    let predictors: Vec<Address> = env
        .storage()
        .persistent()
        .get(&list_key)
        .unwrap_or_else(|| Vec::new(env));

    if predictors.is_empty() {
        return Vec::new(env);
    }

    // Extend TTL for the predictor list itself.
    bump_predictor_list(env, market_id);

    let mut results: Vec<Prediction> = Vec::new(env);

    for predictor in predictors.iter() {
        let pred_key = DataKey::Prediction(market_id, predictor.clone());
        if let Some(prediction) = env
            .storage()
            .persistent()
            .get::<DataKey, Prediction>(&pred_key)
        {
            bump_prediction(env, market_id, &predictor);
            results.push_back(prediction);
        }
    }

    results
}

/// Claim the payout for a previously submitted winning prediction.
///
/// Returns the net payout amount transferred to the predictor.
pub fn claim_payout(
    env: &Env,
    predictor: Address,
    market_id: u64,
) -> Result<i128, InsightArenaError> {
    config::ensure_not_paused(env)?;
    predictor.require_auth();

    let market: Market = env
        .storage()
        .persistent()
        .get(&DataKey::Market(market_id))
        .ok_or(InsightArenaError::MarketNotFound)?;

    if !market.is_resolved {
        return Err(InsightArenaError::MarketNotResolved);
    }

    let resolved_outcome = market
        .resolved_outcome
        .clone()
        .ok_or(InsightArenaError::MarketNotResolved)?;

    let prediction_key = DataKey::Prediction(market_id, predictor.clone());
    let mut prediction: Prediction = env
        .storage()
        .persistent()
        .get(&prediction_key)
        .or_else(|| env.storage().temporary().get(&prediction_key))
        .ok_or(InsightArenaError::PredictionNotFound)?;

    if prediction.payout_claimed {
        return Err(InsightArenaError::PayoutAlreadyClaimed);
    }

    if prediction.chosen_outcome != resolved_outcome {
        return Err(InsightArenaError::InvalidOutcome);
    }

    let predictors: Vec<Address> = env
        .storage()
        .persistent()
        .get(&DataKey::PredictorList(market_id))
        .unwrap_or_else(|| Vec::new(env));

    let mut winning_pool: i128 = 0;
    for address in predictors.iter() {
        let key = DataKey::Prediction(market_id, address.clone());
        if let Some(item) = env
            .storage()
            .persistent()
            .get::<DataKey, Prediction>(&key)
            .or_else(|| env.storage().temporary().get::<DataKey, Prediction>(&key))
        {
            if item.chosen_outcome == resolved_outcome {
                winning_pool = winning_pool
                    .checked_add(item.stake_amount)
                    .ok_or(InsightArenaError::Overflow)?;
            }
        }
    }

    if winning_pool <= 0 {
        return Err(InsightArenaError::EscrowEmpty);
    }

    let loser_pool = market
        .total_pool
        .checked_sub(winning_pool)
        .ok_or(InsightArenaError::Overflow)?;

    let winner_share = prediction
        .stake_amount
        .checked_mul(loser_pool)
        .ok_or(InsightArenaError::Overflow)?
        .checked_div(winning_pool)
        .ok_or(InsightArenaError::Overflow)?;

    let gross_payout = prediction
        .stake_amount
        .checked_add(winner_share)
        .ok_or(InsightArenaError::Overflow)?;

    let cfg = config::get_config(env)?;

    let protocol_fee = gross_payout
        .checked_mul(cfg.protocol_fee_bps as i128)
        .ok_or(InsightArenaError::Overflow)?
        .checked_div(10_000)
        .ok_or(InsightArenaError::Overflow)?;

    let creator_fee = gross_payout
        .checked_mul(market.creator_fee_bps as i128)
        .ok_or(InsightArenaError::Overflow)?
        .checked_div(10_000)
        .ok_or(InsightArenaError::Overflow)?;

    let net_payout = gross_payout
        .checked_sub(protocol_fee)
        .ok_or(InsightArenaError::Overflow)?
        .checked_sub(creator_fee)
        .ok_or(InsightArenaError::Overflow)?;

    if net_payout > 0 {
        escrow::release_payout(env, &predictor, net_payout)?;
    }
    if protocol_fee > 0 {
        escrow::add_to_treasury_balance(env, protocol_fee);
    }
    if creator_fee > 0 {
        escrow::refund(env, &market.creator, creator_fee)?;
    }

    prediction.payout_claimed = true;
    prediction.payout_amount = net_payout;
    env.storage().persistent().remove(&prediction_key);
    env.storage().temporary().set(&prediction_key, &prediction);
    config::shorten_prediction_ttl_after_claim(env, market_id, &predictor);

    let user_key = DataKey::User(predictor.clone());
    let mut profile: UserProfile = env
        .storage()
        .persistent()
        .get(&user_key)
        .unwrap_or_else(|| UserProfile::new(predictor.clone(), env.ledger().timestamp()));

    profile.total_winnings = profile
        .total_winnings
        .checked_add(net_payout)
        .ok_or(InsightArenaError::Overflow)?;

    profile.correct_predictions = profile
        .correct_predictions
        .checked_add(1)
        .ok_or(InsightArenaError::Overflow)?;

    let points = season::calculate_points(
        prediction.stake_amount,
        profile.correct_predictions,
        profile.total_predictions,
    );
    profile.season_points = profile
        .season_points
        .checked_add(points)
        .ok_or(InsightArenaError::Overflow)?;

    env.storage().persistent().set(&user_key, &profile);
    bump_user(env, &predictor);
    season::track_user_profile(env, &predictor);

    emit_payout_claimed(
        env,
        market_id,
        &predictor,
        net_payout,
        protocol_fee,
        creator_fee,
    );

    Ok(net_payout)
}

/// Batch distribute payouts for all unclaimed winning predictions in a resolved
/// market. Callable only by admin or oracle.
///
/// Iterates the market's predictor list and pays every winning prediction that
/// has not been claimed yet. Losing predictions, predictions already claimed
/// (individually via `claim_payout` or by a previous batch), and duplicate
/// list entries are skipped without aborting the batch. Payout amounts are
/// identical to what `claim_payout` would pay: the winning pool is computed
/// over every winning stake — including already-claimed ones, whose records
/// live in temporary storage — so entitlements do not depend on claim order,
/// and each unique address is counted once.
///
/// At most 25 payouts are processed per invocation; call again to continue.
///
/// Returns the number of payouts processed in this invocation.
pub fn batch_distribute_payouts(
    env: &Env,
    caller: Address,
    market_id: u64,
) -> Result<u32, InsightArenaError> {
    config::ensure_not_paused(env)?;
    caller.require_auth();

    let cfg = config::get_config(env)?;
    if caller != cfg.admin && caller != cfg.oracle_address {
        return Err(InsightArenaError::Unauthorized);
    }

    let market: Market = env
        .storage()
        .persistent()
        .get(&DataKey::Market(market_id))
        .ok_or(InsightArenaError::MarketNotFound)?;

    if !market.is_resolved {
        return Err(InsightArenaError::MarketNotResolved);
    }

    let resolved_outcome = market
        .resolved_outcome
        .clone()
        .ok_or(InsightArenaError::MarketNotResolved)?;

    // Read the predictor list directly rather than via list_market_predictions:
    // claimed predictions move to temporary storage, and the pool math below
    // must see them (exactly as claim_payout does) or an already-claimed
    // winning stake would be miscounted as loser pool and inflate the
    // remaining winners' payouts.
    let predictors: Vec<Address> = env
        .storage()
        .persistent()
        .get(&DataKey::PredictorList(market_id))
        .unwrap_or_else(|| Vec::new(env));

    if predictors.is_empty() {
        emit_batch_payout_complete(env, market_id, &caller, 0);
        return Ok(0);
    }
    bump_predictor_list(env, market_id);

    // Each unique address contributes its winning stake exactly once, no
    // matter how many times it appears in the list.
    let mut seen: Map<Address, bool> = Map::new(env);
    let mut winning_pool: i128 = 0;
    for address in predictors.iter() {
        if seen.contains_key(address.clone()) {
            continue;
        }
        seen.set(address.clone(), true);

        let key = DataKey::Prediction(market_id, address.clone());
        if let Some(item) = env
            .storage()
            .persistent()
            .get::<DataKey, Prediction>(&key)
            .or_else(|| env.storage().temporary().get::<DataKey, Prediction>(&key))
        {
            if item.chosen_outcome == resolved_outcome {
                winning_pool = winning_pool
                    .checked_add(item.stake_amount)
                    .ok_or(InsightArenaError::Overflow)?;
            }
        }
    }

    if winning_pool <= 0 {
        emit_batch_payout_complete(env, market_id, &caller, 0);
        return Ok(0);
    }

    let loser_pool = market
        .total_pool
        .checked_sub(winning_pool)
        .ok_or(InsightArenaError::Overflow)?;

    const MAX_BATCH_PAYOUTS: u32 = 25;
    let mut processed: u32 = 0;

    for address in predictors.iter() {
        if processed >= MAX_BATCH_PAYOUTS {
            break;
        }

        let prediction_key = DataKey::Prediction(market_id, address.clone());
        // Claimed predictions live in temporary storage; loading from both
        // stores lets the payout_claimed flag skip them (and any duplicate
        // list entry) instead of aborting the batch. A missing record is
        // skipped rather than treated as fatal.
        let stored: Option<Prediction> = env
            .storage()
            .persistent()
            .get(&prediction_key)
            .or_else(|| env.storage().temporary().get(&prediction_key));
        let mut stored_prediction = match stored {
            Some(prediction) => prediction,
            None => continue,
        };

        if stored_prediction.chosen_outcome != resolved_outcome || stored_prediction.payout_claimed
        {
            continue;
        }

        let (net_payout, protocol_fee, creator_fee) = compute_payout_breakdown(
            stored_prediction.stake_amount,
            winning_pool,
            loser_pool,
            cfg.protocol_fee_bps,
            market.creator_fee_bps,
        )?;

        if net_payout > 0 {
            escrow::release_payout(env, &stored_prediction.predictor, net_payout)?;
        }
        if protocol_fee > 0 {
            escrow::add_to_treasury_balance(env, protocol_fee);
        }
        if creator_fee > 0 {
            escrow::refund(env, &market.creator, creator_fee)?;
        }

        stored_prediction.payout_claimed = true;
        stored_prediction.payout_amount = net_payout;
        env.storage().persistent().remove(&prediction_key);
        env.storage()
            .temporary()
            .set(&prediction_key, &stored_prediction);
        config::shorten_prediction_ttl_after_claim(env, market_id, &stored_prediction.predictor);

        apply_winner_payout(
            env,
            &stored_prediction.predictor,
            net_payout,
            stored_prediction.stake_amount,
        )?;

        processed = processed
            .checked_add(1)
            .ok_or(InsightArenaError::Overflow)?;
    }

    escrow::assert_escrow_solvent(env)?;

    emit_batch_payout_complete(env, market_id, &caller, processed);

    Ok(processed)
}

// ── Cancellation refund (pull pattern) ───────────────────────────────────────

/// Emit one refund event per individual claim, matching the emit_* style used
/// elsewhere in this module.
fn emit_refund_claimed(env: &Env, market_id: u64, predictor: &Address, amount: i128) {
    env.events().publish(
        (symbol_short!("pred"), symbol_short!("refndcld")),
        (market_id, predictor.clone(), amount),
    );
}

/// Claim a cancellation refund for a staked prediction on a cancelled market.
///
/// This implements a **pull** pattern: each participant calls this function
/// independently to withdraw their own stake. The function is O(1) — it
/// touches only the caller's records and does not iterate any participant list.
///
/// Accounting guarantee: because no fees are deducted before resolution, the
/// full `stake_amount` is still held in escrow at cancellation time. Each
/// participant therefore receives exactly what they deposited, and the sum of
/// all individual refunds equals `market.total_pool` — the total held in
/// escrow for that market.
///
/// # Validation order
/// 1. Platform not paused
/// 2. Market exists
/// 3. Market is cancelled (`is_cancelled == true`)
/// 4. Caller has an unclaimed prediction for this market (`NotAParticipant`)
/// 5. Refund has not already been claimed (`RefundAlreadyClaimed`)
///
/// # On success
/// - `stake_amount` is transferred from escrow to `predictor` via
///   `escrow::refund`.
/// - The prediction record is moved from persistent to temporary storage,
///   preventing any second claim (same tombstone pattern as `claim_payout`).
/// - A `RefundClaimed` event is emitted carrying
///   `(market_id, predictor, amount)`.
///
/// # Returns
/// The refund amount in stroops (equal to the original `stake_amount`).
pub fn claim_cancel_refund(
    env: &Env,
    predictor: Address,
    market_id: u64,
) -> Result<i128, InsightArenaError> {
    // ── Guard 1: platform not paused ─────────────────────────────────────────
    config::ensure_not_paused(env)?;

    // Require the caller's authorisation before reading any state so the
    // auth check can never be bypassed by an early error return.
    predictor.require_auth();

    // ── Guard 2: market must exist ────────────────────────────────────────────
    let market: Market = env
        .storage()
        .persistent()
        .get(&DataKey::Market(market_id))
        .ok_or(InsightArenaError::MarketNotFound)?;

    // ── Guard 3: market must be cancelled ─────────────────────────────────────
    if !market.is_cancelled {
        return Err(InsightArenaError::MarketNotCancelled);
    }

    // ── Guard 4: caller must have a prediction record ─────────────────────────
    // Presence in persistent storage means the refund has not yet been claimed.
    // After a successful claim the record is moved to temporary storage (tombstone),
    // exactly mirroring what claim_payout does — so the same "is it in persistent?"
    // check doubles as the double-claim guard with no new storage keys required.
    let prediction_key = DataKey::Prediction(market_id, predictor.clone());

    // Check temporary storage first: if the record is there it was already processed.
    if env.storage().temporary().has(&prediction_key) {
        return Err(InsightArenaError::RefundAlreadyClaimed);
    }

    let prediction: Prediction = env
        .storage()
        .persistent()
        .get(&prediction_key)
        .ok_or(InsightArenaError::NotAParticipant)?;

    let refund_amount = prediction.stake_amount;

    // ── Checks-Effects-Interactions: move record to temporary before transfer ─
    // Removing from persistent and writing a tombstone to temporary makes the
    // double-claim guard above fire on any subsequent call, even if the transfer
    // below were somehow to revert (it cannot in Soroban, but the pattern is
    // correct regardless).
    let mut tombstone = prediction.clone();
    tombstone.payout_claimed = true; // reuse flag to signal "refund claimed"
    env.storage().persistent().remove(&prediction_key);
    env.storage().temporary().set(&prediction_key, &tombstone);
    config::shorten_prediction_ttl_after_claim(env, market_id, &predictor);

    // ── Transfer stake from escrow back to predictor ──────────────────────────
    escrow::refund(env, &predictor, refund_amount)?;

    // ── Emit one RefundClaimed event for this individual claim ────────────────
    emit_refund_claimed(env, market_id, &predictor, refund_amount);

    Ok(refund_amount)
}
