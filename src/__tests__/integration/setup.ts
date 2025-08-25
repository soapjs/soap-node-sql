import { GenericContainer, StartedTestContainer, Wait } from 'testcontainers';
import { SoapSQL } from '../../soap.sql';
import { SqlDatabaseConfig } from '../../sql.config';

// Global test database configuration
export const TEST_CONFIG = {
  timeout: parseInt(process.env.SQL_TEST_TIMEOUT || '30000'),
};

// Global test containers and connections
export let mysqlContainer: StartedTestContainer | null = null;
export let postgresContainer: StartedTestContainer | null = null;
export let sqliteDbPath: string | null = null;

export let mysqlSoap: SoapSQL | null = null;
export let postgresSoap: SoapSQL | null = null;
export let sqliteSoap: SoapSQL | null = null;

// Function to wait for MySQL to be ready
const waitForMySqlReady = async (host: string, port: number, user: string, password: string, database: string): Promise<void> => {
  const maxAttempts = 30;
  const delayMs = 1000;
  
  console.log('🔄 Waiting for MySQL to become ready...');
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const mysql = require('mysql2/promise');
      const connection = await mysql.createConnection({
        host,
        port,
        user,
        password,
        database,
        connectTimeout: 5000
      });
      
      await connection.ping();
      await connection.end();
      
      console.log(`✅ MySQL is ready (attempt ${attempt}/${maxAttempts})`);
      return;
    } catch (error) {
      if (attempt === maxAttempts) {
        console.error('❌ MySQL failed to become ready after maximum attempts');
        throw new Error(`MySQL failed to become ready after ${maxAttempts} attempts: ${error}`);
      }
      
      if (attempt % 5 === 0 || attempt === 1) {
        console.log(`⏳ Waiting for MySQL to be ready... (attempt ${attempt}/${maxAttempts})`);
      }
      
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
};

// Function to wait for PostgreSQL to be ready
const waitForPostgresReady = async (host: string, port: number, user: string, password: string, database: string): Promise<void> => {
  const maxAttempts = 30;
  const delayMs = 1000;
  
  console.log('🔄 Waiting for PostgreSQL to become ready...');
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const { Client } = require('pg');
      const client = new Client({
        host,
        port,
        user,
        password,
        database,
        connectionTimeoutMillis: 5000
      });
      
      await client.connect();
      await client.query('SELECT 1');
      await client.end();
      
      console.log(`✅ PostgreSQL is ready (attempt ${attempt}/${maxAttempts})`);
      return;
    } catch (error) {
      if (attempt === maxAttempts) {
        console.error('❌ PostgreSQL failed to become ready after maximum attempts');
        throw new Error(`PostgreSQL failed to become ready after ${maxAttempts} attempts: ${error}`);
      }
      
      if (attempt % 5 === 0 || attempt === 1) {
        console.log(`⏳ Waiting for PostgreSQL to be ready... (attempt ${attempt}/${maxAttempts})`);
      }
      
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
};

// Setup function for MySQL
export const setupMySqlDatabase = async () => {
  try {
    // Check if we should use environment-based connection
    const testHost = process.env.MYSQL_TEST_HOST;
    const testPort = parseInt(process.env.MYSQL_TEST_PORT || '3306');
    const testUser = process.env.MYSQL_TEST_USER || 'root';
    const testPassword = process.env.MYSQL_TEST_PASSWORD || 'password';
    const testDatabase = process.env.MYSQL_TEST_DB || 'soapjs_test';
    
    if (testHost) {
      // Use environment-based connection
      console.log(`Using environment-based MySQL connection: ${testHost}:${testPort}`);
      
      const config = new SqlDatabaseConfig({
        type: 'mysql',
        host: testHost,
        port: testPort,
        database: testDatabase,
        username: testUser,
        password: testPassword,
        connectionLimit: 5,
        acquireTimeout: TEST_CONFIG.timeout,
        timeout: TEST_CONFIG.timeout,
        charset: 'utf8mb4'
      });
      
      mysqlSoap = await SoapSQL.create(config);
      
      // Wait for MySQL to be ready
      await waitForMySqlReady(testHost, testPort, testUser, testPassword, testDatabase);
      
      console.log(`Connected to MySQL test database: ${testDatabase} (${testHost}:${testPort})`);
    } else {
      // Use testcontainers
      console.log('No MYSQL_TEST_HOST found, using testcontainers...');
      
      mysqlContainer = await new GenericContainer('mysql:8.0')
        .withExposedPorts(3306)
        .withEnvironment({
          MYSQL_ROOT_PASSWORD: 'password',
          MYSQL_DATABASE: 'soapjs_test'
        })
        .withWaitStrategy(Wait.forLogMessage('MySQL init process done. Ready for start up.'))
        .withStartupTimeout(120000)
        .start();
      
      const host = mysqlContainer.getHost();
      const port = mysqlContainer.getMappedPort(3306);
      
      console.log(`📍 MySQL connection: ${host}:${port}`);
      
      // Wait a bit for MySQL to fully initialize
      await new Promise(resolve => setTimeout(resolve, 10000));
      
      const config = new SqlDatabaseConfig({
        type: 'mysql',
        host,
        port,
        database: 'soapjs_test',
        username: 'root',
        password: 'password',
        connectionLimit: 5,
        acquireTimeout: TEST_CONFIG.timeout,
        timeout: TEST_CONFIG.timeout,
        charset: 'utf8mb4'
      });
      
      mysqlSoap = await SoapSQL.create(config);
      
      // Wait for MySQL to be ready
      await waitForMySqlReady(host, port, 'root', 'password', 'soapjs_test');
      
      console.log(`Connected to MySQL test database: soapjs_test (${host}:${port})`);
    }
  } catch (error) {
    console.error('Failed to start MySQL container or connect:', error);
    throw error;
  }
};

