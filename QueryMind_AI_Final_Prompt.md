# QueryMind AI — Final 10/10 Project Prompt
### For: 4th Year BTech CSE Student | Resume-Grade Project
### Stack: Node.js + Express.js + TypeScript + PostgreSQL + pgvector + Gemini AI

---

## What You're Building

**QueryMind AI** — an enterprise-grade Natural Language to SQL Analytics Platform. Users connect any relational database and query it in plain English. The system retrieves relevant schema via RAG, generates validated safe SQL, executes it, and returns AI-powered insights with auto-generated charts.

Real-world parallel: a simplified ThoughtSpot + Metabase AI.

---

## Final Tech Stack

### Backend
- Node.js 20+ with Express.js (TypeScript, strict mode)
- Prisma ORM
- PostgreSQL 16 + pgvector extension (schema embeddings — NO Pinecone)
- Redis 7 (query result caching + BullMQ backing store)
- BullMQ (background jobs: embedding, dashboard refresh, CSV export)
- JWT + Google OAuth2 via Passport.js
- Socket.IO (real-time query progress streaming)
- AWS S3 or Cloudflare R2 (CSV/report exports)
- node-sql-parser (AST-based SQL validation)
- Winston (structured JSON logging)
- Prometheus client (metrics endpoint)

### AI Layer
- Google Gemini 2.0 Flash (primary LLM — large context window, cost-effective)
- OpenAI text-embedding-3-small (vector embeddings stored in pgvector)
- Custom multi-step agent (no LangChain — build it yourself)

> Do NOT use LangChain. Interviewers respect engineers who understand what agents
> actually do under the hood. A custom agent with a while-loop and tool registry
> demonstrates this clearly.

### Frontend
- Next.js 15 (App Router) with TypeScript
- Tailwind CSS + ShadCN UI
- TanStack Query v5
- Recharts (charts)
- Monaco Editor (SQL viewer — read-only mode)
- Zustand (client state)

### DevOps
- Docker + Docker Compose (multi-service: postgres, redis, api, web)
- GitHub Actions (CI: lint → test → build; CD: deploy on main merge)
- Prometheus + Grafana (basic observability)
- Deploy to Railway or Render (be honest about this in interviews)

---

## The Complete Pipeline

```
User Natural Language Question
          │
          ▼
  [1] Query Intent Classifier
      Is this analytics, metadata lookup, or ambiguous?
          │
          ▼
  [2] Business Glossary Lookup     ◄── NEW
      "revenue" → gmv
      "customer" → cust_seg
      Resolve business terms to schema terms before RAG
          │
          ▼
  [3] Schema RAG Retrieval
      Embed question → pgvector cosine similarity
      → retrieve only relevant tables + columns
      + inject glossary-matched columns alongside
          │
          ▼
  [4] AI Query Plan Generator      ◄── NEW
      LLM outputs 3–5 plain English steps before writing SQL
      "1. Retrieve sales table  2. Group by product  3. Sum gmv..."
      Streamed to frontend immediately — feels premium
          │
          ▼
  [5] SQL Generator (Gemini 2.0 Flash)
      Generates SQL with chain-of-thought
      Uses retrieved schema + resolved glossary terms
          │
          ▼
  [6] SQL Safety Validator (4 layers)
      Layer 1: Keyword blocklist (DROP/DELETE/UPDATE/ALTER/TRUNCATE)
      Layer 2: AST parser (node-sql-parser) — must be pure SELECT
      Layer 3: Auto-inject LIMIT 1000 if missing
      Layer 4: Query timeout 10s + kill on breach
          │
          ▼
  [7] Query Executor
      Run on connected DB with row limits + timeout
          │
          ▼
  [8] Chart Type Detector
      Analyze result shape → recommend chart type automatically
          │
          ▼
  [9] AI Insight Generator
      Stream 2–3 plain English insights via Socket.IO
          │
          ▼
  [10] Feedback Capture            ◄── RLHF-lite
       Thumbs up/down → store correction → improve future queries
```

---

## All Features to Build

