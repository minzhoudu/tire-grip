# Single runtime image: keeps full node_modules (not just the trimmed
# .next/standalone copy) so Coolify's post-deployment command can run
# migrations/scripts (pnpm db:setup, pnpm admin:create) in the same container.
FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat
RUN corepack enable

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/drizzle.config.ts ./drizzle.config.ts
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/src ./src

USER nextjs
EXPOSE 3000
ENV PORT=3000
CMD ["pnpm", "start"]
