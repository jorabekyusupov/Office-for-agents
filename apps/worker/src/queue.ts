import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { MAX_ACTIVE_RUNS, type AgentRunJob } from './index.js';
import { PrismaClient } from '@prisma/client';
import { executeRunLifecycle } from './lifecycle.js';

const connection = new Redis(process.env.REDIS_URL ?? 'redis://127.0.0.1:6379', { maxRetriesPerRequest: null });
const databaseUrl = process.env.DATABASE_URL ?? 'postgresql://ai_office:ai_office@localhost:55432/ai_office?schema=public';
const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
export const agentRunQueue = new Queue<AgentRunJob>('agent-run', { connection, defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 1_000 }, removeOnComplete: 1000, removeOnFail: 1000 } });
export const runWorker = new Worker<AgentRunJob>('agent-run', async (job) => executeRunLifecycle(prisma, job.data), { connection, concurrency: MAX_ACTIVE_RUNS });
export async function enqueueRun(job: AgentRunJob) {
  return agentRunQueue.add('execute', job, { jobId: job.idempotencyKey });
}
