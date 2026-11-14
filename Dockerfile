# Multi-stage, non-root Dockerfile for @hoanghainh/knot-sync (Node.js >= 22)
FROM node:22-alpine AS builder

WORKDIR /src
RUN corepack enable

# Copy workspace manifests first for layer caching
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json tsconfig.json README.md ./
COPY packages ./packages
COPY scripts ./scripts

RUN pnpm install --frozen-lockfile \
  && pnpm bundle:cli \
  && pnpm --filter=@hoanghainh/knot-sync --prod --legacy deploy /out \
  && mkdir -p /out/dist /out/static \
  && cp /src/packages/cli/dist/bin.js /out/dist/bin.js \
  && cp -r /src/packages/cli/static/. /out/static/ \
  && chmod +x /out/dist/bin.js

# ---- Runtime stage ----
FROM node:22-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production
ENV KNOT_SYNC_PORT=3940

# Copy self-contained bundled CLI with production dependencies and set non-root ownership
COPY --from=builder --chown=node:node /out /app
RUN mkdir -p /data /sources && chown -R node:node /app /data /sources \
  && ln -s /app/dist/bin.js /usr/local/bin/knot-sync

USER node

EXPOSE 3940

# Local HTTP readiness probe against /mcp using Node 22 built-in fetch (no curl or outbound net)
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.KNOT_SYNC_PORT || 3940) + '/mcp').then(r => process.exit(r.status < 500 ? 0 : 1)).catch(() => process.exit(1))"

ENTRYPOINT ["node", "/app/dist/bin.js"]
CMD ["serve", "--http", "--host", "0.0.0.0", "--port", "3940", "--sync-interval", "300", "-c", "/app/knot-sync.config.yaml"]
