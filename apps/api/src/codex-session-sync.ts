import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { prisma } from './db.js';

type DesktopThread = {
  id: string;
  title: string;
  cwd: string;
  model: string | null;
  updatedAtMs: number;
};

const stateDatabase = join(homedir(), '.codex/state_5.sqlite');
const threadHistoryDatabase = join(homedir(), '.codex/thread_history_1.sqlite');
const targetFile = new URL('../.office-bridge-target.json', import.meta.url);
const lastSync = new Map<string, number>();

function configuredTarget() {
  try {
    return JSON.parse(readFileSync(targetFile, 'utf8')) as {
      workspaceId?: string;
      projectId?: string;
    };
  } catch {
    return null;
  }
}

function activeDesktopThreads(): DesktopThread[] {
  if (!existsSync(stateDatabase) || !existsSync(threadHistoryDatabase)) return [];
  const history = new DatabaseSync(threadHistoryDatabase, { readOnly: true });
  const activeThreadIds = (
    history
      .prepare(
        `SELECT DISTINCT thread_id AS id
           FROM thread_turns
          WHERE status = 'inProgress'
            AND completed_at IS NULL
            AND started_at >= ?
          ORDER BY started_at DESC
          LIMIT 50`
      )
      .all(Math.floor(Date.now() / 1_000) - 6 * 60 * 60) as unknown as { id: string }[]
  ).map((row) => row.id);
  history.close();
  if (!activeThreadIds.length) return [];

  const database = new DatabaseSync(stateDatabase, { readOnly: true });
  try {
    const placeholders = activeThreadIds.map(() => '?').join(',');
    return database
      .prepare(
        `SELECT id,
                COALESCE(NULLIF(name, ''), NULLIF(title, ''), 'Codex session') AS title,
                cwd,
                model,
                COALESCE(updated_at_ms, updated_at * 1000) AS updatedAtMs
           FROM threads
          WHERE archived = 0
            AND thread_source = 'user'
            AND preview <> ''
            AND id IN (${placeholders})
          ORDER BY COALESCE(updated_at_ms, updated_at * 1000) DESC
          LIMIT 50`
      )
      .all(...activeThreadIds) as unknown as DesktopThread[];
  } finally {
    database.close();
  }
}

export async function syncCodexDesktopSessions(input: {
  workspaceId: string;
  projectId: string;
  force?: boolean | undefined;
}) {
  const target = configuredTarget();
  if (target?.workspaceId !== input.workspaceId || target.projectId !== input.projectId) {
    return { synced: false, reason: 'project_not_mapped', active: 0 };
  }
  const syncKey = `${input.workspaceId}:${input.projectId}`;
  const previousSync = lastSync.get(syncKey) ?? 0;
  if (!input.force && Date.now() - previousSync < 5_000) {
    return { synced: false, reason: 'throttled', active: 0 };
  }
  lastSync.set(syncKey, Date.now());
  const threads = activeDesktopThreads();
  const activeIds = new Set(threads.map((thread) => `codex:${thread.id}`));

  await prisma.$transaction(async (tx) => {
    const agent = await tx.agent.upsert({
      where: {
        workspaceId_name: { workspaceId: input.workspaceId, name: 'Codex Desktop' }
      },
      create: { workspaceId: input.workspaceId, name: 'Codex Desktop', provider: 'OPENAI' },
      update: {}
    });
    let sequence =
      (
        await tx.taskEvent.aggregate({
          where: { projectId: input.projectId },
          _max: { sequence: true }
        })
      )._max.sequence ?? 0;

    for (const thread of threads) {
      const idempotencyKey = `codex:${thread.id}`;
      const task = await tx.task.upsert({
        where: { projectId_idempotencyKey: { projectId: input.projectId, idempotencyKey } },
        create: {
          workspaceId: input.workspaceId,
          projectId: input.projectId,
          title: thread.title.slice(0, 180),
          idempotencyKey,
          status: 'IN_PROGRESS'
        },
        update: { title: thread.title.slice(0, 180), status: 'IN_PROGRESS' }
      });
      const current = await tx.agentRun.findFirst({
        where: { taskId: task.id },
        orderBy: { attempt: 'desc' }
      });
      const statusChanged = current?.status !== 'WORKING';
      const run = current
        ? await tx.agentRun.update({ where: { id: current.id }, data: { status: 'WORKING' } })
        : await tx.agentRun.create({
            data: {
              workspaceId: input.workspaceId,
              projectId: input.projectId,
              taskId: task.id,
              agentId: agent.id,
              attempt: 1,
              status: 'WORKING'
            }
          });
      if (!current || statusChanged) {
        sequence += 1;
        const payload = {
          source: 'codex_desktop_index',
          sessionId: thread.id,
          cwd: thread.cwd,
          model: thread.model,
          runId: run.id,
          taskId: task.id,
          status: run.status,
          sequence
        };
        await tx.taskEvent.create({
          data: {
            workspaceId: input.workspaceId,
            projectId: input.projectId,
            taskId: task.id,
            sequence,
            type: 'codex.session.synced',
            payload
          }
        });
        await tx.outboxEvent.create({
          data: {
            workspaceId: input.workspaceId,
            projectId: input.projectId,
            topic: 'codex.session.synced',
            payload
          }
        });
      }
    }

    const staleTasks = await tx.task.findMany({
      where: {
        projectId: input.projectId,
        idempotencyKey: {
          startsWith: 'codex:',
          ...(activeIds.size ? { notIn: [...activeIds] } : {})
        }
      },
      select: { id: true, runs: { orderBy: { attempt: 'desc' }, take: 1 } }
    });
    for (const task of staleTasks) {
      const run = task.runs[0];
      if (!run || !['STARTING', 'WORKING'].includes(run.status)) continue;
      await tx.task.update({ where: { id: task.id }, data: { status: 'COMPLETED' } });
      await tx.agentRun.update({ where: { id: run.id }, data: { status: 'COMPLETED' } });
      sequence += 1;
      const payload = {
        source: 'codex_desktop_index',
        runId: run.id,
        taskId: task.id,
        status: 'COMPLETED',
        sequence
      };
      await tx.taskEvent.create({
        data: {
          workspaceId: input.workspaceId,
          projectId: input.projectId,
          taskId: task.id,
          sequence,
          type: 'codex.session.inactive',
          payload
        }
      });
      await tx.outboxEvent.create({
        data: {
          workspaceId: input.workspaceId,
          projectId: input.projectId,
          topic: 'codex.session.inactive',
          payload
        }
      });
    }
  });

  return { synced: true, active: threads.length };
}
