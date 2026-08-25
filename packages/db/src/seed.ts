import { Client } from 'pg';

if (process.env.NODE_ENV === 'production') throw new Error('Seed data is disabled in production.');
const client = new Client({ connectionString: process.env.DATABASE_URL ?? 'postgresql://ai_office:ai_office@localhost:55432/ai_office' });
await client.connect();
const workspaceId = '00000000-0000-4000-8000-000000000001';
const projectId = '00000000-0000-4000-8000-000000000002';
const agentId = '00000000-0000-4000-8000-000000000003';
const userId = 'demo-internal-user';
await client.query('INSERT INTO "user" ("id", "name", "email", "emailVerified", "updatedAt") VALUES ($1, $2, $3, true, NOW()) ON CONFLICT ("id") DO NOTHING', [userId, 'Internal Demo', 'demo@ai-office.local']);
await client.query('INSERT INTO "Workspace" ("id", "name", "updatedAt") VALUES ($1, $2, NOW()) ON CONFLICT ("id") DO NOTHING', [workspaceId, 'AI Office Demo']);
await client.query('INSERT INTO "WorkspaceMember" ("workspaceId", "userId", "role") VALUES ($1, $2, $3) ON CONFLICT ("workspaceId", "userId") DO NOTHING', [workspaceId, userId, 'OWNER']);
await client.query('INSERT INTO "Project" ("id", "workspaceId", "name", "description", "updatedAt") VALUES ($1, $2, $3, $4, NOW()) ON CONFLICT ("id") DO NOTHING', [projectId, workspaceId, 'Office launch', 'Safe internal demo project']);
await client.query('INSERT INTO "Room" ("projectId", "updatedAt") VALUES ($1, NOW()) ON CONFLICT ("projectId") DO NOTHING', [projectId]);
await client.query('INSERT INTO "Agent" ("id", "workspaceId", "name", "provider", "updatedAt") VALUES ($1, $2, $3, $4, NOW()) ON CONFLICT ("id") DO NOTHING', [agentId, workspaceId, 'Codex Builder', 'MOCK']);
await client.end();
process.stdout.write('seeded demo workspace, project room, and mock agent\n');