### Feature 1: Database Connection Manager
- Connect PostgreSQL or MySQL via connection string
- Encrypt connection strings at rest using AES-256 (never expose in API responses)
- Auto-crawl schema: all tables, columns, types, foreign keys, indexes on connection
- Support multiple connections per workspace

---

### Feature 2: Schema-Aware RAG Engine ⭐
On connection: generate vector embeddings for every table, column, and table description.
Store in pgvector with HNSW index alongside metadata.
On every query: embed the question → cosine similarity → retrieve top-K relevant tables only.
Inject only retrieved schema into LLM context (not the full schema).

**Interview answer unlocked:**
"How do you prevent hallucinated column names?"
→ "I embed every table and column name. When a question comes in, I retrieve only the top-K
   relevant tables via cosine similarity and inject those into the prompt. The LLM never
   sees columns that don't exist in the relevant context."

---

### Feature 3: Business Glossary Module ⭐ (Differentiator)
Real databases have columns named `gmv`, `tbl_rev_mnth`, `cust_seg`.
Business users say "revenue", "customers", "orders".

Build a glossary table: (business_term, schema_term, description).
Generate embeddings for each business term.
On every query: before RAG retrieval, search glossary embeddings for matching terms.
Inject matched mappings into the LLM prompt as additional context.

Example:
```
User asks: "show me monthly revenue by customer segment"
Glossary resolves: revenue → gmv, customer segment → cust_seg
RAG retrieves: sales table with gmv and cust_seg columns
LLM generates correct SQL using actual column names
```

**Interview answer unlocked:**
"What happens when the business language doesn't match schema names?"
→ Full glossary + embedding answer above.

---

### Feature 4: AI Query Plan Visualization ⭐
Before generating SQL, make one fast LLM call:
Prompt: "List 3–5 plain English steps to answer this question. Be brief."

Response streamed immediately to the frontend:
```
1. Access the sales table
2. Filter by date range
3. Group by product category
4. Sum the gmv column
5. Sort descending, return top 10
```

Frontend renders this as a numbered step list that appears before SQL.
This makes the demo look exceptional and costs ~$0.001 per query.

---

### Feature 5: SQL Safety Validator ⭐
- Layer 1 — Keyword blocklist: DROP, DELETE, UPDATE, INSERT, ALTER, TRUNCATE, EXEC, xp_cmdshell
- Layer 2 — AST parse using node-sql-parser: reject anything that isn't a pure SELECT
- Layer 3 — Row limit injection: append LIMIT 1000 if absent
- Layer 4 — Timeout: kill queries running over 10 seconds
- Log all rejections to audit_logs with reason code

**Interview answer unlocked:**
"How do you stop AI-generated SQL from being a security risk?"
→ 4-layer answer above, in that exact order.

---

### Feature 6: Auto Chart Type Detection
After execution, analyze result shape:
- 1 row × 1 col → KPI card (big number)
- 1 col, many rows → bar chart
- 2 cols (string + number) → bar or pie
- 2 cols (date + number) → line / area chart
- 3+ cols → table with optional chart overlay

Return chart_type recommendation in the API response.
Frontend renders using Recharts.

---

### Feature 7: AI Insight Generator
After execution, stream 2–3 insight sentences via Socket.IO.
Prompt: "You are a senior data analyst. Given this result, write 2–3 insight sentences
         for a non-technical business user. Be specific and concise."
Cap at 3 bullet points. Never generic.

---

### Feature 8: Query Feedback Loop — RLHF-lite ⭐
Every result has thumbs up / thumbs down.
On thumbs down: user can optionally paste the correct SQL.
Store: (original_question, generated_sql, corrected_sql, schema_fingerprint).
On future similar questions: retrieve corrections via similarity search and inject as
few-shot examples into the generation prompt.
The system gets smarter per schema over time.

**Interview answer unlocked:**
"How would you improve query accuracy over time without retraining the model?"
→ Full RLHF-lite answer above.

---

