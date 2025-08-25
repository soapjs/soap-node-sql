# @soapjs/soap-node-sql

This package provides SQL database integration for the SoapJS framework, supporting PostgreSQL, MySQL, and SQLite. It enables seamless interaction with SQL databases while ensuring that your data access layer is clean, efficient, and scalable.

## Features

- **Multi-Database Support**: Full support for PostgreSQL, MySQL, and SQLite with unified API
- **Clean Architecture Support**: Follows SoapJS clean architecture patterns with full abstraction support
- **Type Safety**: Full TypeScript support with comprehensive type definitions
- **Source Implementation**: Full implementation of Source interface for SQL databases
- **Transaction Support**: Full support for SQL transactions with SOAPJS transaction system
- **Query Builder**: Advanced query building with Where conditions and QueryBuilder support
- **Field Mapping**: Flexible field mapping between domain entities and database tables
- **Database Migrations**: Powerful migration system for managing database schema changes with rollback support
- **Performance Monitoring**: Optional built-in performance monitoring with metrics collection and slow query detection
- **Connection Pooling**: Advanced connection pool configuration for optimal performance
- **Error Handling**: Comprehensive error handling with specific SQL error types

## Supported Databases

### PostgreSQL
- **Driver**: `pg` (node-postgres)
- **Expected Version**: `^8.11.0`
- **Features**: Full support including JSON operations, advanced indexing, and complex queries

### MySQL
- **Driver**: `mysql2`
- **Expected Version**: `^3.6.0`
- **Features**: Full support including stored procedures, views, and MySQL-specific optimizations

### SQLite
- **Driver**: `better-sqlite3`
- **Expected Version**: `^9.2.0`
- **Features**: Full support for embedded database operations with file-based storage

## Installation

Remember to have the appropriate database driver and `@soapjs/soap` installed in your project:

```bash
# For PostgreSQL
npm install @soapjs/soap-node-sql pg

# For MySQL
npm install @soapjs/soap-node-sql mysql2

# For SQLite
npm install @soapjs/soap-node-sql better-sqlite3

# Core SoapJS framework
npm install @soapjs/soap
```

## Quick Start

### 1. Import the necessary classes:

```typescript
import {
  SoapSQL,
  SqlSource,
  SqlConfig,
  SqlMigrationManager,
  createMigration
} from '@soapjs/soap-node-sql';
import { Where, MetaMapper, DatabaseContext, ReadRepository, ReadWriteRepository, Entity } from '@soapjs/soap';
```

### 2. Set up your database configuration:

#### PostgreSQL Configuration
```typescript
const postgresConfig = new SqlConfig({
  type: 'postgresql',
  host: 'localhost',
  port: 5432,
  database: 'myapp',
  username: 'user',
  password: 'password',
  ssl: false,
  pool: {
    min: 2,
    max: 10,
    idleTimeoutMillis: 30000
  }
});
```

#### MySQL Configuration
```typescript
const mysqlConfig = new SqlConfig({
  type: 'mysql',
  host: 'localhost',
  port: 3306,
  database: 'myapp',
  username: 'user',
  password: 'password',
  ssl: false,
  pool: {
    min: 2,
    max: 10,
    acquireTimeoutMillis: 30000
  }
});
```

#### SQLite Configuration
```typescript
const sqliteConfig = new SqlConfig({
  type: 'sqlite',
  database: './myapp.db',
  mode: 'rwc',
  pool: {
    min: 1,
    max: 1
  }
});
```

### 3. Create a new `SoapSQL` driver instance:

```typescript
const soapSql = await SoapSQL.create(postgresConfig); // or mysqlConfig, sqliteConfig
```

### 4. Define your entities and models:

```typescript
// Entity
interface User extends Entity {
  id: string;
  name: string;
  email: string;
  age: number;
  status: 'active' | 'inactive';
  createdAt: Date;
  updatedAt: Date;
}

// Model (database table structure)
interface UserModel {
  id: string;
  name: string;
  email: string;
  age: number;
  status: string;
  created_at: string;
  updated_at: string;
}
```

