import { SoapSQL } from './soap.sql';
import { SqlConfig, SqlTableDefinition, SqlIndexDefinition } from './sql.types';
import { SqlConnectionError, SqlMigrationError } from './sql.errors';

/**
 * Migration status
 */
export enum MigrationStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  ROLLED_BACK = 'rolled_back'
}

/**
 * Migration record
 */
export interface MigrationRecord {
  id: string;
  name: string;
  version: string;
  status: MigrationStatus;
  appliedAt: Date;
  executionTime: number;
  checksum: string;
  rollbackScript?: string;
  error?: string;
}

/**
 * Migration definition
 */
export interface MigrationDefinition {
  id: string;
  name: string;
  version: string;
  up: (connection: any) => Promise<void>;
  down: (connection: any) => Promise<void>;
  checksum: string;
  dependencies?: string[];
}

/**
 * Migration configuration
 */
export interface MigrationConfig {
  tableName: string;
  lockTimeout: number;
  enableChecksums: boolean;
  enableRollback: boolean;
  maxRetries: number;
}

/**
 * SQL Migration Manager for handling database schema changes
 */
export class SqlMigrationManager {
  private _soapSql: SoapSQL;
  private _config: MigrationConfig;
  private _migrations: Map<string, MigrationDefinition> = new Map();

  constructor(soapSql: SoapSQL, config: Partial<MigrationConfig> = {}) {
    this._soapSql = soapSql;
    this._config = {
      tableName: '__migrations',
      lockTimeout: 30000, // 30 seconds
      enableChecksums: true,
      enableRollback: true,
      maxRetries: 3,
      ...config
    };
  }

  /**
   * Creates a new migration manager
   */
  public static async create(config: SqlConfig, migrationConfig?: Partial<MigrationConfig>): Promise<SqlMigrationManager> {
    const soapSql = await SoapSQL.create(config as any);
    const manager = new SqlMigrationManager(soapSql, migrationConfig);
    await manager.initialize();
    return manager;
  }

  /**
   * Initializes the migration manager
   */
  async initialize(): Promise<void> {
    try {
      await this._createMigrationsTable();
    } catch (error) {
      throw new SqlMigrationError(`Failed to initialize migration manager: ${error.message}`, error);
    }
  }

  /**
   * Registers a migration
   */
  registerMigration(migration: MigrationDefinition): void {
    this._migrations.set(migration.id, migration);
  }

  /**
   * Registers multiple migrations
   */
  registerMigrations(migrations: MigrationDefinition[]): void {
    migrations.forEach(migration => this.registerMigration(migration));
  }

  /**
   * Gets all registered migrations
   */
  getRegisteredMigrations(): MigrationDefinition[] {
    return Array.from(this._migrations.values());
  }

  /**
   * Gets pending migrations
   */
  async getPendingMigrations(): Promise<MigrationDefinition[]> {
    const appliedMigrations = await this._getAppliedMigrations();
    const appliedIds = new Set(appliedMigrations.map(m => m.id));
    
    return Array.from(this._migrations.values())
      .filter(migration => !appliedIds.has(migration.id))
      .sort((a, b) => this._compareVersions(a.version, b.version));
  }

  /**
   * Gets applied migrations
   */
  async getAppliedMigrations(): Promise<MigrationRecord[]> {
    return this._getAppliedMigrations();
  }

  /**
   * Runs pending migrations
   */
  async migrate(targetVersion?: string): Promise<MigrationRecord[]> {
    try {
      const pendingMigrations = await this.getPendingMigrations();
      
      if (pendingMigrations.length === 0) {
        return [];
      }

      const targetMigrations = targetVersion 
        ? pendingMigrations.filter(m => this._compareVersions(m.version, targetVersion) <= 0)
        : pendingMigrations;

      const results: MigrationRecord[] = [];

      for (const migration of targetMigrations) {
        try {
          const result = await this._runMigration(migration);
          results.push(result);
        } catch (error) {
          throw new SqlMigrationError(`Migration ${migration.name} failed: ${error.message}`, error);
        }
      }

      return results;
    } catch (error) {
      throw new SqlMigrationError(`Migration process failed: ${error.message}`, error);
    }
  }

  /**
   * Rolls back migrations
   */
  async rollback(targetVersion?: string, count?: number): Promise<MigrationRecord[]> {
    try {
      const appliedMigrations = await this.getAppliedMigrations();
      
      if (appliedMigrations.length === 0) {
        return [];
      }

      let targetMigrations: MigrationRecord[];

      if (targetVersion) {
        targetMigrations = appliedMigrations
          .filter(m => this._compareVersions(m.version, targetVersion) > 0)
          .reverse();
      } else if (count) {
        targetMigrations = appliedMigrations.slice(-count).reverse();
      } else {
        targetMigrations = appliedMigrations.slice(-1).reverse();
      }

      const results: MigrationRecord[] = [];

      for (const migrationRecord of targetMigrations) {
        try {
          const result = await this._rollbackMigration(migrationRecord);
          results.push(result);
        } catch (error) {
          throw new SqlMigrationError(`Rollback of ${migrationRecord.name} failed: ${error.message}`, error);
        }
      }

      return results;
    } catch (error) {
      throw new SqlMigrationError(`Rollback process failed: ${error.message}`, error);
    }
  }

