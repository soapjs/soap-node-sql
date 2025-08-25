import { PoolConnection } from 'mysql2/promise';
import { PoolClient } from 'pg';
import { DatabaseSessionRegistry, DatabaseSession } from '@soapjs/soap';
import { SqlSession } from './sql.session';
import { SqlTransactionScope } from './sql.transaction-scope';
import { SqlConnectionError } from './sql.errors';

/**
 * SQL database session registry implementation
 * Manages database sessions and provides transaction scope
 */
export { SqlSession } from './sql.session';

export class SqlSessionManager implements DatabaseSessionRegistry {
  private sessions: Map<string, SqlSession> = new Map();
  private readonly sessionTimeout = 300000; // 5 minutes
  public readonly transactionScope: any;
  private cleanupInterval?: NodeJS.Timeout;

  constructor() {
    this.transactionScope = SqlTransactionScope.getInstance();
    
    // Clean up expired sessions every minute
    this.cleanupInterval = setInterval(() => this.cleanupExpiredSessions(), 60000);
  }

  /**
   * Creates a new database session (implements DatabaseSessionRegistry interface)
   * @param args - Arguments for session creation [connection, databaseType]
   * @returns A new DatabaseSession instance
   */
  createSession(...args: unknown[]): DatabaseSession {
    if (args.length < 2) {
      throw new SqlConnectionError('createSession requires connection and databaseType arguments');
    }

    const connection = args[0] as PoolConnection | PoolClient;
    const databaseType = args[1] as 'mysql' | 'postgresql' | 'sqlite';

    if (!connection) {
      throw new SqlConnectionError('Connection is required');
    }

    if (!databaseType || !['mysql', 'postgresql', 'sqlite'].includes(databaseType)) {
      throw new SqlConnectionError('databaseType must be "mysql", "postgresql", or "sqlite"');
    }

    const sessionId = this.generateSessionId();
    const session = new SqlSession(sessionId, connection, databaseType);
    
    this.sessions.set(sessionId, session);
    return session;
  }

  /**
   * Gets a session by ID (implements DatabaseSessionRegistry interface)
   * @param id - The session ID
   * @param args - Additional arguments (not used)
   * @returns The session if found, undefined otherwise
   */
  getSession(id: string, ...args: unknown[]): DatabaseSession | undefined {
    const session = this.sessions.get(id);
    if (session) {
      session.updateLastUsed();
    }
    return session;
  }

  /**
   * Checks if a session exists
   * @param id - The session ID
   * @returns True if the session exists
   */
  hasSession(id: string): boolean {
    return this.sessions.has(id);
  }

  /**
   * Deletes a session by ID
   * @param id - The session ID
   * @param args - Additional arguments (not used)
   */
  deleteSession(id: string, ...args: unknown[]): void {
    const session = this.sessions.get(id);
    if (session) {
      // End the session to release the connection
      session.end().catch(error => {
        console.error(`Error ending session ${id}:`, error);
      });
      
      this.sessions.delete(id);
    }
  }

  /**
   * Removes a session (alias for deleteSession)
   * @param sessionId - The session ID
   * @returns True if the session was removed, false if not found
   */
  removeSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (session) {
      this.deleteSession(sessionId);
      return true;
    }
    return false;
  }

  /**
   * Gets all active sessions
   * @returns Array of all active sessions
   */
  getAllSessions(): SqlSession[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Gets the number of active sessions
   * @returns The number of active sessions
   */
  getSessionCount(): number {
    return this.sessions.size;
  }

  /**
   * Cleans up expired sessions
   */
  private cleanupExpiredSessions(): void {
    const now = new Date();
    const expiredSessions: string[] = [];

    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.isExpired(this.sessionTimeout)) {
        expiredSessions.push(sessionId);
      }
    }

    for (const sessionId of expiredSessions) {
      this.deleteSession(sessionId);
    }

    if (expiredSessions.length > 0) {
      console.log(`Cleaned up ${expiredSessions.length} expired sessions`);
    }
  }

  /**
   * Generates a unique session ID
   * @returns A unique session ID
   */
  private generateSessionId(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `sql_session_${timestamp}_${random}`;
  }

  /**
   * Closes all sessions and cleans up resources
   */
  async closeAllSessions(): Promise<void> {
    // Clear the cleanup interval
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }

    const sessionIds = Array.from(this.sessions.keys());
    
    await Promise.all(
      sessionIds.map(async (sessionId) => {
        try {
          await this.sessions.get(sessionId)?.end();
        } catch (error) {
          console.error(`Error closing session ${sessionId}:`, error);
        }
      })
    );

    this.sessions.clear();
  }

  /**
   * Gets session statistics
   * @returns Object with session statistics
   */
  getSessionStats(): {
    total: number;
    active: number;
    expired: number;
    withTransactions: number;
  } {
    const sessions = Array.from(this.sessions.values());
    const now = new Date();
    
    return {
      total: sessions.length,
      active: sessions.filter(s => !s.isExpired(this.sessionTimeout)).length,
      expired: sessions.filter(s => s.isExpired(this.sessionTimeout)).length,
      withTransactions: sessions.filter(s => s.isTransaction).length
    };
  }
}
