# Production operations

Run API, worker, PostgreSQL, and Redis as separate services. Set `APP_ORIGIN`, `API_ORIGIN`, `DATABASE_URL`, `REDIS_URL`, `BETTER_AUTH_SECRET`, and provider credentials exclusively through deployment secrets.

- Health: `/health` is safe and unauthenticated; alert on non-200 responses.
- Readiness: require PostgreSQL and Redis connectivity before admitting traffic.
- Limits: cap active runs at 50 globally and configure provider timeout, rate and spend limits per provider.
- Privacy: log correlation IDs, event types, latency, and redacted error categories only. Never log prompts containing secrets, OAuth tokens, raw model reasoning, or permanent storage locations.
- Backup: take encrypted PostgreSQL backups, rehearse restoration, and retain artifact metadata separately from object payloads.
- Release: run `pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm db:migrate` before promotion; use a migration-compatible rollback plan.
