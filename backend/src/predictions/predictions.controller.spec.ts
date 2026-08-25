import { Test, TestingModule } from '@nestjs/testing';
import { PredictionsController } from './predictions.controller';
import { PredictionsService } from './predictions.service';
import { IDEMPOTENT_KEY } from '../common/idempotency/idempotent.decorator';

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
      ],
    }).compile();

    controller = module.get(PredictionsController);
  });

  it('requires an Idempotency-Key on submit (POST /predictions)', () => {
    const metadata = Reflect.getMetadata(
      IDEMPOTENT_KEY,
      controller.submit,
    );
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
