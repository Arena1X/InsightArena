import { Test, TestingModule } from '@nestjs/testing';
import { PredictionsController } from './predictions.controller';
import { PredictionsService } from './predictions.service';
import { IDEMPOTENT_KEY } from '../common/idempotency/idempotent.decorator';
import { IdempotencyService } from '../common/idempotency/idempotency.service';
import { PredictionsRateLimitGuard } from '../common/guards/predictions-rate-limit.guard';

describe('PredictionsController — idempotency', () => {
  let controller: PredictionsController;
  let predictionsService: {
    submit: jest.Mock;
    submitBatch: jest.Mock;
  };

  beforeEach(async () => {
    predictionsService = {
      submit: jest.fn().mockResolvedValue({}),
      submitBatch: jest.fn().mockResolvedValue({}),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PredictionsController],
      providers: [
        { provide: PredictionsService, useValue: predictionsService },
        {
          provide: IdempotencyService,
          useValue: {
            acquire: jest.fn(),
            complete: jest.fn(),
            release: jest.fn(),
          },
        },
        {
          provide: PredictionsRateLimitGuard,
          useValue: {
            canActivate: jest.fn().mockResolvedValue(true),
          },
        },
      ],
    }).compile();

    controller = module.get(PredictionsController);
  });

  it('requires an Idempotency-Key on submit (POST /predictions)', () => {
    const metadata = Reflect.getMetadata(IDEMPOTENT_KEY, controller.submit);
    expect(metadata).toBe(true);
  });

  it('requires an Idempotency-Key on submitBatch (POST /predictions/batch)', () => {
    const metadata = Reflect.getMetadata(
      IDEMPOTENT_KEY,
      controller.submitBatch,
    );
    expect(metadata).toBe(true);
  });
});