### 5. Create SQL source and use with SOAPJS repositories:

```typescript
// Create mapper
const userMapper = new MetaMapper(User, UserModel);

// Create source with field mappings
const userSource = new SqlSource<UserModel>(
  soapSql,
  'users',
  {
    modelFieldMappings: {
      id: { name: 'id', type: 'String' },
      name: { name: 'name', type: 'String' },
      email: { name: 'email', type: 'String' },
      age: { name: 'age', type: 'Number' },
      status: { name: 'status', type: 'String' },
      createdAt: { name: 'created_at', type: 'Date' },
      updatedAt: { name: 'updated_at', type: 'Date' }
    },
    indexes: [
      { name: 'idx_users_email', columns: ['email'], unique: true },
      { name: 'idx_users_status', columns: ['status'] },
      { name: 'idx_users_created_at', columns: ['created_at'] }
    ],
    performanceMonitoring: {
      enabled: true,
      slowQueryThreshold: 1000
    }
  }
);

// Create data context
const userContext = new DatabaseContext(
  userSource,
  userMapper,
  soapSql.sessions
);

// Create repositories using SOAPJS abstractions
const userReadRepo = new ReadRepository(userContext);
const userRepo = new ReadWriteRepository(userContext);
```

### 6. Using repositories with SOAPJS abstractions:

#### Basic CRUD Operations

```typescript
// Find users with Where conditions
const where = new Where()
  .valueOf('status').isEq('active')
  .and.valueOf('age').isGte(18);

const result = await userRepo.find({ where });
if (result.isSuccess()) {
  const users = result.value;
  console.log('Found users:', users);
}

// Count users
const countResult = await userRepo.count({ where });
if (countResult.isSuccess()) {
  console.log('User count:', countResult.value);
}

// Add new user
const newUser: User = {
  id: 'user-123',
  name: 'John Doe',
  email: 'john@example.com',
  age: 30,
  status: 'active',
  createdAt: new Date(),
  updatedAt: new Date()
};

const addResult = await userRepo.add([newUser]);
if (addResult.isSuccess()) {
  console.log('User added:', addResult.value);
}

// Update user
const updateResult = await userRepo.update({
  where: new Where().valueOf('id').isEq('user-123'),
  updates: [{ name: 'Jane Doe' }],
  methods: ['updateOne']
});
if (updateResult.isSuccess()) {
  console.log('User updated:', updateResult.value);
}

// Remove user
const removeResult = await userRepo.remove({
  where: new Where().valueOf('id').isEq('user-123')
});
if (removeResult.isSuccess()) {
  console.log('User removed:', removeResult.value);
}
```

#### Advanced Queries

```typescript
// Complex Where conditions
const complexWhere = new Where()
  .valueOf('status').isEq('active')
  .and.brackets(w => {
    w.valueOf('age').isGte(18)
      .and.valueOf('age').isLte(65);
  })
  .and.brackets(w => {
    w.valueOf('email').isLike('@gmail.com')
      .or.valueOf('email').isLike('@yahoo.com');
  });

const users = await userRepo.find({ 
  where: complexWhere,
  limit: 10,
  offset: 0,
  sort: { createdAt: 'desc' }
});

// Aggregation queries
const aggregationResult = await userRepo.aggregate({
  where: new Where().valueOf('status').isEq('active'),
  groupBy: ['age'],
  having: { count: { $gte: 5 } }
});
```

### 7. Transaction Support

#### Using SOAPJS Transaction System

```typescript
import { Transaction, TransactionRunner, Result } from '@soapjs/soap';

class CreateUserTransaction extends Transaction<void> {
  constructor(
    private readonly userRepo: ReadWriteRepository<User>,
    private readonly userData: { name: string; email: string; age: number }
  ) {
    super(userRepo);
  }

  public async execute(): Promise<Result<void>> {
    const user: User = {
      id: `user-${Date.now()}`,
      name: this.userData.name,
      email: this.userData.email,
      age: this.userData.age,
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    const result = await this.userRepo.add([user]);
    
    if (result.isFailure()) {
      this.abort("Failed to create user: " + result.failure.error.message);
    }

    return Result.withSuccess();
  }
}

// Execute transaction
const runner = TransactionRunner.getInstance('default');
const transaction = new CreateUserTransaction(userRepo, {
  name: 'John Doe',
  email: 'john@example.com',
  age: 30
});

const result = await runner.run(transaction);
if (result.isSuccess()) {
  console.log('Transaction completed successfully');
} else {
  console.error('Transaction failed:', result.failure.error.message);
}
```

