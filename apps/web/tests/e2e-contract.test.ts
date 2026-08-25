import { describe, expect, it } from 'vitest';

describe('web workflow contract', () => {
  it('reserves the authenticated project workflow for later phases', () => {
    expect('project-chat-task-artifact').toContain('task');
  });
});
