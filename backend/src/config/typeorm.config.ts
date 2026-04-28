import { config } from 'dotenv';
config();

import { DataSource, DataSourceOptions } from 'typeorm';
import { join } from 'path';

export const typeOrmConfig: DataSourceOptions = {
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: [join(__dirname, '/../**/*.entity{.ts,.js}')],
  migrations: [join(__dirname, '/../migrations/*{.ts,.js}')],
  synchronize: false, // Never use synchronize in production
  logging: process.env.NODE_ENV === 'development',
  migrationsRun: false, // Run migrations manually
};

// DataSource instance for TypeORM CLI
const dataSource = new DataSource(typeOrmConfig);

export default dataSource;
