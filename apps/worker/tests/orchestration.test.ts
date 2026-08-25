import { describe, expect, it } from 'vitest';
import { mockLifecycle, safeRunError } from '../src/index.js';

describe('mock orchestration', () => {
  it('uses canonical lifecycle terminals and redacts diagnostics', () => {
    expect(mockLifecycle('completed')).toEqual(['STARTING', 'WORKING', 'COMPLETED']);
    expect(mockLifecycle('waiting_input').at(-1)).toBe('WAITING_INPUT');
    expect(mockLifecycle('cancelled').at(-1)).toBe('CANCELLED');
    expect(safeRunError(new Error('api_key=private-value')).diagnostic).not.toContain('private-value');
  });
});
