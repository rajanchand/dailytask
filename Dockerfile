FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN printf '%s\n' \
      'minimumReleaseAge=0' \
      'dangerouslyAllowAllBuilds=true' \
    > .npmrc \
  && pnpm config set minimumReleaseAge 0 \
  && pnpm config set dangerouslyAllowAllBuilds true \
  && pnpm install --frozen-lockfile --config.minimumReleaseAge=0 --config.dangerouslyAllowAllBuilds=true

FROM node:22-bookworm-slim AS builder
WORKDIR /app
RUN corepack enable
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/.npmrc ./
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN printf '%s\n' \
      'minimumReleaseAge=0' \
      'dangerouslyAllowAllBuilds=true' \
    > .npmrc \
  && pnpm config set minimumReleaseAge 0 \
  && pnpm config set dangerouslyAllowAllBuilds true \
  && pnpm build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
RUN corepack enable \
  && mkdir -p /app/uploads
COPY --from=builder /app/package.json /app/pnpm-lock.yaml ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/src ./src
COPY --from=builder /app/workers ./workers
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/drizzle.config.ts ./
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/tsconfig.json ./
COPY --from=builder /app/next.config.ts ./
COPY --from=builder /app/.npmrc ./
COPY scripts/docker-entrypoint.sh /app/scripts/docker-entrypoint.sh
RUN chmod +x /app/scripts/docker-entrypoint.sh \
  && chmod +x /app/scripts/backup-postgres.sh /app/scripts/health-watch.sh /app/scripts/smoke-prod.sh 2>/dev/null || true \
  && printf '%s\n' 'minimumReleaseAge=0' 'dangerouslyAllowAllBuilds=true' > /app/.npmrc
EXPOSE 3000
ENTRYPOINT ["/app/scripts/docker-entrypoint.sh"]
CMD ["pnpm", "start"]