  /**
   * Gets migration status
   */
  async getStatus(): Promise<{
    total: number;
    applied: number;
    pending: number;
    failed: number;
    lastApplied?: Date;
    lastFailed?: Date;
  }> {
    const appliedMigrations = await this.getAppliedMigrations();
    const pendingMigrations = await this.getPendingMigrations();
    const failedMigrations = appliedMigrations.filter(m => m.status === MigrationStatus.FAILED);

    return {
      total: this._migrations.size,
      applied: appliedMigrations.filter(m => m.status === MigrationStatus.COMPLETED).length,
      pending: pendingMigrations.length,
      failed: failedMigrations.length,
      lastApplied: appliedMigrations.length > 0 ? appliedMigrations[appliedMigrations.length - 1].appliedAt : undefined,
      lastFailed: failedMigrations.length > 0 ? failedMigrations[failedMigrations.length - 1].appliedAt : undefined
    };
  }

  /**
   * Validates migration checksums
   */
  async validateChecksums(): Promise<{
    valid: boolean;
    invalidMigrations: string[];
  }> {
    if (!this._config.enableChecksums) {
      return { valid: true, invalidMigrations: [] };
    }

    const appliedMigrations = await this.getAppliedMigrations();
    const invalidMigrations: string[] = [];

    for (const record of appliedMigrations) {
      const migration = this._migrations.get(record.id);
      if (migration && migration.checksum !== record.checksum) {
        invalidMigrations.push(record.name);
      }
    }

    return {
      valid: invalidMigrations.length === 0,
      invalidMigrations
    };
  }

  /**
   * Creates the migrations table
   */
  private async _createMigrationsTable(): Promise<void> {
    const tableExists = await this._tableExists(this._config.tableName);
    
    if (!tableExists) {
      const createTableSql = `
        CREATE TABLE ${this._config.tableName} (
          id VARCHAR(255) PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          version VARCHAR(50) NOT NULL,
          status ENUM('pending', 'running', 'completed', 'failed', 'rolled_back') NOT NULL,
          applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          execution_time INT NOT NULL,
          checksum VARCHAR(64) NOT NULL,
          rollback_script TEXT,
          error TEXT,
          INDEX idx_version (version),
          INDEX idx_status (status),
          INDEX idx_applied_at (applied_at)
        )
      `;

      await this._soapSql.query(createTableSql);
    }
  }

  /**
   * Checks if a table exists
   */
  private async _tableExists(tableName: string): Promise<boolean> {
    try {
      const result = await this._soapSql.query(
        `SELECT 1 FROM information_schema.tables WHERE table_name = ?`,
        [tableName]
      );
      
      // Handle different database types
      // MySQL returns rows directly, PostgreSQL returns { rows: [...] }
      const rows = Array.isArray(result) ? result : (result.rows || []);
      return rows.length > 0;
    } catch (error) {
      return false;
    }
  }

  /**
   * Gets applied migrations from database
   */
  private async _getAppliedMigrations(): Promise<MigrationRecord[]> {
    try {
      const result = await this._soapSql.query(
        `SELECT * FROM ${this._config.tableName} ORDER BY applied_at ASC`
      );

      // Handle different database types
      // MySQL returns rows directly, PostgreSQL returns { rows: [...] }
      const rows = Array.isArray(result) ? result : (result.rows || []);
      
      return rows.map(row => ({
        id: row.id,
        name: row.name,
        version: row.version,
        status: row.status as MigrationStatus,
        appliedAt: new Date(row.applied_at),
        executionTime: row.execution_time,
        checksum: row.checksum,
        rollbackScript: row.rollback_script,
        error: row.error
      }));
    } catch (error) {
      return [];
    }
  }

  /**
   * Runs a single migration
   */
  private async _runMigration(migration: MigrationDefinition): Promise<MigrationRecord> {
    const startTime = Date.now();
    
    try {
      // Insert migration record
      await this._insertMigrationRecord(migration, MigrationStatus.RUNNING);

      // Execute migration
      await migration.up(this._soapSql);

      const executionTime = Date.now() - startTime;

      // Update migration record
      const record: MigrationRecord = {
        id: migration.id,
        name: migration.name,
        version: migration.version,
        status: MigrationStatus.COMPLETED,
        appliedAt: new Date(),
        executionTime,
        checksum: migration.checksum
      };

      await this._updateMigrationRecord(record);

      return record;
    } catch (error) {
      const executionTime = Date.now() - startTime;
      
      // Update migration record with error
      const record: MigrationRecord = {
        id: migration.id,
        name: migration.name,
        version: migration.version,
        status: MigrationStatus.FAILED,
        appliedAt: new Date(),
        executionTime,
        checksum: migration.checksum,
        error: error instanceof Error ? error.message : String(error)
      };

      await this._updateMigrationRecord(record);
      throw error;
    }
  }

