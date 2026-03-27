import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { rpc as SorobanRpc } from '@stellar/stellar-sdk';
import { SorobanService } from './soroban.service';

describe('SorobanService', () => {
  let service: SorobanService;

  beforeEach(async () => {
    jest
      .spyOn(SorobanRpc.Server.prototype, 'getHealth')
      .mockResolvedValue({ status: 'healthy' } as never);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SorobanService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const values: Record<string, string> = {
                SOROBAN_CONTRACT_ID: 'contract-id-123',
                STELLAR_NETWORK: 'testnet',
                SERVER_SECRET_KEY: 'secret-key',
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
});
