import { SqlMigrationManager, createMigration, MigrationDefinition } from '../../sql.migration';
import { SoapSQL } from '../../soap.sql';
import { 
  setupMySqlDatabase,
  cleanupTestDatabases,
  cleanupMySqlTables,
  mysqlSoap,
  createMySqlTestTable
} from './setup';

describe('MySQL Migration Integration Tests', () => {
  beforeAll(async () => {
    // Setup test database - ensure we have a fresh connection
    await setupMySqlDatabase();
  });

  afterAll(async () => {
    // Cleanup test database
    await cleanupTestDatabases();
  });

  beforeEach(async () => {
    // Ensure we have a valid connection before each test
    if (!mysqlSoap || !mysqlSoap.mysqlPool) {
      console.log('Reconnecting to MySQL...');
      await setupMySqlDatabase();
    }
    
    // Clean up any existing migration tables
    try {
      await cleanupMySqlTables();
    } catch (error) {
      console.log('Cleanup error (expected if no tables exist):', error.message);
    }
  });

  describe('Migration Registration', () => {
    it('should register migrations', async () => {
      // Check if mysqlSoap is available
      expect(mysqlSoap).toBeDefined();
      expect(mysqlSoap).not.toBeNull();
      expect(mysqlSoap!.mysqlPool).toBeDefined();

      // Create fresh migration manager for this test
      const migrationManager = new SqlMigrationManager(mysqlSoap!, {
        tableName: '__migrations',
        lockTimeout: 30000,
        enableChecksums: true,
        enableRollback: true,
        maxRetries: 3
      });

      await migrationManager.initialize();

      const migration1 = createTestMigration1();
      const migration2 = createTestMigration2();

      migrationManager.registerMigration(migration1);
      migrationManager.registerMigration(migration2);

      const migrations = migrationManager.getRegisteredMigrations();
      expect(migrations).toHaveLength(2);
      expect(migrations[0].id).toBe('test-migration-1');
      expect(migrations[1].id).toBe('test-migration-2');

      await migrationManager.close();
    });

    it('should register multiple migrations at once', async () => {
      // Ensure we have a valid connection
      expect(mysqlSoap).toBeDefined();
      expect(mysqlSoap!.mysqlPool).toBeDefined();

      // Create fresh migration manager for this test
      const migrationManager = new SqlMigrationManager(mysqlSoap!, {
        tableName: '__migrations',
        lockTimeout: 30000,
        enableChecksums: true,
        enableRollback: true,
        maxRetries: 3
      });

      await migrationManager.initialize();

      const migrations = [
        createTestMigration1(),
        createTestMigration2()
      ];

      migrationManager.registerMigrations(migrations);

      const registeredMigrations = migrationManager.getRegisteredMigrations();
      expect(registeredMigrations).toHaveLength(2);

      await migrationManager.close();
    });
  });

  describe('Migration Execution', () => {
    it('should run migrations in order', async () => {
      // Ensure we have a valid connection
      expect(mysqlSoap).toBeDefined();
      expect(mysqlSoap!.mysqlPool).toBeDefined();

      // Create fresh migration manager for this test
      const migrationManager = new SqlMigrationManager(mysqlSoap!, {
        tableName: '__migrations',
        lockTimeout: 30000,
        enableChecksums: true,
        enableRollback: true,
        maxRetries: 3
      });

      await migrationManager.initialize();

      const migration1 = createTestMigration1();
      const migration2 = createTestMigration2();

      migrationManager.registerMigration(migration1);
      migrationManager.registerMigration(migration2);

      const result = await migrationManager.migrate();

      expect(result).toHaveLength(2);
      expect(result[0].status).toBe('completed');
      expect(result[1].status).toBe('completed');

      // Verify migrations were applied
      const status = await migrationManager.getAppliedMigrations();
      expect(status).toHaveLength(2);
      expect(status[0].status).toBe('completed');
      expect(status[1].status).toBe('completed');

      await migrationManager.close();
    });

    it('should skip already applied migrations', async () => {
      // Ensure we have a valid connection
      expect(mysqlSoap).toBeDefined();
      expect(mysqlSoap!.mysqlPool).toBeDefined();

      // Create fresh migration manager for this test
      const migrationManager = new SqlMigrationManager(mysqlSoap!, {
        tableName: '__migrations',
        lockTimeout: 30000,
        enableChecksums: true,
        enableRollback: true,
        maxRetries: 3
      });

      await migrationManager.initialize();

      const migration = createTestMigration1();
      migrationManager.registerMigration(migration);

      // Run migration first time
      const result1 = await migrationManager.migrate();
      expect(result1).toHaveLength(1);

      // Run migration second time
      const result2 = await migrationManager.migrate();
      expect(result2).toHaveLength(0);

      await migrationManager.close();
    });
  });

  describe('Migration Status', () => {
    it('should return migration status', async () => {
      // Ensure we have a valid connection
      expect(mysqlSoap).toBeDefined();
      expect(mysqlSoap!.mysqlPool).toBeDefined();

      // Create fresh migration manager for this test
      const migrationManager = new SqlMigrationManager(mysqlSoap!, {
        tableName: '__migrations',
        lockTimeout: 30000,
        enableChecksums: true,
        enableRollback: true,
        maxRetries: 3
      });

      await migrationManager.initialize();

      const migration = createTestMigration1();
      migrationManager.registerMigration(migration);

      const status = await migrationManager.getStatus();
      
      expect(status.total).toBe(1);
      expect(status.applied).toBe(0);
      expect(status.pending).toBe(1);
      expect(status.failed).toBe(0);

      // Apply migration
      await migrationManager.migrate();

      const statusAfter = await migrationManager.getStatus();
      expect(statusAfter.applied).toBe(1);
      expect(statusAfter.pending).toBe(0);

      await migrationManager.close();
    });
  });
});

// Helper functions to create test migrations
function createTestMigration1(): MigrationDefinition {
  return createMigration('test-migration-1', 'Test Migration 1', '1.0.0')
    .up(`
      CREATE TABLE test_migration_table (
        id INT PRIMARY KEY AUTO_INCREMENT,
        name VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)
    .down('DROP TABLE test_migration_table')
    .build();
}

function createTestMigration2(): MigrationDefinition {
  return createMigration('test-migration-2', 'Test Migration 2', '1.0.1')
    .up(`
      ALTER TABLE test_migration_table 
      ADD COLUMN email VARCHAR(255),
      ADD INDEX idx_email (email)
    `)
    .down(`
      ALTER TABLE test_migration_table 
      DROP INDEX idx_email,
      DROP COLUMN email
    `)
    .build();
}
