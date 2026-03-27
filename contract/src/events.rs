use soroban_sdk::{Address, Env, Symbol};

const TOPIC_MARKET_CREATED: &str = "mkt_crtd";
const TOPIC_MARKET_CLOSED: &str = "mkt_clsd";
const TOPIC_MARKET_CANCELLED: &str = "mkt_cncl";
const TOPIC_MARKET_RESOLVED: &str = "mkt_rslvd";
const TOPIC_PREDICTION_SUBMIT: &str = "pred_sub";
const TOPIC_PAYOUT_CLAIMED: &str = "pay_clmd";
const TOPIC_BATCH_PAYOUT: &str = "btch_pay";
const TOPIC_SEASON_CREATED: &str = "ssn_new";
const TOPIC_SEASON_FINALIZED: &str = "ssn_fnl";
const TOPIC_LEADERBOARD_UPDATED: &str = "lb_updtd";
const TOPIC_INVITE_GENERATED: &str = "inv_gen";
const TOPIC_INVITE_REDEEMED: &str = "inv_redm";
const TOPIC_INVITE_REVOKED: &str = "inv_rvok";
const TOPIC_ORACLE_UPDATED: &str = "orc_upd";

/// Emit when a new market is created.
///
/// Payload: `(market_id, creator, end_time)`
pub(crate) fn emit_market_created(env: &Env, market_id: u64, creator: &Address, end_time: u64) {
    env.events().publish(
        (Symbol::new(env, TOPIC_MARKET_CREATED),),
        (market_id, creator.clone(), end_time),
    );
}

/// Emit when a market is closed for new predictions.
///
/// Payload: `(market_id)`
pub(crate) fn emit_market_closed(env: &Env, market_id: u64) {
    env.events()
        .publish((Symbol::new(env, TOPIC_MARKET_CLOSED),), (market_id,));
}

/// Emit when a market is cancelled.
///
/// Payload: `(market_id)`
pub(crate) fn emit_market_cancelled(env: &Env, market_id: u64) {
    env.events()
        .publish((Symbol::new(env, TOPIC_MARKET_CANCELLED),), (market_id,));
}

/// Emit when a market is resolved with a winning outcome.
///
/// Payload: `(market_id, outcome)`
pub(crate) fn emit_market_resolved(env: &Env, market_id: u64, outcome: Symbol) {
    env.events().publish(
        (Symbol::new(env, TOPIC_MARKET_RESOLVED),),
        (market_id, outcome),
    );
}

/// Emit when a user submits a prediction.
///
/// Payload: `(market_id, predictor, outcome, amount)`
pub(crate) fn emit_prediction_submitted(
    env: &Env,
    market_id: u64,
    predictor: &Address,
    outcome: &Symbol,
    amount: i128,
) {
    env.events().publish(
        (Symbol::new(env, TOPIC_PREDICTION_SUBMIT),),
        (market_id, predictor.clone(), outcome.clone(), amount),
    );
}

/// Emit when a user claims payout for a resolved market.
///
/// Payload: `(market_id, predictor, amount)`
pub(crate) fn emit_payout_claimed(env: &Env, market_id: u64, predictor: &Address, amount: i128) {
    env.events().publish(
        (Symbol::new(env, TOPIC_PAYOUT_CLAIMED),),
        (market_id, predictor.clone(), amount),
    );
}

/// Emit after a batch payout distribution run completes.
///
/// Payload: `(market_id, count)`
pub(crate) fn emit_batch_payout(env: &Env, market_id: u64, count: u32) {
    env.events()
        .publish((Symbol::new(env, TOPIC_BATCH_PAYOUT),), (market_id, count));
}

/// Emit when a new season is created.
///
/// Payload: `(season_id, start, end, pool)`
pub(crate) fn emit_season_created(env: &Env, season_id: u32, start: u64, end: u64, pool: i128) {
    env.events().publish(
        (Symbol::new(env, TOPIC_SEASON_CREATED),),
        (season_id, start, end, pool),
    );
}

/// Emit when a season is finalized.
///
/// Payload: `(season_id, winner)`
pub(crate) fn emit_season_finalized(env: &Env, season_id: u32, winner: &Address) {
    env.events().publish(
        (Symbol::new(env, TOPIC_SEASON_FINALIZED),),
        (season_id, winner.clone()),
    );
}

/// Emit when leaderboard data is updated for a season.
///
/// Payload: `(season_id, updated_at)`
pub(crate) fn emit_leaderboard_updated(env: &Env, season_id: u32, updated_at: u64) {
    env.events().publish(
        (Symbol::new(env, TOPIC_LEADERBOARD_UPDATED),),
        (season_id, updated_at),
    );
}

/// Emit when an invite code is generated.
///
/// Payload: `(market_id, code)`
pub(crate) fn emit_invite_generated(env: &Env, market_id: u64, code: Symbol) {
    env.events().publish(
        (Symbol::new(env, TOPIC_INVITE_GENERATED),),
        (market_id, code),
    );
}

/// Emit when an invite code is redeemed.
///
/// Payload: `(market_id, invitee)`
pub(crate) fn emit_invite_redeemed(env: &Env, market_id: u64, invitee: &Address) {
    env.events().publish(
        (Symbol::new(env, TOPIC_INVITE_REDEEMED),),
        (market_id, invitee.clone()),
    );
}

/// Emit when an invite code is revoked.
///
/// Payload: `(code)`
pub(crate) fn emit_invite_revoked(env: &Env, code: Symbol) {
    env.events()
        .publish((Symbol::new(env, TOPIC_INVITE_REVOKED),), (code,));
}

