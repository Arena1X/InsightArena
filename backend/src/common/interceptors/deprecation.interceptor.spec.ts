import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { of } from 'rxjs';
import { DeprecationInterceptor } from './deprecation.interceptor';
import { DEPRECATED_METADATA_KEY } from '../decorators/deprecated.decorator';

describe('DeprecationInterceptor', () => {
  let reflector: jest.Mocked<Pick<Reflector, 'getAllAndOverride'>>;
  let interceptor: DeprecationInterceptor;
  let setHeader: jest.Mock;

  const makeContext = (): ExecutionContext => {
    const response = { setHeader };
    return {
      switchToHttp: () => ({ getResponse: () => response }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as unknown as ExecutionContext;
  };

  const nextHandler = { handle: () => of({ ok: true }) };

  beforeEach(() => {
    setHeader = jest.fn();
    reflector = { getAllAndOverride: jest.fn() };
    interceptor = new DeprecationInterceptor(reflector as unknown as Reflector);
  });

  it('does not set any headers when the route has no @Deprecated metadata', (done) => {
    reflector.getAllAndOverride.mockReturnValue(undefined);

    interceptor.intercept(makeContext(), nextHandler).subscribe(() => {
      expect(setHeader).not.toHaveBeenCalled();
      done();
    });
  });

  it('sets Deprecation and Sunset headers when the route carries @Deprecated metadata', (done) => {
    reflector.getAllAndOverride.mockReturnValue({
      sunset: 'Wed, 31 Dec 2026 23:59:59 GMT',
    });

    interceptor.intercept(makeContext(), nextHandler).subscribe(() => {
      expect(setHeader).toHaveBeenCalledWith('Deprecation', 'true');
      expect(setHeader).toHaveBeenCalledWith(
        'Sunset',
        'Wed, 31 Dec 2026 23:59:59 GMT',
      );
      done();
    });
  });

  it('sets a Link header with rel="deprecation" when a link is configured', (done) => {
    reflector.getAllAndOverride.mockReturnValue({
      sunset: 'Wed, 31 Dec 2026 23:59:59 GMT',
      link: '/docs/migration',
    });

    interceptor.intercept(makeContext(), nextHandler).subscribe(() => {
      expect(setHeader).toHaveBeenCalledWith(
        'Link',
        '</docs/migration>; rel="deprecation"',
      );
      done();
    });
  });

  it('reads metadata from both the handler and the class (getAllAndOverride)', (done) => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    const context = makeContext();

    interceptor.intercept(context, nextHandler).subscribe(() => {
      expect(reflector.getAllAndOverride).toHaveBeenCalledWith(
        DEPRECATED_METADATA_KEY,
        [context.getHandler(), context.getClass()],
      );
      done();
    });
  });
});
