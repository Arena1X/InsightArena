import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, HttpStatus, ExecutionContext } from '@nestjs/common';
import request from 'supertest';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotificationsController } from '../src/notifications/notifications.controller';
import { NotificationsService } from '../src/notifications/notifications.service';
import {
  Notification,
  NotificationType,
} from '../src/notifications/entities/notification.entity';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { User } from '../src/users/entities/user.entity';

describe('DELETE /notifications/:id (E2E)', () => {
  let app: INestApplication;
  let notificationsService: NotificationsService;

  const mockUser: Partial<User> = {
    id: 'user-uuid-1',
    stellar_address: 'GBRPYHIL2CI3WHZDTOOQFC6EB4RRJC3XNRBF7XN',
    username: 'testuser',
  };

  const mockNotification: Partial<Notification> = {
    id: 'notif-uuid-1',
    user_id: 'user-uuid-1',
    type: NotificationType.System,
    title: 'Test',
    message: 'Test message',
  };

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [NotificationsController],
      providers: [
        {
          provide: NotificationsService,
          useValue: {
            remove: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Notification),
          useValue: {},
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          const req = context
            .switchToHttp()
            .getRequest<{ user: Partial<User> }>();
          req.user = mockUser;
          return true;
        },
      })
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalInterceptors(new ResponseInterceptor());
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    notificationsService =
      moduleFixture.get<NotificationsService>(NotificationsService);
  });

  afterEach(async () => {
    await app.close();
  });

  it('should return 204 when notification is successfully deleted', async () => {
    jest.spyOn(notificationsService, 'remove').mockResolvedValue(undefined);

    await request(app.getHttpServer())
      .delete(`/notifications/${mockNotification.id}`)
      .expect(HttpStatus.NO_CONTENT);

    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(notificationsService.remove).toHaveBeenCalledWith(
      mockNotification.id,
      mockUser.id,
    );
  });

  it('should return 404 when notification is not found or not owned', async () => {
    const errorMsg = 'Notification not found';

    jest.spyOn(notificationsService, 'remove').mockRejectedValue({
      status: HttpStatus.NOT_FOUND,
      message: errorMsg,
      getResponse: () => ({ message: errorMsg }),
      getStatus: () => HttpStatus.NOT_FOUND,
    });

    const res = await request(app.getHttpServer())
      .delete('/notifications/invalid-id')
      .expect(HttpStatus.NOT_FOUND);

    const body = res.body as { error: { message: string } };
    expect(body.error.message).toBe(errorMsg);
  });
});
