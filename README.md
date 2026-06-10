# QueryMind AI — Natural Language to SQL Analytics Platform

QueryMind AI is an enterprise-grade, multi-tenant Natural Language to SQL Analytics Platform designed to let non-technical business users query relational databases in plain English. The system utilizes RAG to retrieve matching schemas, generates safe and dialect-compliant SQL via Gemini 2.0 Flash, validates it against a 4-layer parser, runs it on connected databases, and streams real-time charts and AI analyst insights back to the client.

## 🚀 Key Features

- **Schema-Aware RAG Engine (pgvector + HNSW)**: Instead of feeding full database schemas to LLMs (which causes hallucination and high token costs), QueryMind generates embeddings for tables/columns, retrieves the top-K relevant tables via cosine similarity, and builds a compact context. Uses PostgreSQL HNSW indexes for sub-millisecond similarity lookups.
- **Business Glossary Resolver**: Resolves ambiguous business terms (e.g., "revenue", "customers") to matching physical schema counterparts (e.g., `gmv`, `cust_seg`) using vector matching *before* RAG schema retrieval.
- **4-Layer SQL Safety Validator**:
  - *Layer 1: Keyword Blocklist*: Blocks DDL/DML write commands (`DROP`, `DELETE`, `UPDATE`, `ALTER`, etc.).
  - *Layer 2: AST Analysis*: Employs `node-sql-parser` to parse query structure, reject multiple statements, and enforce SELECT-only operations.
  - *Layer 3: LIMIT Injection*: Autoinjects `LIMIT 1000` or caps user-defined limits to protect db memory.
  - *Layer 4: Structural Security*: Disables system calls (`pg_read_file`, etc.) and strips SQL comments.
- **RLHF-Lite Feedback Loop**: Captures thumbs up/down feedback on execution results. Users can submit the correct SQL on failure, which is embedded and injected as few-shot examples into future prompts.
- **Daily Schema Drift Worker**: Runs background cron jobs (via BullMQ) to introspect database structures, detect column/table diffs against the local database schema, mark stale embeddings, and queue automatic re-embedding.
- **Multi-Step AI Analyst Agent**: Handles open-ended analytical prompts (e.g., "Why did revenue drop in March?") through a 5-step agent loop (Plan → Execute → Observe → Synthesize) without using heavy frameworks like LangChain.
- **Real-Time WebSockets Streaming**: Streams progress logs, query plans, execution metrics, and analytical summaries dynamically using Socket.IO.
- **Secure Credentials Manager**: Encrypts target database credentials at rest using AES-256-GCM.

---

## 🛠️ Technology Stack

| Layer | Technologies |
| :--- | :--- |
| **Backend API** | Node.js (v20+), Express, TypeScript (Strict Mode), Winston |
| **Database & ORM** | PostgreSQL 16 (pgvector extension), Prisma ORM, Redis 7 |
| **Background Queues** | BullMQ (Embeddings generation, Drift checks, Dashboard refresh) |
| **AI / Embeddings** | Gemini 2.0 Flash, OpenAI text-embedding-3-small |
| **Web Frontend** | Next.js 15 (App Router), React 19, Tailwind CSS, Recharts, Monaco Editor |
| **DevOps** | Docker, Docker Compose, GitHub Actions (CI/CD) |

---

## 📐 Architecture Flow

```mermaid
graph TD
    User([User English Question]) --> Classifier[1. Intent Classifier]
    Classifier --> Glossary[2. Business Glossary Resolver]
    Glossary --> RAG[3. Schema RAG Retrieval - pgvector]
    RAG --> Plan[4. AI Query Plan Generator]
    Plan --> Gen[5. Gemini SQL Generator]
    Gen --> Val[6. 4-Layer SQL Safety Validator]
    Val --> Exec[7. Query Executor - Connected DB]
    Exec --> Chart[8. Chart Type Detector]
    Exec --> Insight[9. AI Insight Generator]
    Chart --> Out([Interactive Recharts & Table])
    Insight --> Out
```

---

## 💻 Getting Started

### Prerequisites
- Node.js v20 or higher
- Docker & Docker Compose
- Google Gemini and OpenAI API Keys

### 1. Repository Setup
Clone the repository and inspect the folder structure:
```bash
git clone https://github.com/Nikita-Gupta-19/QueryMind.git
cd QueryMind
```

### 2. Environment Variables Setup
Create a `.env` file inside `apps/api`:
```env
PORT=4000
DATABASE_URL="postgresql://querymind:querymind_password@localhost:5432/querymind_db?schema=public"
REDIS_URL="redis://localhost:6379"
JWT_SECRET="querymind_super_secret_jwt_sign_key_123"
JWT_REFRESH_SECRET="querymind_super_secret_jwt_refresh_sign_key_456"
ENCRYPTION_KEY="637573746f6d65727365676d656e74656e6372797074696f6e6b6579666f7261" # 32-byte hex
DEV_AUTH_BYPASS=true
GEMINI_API_KEY="your-gemini-api-key"
OPENAI_API_KEY="your-openai-api-key"
NODE_ENV=development
```

Create a `.env` file inside `apps/web`:
```env
NEXT_PUBLIC_API_URL="http://localhost:4000"
```

### 3. Spin Up Databases (Docker)
Start PostgreSQL (with pgvector preloaded) and Redis:
```bash
docker compose up -d
```

### 4. Setup Backend API (Prisma + Migrations)
Install packages, run DB migrations, and compile:
```bash
cd apps/api
npm install
npx prisma migrate dev
npm run build
```

### 5. Setup Next.js Frontend
```bash
cd ../web
npm install
npm run build
```

### 6. Running Locally
In separate terminals, run the development servers:

**Backend API (`http://localhost:4000`):**
```bash
cd apps/api
npm run dev
```

**Frontend App (`http://localhost:3000`):**
```bash
cd apps/web
npm run dev
```

---

## 🧪 Running Integration Tests
We maintain an automated unit/integration test suite validating the foundational cryptography, rate limiting, and SQL parser constraints:
```bash
cd apps/api
npx tsx src/test-setup.ts
```

---

## 📄 License
This project is licensed under the MIT License.
