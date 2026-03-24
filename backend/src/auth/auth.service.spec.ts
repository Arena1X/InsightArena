import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AuthService],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateChallenge', () => {
    it('should generate a valid challenge format', () => {
      const challenge = service.generateChallenge('some-address');

      // Expected format: InsightArena:nonce:{timestamp}:{random}:{stellar_address}
      const parts = challenge.split(':');
      expect(parts.length).toBe(5);
      expect(parts[0]).toBe('InsightArena');
      expect(parts[1]).toBe('nonce');
      expect(!isNaN(Number(parts[2]))).toBeTruthy();
      expect(parts[3].length).toBeGreaterThan(0);
      expect(parts[4]).toBe('some-address');
    });

    it('should generate unique challenges', () => {
      const challenge1 = service.generateChallenge('addr1');
      const challenge2 = service.generateChallenge('addr2');
      expect(challenge1).not.toBe(challenge2);
    });

    it('should validate a correctly generated challenge', () => {
      const challenge = service.generateChallenge('addr1');
      expect(service.isValidChallenge(challenge)).toBe(true);
    });

    it('should false on invalid challenge', () => {
      expect(service.isValidChallenge('invalid-challenge')).toBe(false);
    });

    it('should expire challenge after TTL', () => {
      jest.useFakeTimers();

      const challenge = service.generateChallenge('addr1');
      expect(service.isValidChallenge(challenge)).toBe(true);

      // Fast-forward time past 5 minutes (5 * 60 * 1000 = 300000ms)
      jest.advanceTimersByTime(300001);

      expect(service.isValidChallenge(challenge)).toBe(false);

      jest.useRealTimers();
    });
  });
});
