import { Role } from './role.enum';

describe('Role Enum', () => {
  it('should be defined', () => {
    expect(Role).toBeDefined();
  });

  describe('Role values', () => {
    it('should have USER role with value "user"', () => {
      expect(Role.User).toBe('user');
    });

    it('should have ADMIN role with value "admin"', () => {
      expect(Role.Admin).toBe('admin');
    });

    it('should have MODERATOR role with value "moderator"', () => {
      expect(Role.Moderator).toBe('moderator');
    });
  });

  describe('Role enumeration', () => {
    it('should contain exactly three roles', () => {
      const roles = Object.values(Role);
      expect(roles.length).toBe(3);
    });

    it('should contain User role', () => {
      expect(Object.values(Role)).toContain('user');
    });

    it('should contain Admin role', () => {
      expect(Object.values(Role)).toContain('admin');
    });

    it('should contain Moderator role', () => {
      expect(Object.values(Role)).toContain('moderator');
    });
  });

  describe('Role access control levels', () => {
    it('should have defined hierarchy with User as base', () => {
      expect(Role.User).toBeDefined();
    });

    it('should have defined hierarchy with Admin', () => {
      expect(Role.Admin).toBeDefined();
    });

    it('should have defined hierarchy with Moderator', () => {
      expect(Role.Moderator).toBeDefined();
    });

    it('should have unique role values', () => {
      const roles = Object.values(Role);
      const uniqueRoles = new Set(roles);
      expect(uniqueRoles.size).toBe(roles.length);
    });
  });

  describe('Role type checking', () => {
    it('Role.User should be a string', () => {
      expect(typeof Role.User).toBe('string');
    });

    it('Role.Admin should be a string', () => {
      expect(typeof Role.Admin).toBe('string');
    });

    it('Role.Moderator should be a string', () => {
      expect(typeof Role.Moderator).toBe('string');
    });
  });

  describe('Role validation utilities', () => {
    it('should validate user role', () => {
      const isValidRole = Object.values(Role).includes('user');
      expect(isValidRole).toBe(true);
    });

    it('should validate admin role', () => {
      const isValidRole = Object.values(Role).includes('admin');
      expect(isValidRole).toBe(true);
    });

    it('should validate moderator role', () => {
      const isValidRole = Object.values(Role).includes('moderator');
      expect(isValidRole).toBe(true);
    });

    it('should reject invalid role string', () => {
      const isValidRole = Object.values(Role).includes('superadmin');
      expect(isValidRole).toBe(false);
    });

    it('should reject invalid role string (case sensitive)', () => {
      const isValidRole = Object.values(Role).includes('User');
      expect(isValidRole).toBe(false);
    });
  });

  describe('Role comparisons', () => {
    it('User role should be different from Admin role', () => {
      expect(Role.User).not.toBe(Role.Admin);
    });

    it('User role should be different from Moderator role', () => {
      expect(Role.User).not.toBe(Role.Moderator);
    });

    it('Admin role should be different from Moderator role', () => {
      expect(Role.Admin).not.toBe(Role.Moderator);
    });

    it('Role comparison should be case sensitive', () => {
      expect(Role.User).not.toEqual('User');
    });
  });

  describe('Role as discriminator', () => {
    it('should work as object key for User', () => {
      const permissions: Record<string, string[]> = {
        [Role.User]: ['read'],
        [Role.Admin]: ['read', 'write', 'delete'],
        [Role.Moderator]: ['read', 'moderate'],
      };

      expect(permissions[Role.User]).toContain('read');
    });

    it('should work as object key for Admin', () => {
      const permissions: Record<string, string[]> = {
        [Role.User]: ['read'],
        [Role.Admin]: ['read', 'write', 'delete'],
        [Role.Moderator]: ['read', 'moderate'],
      };

      expect(permissions[Role.Admin]).toContain('write');
    });

    it('should work as object key for Moderator', () => {
      const permissions: Record<string, string[]> = {
        [Role.User]: ['read'],
        [Role.Admin]: ['read', 'write', 'delete'],
        [Role.Moderator]: ['read', 'moderate'],
      };

      expect(permissions[Role.Moderator]).toContain('moderate');
    });
  });

  describe('Role immutability', () => {
    it('should not allow modification of User value', () => {
      const originalValue = Role.User;
      expect(() => {
        (Role as any).User = 'modified';
      }).toThrow();
      expect(Role.User).toBe(originalValue);
    });
  });
});
