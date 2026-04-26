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

# Run migrations then start the server
CMD ["sh", "-c", "npx prisma db push && node src/index.js"]
