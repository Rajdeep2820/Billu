# ── Stage 1: Dependencies ──────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

# ── Stage 2: Production ────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

# Install openssl for Prisma
RUN apk add --no-cache openssl

# Copy deps and source
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma client
RUN npx prisma generate

EXPOSE 4000

# Required env vars at runtime:
#   DATABASE_URL  — Supabase pooler URL (port 6543, for app queries)
#   DIRECT_URL    — Supabase direct URL (port 5432, for migrations)
#
# Run migrations then start the server
CMD ["sh", "-c", "npx prisma migrate deploy && node src/index.js"]
