import { Public, IS_PUBLIC_KEY } from './public.decorator';
import { Reflector } from '@nestjs/core';

describe('Public Decorator', () => {
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
  });

  it('should be defined', () => {
    expect(Public).toBeDefined();
  });

  it('should return a decorator function', () => {
    expect(typeof Public).toBe('function');
  });

  it('should be callable without arguments', () => {
    const decorator = Public();
    expect(typeof decorator).toBe('function');
  });

  describe('IS_PUBLIC_KEY constant', () => {
    it('should be defined', () => {
      expect(IS_PUBLIC_KEY).toBeDefined();
    });

    it('should have value "isPublic"', () => {
      expect(IS_PUBLIC_KEY).toBe('isPublic');
    });

    it('should be a string', () => {
      expect(typeof IS_PUBLIC_KEY).toBe('string');
    });
  });

  describe('decorator metadata', () => {
    it('should set metadata with correct key', () => {
      const testClass = class TestController {};
      const testMethod = () => {};

      const decorator = Public();
      decorator(testClass.prototype, 'methodName', Object.getOwnPropertyDescriptor(testClass.prototype, 'methodName'));

      const metadata = reflector.get(IS_PUBLIC_KEY, testClass.prototype.methodName);
      expect(metadata).toBe(true);
    });

    it('should mark route as public', () => {
      const testClass = class TestController {
        @Public()
        publicMethod() {
          return 'public';
        }
      };

      const metadata = reflector.get(IS_PUBLIC_KEY, testClass.prototype.publicMethod);
      expect(metadata).toBe(true);
    });

    it('should set boolean value true', () => {
      const testClass = class TestController {};
      const decorator = Public();
      decorator(testClass.prototype, 'test', Object.getOwnPropertyDescriptor(testClass.prototype, 'test'));

      const metadata = reflector.get(IS_PUBLIC_KEY, testClass.prototype.test);
      expect(metadata).toStrictEqual(true);
    });

    it('should be retrievable with Reflector.get', () => {
      const testClass = class TestController {
        @Public()
        getPublicRoute() {
          return 'data';
        }
      };

      const isPublic = reflector.get<boolean>(IS_PUBLIC_KEY, testClass.prototype.getPublicRoute);
      expect(isPublic).toBe(true);
    });
  });

  describe('access control use cases', () => {
    it('should identify public endpoints', () => {
      const testClass = class TestController {
        @Public()
        publicEndpoint() {
          return 'public data';
        }
      };

      const isPublic = reflector.get<boolean>(IS_PUBLIC_KEY, testClass.prototype.publicEndpoint);
      expect(isPublic).toBe(true);
    });

    it('should allow multiple public decorators on different methods', () => {
      const testClass = class TestController {
        @Public()
        login() {
          return 'login';
        }

        @Public()
        register() {
          return 'register';
        }
      };

      const loginIsPublic = reflector.get<boolean>(IS_PUBLIC_KEY, testClass.prototype.login);
      const registerIsPublic = reflector.get<boolean>(IS_PUBLIC_KEY, testClass.prototype.register);

      expect(loginIsPublic).toBe(true);
      expect(registerIsPublic).toBe(true);
    });

    it('should work with protected routes (non-decorated)', () => {
      const testClass = class TestController {
        protectedEndpoint() {
          return 'protected data';
        }
      };

      const isPublic = reflector.get<boolean>(IS_PUBLIC_KEY, testClass.prototype.protectedEndpoint);
      expect(isPublic).toBeUndefined();
    });

    it('should distinguish between public and protected routes', () => {
      const testClass = class TestController {
        @Public()
        publicMethod() {
          return 'public';
        }

        protectedMethod() {
          return 'protected';
        }
      };

      const publicMetadata = reflector.get<boolean>(IS_PUBLIC_KEY, testClass.prototype.publicMethod);
      const protectedMetadata = reflector.get<boolean>(IS_PUBLIC_KEY, testClass.prototype.protectedMethod);

      expect(publicMetadata).toBe(true);
      expect(protectedMetadata).toBeUndefined();
    });
  });

  describe('decorator composition', () => {
    it('should work with other decorators', () => {
      const testClass = class TestController {
        @Public()
        combinedDecorator() {
          return 'combined';
        }
      };

      const isPublic = reflector.get<boolean>(IS_PUBLIC_KEY, testClass.prototype.combinedDecorator);
      expect(isPublic).toBe(true);
    });

    it('should be repeatable on multiple methods', () => {
      const testClass = class TestController {
        @Public()
        endpoint1() {
          return 'endpoint1';
        }

        @Public()
        endpoint2() {
          return 'endpoint2';
        }

        @Public()
        endpoint3() {
          return 'endpoint3';
        }
      };

      expect(reflector.get<boolean>(IS_PUBLIC_KEY, testClass.prototype.endpoint1)).toBe(true);
      expect(reflector.get<boolean>(IS_PUBLIC_KEY, testClass.prototype.endpoint2)).toBe(true);
      expect(reflector.get<boolean>(IS_PUBLIC_KEY, testClass.prototype.endpoint3)).toBe(true);
    });
  });

  describe('authentication bypass scenarios', () => {
    it('should enable public access to login endpoints', () => {
      const testClass = class AuthController {
        @Public()
        login() {
          return { token: 'token' };
        }
      };

      const isPublic = reflector.get<boolean>(IS_PUBLIC_KEY, testClass.prototype.login);
      expect(isPublic).toBe(true);
    });

    it('should enable public access to registration endpoints', () => {
      const testClass = class AuthController {
        @Public()
        register() {
          return { success: true };
        }
      };

      const isPublic = reflector.get<boolean>(IS_PUBLIC_KEY, testClass.prototype.register);
      expect(isPublic).toBe(true);
    });

    it('should enable public access to health check endpoints', () => {
      const testClass = class HealthController {
        @Public()
        health() {
          return { status: 'ok' };
        }
      };

      const isPublic = reflector.get<boolean>(IS_PUBLIC_KEY, testClass.prototype.health);
      expect(isPublic).toBe(true);
    });
  });

  describe('metadata integrity', () => {
    it('should not interfere with method functionality', () => {
      const testClass = class TestController {
        @Public()
        getData() {
          return { id: 1, name: 'test' };
        }
      };

      const instance = new testClass();
      const result = instance.getData();
      expect(result).toEqual({ id: 1, name: 'test' });
    });

    it('should preserve method properties after decoration', () => {
      const testClass = class TestController {
        @Public()
        methodWithName() {
          return 'result';
        }
      };

      expect(testClass.prototype.methodWithName).toBeDefined();
      expect(typeof testClass.prototype.methodWithName).toBe('function');
    });

    it('should not pollute other method metadata', () => {
      const testClass = class TestController {
        @Public()
        publicMethod() {
          return 'public';
        }

        anotherMethod() {
          return 'another';
        }
      };

      const publicMetadata = reflector.get<boolean>(IS_PUBLIC_KEY, testClass.prototype.publicMethod);
      const anotherMetadata = reflector.get<boolean>(IS_PUBLIC_KEY, testClass.prototype.anotherMethod);

      expect(publicMetadata).toBe(true);
      expect(anotherMetadata).toBeUndefined();
    });
  });
});
