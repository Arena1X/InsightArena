import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import {
  rpc as SorobanRpc,
  Keypair,
  StrKey,
  SorobanDataBuilder,
  Transaction,
} from '@stellar/stellar-sdk';
import {
  DEFAULT_SOROBAN_FALLBACK_FEE_STROOPS,
  DEFAULT_SOROBAN_MAX_FEE_STROOPS,
  SorobanService,
  SorobanUnavailableError,
} from './soroban.service';

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

  function feeStats(p90: string) {
    return { sorobanInclusionFee: { p90 } } as never;
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
    jest
      .spyOn(SorobanRpc.Server.prototype, 'getFeeStats')
      .mockResolvedValue(feeStats('10000'));

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

  describe('estimateFee', () => {
    it('uses the live fee when estimation succeeds', async () => {
      jest
        .spyOn(SorobanRpc.Server.prototype, 'getFeeStats')
        .mockResolvedValue(feeStats('5000'));

      await expect(service.estimateFee()).resolves.toBe('5000');
    });

    it('falls back to the documented default fee, within the cap, when estimation fails', async () => {
      jest
        .spyOn(SorobanRpc.Server.prototype, 'getFeeStats')
        .mockRejectedValue(new TypeError('fetch failed'));

      const fee = Number(await service.estimateFee());

      expect(fee).toBe(DEFAULT_SOROBAN_FALLBACK_FEE_STROOPS);
      expect(fee).toBeLessThanOrEqual(DEFAULT_SOROBAN_MAX_FEE_STROOPS);
    });

    it('falls back to the last known live fee when estimation later fails', async () => {
      const getFeeStats = jest
        .spyOn(SorobanRpc.Server.prototype, 'getFeeStats')
        .mockResolvedValueOnce(feeStats('7500'))
        .mockRejectedValueOnce(new TypeError('fetch failed'));

      await expect(service.estimateFee()).resolves.toBe('7500');
      await expect(service.estimateFee()).resolves.toBe('7500');
      expect(getFeeStats).toHaveBeenCalledTimes(2);
    });

    it('falls back when the fee stats are malformed', async () => {
      jest
        .spyOn(SorobanRpc.Server.prototype, 'getFeeStats')
        .mockResolvedValue({} as never);

      await expect(service.estimateFee()).resolves.toBe(
        String(DEFAULT_SOROBAN_FALLBACK_FEE_STROOPS),
      );
    });

    it('never lets the fallback exceed the configured maximum fee', async () => {
      const capped = await buildService({
        SOROBAN_FALLBACK_FEE_STROOPS: 5_000_000,
        SOROBAN_MAX_FEE_STROOPS: 50_000,
      });
      jest
        .spyOn(SorobanRpc.Server.prototype, 'getFeeStats')
        .mockRejectedValue(new TypeError('fetch failed'));

      await expect(capped.estimateFee()).resolves.toBe('50000');
    });

    it('caps a live fee spike, and the last known fallback, at the configured maximum', async () => {
      const capped = await buildService({ SOROBAN_MAX_FEE_STROOPS: 50_000 });
      jest
        .spyOn(SorobanRpc.Server.prototype, 'getFeeStats')
        .mockResolvedValueOnce(feeStats('2000000'))
        .mockRejectedValueOnce(new TypeError('fetch failed'));

      await expect(capped.estimateFee()).resolves.toBe('50000');
      await expect(capped.estimateFee()).resolves.toBe('50000');
    });

    it('does not block a submission when estimation is unavailable', async () => {
      const mockTxHash = 'c'.repeat(64);
      jest
        .spyOn(SorobanRpc.Server.prototype, 'getFeeStats')
        .mockRejectedValue(new TypeError('fetch failed'));
      jest.spyOn(SorobanRpc.Server.prototype, 'getAccount').mockResolvedValue({
        sequenceNumber: () => '1',
        accountId: () => testServerKeypair.publicKey(),
        incrementSequenceNumber: () => {},
      } as never);
      const simulateSpy = jest
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
        .mockResolvedValue({ status: 'PENDING', hash: mockTxHash } as never);
      jest
        .spyOn(SorobanRpc.Server.prototype, 'getTransaction')
        .mockResolvedValue({ status: 'SUCCESS', hash: mockTxHash } as never);

      const result = await service.refundCompetitionParticipant(
        testKeypair.publicKey(),
        'comp_123',
        '1000000',
      );

      expect(result.tx_hash).toBe(mockTxHash);
      const simulatedTx = simulateSpy.mock.calls[0][0] as Transaction;
      expect(simulatedTx.fee).toBe(
        String(DEFAULT_SOROBAN_FALLBACK_FEE_STROOPS),
      );
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

    it('on an ambiguous failure (network timeout), retries and eventually succeeds', async () => {
      // A thrown TypeError is how a real fetch-layer timeout/network error
      // surfaces — isTransientSorobanError classifies it as ambiguous, which
      // is what actually drives the retry path in sendTransactionWithRetry.
      // (A resolved `{ status: 'TRY_AGAIN_LATER' }` response, by contrast,
      // isn't a thrown error at all and never reaches that path.)
      const sendTransactionSpy = jest
        .spyOn(SorobanRpc.Server.prototype, 'sendTransaction')
        .mockRejectedValueOnce(new TypeError('fetch failed'))
        .mockResolvedValueOnce({
          status: 'PENDING',
          hash: mockTxHash,
        } as never);

      // First getTransaction call is findSubmittedTransaction's ambiguous
      // check (not found -> proceed to resend); every call after that is
      // refundCompetitionParticipant's own post-send confirmation poll,
      // which must see SUCCESS or the test would spin through its
      // NOT_FOUND retry loop for real wall-clock seconds.
      jest
        .spyOn(SorobanRpc.Server.prototype, 'getTransaction')
        .mockResolvedValueOnce({
          status: SorobanRpc.Api.GetTransactionStatus.NOT_FOUND,
        } as never)
        .mockResolvedValue({
          status: SorobanRpc.Api.GetTransactionStatus.SUCCESS,
        } as never);

      const result = await service.refundCompetitionParticipant(
        testKeypair.publicKey(),
        'comp_123',
        '1000000',
      );

      expect(result.tx_hash).toBe(mockTxHash);
      expect(sendTransactionSpy).toHaveBeenCalledTimes(2);
    });

    it('recognizes a transaction that was actually received despite a timed-out send, and does not resubmit it (#1861)', async () => {
      // The send call itself times out (ambiguous — did the RPC node
      // receive it or not?), but the transaction was in fact accepted:
      // getTransaction reports a real status for its hash on the very next
      // check. sendTransactionWithRetry must recognize this via
      // findSubmittedTransaction and return that outcome directly, rather
      // than firing a second, duplicate submission of the same transaction.
      const sendTransactionSpy = jest
        .spyOn(SorobanRpc.Server.prototype, 'sendTransaction')
        .mockRejectedValueOnce(new TypeError('fetch failed'));

      jest
        .spyOn(SorobanRpc.Server.prototype, 'getTransaction')
        .mockResolvedValue({
          status: SorobanRpc.Api.GetTransactionStatus.SUCCESS,
        } as never);

      const result = await service.refundCompetitionParticipant(
        testKeypair.publicKey(),
        'comp_123',
        '1000000',
      );

      // Exactly one send attempt: the retry loop found the existing
      // submission via its hash and returned early instead of resending.
      expect(sendTransactionSpy).toHaveBeenCalledTimes(1);
      expect(result.tx_hash).toBeDefined();
    });

    it('never mistakes a different transaction for a previously submitted one', async () => {
      // Each call's tx.hash() is deterministic from the transaction's own
      // contents (source, sequence, operations, memo). Two independently
      // built transactions here naturally hash differently — the retry
      // path's getTransaction lookup is keyed on the failed call's own
      // txHash, so a lookup can never cross-match a different transaction's
      // hash to begin with.
      let capturedFirstHash: string | undefined;
      let ambiguousCheckSeen = false;
      const sendTransactionSpy = jest
        .spyOn(SorobanRpc.Server.prototype, 'sendTransaction')
        .mockImplementationOnce((tx: Transaction) => {
          capturedFirstHash = tx.hash().toString('hex');
          throw new TypeError('fetch failed');
        })
        .mockResolvedValueOnce({
          status: 'PENDING',
          hash: mockTxHash,
        } as never);

      const getTransactionSpy = jest
        .spyOn(SorobanRpc.Server.prototype, 'getTransaction')
        .mockImplementation((hash: string) => {
          if (!ambiguousCheckSeen) {
            ambiguousCheckSeen = true;
            // Confirms the ambiguous-retry lookup is keyed on the *first*
            // (failed) attempt's own hash, not any other transaction's.
            expect(hash).toBe(capturedFirstHash);
            return Promise.resolve({
              status: SorobanRpc.Api.GetTransactionStatus.NOT_FOUND,
            } as never);
          }
          // Subsequent calls are the post-send confirmation poll for the
          // transaction that actually got sent (mockTxHash).
          return Promise.resolve({
            status: SorobanRpc.Api.GetTransactionStatus.SUCCESS,
          } as never);
        });

      await service.refundCompetitionParticipant(
        testKeypair.publicKey(),
        'comp_123',
        '1000000',
      );

      expect(getTransactionSpy).toHaveBeenCalledWith(capturedFirstHash);
      expect(sendTransactionSpy).toHaveBeenCalledTimes(2);
    });

    it('findSubmittedTransaction reports not-found (safe to resend) for a transaction genuinely never submitted', async () => {
      jest
        .spyOn(SorobanRpc.Server.prototype, 'sendTransaction')
        .mockRejectedValueOnce(new TypeError('fetch failed'))
        .mockResolvedValueOnce({
          status: 'PENDING',
          hash: mockTxHash,
        } as never);

      const getTransactionSpy = jest
        .spyOn(SorobanRpc.Server.prototype, 'getTransaction')
        .mockResolvedValueOnce({
          status: SorobanRpc.Api.GetTransactionStatus.NOT_FOUND,
        } as never)
        .mockResolvedValue({
          status: SorobanRpc.Api.GetTransactionStatus.SUCCESS,
        } as never);

      const result = await service.refundCompetitionParticipant(
        testKeypair.publicKey(),
        'comp_123',
        '1000000',
      );

      expect(getTransactionSpy).toHaveBeenCalled();
      // Not found -> the loop proceeded to genuinely resend, not return the
      // (nonexistent) prior submission.
      expect(result.tx_hash).toBe(mockTxHash);
    });
  });
});
