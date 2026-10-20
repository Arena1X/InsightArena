import { DataSource } from 'typeorm';
import { config } from 'dotenv';

config();

/**
 * Database seeding script for development and testing
 * Populates sample events, matches, predictions, and participants
 */

const dataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: [__dirname + '/../../**/*.entity{.ts,.js}'],
  migrations: [__dirname + '/../../migrations/*{.ts,.js}'],
  synchronize: false,
  logging: false,
});

async function seed() {
  try {
    await dataSource.initialize();
    console.log('Database connection established');

    const queryRunner = dataSource.createQueryRunner();

    // Sample events data
    const events = [
      {
        id: 'event-001',
        title: 'Premier League Week 1',
        description: 'Predictions for Premier League matches in week 1',
        status: 'active',
        created_at: new Date('2026-05-01'),
      },
      {
        id: 'event-002',
        title: 'Champions League Round 16',
        description: 'European football championship matches',
        status: 'active',
        created_at: new Date('2026-05-05'),
      },
      {
        id: 'event-003',
        title: 'NBA Finals 2026',
        description: 'Basketball championship predictions',
        status: 'active',
        created_at: new Date('2026-05-10'),
      },
      {
        id: 'event-004',
        title: 'Wimbledon 2026',
        description: 'Tennis tournament predictions',
        status: 'completed',
        created_at: new Date('2026-04-01'),
      },
      {
        id: 'event-005',
        title: 'World Cup Qualifiers',
        description: 'International football qualifiers',
        status: 'completed',
        created_at: new Date('2026-03-01'),
      },
      {
        id: 'event-006',
        title: 'Formula 1 Season',
        description: 'F1 race predictions',
        status: 'cancelled',
        created_at: new Date('2026-02-01'),
      },
      {
        id: 'event-007',
        title: 'UFC Fight Night',
        description: 'MMA fight predictions',
        status: 'active',
        created_at: new Date('2026-05-15'),
      },
      {
        id: 'event-008',
        title: 'Cricket World Cup',
        description: 'International cricket tournament',
        status: 'active',
        created_at: new Date('2026-05-20'),
      },
    ];

    // Sample matches data (50 matches across events)
    const matches = [
      // Event 001 - 10 matches
      ...Array.from({ length: 10 }, (_, i) => ({
        id: `match-001-${i + 1}`,
        event_id: 'event-001',
        home_team: `Team ${String.fromCharCode(65 + (i % 5))}`,
        away_team: `Team ${String.fromCharCode(70 + (i % 5))}`,
        match_time: new Date('2026-05-08').getTime() + i * 86400000,
        status: i < 5 ? 'completed' : 'pending',
        result: i < 5 ? (i % 2 === 0 ? 'home' : 'away') : null,
      })),
      // Event 002 - 10 matches
      ...Array.from({ length: 10 }, (_, i) => ({
        id: `match-002-${i + 1}`,
        event_id: 'event-002',
        home_team: `Club ${String.fromCharCode(65 + (i % 5))}`,
        away_team: `Club ${String.fromCharCode(70 + (i % 5))}`,
        match_time: new Date('2026-05-12').getTime() + i * 86400000,
        status: i < 3 ? 'completed' : 'pending',
        result: i < 3 ? (i % 2 === 0 ? 'home' : 'away') : null,
      })),
      // Event 003 - 10 matches
      ...Array.from({ length: 10 }, (_, i) => ({
        id: `match-003-${i + 1}`,
        event_id: 'event-003',
        home_team: `Team ${String.fromCharCode(65 + (i % 5))}`,
        away_team: `Team ${String.fromCharCode(70 + (i % 5))}`,
        match_time: new Date('2026-05-18').getTime() + i * 86400000,
        status: 'pending',
        result: null,
      })),
      // Event 004 - 10 matches (completed)
      ...Array.from({ length: 10 }, (_, i) => ({
        id: `match-004-${i + 1}`,
        event_id: 'event-004',
        home_team: `Player ${String.fromCharCode(65 + (i % 5))}`,
        away_team: `Player ${String.fromCharCode(70 + (i % 5))}`,
        match_time: new Date('2026-04-15').getTime() + i * 86400000,
        status: 'completed',
        result: i % 2 === 0 ? 'home' : 'away',
      })),
      // Event 005 - 10 matches (completed)
      ...Array.from({ length: 10 }, (_, i) => ({
        id: `match-005-${i + 1}`,
        event_id: 'event-005',
        home_team: `Country ${String.fromCharCode(65 + (i % 5))}`,
        away_team: `Country ${String.fromCharCode(70 + (i % 5))}`,
        match_time: new Date('2026-03-15').getTime() + i * 86400000,
        status: 'completed',
        result: i % 2 === 0 ? 'home' : 'away',
      })),
    ];

    // Sample predictions (200 predictions from various users)
    const predictions = Array.from({ length: 200 }, (_, i) => ({
      id: `prediction-${i + 1}`,
      user_address: `GUSER${String(i % 30).padStart(3, '0')}`,
      match_id: matches[i % matches.length].id,
      predicted_outcome: ['home', 'away', 'draw'][i % 3],
      stake: (Math.random() * 1000 + 100).toFixed(0),
      created_at: new Date(Date.now() - Math.random() * 30 * 86400000),
    }));

    // Sample participants (30 participants across events)
    const participants = Array.from({ length: 30 }, (_, i) => ({
      id: `participant-${i + 1}`,
      address: `GUSER${String(i).padStart(3, '0')}`,
      event_id: events[i % events.length].id,
      joined_at: new Date(Date.now() - Math.random() * 30 * 86400000),
      total_predictions: Math.floor(Math.random() * 50) + 5,
      correct_predictions: Math.floor(Math.random() * 25) + 1,
    }));

    // Sample winners (5 winners for completed events)
    const winners = [
      {
        id: 'winner-001',
        address: 'GUSER001',
        event_id: 'event-004',
        rank: 1,
        score: 95,
      },
      {
        id: 'winner-002',
        address: 'GUSER002',
        event_id: 'event-004',
        rank: 2,
        score: 88,
      },
      {
        id: 'winner-003',
        address: 'GUSER003',
        event_id: 'event-005',
        rank: 1,
        score: 92,
      },
      {
        id: 'winner-004',
        address: 'GUSER004',
        event_id: 'event-005',
        rank: 2,
        score: 85,
      },
      {
        id: 'winner-005',
        address: 'GUSER005',
        event_id: 'event-005',
        rank: 3,
        score: 78,
      },
    ];

    // Sample verified addresses (10 verified)
    const verifiedAddresses = Array.from({ length: 10 }, (_, i) => ({
      address: `GVERIFIED${String(i).padStart(3, '0')}`,
      verified_at: new Date(Date.now() - Math.random() * 60 * 86400000),
    }));

    console.log('Seeding data...');

    // Insert events
    for (const event of events) {
      await queryRunner.query(
        `INSERT INTO events (id, title, description, status, created_at) 
         VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING`,
        [
          event.id,
          event.title,
          event.description,
          event.status,
          event.created_at,
        ],
      );
    }
    console.log(`✓ Inserted ${events.length} events`);

    // Insert matches
    for (const match of matches) {
      await queryRunner.query(
        `INSERT INTO matches (id, event_id, home_team, away_team, match_time, status, result) 
         VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT DO NOTHING`,
        [
          match.id,
          match.event_id,
          match.home_team,
          match.away_team,
          match.match_time,
          match.status,
          match.result,
        ],
      );
    }
    console.log(`✓ Inserted ${matches.length} matches`);

    // Insert predictions
    for (const prediction of predictions) {
      await queryRunner.query(
        `INSERT INTO predictions (id, user_address, match_id, predicted_outcome, stake, created_at) 
         VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING`,
        [
          prediction.id,
          prediction.user_address,
          prediction.match_id,
          prediction.predicted_outcome,
          prediction.stake,
          prediction.created_at,
        ],
      );
    }
    console.log(`✓ Inserted ${predictions.length} predictions`);

    // Insert participants
    for (const participant of participants) {
      await queryRunner.query(
        `INSERT INTO event_participants (id, address, event_id, joined_at, total_predictions, correct_predictions) 
         VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING`,
        [
          participant.id,
          participant.address,
          participant.event_id,
          participant.joined_at,
          participant.total_predictions,
          participant.correct_predictions,
        ],
      );
    }
    console.log(`✓ Inserted ${participants.length} participants`);

    // Insert winners
    for (const winner of winners) {
      await queryRunner.query(
        `INSERT INTO event_winners (id, address, event_id, rank, score) 
         VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING`,
        [winner.id, winner.address, winner.event_id, winner.rank, winner.score],
      );
    }
    console.log(`✓ Inserted ${winners.length} winners`);

    // Insert verified addresses
    for (const verified of verifiedAddresses) {
      await queryRunner.query(
        `INSERT INTO verified_addresses (address, verified_at) 
         VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [verified.address, verified.verified_at],
      );
    }
    console.log(`✓ Inserted ${verifiedAddresses.length} verified addresses`);

    console.log('\n✅ Seeding completed successfully!');
    console.log(`
Summary:
- Events: ${events.length}
- Matches: ${matches.length}
- Predictions: ${predictions.length}
- Participants: ${participants.length}
- Winners: ${winners.length}
- Verified Addresses: ${verifiedAddresses.length}
    `);
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  } finally {
    await dataSource.destroy();
  }
}

void seed();
