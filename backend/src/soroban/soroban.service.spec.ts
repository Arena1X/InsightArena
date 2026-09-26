import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import {
  rpc as SorobanRpc,
  Keypair,
  StrKey,
  SorobanDataBuilder,
} from '@stellar/stellar-sdk';
import { SorobanService, SorobanUnavailableError } from './soroban.service';

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

  function buildConfigService(
    overrides: Record<string, string | number> = {},
  ): jest.Mocked<ConfigService> {
    return {
      get: jest.fn((key: string) => {
        const values: Record<string, string | number> = {
          SOROBAN_CONTRACT_ID: validContractId,
          STELLAR_NETWORK: 'testnet',
          SERVER_SECRET_KEY: testServerKeypair.secret(),
          SOROBAN_RPC_URL: 'https://soroban-testnet.stellar.org',
          ...overrides,
        };
        return values[key];
      }),
    } as unknown as jest.Mocked<ConfigService>;
  }

  async function buildService(
    overrides: Record<string, string | number> = {},
  ): Promise<SorobanService> {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SorobanService,
        { provide: ConfigService, useValue: buildConfigService(overrides) },
      ],
    }).compile();

    return module.get<SorobanService>(SorobanService);
  }

  beforeEach(async () => {
    mockConfigService = buildConfigService();

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

  describe('pauseMarket / resumeMarket round-trip state consistency', () => {
    const mockTxHash = 'c'.repeat(64);

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
    });

    it('reflects paused only after pauseMarket on-chain confirmation, not optimistically before it', async () => {
      let resolveConfirmation: (value: unknown) => void = () => {};
      const confirmation = new Promise((resolve) => {
        resolveConfirmation = resolve;
      });

      jest
        .spyOn(SorobanRpc.Server.prototype, 'sendTransaction')
        .mockResolvedValue({ status: 'PENDING', hash: mockTxHash } as never);
      jest
        .spyOn(SorobanRpc.Server.prototype, 'getTransaction')
        .mockReturnValue(confirmation as never);

      const pausePromise = service.pauseMarket(testMarketId);

      // While the on-chain call is still unconfirmed, the mirrored status must
      // not have flipped to paused yet.
      expect(service.getMarketStatus(testMarketId)).not.toBe('paused');

      resolveConfirmation({ status: 'SUCCESS', hash: mockTxHash });
      await pausePromise;

      expect(service.getMarketStatus(testMarketId)).toBe('paused');
    });

    it('leaves the mirrored status as still paused when resumeMarket fails', async () => {
      jest
        .spyOn(SorobanRpc.Server.prototype, 'sendTransaction')
        .mockResolvedValue({ status: 'PENDING', hash: mockTxHash } as never);
      jest
        .spyOn(SorobanRpc.Server.prototype, 'getTransaction')
        .mockResolvedValue({ status: 'SUCCESS', hash: mockTxHash } as never);

      await service.pauseMarket(testMarketId);
      expect(service.getMarketStatus(testMarketId)).toBe('paused');

      jest
        .spyOn(SorobanRpc.Server.prototype, 'sendTransaction')
        .mockResolvedValue({
          status: 'ERROR',
          errorResult: { message: 'txFailed' },
        } as never);

      await expect(service.resumeMarket(testMarketId)).rejects.toThrow();

      // A failed resume must not optimistically mark the market resumed.
      expect(service.getMarketStatus(testMarketId)).toBe('paused');
    });

    it('returns the mirrored status to its original unpaused value after a successful pause-then-resume round trip', async () => {
      jest
        .spyOn(SorobanRpc.Server.prototype, 'sendTransaction')
        .mockResolvedValue({ status: 'PENDING', hash: mockTxHash } as never);
      jest
        .spyOn(SorobanRpc.Server.prototype, 'getTransaction')
        .mockResolvedValue({ status: 'SUCCESS', hash: mockTxHash } as never);

      const originalStatus = service.getMarketStatus(testMarketId);
      expect(originalStatus).not.toBe('paused');

      await service.pauseMarket(testMarketId);
      expect(service.getMarketStatus(testMarketId)).toBe('paused');

      await service.resumeMarket(testMarketId);
      expect(service.getMarketStatus(testMarketId)).toBe(originalStatus);
    });
  });

  describe('sendTransaction ambiguous-failure handling', () => {
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
    });

    it('does not retry a definitive rejection (permanent error), and never checks tx status', async () => {
      const sendTransactionSpy = jest
        .spyOn(SorobanRpc.Server.prototype, 'sendTransaction')
        .mockResolvedValue({
          status: 'ERROR',
          errorResult: { message: 'txBadAuth' },
        } as never);
      const getTransactionSpy = jest.spyOn(
        SorobanRpc.Server.prototype,
        'getTransaction',
      );

      await expect(
        service.refundCompetitionParticipant(
          testKeypair.publicKey(),
          'comp_123',
          '1000000',
        ),
      ).rejects.toThrow(/Transaction submission failed/);

      expect(sendTransactionSpy).toHaveBeenCalledTimes(1);
      expect(getTransactionSpy).not.toHaveBeenCalled();
    });

    it('on an ambiguous failure, retries and eventually succeeds', async () => {
      const sendTransactionSpy = jest
        .spyOn(SorobanRpc.Server.prototype, 'sendTransaction')
        .mockResolvedValueOnce({
          status: 'TRY_AGAIN_LATER',
        } as never)
        .mockResolvedValueOnce({
          status: 'PENDING',
          hash: mockTxHash,
        } as never);

      jest
        .spyOn(SorobanRpc.Server.prototype, 'getTransaction')
        .mockResolvedValue({ status: 'SUCCESS', hash: mockTxHash } as never);

      const result = await service.refundCompetitionParticipant(
        testKeypair.publicKey(),
        'comp_123',
        '1000000',
      );

      expect(result.tx_hash).toBe(mockTxHash);
      expect(sendTransactionSpy).toHaveBeenCalledTimes(2);
    });
  });
});
