import { Test, TestingModule } from '@nestjs/testing';
import { QueryResult } from 'pg';
import { ReadDatabaseService } from '@/infrastructure/database/read-database.service';
import { READ_POOL_TOKEN } from '@/infrastructure/database/database.token';

const mockPool = {
  query: jest.fn(),
};

describe('ReadDatabaseService', () => {
  let service: ReadDatabaseService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReadDatabaseService,
        { provide: READ_POOL_TOKEN, useValue: mockPool },
      ],
    }).compile();

    service = module.get<ReadDatabaseService>(ReadDatabaseService);
  });

  it('delegates query to the read pool', async () => {
    const fakeResult = { rows: [{ id: 1 }] } as unknown as QueryResult;
    mockPool.query.mockResolvedValueOnce(fakeResult);

    const result = await service.query('SELECT 1', []);

    expect(mockPool.query).toHaveBeenCalledWith('SELECT 1', []);
    expect(result).toBe(fakeResult);
  });

  it('does not expose runInTransaction', () => {
    expect(
      (service as unknown as Record<string, unknown>).runInTransaction,
    ).toBeUndefined();
  });
});
