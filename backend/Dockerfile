# syntax=docker/dockerfile:1
#
# ListenUp backend: one image, two roles.
#   API     node dist/server.js   (default command; on Vercel it's built from Dockerfile.vercel)
#   Worker  node dist/worker.js   (background jobs; run exactly one always-on copy)
# Keep the build stages in sync with Dockerfile.vercel.

FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@12.8.1 --activate
WORKDIR /app

# Production dependencies only
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# The generated client only loads the PostgreSQL query compiler ("fast" build);
# drop the other databases' compilers and source maps (~55 MB)
RUN pnpm install --frozen-lockfile --prod \
 && cd node_modules/@prisma/client/runtime \
 && rm -f *sqlserver* *cockroachdb* *mysql* *sqlite* query_compiler_small_bg.* *.map

# Compile TypeScript and generate the Prisma client
FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY prisma.config.ts tsconfig.json ./
COPY prisma ./prisma
COPY src ./src
# prisma.config.ts needs a DATABASE_URL, but generating the client never connects
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build pnpm run build

FROM node:22-alpine AS runtime
# Package managers aren't needed to run the app
RUN rm -rf /usr/local/lib/node_modules /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /usr/local/bin/yarn /usr/local/bin/yarnpkg /opt/yarn*
ENV NODE_ENV=production \
    PORT=8000
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
USER node
EXPOSE 8000
CMD ["node", "dist/server.js"]
