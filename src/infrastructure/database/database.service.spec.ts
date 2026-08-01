import { Test, TestingModule } from '@nestjs/testing';
import { QueryResult } from 'pg';
import { DatabaseService } from '@/infrastructure/database/database.service';
import { WRITE_POOL_TOKEN } from '@/infrastructure/database/database.token';

const mockClient = {
  query: jest.fn(),
  release: jest.fn(),
};

const mockPool = {
  query: jest.fn(),
  connect: jest.fn(),
};

describe('DatabaseService', () => {
  let service: DatabaseService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DatabaseService,
        { provide: WRITE_POOL_TOKEN, useValue: mockPool },
      ],
    }).compile();

    service = module.get<DatabaseService>(DatabaseService);
  });

  describe('query', () => {
    it('delegates to pool.query', async () => {
      const fakeResult = { rows: [{ id: 1 }] } as unknown as QueryResult;
      mockPool.query.mockResolvedValueOnce(fakeResult);

      const result = await service.query('SELECT 1', []);

      expect(mockPool.query).toHaveBeenCalledWith('SELECT 1', []);
      expect(result).toBe(fakeResult);
    });
  });

  describe('runInTransaction', () => {
    beforeEach(() => {
      mockPool.connect.mockResolvedValue(mockClient);
      mockClient.query.mockResolvedValue(undefined);
    });

    it('commits and returns fn result on success', async () => {
      const result = await service.runInTransaction(() => Promise.resolve(42));

      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(mockClient.query).not.toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalledTimes(1);
      expect(result).toBe(42);
    });

    it('rolls back and rethrows on error', async () => {
      const error = new Error('boom');

      await expect(
        service.runInTransaction(() => Promise.reject(error)),
      ).rejects.toThrow(error);

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.query).not.toHaveBeenCalledWith('COMMIT');
      expect(mockClient.release).toHaveBeenCalledTimes(1);
    });

    it('passes a QueryExecutor to fn', async () => {
      let received: unknown;

      await service.runInTransaction((tx) => {
        received = tx;
        return Promise.resolve();
      });

      expect(received).toHaveProperty('query');
      expect(
        typeof (received as { query: (...args: unknown[]) => unknown }).query,
      ).toBe('function');
    });
  });
});
