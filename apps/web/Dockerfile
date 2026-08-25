FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/agent-core/package.json packages/agent-core/package.json
COPY packages/test-utils/package.json packages/test-utils/package.json
RUN pnpm install --frozen-lockfile
COPY apps/web apps/web
COPY packages packages
RUN pnpm --filter @ai-office/web build
CMD ["pnpm", "--filter", "@ai-office/web", "exec", "next", "start", "-p", "3000"]
