use insightarena_contract::{
    InsightArenaContract, InsightArenaContractClient, InsightArenaError, LeaderboardEntry,
};
use soroban_sdk::testutils::{Address as _, Ledger as _};
use soroban_sdk::{vec, Address, Env};

fn deploy(env: &Env) -> (InsightArenaContractClient<'_>, Address, Address) {
    let id = env.register(InsightArenaContract, ());
    let client = InsightArenaContractClient::new(env, &id);
    let admin = Address::generate(env);
    let oracle = Address::generate(env);
    let token_admin = Address::generate(env);
    let xlm_token = env
        .register_stellar_asset_contract_v2(token_admin)
        .address();
    env.mock_all_auths();
    client.initialize(&admin, &oracle, &200_u32, &xlm_token);
    (client, admin, xlm_token)
}

fn fund_reward_pool(
    env: &Env,
    client: &InsightArenaContractClient<'_>,
    admin: &Address,
    xlm_token: &Address,
    reward_pool: i128,
) {
    soroban_sdk::token::StellarAssetClient::new(env, xlm_token).mint(admin, &reward_pool);
    soroban_sdk::token::Client::new(env, xlm_token).approve(
        admin,
        &client.address,
        &reward_pool,
        &9999,
    );
}

#[test]
fn test_update_and_get_historical_leaderboard() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, xlm_token) = deploy(&env);

    let reward_pool = 10_000_000;
    fund_reward_pool(&env, &client, &admin, &xlm_token, reward_pool);

    let season_id = client.create_season(&admin, &100, &200, &reward_pool);
    let user1 = Address::generate(&env);
    let user2 = Address::generate(&env);
    let entries = vec![
        &env,
        LeaderboardEntry {
            rank: 1,
            user: user1.clone(),
            points: 100,
            correct_predictions: 10,
            total_predictions: 15,
        },
        LeaderboardEntry {
            rank: 2,
            user: user2.clone(),
            points: 80,
            correct_predictions: 8,
            total_predictions: 12,
        },
    ];

    client.update_leaderboard(&admin, &season_id, &entries);

    let snapshot = client.get_leaderboard(&season_id);
    assert_eq!(snapshot.season_id, season_id);
    assert_eq!(snapshot.entries.len(), 2);
    assert_eq!(snapshot.entries.get(0).unwrap().user, user1);
    assert_eq!(snapshot.entries.get(1).unwrap().user, user2);
}

#[test]
fn test_list_snapshot_seasons_deduplication() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, xlm_token) = deploy(&env);

    let reward_pool = 20_000_000;
    fund_reward_pool(&env, &client, &admin, &xlm_token, reward_pool);

    let s1 = client.create_season(&admin, &100, &200, &10_000_000);
    let s2 = client.create_season(&admin, &201, &300, &10_000_000);

    assert_eq!(client.list_snapshot_seasons().len(), 0);

    let entries = vec![
        &env,
        LeaderboardEntry {
            rank: 1,
            user: Address::generate(&env),
            points: 10,
            correct_predictions: 1,
            total_predictions: 1,
        },
    ];

    client.update_leaderboard(&admin, &s1, &entries);
    assert_eq!(client.list_snapshot_seasons().len(), 1);
    client.update_leaderboard(&admin, &s1, &entries);
    assert_eq!(client.list_snapshot_seasons().len(), 1);
    client.update_leaderboard(&admin, &s2, &entries);
    assert_eq!(client.list_snapshot_seasons().len(), 2);
}

#[test]
fn test_get_leaderboard_not_found() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _, _) = deploy(&env);
    let result = client.try_get_leaderboard(&99);
    assert!(matches!(result, Err(Ok(InsightArenaError::SeasonNotFound))));
}

#[test]
fn test_update_leaderboard_unauthorized() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _, _) = deploy(&env);
    let stranger = Address::generate(&env);
    let result = client.try_update_leaderboard(&stranger, &1, &vec![&env]);
    assert!(matches!(result, Err(Ok(InsightArenaError::Unauthorized))));
}

#[test]
fn test_update_leaderboard_when_paused() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, _) = deploy(&env);
    client.set_paused(&true);
    let result = client.try_update_leaderboard(&admin, &1, &vec![&env]);
    assert!(matches!(result, Err(Ok(InsightArenaError::Paused))));
}