### Feature 9: Schema Drift Detection ⭐
Run a BullMQ cron job daily (or on-demand after a configurable interval).
Job: introspect the live database schema → diff against last-crawled schema stored in DB.
If a column is renamed, added, or removed:
1. Mark affected embeddings as stale
2. Queue re-embedding job for changed tables
3. Send in-app notification: "Schema updated: 3 columns changed in sales table. Embeddings refreshed."

**Interview answer unlocked:**
"What happens when someone renames a column in the database after you've embedded it?"
→ Full drift detection + re-embedding answer above.

---

### Feature 10: Query History + Saved Queries
Store every executed query (user, question, SQL, result preview, chart type, timestamp).
Re-run past queries with one click.
Pin queries as "saved reports".
Conversation threading: follow-up questions keep session context.

---

### Feature 11: Multi-Tenant Team Workspaces
- Create workspace, invite by email
- Roles: Owner / Admin / Analyst / Viewer
- Databases at workspace level, shared across team
- Audit log per workspace (who queried what, when, what SQL ran)

---

### Feature 12: Dashboard Builder
- Pin any query result to a workspace dashboard
- Responsive grid of charts/KPIs
- Auto-refresh on configurable schedule via BullMQ cron
- Public share link (read-only, no auth)

---

### Feature 13: Multi-Step AI Analyst Agent ⭐
User asks: "Why did revenue drop in March?"
Agent loop (max 5 iterations):
1. Plan: decide what queries would answer this
2. Execute: run query 1 (March revenue by category)
3. Observe: compare to February baseline
4. Execute: run query 2 (find the anomalous category)
5. Synthesize: write plain English explanation + supporting data

Stream each step to frontend in real-time via Socket.IO.
Hard cap at 5 tool calls per agent run.

---

## Database Schema

```sql
-- Core auth
users           (id uuid PK, email, name, avatar_url, google_id, created_at)
sessions        (id, user_id FK, token_hash, expires_at)

-- Workspaces
workspaces      (id uuid PK, name, owner_id FK, created_at)
workspace_members (workspace_id FK, user_id FK, role ENUM)

-- Connections
db_connections  (id uuid PK, workspace_id FK, name, db_type ENUM,
                 encrypted_conn_string, last_synced_at, created_at)

-- Schema embeddings (pgvector)
schema_embeddings (id uuid PK, connection_id FK, table_name,
                   column_names text[], description,
                   embedding vector(1536), updated_at)

-- Business glossary
glossary_terms  (id uuid PK, workspace_id FK, business_term,
                 schema_term, description,
                 embedding vector(1536), created_at)

-- Query corrections (RLHF-lite)
query_corrections (id, query_history_id FK, question_embedding vector(1536),
                   corrected_sql, schema_fingerprint, submitted_by FK, created_at)

-- Query history
query_history   (id uuid PK, workspace_id FK, user_id FK, connection_id FK,
                 question, generated_sql, result_preview jsonb,
                 chart_type, execution_ms, status ENUM, created_at)

-- Dashboards
dashboards      (id, workspace_id FK, name, is_public, public_token, created_at)
dashboard_items (id, dashboard_id FK, query_history_id FK,
                 chart_type, grid_position jsonb, refresh_interval_mins)

-- Audit log
audit_logs      (id, workspace_id FK, user_id FK, action,
                 resource_type, resource_id, metadata jsonb, created_at)
```

---

## Folder Structure

