// Integration tests for all API GET endpoints
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from './app.module';

let app: INestApplication;

beforeAll(async () => {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  app = moduleFixture.createNestApplication();
  await app.init();
});

afterAll(async () => {
  await app.close();
});

describe('GET endpoints', () => {
  it('should return paginated list of events', async () => {
    const res = await request(app.getHttpServer())
      .get('/events?page=1&limit=10')
      .expect(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('meta');
    // add further checks for pagination structure
  });

  // Add similar tests for other GET routes, filtering, sorting, error cases, auth, caching, rate limiting
});
