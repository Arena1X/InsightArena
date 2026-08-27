import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { OracleAssignmentGuard } from './oracle-assignment.guard';
import { CreatorEventMatch } from '../../creator-events/entities/creator-event-match.entity';
import { OracleAssignment } from '../entities/oracle-assignment.entity';

describe('OracleAssignmentGuard', () => {
  let guard: OracleAssignmentGuard;

  const mockMatchRepository = {
    findOne: jest.fn(),
  };

  const mockAssignmentRepository = {
    findOne: jest.fn(),
  };

  const mockExecutionContext = (body: Record<string, unknown>) =>
    ({
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue({ body }),
      }),
    }) as unknown as ExecutionContext;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OracleAssignmentGuard,
        {
          provide: getRepositoryToken(CreatorEventMatch),
          useValue: mockMatchRepository,
        },
        {
          provide: getRepositoryToken(OracleAssignment),
          useValue: mockAssignmentRepository,
        },
      ],
    }).compile();

    guard = module.get<OracleAssignmentGuard>(OracleAssignmentGuard);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  it('allows the request through when required fields are missing (validation handles it)', async () => {
    const context = mockExecutionContext({ match_id: '123' });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(mockMatchRepository.findOne).not.toHaveBeenCalled();
  });

  it('allows the request through when the match does not exist (service raises 404)', async () => {
    mockMatchRepository.findOne.mockResolvedValue(null);
    const context = mockExecutionContext({
      match_id: 'unknown-match',
      data_source: 'source-a',
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(mockAssignmentRepository.findOne).not.toHaveBeenCalled();
  });

  it('rejects an unregistered/unauthorized submitter', async () => {
    mockMatchRepository.findOne.mockResolvedValue({
      on_chain_match_id: '123',
      event_id: 'event-a',
    });
    mockAssignmentRepository.findOne.mockResolvedValue(null);

    const context = mockExecutionContext({
      match_id: '123',
      data_source: 'unregistered-source',
    });

    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
    expect(mockAssignmentRepository.findOne).toHaveBeenCalledWith({
      where: { data_source: 'unregistered-source', is_active: true },
    });
  });

  it('rejects a cross-event submission from an oracle assigned to a different event', async () => {
    mockMatchRepository.findOne.mockResolvedValue({
      on_chain_match_id: '123',
      event_id: 'event-b',
    });
    mockAssignmentRepository.findOne.mockResolvedValue({
      data_source: 'source-a',
      event_id: 'event-a',
      is_active: true,
    });

    const context = mockExecutionContext({
      match_id: '123',
      data_source: 'source-a',
    });

    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('allows a submission from an oracle assigned to the match\'s event', async () => {
    mockMatchRepository.findOne.mockResolvedValue({
      on_chain_match_id: '123',
      event_id: 'event-a',
    });
    mockAssignmentRepository.findOne.mockResolvedValue({
      data_source: 'source-a',
      event_id: 'event-a',
      is_active: true,
    });

    const context = mockExecutionContext({
      match_id: '123',
      data_source: 'source-a',
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });
});
