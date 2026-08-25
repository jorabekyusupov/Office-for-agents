-- This baseline is intentionally portable SQL so a new local PostgreSQL instance
-- can be initialized even when Prisma's native schema engine is unavailable.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TYPE "WorkspaceRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');

CREATE TABLE "user" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "emailVerified" BOOLEAN NOT NULL DEFAULT false,
  "image" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

CREATE TABLE "session" (
  "id" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "token" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "userId" TEXT NOT NULL,
  CONSTRAINT "session_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "session_token_key" ON "session"("token");
CREATE INDEX "session_userId_idx" ON "session"("userId");

CREATE TABLE "account" (
  "id" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "accessToken" TEXT,
  "refreshToken" TEXT,
  "idToken" TEXT,
  "accessTokenExpiresAt" TIMESTAMP(3),
  "refreshTokenExpiresAt" TIMESTAMP(3),
  "scope" TEXT,
  "password" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "account_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "account_providerId_accountId_key" ON "account"("providerId", "accountId");
CREATE INDEX "account_userId_idx" ON "account"("userId");

CREATE TABLE "verification" (
  "id" TEXT NOT NULL,
  "identifier" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "verification_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "verification_identifier_idx" ON "verification"("identifier");

CREATE TABLE "Workspace" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
  "name" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorkspaceMember" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
  "workspaceId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" "WorkspaceRole" NOT NULL DEFAULT 'MEMBER',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkspaceMember_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WorkspaceMember_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "WorkspaceMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "WorkspaceMember_workspaceId_userId_key" ON "WorkspaceMember"("workspaceId", "userId");
CREATE INDEX "WorkspaceMember_userId_idx" ON "WorkspaceMember"("userId");

CREATE TABLE "WorkspaceInvitation" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
  "workspaceId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "role" "WorkspaceRole" NOT NULL DEFAULT 'MEMBER',
  "token" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdById" TEXT NOT NULL,
  "acceptedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkspaceInvitation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WorkspaceInvitation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "WorkspaceInvitation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "WorkspaceInvitation_token_key" ON "WorkspaceInvitation"("token");
CREATE INDEX "WorkspaceInvitation_workspaceId_email_idx" ON "WorkspaceInvitation"("workspaceId", "email");
