import { 
  SqlMigrationManager, 
  MigrationBuilder, 
  createMigration,
  MigrationStatus,
  MigrationDefinition 
} from '../sql.migration';
import { SoapSQL } from '../soap.sql';
import { SqlConfig } from '../sql.types';

// Mock SoapSQL
jest.mock('../soap.sql');
jest.mock('../sql.config');

describe('SqlMigrationManager', () => {
  let migrationManager: SqlMigrationManager;
  let mockSoapSql: any;

  beforeEach(() => {
    // Mock SoapSQL
    mockSoapSql = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
      close: jest.fn().mockResolvedValue(undefined)
    };

    migrationManager = new SqlMigrationManager(mockSoapSql, {
      tableName: '__migrations',
      lockTimeout: 30000,
      enableChecksums: true,
      enableRollback: true,
      maxRetries: 3
    });
  });

  describe('registerMigration', () => {
    it('should register a migration', () => {
      const migration = createTestMigration();
      migrationManager.registerMigration(migration);
      
      const migrations = migrationManager.getRegisteredMigrations();
      expect(migrations).toHaveLength(1);
      expect(migrations[0]).toBe(migration);
    });

    it('should register multiple migrations', () => {
      const migration1 = createTestMigration();
      const migration2 = createTestMigration2();
      
      migrationManager.registerMigrations([migration1, migration2]);
      
      const migrations = migrationManager.getRegisteredMigrations();
      expect(migrations).toHaveLength(2);
    });
  });

  describe('getPendingMigrations', () => {
    it('should return pending migrations', async () => {
      const migration = createTestMigration();
      migrationManager.registerMigration(migration);

      // Mock empty applied migrations
      mockSoapSql.query.mockResolvedValue({ rows: [] });

      const pendingMigrations = await migrationManager.getPendingMigrations();
      expect(pendingMigrations).toHaveLength(1);
      expect(pendingMigrations[0]).toBe(migration);
    });

    it('should filter out applied migrations', async () => {
      const migration = createTestMigration();
      migrationManager.registerMigration(migration);

      // Mock that migration is already applied
      mockSoapSql.query.mockResolvedValue({
        rows: [{ id: 'test-migration', version: '1.0.0', status: MigrationStatus.COMPLETED }]
      });

      const pendingMigrations = await migrationManager.getPendingMigrations();
      expect(pendingMigrations).toHaveLength(0);
    });
  });

  describe('getAppliedMigrations', () => {
    it('should return applied migrations from database', async () => {
      const mockAppliedMigrations = [
        { 
          id: 'test-1', 
          name: 'Test Migration', 
          version: '1.0.0', 
          status: MigrationStatus.COMPLETED,
          applied_at: new Date(),
          execution_time: 100,
          checksum: 'abc123'
        }
      ];
      
      mockSoapSql.query.mockResolvedValue({ rows: mockAppliedMigrations });

      const appliedMigrations = await migrationManager.getAppliedMigrations();
      expect(appliedMigrations).toHaveLength(1);
      expect(appliedMigrations[0].id).toBe('test-1');
      expect(appliedMigrations[0].status).toBe(MigrationStatus.COMPLETED);
    });
  });

  describe('migrate', () => {
    it('should run pending migrations', async () => {
      const migration = createTestMigration();
      migrationManager.registerMigration(migration);

      // Mock empty applied migrations
      mockSoapSql.query
        .mockResolvedValueOnce({ rows: [] }) // getAppliedMigrations
        .mockResolvedValueOnce({ rows: [] }) // _insertMigrationRecord
        .mockResolvedValueOnce({ rows: [] }) // _updateMigrationRecord

      const result = await migrationManager.migrate();
      
      expect(result).toHaveLength(1);
      expect(result[0].status).toBe(MigrationStatus.COMPLETED);
    });

    it('should skip already applied migrations', async () => {
      const migration = createTestMigration();
      migrationManager.registerMigration(migration);

      // Mock that migration is already applied
      mockSoapSql.query.mockResolvedValue({
        rows: [{ id: 'test-migration', version: '1.0.0', status: MigrationStatus.COMPLETED }]
      });

      const result = await migrationManager.migrate();
      expect(result).toHaveLength(0);
    });

    it('should handle migration errors', async () => {
      const failingMigration = createFailingMigration();
      migrationManager.registerMigration(failingMigration);

      // Mock empty applied migrations
      mockSoapSql.query
        .mockResolvedValueOnce({ rows: [] }) // getAppliedMigrations
        .mockResolvedValueOnce({ rows: [] }) // _insertMigrationRecord
        .mockRejectedValueOnce(new Error('Migration failed')) // migration.up() call
        .mockResolvedValueOnce({ rows: [] }) // _updateMigrationRecord

      await expect(migrationManager.migrate()).rejects.toThrow('Migration failed');
    });
  });

  describe('rollback', () => {
    it('should rollback the last migration', async () => {
      const migration = createTestMigration();
      migrationManager.registerMigration(migration);

      // Mock applied migration
      const mockAppliedMigration = { 
        id: 'test-migration', 
        name: 'Test Migration',
        version: '1.0.0', 
        status: MigrationStatus.COMPLETED,
        applied_at: new Date(),
        execution_time: 100,
        checksum: 'abc123'
      };
      
      mockSoapSql.query
        .mockResolvedValueOnce({ rows: [mockAppliedMigration] }) // getAppliedMigrations
        .mockResolvedValueOnce({ rows: [] }) // _updateMigrationRecord

      const result = await migrationManager.rollback();
      
      expect(result).toHaveLength(1);
      expect(result[0].status).toBe(MigrationStatus.ROLLED_BACK);
    });

    it('should handle rollback errors', async () => {
      const nonReversibleMigration = createNonReversibleMigration();
      migrationManager.registerMigration(nonReversibleMigration);

      // Mock applied migration
      const mockAppliedMigration = { 
        id: 'non-reversible', 
        name: 'Non Reversible Migration',
        version: '1.0.0', 
        status: MigrationStatus.COMPLETED,
        applied_at: new Date(),
        execution_time: 100,
        checksum: 'abc123'
      };
      
      mockSoapSql.query
        .mockResolvedValueOnce({ rows: [mockAppliedMigration] }) // getAppliedMigrations
        .mockRejectedValueOnce(new Error('Rollback failed')) // migration.down() call
        .mockResolvedValueOnce({ rows: [] }) // _updateMigrationRecord

      await expect(migrationManager.rollback()).rejects.toThrow('Rollback failed');
    });
  });

  describe('getStatus', () => {
    it('should return migration status', async () => {
      const mockAppliedMigrations = [
        { 
          id: 'test-1', 
          status: MigrationStatus.COMPLETED,
          applied_at: new Date()
        },
        { 
          id: 'test-2', 
          status: MigrationStatus.FAILED,
          applied_at: new Date()
        }
      ];
      
      mockSoapSql.query.mockResolvedValue({ rows: mockAppliedMigrations });

      const migration = createTestMigration();
      migrationManager.registerMigration(migration);

      const status = await migrationManager.getStatus();
      
      expect(status.total).toBe(1);
      expect(status.applied).toBe(1);
      expect(status.failed).toBe(1);
      expect(status.pending).toBe(1); // The registered migration is not in applied list
    });
  });

  describe('validateChecksums', () => {
    it('should validate migration checksums', async () => {
      const migration = createTestMigration();
      migrationManager.registerMigration(migration);

      // Mock applied migration with different checksum
      const mockAppliedMigration = { 
        id: 'test-migration', 
        name: 'Test Migration',
        checksum: 'different-checksum'
      };
      
      mockSoapSql.query.mockResolvedValue({ rows: [mockAppliedMigration] });

      const result = await migrationManager.validateChecksums();
      
      expect(result.valid).toBe(false);
      expect(result.invalidMigrations).toContain('Test Migration');
    });

    it('should return valid when checksums match', async () => {
      const migration = createTestMigration();
      migrationManager.registerMigration(migration);

      // Mock applied migration with matching checksum
      const mockAppliedMigration = { 
        id: 'test-migration', 
        checksum: migration.checksum
      };
      
      mockSoapSql.query.mockResolvedValue({ rows: [mockAppliedMigration] });

      const result = await migrationManager.validateChecksums();
      
      expect(result.valid).toBe(true);
      expect(result.invalidMigrations).toHaveLength(0);
    });
  });
});