#[test]
fn test_leaderboard_tie_handling() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, xlm_token) = deploy(&env);

    let reward_pool = 15_000_000;
    fund_reward_pool(&env, &client, &admin, &xlm_token, reward_pool);

    let season_id = client.create_season(&admin, &100, &200, &reward_pool);
    let user1 = Address::generate(&env);
    let user2 = Address::generate(&env);
    let entries = vec![
        &env,
        LeaderboardEntry {
            rank: 1,
            user: user1.clone(),
            points: 100,
            correct_predictions: 9,
            total_predictions: 12,
        },
        LeaderboardEntry {
            rank: 2,
            user: user2.clone(),
            points: 100,
            correct_predictions: 8,
            total_predictions: 12,
        },
    ];

    client.update_leaderboard(&admin, &season_id, &entries);

    let snapshot = client.get_leaderboard(&season_id);
    assert_eq!(snapshot.entries.len(), 2);
    assert_eq!(snapshot.entries.get(0).unwrap().points, 100);
    assert_eq!(snapshot.entries.get(1).unwrap().points, 100);
    assert_eq!(client.get_user_season_points(&user1, &season_id), 100);
    assert_eq!(client.get_user_season_points(&user2, &season_id), 100);
}

#[test]
fn test_update_leaderboard_empty_entries() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, xlm_token) = deploy(&env);

    let reward_pool = 15_000_000;
    fund_reward_pool(&env, &client, &admin, &xlm_token, reward_pool);

    let season_id = client.create_season(&admin, &100, &200, &reward_pool);
    let empty_entries = vec![&env];

    client.update_leaderboard(&admin, &season_id, &empty_entries);

    let snapshot = client.get_leaderboard(&season_id);
    assert_eq!(snapshot.entries.len(), 0);
}

#[test]
fn test_leaderboard_ranking_order() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, xlm_token) = deploy(&env);
    let reward_pool = 10_000_000;
    fund_reward_pool(&env, &client, &admin, &xlm_token, reward_pool);

    let season_id = client.create_season(&admin, &100, &200, &reward_pool);
    let u1 = Address::generate(&env);
    let u2 = Address::generate(&env);
    let u3 = Address::generate(&env);

    let entries = vec![
        &env,
        LeaderboardEntry {
            rank: 1,
            user: u1.clone(),
            points: 1000,
            correct_predictions: 10,
            total_predictions: 10,
        },
        LeaderboardEntry {
            rank: 2,
            user: u2.clone(),
            points: 500,
            correct_predictions: 5,
            total_predictions: 10,
        },
        LeaderboardEntry {
            rank: 3,
            user: u3.clone(),
            points: 100,
            correct_predictions: 1,
            total_predictions: 10,
        },
    ];

    client.update_leaderboard(&admin, &season_id, &entries);

    let snapshot = client.get_leaderboard(&season_id);
    assert_eq!(snapshot.entries.get(0).unwrap().points, 1000);
    assert_eq!(snapshot.entries.get(1).unwrap().points, 500);
    assert_eq!(snapshot.entries.get(2).unwrap().points, 100);
}

#[test]
fn test_leaderboard_pagination() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, xlm_token) = deploy(&env);
    let reward_pool = 10_000_000;
    fund_reward_pool(&env, &client, &admin, &xlm_token, reward_pool);

    let season_id = client.create_season(&admin, &100, &200, &reward_pool);
    
    let mut entries = vec![&env];
    for i in 1..=10 {
        entries.push_back(LeaderboardEntry {
            rank: i,
            user: Address::generate(&env),
            points: 1000 - (i * 10),
            correct_predictions: 10,
            total_predictions: 20,
        });
    }

    client.update_leaderboard(&admin, &season_id, &entries);

    let snapshot = client.get_leaderboard(&season_id);
    let all_entries = snapshot.entries;
    
    // Simulate pagination locally since the contract returns the full list
    let limit = 5;
    let offset = 2;
    let page = all_entries.slice(offset..(offset + limit));
    
    assert_eq!(page.len(), 5);
    assert_eq!(page.get(0).unwrap().rank, 3);
}

