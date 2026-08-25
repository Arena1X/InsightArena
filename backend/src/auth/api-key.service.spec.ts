import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ApiKeyService } from './api-key.service';
import { ApiKey } from './entities/api-key.entity';
import * as bcrypt from 'bcrypt';
import {
  UnauthorizedException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';

jest.mock('bcrypt');

describe('ApiKeyService', () => {
  let service: ApiKeyService;
  let repository: any;

  beforeEach(async () => {
    repository = {
      create: jest.fn(),
      save: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApiKeyService,
        {
          provide: getRepositoryToken(ApiKey),
          useValue: repository,
        },
      ],
    }).compile();

    service = module.get<ApiKeyService>(ApiKeyService);
  });

  describe('create', () => {
    it('should create an API key with scopes', async () => {
      const mockDto = { name: 'Test Key', scopes: ['read:test', 'write:test'] };
      const mockApiKey = {
        id: 'key123',
        name: mockDto.name,
        key_prefix: 'ia_abcdef',
        scopes: mockDto.scopes,
        created_at: new Date(),
      };

      repository.create.mockReturnValue(mockApiKey);
      repository.save.mockResolvedValue(mockApiKey);

      const result = await service.create('user123', mockDto);

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user123',
          name: mockDto.name,
          scopes: mockDto.scopes,
        }),
      );
      expect(result.scopes).toEqual(mockDto.scopes);
      expect(result.id).toBe(mockApiKey.id);
    });
  });

  describe('validateKey', () => {
    it('should successfully validate an existing unrevoked key', async () => {
      const rawKey = 'ia_validkey12345';
      const mockApiKey = {
        id: 'key123',
        key_hash: 'hashed',
        revoked_at: null,
        expires_at: null,
      };

      repository.find.mockResolvedValue([mockApiKey]);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.validateKey(rawKey);
      expect(result).toEqual(mockApiKey);
    });

    it('should throw UnauthorizedException for an invalid format', async () => {
      await expect(service.validateKey('invalidformat')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException if no candidate matches', async () => {
      repository.find.mockResolvedValue([]);
      await expect(service.validateKey('ia_validkey12345')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should reject a rotated key whose grace window has expired', async () => {
      const rawKey = 'ia_rotatedkey12345';
      const mockApiKey = {
        id: 'key123',
        key_hash: 'hashed',
        revoked_at: null,
        expires_at: null,
        rotated_at: new Date(Date.now() - 1000),
        grace_expires_at: new Date(Date.now() - 500),
      };

      repository.find.mockResolvedValue([mockApiKey]);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      await expect(service.validateKey(rawKey)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should accept a rotated key still within its grace window', async () => {
      const rawKey = 'ia_rotatedkey12345';
      const mockApiKey = {
        id: 'key123',
        key_hash: 'hashed',
        revoked_at: null,
        expires_at: null,
        rotated_at: new Date(Date.now() - 1000),
        grace_expires_at: new Date(Date.now() + 60_000),
      };

      repository.find.mockResolvedValue([mockApiKey]);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.validateKey(rawKey);
      expect(result).toEqual(mockApiKey);
    });
  });

  describe('rotate', () => {
    it('should issue a new key preserving name/scopes and grace-expire the old one', async () => {
      const existing = {
        id: 'key123',
        userId: 'user123',
        name: 'My Key',
        scopes: ['read:markets'],
        expires_at: null,
        revoked_at: null,
        rotated_at: null,
        grace_expires_at: null,
        replaced_by_id: null,
      };
      const replacement = {
        id: 'key456',
        name: existing.name,
        key_prefix: 'ia_newpre',
        scopes: existing.scopes,
        expires_at: null,
        created_at: new Date(),
      };

      repository.findOne.mockResolvedValue(existing);
      repository.create.mockReturnValue(replacement);
      repository.save
        .mockResolvedValueOnce(replacement)
        .mockResolvedValueOnce({ ...existing, rotated_at: new Date() });

      const result = await service.rotate('key123', 'user123');

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user123',
          name: existing.name,
          scopes: existing.scopes,
        }),
      );
      expect(result.id).toBe(replacement.id);
      expect(result.key).toMatch(/^ia_/);

      // Second save call persists the grace-expiry state on the old row.
      const oldRowSaveArg = repository.save.mock.calls[1][0];
      expect(oldRowSaveArg.rotated_at).toBeInstanceOf(Date);
      expect(oldRowSaveArg.grace_expires_at).toBeInstanceOf(Date);
      expect(oldRowSaveArg.replaced_by_id).toBe(replacement.id);
    });

    it('should throw NotFoundException for an unknown key', async () => {
      repository.findOne.mockResolvedValue(null);
      await expect(service.rotate('missing', 'user123')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException when rotating a revoked key', async () => {
      repository.findOne.mockResolvedValue({
        id: 'key123',
        revoked_at: new Date(),
        rotated_at: null,
      });
      await expect(service.rotate('key123', 'user123')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should throw ForbiddenException when rotating an already-rotated key', async () => {
      repository.findOne.mockResolvedValue({
        id: 'key123',
        revoked_at: null,
        rotated_at: new Date(),
      });
      await expect(service.rotate('key123', 'user123')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });
});
