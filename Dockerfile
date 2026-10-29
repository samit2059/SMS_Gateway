
# Stage 1: Build
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files first
COPY package*.json ./

# Prisma needs these files during npm ci's postinstall
COPY prisma.config.ts ./prisma.config.ts
COPY src/prisma/contract.prisma ./src/prisma/contract.prisma

# Build-time placeholder for Prisma configuration.
# The actual database URL is supplied by Docker Compose at runtime.
ARG DATABASE_URL=postgresql://postgres:helloworld@localhost:5432/sms_gateway_db?sslmode=disable

# Install dependencies and execute the contract-generation script
RUN npm ci

# Copy the remaining source files
COPY . .

# Compile TypeScript
RUN npm run build

# Verify the generated contract exists
RUN test -f dist/prisma/contract.json


# Stage 2: Production
FROM node:22-alpine AS production

WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./

# Install production dependencies without running postinstall again
RUN npm ci --omit=dev --ignore-scripts \
    && npm cache clean --force

# Copy compiled application and Prisma files
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/migrations ./migrations
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/src/prisma ./src/prisma

COPY docker-entrypoint.sh ./docker-entrypoint.sh

RUN chmod +x ./docker-entrypoint.sh \
    && chown -R node:node /app

USER node

EXPOSE 5000

ENTRYPOINT ["./docker-entrypoint.sh"]
