import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Keypair } from '@stellar/stellar-sdk';
import request, { SuperTest, Test as SuperTestRequest } from 'supertest';
import { User } from '../users/entities/user.entity';
import { UserPreferences } from '../users/entities/user-preferences.entity';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { RefreshToken } from './entities/refresh-token.entity';
import { AuthAuditEvent } from './entities/auth-audit-event.entity';
import { JwtStrategy } from './strategies/jwt.strategy';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RateLimitService } from './rate-limit.service';
import { ThrottlerModule } from '@nestjs/throttler';

const sign = (kp: Keypair, text: string): string =>
  kp.sign(Buffer.from(text, 'utf-8')).toString('hex');

const mockJwtAuthGuard = {
  canActivate: jest.fn(() => true),
};

const mockJwtService = {
  signAsync: jest.fn(),
  verify: jest.fn(),
  decode: jest.fn(),
};

type ChallengeResponse = { challenge: string };
type VerifyResponse = {
  access_token: string;
  refresh_token: string;
  user: { id: string; stellar_address: string };
};
type RefreshResponse = {
  access_token: string;
  refresh_token: string;
  expires_at: string;
};

describe('Auth E2E — challenge → verify flow', () => {
  let app: INestApplication;
  let server: SuperTest<SuperTestRequest>;

  let mockUsersRepository: {
    findOneBy: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };

  let mockUserPreferencesRepository: {
    findOneBy: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };

  let mockRefreshTokenRepository: {
    findOneBy: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    update: jest.Mock;
  };

  let mockAuthAuditEventRepository: {
    create: jest.Mock;
    save: jest.Mock;
  };

  let refreshTokenStore: Map<
    string,
    {
      id: string;
      token_hash: string;
      family_id: string;
      user_id: string;
      revoked_at: Date | null;
      expires_at: Date;
      previous_token_id: string | null;
    }
  >;

  beforeAll(async () => {
    mockUsersRepository = {
      findOneBy: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };

    mockUserPreferencesRepository = {
      findOneBy: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };

    mockRefreshTokenRepository = {
      findOneBy: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
    };

    mockAuthAuditEventRepository = {
      create: jest.fn(),
      save: jest.fn(),
    };

    mockJwtService.signAsync.mockResolvedValue('mock-jwt-token');

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        AuthService,
        { provide: JwtService, useValue: mockJwtService },
        JwtStrategy,
        Reflector,
        {
          provide: RateLimitService,
          useValue: {
            getRateLimitStatus: jest.fn().mockResolvedValue({
              limit: 100,
              remaining: 99,
              reset_at: new Date(),
            }),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const cfg: Record<string, string> = {
                JWT_SECRET: 'super-secret-test-key-min-32-chars!!',
                JWT_EXPIRES_IN: '1h',
                JWT_ISSUER: 'insightarena',
                JWT_AUDIENCE: 'insightarena-users',
              };
              return cfg[key];
            }),
          },
        },
        {
          provide: getRepositoryToken(User),
          useValue: mockUsersRepository,
        },
        {
          provide: getRepositoryToken(UserPreferences),
          useValue: mockUserPreferencesRepository,
        },
        {
          provide: getRepositoryToken(RefreshToken),
          useValue: mockRefreshTokenRepository,
        },
        {
          provide: getRepositoryToken(AuthAuditEvent),
          useValue: mockAuthAuditEventRepository,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(mockJwtAuthGuard)
      .compile();

    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    await app.init();
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];
    // @ts-expect-error supertest type mismatch
    server = request(httpServer);
  });

  beforeEach(() => {
    jest.clearAllMocks();

    mockUsersRepository.findOneBy.mockResolvedValue(null);

    mockUsersRepository.create.mockImplementation(
      (dto: { stellar_address: string }) => {
        const user = new User();
        user.stellar_address = dto.stellar_address;
        user.id = 'e2e-uuid';
        return user;
      },
    );

    mockUsersRepository.save.mockImplementation((user: User) =>
      Promise.resolve({ ...user, id: user.id || 'e2e-uuid' }),
    );

    mockUserPreferencesRepository.findOneBy.mockResolvedValue(null);
    mockUserPreferencesRepository.create.mockImplementation(
      (dto: { userId: string }) =>
        ({
          id: 'prefs-uuid',
          userId: dto.userId,
        }) as UserPreferences,
    );
    mockUserPreferencesRepository.save.mockImplementation(
      (prefs: UserPreferences) => Promise.resolve(prefs),
    );

    mockJwtService.signAsync.mockResolvedValue('mock-jwt-token');

    // In-memory refresh_tokens table stand-in, reset per test.
    refreshTokenStore = new Map();
    let refreshTokenIdCounter = 0;

    mockRefreshTokenRepository.create.mockImplementation(
      (data: Partial<RefreshToken>) =>
        ({
          id: `rt-${++refreshTokenIdCounter}`,
          revoked_at: null,
          ...data,
        }) as RefreshToken,
    );
    mockRefreshTokenRepository.save.mockImplementation(
      (entity: RefreshToken) => {
        refreshTokenStore.set(entity.id, entity);
        return Promise.resolve(entity);
      },
    );
    mockRefreshTokenRepository.findOneBy.mockImplementation(
      (where: { token_hash: string }) => {
        const found = [...refreshTokenStore.values()].find(
          (t) => t.token_hash === where.token_hash,
        );
        return Promise.resolve(found ?? null);
      },
    );
    mockRefreshTokenRepository.update.mockImplementation(
      (where: { family_id: string }, set: { revoked_at: Date }) => {
        for (const t of refreshTokenStore.values()) {
          if (t.family_id === where.family_id && !t.revoked_at) {
            t.revoked_at = set.revoked_at;
          }
        }
        return Promise.resolve({ affected: 0, raw: [], generatedMaps: [] });
      },
    );

    mockAuthAuditEventRepository.create.mockImplementation(
      (data: Partial<AuthAuditEvent>) => ({ id: 'audit-1', ...data }),
    );
    mockAuthAuditEventRepository.save.mockImplementation(
      (entity: AuthAuditEvent) => Promise.resolve(entity),
    );
  });

  afterAll(async () => {
    await app.close();
  });

  it('full happy-path', async () => {
    const kp = Keypair.random();
    const address = kp.publicKey();

    const res = await server
      .post('/auth/challenge')
      .send({ stellar_address: address })
      .expect(200);

    const challenge = (res.body as ChallengeResponse).challenge;

    const mockUser = { id: 'e2e-uuid', stellar_address: address };
    mockUsersRepository.findOneBy.mockResolvedValueOnce(null);
    mockUsersRepository.create.mockReturnValueOnce(mockUser);
    mockUsersRepository.save.mockResolvedValueOnce(mockUser);

    const sig = sign(kp, challenge);

    const verifyRes = await server
      .post('/auth/verify')
      .send({ stellar_address: address, signed_challenge: sig })
      .expect(200);

    const body = verifyRes.body as VerifyResponse;

    expect(body.access_token).toBe('mock-jwt-token');
    expect(body.user.stellar_address).toBe(address);

    expect(mockJwtService.signAsync).toHaveBeenCalledWith({
      sub: 'e2e-uuid',
      stellar_address: address,
    });
    expect(mockUserPreferencesRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'e2e-uuid' }),
    );
  });

  it('invalid signature → 401', async () => {
    const kp = Keypair.random();

    await server
      .post('/auth/challenge')
      .send({ stellar_address: kp.publicKey() })
      .expect(200);

    await server
      .post('/auth/verify')
      .send({ stellar_address: kp.publicKey(), signed_challenge: 'bad' })
      .expect(401);

    expect(mockUsersRepository.save).not.toHaveBeenCalled();
  });

  it('missing nonce → 401', async () => {
    const kp = Keypair.random();

    await server
      .post('/auth/verify')
      .send({ stellar_address: kp.publicKey(), signed_challenge: 'abc' })
      .expect(401);
  });

  it('replay attack → 401', async () => {
    const kp = Keypair.random();
    const address = kp.publicKey();

    const res = await server
      .post('/auth/challenge')
      .send({ stellar_address: address })
      .expect(200);

    const challenge = (res.body as ChallengeResponse).challenge;
    const sig = sign(kp, challenge);

    const mockUser = { id: 'e2e-uuid', stellar_address: address };
    mockUsersRepository.findOneBy.mockResolvedValueOnce(null);
    mockUsersRepository.create.mockReturnValueOnce(mockUser);
    mockUsersRepository.save.mockResolvedValueOnce(mockUser);

    await server
      .post('/auth/verify')
      .send({ stellar_address: address, signed_challenge: sig })
      .expect(200);

    mockUsersRepository.findOneBy.mockResolvedValue(mockUser);

    await server
      .post('/auth/verify')
      .send({ stellar_address: address, signed_challenge: sig })
      .expect(401);

    expect(mockJwtService.signAsync).toHaveBeenCalledTimes(1);
  });

  it('expired challenge → 401', async () => {
    jest.useFakeTimers();

    const kp = Keypair.random();
    const address = kp.publicKey();

    const res = await server
      .post('/auth/challenge')
      .send({ stellar_address: address })
      .expect(200);

    jest.advanceTimersByTime(300_001);

    const challenge = (res.body as ChallengeResponse).challenge;
    const sig = sign(kp, challenge);

    await server
      .post('/auth/verify')
      .send({ stellar_address: address, signed_challenge: sig })
      .expect(401);

    jest.useRealTimers();
  });

  it('missing fields → 400', async () => {
    await server
      .post('/auth/verify')
      .send({ stellar_address: 'GABC' })
      .expect(400);
  });

  it('existing user', async () => {
    const kp = Keypair.random();
    const address = kp.publicKey();

    const existingUser = {
      id: 'existing-user-id',
      stellar_address: address,
      created_at: new Date(),
    };

    mockUsersRepository.findOneBy.mockResolvedValue(existingUser);
    mockUsersRepository.save.mockResolvedValue(existingUser);

    const res = await server
      .post('/auth/challenge')
      .send({ stellar_address: address })
      .expect(200);

    const challenge = (res.body as ChallengeResponse).challenge;
    const sig = sign(kp, challenge);

    const verifyRes = await server
      .post('/auth/verify')
      .send({ stellar_address: address, signed_challenge: sig })
      .expect(200);

    const body = verifyRes.body as VerifyResponse;

    expect(body.user.id).toBe('existing-user-id');
    expect(mockUsersRepository.create).not.toHaveBeenCalled();

    expect(mockJwtService.signAsync).toHaveBeenCalledWith({
      sub: 'existing-user-id',
      stellar_address: address,
    });
  });

  describe('refresh token rotation', () => {
    /** Logs a user in and returns the refresh_token issued at login. */
    const setupLoggedInUser = async (): Promise<string> => {
      const kp = Keypair.random();
      const address = kp.publicKey();

      const challengeRes = await server
        .post('/auth/challenge')
        .send({ stellar_address: address })
        .expect(200);
      const challenge = (challengeRes.body as ChallengeResponse).challenge;
      const sig = sign(kp, challenge);

      const user = { id: 'refresh-e2e-uuid', stellar_address: address };
      mockUsersRepository.findOneBy.mockImplementation(
        (where: { id?: string; stellar_address?: string }) => {
          if (where.id === user.id || where.stellar_address === address) {
            return Promise.resolve(user);
          }
          return Promise.resolve(null);
        },
      );
      mockUsersRepository.create.mockReturnValue(user);
      mockUsersRepository.save.mockResolvedValue(user);

      const verifyRes = await server
        .post('/auth/verify')
        .send({ stellar_address: address, signed_challenge: sig })
        .expect(200);

      const body = verifyRes.body as VerifyResponse;
      expect(body.refresh_token).toBeDefined();
      return body.refresh_token;
    };

    it('rotates: issues a new access + refresh token and invalidates the old refresh token', async () => {
      const refreshToken = await setupLoggedInUser();

      const res = await server
        .post('/auth/refresh')
        .send({ refresh_token: refreshToken })
        .expect(200);

      const body = res.body as RefreshResponse;
      expect(body.access_token).toBe('mock-jwt-token');
      expect(body.refresh_token).toBeDefined();
      expect(body.refresh_token).not.toBe(refreshToken);
      expect(body.expires_at).toBeDefined();

      // The rotated-away token can no longer be used.
      await server
        .post('/auth/refresh')
        .send({ refresh_token: refreshToken })
        .expect(401);
    });

    it('reusing an already-rotated token revokes the whole session family', async () => {
      const refreshToken = await setupLoggedInUser();

      const firstRotation = await server
        .post('/auth/refresh')
        .send({ refresh_token: refreshToken })
        .expect(200);
      const rotatedToken = (firstRotation.body as RefreshResponse)
        .refresh_token;

      // Replaying the original (now-rotated-away) token is reuse => 401.
      await server
        .post('/auth/refresh')
        .send({ refresh_token: refreshToken })
        .expect(401);

      // The reuse response emits an audit event.
      expect(mockAuthAuditEventRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          event_type: 'refresh_token_reuse_detected',
        }),
      );

      // The rest of the family (including the token from the first,
      // legitimate rotation) is revoked too — it can no longer be used.
      await server
        .post('/auth/refresh')
        .send({ refresh_token: rotatedToken })
        .expect(401);
    });

    it('unknown refresh token → 401', async () => {
      await server
        .post('/auth/refresh')
        .send({ refresh_token: 'not-a-real-token' })
        .expect(401);
    });

    it('missing refresh_token field → 400', async () => {
      await server.post('/auth/refresh').send({}).expect(400);
    });
  });
});
