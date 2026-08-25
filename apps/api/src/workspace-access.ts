export const workspaceRoles = ['OWNER', 'ADMIN', 'MEMBER'] as const;
export type WorkspaceRole = (typeof workspaceRoles)[number];

const roleRank: Record<WorkspaceRole, number> = { OWNER: 3, ADMIN: 2, MEMBER: 1 };

export function mayManageWorkspace(role: WorkspaceRole): boolean {
  return roleRank[role] >= roleRank.ADMIN;
}

export function mayAccessWorkspace(role: WorkspaceRole | null): role is WorkspaceRole {
  return role !== null;
}

export function hasRequiredRole(role: WorkspaceRole | null, minimum: WorkspaceRole): boolean {
  return role !== null && roleRank[role] >= roleRank[minimum];
}
