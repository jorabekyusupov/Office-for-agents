import { describe, expect, it } from 'vitest';
import { reconcileEvent } from '../app/reconcile.js';

const event = (sequence: number, schemaVersion = 1) => ({ id: '00000000-0000-4000-8000-000000000001', workspaceId: '00000000-0000-4000-8000-000000000002', projectId: '00000000-0000-4000-8000-000000000003', sequence, type: 'task.updated', occurredAt: '2026-08-25T00:00:00.000Z', correlationId: '00000000-0000-4000-8000-000000000004', schemaVersion, payload: {} } as never);

describe('event reconciliation', () => {
  it('deduplicates events and recovers from a gap or schema mismatch', () => {
    expect(reconcileEvent(2, event(3))).toEqual({ kind: 'applied', nextSequence: 3 });
    expect(reconcileEvent(3, event(3))).toEqual({ kind: 'duplicate', nextSequence: 3 });
    expect(reconcileEvent(3, event(5))).toEqual({ kind: 'recover', nextSequence: 3 });
    expect(reconcileEvent(3, event(4, 2))).toEqual({ kind: 'recover', nextSequence: 3 });
  });
});
