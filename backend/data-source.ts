import { config } from 'dotenv';

// Load environment variables for TypeORM CLI FIRST
config();

// TypeORM CLI entry point. Migration filenames must use unique timestamp
// prefixes — see `pnpm run migration:check-timestamps`.
import dataSource from './src/config/typeorm.config';

export default dataSource;
