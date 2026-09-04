import { expect, test } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';

const databaseUrl =
  process.env.DATABASE_URL ??
  'postgresql://ai_office:ai_office@localhost:55432/ai_office?schema=public';
const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

test.afterAll(async () => {
  await prisma.$disconnect();
});

for (const viewport of [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844 }
]) {
  test(`authorized ${viewport.name} user creates a project, sends a chat request, and opens an artifact`, async ({
    context,
    page
  }) => {
    const workspaceId = randomUUID();
    const email = `${randomUUID()}@ai-office.test`;
    const password = 'E2ePassword_2026!';
    const signUp = await fetch('http://127.0.0.1:3101/api/auth/sign-up/email', {
      method: 'POST',
      headers: { origin: 'http://127.0.0.1:3100', 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'E2E User', email, password })
    });
    const userId = ((await signUp.json()) as { user: { id: string } }).user.id;
    await prisma.user.update({ where: { id: userId }, data: { emailVerified: true } });
    const signIn = await fetch('http://127.0.0.1:3101/api/auth/sign-in/email', {
      method: 'POST',
      headers: { origin: 'http://127.0.0.1:3100', 'content-type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const setCookie = signIn.headers
      .getSetCookie()
      .find((value) => value.startsWith('better-auth.session_token='));
    const sessionToken = setCookie?.split(';', 1)[0]?.split('=', 2)[1];
    if (!sessionToken) throw new Error('E2E sign-in did not return a session cookie');
    await prisma.workspace.create({
      data: {
        id: workspaceId,
        name: `E2E ${viewport.name}`,
        members: { create: { userId, role: 'OWNER' } },
        agents: { create: { name: 'E2E Codex', provider: 'MOCK' } }
      }
    });
    try {
      await context.addCookies([
        { name: 'better-auth.session_token', value: sessionToken, url: 'http://127.0.0.1:3100' }
      ]);
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto('http://127.0.0.1:3100/office');
      await expect(page.getByRole('heading', { name: 'Team control center' })).toBeVisible();
      await page.getByLabel('New project').fill('Browser workflow');
      await page.getByRole('button', { name: 'Create project' }).click();
      await expect(page.getByText('Project created.')).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Browser workflow' })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'AI tool sozlamalari' })).toBeVisible();
      await expect(page.locator('.integration-card').filter({ hasText: 'Codex Desktop' })).toBeVisible();
      await page.getByLabel('Request').fill('Create a delivery artifact');
      await page.getByRole('button', { name: 'Send to agents' }).click();
      await expect(page.getByText('Request sent; an agent run is now queued.')).toBeVisible();
      await expect(
        page.locator('.task strong', { hasText: 'Create a delivery artifact' })
      ).toBeVisible({ timeout: 10_000 });
      await expect(page.getByText('Agent output', { exact: true })).toBeVisible({
        timeout: 10_000
      });
      await page.getByRole('link', { name: 'Open 3D room' }).click();
      const simulator = page.getByLabel('3D project office');
      await expect(simulator).toBeVisible();
      const simulatorBox = await simulator.boundingBox();
      expect(simulatorBox?.width).toBeGreaterThanOrEqual(viewport.width - 1);
      expect(simulatorBox?.height).toBeGreaterThanOrEqual(viewport.height - 1);
      for (let cycle = 0; cycle < 10; cycle += 1) {
        await page.reload();
        await expect(page.locator('canvas')).toHaveCount(1);
      }
      await page.goBack();
      await page.getByRole('button', { name: 'Approve' }).click();
      await expect(page.getByText('Artifact approved.')).toBeVisible();
      await expect(page.getByRole('listitem').filter({ hasText: 'approved' })).toBeVisible();
    } finally {
      await prisma.workspace.delete({ where: { id: workspaceId } }).catch(() => undefined);
      await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
    }
  });
}
