import { randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { fromNodeHeaders, toNodeHandler } from 'better-auth/node';
import { createProjectSchema, createTaskSchema, healthResponseSchema, type HealthResponse } from '@ai-office/contracts';
import { auth } from './auth.js';
import { prisma } from './db.js';
import { createTaskWithEvent } from './domain-service.js';
import { projectSnapshot } from './realtime.js';
import { RunQuotaError, scheduleAgentRun } from './run-scheduler.js';
import { currentUserId, isSuperAdmin, mayInviteToWorkspace, workspaceRole } from './workspace-guard.js';
import { incrementMetric, metricsSnapshot } from './metrics.js';
import { providers, providerPolicy } from '@ai-office/agent-core';
import { isValidCodexBridgeSignature, recordCodexHookEvent } from './codex-bridge.js';
import {
  connectCodexTarget,
  integrationStatuses,
  type IntegrationId
} from './integration-status.js';
import { syncCodexDesktopSessions } from './codex-session-sync.js';

export async function buildApp() {
  const app = Fastify({ logger: false });

  await app.register(cors, {
    origin: process.env.APP_ORIGIN ?? 'http://localhost:3000',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']
  });

  app.addHook('onRequest', async (request, reply) => {
    if (!request.url.startsWith('/api/auth/')) return;
    reply.hijack();
    await toNodeHandler(auth)(request.raw, reply.raw);
  });

  app.get('/health', async (): Promise<HealthResponse> => {
    return healthResponseSchema.parse({
      status: 'ok',
      version: process.env.APP_VERSION ?? '0.1.0',
      contractVersion: 1
    });
  });

  app.get('/health/ready', async (_request, reply) => {
    try { await prisma.$queryRaw`SELECT 1`; return { status: 'ready', dependencies: { database: 'ok', redis: process.env.REDIS_URL ? 'configured' : 'default' } }; }
    catch { return reply.status(503).send({ status: 'not_ready', dependencies: { database: 'unavailable' } }); }
  });

  app.get('/metrics', async () => ({ counters: metricsSnapshot(), limits: { maxActiveRuns: Number.parseInt(process.env.MAX_ACTIVE_RUNS ?? '50', 10), maxWorkspaceActiveRuns: Number.parseInt(process.env.MAX_WORKSPACE_ACTIVE_RUNS ?? '10', 10) } }));

  app.get('/api/providers/health', async (request, reply) => {
    const userId = await currentUserId(request);
    if (!userId) return reply.status(401).send({ error: 'unauthorized' });
    if (await isSuperAdmin(userId)) return { providers: providers.map(provider => ({ ...provider.health(), policy: providerPolicy(provider.name) })) };
    const memberships = await prisma.workspaceMember.findMany({ where: { userId }, select: { role: true } });
    if (!memberships.some(item => item.role === 'OWNER' || item.role === 'ADMIN')) return reply.status(403).send({ error: 'workspace_operator_required' });
    return { providers: providers.map(provider => ({ ...provider.health(), policy: providerPolicy(provider.name) })) };
  });

  app.get<{ Params: { workspaceId: string }; Querystring: { projectId?: string } }>(
    '/api/workspaces/:workspaceId/integrations',
    async (request, reply) => {
      const userId = await currentUserId(request);
      if (!userId) return reply.status(401).send({ error: 'unauthorized' });
      const role = await workspaceRole(request.params.workspaceId, userId);
      if (!role || role === 'MEMBER') {
        return reply.status(403).send({ error: 'workspace_operator_required' });
      }
      if (request.query.projectId) {
        const project = await prisma.project.findFirst({
          where: { id: request.query.projectId, workspaceId: request.params.workspaceId },
          select: { id: true }
        });
        if (!project) return reply.status(404).send({ error: 'project_not_found' });
      }
      const agents = await prisma.agent.findMany({
        where: { workspaceId: request.params.workspaceId },
        select: { provider: true }
      });
      const connected: IntegrationId[] = [
        ...(agents.some((agent) => agent.provider === 'ANTHROPIC') ? (['claude'] as const) : []),
        ...(agents.some((agent) => agent.provider === 'GOOGLE') ? (['gemini'] as const) : [])
      ];
      return {
        integrations: await integrationStatuses({
          workspaceId: request.params.workspaceId,
          projectId: request.query.projectId,
          connected
        })
      };
    }
  );

  app.post<{
    Params: { workspaceId: string; integrationId: IntegrationId };
    Body: { projectId?: unknown };
  }>('/api/workspaces/:workspaceId/integrations/:integrationId/connect', async (request, reply) => {
    const userId = await currentUserId(request);
    if (!userId) return reply.status(401).send({ error: 'unauthorized' });
    const role = await workspaceRole(request.params.workspaceId, userId);
    if (!role || role === 'MEMBER') {
      return reply.status(403).send({ error: 'workspace_operator_required' });
    }
    const projectId = typeof request.body?.projectId === 'string' ? request.body.projectId : '';
    const project = await prisma.project.findFirst({
      where: { id: projectId, workspaceId: request.params.workspaceId },
      select: { id: true }
    });
    if (!project) return reply.status(404).send({ error: 'project_not_found' });
    const available = await integrationStatuses({
      workspaceId: request.params.workspaceId,
      projectId
    });
    const integration = available.find((item) => item.id === request.params.integrationId);
    if (!integration) return reply.status(404).send({ error: 'integration_not_found' });
    if (!integration.canConnect) {
      return reply.status(409).send({ error: 'integration_not_configured', integration });
    }
    const agentConfig = {
      codex: { name: 'Codex Desktop', provider: 'OPENAI' as const },
      claude: { name: 'Claude', provider: 'ANTHROPIC' as const },
      gemini: { name: 'Gemini', provider: 'GOOGLE' as const }
    }[request.params.integrationId];
    await prisma.agent.upsert({
      where: {
        workspaceId_name: { workspaceId: request.params.workspaceId, name: agentConfig.name }
      },
      create: { workspaceId: request.params.workspaceId, ...agentConfig },
      update: { provider: agentConfig.provider }
    });
    if (request.params.integrationId === 'codex') {
      await connectCodexTarget({ workspaceId: request.params.workspaceId, projectId });
    }
    return reply.status(200).send({
      connected: true,
      integration: (
        await integrationStatuses({
          workspaceId: request.params.workspaceId,
          projectId,
          connected: [request.params.integrationId]
        })
      ).find((item) => item.id === request.params.integrationId)
    });
  });

  app.get('/api/me', async (request, reply) => {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
    if (!session) {
      return reply.status(401).send({ error: 'unauthorized' });
    }

    return { user: { id: session.user.id, email: session.user.email, name: session.user.name } };
  });

  app.post<{ Body: { workspaceId?: unknown; projectId?: unknown; event?: unknown } }>('/api/integrations/codex/events', async (request, reply) => {
    const rawBody = JSON.stringify(request.body ?? {});
    const timestamp = typeof request.headers['x-codex-office-timestamp'] === 'string' ? request.headers['x-codex-office-timestamp'] : undefined;
    const signature = typeof request.headers['x-codex-office-signature'] === 'string' ? request.headers['x-codex-office-signature'] : undefined;
    if (!isValidCodexBridgeSignature(rawBody, timestamp, signature)) return reply.status(401).send({ error: 'invalid_bridge_signature' });
    const workspaceId = typeof request.body?.workspaceId === 'string' ? request.body.workspaceId : '';
    const projectId = typeof request.body?.projectId === 'string' ? request.body.projectId : '';
    if (!workspaceId || !projectId || typeof request.body?.event !== 'object' || request.body.event === null) return reply.status(400).send({ error: 'validation_failed' });
    const result = await recordCodexHookEvent({ workspaceId, projectId, event: request.body.event as Record<string, unknown> });
    return result.ok ? reply.status(202).send(result) : reply.status(404).send(result);
  });

  app.get('/api/workspaces', async (request, reply) => {
    const userId = await currentUserId(request);
    if (!userId) return reply.status(401).send({ error: 'unauthorized' });
    if (await isSuperAdmin(userId)) {
      const workspaces = await prisma.workspace.findMany({
        select: { id: true, name: true, projects: { where: { status: 'ACTIVE' }, select: { id: true, name: true, _count: { select: { tasks: true } } }, orderBy: { updatedAt: 'desc' } } },
        orderBy: { updatedAt: 'desc' }
      });
      return workspaces.map(workspace => ({ role: 'OWNER' as const, workspace }));
    }
    return prisma.workspaceMember.findMany({ where: { userId }, select: { role: true, workspace: { select: { id: true, name: true, projects: { where: { status: 'ACTIVE' }, select: { id: true, name: true, _count: { select: { tasks: true } } }, orderBy: { updatedAt: 'desc' } } } } } });
  });

  app.get<{ Params: { workspaceId: string } }>(
    '/api/workspaces/:workspaceId',
    async (request, reply) => {
      const userId = await currentUserId(request);
      if (!userId) return reply.status(401).send({ error: 'unauthorized' });

      const role = await workspaceRole(request.params.workspaceId, userId);
      if (!role) return reply.status(403).send({ error: 'workspace_access_denied' });
      return { workspaceId: request.params.workspaceId, role };
    }
  );

  app.post<{ Params: { workspaceId: string }; Body: { email?: unknown; role?: unknown } }>(
    '/api/workspaces/:workspaceId/invitations',
    async (request, reply) => {
      const userId = await currentUserId(request);
      if (!userId) return reply.status(401).send({ error: 'unauthorized' });

      if (!(await mayInviteToWorkspace(request.params.workspaceId, userId))) {
        return reply.status(403).send({ error: 'workspace_admin_required' });
      }
      const email = typeof request.body?.email === 'string' ? request.body.email.trim().toLowerCase() : '';
      const role = request.body?.role === 'ADMIN' ? 'ADMIN' : 'MEMBER';
      if (!/^\S+@\S+\.\S+$/.test(email)) return reply.status(400).send({ error: 'validation_failed' });
      const expiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1_000);
      const existing = await prisma.workspaceInvitation.findFirst({ where: { workspaceId: request.params.workspaceId, email, acceptedAt: null } });
      const invitation = existing
        ? await prisma.workspaceInvitation.update({ where: { id: existing.id }, data: { role, createdById: userId, expiresAt: expiry, token: randomUUID() } })
        : await prisma.workspaceInvitation.create({ data: { workspaceId: request.params.workspaceId, email, role, token: randomUUID(), createdById: userId, expiresAt: expiry } });
      return reply.status(201).send({ invitation: { id: invitation.id, email: invitation.email, role: invitation.role, expiresAt: invitation.expiresAt, acceptPath: `/api/invitations/${invitation.token}/accept` } });
    }
  );

  app.post<{ Params: { token: string } }>('/api/invitations/:token/accept', async (request, reply) => {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
    if (!session) return reply.status(401).send({ error: 'unauthorized' });
    const invitation = await prisma.workspaceInvitation.findUnique({ where: { token: request.params.token } });
    if (!invitation || invitation.acceptedAt || invitation.expiresAt < new Date()) return reply.status(404).send({ error: 'invitation_not_available' });
    if (invitation.email !== session.user.email.toLowerCase()) return reply.status(403).send({ error: 'invitation_email_mismatch' });
    await prisma.$transaction([
      prisma.workspaceMember.upsert({ where: { workspaceId_userId: { workspaceId: invitation.workspaceId, userId: session.user.id } }, create: { workspaceId: invitation.workspaceId, userId: session.user.id, role: invitation.role }, update: { role: invitation.role } }),
      prisma.workspaceInvitation.update({ where: { id: invitation.id }, data: { acceptedAt: new Date() } })
    ]);
    return reply.status(200).send({ workspaceId: invitation.workspaceId, accepted: true, correlationId: randomUUID() });
  });

  app.get<{ Params: { workspaceId: string } }>('/api/workspaces/:workspaceId/projects', async (request, reply) => {
    const userId = await currentUserId(request);
    if (!userId) return reply.status(401).send({ error: 'unauthorized' });
    if (!(await workspaceRole(request.params.workspaceId, userId))) return reply.status(403).send({ error: 'workspace_access_denied' });
    return prisma.project.findMany({ where: { workspaceId: request.params.workspaceId }, include: { room: true, _count: { select: { tasks: { where: { status: { in: ['QUEUED', 'IN_PROGRESS', 'WAITING_INPUT', 'BLOCKED'] } } } } } }, orderBy: { updatedAt: 'desc' } });
  });

  app.get<{ Params: { workspaceId: string; projectId: string } }>('/api/workspaces/:workspaceId/projects/:projectId/snapshot', async (request, reply) => {
    const userId = await currentUserId(request);
    if (!userId) return reply.status(401).send({ error: 'unauthorized' });
    if (!(await workspaceRole(request.params.workspaceId, userId))) return reply.status(403).send({ error: 'workspace_access_denied' });
    await syncCodexDesktopSessions({
      workspaceId: request.params.workspaceId,
      projectId: request.params.projectId
    });
    const snapshot = await projectSnapshot(request.params.workspaceId, request.params.projectId);
    if (!snapshot) return reply.status(404).send({ error: 'project_not_found' });
    return { ...snapshot, schemaVersion: 1 };
  });

  app.post<{ Params: { workspaceId: string }; Body: unknown }>('/api/workspaces/:workspaceId/projects', async (request, reply) => {
    const userId = await currentUserId(request);
    if (!userId) return reply.status(401).send({ error: 'unauthorized' });
    if (!(await workspaceRole(request.params.workspaceId, userId))) return reply.status(403).send({ error: 'workspace_access_denied' });
    const parsed = createProjectSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: 'validation_failed', issues: parsed.error.flatten() });
    const project = await prisma.$transaction(async (tx) => {
      const created = await tx.project.create({ data: { workspaceId: request.params.workspaceId, name: parsed.data.name, description: parsed.data.description ?? null } });
      await tx.room.create({ data: { projectId: created.id } });
      return created;
    });
    return reply.status(201).send(project);
  });

  app.post<{ Params: { workspaceId: string; projectId: string }; Body: unknown }>('/api/workspaces/:workspaceId/projects/:projectId/tasks', async (request, reply) => {
    const userId = await currentUserId(request);
    if (!userId) return reply.status(401).send({ error: 'unauthorized' });
    if (!(await workspaceRole(request.params.workspaceId, userId))) return reply.status(403).send({ error: 'workspace_access_denied' });
    const parsed = createTaskSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: 'validation_failed', issues: parsed.error.flatten() });
    const project = await prisma.project.findFirst({ where: { id: request.params.projectId, workspaceId: request.params.workspaceId } });
    if (!project) return reply.status(404).send({ error: 'project_not_found' });
    const task = await createTaskWithEvent(prisma, { workspaceId: request.params.workspaceId, projectId: project.id, ...parsed.data });
    let run; let correlationId;
    try { ({ run, correlationId } = await scheduleAgentRun({ workspaceId: request.params.workspaceId, projectId: project.id, taskId: task.id, idempotencyKey: parsed.data.idempotencyKey })); }
    catch (error) { if (error instanceof RunQuotaError) return reply.status(429).send({ error: 'run_quota_reached', scope: error.scope }); throw error; }
    incrementMetric('agent_runs_queued_total');
    return reply.status(202).send({ task, run, correlationId });
  });

  app.post<{ Params: { workspaceId: string; projectId: string } }>('/api/workspaces/:workspaceId/projects/:projectId/archive', async (request, reply) => {
    const userId = await currentUserId(request);
    if (!userId) return reply.status(401).send({ error: 'unauthorized' });
    const role = await workspaceRole(request.params.workspaceId, userId);
    if (!role || role === 'MEMBER') return reply.status(403).send({ error: 'workspace_operator_required' });
    const project = await prisma.project.findFirst({ where: { id: request.params.projectId, workspaceId: request.params.workspaceId } });
    if (!project) return reply.status(404).send({ error: 'project_not_found' });
    return reply.status(200).send(await prisma.project.update({ where: { id: project.id }, data: { status: 'ARCHIVED' } }));
  });

  app.post<{ Params: { workspaceId: string; projectId: string }; Body: { content?: unknown; idempotencyKey?: unknown } }>('/api/workspaces/:workspaceId/projects/:projectId/chat', async (request, reply) => {
    const userId = await currentUserId(request);
    if (!userId) return reply.status(401).send({ error: 'unauthorized' });
    if (!(await workspaceRole(request.params.workspaceId, userId))) return reply.status(403).send({ error: 'workspace_access_denied' });
    const content = typeof request.body?.content === 'string' ? request.body.content.trim() : '';
    const idempotencyKey = typeof request.body?.idempotencyKey === 'string' ? request.body.idempotencyKey : '';
    if (!content || content.length > 2_000 || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idempotencyKey)) return reply.status(400).send({ error: 'validation_failed' });
    const project = await prisma.project.findFirst({ where: { id: request.params.projectId, workspaceId: request.params.workspaceId } });
    if (!project) return reply.status(404).send({ error: 'project_not_found' });
    const chat = await prisma.chat.findFirst({ where: { workspaceId: request.params.workspaceId, projectId: project.id } })
      ?? await prisma.chat.create({ data: { workspaceId: request.params.workspaceId, projectId: project.id } });
    const message = await prisma.message.create({ data: { chatId: chat.id, authorId: userId, content } });
    const task = await createTaskWithEvent(prisma, { workspaceId: request.params.workspaceId, projectId: project.id, title: content, idempotencyKey });
    let run; let correlationId;
    try { ({ run, correlationId } = await scheduleAgentRun({ workspaceId: request.params.workspaceId, projectId: project.id, taskId: task.id, idempotencyKey })); }
    catch (error) { if (error instanceof RunQuotaError) return reply.status(429).send({ error: 'run_quota_reached', scope: error.scope }); throw error; }
    incrementMetric('chat_requests_total'); incrementMetric('agent_runs_queued_total');
    return reply.status(202).send({ message, task, run, correlationId });
  });

  app.post<{ Params: { workspaceId: string; projectId: string; runId: string } }>('/api/workspaces/:workspaceId/projects/:projectId/runs/:runId/cancel', async (request, reply) => {
    const userId = await currentUserId(request);
    if (!userId) return reply.status(401).send({ error: 'unauthorized' });
    const role = await workspaceRole(request.params.workspaceId, userId);
    if (!role || role === 'MEMBER') return reply.status(403).send({ error: 'workspace_operator_required' });
    const run = await prisma.agentRun.findFirst({ where: { id: request.params.runId, workspaceId: request.params.workspaceId, projectId: request.params.projectId } });
    if (!run) return reply.status(404).send({ error: 'run_not_found' });
    if (['COMPLETED', 'FAILED', 'CANCELLED'].includes(run.status)) return reply.status(409).send({ error: 'run_already_terminal' });
    const pending = await prisma.agentRun.update({ where: { id: run.id }, data: { cancellationRequestedAt: new Date() } });
    incrementMetric('run_cancellations_requested_total');
    return { run: pending, cancellationRequested: true, confirmed: false };
  });

  app.post<{ Params: { workspaceId: string; projectId: string; runId: string } }>('/api/workspaces/:workspaceId/projects/:projectId/runs/:runId/retry', async (request, reply) => {
    const userId = await currentUserId(request);
    if (!userId) return reply.status(401).send({ error: 'unauthorized' });
    const role = await workspaceRole(request.params.workspaceId, userId);
    if (!role || role === 'MEMBER') return reply.status(403).send({ error: 'workspace_operator_required' });
    const previous = await prisma.agentRun.findFirst({ where: { id: request.params.runId, workspaceId: request.params.workspaceId, projectId: request.params.projectId }, include: { task: true } });
    if (!previous) return reply.status(404).send({ error: 'run_not_found' });
    if (!['FAILED', 'CANCELLED'].includes(previous.status)) return reply.status(409).send({ error: 'run_not_retryable' });
    await prisma.task.update({ where: { id: previous.taskId }, data: { status: 'QUEUED' } });
    const scheduled = await scheduleAgentRun({ workspaceId: request.params.workspaceId, projectId: request.params.projectId, taskId: previous.taskId, idempotencyKey: previous.task.idempotencyKey });
    return reply.status(202).send({ run: scheduled.run, correlationId: scheduled.correlationId });
  });

  app.post<{ Params: { workspaceId: string; projectId: string; requestId: string }; Body: { response?: unknown } }>('/api/workspaces/:workspaceId/projects/:projectId/input-requests/:requestId/respond', async (request, reply) => {
    const userId = await currentUserId(request);
    if (!userId) return reply.status(401).send({ error: 'unauthorized' });
    if (!(await workspaceRole(request.params.workspaceId, userId))) return reply.status(403).send({ error: 'workspace_access_denied' });
    const response = typeof request.body?.response === 'string' ? request.body.response.trim() : '';
    if (!response || response.length > 2_000) return reply.status(400).send({ error: 'validation_failed' });
    const input = await prisma.inputRequest.findFirst({ where: { id: request.params.requestId, workspaceId: request.params.workspaceId, projectId: request.params.projectId, status: 'OPEN' }, include: { task: true } });
    if (!input) return reply.status(404).send({ error: 'input_request_not_found' });
    await prisma.$transaction([
      prisma.inputRequest.update({ where: { id: input.id }, data: { status: 'RESOLVED', response, resolvedById: userId, resolvedAt: new Date() } }),
      prisma.agentRun.update({ where: { id: input.runId }, data: { status: 'WORKING' } }),
      prisma.task.update({ where: { id: input.taskId }, data: { status: 'QUEUED' } })
    ]);
    const scheduled = await scheduleAgentRun({ workspaceId: input.workspaceId, projectId: input.projectId, taskId: input.taskId, idempotencyKey: input.task.idempotencyKey });
    return reply.status(202).send({ resolved: true, run: scheduled.run, correlationId: scheduled.correlationId });
  });

  app.post<{ Params: { workspaceId: string; projectId: string; artifactId: string }; Body: { decision?: unknown; comment?: unknown } }>('/api/workspaces/:workspaceId/projects/:projectId/artifacts/:artifactId/reviews', async (request, reply) => {
    const userId = await currentUserId(request);
    if (!userId) return reply.status(401).send({ error: 'unauthorized' });
    const role = await workspaceRole(request.params.workspaceId, userId);
    if (!role || role === 'MEMBER') return reply.status(403).send({ error: 'workspace_reviewer_required' });
    const decision = request.body?.decision === 'APPROVED' ? 'APPROVED' : request.body?.decision === 'CHANGES_REQUESTED' ? 'CHANGES_REQUESTED' : null;
    const comment = typeof request.body?.comment === 'string' ? request.body.comment.trim().slice(0, 2_000) : null;
    if (!decision) return reply.status(400).send({ error: 'validation_failed' });
    const artifact = await prisma.artifact.findFirst({ where: { id: request.params.artifactId, workspaceId: request.params.workspaceId, projectId: request.params.projectId } });
    if (!artifact) return reply.status(404).send({ error: 'artifact_not_found' });
    const review = await prisma.$transaction(async (tx) => {
      const created = await tx.artifactReview.create({ data: { artifactId: artifact.id, runId: artifact.runId, actorId: userId, decision, comment } });
      await tx.artifact.update({ where: { id: artifact.id }, data: { status: decision === 'APPROVED' ? 'READY' : 'DRAFT' } });
      if (decision === 'APPROVED') await tx.notification.updateMany({ where: { workspaceId: artifact.workspaceId, evidenceId: artifact.id, type: 'APPROVAL_NEEDED', readAt: null }, data: { readAt: new Date() } });
      const latest = await tx.taskEvent.aggregate({ where: { projectId: artifact.projectId }, _max: { sequence: true } });
      const sequence = (latest._max.sequence ?? 0) + 1;
      const payload = { artifactId: artifact.id, taskId: artifact.taskId, runId: artifact.runId, decision, actorId: userId, sequence };
      await tx.taskEvent.create({ data: { workspaceId: artifact.workspaceId, projectId: artifact.projectId, taskId: artifact.taskId, sequence, type: 'artifact.reviewed', payload } });
      await tx.outboxEvent.create({ data: { workspaceId: artifact.workspaceId, projectId: artifact.projectId, topic: 'artifact.reviewed', payload } });
      return created;
    });
    incrementMetric('artifact_reviews_total');
    return reply.status(201).send({ review, artifactStatus: decision === 'APPROVED' ? 'READY' : 'DRAFT' });
  });

  app.post<{ Params: { workspaceId: string; projectId: string; artifactId: string } }>('/api/workspaces/:workspaceId/projects/:projectId/artifacts/:artifactId/revise', async (request, reply) => {
    const userId = await currentUserId(request);
    if (!userId) return reply.status(401).send({ error: 'unauthorized' });
    const role = await workspaceRole(request.params.workspaceId, userId);
    if (!role || role === 'MEMBER') return reply.status(403).send({ error: 'workspace_reviewer_required' });
    const artifact = await prisma.artifact.findFirst({ where: { id: request.params.artifactId, workspaceId: request.params.workspaceId, projectId: request.params.projectId } });
    if (!artifact) return reply.status(404).send({ error: 'artifact_not_found' });
    if (artifact.status === 'SUPERSEDED') return reply.status(409).send({ error: 'artifact_already_superseded' });
    const revision = await prisma.$transaction(async (tx) => {
      await tx.artifact.update({ where: { id: artifact.id }, data: { status: 'SUPERSEDED' } });
      const created = await tx.artifact.create({ data: { workspaceId: artifact.workspaceId, projectId: artifact.projectId, taskId: artifact.taskId, runId: artifact.runId, title: `${artifact.title} revision`, mimeType: artifact.mimeType, status: 'DRAFT', storageKey: `${artifact.storageKey}.revision` } });
      const latest = await tx.taskEvent.aggregate({ where: { projectId: artifact.projectId }, _max: { sequence: true } });
      const sequence = (latest._max.sequence ?? 0) + 1;
      const payload = { taskId: artifact.taskId, runId: artifact.runId, artifactId: created.id, supersedesArtifactId: artifact.id, actorId: userId, sequence };
      await tx.taskEvent.create({ data: { workspaceId: artifact.workspaceId, projectId: artifact.projectId, taskId: artifact.taskId, sequence, type: 'artifact.revised', payload } });
      await tx.outboxEvent.create({ data: { workspaceId: artifact.workspaceId, projectId: artifact.projectId, topic: 'artifact.revised', payload } });
      return created;
    });
    incrementMetric('artifact_revisions_total');
    return reply.status(201).send({ artifact: revision, supersededArtifactId: artifact.id });
  });

  app.get<{ Params: { workspaceId: string; projectId: string; artifactId: string } }>('/api/workspaces/:workspaceId/projects/:projectId/artifacts/:artifactId', async (request, reply) => {
    const userId = await currentUserId(request);
    if (!userId) return reply.status(401).send({ error: 'unauthorized' });
    if (!(await workspaceRole(request.params.workspaceId, userId))) return reply.status(403).send({ error: 'workspace_access_denied' });
    const artifact = await prisma.artifact.findFirst({
      where: { id: request.params.artifactId, projectId: request.params.projectId, workspaceId: request.params.workspaceId },
      select: { id: true, workspaceId: true, projectId: true, taskId: true, runId: true, title: true, mimeType: true, status: true, createdAt: true, updatedAt: true }
    });
    if (!artifact) return reply.status(404).send({ error: 'artifact_not_found' });
    return artifact;
  });

  return app;
}
