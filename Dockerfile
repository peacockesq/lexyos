FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=5174 \
    LEXYOS_STORAGE_PROVIDER=local \
    LEXYOS_DATA_PATH=/app/data/lexyos.json

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

COPY src ./src
COPY public ./public
COPY data/seed.json ./data/seed.json
COPY config ./config
COPY scripts/reset-data.mjs ./scripts/reset-data.mjs
COPY scripts/http-smoke.mjs ./scripts/http-smoke.mjs
COPY README.md implementation-notes.md ./

RUN mkdir -p /app/data && node scripts/reset-data.mjs

EXPOSE 5174
VOLUME ["/app/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 5174) + '/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "src/server.mjs"]
