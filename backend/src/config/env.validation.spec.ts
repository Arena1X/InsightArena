import 'reflect-metadata';
import { validate } from './env.validation';

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
});
