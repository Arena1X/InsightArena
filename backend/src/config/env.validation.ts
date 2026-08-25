import { plainToInstance } from 'class-transformer';
import {
  IsBooleanString,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

enum StellarNetwork {
  TESTNET = 'testnet',
  MAINNET = 'mainnet',
}

export enum NodeEnvironment {
  DEVELOPMENT = 'development',
  PRODUCTION = 'production',
  TEST = 'test',
}

/**
 * Validated environment configuration.
 *
 * Optional variables document their runtime default in comments below.
 */
class EnvironmentVariables {
  @IsString()
  @IsNotEmpty()
  DATABASE_URL: string;

  @IsString()
  @MinLength(32, {
    message: 'JWT_SECRET must be at least 32 characters long',
  })
  JWT_SECRET: string;

  @IsString()
  @IsNotEmpty()
  JWT_EXPIRES_IN: string;

  @IsEnum(StellarNetwork, {
    message: 'STELLAR_NETWORK must be either "testnet" or "mainnet"',
  })
  STELLAR_NETWORK: StellarNetwork;

  @IsString()
  @IsNotEmpty()
  SOROBAN_CONTRACT_ID: string;

  @IsString()
  @IsNotEmpty()
  SERVER_SECRET_KEY: string;

  /** Default: development */
  @IsOptional()
  @IsEnum(NodeEnvironment)
  NODE_ENV?: NodeEnvironment = NodeEnvironment.DEVELOPMENT;

  /** Default: 3000 */
  @IsOptional()
  @IsNumber()
  @Min(1)
  PORT?: number = 3000;

  /** Default: derived from STELLAR_NETWORK when unset */
  @IsOptional()
  @IsUrl({ require_tld: false })
  SOROBAN_RPC_URL?: string;

  /** Default: 10000 */
  @IsOptional()
  @IsNumber()
  @Min(1)
  SOROBAN_RPC_TIMEOUT_MS?: number;

  /** Default: 2 */
  @IsOptional()
  @IsNumber()
  @Min(0)
  SOROBAN_RPC_MAX_RETRIES?: number;

  /** Default: true */
  @IsOptional()
  @IsBooleanString()
  RECONCILE_ENABLED?: string;

  /** Default: 60000 */
  @IsOptional()
  @IsNumber()
  @Min(1)
  RECONCILE_INTERVAL_MS?: number;

  /** Default: 200 */
  @IsOptional()
  @IsNumber()
  @Min(1)
  RECONCILE_WINDOW?: number;

  /** Default: ./exports */
  @IsOptional()
  @IsString()
  EXPORT_DIR?: string = './exports';

  /** Default: 48 */
  @IsOptional()
  @IsNumber()
  @Min(1)
  EXPORT_TTL_HOURS?: number = 48;

  /** Default: 0 * * * * */
  @IsOptional()
  @IsString()
  LEADERBOARD_SNAPSHOT_CRON?: string = '0 * * * *';

  /** Default: 30 */
  @IsOptional()
  @IsNumber()
  @Min(1)
  LEADERBOARD_SNAPSHOT_RETENTION_DAYS?: number = 30;

  /** Default: 24 */
  @IsOptional()
  @IsNumber()
  @Min(1)
  IDEMPOTENCY_KEY_TTL_HOURS?: number = 24;

  /** Default: 5 */
  @IsOptional()
  @IsNumber()
  @Min(1)
  WEBHOOK_MAX_ATTEMPTS?: number = 5;

  /** Default: 5000 */
  @IsOptional()
  @IsNumber()
  @Min(1)
  WEBHOOK_TIMEOUT_MS?: number = 5000;

  /** Default: 50 */
  @IsOptional()
  @IsNumber()
  @Min(1)
  WEBHOOK_BATCH_SIZE?: number = 50;

  /** Default: unset (webhook signatures disabled) */
  @IsOptional()
  @IsString()
  WEBHOOK_HMAC_SECRET?: string;

  /** Default: 300 */
  @IsOptional()
  @IsNumber()
  @Min(1)
  WEBHOOK_REPLAY_WINDOW_SECONDS?: number;

  @IsOptional()
  @IsNumber()
  ORACLE_ANOMALY_THRESHOLD?: number;

  @IsOptional()
  @IsNumber()
  ORACLE_ANOMALY_MIN_SAMPLES?: number;

  @IsOptional()
  @IsNumber()
  ORACLE_ANOMALY_WINDOW?: number;

  @IsOptional()
  @IsString()
  ORACLE_ANOMALY_HOLD?: string;

  /** Default: 60000 */
  @IsOptional()
  @IsNumber()
  @Min(1)
  RATE_LIMIT_DEFAULT_TTL_MS?: number;

  /** Default: 100 */
  @IsOptional()
  @IsNumber()
  @Min(1)
  RATE_LIMIT_DEFAULT_LIMIT?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  RATE_LIMIT_AUTH_TTL_MS?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  RATE_LIMIT_AUTH_LIMIT?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  RATE_LIMIT_READ_TTL_MS?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  RATE_LIMIT_READ_LIMIT?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  RATE_LIMIT_WRITE_TTL_MS?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  RATE_LIMIT_WRITE_LIMIT?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  DISPUTE_EVIDENCE_MAX_SIZE_BYTES?: number;

  @IsOptional()
  @IsString()
  DISPUTE_EVIDENCE_ALLOWED_MIME_TYPES?: string;

  /** Default: 5 */
  @IsOptional()
  @IsNumber()
  @Min(1)
  AUTH_THROTTLE_LIMIT?: number;

  /** Default: 60000 */
  @IsOptional()
  @IsNumber()
  @Min(1)
  AUTH_THROTTLE_TTL_MS?: number;

  /** Default: unset */
  @IsOptional()
  @IsNumber()
  @Min(1)
  PUBLIC_API_THROTTLE_LIMIT?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  PUBLIC_API_THROTTLE_TTL_MS?: number;

  /** Default: unset (SendGrid disabled — emails logged in dev) */
  @IsOptional()
  @IsString()
  SENDGRID_API_KEY?: string;

  /** Default: notifications@insightarena.app */
  @IsOptional()
  @IsString()
  EMAIL_FROM?: string = 'notifications@insightarena.app';

  /** Default: 30 */
  @IsOptional()
  @IsNumber()
  @Min(1)
  EMAIL_RATE_LIMIT_PER_MINUTE?: number;

  /** Default: 3 */
  @IsOptional()
  @IsNumber()
  @Min(1)
  EMAIL_RETRY_MAX_ATTEMPTS?: number;

  /** Default: 1000 */
  @IsOptional()
  @IsNumber()
  @Min(1)
  EMAIL_RETRY_BASE_DELAY_MS?: number;

  /** Default: true */
  @IsOptional()
  @IsBooleanString()
  DIGEST_ENABLED?: string;

  /** Default: 1 (Monday) */
  @IsOptional()
  @IsNumber()
  @Min(0)
  DIGEST_WEEKLY_DAY?: number;

  /** Default: unset */
  @IsOptional()
  @IsString()
  MATCH_RESULTS_FEED_URL?: string;

  @IsOptional()
  @IsString()
  MATCH_RESULTS_FEED_CREDENTIAL?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  MATCH_RESULTS_POLL_INTERVAL_MS?: number;

  /** Default: 500 */
  @IsOptional()
  @IsNumber()
  @Min(1)
  ODDS_THROTTLE_MS?: number;

  /** Default: unset */
  @IsOptional()
  @IsString()
  ORACLE_API_KEY?: string;

  @IsOptional()
  @IsString()
  AI_AGENT_ADDRESS?: string;

  @IsOptional()
  @IsBooleanString()
  CACHE_WARMING_ENABLED?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  ACTIVE_USERS_IDLE_WINDOW_MS?: number;

  @IsOptional()
  @IsIn(['true', 'false'])
  SWAGGER_EXPORT?: string;
}

const DEFAULT_SOROBAN_RPC: Record<StellarNetwork, string> = {
  [StellarNetwork.TESTNET]: 'https://soroban-testnet.stellar.org',
  [StellarNetwork.MAINNET]: 'https://soroban-mainnet.stellar.org',
};

export function validate(config: Record<string, unknown>) {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    const errorMessages = errors
      .map((error) => {
        const constraints = error.constraints
          ? Object.values(error.constraints).join(', ')
          : 'Unknown validation error';
        return `${error.property}: ${constraints}`;
      })
      .join('\n');

    throw new Error(
      `Environment validation failed:\n${errorMessages}\n\nPlease check your .env file and ensure all required variables are set.`,
    );
  }

  if (!validatedConfig.SOROBAN_RPC_URL) {
    validatedConfig.SOROBAN_RPC_URL =
      DEFAULT_SOROBAN_RPC[validatedConfig.STELLAR_NETWORK];
  }

  return validatedConfig;
}

export type ValidatedEnvironment = ReturnType<typeof validate>;
