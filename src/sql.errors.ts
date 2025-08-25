/**
 * Base SQL error class
 */
export class SqlError extends Error {
  constructor(message: string, public readonly code?: string, public readonly originalError?: Error) {
    super(message);
    this.name = 'SqlError';
    
    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, SqlError);
    }
  }
}

/**
 * Connection error
 */
export class SqlConnectionError extends SqlError {
  constructor(message: string, public readonly originalError?: Error) {
    super(message, 'CONNECTION_ERROR', originalError);
    this.name = 'SqlConnectionError';
  }
}

/**
 * Query execution error
 */
export class SqlQueryError extends SqlError {
  constructor(message: string, public readonly sql?: string, public readonly params?: any[], public readonly originalError?: Error) {
    super(message, 'QUERY_ERROR', originalError);
    this.name = 'SqlQueryError';
  }
}

/**
 * Transaction error
 */
export class SqlTransactionError extends SqlError {
  constructor(message: string, public readonly originalError?: Error) {
    super(message, 'TRANSACTION_ERROR', originalError);
    this.name = 'SqlTransactionError';
  }
}

/**
 * Configuration error
 */
export class SqlConfigError extends SqlError {
  constructor(message: string, public readonly originalError?: Error) {
    super(message, 'CONFIG_ERROR', originalError);
    this.name = 'SqlConfigError';
  }
}

/**
 * Migration error
 */
export class SqlMigrationError extends SqlError {
  constructor(message: string, public readonly migrationName?: string, public readonly originalError?: Error) {
    super(message, 'MIGRATION_ERROR', originalError);
    this.name = 'SqlMigrationError';
  }
}

/**
 * Field mapping error
 */
export class SqlFieldMappingError extends SqlError {
  constructor(message: string, public readonly fieldName?: string, public readonly originalError?: Error) {
    super(message, 'FIELD_MAPPING_ERROR', originalError);
    this.name = 'SqlFieldMappingError';
  }
}

/**
 * Validation error
 */
export class SqlValidationError extends SqlError {
  constructor(message: string, public readonly fieldName?: string, public readonly value?: any, public readonly originalError?: Error) {
    super(message, 'VALIDATION_ERROR', originalError);
    this.name = 'SqlValidationError';
  }
}

/**
 * Timeout error
 */
export class SqlTimeoutError extends SqlError {
  constructor(message: string, public readonly timeout?: number, public readonly originalError?: Error) {
    super(message, 'TIMEOUT_ERROR', originalError);
    this.name = 'SqlTimeoutError';
  }
}

/**
 * Pool error
 */
export class SqlPoolError extends SqlError {
  constructor(message: string, public readonly poolSize?: number, public readonly originalError?: Error) {
    super(message, 'POOL_ERROR', originalError);
    this.name = 'SqlPoolError';
  }
}

/**
 * SSL error
 */
export class SqlSSLError extends SqlError {
  constructor(message: string, public readonly sslConfig?: any, public readonly originalError?: Error) {
    super(message, 'SSL_ERROR', originalError);
    this.name = 'SqlSSLError';
  }
}

/**
 * Authentication error
 */
export class SqlAuthenticationError extends SqlError {
  constructor(message: string, public readonly username?: string, public readonly originalError?: Error) {
    super(message, 'AUTHENTICATION_ERROR', originalError);
    this.name = 'SqlAuthenticationError';
  }
}

/**
 * Permission error
 */
export class SqlPermissionError extends SqlError {
  constructor(message: string, public readonly operation?: string, public readonly table?: string, public readonly originalError?: Error) {
    super(message, 'PERMISSION_ERROR', originalError);
    this.name = 'SqlPermissionError';
  }
}

/**
 * Constraint error
 */
export class SqlConstraintError extends SqlError {
  constructor(message: string, public readonly constraintName?: string, public readonly table?: string, public readonly originalError?: Error) {
    super(message, 'CONSTRAINT_ERROR', originalError);
    this.name = 'SqlConstraintError';
  }
}

/**
 * Deadlock error
 */
export class SqlDeadlockError extends SqlError {
  constructor(message: string, public readonly originalError?: Error) {
    super(message, 'DEADLOCK_ERROR', originalError);
    this.name = 'SqlDeadlockError';
  }
}

/**
 * Lock timeout error
 */
export class SqlLockTimeoutError extends SqlError {
  constructor(message: string, public readonly timeout?: number, public readonly originalError?: Error) {
    super(message, 'LOCK_TIMEOUT_ERROR', originalError);
    this.name = 'SqlLockTimeoutError';
  }
}

/**
 * Creates an appropriate SQL error based on the original error
 */
export function createSqlError(message: string, originalError?: Error, context?: any): SqlError {
  if (originalError) {
    const errorMessage = originalError.message || '';
    const lowerMessage = errorMessage.toLowerCase();
    
    // Connection errors
    if (lowerMessage.includes('connection') || lowerMessage.includes('connect')) {
      return new SqlConnectionError(message, originalError);
    }
    
    // Authentication errors
    if (lowerMessage.includes('access denied') || lowerMessage.includes('authentication')) {
      return new SqlAuthenticationError(message, undefined, originalError);
    }
    
    // Permission errors
    if (lowerMessage.includes('permission') || lowerMessage.includes('access denied')) {
      return new SqlPermissionError(message, context?.operation, context?.table, originalError);
    }
    
    // Constraint errors
    if (lowerMessage.includes('constraint') || lowerMessage.includes('duplicate')) {
      return new SqlConstraintError(message, context?.constraintName, context?.table, originalError);
    }
    
    // Deadlock errors
    if (lowerMessage.includes('deadlock') || lowerMessage.includes('lock wait timeout')) {
      return new SqlDeadlockError(message, originalError);
    }
    
    // Timeout errors
    if (lowerMessage.includes('timeout') || lowerMessage.includes('timed out')) {
      return new SqlTimeoutError(message, context?.timeout, originalError);
    }
    
    // SSL errors
    if (lowerMessage.includes('ssl') || lowerMessage.includes('tls')) {
      return new SqlSSLError(message, context?.sslConfig, originalError);
    }
  }
  
  // Default to generic SQL error
  return new SqlError(message, 'UNKNOWN_ERROR', originalError);
}
