export const workerService = 'ai-office-worker';
export const queueNames = ['orchestration', 'agent-run', 'artifact', 'realtime-outbox', 'maintenance'] as const;
export const MAX_ACTIVE_RUNS = 50;
export type AgentRunJob = { workspaceId: string; projectId: string; taskId: string; runId: string; correlationId: string; idempotencyKey: string; timeoutMs: number; cancellationKey: string };
export type MockRunOutcome = 'completed' | 'waiting_input' | 'cancelled' | 'failed';
export function mockLifecycle(outcome: MockRunOutcome): readonly string[] {
  const terminal = outcome === 'completed' ? 'COMPLETED' : outcome === 'waiting_input' ? 'WAITING_INPUT' : outcome === 'cancelled' ? 'CANCELLED' : 'FAILED';
  return ['STARTING', 'WORKING', terminal];
}
export function safeRunError(error: unknown) {
  const message = error instanceof Error ? error.message : 'unknown error';
  return { summary: 'The agent run could not complete. Retry or provide the requested input.', diagnostic: message.replace(/(api[_-]?key|token|secret)=?[^\s]+/gi, '$1=[redacted]') };
}
