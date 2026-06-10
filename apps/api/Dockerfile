FROM node:20-slim AS builder
WORKDIR /app

# Install OpenSSL for Prisma client generation
RUN apt-get update -y && apt-get install -y openssl

COPY package*.json ./
RUN npm ci
COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:20-slim
WORKDIR /app

# Install OpenSSL for Prisma engine execution
RUN apt-get update -y && apt-get install -y openssl

COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

RUN npx prisma generate

EXPOSE 4000
CMD ["npm", "run", "start"]
