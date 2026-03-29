import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Keypair } from '@stellar/stellar-sdk';
import { Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { AuthService } from './auth.service';

type UsersRepoMock = jest.Mocked<
  Pick<Repository<User>, 'findOneBy' | 'create' | 'save'>
>;

describe('AuthService', () => {
  let service: AuthService;
  let jwtService: jest.Mocked<JwtService>;
  let usersRepository: UsersRepoMock;

  const address = 'GABC1234567890';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: JwtService,
          useValue: {
            signAsync: jest.fn().mockResolvedValue('token.jwt.value'),
          },
        },
        {
          provide: getRepositoryToken(User),
          useValue: {
            findOneBy: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jwtService = module.get(JwtService);
    usersRepository = module.get(getRepositoryToken(User));
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('generateChallenge() returns unique nonce each call', () => {
    const one = service.generateChallenge(address);
    const two = service.generateChallenge(address);

    expect(one).not.toEqual(two);
    expect(one).toContain('InsightArena:nonce:');
    expect(two).toContain(address);
  });

  it('verifySignature() returns user on valid sig', async () => {
    service.generateChallenge(address);
    jest.spyOn(service, 'verifyStellarSignature').mockReturnValue(true);

    const savedUser = { id: 'u-1', stellar_address: address } as User;
    usersRepository.findOneBy.mockResolvedValue(null);
    usersRepository.create.mockReturnValue(savedUser);
    usersRepository.save.mockResolvedValue(savedUser);

    const user = await service.verifySignature(address, 'signed-hex');

    expect(user).toEqual(savedUser);
    expect(usersRepository.save).toHaveBeenCalledWith(savedUser);
  });

  it('verifySignature() throws UnauthorizedException on invalid sig', async () => {
    service.generateChallenge(address);
    jest.spyOn(service, 'verifyStellarSignature').mockReturnValue(false);

    await expect(service.verifySignature(address, 'bad-sig')).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('expired nonce throws UnauthorizedException', async () => {
    jest.useFakeTimers();

    service.generateChallenge(address);
    jest.advanceTimersByTime(5 * 60 * 1000 + 1);

    await expect(service.verifySignature(address, 'any-sig')).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('verifyChallenge() returns token and user', async () => {
    service.generateChallenge(address);
    jest.spyOn(service, 'verifyStellarSignature').mockReturnValue(true);

    const savedUser = { id: 'u-2', stellar_address: address } as User;
    usersRepository.findOneBy.mockResolvedValue(savedUser);
    usersRepository.save.mockResolvedValue(savedUser);

    const result = await service.verifyChallenge(address, 'signed-hex');

    expect(result).toEqual({
      access_token: 'token.jwt.value',
      user: savedUser,
    });
    expect(jwtService.signAsync.mock.calls[0][0]).toEqual({
      sub: 'u-2',
      stellar_address: address,
    });
  });

  it('removeChallenge() invalidates challenge', () => {
    const challenge = service.generateChallenge(address);

    expect(service.isValidChallenge(challenge)).toBe(true);
    service.removeChallenge(challenge);
    expect(service.isValidChallenge(challenge)).toBe(false);
  });

  it('isValidChallenge() returns false for unknown challenge', () => {
    expect(service.isValidChallenge('unknown')).toBe(false);
  });

  it('verifySignature() throws when nonce is already used', async () => {
    const challenge = service.generateChallenge(address);

    const cache = (
      service as unknown as {
        challengeCache: Map<string, { expiresAt: number; used: boolean }>;
      }
    ).challengeCache;
    const entry = cache.get(challenge)!;
    entry.used = true;
    cache.set(challenge, entry);

    jest
      .spyOn(
        service as unknown as {
          findValidChallengeForAddress: (addr: string) => string | null;
        },
        'findValidChallengeForAddress',
      )
      .mockReturnValue(challenge);

    await expect(service.verifySignature(address, 'any-sig')).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('isValidChallenge() deletes and rejects expired challenges', () => {
    jest.useFakeTimers();

    const challenge = service.generateChallenge(address);
    jest.advanceTimersByTime(5 * 60 * 1000 + 1);

    expect(service.isValidChallenge(challenge)).toBe(false);
  });

  it('generateChallenge() cleanup removes stale cache entries', () => {
    const stale = 'InsightArena:nonce:1:stale:' + address;

    const cache = (
      service as unknown as {
        challengeCache: Map<string, { expiresAt: number; used: boolean }>;
      }
    ).challengeCache;

    cache.set(stale, {
      expiresAt: Date.now() - 1,
      used: false,
    });

    service.generateChallenge(address);
    expect(cache.has(stale)).toBe(false);
  });

  it('verifyStellarSignature() uses mocked Keypair.verify and returns true', () => {
    const verify = jest.fn().mockReturnValue(true);
    jest
      .spyOn(Keypair, 'fromPublicKey')
      .mockReturnValue({ verify } as unknown as Keypair);

    const ok = service.verifyStellarSignature(address, 'challenge', 'abcd');

    expect(ok).toBe(true);
    expect(verify).toHaveBeenCalled();
  });

  it('verifyStellarSignature() returns false when sdk throws', () => {
    jest.spyOn(Keypair, 'fromPublicKey').mockImplementation(() => {
      throw new Error('invalid key');
    });

    const ok = service.verifyStellarSignature('bad-key', 'challenge', 'abcd');

    expect(ok).toBe(false);
  });
});
