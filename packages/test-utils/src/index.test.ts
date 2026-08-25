import { describe, expect, it } from 'vitest';
import { createCorrelationId } from './index.js';

describe('test utilities', () => {
  it('creates a non-empty correlation ID', () => {
    expect(createCorrelationId()).toMatch(/^[0-9a-f-]{36}$/i);
  });
});
