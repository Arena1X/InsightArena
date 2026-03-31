import { Test, TestingModule } from '@nestjs/testing';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

describe('AdminController', () => {
  let controller: AdminController;
  let service: {
    adminCancelCompetition: jest.Mock;
  };

  beforeEach(async () => {
    service = {
      adminCancelCompetition: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [
        {
          provide: AdminService,
          useValue: service,
        },
      ],
    }).compile();

    controller = module.get<AdminController>(AdminController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('cancelCompetition', () => {
    it('calls admin service with competition id and admin id', async () => {
      const result = { id: 'comp-1', is_cancelled: true };
      service.adminCancelCompetition.mockResolvedValue(result);

      const req = { user: { id: 'admin-1' } };
      const response = await controller.cancelCompetition('comp-1', req);

      expect(service.adminCancelCompetition).toHaveBeenCalledWith(
        'comp-1',
        'admin-1',
      );
      expect(response).toEqual(result);
    });
  });
});