### 8. Database Migrations

#### Creating Migrations

```typescript
import { SqlMigrationManager, createMigration, MigrationDefinition } from '@soapjs/soap-node-sql';

// Create a migration
const createUsersTable = createMigration({
  id: 'create-users-table',
  version: 1,
  description: 'Create users table with indexes',
  up: async (query) => {
    await query(`
      CREATE TABLE users (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        age INTEGER,
        status VARCHAR(50) DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await query('CREATE INDEX idx_users_email ON users(email)');
    await query('CREATE INDEX idx_users_status ON users(status)');
    await query('CREATE INDEX idx_users_created_at ON users(created_at)');
  },
  down: async (query) => {
    await query('DROP TABLE IF EXISTS users');
  }
});

const addUserProfileField = createMigration({
  id: 'add-user-profile-field',
  version: 2,
  description: 'Add profile field to users table',
  up: async (query) => {
    await query('ALTER TABLE users ADD COLUMN profile JSON');
  },
  down: async (query) => {
    await query('ALTER TABLE users DROP COLUMN profile');
  }
});
```

#### Running Migrations

```typescript
// Initialize migration manager
const migrationManager = new SqlMigrationManager(soapSql, {
  tableName: 'migrations',
  autoRun: false,
  validateBeforeRun: true
});

// Register migrations
migrationManager.register(createUsersTable);
migrationManager.register(addUserProfileField);

// Run migrations
const result = await migrationManager.migrate();
console.log('Migration result:', result);

// Check migration status
const status = await migrationManager.getMigrationStatus();
console.log('Migration status:', status);

// Rollback last migration
const rollbackResult = await migrationManager.rollback();
console.log('Rollback result:', rollbackResult);
```

## Performance Monitoring

The package includes **optional** built-in performance monitoring capabilities to help you track and optimize your SQL operations.

### Basic Usage

```typescript
// Create source with performance monitoring
const userSource = new SqlSource<UserModel>(
  soapSql,
  'users',
  {
    modelFieldMappings: {
      // ... field mappings
    },
    performanceMonitoring: {
      enabled: true,
      slowQueryThreshold: 1000, // 1 second
      maxMetrics: 1000,
      metricsCollector: (metrics) => {
        // Custom metrics collector
        console.log('Performance metric:', metrics);
      }
    }
  }
);

// Use the source normally - performance is automatically monitored
const users = await userSource.find();
const count = await userSource.count();

// Get performance metrics
const metrics = userSource.getPerformanceMetrics();
const summary = userSource.getPerformanceSummary();
const slowQueries = userSource.getSlowQueries();

console.log('Performance Summary:', summary);
console.log('Slow Queries:', slowQueries);
```

## Database-Specific Features

### PostgreSQL Features

```typescript
// JSON operations
const jsonQuery = new Where()
  .valueOf('profile').jsonPath('$.preferences.theme').isEq('dark');

// Full-text search
const searchQuery = new Where()
  .valueOf('content').fullTextSearch('search term');

// Array operations
const arrayQuery = new Where()
  .valueOf('tags').arrayContains(['important', 'urgent']);
```

### MySQL Features

```typescript
// MySQL-specific functions
const mysqlQuery = new Where()
  .valueOf('name').isLike('John%')
  .and.valueOf('created_at').isGte('2023-01-01');

// JSON operations (MySQL 5.7+)
const jsonQuery = new Where()
  .valueOf('profile').jsonExtract('$.preferences.theme').isEq('dark');
