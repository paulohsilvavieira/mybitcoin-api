import { Test, TestingModule } from '@nestjs/testing';
import { QueryResult } from 'pg';
import { DatabaseService } from '@/infrastructure/database/database.service';
import { POOL_TOKEN } from '@/infrastructure/database/database.token';
import { PGTransactionControl } from '@/infrastructure/database/transaction';

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
      providers: [DatabaseService, { provide: POOL_TOKEN, useValue: mockPool }],
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

    it('passes a Transaction instance to fn', async () => {
      let received: unknown;

      await service.runInTransaction((tx) => {
        received = tx;
        return Promise.resolve();
      });

      expect(received).toBeInstanceOf(PGTransactionControl);
    });
  });
});

describe('Transaction', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockClient.query.mockResolvedValue(undefined);
  });

  const makeTx = () => new PGTransactionControl(mockClient as never);

  describe('query', () => {
    it('delegates to client.query with sql and params', async () => {
      const fakeResult = { rows: [] } as unknown as QueryResult;
      mockClient.query.mockResolvedValueOnce(fakeResult);

      const result = await makeTx().query('SELECT $1', [42]);

      expect(mockClient.query).toHaveBeenCalledWith('SELECT $1', [42]);
      expect(result).toBe(fakeResult);
    });
  });

  describe('commit', () => {
    it('issues COMMIT', async () => {
      await makeTx().commit();

      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    });
  });

  describe('rollback', () => {
    it('issues ROLLBACK', async () => {
      await makeTx().rollback();

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });
  });

  describe('release', () => {
    it('releases the client', () => {
      makeTx().release();

      expect(mockClient.release).toHaveBeenCalledTimes(1);
    });
  });
});
