import { describe, expect, it } from 'vitest';
import { coalesceNotifications, safeArtifactAccess } from '../src/delivery.js';
describe('delivery controls', () => { it('coalesces duplicate attention and guards artifacts', () => { const item = { id: '1', workspaceId: 'w', projectId: 'p', evidenceId: 'a', type: 'artifact_ready' as const, createdAt: '2026-08-25T00:00:00Z' }; expect(coalesceNotifications([item, { ...item, id: '2' }])).toHaveLength(1); expect(safeArtifactAccess(false, 'a')).toEqual({ ok: false, error: 'artifact_access_denied' }); }); });
