import { BadRequestException, ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import {
  Keypair,
  nativeToScVal,
  rpc as SorobanRpc,
} from '@stellar/stellar-sdk';
import { SorobanService } from './soroban.service';

describe('SorobanService', () => {
  let service: SorobanService;
  let serverKeypair: Keypair;

  beforeEach(async () => {
    jest
      .spyOn(SorobanRpc.Server.prototype, 'getHealth')
      .mockResolvedValue({ status: 'healthy' } as never);

    serverKeypair = Keypair.random();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SorobanService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const values: Record<string, string> = {
                SOROBAN_CONTRACT_ID:
                  'CBYIU4E5KXQYWY7RM3L2WN2B4QBBSY7WQGPJAP6XTN6QH6NWSQBRW6UV',
                STELLAR_NETWORK: 'testnet',
                SERVER_SECRET_KEY: serverKeypair.secret(),
                SOROBAN_RPC_URL: 'https://soroban-testnet.stellar.org',
              };
              return values[key];
            }),
          },
        },
      ],
    }).compile();

    service = module.get<SorobanService>(SorobanService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('initializes rpc client and passes connection test', async () => {
    expect(service.getRpcClient()).toBeInstanceOf(SorobanRpc.Server);
    await expect(service.testConnection()).resolves.toBe(true);
  });

  describe('createMarket', () => {
    it('returns on-chain market id and tx hash from contract invocation', async () => {
      jest.spyOn(service as any, 'invokeContract').mockResolvedValue({
        txHash: 'txhash-1',
        returnValue: nativeToScVal(123n, { type: 'u64' }),
      });

      await expect(
        service.createMarket(
          'Title',
          'Description',
          'Crypto',
          ['YES', 'NO'],
          new Date(Date.now() + 60_000).toISOString(),
          new Date(Date.now() + 120_000).toISOString(),
          serverKeypair.publicKey(),
          100,
          '1000',
          '1000000',
          true,
        ),
      ).resolves.toEqual({
        on_chain_market_id: '123',
        tx_hash: 'txhash-1',
      });
    });

    it('maps contract InvalidTimeRange errors to BadRequestException', async () => {
      jest
        .spyOn(service as any, 'invokeContract')
        .mockRejectedValue(new Error('Error(Contract, #17)'));

      await expect(
        service.createMarket(
          'Title',
          'Description',
          'Crypto',
          ['YES', 'NO'],
          new Date(Date.now() + 60_000).toISOString(),
          new Date(Date.now() + 120_000).toISOString(),
          serverKeypair.publicKey(),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('createSeason', () => {
    it('throws ConflictException when active season overlaps', async () => {
      jest.spyOn(service as any, 'getActiveSeasonIfAny').mockResolvedValue({
        start_time: 100,
        end_time: 200,
      });

      await expect(
        service.createSeason(1, 150, 250, '1000'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('returns on-chain season id and tx hash from contract invocation', async () => {
      jest
        .spyOn(service as any, 'getActiveSeasonIfAny')
        .mockResolvedValue(null);
      jest.spyOn(service as any, 'invokeContract').mockResolvedValue({
        txHash: 'txhash-2',
        returnValue: nativeToScVal(5, { type: 'u32' }),
      });

      await expect(service.createSeason(1, 10, 20, '1000')).resolves.toEqual({
        on_chain_season_id: 5,
        tx_hash: 'txhash-2',
      });
    });
  });
});
