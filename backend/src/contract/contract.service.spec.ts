import { Test, TestingModule } from '@nestjs/testing';
import { ContractService } from './contract.service';

/**
 * Documented staleness bound for the verified-address cache, in milliseconds.
 * `isVerified` must reflect an on-chain `unverify_address` (or `verify_address`)
 * within this window rather than serving a stale cached value indefinitely.
 */
const VERIFIED_CACHE_STALENESS_BOUND_MS = 30_000;

describe('ContractService verified-address cache freshness', () => {
  let service: ContractService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ContractService],
    }).compile();

    service = module.get<ContractService>(ContractService);
  });

  it('returns false for an address that was never verified without throwing', async () => {
    const neverVerified = 'GNEVERVERIFIEDADDRESS000000000000000000000000000000000000';

    await expect(service.isVerified(neverVerified)).resolves.toBe(false);
  });

  it('returns true promptly after a freshly verified address is verified', async () => {
    const address = 'GFRESHLYVERIFIEDADDRESS0000000000000000000000000000000000';

    await service.verifyAddress(address);

    await expect(service.isVerified(address)).resolves.toBe(true);
  });

  it('reflects false shortly after an on-chain unverify_address call, within the staleness bound', async () => {
    const address = 'GUNVERIFYADDRESS00000000000000000000000000000000000000000';

    await service.verifyAddress(address);
    await expect(service.isVerified(address)).resolves.toBe(true);

    await service.unverifyAddress(address);

    // The cache must not serve a stale `true` indefinitely; it should reflect
    // the revocation within the documented staleness bound.
    const deadline = Date.now() + VERIFIED_CACHE_STALENESS_BOUND_MS;
    let verified = true;
    while (Date.now() < deadline) {
      verified = await service.isVerified(address);
      if (!verified) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    expect(verified).toBe(false);
  });
});
