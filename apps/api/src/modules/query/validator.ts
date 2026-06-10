import { Parser } from 'node-sql-parser';

// ─── Layer 1: Keyword Blocklist ───────────────────────────────────────────────

const BLOCKED_KEYWORDS = [
  'DROP',
  'DELETE',
  'UPDATE',
  'INSERT',
  'ALTER',
  'TRUNCATE',
  'CREATE',
  'REPLACE',
  'MERGE',
  'EXEC',
  'EXECUTE',
  'XP_CMDSHELL',
  'SP_EXECUTESQL',
  'GRANT',
  'REVOKE',
  'CALL',
];

export interface ValidationResult {
  valid: boolean;
  sql: string; // May be modified (e.g. LIMIT injected)
  rejectionReason?: string;
  rejectionLayer?: 1 | 2 | 3 | 4;
  modifications: string[];
}

/**
 * 4-Layer SQL Safety Validator
 *
 * Layer 1: Keyword blocklist — rejects any SQL containing dangerous keywords
 * Layer 2: AST parse — must be a pure SELECT statement (node-sql-parser)
 * Layer 3: LIMIT injection — auto-injects LIMIT 1000 if missing or > 1000
 * Layer 4: Structural check — validates no nested writes or function injections
 */
export function validateSQL(sql: string): ValidationResult {
  const modifications: string[] = [];
  let workingSQL = sql.trim();

  // ── Layer 1: Keyword Blocklist ─────────────────────────────────────────────
  for (const keyword of BLOCKED_KEYWORDS) {
    // Match as a whole word (not part of a column/table name)
    const pattern = new RegExp(`\\b${keyword}\\b`, 'i');
    if (pattern.test(workingSQL)) {
      return {
        valid: false,
        sql: workingSQL,
        rejectionReason: `Blocked keyword detected: "${keyword}". Only SELECT statements are permitted.`,
        rejectionLayer: 1,
        modifications,
      };
    }
  }

  // ── Layer 2: AST Parse with node-sql-parser ────────────────────────────────
  const parser = new Parser();
  let ast: any;

  try {
    ast = parser.astify(workingSQL, { database: 'PostgresQL' });
  } catch (parseErr: any) {
    // Try MySQL dialect as fallback
    try {
      ast = parser.astify(workingSQL, { database: 'MySQL' });
    } catch {
      return {
        valid: false,
        sql: workingSQL,
        rejectionReason: `SQL parse error: ${parseErr.message}. The query may be malformed.`,
        rejectionLayer: 2,
        modifications,
      };
    }
  }

  // Handle both single statement and array of statements
  const statements = Array.isArray(ast) ? ast : [ast];

  // Reject multi-statement queries (e.g. "SELECT 1; DROP TABLE users")
  if (statements.length > 1) {
    return {
      valid: false,
      sql: workingSQL,
      rejectionReason: 'Multiple SQL statements detected. Only a single SELECT statement is allowed.',
      rejectionLayer: 2,
      modifications,
    };
  }

  const stmt = statements[0];

  // Must be a SELECT statement
  if (!stmt || stmt.type?.toLowerCase() !== 'select') {
    return {
      valid: false,
      sql: workingSQL,
      rejectionReason: `Statement type "${stmt?.type || 'unknown'}" is not allowed. Only SELECT statements are permitted.`,
      rejectionLayer: 2,
      modifications,
    };
  }

  // Check for WITH clauses (CTEs) that could contain writes
  if (stmt.with && Array.isArray(stmt.with)) {
    for (const cte of stmt.with) {
      if (cte.stmt?.type && cte.stmt.type.toLowerCase() !== 'select') {
        return {
          valid: false,
          sql: workingSQL,
          rejectionReason: `CTE "${cte.name}" contains a non-SELECT statement. Not permitted.`,
          rejectionLayer: 2,
          modifications,
        };
      }
    }
  }

  // ── Layer 3: LIMIT Injection ───────────────────────────────────────────────
  const MAX_ROWS = 1000;

  const hasLimit = stmt.limit && Array.isArray(stmt.limit.value) && stmt.limit.value.length > 0;

  if (!hasLimit) {
    // No LIMIT — inject one
    workingSQL = workingSQL.replace(/;?\s*$/, '') + ` LIMIT ${MAX_ROWS}`;
    modifications.push(`Injected LIMIT ${MAX_ROWS} (no limit was present)`);
  } else {
    // Has a LIMIT — check if it exceeds max
    const limitValue = stmt.limit?.value?.[0]?.value;
    if (typeof limitValue === 'number' && limitValue > MAX_ROWS) {
      // Replace the existing limit value
      workingSQL = workingSQL.replace(/\bLIMIT\s+\d+/i, `LIMIT ${MAX_ROWS}`);
      modifications.push(`Capped LIMIT from ${limitValue} to ${MAX_ROWS}`);
    }
  }

  // ── Layer 4: Structural Safety Checks ─────────────────────────────────────
  // Check for suspicious function calls (system-level or write functions)
  const dangerousFunctions = [
    'pg_read_file',
    'pg_write_file',
    'pg_ls_dir',
    'lo_export',
    'lo_import',
    'copy',
    'dblink',
  ];

  for (const fn of dangerousFunctions) {
    if (new RegExp(`\\b${fn}\\b`, 'i').test(workingSQL)) {
      return {
        valid: false,
        sql: workingSQL,
        rejectionReason: `Dangerous function "${fn}" detected. Not permitted in query context.`,
        rejectionLayer: 4,
        modifications,
      };
    }
  }

  // Check for comment-based injection attempts
  if (/--.*$/m.test(workingSQL) || /\/\*[\s\S]*?\*\//.test(workingSQL)) {
    // Strip comments rather than reject (they could be legitimate from LLM)
    workingSQL = workingSQL
      .replace(/--.*$/gm, '')    // Remove inline comments
      .replace(/\/\*[\s\S]*?\*\//g, '') // Remove block comments
      .trim();
    modifications.push('Stripped SQL comments');
  }

  return {
    valid: true,
    sql: workingSQL,
    modifications,
  };
}
