# =============================================================================
#  SwiftRoute — production image
# -----------------------------------------------------------------------------
#  Multi-stage: the build stage compiles both workspaces, the runtime stage
#  carries only production dependencies and the emitted artefacts.
#
#  Build:  docker build -t swiftroute .
#  Run:    docker run -p 4000:4000 -e DATABASE_URL="file:/data/dev.db" -v swiftroute:/data swiftroute
# =============================================================================

# ---- stage 1: build --------------------------------------------------------
FROM node:20-alpine AS build

WORKDIR /app

# OpenSSL is required by Prisma's query engine on Alpine.
RUN apk add --no-cache openssl

# Copy manifests first so the dependency layer caches independently of source.
COPY package.json package-lock.json ./
COPY server/package.json ./server/
COPY web/package.json ./web/

RUN npm ci

COPY . .

# Generates the Prisma client, compiles the API, then builds the React bundle
# straight into server/public.
RUN npm run build

# Drop dev dependencies from the tree we are about to copy forward.
RUN npm prune --omit=dev


# ---- stage 2: runtime ------------------------------------------------------
FROM node:20-alpine AS runtime

WORKDIR /app

RUN apk add --no-cache openssl tini

ENV NODE_ENV=production
ENV PORT=4000

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/server/package.json ./server/package.json
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/server/public ./server/public
COPY --from=build /app/server/prisma ./server/prisma
COPY --from=build /app/server/scripts ./server/scripts

# Writable location for the SQLite file when no PostgreSQL URL is supplied.
RUN mkdir -p /data && chown -R node:node /data /app
VOLUME /data

USER node

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# tini reaps zombies and forwards SIGTERM, so the graceful shutdown in
# src/server.ts actually runs.
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server/dist/bootstrap.js"]
