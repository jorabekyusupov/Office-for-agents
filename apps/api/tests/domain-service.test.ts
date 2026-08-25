import { describe, expect, it } from 'vitest';
import { mayTransitionTask } from '../src/domain-service.js';

describe('task transition policy', () => {
  it('accepts only canonical forward and retry transitions', () => {
    expect(mayTransitionTask('TODO', 'QUEUED')).toBe(true);
    expect(mayTransitionTask('IN_PROGRESS', 'COMPLETED')).toBe(true);
    expect(mayTransitionTask('FAILED', 'QUEUED')).toBe(true);
    expect(mayTransitionTask('COMPLETED', 'IN_PROGRESS')).toBe(false);
    expect(mayTransitionTask('TODO', 'COMPLETED')).toBe(false);
  });
});
