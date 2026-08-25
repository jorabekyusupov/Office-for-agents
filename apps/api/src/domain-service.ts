import type { Prisma, PrismaClient, TaskStatus } from '@prisma/client';

const allowedTaskTransitions: Record<TaskStatus, readonly TaskStatus[]> = {
  TODO: ['QUEUED', 'CANCELLED'], QUEUED: ['IN_PROGRESS', 'CANCELLED'], IN_PROGRESS: ['WAITING_INPUT', 'BLOCKED', 'COMPLETED', 'FAILED', 'CANCELLED'], WAITING_INPUT: ['IN_PROGRESS', 'CANCELLED'], BLOCKED: ['IN_PROGRESS', 'CANCELLED'], COMPLETED: [], FAILED: ['QUEUED'], CANCELLED: []
};

export function mayTransitionTask(from: TaskStatus, to: TaskStatus): boolean {
  return allowedTaskTransitions[from].includes(to);
}

export async function createTaskWithEvent(db: PrismaClient, input: { workspaceId: string; projectId: string; title: string; idempotencyKey: string }) {
  return db.$transaction(async (tx) => {
    const existing = await tx.task.findUnique({ where: { projectId_idempotencyKey: { projectId: input.projectId, idempotencyKey: input.idempotencyKey } } });
    if (existing) return existing;
    const task = await tx.task.create({ data: { ...input, status: 'QUEUED' } });
    const latest = await tx.taskEvent.aggregate({ where: { projectId: input.projectId }, _max: { sequence: true } });
    const sequence = (latest._max.sequence ?? 0) + 1;
    const payload: Prisma.InputJsonValue = { taskId: task.id, status: task.status };
    await tx.taskEvent.create({ data: { workspaceId: input.workspaceId, projectId: input.projectId, taskId: task.id, sequence, type: 'task.queued', payload } });
    await tx.outboxEvent.create({ data: { workspaceId: input.workspaceId, projectId: input.projectId, topic: 'task.queued', payload: { taskId: task.id, sequence } } });
    return task;
  });
}
