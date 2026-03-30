use soroban_sdk::testutils::{Address as _, Ledger as _};
use soroban_sdk::token::{Client as TokenClient, StellarAssetClient};
use soroban_sdk::{symbol_short, vec, Address, Env, String, Symbol, Vec};

use crate::storage_types::RewardPayout;
use crate::{
    CreateMarketParams, InsightArenaContract, InsightArenaContractClient, InsightArenaError,
    LeaderboardEntry,
};

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
    (client, xlm_token, admin, oracle)
}

fn fund(env: &Env, token: &Address, recipient: &Address, amount: i128) {
    StellarAssetClient::new(env, token).mint(recipient, &amount);
}

fn approve_reward_pool(
    env: &Env,
    token: &Address,
    admin: &Address,
    contract: &Address,
    amount: i128,
) {
    TokenClient::new(env, token).approve(admin, contract, &amount, &9999);
}

fn sample_entries(env: &Env) -> Vec<LeaderboardEntry> {
    vec![
        env,
        LeaderboardEntry {
            rank: 1,
            user: Address::generate(env),
            points: 100,
            correct_predictions: 10,
            total_predictions: 12,
        },
        LeaderboardEntry {
            rank: 2,
            user: Address::generate(env),
            points: 80,
            correct_predictions: 8,
            total_predictions: 11,
        },
        LeaderboardEntry {
            rank: 3,
            user: Address::generate(env),
            points: 50,
            correct_predictions: 5,
            total_predictions: 9,
        },
        LeaderboardEntry {
            rank: 4,
            user: Address::generate(env),
            points: 30,
            correct_predictions: 3,
            total_predictions: 6,
        },
    ]
}

fn reward_distribution_entries(env: &Env) -> Vec<LeaderboardEntry> {
    let points_by_rank = [500_u32, 400, 300, 91, 83, 79, 61, 59, 43, 17, 11, 7];
    let mut entries = Vec::new(env);
    let mut rank = 1_u32;

    for points in points_by_rank {
        entries.push_back(LeaderboardEntry {
            rank,
            user: Address::generate(env),
            points,
            correct_predictions: rank + 2,
            total_predictions: rank + 5,
        });
        rank += 1;
    }

    entries
}

fn fixed_share_bps(rank: u32) -> Option<i128> {
    match rank {
        1 => Some(4_000),
        2 => Some(2_000),
        3 => Some(1_000),
        _ => None,
    }
}

fn expected_reward_payouts(
    env: &Env,
    entries: &Vec<LeaderboardEntry>,
    reward_pool: i128,
) -> Vec<RewardPayout> {
    let mut payouts = Vec::new(env);
    let mut variable_entries = Vec::new(env);
    let mut fixed_allocated = 0_i128;

    for entry in entries.iter() {
        if entry.rank > 10 {
            break;
        }

        if let Some(share_bps) = fixed_share_bps(entry.rank) {
            let amount = reward_pool * share_bps / 10_000;
            fixed_allocated += amount;
            payouts.push_back(RewardPayout {
                rank: entry.rank,
                user: entry.user.clone(),
                amount,
            });
        } else {
            variable_entries.push_back(entry.clone());
        }
    }

    let mut total_points = 0_u32;
    for entry in variable_entries.iter() {
        total_points += entry.points;
    }

    let variable_pool = reward_pool - fixed_allocated;
    let mut distributed = 0_i128;
    let last_index = variable_entries.len().saturating_sub(1);

    for (index, entry) in variable_entries.iter().enumerate() {
        let amount = if index == last_index as usize {
            variable_pool - distributed
        } else {
            variable_pool * entry.points as i128 / total_points as i128
        };

        distributed += amount;
        payouts.push_back(RewardPayout {
            rank: entry.rank,
            user: entry.user.clone(),
            amount,
        });
    }

    payouts
}

fn expected_amount_for_user(payouts: &Vec<RewardPayout>, user: &Address) -> i128 {
    for payout in payouts.iter() {
        if payout.user == *user {
            return payout.amount;
        }
    }

    0
}