describe('MigrationBuilder', () => {
  it('should build migration definition', () => {
    const migration = createMigration('test-migration', 'Test Migration', '1.0.0')
      .up('CREATE TABLE test (id INT PRIMARY KEY)')
      .down('DROP TABLE test')
      .dependsOn('other-migration')
      .build();

    expect(migration.id).toBe('test-migration');
    expect(migration.name).toBe('Test Migration');
    expect(migration.version).toBe('1.0.0');
    expect(migration.dependencies).toContain('other-migration');
    expect(typeof migration.up).toBe('function');
    expect(typeof migration.down).toBe('function');
  });
});

// Helper functions to create test migrations
function createTestMigration(): MigrationDefinition {
  return createMigration('test-migration', 'Test Migration', '1.0.0')
    .up('CREATE TABLE test (id INT PRIMARY KEY, name VARCHAR(255))')
    .down('DROP TABLE test')
    .build();
}

function createTestMigration2(): MigrationDefinition {
  return createMigration('test-migration-2', 'Test Migration 2', '1.0.1')
    .up('ALTER TABLE test ADD COLUMN email VARCHAR(255)')
    .down('ALTER TABLE test DROP COLUMN email')
    .build();
}

function createFailingMigration(): MigrationDefinition {
  return createMigration('failing-migration', 'Failing Migration', '1.0.2')
    .up('INVALID SQL STATEMENT')
    .down('DROP TABLE test')
    .build();
}

function createNonReversibleMigration(): MigrationDefinition {
  return createMigration('non-reversible', 'Non Reversible Migration', '1.0.3')
    .up('CREATE TABLE test (id INT PRIMARY KEY)')
    .down('INVALID ROLLBACK SQL')
    .build();
}
