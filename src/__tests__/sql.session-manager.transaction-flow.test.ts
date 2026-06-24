import 'reflect-metadata';
import { DatabaseContext, Result, Transaction, TransactionRunner } from '@soapjs/soap';
import { SqlDataSource } from '../sql.source';
import { SoapSQL } from '../soap.sql';
import { SqlSessionManager } from '../sql.session-manager';

describe('SqlSessionManager Soap transaction flow', () => {
  let managers: SqlSessionManager[] = [];

  const createConnection = () => ({
    beginTransaction: jest.fn().mockResolvedValue(undefined),
    query: jest.fn().mockResolvedValue([[{ id: 1 }]]),
    commit: jest.fn().mockResolvedValue(undefined),
    rollback: jest.fn().mockResolvedValue(undefined),
    release: jest.fn()
  });

  afterEach(async () => {
    await Promise.all(managers.map(manager => manager.closeAllSessions()));
    managers = [];
    jest.clearAllMocks();
  });

  const createManager = (options: ConstructorParameters<typeof SqlSessionManager>[0]) => {
    const manager = new SqlSessionManager(options);
    managers.push(manager);
    return manager;
  };

  it('creates one lazy session for a Soap transaction id and commits it', async () => {
    const connection = createConnection();
    const provider = jest.fn().mockResolvedValue(connection);
    const manager = createManager({ connectionProvider: provider, databaseType: 'mysql' });

    const session = manager.createSession('transaction-1') as any;
    const duplicate = manager.createSession('transaction-1');

    expect(duplicate).toBe(session);
    expect(manager.hasSession('transaction-1')).toBe(true);
    expect(provider).not.toHaveBeenCalled();

    await session.executeQuery('INSERT INTO users (name) VALUES (?)', ['Ada']);
    await session.commitTransaction();
    await session.end();

    expect(provider).toHaveBeenCalledTimes(1);
    expect(connection.beginTransaction).toHaveBeenCalledTimes(1);
    expect(connection.query).toHaveBeenCalledWith('INSERT INTO users (name) VALUES (?)', ['Ada']);
    expect(connection.commit).toHaveBeenCalledTimes(1);
    expect(connection.release).toHaveBeenCalledTimes(1);
  });

  it('rolls back and releases a lazy transaction session', async () => {
    const connection = createConnection();
    const manager = createManager({
      connectionProvider: jest.fn().mockResolvedValue(connection),
      databaseType: 'mysql'
    });
    const session = manager.createSession('transaction-2') as any;

    await session.executeQuery('UPDATE users SET name = ? WHERE id = ?', ['Ada', 1]);
    await session.rollbackTransaction();
    await session.end();

    expect(connection.beginTransaction).toHaveBeenCalledTimes(1);
    expect(connection.rollback).toHaveBeenCalledTimes(1);
    expect(connection.release).toHaveBeenCalledTimes(1);
  });

  it('cleans up expired transaction sessions', async () => {
    const connection = createConnection();
    const manager = createManager({
      connectionProvider: jest.fn().mockResolvedValue(connection),
      databaseType: 'mysql'
    });
    const session = manager.createSession('expired-transaction') as any;

    await session.executeQuery('INSERT INTO users (name) VALUES (?)', ['Ada']);
    session._lastUsed = new Date(Date.now() - 300001);

    await (manager as any).cleanupExpiredSessions();

    expect(manager.hasSession('expired-transaction')).toBe(false);
    expect(connection.rollback).toHaveBeenCalledTimes(1);
    expect(connection.release).toHaveBeenCalledTimes(1);
  });

  it('uses one SQL transaction session across multiple repositories', async () => {
    const connection = createConnection();
    const provider = jest.fn().mockResolvedValue(connection);
    const sessions = createManager({ connectionProvider: provider, databaseType: 'mysql' });
    const soapSql = {
      databaseType: 'mysql',
      sessions,
      query: jest.fn(),
      getConnection: provider
    } as unknown as SoapSQL;
    const mapper = {
      toModel: (value: any) => value,
      toEntity: (value: any) => value
    };
    const sourceA = new SqlDataSource(soapSql, 'users');
    const sourceB = new SqlDataSource(soapSql, 'orders');
    const repoA = {
      context: new DatabaseContext(sourceA, mapper as any, sessions)
    };
    const repoB = {
      context: new DatabaseContext(sourceB, mapper as any, sessions)
    };

    Reflect.defineMetadata('useSession', true, repoA);
    Reflect.defineMetadata('useSession', true, repoB);

    class MultiRepositoryTransaction extends Transaction<void> {
      constructor(private readonly first: any, private readonly second: any) {
        super(first, second);
      }

      async execute() {
        await this.first.context.source.query('INSERT INTO users (name) VALUES (?)', ['Ada']);
        await this.second.context.source.query('INSERT INTO orders (user_id) VALUES (?)', [1]);
        return Result.withSuccess(undefined);
      }
    }

    const result = await TransactionRunner.getInstance('sql-session-manager-test')
      .run(new MultiRepositoryTransaction(repoA, repoB));

    expect(result.isSuccess()).toBe(true);
    expect(provider).toHaveBeenCalledTimes(1);
    expect(connection.beginTransaction).toHaveBeenCalledTimes(1);
    expect(connection.query).toHaveBeenCalledTimes(2);
    expect(connection.commit).toHaveBeenCalledTimes(1);
    expect(connection.rollback).not.toHaveBeenCalled();
    expect(connection.release).toHaveBeenCalledTimes(1);
    expect(sessions.getSessionCount()).toBe(0);

    await sessions.closeAllSessions();
  });
});