```
querymind-ai/
├── apps/
│   ├── api/                              # Express.js backend
│   │   ├── src/
│   │   │   ├── config/                   # env, db, redis, s3
│   │   │   ├── middleware/               # auth, error handler, rate limiter
│   │   │   ├── modules/
│   │   │   │   ├── auth/                 # JWT + Google OAuth
│   │   │   │   ├── workspace/            # workspace + members CRUD
│   │   │   │   ├── connections/          # DB connection manager
│   │   │   │   ├── schema/               # introspection + embedding
│   │   │   │   ├── glossary/             # business glossary CRUD + embed ◄ NEW
│   │   │   │   ├── drift/                # schema drift detection cron   ◄ NEW
│   │   │   │   ├── query/
│   │   │   │   │   ├── classifier.ts
│   │   │   │   │   ├── glossary-resolver.ts    ◄ NEW
│   │   │   │   │   ├── rag.ts
│   │   │   │   │   ├── planner.ts              ◄ NEW (query plan)
│   │   │   │   │   ├── generator.ts
│   │   │   │   │   ├── validator.ts            (4-layer safety)
│   │   │   │   │   ├── executor.ts
│   │   │   │   │   ├── chart-detector.ts
│   │   │   │   │   ├── insights.ts
│   │   │   │   │   └── feedback.ts             (RLHF-lite)
│   │   │   │   ├── agent/                # multi-step analyst agent
│   │   │   │   ├── dashboard/
│   │   │   │   └── audit/
│   │   │   ├── jobs/                     # BullMQ workers
│   │   │   │   ├── embed-schema.job.ts
│   │   │   │   ├── detect-drift.job.ts         ◄ NEW
│   │   │   │   ├── refresh-dashboard.job.ts
│   │   │   │   └── export-report.job.ts
│   │   │   ├── lib/
│   │   │   │   ├── llm.ts               # Gemini client
│   │   │   │   ├── embeddings.ts        # OpenAI embedding client
│   │   │   │   ├── redis.ts
│   │   │   │   ├── s3.ts
│   │   │   │   └── socket.ts
│   │   │   └── app.ts
│   │   ├── prisma/schema.prisma
│   │   └── Dockerfile
│   │
│   └── web/                              # Next.js 15 frontend
│       ├── app/
│       │   ├── (auth)/
│       │   ├── (app)/
│       │   │   ├── workspace/
│       │   │   ├── query/                # main chat-style interface
│       │   │   ├── glossary/             # glossary manager UI ◄ NEW
│       │   │   ├── dashboards/
│       │   │   └── settings/
│       │   └── share/[token]/
│       └── components/
│           ├── query/
│           │   ├── QueryInput.tsx
│           │   ├── QueryPlanSteps.tsx          ◄ NEW (step list display)
│           │   ├── SQLViewer.tsx         # Monaco, read-only
│           │   ├── ResultTable.tsx
│           │   ├── ChartRenderer.tsx     # Recharts auto-chart
│           │   └── InsightCard.tsx
│           └── dashboard/
│
├── docker-compose.yml
├── .github/workflows/
│   ├── ci.yml
│   └── deploy.yml
└── README.md
```

---

## Key Engineering Decisions — Interview Q&A

**Q: Why pgvector instead of Pinecone?**
pgvector keeps all data in one database — no extra infra cost, no external service dependency,
no data egress. For under 50,000 embeddings with an HNSW index, performance is comparable.
Simpler architecture, easier to reason about in production.

**Q: Why Gemini 2.0 Flash specifically?**
Its 1 million token context window lets me inject richer schema context — full table descriptions,
sample values, glossary terms — without truncation. That directly reduces hallucination.
GPT-4o mini is smaller context; GPT-4o is more expensive.

**Q: Why a custom agent instead of LangChain?**
LangChain abstracts exactly the things interviewers probe — prompt construction, tool call parsing,
loop termination conditions. My agent is ~100 lines: a while-loop, a tool registry (object mapping
tool names to async functions), and a max-iterations guard. I can explain every line.

**Q: Why BullMQ for background jobs?**
Schema embedding for a large database can take 20–40 seconds. Running it synchronously in the
request would cause timeouts. BullMQ pushes it to a worker, the API returns immediately, and
Socket.IO notifies the frontend when embedding is complete.

**Q: Why Redis?**
Two purposes: (1) Cache identical query results — cache key is hash(question + schema_fingerprint),
TTL 5 minutes. Saves LLM cost on repeated queries. (2) BullMQ requires Redis as its queue store.

**Q: How do you prevent prompt injection?**
User input is always injected inside a fixed XML tag: `<user_question>...</user_question>`.
The system prompt explicitly instructs the model to treat the content of that tag as data to
analyse, never as instructions to follow. The template structure is never constructed by
concatenating user input directly.

