import 'reflect-metadata';
import { readFileSync } from 'fs';
import { join } from 'path';
import { LOCAL_DEV_DATABASE_URL, validate } from './env.validation';

/** Parse backend/.env.example (KEY=VALUE lines, `#` comments ignored). */
function readEnvExample(): Record<string, string> {
  const raw = readFileSync(join(__dirname, '../../.env.example'), 'utf8');
  const env: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return env;
}

const validEnv: Record<string, string> = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/insightarena',
  JWT_SECRET: 'a'.repeat(32),
  JWT_EXPIRES_IN: '7d',
  STELLAR_NETWORK: 'testnet',
  SOROBAN_CONTRACT_ID: 'CABC123',
  SERVER_SECRET_KEY: 'SABC123',
};

describe('validate()', () => {
  it('accepts a complete valid configuration', () => {
    const result = validate({ ...validEnv });

    expect(result.DATABASE_URL).toBe(validEnv.DATABASE_URL);
    expect(result.SOROBAN_RPC_URL).toBe('https://soroban-testnet.stellar.org');
  });

  it('throws with descriptive messages when required variables are missing', () => {
    expect(() => validate({})).toThrow(
      /Environment validation failed:[\s\S]*DATABASE_URL/,
    );
    expect(() => validate({})).toThrow(/JWT_SECRET/);
    expect(() => validate({})).toThrow(
      /Please check your .env file and ensure all required variables are set/,
    );
  });

  it('rejects an invalid STELLAR_NETWORK value', () => {
    expect(() =>
      validate({
        ...validEnv,
        STELLAR_NETWORK: 'devnet',
      }),
    ).toThrow(/STELLAR_NETWORK must be either "testnet" or "mainnet"/);
  });

  it('rejects a JWT_SECRET shorter than 32 characters', () => {
    expect(() =>
      validate({
        ...validEnv,
        JWT_SECRET: 'too-short',
      }),
    ).toThrow(/JWT_SECRET must be at least 32 characters long/);
  });

  it('rejects invalid numeric optional values', () => {
    expect(() =>
      validate({
        ...validEnv,
        PORT: 'not-a-number',
      }),
    ).toThrow(/PORT/);
  });

  it('applies documented defaults for optional variables', () => {
    const result = validate({
      ...validEnv,
      PORT: '4000',
      EXPORT_DIR: '/tmp/exports',
    });

    expect(result.PORT).toBe(4000);
    expect(result.EXPORT_DIR).toBe('/tmp/exports');
    expect(result.EMAIL_FROM).toBe('notifications@insightarena.app');
  });

  describe('local development defaults (docker-compose)', () => {
    it('documents a DATABASE_URL in .env.example that matches docker-compose', () => {
      expect(readEnvExample().DATABASE_URL).toBe(LOCAL_DEV_DATABASE_URL);
    });

    it('validates the documented .env.example as-is', () => {
      const result = validate(readEnvExample());

      expect(result.DATABASE_URL).toBe(LOCAL_DEV_DATABASE_URL);
      expect(result.STELLAR_NETWORK).toBe('testnet');
    });

    it('points to the docker-compose workflow when validation fails', () => {
      expect(() => validate({})).toThrow(/docker compose up -d/);
    });
  });
});
