import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Keypair } from '@stellar/stellar-sdk';
import request, { SuperTest, Test as SuperTestRequest } from 'supertest';
import { User } from '../users/entities/user.entity';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

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
  user: { id: string; stellar_address: string };
};

describe('Auth E2E — challenge → verify flow', () => {
  let app: INestApplication;
  let server: SuperTest<SuperTestRequest>;

  let mockUsersRepository: {
    findOneBy: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };

  beforeAll(async () => {
    mockUsersRepository = {
      findOneBy: jest.fn(),
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

    mockJwtService.signAsync.mockResolvedValue('mock-jwt-token');
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
});
