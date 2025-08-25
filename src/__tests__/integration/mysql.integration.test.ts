import { SqlDataSource } from '../../sql.source';
import { SoapSQL } from '../../soap.sql';
import { 
  setupMySqlDatabase,
  cleanupTestDatabases,
  cleanupMySqlTables,
  mysqlSoap,
  createMySqlTestTable,
  insertMySqlTestData,
  queryMySqlTestData
} from './setup';

describe('MySQL Integration Tests', () => {
  let mysqlSource: SqlDataSource<any>;

  beforeAll(async () => {
    // Setup MySQL test database
    await setupMySqlDatabase();
    
    // Debug: check database type
    console.log('MySQL SoapSQL database type:', mysqlSoap?.databaseType);
    
    // Create source for MySQL
    mysqlSource = new SqlDataSource(mysqlSoap!, 'users');
    
    // Debug: check SqlDataSource database type
    console.log('SqlDataSource database type:', (mysqlSource as any)._databaseType);
  });

  afterAll(async () => {
    // Cleanup test database
    await cleanupTestDatabases();
  });

  beforeEach(async () => {
    // Clean up MySQL tables before each test
    await cleanupMySqlTables();
  });

  describe('MySQL SqlDataSource Integration', () => {
    beforeEach(async () => {
      // Create test table for MySQL
      const createTableSQL = `
        CREATE TABLE users (
          id INT AUTO_INCREMENT PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          email VARCHAR(255) UNIQUE NOT NULL,
          age INT,
          status ENUM('active', 'inactive') DEFAULT 'active',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
      `;
      
      await createMySqlTestTable('users', createTableSQL);
    });

    it('should perform basic CRUD operations', async () => {
      // Insert test data
      const testData = [
        { name: 'John Doe', email: 'john@example.com', age: 30, status: 'active' },
        { name: 'Jane Smith', email: 'jane@example.com', age: 25, status: 'active' },
        { name: 'Bob Johnson', email: 'bob@example.com', age: 35, status: 'inactive' }
      ];

      console.log('Inserting test data...');
      await insertMySqlTestData('users', testData);
      console.log('Test data inserted');

      // Test direct SQL query to see if data exists
      console.log('Checking data with direct SQL query...');
      const directResult = await mysqlSoap!.query('SELECT * FROM `users`');
      console.log('Direct SQL result:', directResult);

      // Test find operation
      console.log('Testing find all...');
      const allUsers = await mysqlSource.find({ collection: 'users' });
      console.log('Find all result:', allUsers);
      expect(allUsers).toHaveLength(3);

      // Test find with where clause
      console.log('Testing find with where clause...');
      const activeUsers = await mysqlSource.find({ collection: 'users', where: { status: 'active' } });
      console.log('Find active users result:', activeUsers);
      expect(activeUsers).toHaveLength(2);

      // Test find with complex where clause
      const adultActiveUsers = await mysqlSource.find({ 
        collection: 'users',
        where: { 
          status: 'active',
          age: { $gte: 25 }
        } 
      });
      expect(adultActiveUsers).toHaveLength(2);

      // Test findOne operation
      const john = await mysqlSource.findOne('users', { email: 'john@example.com' });
      expect(john).toBeDefined();
      expect(john.name).toBe('John Doe');

      // Test count operation
      const totalCount = await mysqlSource.count({ collection: 'users' });
      expect(totalCount).toBe(3);

      const activeCount = await mysqlSource.count({ collection: 'users', where: { status: 'active' } });
      expect(activeCount).toBe(2);
    });

    it('should handle insert operations', async () => {
      // Insert single document
      const newUser = { name: 'Alice Brown', email: 'alice@example.com', age: 28 };
      const insertResult = await mysqlSource.insert({ collection: 'users', data: newUser });
      
      expect(Array.isArray(insertResult)).toBe(true);
      expect(insertResult).toHaveLength(1);
      expect(insertResult[0].id).toBeDefined();

      // Verify insertion
      const insertedUser = await mysqlSource.findOne('users', { email: 'alice@example.com' });
      expect(insertedUser.name).toBe('Alice Brown');
      expect(insertedUser.age).toBe(28);

      // Insert multiple documents
      const multipleUsers = [
        { name: 'Charlie Wilson', email: 'charlie@example.com', age: 32 },
        { name: 'Diana Davis', email: 'diana@example.com', age: 29 }
      ];

      const multipleResult = await mysqlSource.insert({ collection: 'users', data: multipleUsers });
      expect(multipleResult).toHaveLength(2);

      // Verify total count
      const totalCount = await mysqlSource.count({ collection: 'users' });
      expect(totalCount).toBe(3);
    });

    it('should handle update operations', async () => {
      // Insert test data
      const testData = [
        { name: 'John Doe', email: 'john@example.com', age: 30, status: 'active' },
        { name: 'Jane Smith', email: 'jane@example.com', age: 25, status: 'active' }
      ];

      await insertMySqlTestData('users', testData);

      // Update single document
      const updateResult = await mysqlSource.update({
        collection: 'users',
        where: { email: 'john@example.com' },
        update: { age: 31, status: 'inactive' }
      });

      expect(updateResult.modifiedCount).toBe(1);

      // Verify update
      const updatedUser = await mysqlSource.findOne('users', { email: 'john@example.com' });
      expect(updatedUser.age).toBe(31);
      expect(updatedUser.status).toBe('inactive');

      // Update multiple documents
      const multipleUpdateResult = await mysqlSource.update({
        collection: 'users',
        where: { status: 'active' },
        update: { status: 'inactive' }
      });

      expect(multipleUpdateResult.modifiedCount).toBe(1);

      // Verify all users are now inactive
      const inactiveUsers = await mysqlSource.find({ collection: 'users', where: { status: 'inactive' } });
      expect(inactiveUsers).toHaveLength(2);
    });

    it('should handle delete operations', async () => {
      // Insert test data
      const testData = [
        { name: 'John Doe', email: 'john@example.com', age: 30 },
        { name: 'Jane Smith', email: 'jane@example.com', age: 25 },
        { name: 'Bob Johnson', email: 'bob@example.com', age: 35 }
      ];

      await insertMySqlTestData('users', testData);

      // Delete single document
      const deleteResult = await mysqlSource.delete('users', { email: 'john@example.com' });
      expect(deleteResult.affectedRows).toBe(1);

      // Verify deletion
      const remainingUsers = await mysqlSource.find({ collection: 'users' });
      expect(remainingUsers).toHaveLength(2);

      // Delete multiple documents
      const multipleDeleteResult = await mysqlSource.delete('users', { age: { $gte: 30 } });
      expect(multipleDeleteResult.affectedRows).toBe(1);

      // Verify final count
      const finalCount = await mysqlSource.count({ collection: 'users' });
      expect(finalCount).toBe(1);
    });
  });

  describe('MySQL SoapSQL Integration', () => {
    it('should create MySQL instance and perform basic operations', async () => {
      expect(mysqlSoap).toBeDefined();
      expect(mysqlSoap?.databaseType).toBe('mysql');
      expect(mysqlSoap?.mysqlPool).toBeDefined();

      // Test connection health
      const isHealthy = await mysqlSoap!.isHealthy();
      expect(isHealthy).toBe(true);

      // Test connection pool stats
      const stats = await mysqlSoap!.getConnectionPoolStats();
      expect(stats.connections).toBeDefined();

      // Test server status
      const status = await mysqlSoap!.getServerStatus();
      expect(status).toBeDefined();

      // Test database info
      const info = await mysqlSoap!.getDatabaseInfo();
      expect(info.database_name).toBe('soapjs_test');
    });

    it('should execute queries and manage connections', async () => {
      // Create test table
      const createTableSQL = `
        CREATE TABLE test_table (
          id INT AUTO_INCREMENT PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          value INT
        )
      `;
      
      await createMySqlTestTable('test_table', createTableSQL);

      // Insert test data
      const testData = [
        { name: 'Test 1', value: 100 },
        { name: 'Test 2', value: 200 }
      ];

      await insertMySqlTestData('test_table', testData);

      // Query data
      const result = await mysqlSoap!.query('SELECT COUNT(*) as count FROM test_table');
      expect(result[0].count).toBe(2);

      // Test connection management
      const connection = await mysqlSoap!.getConnection();
      expect(connection).toBeDefined();
      connection.release();
    });
  });
});
