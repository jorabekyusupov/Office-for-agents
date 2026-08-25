CREATE TYPE "NotificationType" AS ENUM ('INPUT_REQUESTED', 'ARTIFACT_READY', 'APPROVAL_NEEDED');
CREATE TABLE "Notification" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspaceId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL REFERENCES "Project"("id") ON DELETE CASCADE,
  "evidenceId" TEXT NOT NULL,
  "type" "NotificationType" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "readAt" TIMESTAMP(3),
  UNIQUE("workspaceId", "type", "evidenceId")
);
CREATE INDEX "Notification_workspaceId_projectId_readAt_createdAt_idx" ON "Notification"("workspaceId", "projectId", "readAt", "createdAt");
