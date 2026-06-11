import { Client as PGClient } from 'pg';
import mysql from 'mysql2/promise';
import { DbType } from '@prisma/client';

export interface QueryResult {
  rows: Record<string, unknown>[];
  rowCount: number;
  fields: string[];
  executionMs: number;
  truncated: boolean; // true if results were capped at ROW_LIMIT
}

const QUERY_TIMEOUT_MS = 10_000; // 10 seconds
const ROW_LIMIT = 1000;

/**
 * Execute a validated SQL query against the target database with:
 * - 10-second hard timeout (connection level + application level)
 * - Row count enforcement (max 1000 rows returned)
 * - Immediate connection release after execution
 */
export async function executeQuery(
  connectionString: string,
  dbType: DbType,
  sql: string
): Promise<QueryResult> {
  const startTime = Date.now();

  if (dbType === DbType.POSTGRES) {
    return executePostgresQuery(connectionString, sql, startTime);
  } else if (dbType === DbType.MYSQL) {
    return executeMySQLQuery(connectionString, sql, startTime);
  }

  throw new Error(`Unsupported database type: ${dbType}`);
}

// ─── PostgreSQL Executor ──────────────────────────────────────────────────────

async function executePostgresQuery(
  connectionString: string,
  sql: string,
  startTime: number
): Promise<QueryResult> {
  const client = new PGClient({
    connectionString,
    connectionTimeoutMillis: 5000,
    query_timeout: QUERY_TIMEOUT_MS, // pg client-level timeout
    statement_timeout: QUERY_TIMEOUT_MS,
  });

  // Application-level timeout (belt + suspenders)
  const timeoutHandle = setTimeout(() => {
    client.end().catch(() => {});
  }, QUERY_TIMEOUT_MS + 1000);

  try {
    await client.connect();

    // Dynamically retrieve active schema and set search_path if non-public
    const schemaRes = await client.query<{ current_schema: string }>('SELECT current_schema();');
    const activeSchema = schemaRes.rows[0]?.current_schema;
    if (activeSchema && activeSchema !== 'public') {
      await client.query(`SET search_path TO "${activeSchema}", public`);
    }

    // Set statement timeout at session level for double enforcement
    await client.query(`SET statement_timeout = ${QUERY_TIMEOUT_MS}`);

    const result = await client.query(sql);
    clearTimeout(timeoutHandle);

    const executionMs = Date.now() - startTime;
    const allRows = (result.rows || []) as Record<string, unknown>[];
    const truncated = allRows.length >= ROW_LIMIT;
    const rows = allRows.slice(0, ROW_LIMIT);
    const fields = result.fields?.map((f) => f.name) ?? Object.keys(rows[0] ?? {});

    return { rows, rowCount: rows.length, fields, executionMs, truncated };
  } catch (err: any) {
    clearTimeout(timeoutHandle);

    if (
      err.code === '57014' || // query_canceled
      err.message?.includes('canceling statement') ||
      err.message?.includes('timeout')
    ) {
      throw new Error(`Query exceeded ${QUERY_TIMEOUT_MS / 1000}s timeout and was cancelled.`);
    }
    throw err;
  } finally {
    await client.end().catch(() => {});
  }
}

// ─── MySQL Executor ───────────────────────────────────────────────────────────

async function executeMySQLQuery(
  connectionString: string,
  sql: string,
  startTime: number
): Promise<QueryResult> {
  const connection = await mysql.createConnection({
    uri: connectionString,
    connectTimeout: 5000,
  });

  // Application-level timeout
  const timeoutHandle = setTimeout(() => {
    connection.destroy();
  }, QUERY_TIMEOUT_MS);

  try {
    // MySQL: set session max_execution_time in milliseconds
    await connection.query(`SET SESSION max_execution_time = ${QUERY_TIMEOUT_MS}`);

    const [rows] = await connection.query<any[]>(sql);
    clearTimeout(timeoutHandle);

    const executionMs = Date.now() - startTime;
    const allRows = (Array.isArray(rows) ? rows : [rows]) as Record<string, unknown>[];
    const truncated = allRows.length >= ROW_LIMIT;
    const trimmedRows = allRows.slice(0, ROW_LIMIT);
    const fields = trimmedRows.length > 0 ? Object.keys(trimmedRows[0]) : [];

    return {
      rows: trimmedRows,
      rowCount: trimmedRows.length,
      fields,
      executionMs,
      truncated,
    };
  } catch (err: any) {
    clearTimeout(timeoutHandle);

    if (
      err.code === 'ER_QUERY_INTERRUPTED' ||
      err.message?.includes('max_execution_time') ||
      err.message?.includes('timeout')
    ) {
      throw new Error(`Query exceeded ${QUERY_TIMEOUT_MS / 1000}s timeout and was cancelled.`);
    }
    throw err;
  } finally {
    await connection.end().catch(() => {});
  }
}