**Q: What happens when a column is renamed in the database?**
The daily schema drift job re-introspects the live schema, diffs against the stored schema,
marks stale embeddings, queues re-embedding for changed tables, and sends a notification.
Without this, the RAG system would silently return wrong column names.

**Q: How does the business glossary improve accuracy?**
Before RAG retrieval, I search glossary embeddings for terms matching the user's question.
Matched mappings are injected into the prompt alongside the retrieved schema. The LLM then
generates SQL using actual column names even when the user said "revenue" and the column is "gmv".
This is the most common failure mode in real analytics deployments.

---

## Resume Description (Copy-Paste Ready)

```
QueryMind AI — Natural Language Analytics Platform                    [GitHub] [Demo]
Node.js · Express · TypeScript · PostgreSQL · pgvector · Redis · BullMQ ·
Gemini API · Next.js 15 · Docker · GitHub Actions

Built an enterprise-grade NL-to-SQL platform enabling users to query relational databases
using conversational language. Key engineering: schema-aware RAG with pgvector HNSW indexing
for hallucination-free SQL generation; semantic business glossary that resolves domain terms
to schema column names; 4-layer SQL safety validator using AST parsing; AI query plan
visualization streamed before execution; RLHF-lite feedback loop that improves per-schema
accuracy over time; daily schema drift detection with automatic re-embedding; multi-step
AI analyst agent for open-ended data questions; real-time progress streaming via Socket.IO;
Redis query caching; BullMQ background jobs; multi-tenant RBAC workspaces. Containerized
with Docker Compose, CI/CD via GitHub Actions, deployed on Railway.
```

---

## Build Order — 10 Weeks

**Week 1–2**
Project setup: Docker Compose (postgres + redis + api + web), Prisma schema,
JWT auth + Google OAuth, workspace CRUD, member invite flow.

**Week 3**
Database connection manager, schema introspection crawler, pgvector setup,
BullMQ embed-schema job, HNSW index creation.

**Week 4**
Core pipeline: RAG retrieval, Gemini integration, SQL safety validator (all 4 layers),
query executor with timeout. Basic REST endpoint returning SQL + results.

**Week 5**
Frontend: query chat interface, SQL Monaco viewer, result table, Recharts auto-chart.
Socket.IO integration for streaming insights.

**Week 6**
Business glossary module (CRUD + embeddings + resolver in pipeline).
Query plan visualization (streamed step list before SQL).
Query history + feedback loop (thumbs up/down + correction storage).

**Week 7**
Schema drift detection cron job + notification.
Dashboard builder: pin queries, grid layout, public share link.
BullMQ dashboard refresh job.

**Week 8**
Multi-step AI analyst agent. Redis query result caching. Audit logs.
Prometheus metrics endpoint.

**Week 9**
Polish: error states, loading skeletons, empty states, mobile layout.
Write interview Q&A answers until you can say each one in 60 seconds.

**Week 10**
Docker Compose final testing. GitHub Actions CI/CD.
Deploy to Railway. Architecture diagram in README.
Record 60-second Loom demo (see below).

---

## The Demo Video (Most Important Thing You Will Do)

Record a 60-second Loom. Show exactly this:

1. (0–5s) Connect a Postgres database
2. (5–15s) Type "show me top 10 products by revenue this quarter"
3. (15–25s) Watch the query plan steps appear → SQL generate → validate → execute
4. (25–35s) See the auto bar chart + AI insight appear
5. (35–50s) Type "why did Electronics underperform in March?" and watch the agent run steps
6. (50–60s) Show the dashboard with pinned charts

Put this Loom link in: your resume, GitHub README, LinkedIn, and every job application.
Most students have only a GitHub repo link. A working demo that takes 60 seconds to watch
and shows something genuinely useful is the single highest-leverage thing you can do.

---

*Stack summary: Node.js 20 · Express.js · TypeScript · PostgreSQL 16 · pgvector ·
Redis 7 · BullMQ · Google Gemini 2.0 Flash · OpenAI Embeddings · Next.js 15 ·
Tailwind CSS · ShadCN UI · Recharts · Monaco Editor · Socket.IO · Docker ·
GitHub Actions · Railway*
