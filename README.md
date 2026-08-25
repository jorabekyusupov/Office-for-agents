# AI Office Platform

Internal-team 3D office for observing and directing real AI-agent work. A project has one room; tasks, runs, events, and artifacts are the source of truth for the visual scene.

## Prerequisites

- Node.js 22+
- pnpm 11+
- Docker Desktop for PostgreSQL and Redis

## Local startup

1. Copy `.env.example` to `.env` and adjust only local values.
2. Run `docker compose up -d postgres redis`.
3. Run `pnpm install`.
4. Run `pnpm db:migrate` and `pnpm db:seed` when database packages are implemented.
5. Run `pnpm dev`.

The web app is served on `http://localhost:3000`; API health is available at `http://localhost:3001/health`.

## Engineering checks

Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` from the repository root.
