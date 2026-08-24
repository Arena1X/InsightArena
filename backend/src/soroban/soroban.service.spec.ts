import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import {
  rpc as SorobanRpc,
  Keypair,
  StrKey,
  SorobanDataBuilder,
} from '@stellar/stellar-sdk';
import { SorobanService } from './soroban.service';

describe('SorobanService', () => {
  let service: SorobanService;
  let mockConfigService: jest.Mocked<ConfigService>;

  const testKeypair = Keypair.random();
  const testServerKeypair = Keypair.random();
  const testMarketId = 'market_123';
  const testOutcome = 'Yes';
  const testStake = '1000000';
  // Generate a valid Soroban contract ID (starts with 'C')
  const validContractId = StrKey.encodeContract(Buffer.alloc(32));

  beforeEach(async () => {
    mockConfigService = {
      get: jest.fn((key: string) => {
        const values: Record<string, string> = {
          SOROBAN_CONTRACT_ID: validContractId,
          STELLAR_NETWORK: 'testnet',
          SERVER_SECRET_KEY: testServerKeypair.secret(),
          SOROBAN_RPC_URL: 'https://soroban-testnet.stellar.org',
        };
        return values[key];
      }),
    } as unknown as jest.Mocked<ConfigService>;

    jest
      .spyOn(SorobanRpc.Server.prototype, 'getHealth')
      .mockResolvedValue({ status: 'healthy' } as never);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SorobanService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<SorobanService>(SorobanService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('initializes rpc client and passes connection test', async () => {
    expect(service.getRpcClient()).toBeDefined();
    await expect(service.testConnection()).resolves.toBe(true);
  });

  describe('submitPrediction', () => {
    it('should submit a prediction and return tx_hash', async () => {
      const result = await service.submitPrediction(
        testKeypair.publicKey(),
        testMarketId,
        testOutcome,
        testStake,
      );

      expect(result.tx_hash).toBeDefined();
      expect(result.tx_hash).toHaveLength(64);
    });

    it('should throw on invalid user address', async () => {
      await expect(
        service.submitPrediction(
          'invalid-address',
          testMarketId,
          testOutcome,
          testStake,
        ),
      ).rejects.toThrow();
    });
  });

  describe('claimPayout', () => {
    it('should claim payout and return tx_hash', async () => {
      const result = await service.claimPayout(
        testKeypair.publicKey(),
        testMarketId,
      );

      expect(result.tx_hash).toBeDefined();
      expect(result.tx_hash).toHaveLength(64);
    });

    it('should throw on invalid user address', async () => {
      await expect(
        service.claimPayout('invalid-address', testMarketId),
      ).rejects.toThrow();
    });
  });

  describe('refundCompetitionParticipant', () => {
    it('should successfully refund a participant', async () => {
      const mockTxHash = 'a'.repeat(64);
      jest.spyOn(SorobanRpc.Server.prototype, 'getAccount').mockResolvedValue({
        sequenceNumber: () => '1',
        accountId: () => testServerKeypair.publicKey(),
        incrementSequenceNumber: () => {},
      } as never);

      jest
        .spyOn(SorobanRpc.Server.prototype, 'simulateTransaction')
        .mockResolvedValue({
          results: [{}],
          transactionData: new SorobanDataBuilder(),
          result: { auth: [] },
          minResourceFee: '100',
          _parsed: true,
        } as never);

      jest
        .spyOn(SorobanRpc.Server.prototype, 'sendTransaction')
        .mockResolvedValue({
          status: 'PENDING',
          hash: mockTxHash,
        } as never);

      jest
        .spyOn(SorobanRpc.Server.prototype, 'getTransaction')
        .mockResolvedValue({
          status: 'SUCCESS',
          hash: mockTxHash,
        } as never);

      const result = await service.refundCompetitionParticipant(
        testKeypair.publicKey(),
        'comp_123',
        '1000000',
      );

      expect(result.tx_hash).toBe(mockTxHash);
    });

    it('should throw EscrowEmpty error when simulation fails with that message', async () => {
      jest.spyOn(SorobanRpc.Server.prototype, 'getAccount').mockResolvedValue({
        sequenceNumber: () => '1',
        accountId: () => testServerKeypair.publicKey(),
        incrementSequenceNumber: () => {},
      } as never);

      jest
        .spyOn(SorobanRpc.Server.prototype, 'simulateTransaction')
        .mockResolvedValue({
          error: 'Contract Error: EscrowEmpty',
          _parsed: true,
        } as never);

      await expect(
        service.refundCompetitionParticipant(
          testKeypair.publicKey(),
          'comp_123',
          '1000000',
        ),
      ).rejects.toThrow('EscrowEmpty');
    });

    it('should throw InsufficientFunds error when simulation fails with that message', async () => {
      jest.spyOn(SorobanRpc.Server.prototype, 'getAccount').mockResolvedValue({
        sequenceNumber: () => '1',
        accountId: () => testServerKeypair.publicKey(),
        incrementSequenceNumber: () => {},
      } as never);

      jest
        .spyOn(SorobanRpc.Server.prototype, 'simulateTransaction')
        .mockResolvedValue({
          error: 'Contract Error: InsufficientFunds',
          _parsed: true,
        } as never);

      await expect(
        service.refundCompetitionParticipant(
          testKeypair.publicKey(),
          'comp_123',
          '1000000',
        ),
      ).rejects.toThrow('InsufficientFunds');
    });
  });

  describe('resolveMarket', () => {
    it('should resolve market and return void', async () => {
      await expect(
        service.resolveMarket(testMarketId, testOutcome),
      ).resolves.toBeUndefined();
    });
  });

  describe('sendTransaction retry behavior', () => {
    const mockTxHash = 'b'.repeat(64);

    beforeEach(() => {
      jest.spyOn(SorobanRpc.Server.prototype, 'getAccount').mockResolvedValue({
        sequenceNumber: () => '1',
        accountId: () => testServerKeypair.publicKey(),
        incrementSequenceNumber: () => {},
      } as never);

      jest
        .spyOn(SorobanRpc.Server.prototype, 'simulateTransaction')
        .mockResolvedValue({
          results: [{}],
          transactionData: new SorobanDataBuilder(),
          result: { auth: [] },
          minResourceFee: '100',
          _parsed: true,
        } as never);

      jest
        .spyOn(SorobanRpc.Server.prototype, 'getTransaction')
        .mockResolvedValue({
          status: 'SUCCESS',
          hash: mockTxHash,
        } as never);

      // Retry backoff sleeps use setTimeout; keep tests fast.
      jest.spyOn(global, 'setTimeout').mockImplementation(((fn: () => void) => {
        fn();
        return 0 as unknown as NodeJS.Timeout;
      }) as unknown as typeof setTimeout);
    });

    it('retries a transient network error on sendTransaction and eventually succeeds', async () => {
      const sendTransactionSpy = jest
        .spyOn(SorobanRpc.Server.prototype, 'sendTransaction')
        .mockRejectedValueOnce(new TypeError('fetch failed'))
        .mockResolvedValueOnce({
          status: 'PENDING',
          hash: mockTxHash,
        } as never);

      const result = await service.refundCompetitionParticipant(
        testKeypair.publicKey(),
        'comp_123',
        '1000000',
      );

      expect(result.tx_hash).toBe(mockTxHash);
      expect(sendTransactionSpy).toHaveBeenCalledTimes(2);
    });

    it('does not retry a definitive rejection (permanent error) on sendTransaction', async () => {
      const sendTransactionSpy = jest
        .spyOn(SorobanRpc.Server.prototype, 'sendTransaction')
        .mockResolvedValue({
          status: 'ERROR',
          errorResult: { message: 'txBadAuth' },
        } as never);

      await expect(
        service.refundCompetitionParticipant(
          testKeypair.publicKey(),
          'comp_123',
          '1000000',
        ),
      ).rejects.toThrow(/Transaction submission failed/);

      expect(sendTransactionSpy).toHaveBeenCalledTimes(1);
    });

    it('surfaces the final error after exhausting retries on persistent transient failures', async () => {
      const sendTransactionSpy = jest
        .spyOn(SorobanRpc.Server.prototype, 'sendTransaction')
        .mockRejectedValue(new TypeError('fetch failed'));

      await expect(
        service.refundCompetitionParticipant(
          testKeypair.publicKey(),
          'comp_123',
          '1000000',
        ),
      ).rejects.toThrow('fetch failed');

      expect(sendTransactionSpy).toHaveBeenCalledTimes(3);
    });
  });
});
