import { SqlSessionManager, SqlSession } from './sql.session-manager';
import { SqlTransactionError } from './sql.errors';

/**
 * SQL transaction interface
 */
export interface SqlTransaction {
  id: string;
  sessionId: string;
  isActive: boolean;
  createdAt: Date;
  lastUsed: Date;
}

/**
 * Manages SQL transactions
 */
export class SqlTransactionManager {
  private transactions: Map<string, SqlTransaction> = new Map();
  private readonly transactionTimeout = 300000; // 5 minutes
  private cleanupTimer?: NodeJS.Timeout;

  constructor(private sessionManager: SqlSessionManager) {
    // Don't start cleanup timer automatically - let tests control it
    // this.startCleanupTimer();
  }

  /**
   * Starts the cleanup timer (for testing purposes)
   */
  startCleanupTimer(): void {
    if (!this.cleanupTimer) {
      // Use a longer interval to avoid test issues
      this.cleanupTimer = setInterval(() => this.cleanupExpiredTransactions(), 300000); // 5 minutes
    }
  }

  /**
   * Stops the cleanup timer (for testing purposes)
   */
  stopCleanupTimer(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
  }

  /**
   * Manually trigger cleanup (for testing purposes)
   */
  async manualCleanup(): Promise<void> {
    await this.cleanupExpiredTransactions();
  }

  /**
   * Begins a new transaction
   */
  async beginTransaction(sessionId: string): Promise<SqlTransaction> {
    try {
      // Get the session
      const session = this.sessionManager.getSession(sessionId);
      if (!session) {
        throw new SqlTransactionError(`Session not found: ${sessionId}`);
      }

      // Begin transaction on the session
      await session.startTransaction();
      
      // Create transaction record
      const transactionId = this.generateTransactionId();
      const transaction: SqlTransaction = {
        id: transactionId,
        sessionId,
        isActive: true,
        createdAt: new Date(),
        lastUsed: new Date()
      };

      this.transactions.set(transactionId, transaction);
      return transaction;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new SqlTransactionError(`Failed to begin transaction: ${errorMessage}`, error instanceof Error ? error : undefined);
    }
  }

  /**
   * Commits a transaction
   */
  async commitTransaction(transactionId: string): Promise<void> {
    const transaction = this.getTransaction(transactionId);
    if (!transaction) {
      throw new SqlTransactionError(`Transaction not found: ${transactionId}`);
    }

    if (!transaction.isActive) {
      throw new SqlTransactionError(`Transaction is not active: ${transactionId}`);
    }

    try {
      // Get the session and commit transaction
      const session = this.sessionManager.getSession(transaction.sessionId);
      if (!session) {
        throw new SqlTransactionError(`Session not found: ${transaction.sessionId}`);
      }

      await session.commitTransaction();
      
      // Mark transaction as inactive
      transaction.isActive = false;
      transaction.lastUsed = new Date();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new SqlTransactionError(`Failed to commit transaction: ${errorMessage}`, error instanceof Error ? error : undefined);
    }
  }

  /**
   * Rolls back a transaction
   */
  async rollbackTransaction(transactionId: string): Promise<void> {
    const transaction = this.getTransaction(transactionId);
    if (!transaction) {
      throw new SqlTransactionError(`Transaction not found: ${transactionId}`);
    }

    if (!transaction.isActive) {
      throw new SqlTransactionError(`Transaction is not active: ${transactionId}`);
    }

    try {
      // Get the session and rollback transaction
      const session = this.sessionManager.getSession(transaction.sessionId);
      if (!session) {
        throw new SqlTransactionError(`Session not found: ${transaction.sessionId}`);
      }

      await session.rollbackTransaction();
      
      // Mark transaction as inactive
      transaction.isActive = false;
      transaction.lastUsed = new Date();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new SqlTransactionError(`Failed to rollback transaction: ${errorMessage}`, error instanceof Error ? error : undefined);
    }
  }

  /**
   * Gets a transaction by ID
   */
  getTransaction(transactionId: string): SqlTransaction | undefined {
    const transaction = this.transactions.get(transactionId);
    if (transaction) {
      transaction.lastUsed = new Date();
    }
    return transaction;
  }

  /**
   * Gets all active transactions
   */
  getActiveTransactions(): SqlTransaction[] {
    return Array.from(this.transactions.values()).filter(t => t.isActive);
  }

  /**
   * Gets the number of active transactions
   */
  getActiveTransactionCount(): number {
    return this.getActiveTransactions().length;
  }

  /**
   * Closes a transaction
   */
  async closeTransaction(transactionId: string): Promise<void> {
    const transaction = this.getTransaction(transactionId);
    if (!transaction) {
      return; // Transaction already closed or doesn't exist
    }

    if (transaction.isActive) {
      try {
        await this.rollbackTransaction(transactionId);
      } catch (error) {
        console.error(`Error rolling back transaction ${transactionId}:`, error);
      }
    }

    this.transactions.delete(transactionId);
  }

  /**
   * Closes all transactions
   */
  async closeAllTransactions(): Promise<void> {
    const transactionIds = Array.from(this.transactions.keys());
    
    await Promise.all(
      transactionIds.map(async (transactionId) => {
        try {
          await this.closeTransaction(transactionId);
        } catch (error) {
          console.error(`Error closing transaction ${transactionId}:`, error);
        }
      })
    );
  }

  /**
   * Cleans up expired transactions
   */
  async cleanupExpiredTransactions(): Promise<void> {
    const now = new Date();
    const expiredTransactions: string[] = [];

    for (const [transactionId, transaction] of this.transactions.entries()) {
      if (now.getTime() - transaction.lastUsed.getTime() > this.transactionTimeout) {
        expiredTransactions.push(transactionId);
      }
    }

    for (const transactionId of expiredTransactions) {
      await this.closeTransaction(transactionId);
    }

    if (expiredTransactions.length > 0) {
      console.log(`Cleaned up ${expiredTransactions.length} expired transactions`);
    }
  }

  /**
   * Generates a unique transaction ID
   */
  private generateTransactionId(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `txn_${timestamp}_${random}`;
  }

  /**
   * Gets transaction statistics
   */
  getTransactionStats(): {
    total: number;
    active: number;
    expired: number;
  } {
    const now = new Date();
    const transactions = Array.from(this.transactions.values());
    
    return {
      total: transactions.length,
      active: transactions.filter(t => t.isActive).length,
      expired: transactions.filter(t => 
        now.getTime() - t.lastUsed.getTime() > this.transactionTimeout
      ).length
    };
  }
}
