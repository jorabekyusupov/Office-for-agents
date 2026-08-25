import type { FastifyRequest } from 'fastify';
import { fromNodeHeaders } from 'better-auth/node';
import { auth } from './auth.js';
import { prisma } from './db.js';
import { mayManageWorkspace, type WorkspaceRole } from './workspace-access.js';

export async function currentUserId(request: FastifyRequest): Promise<string | null> {
  const session = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
  return session?.user.id ?? null;
}

export async function isSuperAdmin(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { isSuperAdmin: true } });
  return user?.isSuperAdmin === true;
}

export async function workspaceRole(
  workspaceId: string,
  userId: string
): Promise<WorkspaceRole | null> {
  if (await isSuperAdmin(userId)) return 'OWNER';
  const member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    select: { role: true }
  });
  return member?.role ?? null;
}

export async function mayInviteToWorkspace(workspaceId: string, userId: string): Promise<boolean> {
  const role = await workspaceRole(workspaceId, userId);
  return role !== null && mayManageWorkspace(role);
}