fn default_market_params(env: &Env) -> CreateMarketParams {
    let now = env.ledger().timestamp();
    CreateMarketParams {
        title: String::from_str(env, "Season points market"),
        description: String::from_str(env, "Season points accumulation test market"),
        category: Symbol::new(env, "Sports"),
        outcomes: vec![env, symbol_short!("yes"), symbol_short!("no")],
        end_time: now + 100,
        resolution_time: now + 200,
        dispute_window: 86_400,
        creator_fee_bps: 100,
        min_stake: 10_000_000,
        max_stake: 100_000_000,
        is_public: true,
    }
}

#[allow(clippy::too_many_arguments)]
fn settle_winning_market(
    env: &Env,
    client: &InsightArenaContractClient<'_>,
    xlm_token: &Address,
    oracle: &Address,
    winner: &Address,
    loser: &Address,
    winner_stake: i128,
    loser_stake: i128,
) -> i128 {
    let params = default_market_params(env);
    let market_id = client.create_market(&Address::generate(env), &params);

    fund(env, xlm_token, winner, winner_stake);
    fund(env, xlm_token, loser, loser_stake);

    client.submit_prediction(winner, &market_id, &symbol_short!("yes"), &winner_stake);
    client.submit_prediction(loser, &market_id, &symbol_short!("no"), &loser_stake);

    env.ledger()
        .with_mut(|ledger| ledger.timestamp = params.resolution_time + 1);
    client.resolve_market(oracle, &market_id, &symbol_short!("yes"));

    client.claim_payout(winner, &market_id)
}

#[test]
fn test_create_season_success() {
    let env = Env::default();
    let (client, xlm_token, admin, _oracle) = deploy(&env);

    fund(&env, &xlm_token, &admin, 100_000_000);
    approve_reward_pool(&env, &xlm_token, &admin, &client.address, 50_000_000);

    let season_id = client.create_season(&admin, &100, &200, &50_000_000);
    assert_eq!(season_id, 1);

    let season = client.get_season(&season_id);
    assert_eq!(season.reward_pool, 50_000_000);
    assert!(!season.is_finalized);

    assert!(client.get_active_season().is_none());

    env.ledger().set_timestamp(150);
    let active = client.get_active_season().unwrap();
    assert_eq!(active.season_id, season_id);

    let snapshot = client.get_leaderboard(&season_id);
    assert_eq!(snapshot.season_id, season_id);
    assert_eq!(snapshot.entries.len(), 0);
}

#[test]
fn test_create_season_invalid_time() {
    let env = Env::default();
    let (client, xlm_token, admin, _oracle) = deploy(&env);

    fund(&env, &xlm_token, &admin, 100_000_000);
    approve_reward_pool(&env, &xlm_token, &admin, &client.address, 50_000_000);

    let result = client.try_create_season(&admin, &200, &100, &50_000_000);
    assert_eq!(result, Err(Ok(InsightArenaError::InvalidTimeRange)));
}

#[test]
fn test_finalize_season_too_early() {
    let env = Env::default();
    let (client, xlm_token, admin, _oracle) = deploy(&env);

    fund(&env, &xlm_token, &admin, 200_000_000);
    approve_reward_pool(&env, &xlm_token, &admin, &client.address, 100_000_000);

    let season_id = client.create_season(&admin, &10, &100, &100_000_000);
    client.update_leaderboard(&admin, &season_id, &sample_entries(&env));

    env.ledger().set_timestamp(99);
    let result = client.try_finalize_season(&admin, &season_id);
    assert_eq!(result, Err(Ok(InsightArenaError::SeasonNotActive)));
}

