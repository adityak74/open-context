# Stage 1: Build
FROM node:25-slim AS builder

WORKDIR /app

# Install CLI/MCP dependencies
COPY package.json package-lock.json* ./
RUN npm install

# Copy source and build TypeScript
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# Stage 2: Production
FROM node:25-slim

WORKDIR /app

# Install production dependencies only
COPY package.json package-lock.json* ./
RUN npm install --omit=dev

# Copy built output from builder
COPY --from=builder /app/dist ./dist

# Create the default context store directory
RUN mkdir -p /root/.opencontext

# Persistent volume for context data
VOLUME /root/.opencontext

# Allow overriding the store path via environment variable
ENV OPENCONTEXT_STORE_PATH=/root/.opencontext/contexts.json

# The MCP server uses stdio transport, so the container entrypoint
# is the MCP server process. Run with `docker run -i` to enable
# stdin/stdout communication.
ENTRYPOINT ["node", "dist/mcp/index.js"]
