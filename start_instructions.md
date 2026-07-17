# QueryMind AI: Quick Start Guide

This file contains the detailed instructions and commands to spin up the QueryMind AI application next time.

---

## 🛠 Prerequisites

Before starting, ensure you have the following installed on your machine:
1. **Docker Desktop**
   - Required to run the PostgreSQL database (pre-configured with `pgvector`) and Redis.
   - Ensure Docker Desktop is active. You can launch it on macOS using:
     ```bash
     open -a Docker
     ```
2. **Node.js (version 20 or higher)**
   - We recommend using Node v20/v22 (LTS). If you have NVM installed, you can switch via:
     ```bash
     nvm use 22
     ```
     *(If not installed, run `nvm install 22` first).*

---

## 🔑 Environment Setup

Before starting the servers, ensure the following `.env` configuration files are populated.

### 1. Backend API Environment File
Create `apps/api/.env` and copy the following configuration (replace API keys with your actual values):
```env
PORT=4000
DATABASE_URL="postgresql://querymind:querymind_password@localhost:5432/querymind_db?schema=public"
REDIS_URL="redis://localhost:6380"
JWT_SECRET="querymind_super_secret_jwt_sign_key_123"
JWT_REFRESH_SECRET="querymind_super_secret_jwt_refresh_sign_key_456"
ENCRYPTION_KEY="637573746f6d65727365676d656e74656e6372797074696f6e6b6579666f7261" # 32-byte hex key
DEV_AUTH_BYPASS=true
GEMINI_API_KEY="your-gemini-api-key"
OPENAI_API_KEY="your-openai-api-key"
NODE_ENV=development
```

### 2. Frontend Web Environment File
Create `apps/web/.env` and specify the API URL:
```env
NEXT_PUBLIC_API_URL="http://localhost:4000"
```

---

## 🚀 How to Start the Project

You can run QueryMind in two modes: **Hybrid Dev Mode** (Recommended for local edits) or **Full Production Stack** (Single command via Docker).

### Option A: Hybrid Dev Mode (Recommended for development)

This starts the infrastructure (DB & Redis) in Docker, and runs your API, Worker, and Frontend locally on your machine.

#### Step 1: Start DB and Redis Containers
Boot PostgreSQL (with the `pgvector` extension) and Redis:
```bash
docker compose up -d db redis
```

#### Step 2: Push database schema and generate Prisma client
*(Only needed during first-time setup or after schema updates)*
```bash
cd apps/api
npx prisma db push
cd ../..
```

#### Step 3: Run the API Server
In a new terminal window:
```bash
cd apps/api
npm run dev
```
*(Runs on `http://localhost:4000`)*

#### Step 4: Run the Background Worker
In a new terminal window:
```bash
cd apps/api
npm run worker:dev
```
*(Handles async schema RAG embedding, database drift detection, and SQL background execution)*

#### Step 5: Run the Next.js Frontend
In a new terminal window:
```bash
cd apps/web
npm run dev
```
*(Runs on `http://localhost:3000`)*

---

### Option B: Full Production Stack (Docker Only)

This spins up all components (Database, Redis, API, Worker, and Next.js App) directly inside Docker containers in a single command. 

*Ensure your terminal has export variables or that you have specified `GEMINI_API_KEY` and `OPENAI_API_KEY` in your environment.*

```bash
docker compose up -d --build
```

To stop the entire stack:
```bash
docker compose down
```

---

## 🧪 Running Tests

To run the integration and validation test suites (foundational cryptography, rate limiting, and SQL parser constraints):
```bash
cd apps/api
npm run test
```
