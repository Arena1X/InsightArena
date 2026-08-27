import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { UpdateUserDto } from './update-user.dto';

describe('UpdateUserDto', () => {
  it('accepts partial payloads with only the fields being updated', async () => {
    const dto = plainToInstance(UpdateUserDto, { username: 'new_name' });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('rejects null values that would wipe stored profile fields', async () => {
    const dto = plainToInstance(UpdateUserDto, { username: null });

    const errors = await validate(dto);

    expect(errors.length).toBeGreaterThan(0);
  });

  it('validates per-field constraints when a field is provided', async () => {
    const dto = plainToInstance(UpdateUserDto, { username: 'ab' });

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'username')).toBe(true);
  });
});
