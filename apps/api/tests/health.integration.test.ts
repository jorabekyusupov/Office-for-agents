import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import { auth } from '../src/auth.js';
import { prisma } from '../src/db.js';

const app = await buildApp();

afterAll(async () => {
  await app.close();
});

afterEach(() => vi.restoreAllMocks());

describe('GET /health', () => {
  it('returns a versioned non-secret response', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: 'ok',
      version: '0.1.0',
      contractVersion: 1
    });
  });
});

describe('identity and workspace boundaries', () => {
  it('hands credential JSON to Better Auth before Fastify body parsing', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      payload: { email: `integration-${crypto.randomUUID()}@ai-office.local`, password: 'IntegrationPassword_2026!', name: 'Integration User' }
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().user.email).toMatch(/@ai-office\.local$/);
  });

  it('rejects unauthenticated account and workspace requests', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/me' })).statusCode).toBe(401);
    expect(
      (await app.inject({ method: 'GET', url: '/api/workspaces/other-team' })).statusCode
    ).toBe(401);
  });

  it('denies a signed-in user outside the requested workspace', async () => {
    vi.spyOn(auth.api, 'getSession').mockResolvedValue({ user: { id: 'user-a' } } as never);
    vi.spyOn(prisma.workspaceMember, 'findUnique').mockResolvedValue(null);

    const response = await app.inject({ method: 'GET', url: '/api/workspaces/team-b' });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: 'workspace_access_denied' });
  });

  it('allows only owner or admin to start an invitation', async () => {
    vi.spyOn(auth.api, 'getSession').mockResolvedValue({ user: { id: 'member-a' } } as never);
    vi.spyOn(prisma.workspaceMember, 'findUnique').mockResolvedValue({ role: 'MEMBER' } as never);

    const response = await app.inject({
      method: 'POST',
      url: '/api/workspaces/team-a/invitations'
    });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: 'workspace_admin_required' });
  });

  it('exposes provider capability and policy only to workspace operators', async () => {
    vi.spyOn(auth.api, 'getSession').mockResolvedValue({ user: { id: 'owner-a' } } as never);
    vi.spyOn(prisma.workspaceMember, 'findMany').mockResolvedValue([{ role: 'OWNER' }] as never);
    const response = await app.inject({ method: 'GET', url: '/api/providers/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json().providers).toHaveLength(4);
    expect(JSON.stringify(response.json())).not.toMatch(/api[_-]?key|secret/i);
  });
});
