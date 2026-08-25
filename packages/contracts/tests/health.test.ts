import { describe, expect, it } from 'vitest';
import { healthResponseSchema } from '../src/index.js';

describe('health response contract', () => {
  it('rejects unexpected private fields', () => {
    expect(() =>
      healthResponseSchema.strict().parse({
        status: 'ok',
        version: '0.1.0',
        contractVersion: 1,
        secret: 'not-allowed'
      })
    ).toThrow();
  });
});
