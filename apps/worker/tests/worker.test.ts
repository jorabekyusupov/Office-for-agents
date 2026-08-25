import { describe, expect, it } from 'vitest';
import { workerService } from '../src/index.js';

describe('worker foundation', () => {
  it('exports a stable service identity', () => {
    expect(workerService).toBe('ai-office-worker');
  });
});
