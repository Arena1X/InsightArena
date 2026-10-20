import { DataSource } from 'typeorm';
import { config } from 'dotenv';

config();

/**
 * Database reset script
 * Clears all seeded data and re-runs migrations
 */

const dataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: [__dirname + '/../../**/*.entity{.ts,.js}'],
  migrations: [__dirname + '/../../migrations/*{.ts,.js}'],
  synchronize: false,
  logging: false,
});

async function reset() {
  try {
    await dataSource.initialize();
    console.log('Database connection established');

    const queryRunner = dataSource.createQueryRunner();

    console.log('Resetting database...');

    // Drop tables in reverse order of dependencies
    const tables = [
      'event_winners',
      'verified_addresses',
      'event_participants',
      'predictions',
      'matches',
      'events',
    ];

    for (const table of tables) {
      try {
        await queryRunner.query(`DROP TABLE IF EXISTS ${table} CASCADE`);
        console.log(`✓ Dropped table: ${table}`);
      } catch {
        console.log(`⚠ Table ${table} does not exist or could not be dropped`);
      }
    }

    console.log('\n✅ Database reset completed!');
    console.log('Run "npm run migration:run" to re-apply migrations');
    console.log('Run "npm run seed" to populate seed data');
  } catch (error) {
    console.error('❌ Reset failed:', error);
    process.exit(1);
  } finally {
    await dataSource.destroy();
  }
}

void reset();
