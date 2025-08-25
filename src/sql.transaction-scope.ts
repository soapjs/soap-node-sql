import { AsyncLocalStorage } from 'async_hooks';

/**
 * SQL transaction scope implementation
 * Manages transaction context across async operations
 */
export class SqlTransactionScope {
  private static instance: SqlTransactionScope;
  private asyncLocalStorage: AsyncLocalStorage<string>;

  private constructor() {
    this.asyncLocalStorage = new AsyncLocalStorage<string>();
  }

  /**
   * Gets the singleton instance of SqlTransactionScope
   */
  static getInstance(): SqlTransactionScope {
    if (!SqlTransactionScope.instance) {
      SqlTransactionScope.instance = new SqlTransactionScope();
    }
    return SqlTransactionScope.instance;
  }

  /**
   * Runs a function within a transaction context
   * @param transactionId - The transaction ID to associate with the context
   * @param fn - The function to run within the transaction context
   * @returns The result of the function
   */
  run<T>(transactionId: string, fn: () => T): T {
    return this.asyncLocalStorage.run(transactionId, fn);
  }

  /**
   * Gets the current transaction ID from the async context
   * @returns The current transaction ID or undefined if not in a transaction context
   */
  getTransactionId(): string | undefined {
    return this.asyncLocalStorage.getStore();
  }

  /**
   * Checks if there's an active transaction context
   * @returns True if there's an active transaction context
   */
  hasActiveTransaction(): boolean {
    return this.getTransactionId() !== undefined;
  }

  /**
   * Clears the current transaction context
   */
  clearTransactionContext(): void {
    // Note: AsyncLocalStorage doesn't have a direct clear method
    // The context is automatically cleared when the run function completes
  }
}
