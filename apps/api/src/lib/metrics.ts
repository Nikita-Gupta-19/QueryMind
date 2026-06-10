import client from 'prom-client';

// ─── Default Metrics collection ──────────────────────────────────────────────
client.collectDefaultMetrics({
  prefix: 'querymind_',
});

// ─── Custom Metrics Definitions ──────────────────────────────────────────────

// 1. Queries Executed Counter
export const queriesExecutedCounter = new client.Counter({
  name: 'querymind_queries_total',
  help: 'Total count of NL-to-SQL queries executed on database connections.',
  labelNames: ['status'],
});

// 2. Cache Hits Counter
export const cacheHitsCounter = new client.Counter({
  name: 'querymind_cache_hits_total',
  help: 'Total count of query cache hits from Redis.',
});

// 3. Agent Runs Counter
export const agentRunsCounter = new client.Counter({
  name: 'querymind_agent_runs_total',
  help: 'Total count of multi-step AI analyst agent loops triggered.',
  labelNames: ['status'],
});

// 4. Execution Time Histogram
export const queryExecutionDuration = new client.Histogram({
  name: 'querymind_query_execution_duration_seconds',
  help: 'Duration of SQL query execution in seconds.',
  buckets: [0.1, 0.5, 1, 2, 5, 10],
});

export const prometheusRegistry = client.register;
