import { NotFoundException } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { normalizeStellarAddress, UsersService } from './users.service';
import { User } from './entities/user.entity';

/**
 * In-memory stand-in for the users repository that enforces the same
 * unique constraint on `stellar_address` as the real table.
 */
const makeUsersRepo = () => {
  const rows: User[] = [];
  let nextId = 1;

  const matches = (user: User, where: Partial<User>) =>
    Object.entries(where).every(([key, value]) =>
      key === 'deleted_at'
        ? user.deleted_at == null
        : user[key as keyof User] === value,
    );

  return {
    rows,
    findOne: jest.fn(({ where }: { where: Partial<User> }) =>
      Promise.resolve(rows.find((u) => matches(u, where)) ?? null),
    ),
    create: jest.fn((data: Partial<User>) => ({ ...data }) as User),
    save: jest.fn((user: User) => {
      if (rows.some((u) => u.stellar_address === user.stellar_address)) {
        return Promise.reject(
          new QueryFailedError('INSERT', [], {
            code: '23505',
          } as unknown as Error),
        );
      }
      const saved = { ...user, id: `user-${nextId++}` } as User;
      rows.push(saved);
      return Promise.resolve(saved);
    }),
  };
};

describe('UsersService address normalization', () => {
  const address = 'GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H';
  const otherAddress =
    'GCEZWKCA5VLDNRLN3RPRJMRZOX3Z6G5CHCGSNFHEYVXM3XOJMDS674JZ';

  let repo: ReturnType<typeof makeUsersRepo>;
  let service: UsersService;

  beforeEach(() => {
    repo = makeUsersRepo();
    const unused = {} as never;
    service = new UsersService(
      repo as never,
      unused,
      unused,
      unused,
      unused,
      unused,
      unused,
      unused,
      unused,
    );
  });

  it('normalizes addresses to trimmed upper-case', () => {
    expect(normalizeStellarAddress(`  ${address.toLowerCase()} `)).toBe(
      address,
    );
  });

  it('maps two differently-cased forms of one address to a single user', async () => {
    const first = await service.findOrCreateByAddress(address.toLowerCase());
    const second = await service.findOrCreateByAddress(address);

    expect(second.id).toBe(first.id);
    expect(repo.rows).toHaveLength(1);
    expect(repo.rows[0].stellar_address).toBe(address);
  });

  it('returns the existing user when a concurrent insert wins the unique constraint', async () => {
    const winner = await service.findOrCreateByAddress(address);
    // Simulate the race: our initial lookup misses, then the insert collides.
    repo.findOne.mockResolvedValueOnce(null);

    const result = await service.findOrCreateByAddress(address.toLowerCase());

    expect(result.id).toBe(winner.id);
    expect(repo.rows).toHaveLength(1);
  });

  it('creates a distinct user for a genuinely different address', async () => {
    const first = await service.findOrCreateByAddress(address);
    const second = await service.findOrCreateByAddress(otherAddress);

    expect(second.id).not.toBe(first.id);
    expect(repo.rows).toHaveLength(2);
  });

  it('finds a user regardless of input casing', async () => {
    const created = await service.findOrCreateByAddress(address);

    await expect(service.findByAddress(address)).resolves.toMatchObject({
      id: created.id,
    });
    await expect(
      service.findByAddress(address.toLowerCase()),
    ).resolves.toMatchObject({ id: created.id });
    const mixedCase = `${address.slice(0, 10).toLowerCase()}${address.slice(10)}`;
    await expect(
      service.findByAddress(` ${mixedCase} `),
    ).resolves.toMatchObject({ id: created.id });
  });

  it('still throws NotFoundException for an unknown address', async () => {
    await expect(service.findByAddress(otherAddress)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
