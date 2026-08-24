import { config } from 'dotenv';
config();

import { DataSource, DataSourceOptions } from 'typeorm';
import { join } from 'path';
import { validate, NodeEnvironment } from './env.validation';

const env = validate(process.env);

export const typeOrmConfig: DataSourceOptions = {
  type: 'postgres',
  url: env.DATABASE_URL,
  entities: [join(__dirname, '/../**/*.entity{.ts,.js}')],
  migrations: [join(__dirname, '/../migrations/*{.ts,.js}')],
  synchronize: false, // Never use synchronize in production
  logging: env.NODE_ENV === NodeEnvironment.DEVELOPMENT,
  migrationsRun: false, // Run migrations manually
};

// DataSource instance for TypeORM CLI
const dataSource = new DataSource(typeOrmConfig);

export default dataSource;
