import {
  Controller,
  Get,
  INestApplication,
  VersioningType,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import request from 'supertest';
import { Deprecated } from '../src/common/decorators/deprecated.decorator';
import { DeprecationInterceptor } from '../src/common/interceptors/deprecation.interceptor';

/**
 * Throwaway controller exercising both a current and a deprecated route,
 * versioned the same way production controllers are (URI versioning,
 * default version '1' — see src/main.ts).
 */
@Controller({ path: 'widgets', version: '1' })
class WidgetsController {
  @Get('current')
  current() {
    return { ok: true };
  }

  @Get('legacy')
  @Deprecated({
    sunset: 'Wed, 31 Dec 2026 23:59:59 GMT',
    link: '/docs/migration',
  })
  legacy() {
    return { ok: true };
  }
}

describe('API Versioning & Deprecation (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [WidgetsController],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.enableVersioning({
      type: VersioningType.URI,
      defaultVersion: '1',
    });
    app.setGlobalPrefix('api');
    app.useGlobalInterceptors(new DeprecationInterceptor(app.get(Reflector)));
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('serves versioned routes under /api/v1/', () => {
    return request(app.getHttpServer())
      .get('/api/v1/widgets/current')
      .expect(200);
  });

  it('returns 404 for unversioned/unprefixed paths', () => {
    return request(app.getHttpServer()).get('/widgets/current').expect(404);
  });

  it('does not include Deprecation/Sunset headers on a current route', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/widgets/current')
      .expect(200);

    expect(res.headers.deprecation).toBeUndefined();
    expect(res.headers.sunset).toBeUndefined();
  });

  it('includes Deprecation and Sunset headers on a route marked @Deprecated', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/widgets/legacy')
      .expect(200);

    expect(res.headers.deprecation).toBe('true');
    expect(res.headers.sunset).toBe('Wed, 31 Dec 2026 23:59:59 GMT');
  });

  it('includes a Link header pointing to migration docs when configured', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/widgets/legacy')
      .expect(200);

    expect(res.headers.link).toBe('</docs/migration>; rel="deprecation"');
  });
});
