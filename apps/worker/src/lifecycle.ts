import { PrismaClient, type RunStatus, type TaskStatus } from '@prisma/client';
import type { AgentRunJob } from './index.js';

const taskStatusForRun: Record<RunStatus, TaskStatus | undefined> = {
  QUEUED: 'QUEUED',
  STARTING: 'IN_PROGRESS',
  WORKING: 'IN_PROGRESS',
  WAITING_INPUT: 'WAITING_INPUT',
  BLOCKED: 'BLOCKED',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
};

export async function persistRunStatus(db: PrismaClient, job: AgentRunJob, status: RunStatus) {
  const taskStatus = taskStatusForRun[status];
  return db.$transaction(async (tx) => {
    const run = await tx.agentRun.update({ where: { id: job.runId }, data: { status } });
    if (taskStatus) await tx.task.update({ where: { id: job.taskId }, data: { status: taskStatus } });
    const latest = await tx.taskEvent.aggregate({ where: { projectId: job.projectId }, _max: { sequence: true } });
    const sequence = (latest._max.sequence ?? 0) + 1;
    const payload = { taskId: job.taskId, runId: job.runId, status, correlationId: job.correlationId, sequence };
    await tx.taskEvent.create({ data: { workspaceId: job.workspaceId, projectId: job.projectId, taskId: job.taskId, sequence, type: `run.${status.toLowerCase()}`, payload } });
    await tx.outboxEvent.create({ data: { workspaceId: job.workspaceId, projectId: job.projectId, topic: `run.${status.toLowerCase()}`, payload } });
    return run;
  });
}

export async function executeRunLifecycle(db: PrismaClient, job: AgentRunJob) {
  const existingRun = await db.agentRun.findUnique({ where: { id: job.runId }, select: { id: true } });
  if (!existingRun) return { ...job, confirmedAt: new Date().toISOString(), skipped: 'run_not_found' };
  const task = await db.task.findUnique({ where: { id: job.taskId }, select: { title: true } });
  for (const status of ['STARTING', 'WORKING'] as const) {
    const run = await db.agentRun.findUnique({ where: { id: job.runId }, select: { cancellationRequestedAt: true } });
    if (run?.cancellationRequestedAt) {
      await persistRunStatus(db, job, 'CANCELLED');
      await db.agentRun.update({ where: { id: job.runId }, data: { cancelledAt: new Date() } });
      return { ...job, confirmedAt: new Date().toISOString(), cancelled: true };
    }
    await persistRunStatus(db, job, status);
  }
  const hasResolvedInput = await db.inputRequest.findFirst({ where: { taskId: job.taskId, status: 'RESOLVED' }, select: { id: true } });
  if (/needs input/i.test(task?.title ?? '') && !hasResolvedInput) {
    await db.$transaction(async (tx) => {
      const input = await tx.inputRequest.create({ data: { workspaceId: job.workspaceId, projectId: job.projectId, taskId: job.taskId, runId: job.runId, question: 'Please provide the decision required to continue this agent run.' } });
      await tx.notification.upsert({ where: { workspaceId_type_evidenceId: { workspaceId: job.workspaceId, type: 'INPUT_REQUESTED', evidenceId: input.id } }, create: { workspaceId: job.workspaceId, projectId: job.projectId, type: 'INPUT_REQUESTED', evidenceId: input.id }, update: {} });
      const latest = await tx.taskEvent.aggregate({ where: { projectId: job.projectId }, _max: { sequence: true } });
      const sequence = (latest._max.sequence ?? 0) + 1;
      const payload = { taskId: job.taskId, runId: job.runId, inputRequestId: input.id, correlationId: job.correlationId, sequence };
      await tx.taskEvent.create({ data: { workspaceId: job.workspaceId, projectId: job.projectId, taskId: job.taskId, sequence, type: 'input.requested', payload } });
      await tx.outboxEvent.create({ data: { workspaceId: job.workspaceId, projectId: job.projectId, topic: 'input.requested', payload } });
    });
    await persistRunStatus(db, job, 'WAITING_INPUT');
    return { ...job, confirmedAt: new Date().toISOString(), waitingForInput: true };
  }
  if (/\bblock\b/i.test(task?.title ?? '')) { await persistRunStatus(db, job, 'BLOCKED'); return { ...job, confirmedAt: new Date().toISOString(), blocked: true }; }
  if (/\bfail\b/i.test(task?.title ?? '')) { await persistRunStatus(db, job, 'FAILED'); return { ...job, confirmedAt: new Date().toISOString(), failed: true }; }
  await persistRunStatus(db, job, 'COMPLETED');
  await db.$transaction(async (tx) => {
    const existing = await tx.artifact.findFirst({ where: { runId: job.runId } });
    if (existing) return;
    const artifact = await tx.artifact.create({ data: { workspaceId: job.workspaceId, projectId: job.projectId, taskId: job.taskId, runId: job.runId, title: 'Agent output', mimeType: 'text/plain', status: 'DRAFT', storageKey: `runs/${job.runId}/output.txt` } });
    await tx.notification.upsert({ where: { workspaceId_type_evidenceId: { workspaceId: job.workspaceId, type: 'APPROVAL_NEEDED', evidenceId: artifact.id } }, create: { workspaceId: job.workspaceId, projectId: job.projectId, type: 'APPROVAL_NEEDED', evidenceId: artifact.id }, update: {} });
    const latest = await tx.taskEvent.aggregate({ where: { projectId: job.projectId }, _max: { sequence: true } });
    const sequence = (latest._max.sequence ?? 0) + 1;
    const payload = { taskId: job.taskId, runId: job.runId, artifactId: artifact.id, correlationId: job.correlationId, sequence };
    await tx.taskEvent.create({ data: { workspaceId: job.workspaceId, projectId: job.projectId, taskId: job.taskId, sequence, type: 'artifact.draft', payload } });
    await tx.outboxEvent.create({ data: { workspaceId: job.workspaceId, projectId: job.projectId, topic: 'artifact.draft', payload } });
  });
  return { ...job, confirmedAt: new Date().toISOString() };
}
