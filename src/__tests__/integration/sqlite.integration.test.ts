import { SqlDataSource } from '../../sql.source';
import { SoapSQL } from '../../soap.sql';
import { 
  setupSqliteDatabase,
  cleanupTestDatabases,
  cleanupSqliteTables,
  sqliteSoap,
  createSqliteTestTable,
  insertSqliteTestData,
  querySqliteTestData
} from './setup';

describe('SQLite Integration Tests', () => {
  let sqliteSource: SqlDataSource<any>;

  beforeAll(async () => {
    // Setup SQLite test database
    await setupSqliteDatabase();
    
    // Debug: check database type
    console.log('SQLite SoapSQL database type:', sqliteSoap?.databaseType);
    
    // Create source for SQLite
    sqliteSource = new SqlDataSource(sqliteSoap!, 'users');
    
    // Debug: check SqlDataSource database type
    console.log('SqlDataSource database type:', (sqliteSource as any)._databaseType);
  });

  afterAll(async () => {
    // Cleanup test database
    await cleanupTestDatabases();
  });

  beforeEach(async () => {
    // Clean up SQLite tables before each test
    await cleanupSqliteTables();
  });

  describe('SQLite SqlDataSource Integration', () => {
    beforeEach(async () => {
      // Create test table for SQLite
      const createTableSQL = `
        CREATE TABLE users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          email TEXT UNIQUE NOT NULL,
          age INTEGER,
          status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `;
      
      await createSqliteTestTable('users', createTableSQL);
    });

    it('should perform basic CRUD operations', async () => {
      // Insert test data
      const testData = [
        { name: 'John Doe', email: 'john@example.com', age: 30, status: 'active' },
        { name: 'Jane Smith', email: 'jane@example.com', age: 25, status: 'active' },
        { name: 'Bob Johnson', email: 'bob@example.com', age: 35, status: 'inactive' }
      ];

      console.log('Inserting test data...');
      await insertSqliteTestData('users', testData);
      console.log('Test data inserted');

      // Test direct SQL query to see if data exists
      console.log('Checking data with direct SQL query...');
      const directResult = await sqliteSoap!.query('SELECT * FROM users');
      console.log('Direct SQL result:', directResult);

      // Test find operation
      console.log('Testing find all...');
      const allUsers = await sqliteSource.find({ collection: 'users' });
      console.log('Find all result:', allUsers);
      expect(allUsers).toHaveLength(3);

      // Test find with where clause
      console.log('Testing find with where clause...');
      const activeUsers = await sqliteSource.find({ collection: 'users', where: { status: 'active' } });
      console.log('Find active users result:', activeUsers);
      expect(activeUsers).toHaveLength(2);

      // Test find with complex where clause
      const adultActiveUsers = await sqliteSource.find({ 
        collection: 'users',
        where: { 
          status: 'active',
          age: { $gte: 25 }
        } 
      });
      expect(adultActiveUsers).toHaveLength(2);

      // Test findOne operation
      const john = await sqliteSource.findOne('users', { email: 'john@example.com' });
      expect(john).toBeDefined();
      expect(john.name).toBe('John Doe');

      // Test count operation
      const totalCount = await sqliteSource.count({ collection: 'users' });
      expect(totalCount).toBe(3);

      const activeCount = await sqliteSource.count({ collection: 'users', where: { status: 'active' } });
      expect(activeCount).toBe(2);
    });

    it('should handle insert operations', async () => {
      // Insert single document
      const newUser = { name: 'Alice Brown', email: 'alice@example.com', age: 28 };
      const insertResult = await sqliteSource.insert({ collection: 'users', data: newUser });
      
      expect(Array.isArray(insertResult)).toBe(true);
      expect(insertResult).toHaveLength(1);
      expect(insertResult[0].id).toBeDefined();

      // Verify insertion
      const insertedUser = await sqliteSource.findOne('users', { email: 'alice@example.com' });
      expect(insertedUser.name).toBe('Alice Brown');
      expect(insertedUser.age).toBe(28);

      // Insert multiple documents
      const multipleUsers = [
        { name: 'Charlie Wilson', email: 'charlie@example.com', age: 32 },
        { name: 'Diana Davis', email: 'diana@example.com', age: 29 }
      ];

      const multipleResult = await sqliteSource.insert({ collection: 'users', data: multipleUsers });
      expect(multipleResult).toHaveLength(2);

      // Verify total count
      const totalCount = await sqliteSource.count({ collection: 'users' });
      expect(totalCount).toBe(3);
    });

    it('should handle update operations', async () => {
      // Insert test data
      const testData = [
        { name: 'John Doe', email: 'john@example.com', age: 30, status: 'active' },
        { name: 'Jane Smith', email: 'jane@example.com', age: 25, status: 'active' }
      ];

      await insertSqliteTestData('users', testData);

      // Update single document
      const updateResult = await sqliteSource.update({
        collection: 'users',
        where: { email: 'john@example.com' },
        update: { age: 31, status: 'inactive' }
      });

      expect(updateResult.modifiedCount).toBe(1);

      // Verify update
      const updatedUser = await sqliteSource.findOne('users', { email: 'john@example.com' });
      expect(updatedUser.age).toBe(31);
      expect(updatedUser.status).toBe('inactive');

      // Update multiple documents
      const multipleUpdateResult = await sqliteSource.update({
        collection: 'users',
        where: { status: 'active' },
        update: { status: 'inactive' }
      });

      expect(multipleUpdateResult.modifiedCount).toBe(1);

      // Verify all users are now inactive
      const inactiveUsers = await sqliteSource.find({ collection: 'users', where: { status: 'inactive' } });
      expect(inactiveUsers).toHaveLength(2);
    });

    it('should handle delete operations', async () => {
      // Insert test data
      const testData = [
        { name: 'John Doe', email: 'john@example.com', age: 30 },
        { name: 'Jane Smith', email: 'jane@example.com', age: 25 },
        { name: 'Bob Johnson', email: 'bob@example.com', age: 35 }
      ];

      await insertSqliteTestData('users', testData);

      // Delete single document
      const deleteResult = await sqliteSource.delete('users', { email: 'john@example.com' });
      expect(deleteResult.affectedRows).toBe(1);

      // Verify deletion
      const remainingUsers = await sqliteSource.find({ collection: 'users' });
      expect(remainingUsers).toHaveLength(2);

      // Delete multiple documents
      const multipleDeleteResult = await sqliteSource.delete('users', { age: { $gte: 30 } });
      expect(multipleDeleteResult.affectedRows).toBe(1);

      // Verify final count
      const finalCount = await sqliteSource.count({ collection: 'users' });
      expect(finalCount).toBe(1);
    });

    it('should handle complex queries with JSON-like operators', async () => {
      // Insert test data
      const testData = [
        { name: 'Gaming Laptop', email: 'gaming@example.com', age: 25, status: 'active' },
        { name: 'Office Laptop', email: 'office@example.com', age: 30, status: 'active' },
        { name: 'Gaming Mouse', email: 'mouse@example.com', age: 22, status: 'inactive' },
        { name: 'Office Chair', email: 'chair@example.com', age: 35, status: 'active' }
      ];

      await insertSqliteTestData('users', testData);

      // Test range queries
      const olderUsers = await sqliteSource.find({ 
        collection: 'users',
        where: { age: { $gte: 30 } } 
      });
      expect(olderUsers).toHaveLength(2);

      // Test multiple conditions
      const activeYoungUsers = await sqliteSource.find({ 
        collection: 'users',
        where: { 
          status: 'active',
          age: { $lt: 30 }
        } 
      });
      expect(activeYoungUsers).toHaveLength(1);

      // Test text search
      const gamingUsers = await sqliteSource.find({ 
        collection: 'users',
        where: { name: { $like: '%Gaming%' } } 
      });
      expect(gamingUsers).toHaveLength(2);
    });

    it('should handle SQLite-specific data types and operations', async () => {
      // Insert test data with various SQLite types
      const testData = [
        { name: 'Test User 1', email: 'test1@example.com', age: 25, status: 'active' },
        { name: 'Test User 2', email: 'test2@example.com', age: 30, status: 'inactive' }
      ];

      await insertSqliteTestData('users', testData);

      // Test INTEGER type handling
      const youngUsers = await sqliteSource.find({ 
        collection: 'users',
        where: { age: { $lt: 30 } } 
      });
      expect(youngUsers).toHaveLength(1);

      // Test TEXT type handling
      const activeUsers = await sqliteSource.find({ 
        collection: 'users',
        where: { status: 'active' } 
      });
      expect(activeUsers).toHaveLength(1);

      // Test mixed conditions
      const activeYoungCount = await sqliteSource.count({ 
        collection: 'users', 
        where: { status: 'active', age: { $lt: 30 } } 
      });
      expect(activeYoungCount).toBe(1);
    });
  });

  describe('SQLite SoapSQL Integration', () => {
    it('should create SQLite instance and perform basic operations', async () => {
      expect(sqliteSoap).toBeDefined();
      expect(sqliteSoap?.databaseType).toBe('sqlite');
      expect(sqliteSoap?.sqliteDb).toBeDefined();

      // Test connection health
      const isHealthy = await sqliteSoap!.isHealthy();
      expect(isHealthy).toBe(true);

      // Test connection pool stats
      const stats = await sqliteSoap!.getConnectionPoolStats();
      expect(stats.connections).toBe(1);

      // Test server status
      const status = await sqliteSoap!.getServerStatus();
      expect(status.version).toBeDefined();

      // Test database info
      const info = await sqliteSoap!.getDatabaseInfo();
      expect(info.database_name).toBe(':memory:');
    });

    it('should execute queries and manage connections', async () => {
      // Create test table
      const createTableSQL = `
        CREATE TABLE test_table (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          value INTEGER
        )
      `;
      
      await createSqliteTestTable('test_table', createTableSQL);

      // Insert test data
      const testData = [
        { name: 'Test 1', value: 100 },
        { name: 'Test 2', value: 200 }
      ];

      await insertSqliteTestData('test_table', testData);

      // Query data
      const result = await sqliteSoap!.query('SELECT COUNT(*) as count FROM test_table');
      expect(result[0].count).toBe(2);

      // Test connection management
      const connection = await sqliteSoap!.getConnection();
      expect(connection).toBeDefined();
    });
  });
});
