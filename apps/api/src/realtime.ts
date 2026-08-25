import type { FastifyInstance } from 'fastify';
import { Server } from 'socket.io';
import { OFFICE_EVENT_SCHEMA_VERSION, type OfficeEvent } from '@ai-office/contracts';
import { prisma } from './db.js';
import { workspaceRole } from './workspace-guard.js';
import { auth } from './auth.js';
import { fromNodeHeaders } from 'better-auth/node';

export const projectRoom = (workspaceId: string, projectId: string) =>
  `workspace:${workspaceId}:project:${projectId}`;

export async function projectSnapshot(workspaceId: string, projectId: string) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, workspaceId },
    include: {
      room: true,
      chats: { include: { messages: { orderBy: { createdAt: 'asc' }, take: 50 } }, take: 1 },
      tasks: { orderBy: { updatedAt: 'desc' } },
      runs: {
        include: {
          agent: { select: { id: true, name: true, provider: true } },
          task: {
            select: {
              title: true,
              events: {
                where: { type: 'codex.lifecycle' },
                orderBy: { occurredAt: 'desc' },
                take: 5,
                select: { type: true, occurredAt: true, payload: true }
              }
            }
          },
          inputRequests: { orderBy: { createdAt: 'desc' } }
        },
        orderBy: { updatedAt: 'desc' }
      },
      artifacts: {
        include: { reviews: { orderBy: { createdAt: 'desc' } } },
        orderBy: { updatedAt: 'desc' }
      },
      notifications: { where: { readAt: null }, orderBy: { createdAt: 'desc' }, take: 20 }
    }
  });
  if (!project) return null;
  return {
    project: {
      ...project,
      artifacts: project.artifacts.map(({ storageKey: _key, ...artifact }) => artifact)
    }
  };
}

export function attachRealtime(app: FastifyInstance) {
  const io = new Server(app.server, {
    cors: { origin: process.env.APP_ORIGIN ?? 'http://localhost:3000', credentials: true }
  });
  io.use(async (socket, next) => {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(socket.request.headers) });
    if (!session) return next(new Error('unauthorized'));
    socket.data.userId = session.user.id;
    next();
  });
  io.on('connection', (socket) => {
    socket.on(
      'project:subscribe',
      async (
        payload: { workspaceId?: string; projectId?: string; afterSequence?: number },
        ack?: (response: unknown) => void
      ) => {
        if (
          !payload.workspaceId ||
          !payload.projectId ||
          !(await workspaceRole(payload.workspaceId, socket.data.userId))
        )
          return ack?.({ error: 'forbidden' });
        const snapshot = await projectSnapshot(payload.workspaceId, payload.projectId);
        if (!snapshot) return ack?.({ error: 'not_found' });
        await socket.join(projectRoom(payload.workspaceId, payload.projectId));
        ack?.({ snapshot, schemaVersion: OFFICE_EVENT_SCHEMA_VERSION });
      }
    );
  });
  return io;
}

export function broadcastEvent(io: Server, event: OfficeEvent) {
  io.to(projectRoom(event.workspaceId, event.projectId)).emit('office:event', event);
}

export async function publishPendingOutbox(io: Server) {
  const pending = await prisma.outboxEvent.findMany({
    where: { publishedAt: null },
    orderBy: { occurredAt: 'asc' },
    take: 100
  });
  for (const item of pending) {
    const event = {
      id: item.id,
      workspaceId: item.workspaceId,
      projectId: item.projectId,
      sequence: Number((item.payload as { sequence?: number }).sequence ?? 0),
      type: item.topic,
      occurredAt: item.occurredAt.toISOString(),
      correlationId: item.id,
      schemaVersion: OFFICE_EVENT_SCHEMA_VERSION as 1,
      payload: item.payload as Record<string, unknown>
    };
    if (event.sequence < 1) continue;
    broadcastEvent(io, event);
    await prisma.outboxEvent.update({ where: { id: item.id }, data: { publishedAt: new Date() } });
  }
  return pending.length;
}
