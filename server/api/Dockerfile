# syntax=docker/dockerfile:1

# CipherScan Express API backend.
ARG NODE_IMAGE=node:22.14.0-bookworm-slim

FROM ${NODE_IMAGE} AS deps
WORKDIR /app
ENV NPM_CONFIG_PRODUCTION=true
# No lockfile is committed for this package; install the declared ranges.
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

FROM ${NODE_IMAGE} AS runner
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3001
ARG GIT_COMMIT=unknown
LABEL org.opencontainers.image.title="cipherscan-api" \
      org.opencontainers.image.source="https://github.com/dannywillems/cipherscan" \
      org.opencontainers.image.revision="${GIT_COMMIT}"

COPY --from=deps /app/node_modules ./node_modules
COPY . .

USER node
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
