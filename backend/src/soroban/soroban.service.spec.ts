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

    it('on an ambiguous failure, checks tx status by hash before ever resending, and skips resend if already submitted', async () => {
      const sendTransactionSpy = jest
        .spyOn(SorobanRpc.Server.prototype, 'sendTransaction')
        .mockRejectedValue(new TypeError('fetch failed'));

      const getTransactionSpy = jest
        .spyOn(SorobanRpc.Server.prototype, 'getTransaction')
        .mockResolvedValue({ status: 'SUCCESS', hash: mockTxHash } as never);

      const result = await service.refundCompetitionParticipant(
        testKeypair.publicKey(),
        'comp_123',
        '1000000',
      );

      // The original submission attempt is the only sendTransaction call —
      // the status check found it already landed, so no resend happened.
      expect(sendTransactionSpy).toHaveBeenCalledTimes(1);
      expect(getTransactionSpy).toHaveBeenCalled();
      expect(result.tx_hash).toBeDefined();
    });

    it('resends only after confirming no existing submission (status NOT_FOUND), then succeeds', async () => {
      const sendTransactionSpy = jest
        .spyOn(SorobanRpc.Server.prototype, 'sendTransaction')
        .mockRejectedValueOnce(new TypeError('fetch failed'))
        .mockResolvedValueOnce({
          status: 'PENDING',
          hash: mockTxHash,
        } as never);

      jest
        .spyOn(SorobanRpc.Server.prototype, 'getTransaction')
        // First call: the ambiguity check after the failed send — nothing landed.
        .mockResolvedValueOnce({ status: 'NOT_FOUND' } as never)
        // Subsequent calls: the confirmation poll after the resend succeeds.
        .mockResolvedValue({ status: 'SUCCESS', hash: mockTxHash } as never);

      const result = await service.refundCompetitionParticipant(
        testKeypair.publicKey(),
        'comp_123',
        '1000000',
      );

      expect(sendTransactionSpy).toHaveBeenCalledTimes(2);
      expect(result.tx_hash).toBe(mockTxHash);
    });

    it('surfaces a typed SorobanUnavailableError after exhausting attempts with no existing submission ever found', async () => {
      const sendTransactionSpy = jest
        .spyOn(SorobanRpc.Server.prototype, 'sendTransaction')
        .mockRejectedValue(new TypeError('fetch failed'));

      jest
        .spyOn(SorobanRpc.Server.prototype, 'getTransaction')
        .mockResolvedValue({ status: 'NOT_FOUND' } as never);

      await expect(
        service.refundCompetitionParticipant(
          testKeypair.publicKey(),
          'comp_123',
          '1000000',
        ),
      ).rejects.toThrow(SorobanUnavailableError);

      // default SOROBAN_RPC_MAX_RETRIES = 2 -> 3 total attempts
      expect(sendTransactionSpy).toHaveBeenCalledTimes(3);
    }, 10_000);
  });

  describe('RPC timeout & retry (idempotent reads)', () => {
    afterEach(() => jest.restoreAllMocks());

    it('retries a read call that times out and eventually succeeds', async () => {
      const svc = await buildService({
        SOROBAN_RPC_TIMEOUT_MS: 30,
        SOROBAN_RPC_MAX_RETRIES: 2,
      });

      const getHealthSpy = jest
        .spyOn(SorobanRpc.Server.prototype, 'getHealth')
        .mockImplementationOnce(() => new Promise(() => {})) // hangs past the timeout
        .mockResolvedValueOnce({ status: 'healthy' } as never);

      await expect(svc.testConnection()).resolves.toBe(true);
      expect(getHealthSpy).toHaveBeenCalledTimes(2);
    });

    it('retries a read call on a connection error and eventually succeeds', async () => {
      const svc = await buildService({ SOROBAN_RPC_MAX_RETRIES: 2 });

      const getHealthSpy = jest
        .spyOn(SorobanRpc.Server.prototype, 'getHealth')
        .mockRejectedValueOnce(new TypeError('fetch failed'))
        .mockResolvedValueOnce({ status: 'healthy' } as never);

      await expect(svc.testConnection()).resolves.toBe(true);
      expect(getHealthSpy).toHaveBeenCalledTimes(2);
    });

    it('surfaces a typed SorobanUnavailableError after exhausting retries on a persistent timeout', async () => {
      const svc = await buildService({
        SOROBAN_RPC_TIMEOUT_MS: 30,
        SOROBAN_RPC_MAX_RETRIES: 1,
      });

      const getHealthSpy = jest
        .spyOn(SorobanRpc.Server.prototype, 'getHealth')
        .mockImplementation(() => new Promise(() => {}));

      await expect(svc.testConnection()).rejects.toThrow(
        SorobanUnavailableError,
      );
      expect(getHealthSpy).toHaveBeenCalledTimes(2); // 1 initial + 1 retry
    });

    it('does not retry a non-transient read failure', async () => {
      const svc = await buildService();

      const getHealthSpy = jest
        .spyOn(SorobanRpc.Server.prototype, 'getHealth')
        .mockRejectedValue(new Error('Account not found: GABC123'));

      await expect(svc.testConnection()).rejects.toThrow('Account not found');
      expect(getHealthSpy).toHaveBeenCalledTimes(1);
    });
  });
});
