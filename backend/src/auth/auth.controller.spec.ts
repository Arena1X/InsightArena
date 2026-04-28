import { UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { User } from '../users/entities/user.entity';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { VerifyChallengeDto } from './dto/verify-challenge.dto';
import { RateLimitService } from './rate-limit.service';

const mockAuthService = () => ({
  generateChallenge: jest
    .fn()
    .mockImplementation(
      (address: string) => `InsightArena:nonce:1234567890:randomhex:${address}`,
    ),
  verifyChallenge: jest.fn(),
  verifyStellarSignature: jest.fn(),
});

describe('AuthController', () => {
  let controller: AuthController;
  let authService: ReturnType<typeof mockAuthService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: mockAuthService() },
        {
          provide: RateLimitService,
          useValue: { getRateLimitStatus: jest.fn() },
        },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
    authService = module.get(AuthService);
  });

  describe('generateChallenge', () => {
    it('returns a challenge string for a valid stellar_address', () => {
      const result = controller.generateChallenge({ stellar_address: 'GABC' });
      expect(authService.generateChallenge).toHaveBeenCalledWith('GABC');
      expect(result.challenge).toMatch(/^InsightArena:nonce:/);
    });
  });

  describe('verifyChallenge', () => {
    const dto: VerifyChallengeDto = {
      stellar_address: 'GABC123XYZ',
      signed_challenge: 'aabbcc',
    };

    it('returns { access_token, user } on valid input', async () => {
      const user = Object.assign(new User(), {
        id: 'uuid-1',
        stellar_address: dto.stellar_address,
      });
      authService.verifyChallenge.mockResolvedValue({
        access_token: 'signed.jwt.token',
        user,
      });

      const result = await controller.verifyChallenge(dto);

      expect(authService.verifyChallenge).toHaveBeenCalledWith(
        dto.stellar_address,
        dto.signed_challenge,
      );
      expect(result).toEqual({ access_token: 'signed.jwt.token', user });
    });

    it('propagates UnauthorizedException from the service (invalid signature)', async () => {
      authService.verifyChallenge.mockRejectedValue(
        new UnauthorizedException('Invalid signature'),
      );

      await expect(controller.verifyChallenge(dto)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('propagates UnauthorizedException from the service (expired nonce)', async () => {
      authService.verifyChallenge.mockRejectedValue(
        new UnauthorizedException(
          'No valid challenge found or challenge expired',
        ),
      );

      await expect(controller.verifyChallenge(dto)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('propagates UnauthorizedException from the service (replay attack)', async () => {
      authService.verifyChallenge.mockRejectedValue(
        new UnauthorizedException('Challenge already used'),
      );

      await expect(controller.verifyChallenge(dto)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('verifyWallet', () => {
    it('should return { verified: true } for a valid signature', () => {
      const dto = {
        stellar_address: 'G...Address',
        challenge: 'InsightArena:dispute:123',
        signature: 'a1b2c3d4',
      };
      authService.verifyStellarSignature.mockReturnValue(true);

      const result = controller.verifyWallet(dto);

      expect(result).toEqual({ verified: true });
      expect(authService.verifyStellarSignature).toHaveBeenCalledWith(
        dto.stellar_address,
        dto.challenge,
        dto.signature,
      );
    });

    it('should return { verified: false } for an invalid signature', () => {
      const dto = {
        stellar_address: 'G...Address',
        challenge: 'InsightArena:dispute:123',
        signature: 'wrong-signature',
      };
      authService.verifyStellarSignature.mockReturnValue(false);

      const result = controller.verifyWallet(dto);

      expect(result).toEqual({ verified: false });
    });
  });
});
