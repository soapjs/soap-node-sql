import { SqlDataSource } from '../../sql.source';
import { SoapSQL } from '../../soap.sql';
import { 
  setupPostgresDatabase,
  cleanupTestDatabases,
  cleanupPostgresTables,
  postgresSoap,
  createPostgresTestTable,
  insertPostgresTestData,
  queryPostgresTestData
} from './setup';

describe('PostgreSQL Integration Tests', () => {
  let postgresSource: SqlDataSource<any>;

  beforeAll(async () => {
    // Setup PostgreSQL test database
    await setupPostgresDatabase();
    
    // Debug: check database type
    console.log('PostgreSQL SoapSQL database type:', postgresSoap?.databaseType);
    
    // Create source for PostgreSQL
    postgresSource = new SqlDataSource(postgresSoap!, 'users');
    
    // Debug: check SqlDataSource database type
    console.log('SqlDataSource database type:', (postgresSource as any)._databaseType);
  });

  afterAll(async () => {
    // Cleanup test database
    await cleanupTestDatabases();
  });

  beforeEach(async () => {
    // Clean up PostgreSQL tables before each test
    await cleanupPostgresTables();
  });

  describe('PostgreSQL SqlDataSource Integration', () => {
    beforeEach(async () => {
      // Create test table for PostgreSQL
      const createTableSQL = `
        CREATE TABLE users (
          id SERIAL PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          email VARCHAR(255) UNIQUE NOT NULL,
          age INTEGER,
          status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `;
      
      await createPostgresTestTable('users', createTableSQL);
    });

    it('should perform basic CRUD operations', async () => {
      // Insert test data
      const testData = [
        { name: 'John Doe', email: 'john@example.com', age: 30, status: 'active' },
        { name: 'Jane Smith', email: 'jane@example.com', age: 25, status: 'active' },
        { name: 'Bob Johnson', email: 'bob@example.com', age: 35, status: 'inactive' }
      ];

      console.log('Inserting test data...');
      await insertPostgresTestData('users', testData);
      console.log('Test data inserted');

      // Test direct SQL query to see if data exists
      console.log('Checking data with direct SQL query...');
      const directResult = await postgresSoap!.query('SELECT * FROM users');
      console.log('Direct SQL result:', directResult);

      // Test find operation
      console.log('Testing find all...');
      const allUsers = await postgresSource.find({ collection: 'users' });
      console.log('Find all result:', allUsers);
      expect(allUsers).toHaveLength(3);

      // Test find with where clause
      console.log('Testing find with where clause...');
      const activeUsers = await postgresSource.find({ collection: 'users', where: { status: 'active' } });
      console.log('Find active users result:', activeUsers);
      expect(activeUsers).toHaveLength(2);

      // Test find with complex where clause
      const adultActiveUsers = await postgresSource.find({ 
        collection: 'users',
        where: { 
          status: 'active',
          age: { $gte: 25 }
        } 
      });
      expect(adultActiveUsers).toHaveLength(2);

      // Test findOne operation
      const john = await postgresSource.findOne('users', { email: 'john@example.com' });
      expect(john).toBeDefined();
      expect(john.name).toBe('John Doe');

      // Test count operation
      const totalCount = await postgresSource.count({ collection: 'users' });
      expect(totalCount).toBe(3);

      const activeCount = await postgresSource.count({ collection: 'users', where: { status: 'active' } });
      expect(activeCount).toBe(2);
    });

    it('should handle insert operations', async () => {
      // Insert single document
      const newUser = { name: 'Alice Brown', email: 'alice@example.com', age: 28 };
      const insertResult = await postgresSource.insert({ collection: 'users', data: newUser });
      
      expect(Array.isArray(insertResult)).toBe(true);
      expect(insertResult).toHaveLength(1);
      expect(insertResult[0].id).toBeDefined();

      // Verify insertion
      const insertedUser = await postgresSource.findOne('users', { email: 'alice@example.com' });
      expect(insertedUser.name).toBe('Alice Brown');
      expect(insertedUser.age).toBe(28);

      // Insert multiple documents
      const multipleUsers = [
        { name: 'Charlie Wilson', email: 'charlie@example.com', age: 32 },
        { name: 'Diana Davis', email: 'diana@example.com', age: 29 }
      ];

      const multipleResult = await postgresSource.insert({ collection: 'users', data: multipleUsers });
      expect(multipleResult).toHaveLength(2);

      // Verify total count
      const totalCount = await postgresSource.count({ collection: 'users' });
      expect(totalCount).toBe(3);
    });

    it('should handle update operations', async () => {
      // Insert test data
      const testData = [
        { name: 'John Doe', email: 'john@example.com', age: 30, status: 'active' },
        { name: 'Jane Smith', email: 'jane@example.com', age: 25, status: 'active' }
      ];

      await insertPostgresTestData('users', testData);

      // Update single document
      const updateResult = await postgresSource.update({
        collection: 'users',
        where: { email: 'john@example.com' },
        update: { age: 31, status: 'inactive' }
      });

      expect(updateResult.modifiedCount).toBe(1);

      // Verify update
      const updatedUser = await postgresSource.findOne('users', { email: 'john@example.com' });
      expect(updatedUser.age).toBe(31);
      expect(updatedUser.status).toBe('inactive');

      // Update multiple documents
      const multipleUpdateResult = await postgresSource.update({
        collection: 'users',
        where: { status: 'active' },
        update: { status: 'inactive' }
      });

      expect(multipleUpdateResult.modifiedCount).toBe(1);

      // Verify all users are now inactive
      const inactiveUsers = await postgresSource.find({ collection: 'users', where: { status: 'inactive' } });
      expect(inactiveUsers).toHaveLength(2);
    });

    it('should handle delete operations', async () => {
      // Insert test data
      const testData = [
        { name: 'John Doe', email: 'john@example.com', age: 30 },
        { name: 'Jane Smith', email: 'jane@example.com', age: 25 },
        { name: 'Bob Johnson', email: 'bob@example.com', age: 35 }
      ];

      await insertPostgresTestData('users', testData);

      // Delete single document
      const deleteResult = await postgresSource.delete('users', { email: 'john@example.com' });
      expect(deleteResult.affectedRows).toBe(1);

      // Verify deletion
      const remainingUsers = await postgresSource.find({ collection: 'users' });
      expect(remainingUsers).toHaveLength(2);

      // Delete multiple documents
      const multipleDeleteResult = await postgresSource.delete('users', { age: { $gte: 30 } });
      expect(multipleDeleteResult.affectedRows).toBe(1);

      // Verify final count
      const finalCount = await postgresSource.count({ collection: 'users' });
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

      await insertPostgresTestData('users', testData);

      // Test range queries
      const olderUsers = await postgresSource.find({ 
        collection: 'users',
        where: { age: { $gte: 30 } } 
      });
      expect(olderUsers).toHaveLength(2);

      // Test multiple conditions
      const activeYoungUsers = await postgresSource.find({ 
        collection: 'users',
        where: { 
          status: 'active',
          age: { $lt: 30 }
        } 
      });
      expect(activeYoungUsers).toHaveLength(1);

      // Test text search
      const gamingUsers = await postgresSource.find({ 
        collection: 'users',
        where: { name: { $like: '%Gaming%' } } 
      });
      expect(gamingUsers).toHaveLength(2);
    });
  });

  describe('PostgreSQL SoapSQL Integration', () => {
    it('should create PostgreSQL instance and perform basic operations', async () => {
      expect(postgresSoap).toBeDefined();
      expect(postgresSoap?.databaseType).toBe('postgresql');
      expect(postgresSoap?.postgresqlPool).toBeDefined();

      // Test connection health
      const isHealthy = await postgresSoap!.isHealthy();
      expect(isHealthy).toBe(true);

      // Test connection pool stats
      const stats = await postgresSoap!.getConnectionPoolStats();
      expect(stats.connections).toBeDefined();

      // Test server status
      const status = await postgresSoap!.getServerStatus();
      expect(status).toBeDefined();

      // Test database info
      const info = await postgresSoap!.getDatabaseInfo();
      expect(info.database_name).toBe('soapjs_test');
    });

    it('should execute queries and manage connections', async () => {
      // Create test table
      const createTableSQL = `
        CREATE TABLE test_table (
          id SERIAL PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          value INTEGER
        )
      `;
      
      await createPostgresTestTable('test_table', createTableSQL);

      // Insert test data
      const testData = [
        { name: 'Test 1', value: 100 },
        { name: 'Test 2', value: 200 }
      ];

      await insertPostgresTestData('test_table', testData);

      // Query data
      const result = await postgresSoap!.query('SELECT COUNT(*) as count FROM test_table');
      expect(parseInt(result[0].count)).toBe(2);

      // Test connection management
      const connection = await postgresSoap!.getConnection();
      expect(connection).toBeDefined();
      connection.release();
    });
  });
});
