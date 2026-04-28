import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';

describe('AppController (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Content-Type', /json/)
      .expect((res) => {
        const body = res.body as {
          success: boolean;
          data: string;
          timestamp: string;
        };

        expect(body).toMatchObject({
          success: true,
          data: 'Hello World!',
        });
        expect(typeof body.timestamp).toBe('string');
        expect(Number.isNaN(Date.parse(body.timestamp))).toBe(false);
      });
  });
});