/// Emit when the configured oracle address changes.
///
/// Payload: `(old, new)`
pub(crate) fn emit_oracle_updated(env: &Env, old_oracle: &Address, new_oracle: &Address) {
    env.events().publish(
        (Symbol::new(env, TOPIC_ORACLE_UPDATED),),
        (old_oracle.clone(), new_oracle.clone()),
    );
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::testutils::{Address as _, Events};
    use soroban_sdk::{symbol_short, IntoVal};

    #[test]
    fn event_topics_are_short_and_unique() {
        let topics = [
            TOPIC_MARKET_CREATED,
            TOPIC_MARKET_CLOSED,
            TOPIC_MARKET_CANCELLED,
            TOPIC_MARKET_RESOLVED,
            TOPIC_PREDICTION_SUBMIT,
            TOPIC_PAYOUT_CLAIMED,
            TOPIC_BATCH_PAYOUT,
            TOPIC_SEASON_CREATED,
            TOPIC_SEASON_FINALIZED,
            TOPIC_LEADERBOARD_UPDATED,
            TOPIC_INVITE_GENERATED,
            TOPIC_INVITE_REDEEMED,
            TOPIC_INVITE_REVOKED,
            TOPIC_ORACLE_UPDATED,
        ];

        for topic in topics {
            assert!(topic.len() <= 9);
        }

        let mut i = 0usize;
        while i < topics.len() {
            let mut j = i + 1;
            while j < topics.len() {
                assert_ne!(topics[i], topics[j]);
                j += 1;
            }
            i += 1;
        }
    }

    #[test]
    fn emitters_publish_expected_topics() {
        let env = Env::default();
        let creator = Address::generate(&env);
        let predictor = Address::generate(&env);
        let winner = Address::generate(&env);
        let old_oracle = Address::generate(&env);
        let new_oracle = Address::generate(&env);
        let code = Symbol::new(&env, "abcd1234");

        emit_market_created(&env, 1, &creator, 100);
        let last = env.events().all().last().unwrap();
        let topic: Symbol = last.1.get(0).unwrap().into_val(&env);
        assert_eq!(topic, symbol_short!("mkt_crtd"));

        emit_market_closed(&env, 1);
        let last = env.events().all().last().unwrap();
        let topic: Symbol = last.1.get(0).unwrap().into_val(&env);
        assert_eq!(topic, symbol_short!("mkt_clsd"));

        emit_market_cancelled(&env, 1);
        let last = env.events().all().last().unwrap();
        let topic: Symbol = last.1.get(0).unwrap().into_val(&env);
        assert_eq!(topic, symbol_short!("mkt_cncl"));

        emit_market_resolved(&env, 1, symbol_short!("yes"));
        let last = env.events().all().last().unwrap();
        let topic: Symbol = last.1.get(0).unwrap().into_val(&env);
        assert_eq!(topic, symbol_short!("mkt_rslvd"));

        emit_prediction_submitted(&env, 1, &predictor, &symbol_short!("yes"), 10_000_000);
        let last = env.events().all().last().unwrap();
        let topic: Symbol = last.1.get(0).unwrap().into_val(&env);
        assert_eq!(topic, symbol_short!("pred_sub"));

        emit_payout_claimed(&env, 1, &predictor, 20_000_000);
        let last = env.events().all().last().unwrap();
        let topic: Symbol = last.1.get(0).unwrap().into_val(&env);
        assert_eq!(topic, symbol_short!("pay_clmd"));

        emit_batch_payout(&env, 1, 3);
        let last = env.events().all().last().unwrap();
        let topic: Symbol = last.1.get(0).unwrap().into_val(&env);
        assert_eq!(topic, symbol_short!("btch_pay"));

        emit_season_created(&env, 1, 10, 20, 50_000_000);
        let last = env.events().all().last().unwrap();
        let topic: Symbol = last.1.get(0).unwrap().into_val(&env);
        assert_eq!(topic, symbol_short!("ssn_new"));

        emit_season_finalized(&env, 1, &winner);
        let last = env.events().all().last().unwrap();
        let topic: Symbol = last.1.get(0).unwrap().into_val(&env);
        assert_eq!(topic, symbol_short!("ssn_fnl"));

        emit_leaderboard_updated(&env, 1, 1234);
        let last = env.events().all().last().unwrap();
        let topic: Symbol = last.1.get(0).unwrap().into_val(&env);
        assert_eq!(topic, symbol_short!("lb_updtd"));

        emit_invite_generated(&env, 1, code.clone());
        let last = env.events().all().last().unwrap();
        let topic: Symbol = last.1.get(0).unwrap().into_val(&env);
        assert_eq!(topic, symbol_short!("inv_gen"));

        emit_invite_redeemed(&env, 1, &predictor);
        let last = env.events().all().last().unwrap();
        let topic: Symbol = last.1.get(0).unwrap().into_val(&env);
        assert_eq!(topic, symbol_short!("inv_redm"));

        emit_invite_revoked(&env, code);
        let last = env.events().all().last().unwrap();
        let topic: Symbol = last.1.get(0).unwrap().into_val(&env);
        assert_eq!(topic, symbol_short!("inv_rvok"));

        emit_oracle_updated(&env, &old_oracle, &new_oracle);
        let last = env.events().all().last().unwrap();
        let topic: Symbol = last.1.get(0).unwrap().into_val(&env);
        assert_eq!(topic, symbol_short!("orc_upd"));
    }
}
