# syntax=docker/dockerfile:1

FROM node:22-slim AS base
ENV PNPM_HOME=/usr/local/bin
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# ---- deps ----
FROM base AS deps
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

# ---- build ----
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
ENV BUILD_STANDALONE=1
# DATABASE_URL is only needed at runtime; a dummy keeps `prisma generate` happy.
ENV DATABASE_URL="postgresql://user:pass@localhost:5432/db"
ENV AUTH_SECRET="build-time-placeholder"
RUN npx prisma generate && npm run build

# ---- runner ----
FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN groupadd --system --gid 1001 nodejs && useradd --system --uid 1001 --gid nodejs nextjs

COPY --from=build /app/public ./public
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
# Prisma engine + schema + migrations for `migrate deploy` on boot.
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=build /app/node_modules/prisma ./node_modules/prisma
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/package.json ./package.json

USER nextjs
EXPOSE 3000
ENV PORT=3000 HOSTNAME=0.0.0.0

# Apply migrations, then start the standalone server.
CMD ["sh", "-c", "npx prisma migrate deploy && node server.js"]
