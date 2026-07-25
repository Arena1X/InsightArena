import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ReconciliationService } from './reconciliation.service';
import { ChainSyncCheckpoint } from './entities/chain-sync-checkpoint.entity';
import { ContractEvent } from './entities/contract-event.entity';
import { ReorgEvent } from './entities/reorg-event.entity';
import { IndexerCheckpoint } from './entities/indexer-checkpoint.entity';
import { CHECKPOINT_LEDGER_KEY } from './indexer.service';

describe('ReconciliationService', () => {
  let service: ReconciliationService;
  let checkpointRepository: jest.Mocked<
    Pick<Repository<ChainSyncCheckpoint>, 'findOne' | 'create' | 'save'>
  >;
  let contractEventRepository: jest.Mocked<
    Pick<Repository<ContractEvent>, 'findOne' | 'create' | 'save' | 'delete'>
  >;
  let reorgEventRepository: jest.Mocked<
    Pick<Repository<ReorgEvent>, 'create' | 'save' | 'find'>
  >;
  let indexerCheckpointRepository: jest.Mocked<
    Pick<Repository<IndexerCheckpoint>, 'update'>
  >;
  let configService: jest.Mocked<Pick<ConfigService, 'get'>>;

  beforeEach(async () => {
    checkpointRepository = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };

    contractEventRepository = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      delete: jest.fn(),
    };

    reorgEventRepository = {
      create: jest.fn(),
      save: jest.fn(),
      find: jest.fn(),
    };

    indexerCheckpointRepository = {
      update: jest.fn(),
    };

    configService = {
      get: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReconciliationService,
        { provide: ConfigService, useValue: configService },
        {
          provide: getRepositoryToken(ChainSyncCheckpoint),
          useValue: checkpointRepository,
        },
        {
          provide: getRepositoryToken(ContractEvent),
          useValue: contractEventRepository,
        },
        {
          provide: getRepositoryToken(ReorgEvent),
          useValue: reorgEventRepository,
        },
        {
          provide: getRepositoryToken(IndexerCheckpoint),
          useValue: indexerCheckpointRepository,
        },
      ],
    }).compile();

    service = module.get<ReconciliationService>(ReconciliationService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('isEnabled', () => {
    it('returns true by default', () => {
      configService.get.mockReturnValue(undefined);
      expect(service.isEnabled()).toBe(true);
    });

    it('returns false when RECONCILE_ENABLED is "false"', () => {
      configService.get.mockReturnValue('false');
      expect(service.isEnabled()).toBe(false);
    });

    it('returns false when RECONCILE_ENABLED is "0"', () => {
      configService.get.mockReturnValue('0');
      expect(service.isEnabled()).toBe(false);
    });

    it('returns true when RECONCILE_ENABLED is "true"', () => {
      configService.get.mockReturnValue('true');
      expect(service.isEnabled()).toBe(true);
    });
  });

  describe('getReconcileWindow', () => {
    it('returns default window when not configured', () => {
      configService.get.mockReturnValue(undefined);
      expect(service.getReconcileWindow()).toBe(200);
    });

    it('returns configured window', () => {
      configService.get.mockReturnValue(500);
      expect(service.getReconcileWindow()).toBe(500);
    });
  });

  describe('getReconcileIntervalMs', () => {
    it('returns default interval when not configured', () => {
      configService.get.mockReturnValue(undefined);
      expect(service.getReconcileIntervalMs()).toBe(60000);
    });

    it('returns configured interval', () => {
      configService.get.mockReturnValue(30000);
      expect(service.getReconcileIntervalMs()).toBe(30000);
    });
  });

  describe('advanceCheckpoint', () => {
    it('creates a checkpoint if none exists and advances it', async () => {
      checkpointRepository.findOne.mockResolvedValue(null);
      checkpointRepository.create.mockReturnValue({
        contract_id: 'CTEST',
        last_indexed_ledger: 0,
        chain_head_ledger: 0,
      } as ChainSyncCheckpoint);
      checkpointRepository.save.mockImplementation(
        async (cp) => cp as ChainSyncCheckpoint,
      );

      await service.advanceCheckpoint('CTEST', 100);

      expect(checkpointRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          contract_id: 'CTEST',
          last_indexed_ledger: 100,
        }),
      );
    });

    it('does not regress the checkpoint', async () => {
      const existing = {
        contract_id: 'CTEST',
        last_indexed_ledger: 200,
        chain_head_ledger: 200,
      } as ChainSyncCheckpoint;

      checkpointRepository.findOne.mockResolvedValue(existing);

      await service.advanceCheckpoint('CTEST', 100);

      expect(checkpointRepository.save).not.toHaveBeenCalled();
    });

    it('advances the checkpoint when ledger is higher', async () => {
      const existing = {
        contract_id: 'CTEST',
        last_indexed_ledger: 100,
        chain_head_ledger: 100,
      } as ChainSyncCheckpoint;

      checkpointRepository.findOne.mockResolvedValue(existing);
      checkpointRepository.save.mockImplementation(
        async (cp) => cp as ChainSyncCheckpoint,
      );

      await service.advanceCheckpoint('CTEST', 200);

      expect(checkpointRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ last_indexed_ledger: 200 }),
      );
    });
  });

  describe('getStatus', () => {
    it('returns current reconciliation status', () => {
      configService.get.mockReturnValue(undefined);
      const status = service.getStatus();

      expect(status).toEqual({
        enabled: true,
        is_running: false,
        last_run_at: null,
        last_backfill_count: 0,
      });
    });
  });

  describe('getCheckpointForContract', () => {
    it('returns checkpoint when it exists', async () => {
      const checkpoint = {
        contract_id: 'CTEST',
        last_indexed_ledger: 500,
        chain_head_ledger: 600,
      } as ChainSyncCheckpoint;

      checkpointRepository.findOne.mockResolvedValue(checkpoint);

      const result = await service.getCheckpointForContract('CTEST');
      expect(result).toEqual(checkpoint);
    });

    it('returns null when no checkpoint exists', async () => {
      checkpointRepository.findOne.mockResolvedValue(null);

      const result = await service.getCheckpointForContract('CTEST');
      expect(result).toBeNull();
    });
  });

  describe('reconcile', () => {
    it('skips when disabled', async () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'RECONCILE_ENABLED') return 'false';
        return undefined;
      });

      await service.reconcile();

      expect(checkpointRepository.findOne).not.toHaveBeenCalled();
    });

    it('skips when no contract ID configured', async () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'RECONCILE_ENABLED') return 'true';
        if (key === 'SOROBAN_CONTRACT_ID') return undefined;
        return undefined;
      });

      await service.reconcile();

      expect(checkpointRepository.findOne).not.toHaveBeenCalled();
    });

    it('skips when contract ID is placeholder', async () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'RECONCILE_ENABLED') return 'true';
        if (key === 'SOROBAN_CONTRACT_ID') return 'your-contract-id-here';
        return undefined;
      });

      await service.reconcile();

      expect(checkpointRepository.findOne).not.toHaveBeenCalled();
    });
  });

  describe('fetchLedgerHash', () => {
    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('returns the ledger hash from a valid RPC response', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({
          result: { ledgers: [{ hash: 'abc123' }] },
        }),
      } as unknown as Response);

      const result = await (service as any).fetchLedgerHash(
        'https://rpc.example',
        42,
      );

      expect(result).toBe('abc123');
    });

    it('returns null when the HTTP response is not ok', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({}),
      } as unknown as Response);

      const result = await (service as any).fetchLedgerHash(
        'https://rpc.example',
        42,
      );

      expect(result).toBeNull();
    });

    it('returns null when result is missing', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({}),
      } as unknown as Response);

      const result = await (service as any).fetchLedgerHash(
        'https://rpc.example',
        42,
      );

      expect(result).toBeNull();
    });

    it('returns null when ledgers array is empty', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({ result: { ledgers: [] } }),
      } as unknown as Response);

      const result = await (service as any).fetchLedgerHash(
        'https://rpc.example',
        42,
      );

      expect(result).toBeNull();
    });

    it('returns null when hash is not a string', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({ result: { ledgers: [{ hash: 12345 }] } }),
      } as unknown as Response);

      const result = await (service as any).fetchLedgerHash(
        'https://rpc.example',
        42,
      );

      expect(result).toBeNull();
    });

    it('returns null when fetch throws', async () => {
      jest.spyOn(global, 'fetch').mockRejectedValue(new Error('network down'));

      const result = await (service as any).fetchLedgerHash(
        'https://rpc.example',
        42,
      );

      expect(result).toBeNull();
    });
  });

  describe('detectAndHandleReorg', () => {
    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('returns null on first run when checkpoint has no stored hash yet', async () => {
      const checkpoint = {
        contract_id: 'CTEST',
        last_indexed_ledger: 0,
        last_indexed_ledger_hash: null,
      } as ChainSyncCheckpoint;

      const result = await (service as any).detectAndHandleReorg(
        'CTEST',
        checkpoint,
        'https://rpc.example',
      );

      expect(result).toBeNull();
    });

    it('returns null when the RPC hash lookup fails (skips silently)', async () => {
      const checkpoint = {
        contract_id: 'CTEST',
        last_indexed_ledger: 100,
        last_indexed_ledger_hash: 'hash-100',
      } as ChainSyncCheckpoint;

      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({}),
      } as unknown as Response);

      const result = await (service as any).detectAndHandleReorg(
        'CTEST',
        checkpoint,
        'https://rpc.example',
      );

      expect(result).toBeNull();
      expect(checkpointRepository.save).not.toHaveBeenCalled();
    });

    it('returns null when the stored hash still matches the chain', async () => {
      const checkpoint = {
        contract_id: 'CTEST',
        last_indexed_ledger: 100,
        last_indexed_ledger_hash: 'hash-100',
      } as ChainSyncCheckpoint;

      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({ result: { ledgers: [{ hash: 'hash-100' }] } }),
      } as unknown as Response);

      const result = await (service as any).detectAndHandleReorg(
        'CTEST',
        checkpoint,
        'https://rpc.example',
      );

      expect(result).toBeNull();
      expect(contractEventRepository.delete).not.toHaveBeenCalled();
    });

    it('rolls back events and rewinds both checkpoints when a reorg is detected', async () => {
      const checkpoint = {
        contract_id: 'CTEST',
        last_indexed_ledger: 100,
        last_indexed_ledger_hash: 'hash-100',
      } as ChainSyncCheckpoint;

      configService.get.mockImplementation((key: string) => {
        if (key === 'INDEXER_REORG_ROLLBACK_DEPTH') return 10;
        return undefined;
      });

      jest
        .spyOn(global, 'fetch')
        .mockImplementation(async (_url, init: any) => {
          const body = JSON.parse(init.body as string);
          const ledger = body.params.startLedger;
          if (ledger === 100) {
            return {
              ok: true,
              json: async () => ({
                result: { ledgers: [{ hash: 'hash-100-DIVERGED' }] },
              }),
            } as unknown as Response;
          }
          if (ledger === 90) {
            return {
              ok: true,
              json: async () => ({
                result: { ledgers: [{ hash: 'hash-90' }] },
              }),
            } as unknown as Response;
          }
          return {
            ok: true,
            json: async () => ({ result: { ledgers: [] } }),
          } as unknown as Response;
        });

      contractEventRepository.delete.mockResolvedValue({
        affected: 7,
        raw: [],
      });

      const savedReorgEvent = { id: 'reorg-1' } as ReorgEvent;
      reorgEventRepository.create.mockReturnValue(savedReorgEvent);
      reorgEventRepository.save.mockResolvedValue(savedReorgEvent);
      checkpointRepository.save.mockImplementation(
        async (cp) => cp as ChainSyncCheckpoint,
      );

      const result = await (service as any).detectAndHandleReorg(
        'CTEST',
        checkpoint,
        'https://rpc.example',
      );

      // Rolls back ContractEvent rows past the fork ledger (100 - 10 = 90).
      expect(contractEventRepository.delete).toHaveBeenCalledWith(
        expect.objectContaining({
          ledger: expect.objectContaining({ _type: 'moreThan', _value: 90 }),
        }),
      );

      // Mutates the SAME checkpoint instance in place.
      expect(checkpoint.last_indexed_ledger).toBe(90);
      expect(checkpoint.last_indexed_ledger_hash).toBe('hash-90');
      expect(checkpointRepository.save).toHaveBeenCalledWith(checkpoint);

      // Rewinds the other (key/value) checkpoint system to the same fork point.
      expect(indexerCheckpointRepository.update).toHaveBeenCalledWith(
        { key: CHECKPOINT_LEDGER_KEY },
        { value: 90 },
      );

      // Persists a ReorgEvent audit row.
      expect(reorgEventRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          contract_id: 'CTEST',
          fork_ledger: 90,
          previous_ledger: 100,
          previous_hash: 'hash-100',
          new_hash: 'hash-100-DIVERGED',
          rolled_back_event_count: 7,
        }),
      );
      expect(reorgEventRepository.save).toHaveBeenCalledWith(savedReorgEvent);

      expect(result).toBe(savedReorgEvent);
    });
  });

  describe('getReorgEvents', () => {
    it('returns reorg events ordered by detected_at descending', async () => {
      const events = [{ id: 'r1' }, { id: 'r2' }] as ReorgEvent[];
      reorgEventRepository.find.mockResolvedValue(events);

      const result = await service.getReorgEvents('CTEST', 25);

      expect(reorgEventRepository.find).toHaveBeenCalledWith({
        where: { contract_id: 'CTEST' },
        order: { detected_at: 'DESC' },
        take: 25,
      });
      expect(result).toBe(events);
    });

    it('omits the contract_id filter when none is provided', async () => {
      reorgEventRepository.find.mockResolvedValue([]);

      await service.getReorgEvents();

      expect(reorgEventRepository.find).toHaveBeenCalledWith({
        where: {},
        order: { detected_at: 'DESC' },
        take: 50,
      });
    });
  });

  describe('runReconciliation reorg integration', () => {
    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('rolls back on reorg and then backfills from the fork point', async () => {
      const checkpoint = {
        contract_id: 'CTEST',
        last_indexed_ledger: 100,
        last_indexed_ledger_hash: 'hash-100',
        chain_head_ledger: 100,
      } as ChainSyncCheckpoint;

      configService.get.mockImplementation((key: string) => {
        if (key === 'SOROBAN_RPC_URL') return 'https://rpc.example';
        if (key === 'INDEXER_REORG_ROLLBACK_DEPTH') return 10;
        return undefined;
      });

      checkpointRepository.findOne.mockResolvedValue(checkpoint);
      checkpointRepository.save.mockImplementation(
        async (cp) => cp as ChainSyncCheckpoint,
      );
      contractEventRepository.delete.mockResolvedValue({
        affected: 3,
        raw: [],
      });
      contractEventRepository.findOne.mockResolvedValue(null);
      reorgEventRepository.create.mockImplementation(
        (input) => input as ReorgEvent,
      );
      reorgEventRepository.save.mockImplementation(
        async (e) => e as ReorgEvent,
      );

      const backfillFromLedgers: number[] = [];

      jest
        .spyOn(global, 'fetch')
        .mockImplementation(async (_url, init: any) => {
          const body = JSON.parse(init.body as string);

          if (body.method === 'getLedgers') {
            const ledger = body.params.startLedger;
            if (ledger === 100) {
              return {
                ok: true,
                json: async () => ({
                  result: { ledgers: [{ hash: 'hash-100-DIVERGED' }] },
                }),
              } as unknown as Response;
            }
            return {
              ok: true,
              json: async () => ({
                result: { ledgers: [{ hash: `hash-${ledger}` }] },
              }),
            } as unknown as Response;
          }

          // getEvents calls: chain-head probe (limit 1) vs backfill (limit 100)
          if (body.params.limit === 1) {
            return {
              ok: true,
              json: async () => ({ result: { events: [], latestLedger: 95 } }),
            } as unknown as Response;
          }

          backfillFromLedgers.push(body.params.startLedger);
          return {
            ok: true,
            json: async () => ({ result: { events: [] } }),
          } as unknown as Response;
        });

      await (service as any).runReconciliation('CTEST');

      // Reorg rolled back to fork ledger 90 (100 - rollback depth 10).
      expect(checkpoint.last_indexed_ledger).toBe(95);
      expect(backfillFromLedgers).toEqual([91]);
      expect(reorgEventRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ fork_ledger: 90, previous_ledger: 100 }),
      );
    });
  });
});
