import { describe, expect, it } from 'vitest';
import {
  hasRequiredRole,
  mayAccessWorkspace,
  mayManageWorkspace
} from '../src/workspace-access.js';

describe('workspace authorization', () => {
  it('does not grant access when membership is absent', () => {
    expect(mayAccessWorkspace(null)).toBe(false);
  });

  it('reserves invitations for owner and admin roles', () => {
    expect(mayManageWorkspace('OWNER')).toBe(true);
    expect(mayManageWorkspace('ADMIN')).toBe(true);
    expect(mayManageWorkspace('MEMBER')).toBe(false);
  });

  it('orders roles without allowing a member to administer a workspace', () => {
    expect(hasRequiredRole('OWNER', 'MEMBER')).toBe(true);
    expect(hasRequiredRole('MEMBER', 'ADMIN')).toBe(false);
  });
});