  /**
   * Rolls back a single migration
   */
  private async _rollbackMigration(migrationRecord: MigrationRecord): Promise<MigrationRecord> {
    const startTime = Date.now();
    
    try {
      const migration = this._migrations.get(migrationRecord.id);
      if (!migration) {
        throw new Error(`Migration ${migrationRecord.name} not found`);
      }

      // Execute rollback
      await migration.down(this._soapSql);

      const executionTime = Date.now() - startTime;

      // Update migration record
      const record: MigrationRecord = {
        ...migrationRecord,
        status: MigrationStatus.ROLLED_BACK,
        appliedAt: new Date(),
        executionTime
      };

      await this._updateMigrationRecord(record);

      return record;
    } catch (error) {
      const executionTime = Date.now() - startTime;
      
      // Update migration record with error
      const record: MigrationRecord = {
        ...migrationRecord,
        status: MigrationStatus.FAILED,
        appliedAt: new Date(),
        executionTime,
        error: error instanceof Error ? error.message : String(error)
      };

      await this._updateMigrationRecord(record);
      throw error;
    }
  }

  /**
   * Inserts a migration record
   */
  private async _insertMigrationRecord(migration: MigrationDefinition, status: MigrationStatus): Promise<void> {
    await this._soapSql.query(
      `INSERT INTO ${this._config.tableName} (id, name, version, status, execution_time, checksum) VALUES (?, ?, ?, ?, 0, ?)`,
      [migration.id, migration.name, migration.version, status, migration.checksum]
    );
  }

  /**
   * Updates a migration record
   */
  private async _updateMigrationRecord(record: MigrationRecord): Promise<void> {
    await this._soapSql.query(
      `UPDATE ${this._config.tableName} SET status = ?, execution_time = ?, error = ? WHERE id = ?`,
      [record.status, record.executionTime, record.error || null, record.id]
    );
  }

  /**
   * Compares version strings
   */
  private _compareVersions(a: string, b: string): number {
    const aParts = a.split('.').map(Number);
    const bParts = b.split('.').map(Number);
    
    const maxLength = Math.max(aParts.length, bParts.length);
    
    for (let i = 0; i < maxLength; i++) {
      const aPart = aParts[i] || 0;
      const bPart = bParts[i] || 0;
      
      if (aPart < bPart) return -1;
      if (aPart > bPart) return 1;
    }
    
    return 0;
  }

  /**
   * Closes the migration manager
   */
  async close(): Promise<void> {
    try {
      await this._soapSql.close();
    } catch (error) {
      throw new SqlConnectionError(`Failed to close migration manager: ${error.message}`, error);
    }
  }
}

/**
 * Migration builder for creating migration definitions
 */
export class MigrationBuilder {
  private _id: string;
  private _name: string;
  private _version: string;
  private _upScript: string;
  private _downScript: string;
  private _dependencies: string[] = [];

  constructor(id: string, name: string, version: string) {
    this._id = id;
    this._name = name;
    this._version = version;
  }

  /**
   * Sets the up migration script
   */
  up(script: string): MigrationBuilder {
    this._upScript = script;
    return this;
  }

  /**
   * Sets the down migration script
   */
  down(script: string): MigrationBuilder {
    this._downScript = script;
    return this;
  }

  /**
   * Adds dependencies
   */
  dependsOn(...dependencies: string[]): MigrationBuilder {
    this._dependencies.push(...dependencies);
    return this;
  }

  /**
   * Builds the migration definition
   */
  build(): MigrationDefinition {
    return {
      id: this._id,
      name: this._name,
      version: this._version,
      up: async (connection: any) => {
        if (this._upScript) {
          await connection.query(this._upScript);
        }
      },
      down: async (connection: any) => {
        if (this._downScript) {
          await connection.query(this._downScript);
        }
      },
      checksum: this._generateChecksum(),
      dependencies: this._dependencies.length > 0 ? this._dependencies : undefined
    };
  }

  /**
   * Generates a checksum for the migration
   */
  private _generateChecksum(): string {
    const content = `${this._id}${this._name}${this._version}${this._upScript}${this._downScript}`;
    // Simple hash function - in production, use a proper hashing library
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16);
  }
}

/**
 * Creates a new migration builder
 */
export function createMigration(id: string, name: string, version: string): MigrationBuilder {
  return new MigrationBuilder(id, name, version);
}