```

### SQLite Features

```typescript
// SQLite-specific functions
const sqliteQuery = new Where()
  .valueOf('name').isLike('John%')
  .and.valueOf('created_at').isGte('2023-01-01');

// JSON operations (SQLite 3.38+)
const jsonQuery = new Where()
  .valueOf('profile').jsonExtract('$.preferences.theme').isEq('dark');
```

## API Reference

### Core Classes

- **SoapSQL**: Main SQL driver class for managing connections and sessions
- **SqlSource**: SQL data source implementation implementing Source interface
- **SqlQueryFactory**: SQL query factory for building complex queries
- **SqlWhereParser**: Parser for converting Where conditions to SQL WHERE clauses
- **SqlFieldResolver**: Field mapping and transformation between entities and database records
- **SqlDatabaseSession**: SQL session implementation for transactions
- **SqlSessionManager**: Session management for SQL connections
- **SqlMigrationManager**: Migration system for database schema changes
- **SqlPerformanceMonitor**: Performance monitoring implementation

### Configuration Classes

- **SqlConfig**: SQL configuration with connection pool settings
- **MigrationConfig**: Configuration for database migrations
- **PerformanceConfig**: Configuration for performance monitoring

### Interfaces

- **MigrationDefinition**: Interface for database migrations
- **MigrationStatus**: Status information for migrations
- **MigrationResult**: Result of migration operations
- **SqlPerformanceMetrics**: Performance metrics for operations
- **SqlPerformanceSummary**: Summary statistics for performance monitoring

## Error Handling

The package provides comprehensive error handling with specific SQL error types:

```typescript
import { SqlError, DuplicateKeyError, ValidationError } from '@soapjs/soap-node-sql';

try {
  const result = await userRepo.add([user]);
  if (result.isSuccess()) {
    console.log('User added successfully');
  } else {
    const error = result.failure.error;
    
    if (error instanceof DuplicateKeyError) {
      console.error('Duplicate key error:', error.message);
    } else if (error instanceof ValidationError) {
      console.error('Validation error:', error.message);
    } else if (error instanceof SqlError) {
      console.error('SQL error:', error.message);
    }
  }
} catch (error) {
  console.error('Unexpected error:', error);
}
```

## Testing

### Unit Tests

Run unit tests (mocked SQL):

```bash
npm run test:unit
```

### Integration Tests

Integration tests use **Testcontainers** to automatically start and manage database containers for testing.

#### Prerequisites

1. **Docker**: Ensure Docker is running on your system
2. **Testcontainers**: Automatically manages database containers
3. **No manual setup required**: Everything is handled automatically

#### Running Integration Tests

```bash
# Run only integration tests (requires Docker)
npm run test:integration

# Run all tests (unit + integration)
npm test
```

#### Integration Test Coverage

Integration tests cover:

- **SqlSource Operations**: CRUD, queries, aggregations, transactions
- **Performance Monitoring**: Metrics collection, slow query detection
- **Migration System**: Migration execution, rollback, status tracking
- **Error Handling**: Duplicate keys, validation errors
- **Database-Specific Features**: PostgreSQL JSON, MySQL functions, SQLite features

## Performance Optimization

### Indexing Strategy

```typescript
// Create indexes for optimal performance
const userSource = new SqlSource(soapSql, 'users', {
  indexes: [
    // Primary index on email (unique)
    { name: 'idx_users_email', columns: ['email'], unique: true },
    
    // Compound index for queries
    { name: 'idx_users_status_created', columns: ['status', 'created_at'] },
    
    // Partial index for active users
    { name: 'idx_users_active', columns: ['email'], where: 'status = "active"' }
  ]
});
```

### Query Optimization

```typescript
// Use projection to limit returned fields
const users = await userRepo.find({
  projection: { name: 1, email: 1, id: 0 }
});

// Use limit and offset for pagination
const paginatedUsers = await userRepo.find({
  limit: 10,
  offset: 20
});

