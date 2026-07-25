import { plainToInstance } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MinLength,
  validateSync,
} from 'class-validator';

enum StellarNetwork {
  TESTNET = 'testnet',
  MAINNET = 'mainnet',
}

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

  @IsNumber()
  PORT: number = 3000;

  @IsNumber()
  WEBHOOK_MAX_ATTEMPTS: number = 5;

  @IsNumber()
  WEBHOOK_TIMEOUT_MS: number = 5000;

  @IsNumber()
  WEBHOOK_BATCH_SIZE: number = 50;

  @IsOptional()
  @IsString()
  RECONCILE_ENABLED?: string;

  @IsOptional()
  @IsNumber()
  RECONCILE_INTERVAL_MS?: number;

  @IsOptional()
  @IsNumber()
  RECONCILE_WINDOW?: number;

  @IsString()
  EXPORT_DIR: string = './exports';

  @IsNumber()
  EXPORT_TTL_HOURS: number = 48;

  @IsString()
  LEADERBOARD_SNAPSHOT_CRON: string = '0 * * * *';

  @IsNumber()
  LEADERBOARD_SNAPSHOT_RETENTION_DAYS: number = 30;

  // Oracle submission anomaly detection (#1364)
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

  // Dispute evidence attachments (#1363)
  @IsOptional()
  @IsNumber()
  DISPUTE_EVIDENCE_MAX_SIZE_BYTES?: number;

  @IsOptional()
  @IsString()
  DISPUTE_EVIDENCE_ALLOWED_MIME_TYPES?: string;

  // Incoming webhook signature verification & replay protection (#1376)
  @IsOptional()
  @IsString()
  WEBHOOK_HMAC_SECRET?: string;

  @IsOptional()
  @IsNumber()
  WEBHOOK_REPLAY_WINDOW_SECONDS?: number;
}

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

  return validatedConfig;
}