// Setup function for PostgreSQL
export const setupPostgresDatabase = async () => {
  try {
    // Check if we should use environment-based connection
    const testHost = process.env.POSTGRES_TEST_HOST;
    const testPort = parseInt(process.env.POSTGRES_TEST_PORT || '5432');
    const testUser = process.env.POSTGRES_TEST_USER || 'postgres';
    const testPassword = process.env.POSTGRES_TEST_PASSWORD || 'password';
    const testDatabase = process.env.POSTGRES_TEST_DB || 'soapjs_test';
    
    if (testHost) {
      // Use environment-based connection
      console.log(`Using environment-based PostgreSQL connection: ${testHost}:${testPort}`);
      
      const config = new SqlDatabaseConfig({
        type: 'postgresql',
        host: testHost,
        port: testPort,
        database: testDatabase,
        username: testUser,
        password: testPassword,
        connectionLimit: 5,
        acquireTimeout: TEST_CONFIG.timeout,
        timeout: TEST_CONFIG.timeout,
        charset: 'utf8'
      });
      
      postgresSoap = await SoapSQL.create(config);
      
      // Wait for PostgreSQL to be ready
      await waitForPostgresReady(testHost, testPort, testUser, testPassword, testDatabase);
      
      console.log(`Connected to PostgreSQL test database: ${testDatabase} (${testHost}:${testPort})`);
    } else {
      // Use testcontainers
      console.log('No POSTGRES_TEST_HOST found, using testcontainers...');
      
      postgresContainer = await new GenericContainer('postgres:14')
        .withExposedPorts(5432)
        .withEnvironment({
          POSTGRES_PASSWORD: 'password',
          POSTGRES_DB: 'soapjs_test'
        })
        .withWaitStrategy(Wait.forLogMessage('database system is ready to accept connections'))
        .withStartupTimeout(120000)
        .start();
      
      const host = postgresContainer.getHost();
      const port = postgresContainer.getMappedPort(5432);
      
      console.log(`📍 PostgreSQL connection: ${host}:${port}`);
      
      // Wait a bit for PostgreSQL to fully initialize
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      const config = new SqlDatabaseConfig({
        type: 'postgresql',
        host,
        port,
        database: 'soapjs_test',
        username: 'postgres',
        password: 'password',
        connectionLimit: 5,
        acquireTimeout: TEST_CONFIG.timeout,
        timeout: TEST_CONFIG.timeout,
        charset: 'utf8'
      });
      
      postgresSoap = await SoapSQL.create(config);
      
      // Wait for PostgreSQL to be ready
      await waitForPostgresReady(host, port, 'postgres', 'password', 'soapjs_test');
      
      console.log(`Connected to PostgreSQL test database: soapjs_test (${host}:${port})`);
    }
  } catch (error) {
    console.error('Failed to start PostgreSQL container or connect:', error);
    throw error;
  }
};

// Setup function for SQLite
export const setupSqliteDatabase = async () => {
  try {
    // For SQLite, we'll use an in-memory database for tests
    sqliteDbPath = ':memory:';
    
    const config = new SqlDatabaseConfig({
      type: 'sqlite',
      host: 'localhost',
      port: 0,
      database: sqliteDbPath,
      username: '',
      password: '',
      connectionLimit: 1,
      acquireTimeout: TEST_CONFIG.timeout,
      timeout: TEST_CONFIG.timeout,
      charset: 'utf8',
      filename: sqliteDbPath,
      mode: undefined,
      verbose: false,
      memory: true
    });
    
    sqliteSoap = await SoapSQL.create(config);
    
    console.log(`Connected to SQLite test database: ${sqliteDbPath}`);
  } catch (error) {
    console.error('Failed to create SQLite database:', error);
    throw error;
  }
};

