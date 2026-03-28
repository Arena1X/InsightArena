use soroban_sdk::{symbol_short, Address, Env, Symbol, Vec};

use crate::analytics;
use crate::config::{self, PERSISTENT_BUMP, PERSISTENT_THRESHOLD};
use crate::errors::InsightArenaError;
use crate::escrow;
use crate::leaderboard;
use crate::season;
use crate::storage_types::{DataKey, Market, Prediction, UserProfile};
use crate::ttl;

// ── TTL helpers ───────────────────────────────────────────────────────────────

fn bump_prediction(env: &Env, market_id: u64, predictor: &Address) {
    ttl::extend_prediction_ttl(env, market_id, predictor);
}

fn bump_market(env: &Env, market_id: u64) {
    ttl::extend_market_ttl(env, market_id);
}

fn bump_predictor_list(env: &Env, market_id: u64) {
    env.storage().persistent().extend_ttl(
        &DataKey::PredictorList(market_id),
        PERSISTENT_THRESHOLD,
        PERSISTENT_BUMP,
    );
}

fn bump_user(env: &Env, address: &Address) {
    ttl::extend_user_ttl(env, address);
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

    let points = leaderboard::calculate_points(
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
    // ── Guard 1: platform not paused ─────────────────────────────────────────
    config::ensure_not_paused(env)?;

    // ── Guard 2: market must exist ────────────────────────────────────────────
    let mut market: Market = env
        .storage()
        .persistent()
        .get(&DataKey::Market(market_id))
        .ok_or(InsightArenaError::MarketNotFound)?;

    // ── Guard 3: market must not be expired ───────────────────────────────────
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
    escrow::lock_stake(env, &predictor, stake_amount)?;

    // ── Track cumulative platform volume ──────────────────────────────────────
    analytics::add_volume(env, stake_amount);

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
        ttl::shorten_prediction_ttl_after_claim(env, market_id, &predictor);
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
    ttl::shorten_prediction_ttl_after_claim(env, market_id, &predictor);

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

    let points = leaderboard::calculate_points(
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

    let predictions = list_market_predictions(env, market_id);
    if predictions.is_empty() {
        emit_batch_payout_complete(env, market_id, &caller, 0);
        return Ok(0);
    }

    let mut winning_pool: i128 = 0;
    for prediction in predictions.iter() {
        if prediction.chosen_outcome == resolved_outcome {
            winning_pool = winning_pool
                .checked_add(prediction.stake_amount)
                .ok_or(InsightArenaError::Overflow)?;
        }
    }

    if winning_pool <= 0 {
        return Err(InsightArenaError::EscrowEmpty);
    }

    let loser_pool = market
        .total_pool
        .checked_sub(winning_pool)
        .ok_or(InsightArenaError::Overflow)?;

    const MAX_BATCH_PAYOUTS: u32 = 25;
    let mut processed: u32 = 0;

    for prediction in predictions.iter() {
        if processed >= MAX_BATCH_PAYOUTS {
            break;
        }

        if prediction.chosen_outcome != resolved_outcome || prediction.payout_claimed {
            continue;
        }

        let prediction_key = DataKey::Prediction(market_id, prediction.predictor.clone());
        let mut stored_prediction: Prediction = env
            .storage()
            .persistent()
            .get(&prediction_key)
            .ok_or(InsightArenaError::PredictionNotFound)?;

        if stored_prediction.payout_claimed {
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
        ttl::shorten_prediction_ttl_after_claim(env, market_id, &stored_prediction.predictor);

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

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod prediction_tests {
    use soroban_sdk::testutils::Address as _;
    use soroban_sdk::token::StellarAssetClient;
    use soroban_sdk::{symbol_short, vec, Address, Env, String, Symbol};

    /* Removed unused import: crate::invite */
    use crate::market::CreateMarketParams;
    use crate::{InsightArenaContract, InsightArenaContractClient, InsightArenaError};

    // ── Test helpers ──────────────────────────────────────────────────────────

    fn register_token(env: &Env) -> Address {
        let token_admin = Address::generate(env);
        env.register_stellar_asset_contract_v2(token_admin)
            .address()
    }

    /// Deploy and initialise the contract; return client + xlm_token address.
    fn deploy(env: &Env) -> (InsightArenaContractClient<'_>, Address) {
        let id = env.register(InsightArenaContract, ());
        let client = InsightArenaContractClient::new(env, &id);
        let admin = Address::generate(env);
        let oracle = Address::generate(env);
        let xlm_token = register_token(env);
        env.mock_all_auths();
        client.initialize(&admin, &oracle, &200_u32, &xlm_token);
        (client, xlm_token)
    }

    fn default_params(env: &Env) -> CreateMarketParams {
        let now = env.ledger().timestamp();
        CreateMarketParams {
            title: String::from_str(env, "Will it rain?"),
            description: String::from_str(env, "Daily weather market"),
            category: Symbol::new(env, "Sports"),
            outcomes: vec![env, symbol_short!("yes"), symbol_short!("no")],
            end_time: now + 1000,
            resolution_time: now + 2000,
            dispute_window: 86_400,
            creator_fee_bps: 100,
            min_stake: 10_000_000,
            max_stake: 100_000_000,
            is_public: true,
        }
    }

    /// Mint `amount` XLM stroops to `recipient` using the stellar asset client.
    fn fund(env: &Env, xlm_token: &Address, recipient: &Address, amount: i128) {
        StellarAssetClient::new(env, xlm_token).mint(recipient, &amount);
    }

    // ── submit_prediction tests ───────────────────────────────────────────────
    // ── Happy path ────────────────────────────────────────────────────────────

    #[test]
    fn submit_prediction_success() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, xlm_token) = deploy(&env);
        let creator = Address::generate(&env);
        let predictor = Address::generate(&env);

        let market_id = client.create_market(&creator, &default_params(&env));
        fund(&env, &xlm_token, &predictor, 20_000_000);

        client.submit_prediction(
            &predictor,
            &market_id,
            &symbol_short!("yes"),
            &20_000_000_i128,
        );

        // Verify prediction stored correctly
        let pred = env.as_contract(&client.address, || {
            use crate::storage_types::{DataKey, Prediction};
            env.storage()
                .persistent()
                .get::<DataKey, Prediction>(&DataKey::Prediction(market_id, predictor.clone()))
                .unwrap()
        });
        assert_eq!(pred.market_id, market_id);
        assert_eq!(pred.predictor, predictor);
        assert_eq!(pred.chosen_outcome, symbol_short!("yes"));
        assert_eq!(pred.stake_amount, 20_000_000);
        assert!(!pred.payout_claimed);
        assert_eq!(pred.payout_amount, 0);
    }

    // ── Task #237 Allowlist Tests ─────────────────────────────────────────────

    /// (a) Public market: no allowlist check — anyone can predict
    #[test]
    fn submit_prediction_public_market_allows_any_predictor() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, xlm_token) = deploy(&env);
        let creator = Address::generate(&env);
        let predictor = Address::generate(&env);
        let stake = 20_000_000_i128;

        let mut params = default_params(&env);
        params.is_public = true;
        let market_id = client.create_market(&creator, &params);
        fund(&env, &xlm_token, &predictor, stake);

        client.submit_prediction(&predictor, &market_id, &symbol_short!("yes"), &stake);
        assert!(client.has_predicted(&market_id, &predictor));
    }

    /// (b) Private market: unlisted predictor rejected with Unauthorized
    #[test]
    fn submit_prediction_private_market_rejects_unlisted() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, xlm_token) = deploy(&env);
        let creator = Address::generate(&env);
        let predictor = Address::generate(&env);
        let stake = 20_000_000_i128;

        let mut params = default_params(&env);
        params.is_public = false;
        let market_id = client.create_market(&creator, &params);
        fund(&env, &xlm_token, &predictor, stake);

        let result =
            client.try_submit_prediction(&predictor, &market_id, &symbol_short!("yes"), &stake);
        assert!(matches!(result, Err(Ok(InsightArenaError::Unauthorized))));
        assert!(!client.has_predicted(&market_id, &predictor));
    }

    /// (c) Private market: allowlisted predictor (redeemed invite) accepted
    #[test]
    fn submit_prediction_private_market_accepts_allowlisted() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, xlm_token) = deploy(&env);
        let creator = Address::generate(&env);
        let predictor = Address::generate(&env);
        let stake = 20_000_000_i128;

        let mut params = default_params(&env);
        params.is_public = false;
        let market_id = client.create_market(&creator, &params);

        let code = client.generate_invite_code(&creator, &market_id, &10, &3600_u64);
        client.redeem_invite_code(&predictor, &code);
        fund(&env, &xlm_token, &predictor, stake);

        client.submit_prediction(&predictor, &market_id, &symbol_short!("yes"), &stake);
        assert!(client.has_predicted(&market_id, &predictor));
    }
}
