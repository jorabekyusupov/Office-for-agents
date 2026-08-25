import { createHmac, timingSafeEqual } from 'node:crypto';
import { prisma } from './db.js';

type CodexHookEvent = {
  session_id?: unknown;
  turn_id?: unknown;
  cwd?: unknown;
  hook_event_name?: unknown;
  model?: unknown;
  tool_name?: unknown;
  thread_title?: unknown;
};

const terminalRuns = new Set(['COMPLETED', 'FAILED', 'CANCELLED']);
const assertString = (value: unknown, max: number) => typeof value === 'string' && value.length > 0 && value.length <= max ? value : null;

export function isValidCodexBridgeSignature(body: string, timestamp: string | undefined, signature: string | undefined) {
  if (!timestamp || !signature || !/^\d{13}$/.test(timestamp) || Math.abs(Date.now() - Number(timestamp)) > 5 * 60_000) return false;
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) return false;
  const expected = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
  return signature.length === expected.length && timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

export async function recordCodexHookEvent(input: { workspaceId: string; projectId: string; event: CodexHookEvent }) {
  const sessionId = assertString(input.event.session_id, 200);
  const eventName = assertString(input.event.hook_event_name, 80);
  const cwd = assertString(input.event.cwd, 1_000);
  const model = assertString(input.event.model, 120);
  const toolName = assertString(input.event.tool_name, 120);
  const threadTitle = assertString(input.event.thread_title, 180);
  const turnId = assertString(input.event.turn_id, 200) ?? 'session';
  if (!sessionId || !eventName || !cwd) return { ok: false as const, error: 'invalid_codex_hook_event' };

  const project = await prisma.project.findFirst({ where: { id: input.projectId, workspaceId: input.workspaceId }, select: { id: true } });
  if (!project) return { ok: false as const, error: 'project_not_found' };
  // A Codex session maps to one durable Office task. Hook turns are events on that task,
  // not separate desks in the room.
  const idempotencyKey = `codex:${sessionId}`;
  const terminal = eventName === 'Stop' || eventName === 'SessionEnd';
  const working = !terminal && ['OfficeSessionImport', 'SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'SubagentStart', 'SubagentStop'].includes(eventName);
  const folder = cwd.split('/').filter(Boolean).at(-1) ?? 'workspace';

  return prisma.$transaction(async (tx) => {
    const agent = await tx.agent.upsert({ where: { workspaceId_name: { workspaceId: input.workspaceId, name: 'Codex Desktop' } }, create: { workspaceId: input.workspaceId, name: 'Codex Desktop', provider: 'OPENAI' }, update: {} });
    const task = await tx.task.upsert({ where: { projectId_idempotencyKey: { projectId: input.projectId, idempotencyKey } }, create: { workspaceId: input.workspaceId, projectId: input.projectId, title: threadTitle ?? `Codex · ${folder} · ${sessionId.slice(-6)}`, idempotencyKey, status: terminal ? 'COMPLETED' : 'IN_PROGRESS' }, update: terminal ? { status: 'COMPLETED' } : { status: 'IN_PROGRESS' } });
    const current = await tx.agentRun.findFirst({ where: { taskId: task.id }, orderBy: { attempt: 'desc' } });
    const run = current ?? await tx.agentRun.create({ data: { workspaceId: input.workspaceId, projectId: input.projectId, taskId: task.id, agentId: agent.id, attempt: 1, status: terminal ? 'COMPLETED' : working ? 'WORKING' : 'STARTING' } });
    const nextStatus = terminal ? 'COMPLETED' : working ? 'WORKING' : 'STARTING';
    const updatedRun = terminalRuns.has(run.status) && !terminal ? run : await tx.agentRun.update({ where: { id: run.id }, data: { status: nextStatus } });
    const latest = await tx.taskEvent.aggregate({ where: { projectId: input.projectId }, _max: { sequence: true } });
    const sequence = (latest._max.sequence ?? 0) + 1;
    const payload = { source: 'codex_desktop', sessionId, turnId, eventName, toolName, cwd, model, threadTitle, runId: updatedRun.id, taskId: task.id, status: updatedRun.status, sequence };
    await tx.taskEvent.create({ data: { workspaceId: input.workspaceId, projectId: input.projectId, taskId: task.id, sequence, type: 'codex.lifecycle', payload } });
    await tx.outboxEvent.create({ data: { workspaceId: input.workspaceId, projectId: input.projectId, topic: 'codex.lifecycle', payload } });
    return { ok: true as const, taskId: task.id, runId: updatedRun.id, status: updatedRun.status, sequence };
  });
}
