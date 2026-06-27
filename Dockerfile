# syntax=docker/dockerfile:1

FROM node:24-bookworm-slim
WORKDIR /app

ENV NODE_ENV=production \
    APP_HOST=0.0.0.0 \
    APP_PORT=4177

COPY package.json ./
COPY server ./server
COPY public ./public

EXPOSE 4177
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.APP_PORT || 4177) + '/healthz').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

USER node
ENTRYPOINT ["node", "server/index.js"]