// Use sort for ordered results
const sortedUsers = await userRepo.find({
  sort: { createdAt: 'desc' }
});
```

## Security Best Practices

### Authentication and Authorization

```typescript
// Use environment variables for sensitive data
const config = new SqlConfig({
  type: 'postgresql',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'myapp',
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: process.env.DB_SSL === 'true'
});
```

### SQL Injection Prevention

The package automatically handles SQL injection prevention through parameterized queries:

```typescript
// Safe - uses parameterized queries
const where = new Where().valueOf('email').isEq('john@example.com');
const users = await userRepo.find({ where });

// Safe - automatic escaping
const updateResult = await userRepo.update({
  where: new Where().valueOf('id').isEq('user-123'),
  updates: [{ name: 'John Doe' }]
});
```

## Troubleshooting

### Common Issues

1. **Connection Issues**
   ```typescript
   // Check connection status
   const isConnected = await soapSql.isConnected();
   console.log('Connected:', isConnected);
   ```

2. **Performance Issues**
   ```typescript
   // Enable performance monitoring
   const source = new SqlSource(soapSql, 'users', {
     performanceMonitoring: {
       enabled: true,
       slowQueryThreshold: 1000
     }
   });
   
   // Check slow queries
   const slowQueries = source.getSlowQueries();
   console.log('Slow queries:', slowQueries);
   ```

3. **Migration Issues**
   ```typescript
   // Check migration status
   const status = await migrationManager.getMigrationStatus();
   console.log('Migration status:', status);
   
   // Rollback if needed
   const rollbackResult = await migrationManager.rollback();
   console.log('Rollback result:', rollbackResult);
   ```

## Migration Guide

### From Previous Versions

#### Version 0.2.x to 0.3.x

1. **Performance Monitoring**: New optional feature - no breaking changes
2. **Connection Pool**: Enhanced configuration - backward compatible
3. **Migrations**: New feature - no impact on existing code

#### Breaking Changes

- None in version 0.3.x

## Contributing

We welcome contributions! Please follow these steps:

1. **Fork the repository**
2. **Create a feature branch**: `git checkout -b feature/amazing-feature`
3. **Make your changes**:
   - Follow TypeScript best practices
   - Add comprehensive tests
   - Update documentation
   - Ensure all tests pass
4. **Commit your changes**: `git commit -m 'Add amazing feature'`
5. **Push to the branch**: `git push origin feature/amazing-feature`
6. **Submit a pull request**

### Development Setup

```bash
# Clone the repository
git clone https://github.com/soapjs/soap-node-sql.git
cd soap-node-sql

# Install dependencies
npm install

# Run tests
npm run test:unit

# Build the project
npm run build

# Check code coverage
npm run test:unit -- --coverage
```

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

- **Documentation**: [https://docs.soapjs.com](https://docs.soapjs.com)
- **Issues**: [GitHub Issues](https://github.com/soapjs/soap-node-sql/issues)
- **Discussions**: [GitHub Discussions](https://github.com/soapjs/soap-node-sql/discussions)
- **Email**: radoslaw.kamysz@gmail.com

## Expected Package Versions

### Core Dependencies

```json
{
  "@soapjs/soap": "^0.3.0",
  "typescript": "^5.0.0"
}
```

### Database Drivers

```json
{
  "pg": "^8.11.0",
  "mysql2": "^3.6.0", 
  "better-sqlite3": "^9.2.0"
}
```

### Development Dependencies

```json
{
  "@types/pg": "^8.10.0",
  "@types/better-sqlite3": "^7.6.0",
  "jest": "^29.0.0",
  "testcontainers": "^10.0.0"
}
```

### Version Compatibility Matrix

| Package Version | @soapjs/soap | pg | mysql2 | better-sqlite3 | Node.js |
|----------------|--------------|----|--------|----------------|---------|
| 0.3.x | ^0.3.0 | ^8.11.0 | ^3.6.0 | ^9.2.0 | >=16.0.0 |
| 0.2.x | ^0.2.0 | ^8.10.0 | ^3.5.0 | ^9.1.0 | >=14.0.0 |
| 0.1.x | ^0.1.0 | ^8.9.0 | ^3.4.0 | ^9.0.0 | >=12.0.0 |