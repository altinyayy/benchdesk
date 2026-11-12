# --- Dependencies ------------------------------------------------------------
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# --- Build -------------------------------------------------------------------
FROM deps AS builder
ENV NEXT_TELEMETRY_DISABLED=1
COPY . .
RUN npm run build

# --- Runtime: the Next.js standalone server ----------------------------------
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
RUN addgroup -S nodejs && adduser -S nextjs -G nodejs
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]

# --- One-shot migration runner (docker compose service "migrate") ------------
FROM deps AS migrator
COPY drizzle ./drizzle
COPY scripts ./scripts
CMD ["node", "scripts/migrate.mjs"]