#[test]
fn test_update_existing_leaderboard_entry() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, xlm_token) = deploy(&env);
    let reward_pool = 10_000_000;
    fund_reward_pool(&env, &client, &admin, &xlm_token, reward_pool);

    let season_id = client.create_season(&admin, &100, &200, &reward_pool);
    let user = Address::generate(&env);

    let entries1 = vec![
        &env,
        LeaderboardEntry {
            rank: 1,
            user: user.clone(),
            points: 100,
            correct_predictions: 1,
            total_predictions: 1,
        },
    ];
    client.update_leaderboard(&admin, &season_id, &entries1);

    let entries2 = vec![
        &env,
        LeaderboardEntry {
            rank: 1,
            user: user.clone(),
            points: 200,
            correct_predictions: 2,
            total_predictions: 2,
        },
    ];
    client.update_leaderboard(&admin, &season_id, &entries2);

    let snapshot = client.get_leaderboard(&season_id);
    assert_eq!(snapshot.entries.len(), 1);
    assert_eq!(snapshot.entries.get(0).unwrap().points, 200);
}

#[test]
fn test_leaderboard_season_transition() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, xlm_token) = deploy(&env);
    
    fund_reward_pool(&env, &client, &admin, &xlm_token, 20_000_000);

    let s1 = client.create_season(&admin, &100, &200, &10_000_000);
    let user1 = Address::generate(&env);
    client.update_leaderboard(&admin, &s1, &vec![&env, LeaderboardEntry {
        rank: 1,
        user: user1.clone(),
        points: 100,
        correct_predictions: 1,
        total_predictions: 1,
    }]);

    let s2 = client.create_season(&admin, &201, &300, &10_000_000);
    let user2 = Address::generate(&env);
    client.update_leaderboard(&admin, &s2, &vec![&env, LeaderboardEntry {
        rank: 1,
        user: user2.clone(),
        points: 500,
        correct_predictions: 5,
        total_predictions: 5,
    }]);

    let snap1 = client.get_leaderboard(&s1);
    let snap2 = client.get_leaderboard(&s2);

    assert_eq!(snap1.entries.get(0).unwrap().user, user1);
    assert_eq!(snap2.entries.get(0).unwrap().user, user2);
}

#[test]
fn test_leaderboard_rewards_distribution() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, xlm_token) = deploy(&env);
    let reward_pool = 10_000_000;
    fund_reward_pool(&env, &client, &admin, &xlm_token, reward_pool);

    let now = 100;
    let end = 200;
    env.ledger().with_mut(|li| li.timestamp = now);
    let season_id = client.create_season(&admin, &now, &end, &reward_pool);
    
    let u1 = Address::generate(&env);
    let u2 = Address::generate(&env);
    
    client.update_leaderboard(&admin, &season_id, &vec![&env, 
        LeaderboardEntry {
            rank: 1,
            user: u1.clone(),
            points: 200,
            correct_predictions: 2,
            total_predictions: 2,
        },
        LeaderboardEntry {
            rank: 2,
            user: u2.clone(),
            points: 100,
            correct_predictions: 1,
            total_predictions: 2,
        }
    ]);

    env.ledger().with_mut(|li| li.timestamp = end + 1);
    
    let token = soroban_sdk::token::Client::new(&env, &xlm_token);
    let b1_before = token.balance(&u1);
    let b2_before = token.balance(&u2);

    client.finalize_season(&admin, &season_id);

    let b1_after = token.balance(&u1);
    let b2_after = token.balance(&u2);

    assert!(b1_after > b1_before);
    assert!(b2_after > b2_before);
    // Rank 1 gets more than Rank 2
    assert!(b1_after - b1_before > b2_after - b2_before);
}

#[test]
fn test_get_leaderboard_empty_season() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, xlm_token) = deploy(&env);
    let reward_pool = 10_000_000;
    fund_reward_pool(&env, &client, &admin, &xlm_token, reward_pool);

    let season_id = client.create_season(&admin, &100, &200, &reward_pool);
    
    let snapshot = client.get_leaderboard(&season_id);
    assert_eq!(snapshot.entries.len(), 0);
}
