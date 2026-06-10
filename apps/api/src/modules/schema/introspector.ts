import { Client as PGClient } from 'pg';
import mysql from 'mysql2/promise';
import { DbType } from '@prisma/client';

export interface ColumnInfo {
  columnName: string;
  dataType: string;
  isNullable: boolean;
  columnDefault: string | null;
}

export interface ForeignKeyInfo {
  columnName: string;
  referencedTable: string;
  referencedColumn: string;
}

export interface IndexInfo {
  indexName: string;
  columns: string[];
  isUnique: boolean;
}

export interface TableSchema {
  tableName: string;
  columns: ColumnInfo[];
  foreignKeys: ForeignKeyInfo[];
  indexes: IndexInfo[];
  /** Human-readable description generated for embedding */
  description: string;
}

export interface IntrospectedSchema {
  tables: TableSchema[];
  /** Fingerprint: hash of table+column names for drift detection */
  fingerprint: string;
}

// ─── PostgreSQL Introspection ─────────────────────────────────────────────────

async function introspectPostgres(connectionString: string): Promise<TableSchema[]> {
  const client = new PGClient({ connectionString, connectionTimeoutMillis: 10000 });
  await client.connect();

  try {
    // Get all user tables (excluding system schemas)
    const tablesResult = await client.query<{ table_name: string }>(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);

    const tables: TableSchema[] = [];

    for (const row of tablesResult.rows) {
      const tableName = row.table_name;

      // Columns
      const colResult = await client.query<{
        column_name: string;
        data_type: string;
        is_nullable: string;
        column_default: string | null;
      }>(`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1
        ORDER BY ordinal_position
      `, [tableName]);

      const columns: ColumnInfo[] = colResult.rows.map((c) => ({
        columnName: c.column_name,
        dataType: c.data_type,
        isNullable: c.is_nullable === 'YES',
        columnDefault: c.column_default,
      }));

      // Foreign Keys
      const fkResult = await client.query<{
        column_name: string;
        foreign_table_name: string;
        foreign_column_name: string;
      }>(`
        SELECT
          kcu.column_name,
          ccu.table_name AS foreign_table_name,
          ccu.column_name AS foreign_column_name
        FROM information_schema.table_constraints AS tc
        JOIN information_schema.key_column_usage AS kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage AS ccu
          ON ccu.constraint_name = tc.constraint_name
          AND ccu.table_schema = tc.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND tc.table_schema = 'public'
          AND tc.table_name = $1
      `, [tableName]);

      const foreignKeys: ForeignKeyInfo[] = fkResult.rows.map((fk) => ({
        columnName: fk.column_name,
        referencedTable: fk.foreign_table_name,
        referencedColumn: fk.foreign_column_name,
      }));

      // Indexes
      const idxResult = await client.query<{
        indexname: string;
        indexdef: string;
      }>(`
        SELECT indexname, indexdef
        FROM pg_indexes
        WHERE schemaname = 'public' AND tablename = $1
      `, [tableName]);

      const indexes: IndexInfo[] = idxResult.rows.map((idx) => {
        const isUnique = idx.indexdef.toUpperCase().includes('UNIQUE');
        // Extract column names from index definition (simplified)
        const match = idx.indexdef.match(/\(([^)]+)\)/);
        const cols = match ? match[1].split(',').map((c) => c.trim()) : [];
        return { indexName: idx.indexname, columns: cols, isUnique };
      });

      // Build human-readable description for embedding
      const colList = columns.map((c) => `${c.columnName} (${c.dataType})`).join(', ');
      const fkDesc = foreignKeys.length > 0
        ? ` Foreign keys: ${foreignKeys.map((fk) => `${fk.columnName} → ${fk.referencedTable}.${fk.referencedColumn}`).join(', ')}.`
        : '';
      const description = `Table "${tableName}" with columns: ${colList}.${fkDesc}`;

      tables.push({ tableName, columns, foreignKeys, indexes, description });
    }

    return tables;
  } finally {
    await client.end().catch(() => {});
  }
}

// ─── MySQL Introspection ──────────────────────────────────────────────────────

async function introspectMySQL(connectionString: string): Promise<TableSchema[]> {
  const connection = await mysql.createConnection({ uri: connectionString, connectTimeout: 10000 });

  try {
    const [dbRows] = await connection.query<any[]>('SELECT DATABASE() AS db');
    const dbName: string = dbRows[0].db;

    const [tableRows] = await connection.query<any[]>(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = ?
        AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `, [dbName]);

    const tables: TableSchema[] = [];

    for (const row of tableRows) {
      const tableName: string = row.table_name || row.TABLE_NAME;

      const [colRows] = await connection.query<any[]>(`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_schema = ? AND table_name = ?
        ORDER BY ordinal_position
      `, [dbName, tableName]);

      const columns: ColumnInfo[] = colRows.map((c: any) => ({
        columnName: c.column_name || c.COLUMN_NAME,
        dataType: c.data_type || c.DATA_TYPE,
        isNullable: (c.is_nullable || c.IS_NULLABLE) === 'YES',
        columnDefault: c.column_default || c.COLUMN_DEFAULT,
      }));

      const [fkRows] = await connection.query<any[]>(`
        SELECT
          kcu.column_name,
          kcu.referenced_table_name AS foreign_table_name,
          kcu.referenced_column_name AS foreign_column_name
        FROM information_schema.key_column_usage AS kcu
        JOIN information_schema.table_constraints AS tc
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
          AND tc.table_name = kcu.table_name
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND kcu.table_schema = ?
          AND kcu.table_name = ?
      `, [dbName, tableName]);

      const foreignKeys: ForeignKeyInfo[] = fkRows.map((fk: any) => ({
        columnName: fk.column_name || fk.COLUMN_NAME,
        referencedTable: fk.foreign_table_name || fk.FOREIGN_TABLE_NAME,
        referencedColumn: fk.foreign_column_name || fk.FOREIGN_COLUMN_NAME,
      }));

      const colList = columns.map((c) => `${c.columnName} (${c.dataType})`).join(', ');
      const fkDesc = foreignKeys.length > 0
        ? ` Foreign keys: ${foreignKeys.map((fk) => `${fk.columnName} → ${fk.referencedTable}.${fk.referencedColumn}`).join(', ')}.`
        : '';
      const description = `Table "${tableName}" with columns: ${colList}.${fkDesc}`;

      tables.push({ tableName, columns, foreignKeys, indexes: [], description });
    }

    return tables;
  } finally {
    await connection.end().catch(() => {});
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Introspect a remote database and return full table schemas.
 * Supports PostgreSQL and MySQL.
 */
export async function introspectDatabase(
  connectionString: string,
  dbType: DbType
): Promise<TableSchema[]> {
  if (dbType === DbType.POSTGRES) {
    return introspectPostgres(connectionString);
  } else if (dbType === DbType.MYSQL) {
    return introspectMySQL(connectionString);
  }
  throw new Error(`Unsupported database type: ${dbType}`);
}

/**
 * Generate a lightweight fingerprint for schema drift detection.
 * Hash is computed from sorted table+column names only (structure, not data).
 */
export function computeSchemaFingerprint(tables: TableSchema[]): string {
  const crypto = require('crypto');
  const structure = tables
    .sort((a, b) => a.tableName.localeCompare(b.tableName))
    .map((t) => `${t.tableName}:${t.columns.map((c) => c.columnName).sort().join(',')}`)
    .join('|');
  return crypto.createHash('sha256').update(structure).digest('hex').slice(0, 16);
}
