FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/agent-core/package.json packages/agent-core/package.json
COPY packages/test-utils/package.json packages/test-utils/package.json
RUN pnpm install --frozen-lockfile
COPY apps/api apps/api
COPY packages packages
RUN pnpm --filter @ai-office/api build
CMD ["node", "apps/api/dist/src/server.js"]
