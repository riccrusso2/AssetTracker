# ── Stage 1: Build React frontend ─────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files first for better layer caching
COPY package.json ./
# Use legacy-peer-deps to handle React 19 peer dep warnings
RUN npm install --legacy-peer-deps

# Copy source files
COPY public/ ./public/
COPY src/ ./src/

# Build the React app
RUN npm run build

# ── Stage 2: Production server ─────────────────────────────────
FROM node:20-alpine AS production

WORKDIR /app

# Only install production server dependencies
COPY package.json ./
RUN npm install --omit=dev --legacy-peer-deps

# Copy built frontend from Stage 1
COPY --from=builder /app/build ./build

# Copy server
COPY server/ ./server/

# Create data directory for snapshots
RUN mkdir -p ./data

# Expose port
EXPOSE 10000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- http://localhost:10000/api/snapshots || exit 1

CMD ["node", "server/server.js"]