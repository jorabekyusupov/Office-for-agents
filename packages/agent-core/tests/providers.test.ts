import { describe, expect, it } from 'vitest';
import { executeTool, fixtureProvider, providerPolicy, providers, redact } from '../src/index.js';
const id = '00000000-0000-4000-8000-000000000001';
describe('provider contract fixtures', () => {
  it('normalizes every provider without live credentials', async () => { for (const provider of providers) { const events = []; for await (const event of provider.run({ prompt: 'safe task', correlationId: id })) events.push(event.kind); expect(events).toEqual(['milestone', 'tool_request', 'tool_result', 'usage', 'final']); } });
  it('redacts secrets and blocks unauthorized or malformed tools', () => { expect(redact('api_key=private')).not.toContain('private'); expect(executeTool({ name: 'project.read', arguments: {}, workspaceId: id, projectId: id, correlationId: id }, false).ok).toBe(false); expect(executeTool({}, true).ok).toBe(false); });
  it('reports normalized recoverable failures and configured limits without secrets', async () => { for (const category of ['timeout', 'rate_limit', 'tool_error', 'invalid_arguments', 'partial_stream']) { const events = []; for await (const event of fixtureProvider('mock', 'mock-1').run({ prompt: `[${category}] api_key=private`, correlationId: id })) events.push(event); expect(events.at(-1)).toMatchObject({ kind: 'error', errorCategory: category }); expect(events.at(-1)?.summary).not.toContain('private'); } expect(providerPolicy('mock').timeoutMs).toBeGreaterThan(0); });
});