// Setup function that can be called from tests
export const setupTestDatabases = async () => {
  await setupMySqlDatabase();
  await setupPostgresDatabase();
  await setupSqliteDatabase();
};

// Cleanup function that can be called from tests
export const cleanupTestDatabases = async () => {
  if (mysqlSoap) {
    try {
      await mysqlSoap.close();
      console.log('Disconnected from MySQL test database');
    } catch (error) {
      console.error('Error closing MySQL connection:', error);
    }
  }
  
  if (postgresSoap) {
    try {
      await postgresSoap.close();
      console.log('Disconnected from PostgreSQL test database');
    } catch (error) {
      console.error('Error closing PostgreSQL connection:', error);
    }
  }
  
  if (sqliteSoap) {
    try {
      await sqliteSoap.close();
      console.log('Disconnected from SQLite test database');
    } catch (error) {
      console.error('Error closing SQLite connection:', error);
    }
  }
  
  if (mysqlContainer) {
    try {
      await mysqlContainer.stop();
      console.log('Stopped MySQL container');
    } catch (error) {
      console.error('Error stopping MySQL container:', error);
    }
  }
  
  if (postgresContainer) {
    try {
      await postgresContainer.stop();
      console.log('Stopped PostgreSQL container');
    } catch (error) {
      console.error('Error stopping PostgreSQL container:', error);
    }
  }
};

// Clean up tables function for MySQL
export const cleanupMySqlTables = async () => {
  if (mysqlSoap) {
    try {
      const connection = await mysqlSoap.getConnection();
      await connection.query('SET FOREIGN_KEY_CHECKS = 0');
      
      const [tables] = await connection.query('SHOW TABLES');
      for (const table of tables as any[]) {
        const tableName = Object.values(table)[0];
        await connection.query(`DROP TABLE IF EXISTS \`${tableName}\``);
      }
      
      await connection.query('SET FOREIGN_KEY_CHECKS = 1');
      connection.release();
      
      console.log(`Cleaned up MySQL tables`);
    } catch (error) {
      console.error('Error cleaning up MySQL tables:', error);
      throw error;
    }
  }
};

// Clean up tables function for PostgreSQL
export const cleanupPostgresTables = async () => {
  if (postgresSoap) {
    try {
      const client = await postgresSoap.getConnection();
      
      const result = await client.query(`
        SELECT tablename FROM pg_tables 
        WHERE schemaname = 'public'
      `);
      
      for (const table of result.rows) {
        await client.query(`DROP TABLE IF EXISTS "${table.tablename}" CASCADE`);
      }
      
      client.release();
      
      console.log(`Cleaned up PostgreSQL tables`);
    } catch (error) {
      console.error('Error cleaning up PostgreSQL tables:', error);
      throw error;
    }
  }
};

// Clean up tables function for SQLite
export const cleanupSqliteTables = async () => {
  if (sqliteSoap) {
    try {
      const db = sqliteSoap.sqliteDb;
      
      return new Promise<void>((resolve, reject) => {
        db.all("SELECT name FROM sqlite_master WHERE type='table'", (err: any, tables: any[]) => {
          if (err) {
            reject(err);
            return;
          }
          
          if (tables.length === 0) {
            resolve();
            return;
          }
          
          let completed = 0;
          for (const table of tables) {
            db.run(`DROP TABLE IF EXISTS "${table.name}"`, (dropErr: any) => {
              if (dropErr) {
                console.error(`Error dropping table ${table.name}:`, dropErr);
              }
              
              completed++;
              if (completed === tables.length) {
                resolve();
              }
            });
          }
        });
      });
      
      console.log(`Cleaned up SQLite tables`);
    } catch (error) {
      console.error('Error cleaning up SQLite tables:', error);
      throw error;
    }
  }
};

// Clean up all databases function
export const cleanupAllDatabases = async () => {
  await cleanupMySqlTables();
  await cleanupPostgresTables();
  await cleanupSqliteTables();
};

// Helper function to create test table in MySQL
export const createMySqlTestTable = async (tableName: string, schema: string) => {
  if (mysqlSoap) {
    const connection = await mysqlSoap.getConnection();
    await connection.query(schema);
    connection.release();
  }
};

