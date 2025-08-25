import { SqlTransactionManager, SqlTransaction } from '../sql.transaction';
import { SqlSessionManager, SqlSession } from '../sql.session-manager';
import { SqlTransactionError } from '../sql.errors';

// Mock the SqlSessionManager
jest.mock('../sql.session-manager');

describe('SqlTransactionManager', () => {
  let transactionManager: SqlTransactionManager;
  let mockSessionManager: jest.Mocked<SqlSessionManager>;
  let mockSession: any;

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();
    
    // Create mock session
    mockSession = {
      id: 'session_123',
      connection: {
        query: jest.fn()
      } as any,
      databaseType: 'mysql' as const,
      isTransaction: false,
      createdAt: new Date(),
      lastUsed: new Date(),
      end: jest.fn(),
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      updateLastUsed: jest.fn(),
      isExpired: jest.fn()
    };

    // Create mock session manager
    mockSessionManager = {
      createSession: jest.fn(),
      getSession: jest.fn(),
      hasSession: jest.fn(),
      deleteSession: jest.fn(),
      removeSession: jest.fn(),
      getAllSessions: jest.fn(),
      getSessionCount: jest.fn(),
      closeAllSessions: jest.fn(),
      getSessionStats: jest.fn(),
      transactionScope: {} as any
    } as any;

    // Create transaction manager instance
    transactionManager = new SqlTransactionManager(mockSessionManager);
  });

  afterEach(() => {
    // Clean up any timers
    jest.clearAllTimers();
  });

  describe('beginTransaction', () => {
    it('should begin a new transaction successfully', async () => {
      const sessionId = 'session_123';
      mockSessionManager.getSession.mockReturnValue(mockSession);
      mockSession.startTransaction.mockResolvedValue({});

      const result = await transactionManager.beginTransaction(sessionId);

      expect(mockSessionManager.getSession).toHaveBeenCalledWith(sessionId);
      expect(mockSession.startTransaction).toHaveBeenCalled();
      expect(result).toMatchObject({
        sessionId,
        isActive: true
      });
      expect(result.id).toMatch(/^txn_\d+_[a-z0-9]+$/);
      expect(result.createdAt).toBeInstanceOf(Date);
      expect(result.lastUsed).toBeInstanceOf(Date);
    });

    it('should throw error when session not found', async () => {
      const sessionId = 'session_123';
      mockSessionManager.getSession.mockReturnValue(undefined);

      await expect(transactionManager.beginTransaction(sessionId))
        .rejects
        .toThrow(SqlTransactionError);

      await expect(transactionManager.beginTransaction(sessionId))
        .rejects
        .toThrow('Failed to begin transaction: Session not found');
    });

    it('should throw error when session startTransaction fails', async () => {
      const sessionId = 'session_123';
      const error = new Error('Database error');
      mockSessionManager.getSession.mockReturnValue(mockSession);
      mockSession.startTransaction.mockRejectedValue(error);

      await expect(transactionManager.beginTransaction(sessionId))
        .rejects
        .toThrow('Failed to begin transaction: Database error');
    });
  });

  describe('commitTransaction', () => {
    it('should commit a transaction successfully', async () => {
      // First begin a transaction
      const sessionId = 'session_123';
      mockSessionManager.getSession.mockReturnValue(mockSession);
      mockSession.startTransaction.mockResolvedValue({});
      const transaction = await transactionManager.beginTransaction(sessionId);

      mockSession.commitTransaction.mockResolvedValue();

      await transactionManager.commitTransaction(transaction.id);

      expect(mockSession.commitTransaction).toHaveBeenCalled();
      expect(transaction.isActive).toBe(false);
      expect(transaction.lastUsed).toBeInstanceOf(Date);
    });

    it('should throw error when transaction not found', async () => {
      await expect(transactionManager.commitTransaction('non-existent-id'))
        .rejects
        .toThrow(SqlTransactionError);

      await expect(transactionManager.commitTransaction('non-existent-id'))
        .rejects
        .toThrow('Transaction not found: non-existent-id');
    });

    it('should throw error when transaction is not active', async () => {
      // Begin a transaction
      const sessionId = 'session_123';
      mockSessionManager.getSession.mockReturnValue(mockSession);
      mockSession.startTransaction.mockResolvedValue({});
      const transaction = await transactionManager.beginTransaction(sessionId);
      
      // Manually mark transaction as inactive (simulating what happens after commit/rollback)
      transaction.isActive = false;

      // Try to commit again
      await expect(transactionManager.commitTransaction(transaction.id))
        .rejects
        .toThrow('Transaction is not active');
    });

    it('should throw error when session manager commit fails', async () => {
      const sessionId = 'session_123';
      mockSessionManager.getSession.mockReturnValue(mockSession);
      mockSession.startTransaction.mockResolvedValue({});
      const transaction = await transactionManager.beginTransaction(sessionId);

      const error = new Error('Commit failed');
      mockSession.commitTransaction.mockRejectedValue(error);

      await expect(transactionManager.commitTransaction(transaction.id))
        .rejects
        .toThrow('Failed to commit transaction: Commit failed');
    });
  });

  describe('rollbackTransaction', () => {
    it('should rollback a transaction successfully', async () => {
      // First begin a transaction
      const sessionId = 'session_123';
      mockSessionManager.getSession.mockReturnValue(mockSession);
      mockSession.startTransaction.mockResolvedValue({});
      const transaction = await transactionManager.beginTransaction(sessionId);

      mockSession.rollbackTransaction.mockResolvedValue();

      await transactionManager.rollbackTransaction(transaction.id);

      expect(mockSession.rollbackTransaction).toHaveBeenCalled();
      expect(transaction.isActive).toBe(false);
      expect(transaction.lastUsed).toBeInstanceOf(Date);
    });

    it('should throw error when transaction not found', async () => {
      await expect(transactionManager.rollbackTransaction('non-existent-id'))
        .rejects
        .toThrow('Transaction not found: non-existent-id');
    });

    it('should throw error when transaction is not active', async () => {
      // Begin a transaction
      const sessionId = 'session_123';
      mockSessionManager.getSession.mockReturnValue(mockSession);
      mockSession.startTransaction.mockResolvedValue({});
      const transaction = await transactionManager.beginTransaction(sessionId);
      
      // Manually mark transaction as inactive (simulating what happens after commit/rollback)
      transaction.isActive = false;

      // Try to rollback
      await expect(transactionManager.rollbackTransaction(transaction.id))
        .rejects
        .toThrow('Transaction is not active');
    });

    it('should throw error when session manager rollback fails', async () => {
      const sessionId = 'session_123';
      mockSessionManager.getSession.mockReturnValue(mockSession);
      mockSession.startTransaction.mockResolvedValue({});
      const transaction = await transactionManager.beginTransaction(sessionId);

      const error = new Error('Rollback failed');
      mockSession.rollbackTransaction.mockRejectedValue(error);

      await expect(transactionManager.rollbackTransaction(transaction.id))
        .rejects
        .toThrow('Failed to rollback transaction: Rollback failed');
    });
  });



  describe('getTransaction', () => {
    it('should return transaction when found and active', async () => {
      const sessionId = 'session_123';
      mockSessionManager.getSession.mockReturnValue(mockSession);
      mockSession.startTransaction.mockResolvedValue({});
      const transaction = await transactionManager.beginTransaction(sessionId);

      const originalLastUsed = transaction.lastUsed;
      
      // Wait a bit to ensure time difference
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const foundTransaction = transactionManager.getTransaction(transaction.id);
      
      expect(foundTransaction).toBeDefined();
      expect(foundTransaction?.id).toBe(transaction.id);
      expect(foundTransaction?.lastUsed.getTime()).toBeGreaterThan(originalLastUsed.getTime());
    });

    it('should return undefined when transaction not found', () => {
      const result = transactionManager.getTransaction('non-existent-id');
      expect(result).toBeUndefined();
    });

    it('should return transaction but marked as inactive when transaction is inactive', async () => {
      const sessionId = 'session_123';
      mockSessionManager.getSession.mockReturnValue(mockSession);
      mockSession.startTransaction.mockResolvedValue({});
      mockSession.commitTransaction.mockResolvedValue();
      
      const transaction = await transactionManager.beginTransaction(sessionId);
      await transactionManager.commitTransaction(transaction.id);

      const result = transactionManager.getTransaction(transaction.id);
      expect(result).toBeDefined();
      expect(result?.id).toBe(transaction.id);
      expect(result?.isActive).toBe(false);
    });
  });

  describe('getActiveTransactions', () => {
    it('should return all active transactions', async () => {
      const sessionId1 = 'session_123';
      const sessionId2 = 'session_456';
      
      mockSessionManager.getSession.mockReturnValue(mockSession);
      mockSession.startTransaction.mockResolvedValue({});
      
      const transaction1 = await transactionManager.beginTransaction(sessionId1);
      const transaction2 = await transactionManager.beginTransaction(sessionId2);

      const activeTransactions = transactionManager.getActiveTransactions();
      
      expect(activeTransactions).toHaveLength(2);
      expect(activeTransactions).toContain(transaction1);
      expect(activeTransactions).toContain(transaction2);
    });

    it('should return empty array when no active transactions', () => {
      const activeTransactions = transactionManager.getActiveTransactions();
      expect(activeTransactions).toHaveLength(0);
    });

    it('should not return inactive transactions', async () => {
      const sessionId = 'session_123';
      mockSessionManager.getSession.mockReturnValue(mockSession);
      mockSession.startTransaction.mockResolvedValue({});
      mockSession.commitTransaction.mockResolvedValue();
      
      const transaction = await transactionManager.beginTransaction(sessionId);
      await transactionManager.commitTransaction(transaction.id);

      const activeTransactions = transactionManager.getActiveTransactions();
      expect(activeTransactions).toHaveLength(0);
    });
  });

  describe('getActiveTransactionCount', () => {
    it('should return correct count of active transactions', async () => {
      expect(transactionManager.getActiveTransactionCount()).toBe(0);

      const sessionId1 = 'session_123';
      const sessionId2 = 'session_456';
      
      mockSessionManager.getSession.mockReturnValue(mockSession);
      mockSession.startTransaction.mockResolvedValue({});
      
      await transactionManager.beginTransaction(sessionId1);
      expect(transactionManager.getActiveTransactionCount()).toBe(1);
      
      await transactionManager.beginTransaction(sessionId2);
      expect(transactionManager.getActiveTransactionCount()).toBe(2);
    });
  });



  describe('getTransactionStats', () => {
    it('should return correct statistics for active transactions', async () => {
      const sessionId1 = 'session_123';
      const sessionId2 = 'session_456';
      
      mockSessionManager.getSession.mockReturnValue(mockSession);
      mockSession.startTransaction.mockResolvedValue({});
      
      const transaction1 = await transactionManager.beginTransaction(sessionId1);
      await new Promise(resolve => setTimeout(resolve, 10)); // Ensure time difference
      const transaction2 = await transactionManager.beginTransaction(sessionId2);

      const stats = transactionManager.getTransactionStats();
      
      expect(stats.total).toBe(2);
      expect(stats.active).toBe(2);
    });

    it('should return correct statistics when no transactions', () => {
      const stats = transactionManager.getTransactionStats();
      
      expect(stats.total).toBe(0);
      expect(stats.active).toBe(0);
    });

    it('should return correct statistics after transactions are closed', async () => {
      const sessionId = 'session_123';
      mockSessionManager.getSession.mockReturnValue(mockSession);
      mockSession.startTransaction.mockResolvedValue({});
      mockSession.commitTransaction.mockResolvedValue();
      
      const transaction = await transactionManager.beginTransaction(sessionId);
      expect(transactionManager.getTransactionStats().active).toBe(1);
      
      await transactionManager.commitTransaction(transaction.id);
      expect(transactionManager.getTransactionStats().active).toBe(0);
    });
  });

  describe('closeAllTransactions', () => {
    it('should close all active transactions', async () => {
      const sessionId1 = 'session_123';
      const sessionId2 = 'session_456';
      
      mockSessionManager.getSession.mockReturnValue(mockSession);
      mockSession.startTransaction.mockResolvedValue({});
      mockSession.rollbackTransaction.mockResolvedValue();
      
      await transactionManager.beginTransaction(sessionId1);
      await transactionManager.beginTransaction(sessionId2);

      expect(transactionManager.getActiveTransactionCount()).toBe(2);

      await transactionManager.closeAllTransactions();

      expect(transactionManager.getActiveTransactionCount()).toBe(0);

    });

    it('should handle errors gracefully when closing transactions', async () => {
      const sessionId = 'session_123';
      mockSessionManager.getSession.mockReturnValue(mockSession);
      mockSession.startTransaction.mockResolvedValue({});
      mockSession.rollbackTransaction.mockRejectedValue(new Error('Rollback failed'));
      
      await transactionManager.beginTransaction(sessionId);

      // Should not throw error, just log it
      await expect(transactionManager.closeAllTransactions()).resolves.toBeUndefined();
      
      expect(transactionManager.getActiveTransactionCount()).toBe(0);
    });

    it('should work when no transactions exist', async () => {
      await expect(transactionManager.closeAllTransactions()).resolves.toBeUndefined();
    });
  });

  describe('cleanupExpiredTransactions', () => {
    it('should cleanup expired transactions automatically', async () => {
      const sessionId = 'session_123';
      mockSessionManager.getSession.mockReturnValue(mockSession);
      mockSession.startTransaction.mockResolvedValue({});
      mockSession.rollbackTransaction.mockResolvedValue();
      
      const transaction = await transactionManager.beginTransaction(sessionId);
      
      // Manually set the transaction as expired by modifying lastUsed
      const expiredTime = new Date(Date.now() - 300001); // 5 minutes + 1 second ago
      Object.defineProperty(transaction, 'lastUsed', {
        value: expiredTime,
        writable: true
      });
      
      // Manually trigger cleanup
      await transactionManager.manualCleanup();
      
      expect(transactionManager.getActiveTransactionCount()).toBe(0);

    });

    it('should not cleanup active transactions', async () => {
      const sessionId = 'session_123';
      mockSessionManager.getSession.mockReturnValue(mockSession);
      mockSession.startTransaction.mockResolvedValue({});
      
      const transaction = await transactionManager.beginTransaction(sessionId);
      
      // Set transaction as recently used (not expired)
      const recentTime = new Date(Date.now() - 240000); // 4 minutes ago (not expired)
      Object.defineProperty(transaction, 'lastUsed', {
        value: recentTime,
        writable: true
      });
      
      // Manually trigger cleanup
      await transactionManager.manualCleanup();
      
      expect(transactionManager.getActiveTransactionCount()).toBe(1);
    });
  });

  describe('transaction ID generation', () => {
    it('should generate unique transaction IDs', async () => {
      const sessionId = 'session_123';
      mockSessionManager.getSession.mockReturnValue(mockSession);
      mockSession.startTransaction.mockResolvedValue({});
      
      const transaction1 = await transactionManager.beginTransaction(sessionId);
      const transaction2 = await transactionManager.beginTransaction(sessionId);
      
      expect(transaction1.id).not.toBe(transaction2.id);
      expect(transaction1.id).toMatch(/^txn_\d+_[a-z0-9]+$/);
      expect(transaction2.id).toMatch(/^txn_\d+_[a-z0-9]+$/);
    });
  });

  describe('error handling', () => {
    it('should wrap errors in SqlTransactionError', async () => {
      const sessionId = 'session_123';
      const originalError = new Error('Database connection lost');
      mockSessionManager.getSession.mockReturnValue(mockSession);
      mockSession.startTransaction.mockRejectedValue(originalError);

      try {
        await transactionManager.beginTransaction(sessionId);
        fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(SqlTransactionError);
        expect(error.message).toBe('Failed to begin transaction: Database connection lost');
        expect(error.originalError).toBe(originalError);
      }
    });

    it('should handle string errors', async () => {
      const sessionId = 'session_123';
      const originalError = new Error('String error message');
      mockSessionManager.getSession.mockReturnValue(mockSession);
      mockSession.startTransaction.mockRejectedValue(originalError);

      try {
        await transactionManager.beginTransaction(sessionId);
        fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(SqlTransactionError);
        expect(error.message).toBe('Failed to begin transaction: String error message');
        expect(error.originalError).toBe(originalError);
      }
    });
  });
});
