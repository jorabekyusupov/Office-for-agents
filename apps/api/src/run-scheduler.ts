import { randomUUID } from 'node:crypto';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { prisma } from './db.js';

let connection: Redis | null = null;
let runQueue: Queue | null = null;

function getRunQueue(): Queue {
  if (!runQueue) {
    connection = new Redis(process.env.REDIS_URL ?? 'redis://127.0.0.1:6379', {
      maxRetriesPerRequest: null,
      lazyConnect: true,
      enableOfflineQueue: false,
      retryStrategy: () => null
    });
    connection.on('error', () => {});
    runQueue = new Queue('agent-run', {
      connection,
      defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 1_000 } }
    });
  }
  return runQueue;
}

const activeStatuses = ['QUEUED', 'STARTING', 'WORKING', 'WAITING_INPUT', 'BLOCKED'] as const;
const configuredLimit = (name: string, fallback: number) => Math.max(1, Number.parseInt(process.env[name] ?? `${fallback}`, 10) || fallback);
export class RunQuotaError extends Error { constructor(public readonly scope: 'global' | 'workspace') { super(`${scope}_run_quota_reached`); } }

export async function scheduleAgentRun(input: { workspaceId: string; projectId: string; taskId: string; idempotencyKey: string }) {
  const [globalActive, workspaceActive] = await Promise.all([
    prisma.agentRun.count({ where: { status: { in: [...activeStatuses] } } }),
    prisma.agentRun.count({ where: { workspaceId: input.workspaceId, status: { in: [...activeStatuses] } } })
  ]);
  if (globalActive >= configuredLimit('MAX_ACTIVE_RUNS', 50)) throw new RunQuotaError('global');
  if (workspaceActive >= configuredLimit('MAX_WORKSPACE_ACTIVE_RUNS', 10)) throw new RunQuotaError('workspace');
  const agent = await prisma.agent.findFirst({ where: { workspaceId: input.workspaceId }, orderBy: { createdAt: 'asc' } });
  if (!agent) throw new Error('No workspace agent is configured');
  const previous = await prisma.agentRun.aggregate({ where: { taskId: input.taskId }, _max: { attempt: true } });
  const run = await prisma.agentRun.create({ data: { workspaceId: input.workspaceId, projectId: input.projectId, taskId: input.taskId, agentId: agent.id, attempt: (previous._max.attempt ?? 0) + 1, status: 'QUEUED' } });
  const correlationId = randomUUID();
  try {
    const queue = getRunQueue();
    await queue.add('execute', { workspaceId: input.workspaceId, projectId: input.projectId, taskId: input.taskId, runId: run.id, correlationId, idempotencyKey: input.idempotencyKey, timeoutMs: 300_000, cancellationKey: `cancel:${run.id}` }, { jobId: `${input.taskId}-${run.attempt}` });
  } catch (err) {
    console.warn('Queue scheduling skipped or failed:', err);
  }
  return { run, correlationId };
}
