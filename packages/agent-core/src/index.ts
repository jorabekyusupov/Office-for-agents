import { z } from 'zod';

export type ProviderName = 'mock' | 'openai' | 'anthropic' | 'gemini';
export type RunEvent = { kind: 'milestone' | 'tool_request' | 'tool_result' | 'final' | 'usage' | 'error'; correlationId: string; summary: string; usage?: { inputTokens: number; outputTokens: number }; errorCategory?: 'timeout' | 'rate_limit' | 'tool_error' | 'invalid_arguments' | 'partial_stream' };
export type AgentProvider = { name: ProviderName; model: string; run(input: { prompt: string; correlationId: string }): AsyncIterable<RunEvent>; health(): { name: ProviderName; configured: boolean; model: string } };
export type ProviderPolicy = { timeoutMs: number; maxOutputTokens: number; maxCostUsd: number; maxConcurrentRuns: number };
const positiveInt = (value: string | undefined, fallback: number) => Math.max(1, Number.parseInt(value ?? `${fallback}`, 10) || fallback);
export function providerPolicy(name: ProviderName): ProviderPolicy { const prefix = name.toUpperCase(); return { timeoutMs: positiveInt(process.env[`${prefix}_TIMEOUT_MS`], 300_000), maxOutputTokens: positiveInt(process.env[`${prefix}_MAX_OUTPUT_TOKENS`], 8_000), maxCostUsd: Number(process.env[`${prefix}_MAX_COST_USD`] ?? '5') || 5, maxConcurrentRuns: positiveInt(process.env[`${prefix}_MAX_CONCURRENT_RUNS`], 10) }; }
const secretPattern = /(sk-[\w-]+|api[_-]?key[=:]\S+|token[=:]\S+|secret[=:]\S+)/gi;
export const redact = (value: string) => value.replace(secretPattern, '[redacted]');
export const toolInputSchema = z.object({ name: z.enum(['project.read', 'artifact.list']), arguments: z.record(z.string(), z.unknown()), workspaceId: z.string().uuid(), projectId: z.string().uuid(), correlationId: z.string().uuid() });
export function executeTool(input: unknown, allowed: boolean) { const parsed = toolInputSchema.safeParse(input); if (!parsed.success || !allowed) return { ok: false, summary: 'Tool request was rejected.' }; return { ok: true, summary: `Executed ${parsed.data.name}`, correlationId: parsed.data.correlationId }; }
export function fixtureProvider(name: ProviderName, model: string): AgentProvider {
  return { name, model, health: () => ({ name, model, configured: Boolean(process.env[`${name.toUpperCase()}_API_KEY`]) }), async *run(input) {
    const category = ['timeout', 'rate_limit', 'tool_error', 'invalid_arguments', 'partial_stream'].find(value => input.prompt.includes(`[${value}]`)) as RunEvent['errorCategory'];
    yield { kind: 'milestone', correlationId: input.correlationId, summary: 'Working' };
    if (category) { yield { kind: 'error', correlationId: input.correlationId, summary: 'The provider could not complete this run safely. Retry later or adjust the request.', errorCategory: category }; return; }
    yield { kind: 'tool_request', correlationId: input.correlationId, summary: 'Tool access checked' }; yield { kind: 'tool_result', correlationId: input.correlationId, summary: 'Tool completed' }; yield { kind: 'usage', correlationId: input.correlationId, summary: 'Usage recorded', usage: { inputTokens: 10, outputTokens: 5 } }; yield { kind: 'final', correlationId: input.correlationId, summary: redact(`Completed ${input.prompt}`) };
  } };
}
export const providers = [fixtureProvider('mock', 'mock-1'), fixtureProvider('openai', 'gpt-5'), fixtureProvider('anthropic', 'claude-sonnet'), fixtureProvider('gemini', 'gemini-2.5-pro')];