#[test]
fn test_finalize_season_reward_distribution() {
    let env = Env::default();
    let (client, xlm_token, admin, _oracle) = deploy(&env);
    let reward_pool = 100_000_003_i128;

    fund(&env, &xlm_token, &admin, 200_000_003);
    approve_reward_pool(&env, &xlm_token, &admin, &client.address, reward_pool);

    let season_id = client.create_season(&admin, &10, &100, &reward_pool);
    let entries = reward_distribution_entries(&env);
    let expected = expected_reward_payouts(&env, &entries, reward_pool);

    env.ledger().set_timestamp(50);
    client.update_leaderboard(&admin, &season_id, &entries);

    env.ledger().set_timestamp(100);
    client.finalize_season(&admin, &season_id);

    let token_client = TokenClient::new(&env, &xlm_token);
    let top_user = entries.get(0).unwrap().user;
    let second_user = entries.get(1).unwrap().user;
    let third_user = entries.get(2).unwrap().user;
    let mut total_distributed = 0_i128;

    for entry in entries.iter() {
        let actual = token_client.balance(&entry.user);
        if entry.rank <= 10 {
            let expected_amount = expected_amount_for_user(&expected, &entry.user);
            assert_eq!(actual, expected_amount);
            total_distributed += actual;
        } else {
            assert_eq!(actual, 0);
        }
    }

    assert_eq!(token_client.balance(&top_user), 40_000_001);
    assert_eq!(token_client.balance(&second_user), 20_000_000);
    assert_eq!(token_client.balance(&third_user), 10_000_000);
    assert_eq!(total_distributed, reward_pool);

    let season = client.get_season(&season_id);
    assert!(season.is_finalized);
    assert_eq!(season.top_winner, Some(top_user));
}

#[test]
fn test_finalize_season_idempotent() {
    let env = Env::default();
    let (client, xlm_token, admin, _oracle) = deploy(&env);

    fund(&env, &xlm_token, &admin, 200_000_000);
    approve_reward_pool(&env, &xlm_token, &admin, &client.address, 100_000_000);

    let season_id = client.create_season(&admin, &10, &100, &100_000_000);
    client.update_leaderboard(&admin, &season_id, &sample_entries(&env));

    env.ledger().set_timestamp(100);
    client.finalize_season(&admin, &season_id);

    let result = client.try_finalize_season(&admin, &season_id);
    assert_eq!(result, Err(Ok(InsightArenaError::SeasonAlreadyFinalized)));
}

#[test]
fn test_points_accumulate_across_markets() {
    let env = Env::default();
    let (client, xlm_token, admin, oracle) = deploy(&env);
    let reward_pool = 10_000_000_i128;

    fund(&env, &xlm_token, &admin, 50_000_000);
    approve_reward_pool(&env, &xlm_token, &admin, &client.address, reward_pool);

    let season_id = client.create_season(&admin, &0, &10_000, &reward_pool);
    let active = client.get_active_season().unwrap();
    assert_eq!(active.season_id, season_id);

    let winner = Address::generate(&env);
    let first_loser = Address::generate(&env);
    let second_loser = Address::generate(&env);

    let first_payout = settle_winning_market(
        &env,
        &client,
        &xlm_token,
        &oracle,
        &winner,
        &first_loser,
        50_000_000,
        50_000_000,
    );
    let second_payout = settle_winning_market(
        &env,
        &client,
        &xlm_token,
        &oracle,
        &winner,
        &second_loser,
        30_000_000,
        30_000_000,
    );

    let profile = client.get_user_stats(&winner);
    let expected_points =
        calculate_expected_points(50_000_000, 1, 1) + calculate_expected_points(30_000_000, 2, 2);

    assert_eq!(profile.season_points, expected_points);
    assert_eq!(profile.total_winnings, first_payout + second_payout);
}

fn calculate_expected_points(stake_amount: i128, correct: u32, total: u32) -> u32 {
    if total == 0 {
        return 0;
    }
    let correct = correct.min(total) as i128;
    let total = total as i128;
    let stake = stake_amount.max(0_i128);
    let stake_bonus = stake / 100_000_000;
    let sum = 100_i128.saturating_add(stake_bonus);
    let numer = sum.saturating_mul(correct).saturating_mul(2_i128);
    let res = numer / total;
    if res < 0 {
        return 0;
    }
    if res > u32::MAX as i128 {
        u32::MAX
    } else {
        res as u32
    }
}