// Helper function to create test table in PostgreSQL
export const createPostgresTestTable = async (tableName: string, schema: string) => {
  if (postgresSoap) {
    const client = await postgresSoap.getConnection();
    await client.query(schema);
    client.release();
  }
};

// Helper function to create test table in SQLite
export const createSqliteTestTable = async (tableName: string, schema: string) => {
  if (sqliteSoap) {
    const db = sqliteSoap.sqliteDb;
    
    return new Promise<void>((resolve, reject) => {
      db.run(schema, (err: any) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }
};

// Helper function to insert test data in MySQL
export const insertMySqlTestData = async (tableName: string, data: any[]) => {
  if (mysqlSoap && data.length > 0) {
    const connection = await mysqlSoap.getConnection();
    const columns = Object.keys(data[0]).join(', ');
    const placeholders = data[0] ? Object.keys(data[0]).map(() => '?').join(', ') : '';
    
    // For MySQL, we need to insert each row separately or use multiple VALUES clauses
    let result;
    if (data.length === 1) {
      // Single row insert
      const values = Object.values(data[0]);
      result = await connection.query(
        `INSERT INTO \`${tableName}\` (${columns}) VALUES (${placeholders})`,
        values
      );
    } else {
      // Multiple rows insert - use multiple VALUES clauses
      const valuesClauses = data.map(() => `(${placeholders})`).join(', ');
      const allValues = data.flatMap(row => Object.values(row));
      result = await connection.query(
        `INSERT INTO \`${tableName}\` (${columns}) VALUES ${valuesClauses}`,
        allValues
      );
    }
    
    connection.release();
    return result;
  }
  return null;
};

// Helper function to insert test data in PostgreSQL
export const insertPostgresTestData = async (tableName: string, data: any[]) => {
  if (postgresSoap && data.length > 0) {
    const client = await postgresSoap.getConnection();
    const columns = Object.keys(data[0]).join(', ');
    const placeholders = data[0] ? Object.keys(data[0]).map((_, i) => `$${i + 1}`).join(', ') : '';
    
    // Insert each row separately for PostgreSQL
    const results = [];
    for (const row of data) {
      const values = Object.values(row);
      const result = await client.query(
        `INSERT INTO "${tableName}" (${columns}) VALUES (${placeholders})`,
        values
      );
      results.push(result);
    }
    
    client.release();
    return results;
  }
  return null;
};

// Helper function to insert test data in SQLite
export const insertSqliteTestData = async (tableName: string, data: any[]) => {
  if (sqliteSoap && data.length > 0) {
    const db = sqliteSoap.sqliteDb;
    
    return new Promise<any>((resolve, reject) => {
      const columns = Object.keys(data[0]).join(', ');
      const placeholders = data[0] ? Object.keys(data[0]).map(() => '?').join(', ') : '';
      
      let completed = 0;
      const results: any[] = [];
      
      for (const row of data) {
        const values = Object.values(row);
        db.run(
          `INSERT INTO "${tableName}" (${columns}) VALUES (${placeholders})`,
          values,
          function(this: any, err: any) {
            if (err) {
              reject(err);
              return;
            }
            
            results.push({ insertId: this.lastID, changes: this.changes });
            completed++;
            
            if (completed === data.length) {
              resolve(results);
            }
          }
        );
      }
    });
  }
  return null;
};

// Helper function to query test data in MySQL
export const queryMySqlTestData = async (tableName: string, whereClause = '') => {
  if (mysqlSoap) {
    const connection = await mysqlSoap.getConnection();
    const sql = whereClause ? `SELECT * FROM \`${tableName}\` WHERE ${whereClause}` : `SELECT * FROM \`${tableName}\``;
    const [rows] = await connection.query(sql);
    connection.release();
    return rows;
  }
  return [];
};

// Helper function to query test data in PostgreSQL
export const queryPostgresTestData = async (tableName: string, whereClause = '') => {
  if (postgresSoap) {
    const client = await postgresSoap.getConnection();
    const sql = whereClause ? `SELECT * FROM "${tableName}" WHERE ${whereClause}` : `SELECT * FROM "${tableName}"`;
    const result = await client.query(sql);
    client.release();
    return result.rows;
  }
  return [];
};

// Helper function to query test data in SQLite
export const querySqliteTestData = async (tableName: string, whereClause = '') => {
  if (sqliteSoap) {
    const db = sqliteSoap.sqliteDb;
    
    return new Promise<any[]>((resolve, reject) => {
      const sql = whereClause ? `SELECT * FROM "${tableName}" WHERE ${whereClause}` : `SELECT * FROM "${tableName}"`;
      db.all(sql, (err: any, rows: any[]) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }
  return [];
};
